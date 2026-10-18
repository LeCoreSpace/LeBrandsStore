-- Platform subscription Phase 2: additive schema and DRAFT commercial catalogue.
-- No store enrolment, publication changes, provider calls or charge activation.
-- Do not modify an applied migration; use later migrations for release changes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Platform billing migration requires administrative BYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations
    WHERE filename='0035_business_document_review.sql') THEN
    RAISE EXCEPTION 'Apply and review 0035_business_document_review.sql first';
  END IF;
END $$;

CREATE TABLE public.billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{0,39}$'),
  version integer NOT NULL CHECK (version>0),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  offer_state text NOT NULL DEFAULT 'draft' CHECK (offer_state IN ('draft','offered','retired')),
  contract_required boolean NOT NULL DEFAULT false,
  free_live_days integer CHECK (free_live_days>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code,version)
);
CREATE TABLE public.billing_plan_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.billing_plans(id),
  version integer NOT NULL CHECK (version>0),
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  currency_exponent smallint NOT NULL CHECK (currency_exponent BETWEEN 0 AND 3),
  billing_interval text NOT NULL CHECK (billing_interval IN ('free','monthly','annual')),
  price_kind text NOT NULL CHECK (price_kind IN ('fixed','accepted_quote_required')),
  amount_minor bigint CHECK (amount_minor BETWEEN 0 AND 9007199254740991),
  advertised_from_minor bigint CHECK (advertised_from_minor BETWEEN 0 AND 9007199254740991),
  tax_inclusive boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id,country_code,currency,billing_interval,version),
  UNIQUE (id,plan_id,country_code,currency,billing_interval),
  CHECK ((price_kind='fixed' AND amount_minor IS NOT NULL)
    OR (price_kind='accepted_quote_required' AND amount_minor IS NULL AND NOT enabled)),
  CHECK (billing_interval<>'free' OR (price_kind='fixed' AND amount_minor=0)),
  CHECK (price_kind<>'fixed' OR billing_interval='free' OR amount_minor>0)
);
CREATE UNIQUE INDEX billing_one_offered_plan ON public.billing_plans(code)
  WHERE offer_state='offered';
CREATE UNIQUE INDEX billing_one_enabled_price
  ON public.billing_plan_prices(plan_id,country_code,currency,billing_interval) WHERE enabled;
CREATE TABLE public.billing_features (
  key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{0,79}$'),
  label text NOT NULL,
  value_kind text NOT NULL CHECK (value_kind IN ('boolean','limit','package')),
  implementation_readiness text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.billing_plan_features (
  plan_id uuid NOT NULL REFERENCES public.billing_plans(id),
  feature_key text NOT NULL REFERENCES public.billing_features(key),
  included boolean NOT NULL,
  value jsonb NOT NULL,
  PRIMARY KEY (plan_id,feature_key)
);

CREATE TABLE public.billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE REFERENCES public.stores(store_id),
  billing_contact_user_id uuid NOT NULL REFERENCES public.users(id),
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  legal_name text NOT NULL CHECK (length(btrim(legal_name)) BETWEEN 1 AND 240),
  billing_address jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(billing_address)='object'),
  tax_registration_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id,id),
  UNIQUE (store_id,id,country_code)
);
CREATE TABLE public.billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  billing_account_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.billing_plans(id),
  price_id uuid NOT NULL,
  country_code text NOT NULL,
  currency text NOT NULL,
  billing_interval text NOT NULL CHECK (billing_interval IN ('free','monthly','annual')),
  mode text NOT NULL CHECK (mode IN ('none','test','live')),
  status text NOT NULL CHECK (status IN
    ('pending','building','trialing','active','grace','paused','expired','cancelled')),
  collection_mode text NOT NULL DEFAULT 'manual' CHECK (collection_mode='manual'),
  automatic_renewal boolean NOT NULL DEFAULT false CHECK (NOT automatic_renewal),
  terms_version text NOT NULL CHECK (length(terms_version) BETWEEN 1 AND 100),
  accepted_at timestamptz NOT NULL,
  accepted_by uuid NOT NULL REFERENCES public.users(id),
  period_start timestamptz,
  period_end timestamptz,
  free_live_started_at timestamptz,
  free_expires_at timestamptz,
  legacy_concession boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  entitlement_snapshot jsonb NOT NULL CHECK (jsonb_typeof(entitlement_snapshot)='object'),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id,billing_account_id,country_code)
    REFERENCES public.billing_accounts(store_id,id,country_code),
  FOREIGN KEY (price_id,plan_id,country_code,currency,billing_interval)
    REFERENCES public.billing_plan_prices(id,plan_id,country_code,currency,billing_interval),
  UNIQUE (store_id,id),
  UNIQUE (store_id,id,billing_account_id),
  UNIQUE (store_id,id,mode),
  UNIQUE (store_id,id,mode,currency),
  CHECK ((period_start IS NULL AND period_end IS NULL)
    OR (period_start IS NOT NULL AND period_end IS NOT NULL AND period_end>period_start)),
  CHECK ((free_live_started_at IS NULL AND free_expires_at IS NULL)
    OR (free_live_started_at IS NOT NULL AND free_expires_at IS NOT NULL
      AND free_expires_at=free_live_started_at+interval '720 hours')),
  CHECK ((billing_interval='free' AND mode='none')
    OR (billing_interval<>'free' AND mode IN ('test','live')
      AND free_live_started_at IS NULL AND free_expires_at IS NULL AND NOT legacy_concession)),
  CHECK (status<>'trialing' OR (billing_interval='free' AND free_live_started_at IS NOT NULL)),
  CHECK (status<>'building' OR (billing_interval='free' AND free_live_started_at IS NULL)),
  CHECK (status NOT IN ('active','grace') OR (billing_interval<>'free' AND period_start IS NOT NULL))
);
-- Pending paid checkout may coexist with the current Free/paid entitlement.
CREATE UNIQUE INDEX billing_one_current_subscription ON public.billing_subscriptions(store_id)
  WHERE status IN ('building','trialing','active','grace','paused');
