-- Dedicated store widgets avoid accumulating every merchant hostname on the
-- shared platform widget. Only encrypted credentials are stored.
CREATE TABLE public.store_checkout_security (
  store_id uuid PRIMARY KEY REFERENCES public.stores(store_id),
  site_key text NOT NULL UNIQUE CHECK (site_key ~ '^[A-Za-z0-9_-]{10,64}$'),
  credentials_ciphertext text NOT NULL CHECK (credentials_ciphertext LIKE 'v1.%'),
  hostnames jsonb NOT NULL CHECK (jsonb_typeof(hostnames)='array' AND jsonb_array_length(hostnames) BETWEEN 1 AND 10),
  checked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.store_checkout_security ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_checkout_security FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.store_checkout_security FOR ALL TO lebrands_app
  USING (store_id=NULLIF(current_setting('app.store_id',true),'')::uuid)
  WITH CHECK (store_id=NULLIF(current_setting('app.store_id',true),'')::uuid);
REVOKE ALL ON public.store_checkout_security FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.store_checkout_security TO lebrands_app;
DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL ON public.store_checkout_security FROM %I',r);
  END LOOP;
END $$;
