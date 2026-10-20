-- Additive, manual migration. Does not change financial functions or their grants.
CREATE TABLE public.store_marketing_integrations (
  store_id uuid PRIMARY KEY REFERENCES public.stores(store_id) ON DELETE CASCADE,
  meta_enabled boolean NOT NULL DEFAULT false, meta_pixel_id text NOT NULL DEFAULT '',
  meta_capi_token_encrypted text, meta_token_hint text NOT NULL DEFAULT '',
  meta_test_event_code text NOT NULL DEFAULT '', meta_domain_verification text NOT NULL DEFAULT '',
  google_enabled boolean NOT NULL DEFAULT false, ga4_measurement_id text NOT NULL DEFAULT '',
  google_ads_id text NOT NULL DEFAULT '', google_label_purchase text NOT NULL DEFAULT '',
  google_label_add_to_cart text NOT NULL DEFAULT '', google_label_begin_checkout text NOT NULL DEFAULT '',
  google_enhanced_conversions boolean NOT NULL DEFAULT false, google_site_verification text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(NOT meta_enabled OR meta_pixel_id ~ '^[0-9]{15,16}$'),
  CHECK(NOT google_enabled OR ga4_measurement_id ~ '^G-[A-Z0-9]{4,20}$'),
  CHECK(NOT google_enhanced_conversions OR (google_ads_id ~ '^AW-[0-9]{6,20}$' AND google_label_purchase <> ''))
);
CREATE TABLE public.store_marketing_consents (
  store_id uuid NOT NULL REFERENCES public.stores(store_id) ON DELETE CASCADE,
  visitor_id uuid NOT NULL, revision text NOT NULL,
  analytics boolean NOT NULL DEFAULT false, ads boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(store_id,visitor_id)
);
ALTER TABLE public.orders
  ADD COLUMN tracking_event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN tracking_consent_id uuid,
  ADD COLUMN tracking_revision text,
  ADD COLUMN tracking_confirmed_at timestamptz,
  ADD COLUMN tracking_user_data jsonb,
  ADD COLUMN tracking_source_url text,
  ADD COLUMN fbp text, ADD COLUMN fbc text, ADD COLUMN client_ip text, ADD COLUMN user_agent text,
  ADD COLUMN browser_purchase_fired_at timestamptz, ADD COLUMN meta_capi_sent_at timestamptz;