-- A cancelled/expired Free record is retained, preventing a second trial.
CREATE UNIQUE INDEX billing_one_free_enrolment ON public.billing_subscriptions(store_id)
  WHERE billing_interval='free';
CREATE INDEX billing_subscription_expiry ON public.billing_subscriptions(period_end)
  WHERE status IN ('active','grace');

CREATE TABLE public.billing_subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  event_key text NOT NULL CHECK (length(event_key) BETWEEN 1 AND 160),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 100),
  actor_user_id uuid REFERENCES public.users(id),
  safe_details jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(safe_details)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id,subscription_id) REFERENCES public.billing_subscriptions(store_id,id),
  UNIQUE (store_id,event_key)
);
CREATE TABLE public.billing_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('test','live')),
  provider text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_]{0,39}$'),
  provider_order_id text CHECK (length(provider_order_id) BETWEEN 1 AND 200),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 160),
  purpose text NOT NULL CHECK (purpose IN ('initial','renewal','upgrade')),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor BETWEEN 1 AND 9007199254740991),
  tax_minor bigint NOT NULL CHECK (tax_minor BETWEEN 0 AND 9007199254740991),
  total_minor bigint NOT NULL CHECK (total_minor BETWEEN 1 AND 9007199254740991),
  tax_snapshot jsonb NOT NULL CHECK (jsonb_typeof(tax_snapshot)='object'),
  entitlement_snapshot jsonb NOT NULL CHECK (jsonb_typeof(entitlement_snapshot)='object'),
  status text NOT NULL DEFAULT 'created' CHECK (status IN
    ('created','pending','paid','failed','expired','cancelled')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id,subscription_id,mode,currency)
    REFERENCES public.billing_subscriptions(store_id,id,mode,currency),
  UNIQUE (store_id,id),
  UNIQUE (store_id,id,subscription_id,mode,currency,total_minor,provider),
  UNIQUE (store_id,idempotency_key),
  UNIQUE (provider,mode,provider_order_id),
  CHECK (total_minor=subtotal_minor+tax_minor),
  CHECK (expires_at>created_at)
);
CREATE TABLE public.billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  checkout_session_id uuid NOT NULL,
  provider text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('test','live')),
  provider_payment_id text NOT NULL CHECK (length(provider_payment_id) BETWEEN 1 AND 200),
  currency text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 9007199254740991),
  status text NOT NULL CHECK (status IN ('captured','partially_refunded','refunded')),
  verified_at timestamptz NOT NULL,
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id,checkout_session_id,subscription_id,mode,currency,amount_minor,provider)
    REFERENCES public.billing_checkout_sessions(store_id,id,subscription_id,mode,currency,total_minor,provider),
  UNIQUE (store_id,id),
  UNIQUE (store_id,id,subscription_id,mode,currency,amount_minor),
  UNIQUE (checkout_session_id),
  UNIQUE (provider,mode,provider_payment_id)
);
CREATE TABLE public.billing_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(store_id),
  provider text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('test','live')),
  provider_event_id text NOT NULL CHECK (length(provider_event_id) BETWEEN 1 AND 200),
  event_type text NOT NULL,
  signature_verified_at timestamptz NOT NULL,
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending','processed','ignored','failed')),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  safe_summary jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(safe_summary)='object'),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
  next_attempt_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider,mode,provider_event_id)
);
CREATE INDEX billing_webhook_retry ON public.billing_webhook_events(next_attempt_at)
  WHERE processing_status IN ('pending','failed');

