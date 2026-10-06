-- Manual only. Preserve all previous migrations.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Checkout migration requires an administrative BYPASSRLS role';
  END IF;
END $$;
CREATE TABLE public.checkout_settings (
  store_id uuid PRIMARY KEY REFERENCES public.stores(store_id),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  next_order_number bigint NOT NULL DEFAULT 1001 CHECK (next_order_number >= 1001),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.checkout_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  ip_hash text NOT NULL CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  purpose text NOT NULL CHECK (purpose IN ('checkout','track')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checkout_attempts_lookup ON public.checkout_attempts(store_id,ip_hash,purpose,created_at);
ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK
  (status IN ('pending_payment','confirmed','confirmed_cod','paid','processing','shipped','delivered','cancelled','refunded'));
ALTER TABLE public.orders ADD COLUMN idempotency_key uuid;
ALTER TABLE public.orders ADD COLUMN payment_method text CHECK (payment_method IN ('cod','online'));
ALTER TABLE public.orders ADD COLUMN request_hash text CHECK (request_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE public.orders ADD COLUMN confirmation_hash text CHECK (confirmation_hash ~ '^[0-9a-f]{64}$');
CREATE UNIQUE INDEX orders_checkout_idempotency ON public.orders(store_id,idempotency_key);
CREATE UNIQUE INDEX orders_confirmation_lookup ON public.orders(store_id,confirmation_hash);
ALTER TABLE public.order_items ADD COLUMN taxable_paise bigint NOT NULL DEFAULT 0 CHECK (taxable_paise >= 0);
ALTER TABLE public.order_items ADD COLUMN cgst_paise bigint NOT NULL DEFAULT 0 CHECK (cgst_paise >= 0);
ALTER TABLE public.order_items ADD COLUMN sgst_paise bigint NOT NULL DEFAULT 0 CHECK (sgst_paise >= 0);
ALTER TABLE public.order_items ADD COLUMN igst_paise bigint NOT NULL DEFAULT 0 CHECK (igst_paise >= 0);
DO $$
DECLARE t text; r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['checkout_settings','checkout_attempts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',t);
    EXECUTE format('CREATE POLICY tenant_isolation ON public.%I FOR ALL TO lebrands_app
      USING (store_id = NULLIF(current_setting(''app.store_id'',true),'''')::uuid)
      WITH CHECK (store_id = NULLIF(current_setting(''app.store_id'',true),'''')::uuid)',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO lebrands_app',t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',t);
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',t,r);
      END IF;
    END LOOP;
  END LOOP;
END $$;