CREATE TABLE public.store_marketing_jobs (
  store_id uuid NOT NULL REFERENCES public.stores(store_id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','cancelled','failed')),
  attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz, lease_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(store_id,order_id)
);
CREATE INDEX store_marketing_work ON public.store_marketing_jobs(status,next_attempt_at);
CREATE INDEX order_marketing_retention ON public.orders(store_id,tracking_confirmed_at)
  WHERE tracking_user_data IS NOT NULL OR client_ip IS NOT NULL;
-- Keep identifiers stable even if a catalogue/SKU FK is later cleared.
ALTER TABLE public.checkout_attempts DROP CONSTRAINT checkout_attempts_purpose_check;
ALTER TABLE public.checkout_attempts ADD CONSTRAINT checkout_attempts_purpose_check
  CHECK(purpose IN ('checkout','track','marketing'));
ALTER TABLE public.order_items ADD COLUMN tracking_product_id text;
CREATE FUNCTION public.snapshot_marketing_item() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  NEW.tracking_product_id:=coalesce(to_jsonb(NEW)->>'product_option_id',NEW.product_id::text);
  RETURN NEW;
END;
$$;
CREATE TRIGGER snapshot_marketing_item BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_marketing_item();

ALTER TABLE public.store_marketing_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_marketing_integrations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_marketing_integrations ON public.store_marketing_integrations FOR ALL TO lebrands_app
  USING(store_id=NULLIF(current_setting('app.store_id',true),'')::uuid)
  WITH CHECK(store_id=NULLIF(current_setting('app.store_id',true),'')::uuid);
ALTER TABLE public.store_marketing_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_marketing_consents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_marketing_consents ON public.store_marketing_consents FOR ALL TO lebrands_app
  USING(store_id=NULLIF(current_setting('app.store_id',true),'')::uuid)
  WITH CHECK(store_id=NULLIF(current_setting('app.store_id',true),'')::uuid);
ALTER TABLE public.store_marketing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_marketing_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_marketing_jobs ON public.store_marketing_jobs FOR ALL TO lebrands_app
  USING(store_id=NULLIF(current_setting('app.store_id',true),'')::uuid)
  WITH CHECK(store_id=NULLIF(current_setting('app.store_id',true),'')::uuid);

CREATE FUNCTION public.marketing_purchase_eligible(p_store uuid,p_order uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS(SELECT 1 FROM public.orders o
    WHERE o.store_id=p_store AND o.id=p_order
      AND p_store=NULLIF(current_setting('app.store_id',true),'')::uuid
      AND o.status IN ('confirmed_cod','paid','processing','packed','shipped','delivered')
      AND (o.payment_method='cod' OR (o.payment_method='online' AND EXISTS(
        SELECT 1 FROM public.payment_attempts a JOIN public.payments p
          ON p.store_id=a.store_id AND p.order_id=a.order_id AND p.provider_payment_id=a.captured_payment_id
        WHERE a.store_id=p_store AND a.order_id=p_order AND a.state='captured'
          AND p.provider='razorpay' AND p.status='captured' AND p.currency='INR' AND p.amount_paise=o.total_paise))));
$$;
CREATE FUNCTION public.initialise_order_marketing() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE context jsonb; config public.store_marketing_integrations%ROWTYPE; choice public.store_marketing_consents%ROWTYPE;
BEGIN
  context:=NULLIF(current_setting('app.marketing_context',true),'')::jsonb;
  IF context IS NULL OR NEW.store_id IS DISTINCT FROM NULLIF(current_setting('app.store_id',true),'')::uuid THEN RETURN NEW; END IF;
  SELECT * INTO config FROM public.store_marketing_integrations WHERE store_id=NEW.store_id;
  SELECT * INTO choice FROM public.store_marketing_consents
    WHERE store_id=NEW.store_id AND visitor_id=(context->>'visitor_id')::uuid
      AND revision=config.updated_at::text AND updated_at>now()-interval '180 days';
  IF NOT FOUND OR NOT(choice.analytics OR choice.ads) THEN RETURN NEW; END IF;
  NEW.tracking_consent_id:=choice.visitor_id;
  NEW.tracking_revision:=choice.revision;
  NEW.tracking_source_url:=left(context->>'source_url',512);
  IF choice.ads THEN
    NEW.tracking_user_data:=context->'user_data';
    IF config.meta_enabled AND config.meta_capi_token_encrypted IS NOT NULL THEN
      NEW.fbp:=left(context->>'fbp',256); NEW.fbc:=left(context->>'fbc',512);
      NEW.client_ip:=left(context->>'ip',64); NEW.user_agent:=left(context->>'ua',1024);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER initialise_order_marketing BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.initialise_order_marketing();
CREATE FUNCTION public.enqueue_order_marketing() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.tracking_consent_id IS NOT NULL AND NEW.tracking_confirmed_at IS NULL
      AND public.marketing_purchase_eligible(NEW.store_id,NEW.id) THEN
    UPDATE public.orders SET tracking_confirmed_at=now() WHERE store_id=NEW.store_id AND id=NEW.id;
    INSERT INTO public.store_marketing_jobs(store_id,order_id)
      SELECT NEW.store_id,NEW.id FROM public.store_marketing_integrations m
      JOIN public.store_marketing_consents c ON c.store_id=m.store_id AND c.visitor_id=NEW.tracking_consent_id
      WHERE m.store_id=NEW.store_id AND m.meta_enabled AND m.meta_capi_token_encrypted IS NOT NULL
        AND c.ads AND c.revision=m.updated_at::text AND NEW.tracking_revision=c.revision
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER enqueue_order_marketing AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_order_marketing();
CREATE FUNCTION public.list_marketing_work() RETURNS TABLE(store_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT DISTINCT work.store_id FROM (
    SELECT j.store_id FROM public.store_marketing_jobs j
      WHERE (j.status='pending' AND j.next_attempt_at<=now()) OR (j.status='sending' AND j.lease_until<now())
    UNION SELECT o.store_id FROM public.orders o
      WHERE (o.client_ip IS NOT NULL OR o.tracking_user_data IS NOT NULL)
        AND o.created_at<now()-interval '7 days'
    UNION SELECT c.store_id FROM public.store_marketing_consents c WHERE c.updated_at<now()-interval '180 days'
  ) work LIMIT 25;
$$;
REVOKE ALL ON public.store_marketing_integrations,public.store_marketing_consents,public.store_marketing_jobs FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.store_marketing_integrations,public.store_marketing_consents,public.store_marketing_jobs TO lebrands_app;
REVOKE ALL ON FUNCTION public.snapshot_marketing_item(),public.initialise_order_marketing(),public.enqueue_order_marketing(),public.marketing_purchase_eligible(uuid,uuid),public.list_marketing_work() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketing_purchase_eligible(uuid,uuid),public.list_marketing_work() TO lebrands_app;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF to_regrole(r) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.store_marketing_integrations,public.store_marketing_consents,public.store_marketing_jobs FROM %I',r);
      EXECUTE format('REVOKE ALL ON FUNCTION public.snapshot_marketing_item(),public.initialise_order_marketing(),public.enqueue_order_marketing(),public.marketing_purchase_eligible(uuid,uuid),public.list_marketing_work() FROM %I',r);
    END IF;
  END LOOP;
END $$;