CREATE TABLE public.billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  billing_account_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  payment_id uuid,
  mode text NOT NULL CHECK (mode IN ('test','live')),
  invoice_number text CHECK (length(invoice_number) BETWEEN 1 AND 80),
  financial_year text CHECK (financial_year ~ '^[0-9]{4}-[0-9]{2}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','void')),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor BETWEEN 1 AND 9007199254740991),
  tax_minor bigint NOT NULL CHECK (tax_minor BETWEEN 0 AND 9007199254740991),
  total_minor bigint NOT NULL CHECK (total_minor BETWEEN 1 AND 9007199254740991),
  issuer_snapshot jsonb NOT NULL CHECK (jsonb_typeof(issuer_snapshot)='object'),
  customer_snapshot jsonb NOT NULL CHECK (jsonb_typeof(customer_snapshot)='object'),
  tax_snapshot jsonb NOT NULL CHECK (jsonb_typeof(tax_snapshot)='object'),
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id,subscription_id,billing_account_id)
    REFERENCES public.billing_subscriptions(store_id,id,billing_account_id),
  FOREIGN KEY (store_id,subscription_id,mode,currency)
    REFERENCES public.billing_subscriptions(store_id,id,mode,currency),
  FOREIGN KEY (store_id,payment_id,subscription_id,mode,currency,total_minor)
    REFERENCES public.billing_payments(store_id,id,subscription_id,mode,currency,amount_minor),
  UNIQUE (store_id,id),
  UNIQUE (mode,invoice_number),
  UNIQUE (payment_id),
  CHECK (total_minor=subtotal_minor+tax_minor),
  CHECK (status='draft' OR (invoice_number IS NOT NULL AND financial_year IS NOT NULL
    AND issued_at IS NOT NULL AND payment_id IS NOT NULL))
);
CREATE TABLE public.billing_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  position integer NOT NULL CHECK (position>0),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 500),
  quantity integer NOT NULL CHECK (quantity>0),
  unit_amount_minor bigint NOT NULL CHECK (unit_amount_minor BETWEEN 0 AND 9007199254740991),
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor BETWEEN 0 AND 9007199254740991),
  tax_minor bigint NOT NULL CHECK (tax_minor BETWEEN 0 AND 9007199254740991),
  total_minor bigint NOT NULL CHECK (total_minor BETWEEN 0 AND 9007199254740991),
  tax_snapshot jsonb NOT NULL CHECK (jsonb_typeof(tax_snapshot)='object'),
  FOREIGN KEY (store_id,invoice_id) REFERENCES public.billing_invoices(store_id,id),
  UNIQUE (invoice_id,position),
  CHECK (subtotal_minor=unit_amount_minor*quantity),
  CHECK (total_minor=subtotal_minor+tax_minor)
);
CREATE INDEX billing_invoice_lines_store ON public.billing_invoice_lines(store_id,invoice_id);

-- No write authority is granted in this phase. Later services must use narrow
-- session-checked privileged functions, never broad table-write grants.
CREATE FUNCTION public.billing_can_read_store(p_store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT p_store_id = nullif(current_setting('app.store_id',true),'')::uuid
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      JOIN public.users u ON u.id=s.user_id
      JOIN public.store_members m ON m.user_id=u.id AND m.store_id=p_store_id
      WHERE s.token_hash=nullif(current_setting('app.account_session_hash',true),'')
        AND s.revoked_at IS NULL AND s.expires_at>now()
        AND NOT u.must_change_password AND m.role='owner'
    )
$$;
REVOKE ALL ON FUNCTION public.billing_can_read_store(uuid) FROM PUBLIC,lebrands_app;
GRANT EXECUTE ON FUNCTION public.billing_can_read_store(uuid) TO lebrands_app;

CREATE FUNCTION public.billing_preserve_event()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Billing subscription events are append-only' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION public.billing_preserve_event() FROM PUBLIC,lebrands_app;
CREATE TRIGGER billing_events_append_only BEFORE UPDATE OR DELETE
  ON public.billing_subscription_events FOR EACH ROW EXECUTE FUNCTION public.billing_preserve_event();

