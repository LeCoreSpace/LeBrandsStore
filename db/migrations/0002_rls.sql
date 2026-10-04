-- The migration/function owner must bypass RLS so resolve_store can bootstrap
-- a request before a tenant context exists. Never use this owner in Hyperdrive.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'Run migrations as an administrative role with BYPASSRLS';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'lebrands_app') THEN
    CREATE ROLE lebrands_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  -- Managed Supabase admins are not necessarily superusers. An unconditional
  -- ALTER ROLE ... NOSUPERUSER can require superuser privileges even when the
  -- target already has NOSUPERUSER. Validate an existing role instead.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'lebrands_app'
      AND (NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole
        OR rolinherit OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'Existing lebrands_app role does not have the required least-privilege attributes';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members AS m
    JOIN pg_catalog.pg_roles AS r ON r.oid = m.member
    WHERE r.rolname = 'lebrands_app'
  ) THEN
    RAISE EXCEPTION 'lebrands_app must not be a member of another role';
  END IF;

  EXECUTE format('GRANT CONNECT ON DATABASE %I TO lebrands_app', current_database());
END;
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC, lebrands_app;
GRANT USAGE ON SCHEMA public TO lebrands_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO lebrands_app;

DO $$
DECLARE
  table_name text;
  api_role text;
BEGIN
  -- Explicit list: never grant the app access to unrelated Supabase tables.
  FOREACH table_name IN ARRAY ARRAY[
    'stores', 'store_members', 'pages', 'page_versions', 'media', 'policy_pages',
    'products', 'product_options', 'product_media', 'collections',
    'collection_products', 'customers', 'customer_addresses', 'orders',
    'order_items', 'payments', 'shipments', 'refunds', 'invoices',
    'invoice_sequences', 'domains', 'integrations', 'otp_verifications',
    'email_log', 'webhook_events', 'audit_log'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, lebrands_app', table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    -- Postgres may leave an empty custom GUC after a transaction ends.
    -- NULLIF ensures missing/empty context denies rows rather than casting ''.
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO lebrands_app
       USING (store_id = NULLIF(current_setting(''app.store_id'', true), '''')::uuid)
       WITH CHECK (store_id = NULLIF(current_setting(''app.store_id'', true), '''')::uuid)',
      table_name
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO lebrands_app',
      table_name
    );
  END LOOP;

  -- Shared private account registries are admin-only. Themes are read-only.
  REVOKE ALL ON TABLE public.brands, public.users, public.themes FROM PUBLIC, lebrands_app;
  GRANT SELECT ON TABLE public.themes TO lebrands_app;

  -- Supabase may grant API roles privileges by default. No Data API is used.
  FOR api_role IN
    SELECT rolname FROM pg_catalog.pg_roles
    WHERE rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    FOREACH table_name IN ARRAY ARRAY[
      'brands', 'stores', 'users', 'store_members', 'themes', 'pages',
      'page_versions', 'media', 'policy_pages', 'products', 'product_options',
      'product_media', 'collections', 'collection_products', 'customers',
      'customer_addresses', 'orders', 'order_items', 'payments', 'shipments',
      'refunds', 'invoices', 'invoice_sequences', 'domains', 'integrations',
      'otp_verifications', 'email_log', 'webhook_events', 'audit_log',
      'schema_migrations'
    ]
    LOOP
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, api_role);
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON TABLE public.schema_migrations FROM PUBLIC, lebrands_app;

CREATE FUNCTION public.resolve_store(p_hostname text)
RETURNS TABLE (store_id uuid, subdomain text, name text, status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  hostname_normalized text := lower(p_hostname);
BEGIN
  IF hostname_normalized ~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])\.lebrands\.store$' THEN
    RETURN QUERY
      SELECT s.store_id, s.subdomain, s.name, s.status
      FROM public.stores AS s
      WHERE s.subdomain = left(hostname_normalized, length(hostname_normalized) - length('.lebrands.store'))
        AND s.status = 'live';
  ELSIF hostname_normalized <> 'lebrands.store'
    AND hostname_normalized NOT LIKE '%.lebrands.store' THEN
    RETURN QUERY
      SELECT s.store_id, s.subdomain, s.name, s.status
      FROM public.domains AS d
      JOIN public.stores AS s ON s.store_id = d.store_id
      WHERE d.hostname = hostname_normalized
        AND d.status = 'active'
        AND s.status = 'live';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_store(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_store(text) TO lebrands_app;

-- Also remove explicit Supabase default function grants, not just PUBLIC.
DO $$
DECLARE
  api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname FROM pg_catalog.pg_roles
    WHERE rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.resolve_store(text) FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON FUNCTION public.touch_updated_at() FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON FUNCTION public.prevent_history_deletion() FROM %I', api_role);
  END LOOP;
END;
$$;