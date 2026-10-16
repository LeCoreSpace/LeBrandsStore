-- Launch choices are distinct from design drafts and live checkout settings.
CREATE TABLE public.store_launch_setup (
  store_id uuid PRIMARY KEY REFERENCES public.stores(store_id),
  preferences jsonb NOT NULL DEFAULT '{"address":"included","payments":"cod","delivery":"manual"}'::jsonb,
  domain_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(preferences) = 'object' AND octet_length(preferences::text) <= 4096),
  CHECK (jsonb_typeof(domain_evidence) = 'object' AND octet_length(domain_evidence::text) <= 32768)
);
ALTER TABLE public.store_launch_setup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_launch_setup FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.store_launch_setup FOR ALL TO lebrands_app
  USING (store_id = NULLIF(current_setting('app.store_id',true),'')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id',true),'')::uuid);
REVOKE ALL ON public.store_launch_setup FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.store_launch_setup TO lebrands_app;
DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL ON public.store_launch_setup FROM %I',r);
  END LOOP;
END $$;