-- Survives future privileged writers: trial history cannot be reset or removed,
-- and accepted plan/price identity cannot be rewritten as a different purchase.
CREATE FUNCTION public.billing_preserve_subscription_history()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Billing subscription history cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF (NEW.id,NEW.store_id,NEW.billing_account_id,NEW.plan_id,NEW.price_id,
      NEW.country_code,NEW.currency,NEW.billing_interval,NEW.mode,NEW.terms_version,
      NEW.accepted_at,NEW.accepted_by,NEW.legacy_concession)
    IS DISTINCT FROM
     (OLD.id,OLD.store_id,OLD.billing_account_id,OLD.plan_id,OLD.price_id,
      OLD.country_code,OLD.currency,OLD.billing_interval,OLD.mode,OLD.terms_version,
      OLD.accepted_at,OLD.accepted_by,OLD.legacy_concession)
    OR (OLD.free_live_started_at IS NOT NULL AND
      (NEW.free_live_started_at,NEW.free_expires_at)
        IS DISTINCT FROM (OLD.free_live_started_at,OLD.free_expires_at)) THEN
    RAISE EXCEPTION 'Accepted billing identity and started Free clock are immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.billing_preserve_subscription_history() FROM PUBLIC,lebrands_app;
CREATE TRIGGER billing_subscription_history BEFORE UPDATE OR DELETE
  ON public.billing_subscriptions FOR EACH ROW EXECUTE FUNCTION public.billing_preserve_subscription_history();

CREATE FUNCTION public.billing_preserve_price_version()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Billing price versions cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF (to_jsonb(NEW)-'enabled') IS DISTINCT FROM (to_jsonb(OLD)-'enabled') THEN
    RAISE EXCEPTION 'Create a new billing price version instead' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.billing_preserve_price_version() FROM PUBLIC,lebrands_app;
CREATE TRIGGER billing_price_history BEFORE UPDATE OR DELETE
  ON public.billing_plan_prices FOR EACH ROW EXECUTE FUNCTION public.billing_preserve_price_version();

DO $$
DECLARE t text; r text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'billing_plans','billing_plan_prices','billing_features','billing_plan_features',
    'billing_accounts','billing_subscriptions','billing_subscription_events',
    'billing_checkout_sessions','billing_payments','billing_webhook_events',
    'billing_invoices','billing_invoice_lines'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,lebrands_app',t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    IF t IN ('billing_plans','billing_plan_prices','billing_features','billing_plan_features') THEN
      EXECUTE format('CREATE POLICY billing_catalogue_read ON public.%I FOR SELECT TO lebrands_app USING (true)',t);
      EXECUTE format('GRANT SELECT ON public.%I TO lebrands_app',t);
    ELSIF t<>'billing_webhook_events' THEN
      EXECUTE format('CREATE POLICY billing_owner_read ON public.%I FOR SELECT TO lebrands_app USING (public.billing_can_read_store(store_id))',t);
      EXECUTE format('GRANT SELECT ON public.%I TO lebrands_app',t);
    END IF;
    FOR r IN SELECT rolname FROM pg_catalog.pg_roles
      WHERE rolname IN ('anon','authenticated','service_role')
    LOOP
      EXECUTE format('REVOKE ALL ON public.%I FROM %I',t,r);
    END LOOP;
  END LOOP;
  FOR r IN SELECT rolname FROM pg_catalog.pg_roles
    WHERE rolname IN ('anon','authenticated','service_role')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.billing_can_read_store(uuid) FROM %I',r);
    EXECUTE format('REVOKE ALL ON FUNCTION public.billing_preserve_event() FROM %I',r);
    EXECUTE format('REVOKE ALL ON FUNCTION public.billing_preserve_subscription_history() FROM %I',r);
    EXECUTE format('REVOKE ALL ON FUNCTION public.billing_preserve_price_version() FROM %I',r);
  END LOOP;
END $$;

-- Frozen Phase 1 planning seed. All offers/prices remain disabled drafts.
INSERT INTO public.billing_plans(code,version,name,contract_required,free_live_days) VALUES
  ('free',1,'Free',false,30),('launch',1,'Launch',false,NULL),
  ('grow',1,'Grow',false,NULL),('scale',1,'Scale',false,NULL),
  ('flagship',1,'Flagship',true,NULL);
INSERT INTO public.billing_plan_prices
  (plan_id,version,country_code,currency,currency_exponent,billing_interval,price_kind,amount_minor,advertised_from_minor)
