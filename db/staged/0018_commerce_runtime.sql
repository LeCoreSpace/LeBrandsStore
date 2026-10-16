CREATE TABLE public.payment_attempts (
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  order_id uuid NOT NULL,
  provider_order_id text UNIQUE,
  credentials_ciphertext text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','captured','expired','refund_pending','refunded')),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '20 minutes',
  next_check_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
  captured_payment_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(store_id,order_id),
  FOREIGN KEY(store_id,order_id) REFERENCES public.orders(store_id,id)
);
CREATE TABLE public.commerce_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  order_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('ship','refund','cancel-shipment')),
  status text NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','running','attention','done')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id,order_id,kind),
  FOREIGN KEY(store_id,order_id) REFERENCES public.orders(store_id,id)
);
CREATE INDEX commerce_jobs_due ON public.commerce_jobs(next_attempt_at) WHERE status IN ('waiting','running');
CREATE INDEX payment_attempts_due ON public.payment_attempts(next_check_at) WHERE state IN ('pending','expired','refund_pending');
DO $$
DECLARE t text; r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payment_attempts','commerce_jobs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.%I TO lebrands_app',t);
    EXECUTE format('CREATE POLICY tenant_isolation ON public.%I FOR ALL TO lebrands_app USING
      (store_id=NULLIF(current_setting(''app.store_id'',true),'''')::uuid)
      WITH CHECK(store_id=NULLIF(current_setting(''app.store_id'',true),'''')::uuid)',t);
    FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
      EXECUTE format('REVOKE ALL ON public.%I FROM %I',t,r);
    END LOOP;
  END LOOP;
END $$;
-- Persistent outbox: queue availability never determines whether a committed
-- paid/COD order gets a fulfilment job. Tokens/passwords are encrypted snapshots.
CREATE FUNCTION public.commerce_order_outbox() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,public AS $$
DECLARE i public.integrations%ROWTYPE;
BEGIN
  IF NEW.status IN ('confirmed_cod','paid') AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT * INTO i FROM public.integrations WHERE store_id=NEW.store_id AND provider='shiprocket' AND status='connected';
    IF i.metadata->>'enabled'='true' AND i.metadata->>'credentials_verified'='true' AND i.metadata ? 'shipping' THEN
      INSERT INTO public.commerce_jobs(store_id,order_id,kind,payload) VALUES
        (NEW.store_id,NEW.id,'ship',jsonb_build_object('credentials_ciphertext',i.credentials_ciphertext,'shipping',i.metadata->'shipping'))
      ON CONFLICT(store_id,order_id,kind) DO NOTHING;
    END IF;
  END IF;
  IF TG_OP='UPDATE' AND NEW.status IN ('cancelled','returned','rto') AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF EXISTS(SELECT 1 FROM public.payment_attempts WHERE store_id=NEW.store_id AND order_id=NEW.id AND captured_payment_id IS NOT NULL) THEN
      INSERT INTO public.commerce_jobs(store_id,order_id,kind) VALUES(NEW.store_id,NEW.id,'refund') ON CONFLICT DO NOTHING;
    END IF;
    IF EXISTS(SELECT 1 FROM public.commerce_jobs WHERE store_id=NEW.store_id AND order_id=NEW.id AND kind='ship') THEN
      INSERT INTO public.commerce_jobs(store_id,order_id,kind) VALUES(NEW.store_id,NEW.id,'cancel-shipment') ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.commerce_order_outbox() FROM PUBLIC;
CREATE TRIGGER commerce_order_outbox AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.commerce_order_outbox();
-- Background discovery returns IDs only. Work itself always re-enters an
-- explicit tenant transaction; no credentials/PII bypass RLS.
CREATE FUNCTION public.commerce_due_stores(p_limit integer DEFAULT 10) RETURNS TABLE(store_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT x.store_id FROM (
    SELECT j.store_id,min(j.next_attempt_at) AS due FROM public.commerce_jobs j
      WHERE (j.status='waiting' OR (j.status='running' AND j.lease_until<now())) AND j.next_attempt_at<=now() GROUP BY j.store_id
    UNION ALL SELECT p.store_id,min(p.next_check_at) FROM public.payment_attempts p
      WHERE p.state IN ('pending','expired','refund_pending') AND p.next_check_at<=now() GROUP BY p.store_id
  ) x GROUP BY x.store_id ORDER BY min(x.due) LIMIT greatest(1,least(p_limit,20))
$$;
ALTER FUNCTION public.commerce_due_stores(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.commerce_due_stores(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commerce_due_stores(integer) TO lebrands_app;