SELECT p.id,1,'IN','INR',2,v.billing_interval,v.price_kind,v.amount_minor,v.advertised_from_minor
FROM public.billing_plans p JOIN (VALUES
  ('free','free','fixed',0::bigint,NULL::bigint),
  ('launch','monthly','fixed',149900,NULL),('launch','annual','fixed',1499000,NULL),
  ('grow','monthly','fixed',349900,NULL),('grow','annual','fixed',3499000,NULL),
  ('scale','monthly','fixed',799900,NULL),('scale','annual','fixed',7999000,NULL),
  ('flagship','monthly','accepted_quote_required',NULL,1999900)
) AS v(code,billing_interval,price_kind,amount_minor,advertised_from_minor) ON v.code=p.code;
INSERT INTO public.billing_features(key,label,value_kind,implementation_readiness) VALUES
  ('lebrands_space_placement','LeBrands.Space placement','package','cross_product_fulfilment_confirmation_required'),
  ('ann_and_theme_editor','Ann and theme editor','boolean','implemented_paths_subject_to_release_verification'),
  ('branded_customisable_checkout','Fully branded, customisable checkout','boolean','branding_exists_full_customisation_acceptance_required'),
  ('per_page_seo_metadata','SEO titles and descriptions per public page','boolean','seo_paths_exist_per_page_control_coverage_requires_verification'),
  ('transactional_emails','Transactional emails','boolean','email_jobs_exist_template_event_and_delivery_verification_required'),
  ('payment_partner_integration','Integration with the brand''s own payment account','boolean','conditional_on_brand_account_approval_and_connection'),
  ('delivery_partner_integration','Delivery-partner integration','boolean','conditional_on_supported_partner_connection_and_serviceability'),
  ('conversion_section_library','Native conversion-section library','boolean','registered_native_sections_exist'),
  ('data_export','Data export','boolean','csv_exports_exist_media_archive_not_implemented'),
  ('published_products','Published products','limit','enforcement_not_implemented'),
  ('published_skus','Published SKUs','limit','enforcement_not_implemented'),
  ('additional_staff_seats','Additional staff seats excluding owner','limit','enforcement_not_implemented'),
  ('monthly_order_soft_band','Monthly order soft band, never a checkout block','limit','enforcement_not_implemented'),
  ('public_media_bytes','Public media bytes','limit','enforcement_not_implemented'),
  ('custom_domain','Custom domain','boolean','conditional_on_platform_and_brand_connection');
INSERT INTO public.billing_plan_features(plan_id,feature_key,included,value)
SELECT p.id,f.key,true,'true'::jsonb FROM public.billing_plans p
CROSS JOIN public.billing_features f WHERE f.value_kind='boolean' AND f.key<>'custom_domain';
INSERT INTO public.billing_plan_features(plan_id,feature_key,included,value)
SELECT p.id,'lebrands_space_placement',p.code<>'free',to_jsonb(v.package)
FROM public.billing_plans p JOIN (VALUES
  ('free','none'),('launch','starter'),('grow','premium'),('scale','freedom'),
  ('flagship','freedom_with_contracted_extras')
) v(code,package) ON p.code=v.code;
INSERT INTO public.billing_plan_features(plan_id,feature_key,included,value)
SELECT p.id,v.feature_key,true,coalesce(v.amount,'null'::jsonb)
FROM public.billing_plans p JOIN (
  SELECT a.code,f.feature_key,
    CASE f.feature_key WHEN 'published_products' THEN to_jsonb(a.products)
      WHEN 'published_skus' THEN to_jsonb(a.skus)
      WHEN 'additional_staff_seats' THEN to_jsonb(a.staff)
      WHEN 'monthly_order_soft_band' THEN to_jsonb(a.orders)
      WHEN 'public_media_bytes' THEN to_jsonb(a.media)
      WHEN 'custom_domain' THEN to_jsonb(a.domain) END AS amount
  FROM (VALUES
    ('free',100,1000,0,NULL::integer,536870912::bigint,false),
    ('launch',500,5000,2,300,5368709120,true),
    ('grow',2500,25000,5,1500,21474836480,true),
    ('scale',10000,100000,15,7500,107374182400,true),
    ('flagship',NULL,NULL,NULL,NULL,NULL,true)
  ) a(code,products,skus,staff,orders,media,domain)
  CROSS JOIN (VALUES ('published_products'),('published_skus'),('additional_staff_seats'),
    ('monthly_order_soft_band'),('public_media_bytes'),('custom_domain')) f(feature_key)
) v ON v.code=p.code;
-- Correct the Free domain entitlement (false is not an included feature).
UPDATE public.billing_plan_features SET included=false
WHERE feature_key='custom_domain' AND plan_id=(SELECT id FROM public.billing_plans WHERE code='free');
