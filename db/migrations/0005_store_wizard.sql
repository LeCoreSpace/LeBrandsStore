-- MANUAL ONLY. Never rewrite applied migrations or execute this automatically.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Wizard migration requires an administrative BYPASSRLS role';
  END IF;
END;
$$;

CREATE TABLE public.store_setup (
  store_id uuid PRIMARY KEY REFERENCES public.stores(store_id),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  logo_media_id uuid,
  step integer NOT NULL DEFAULT 1 CHECK (step BETWEEN 1 AND 4),
  completed integer[] NOT NULL DEFAULT '{}' CHECK (completed <@ ARRAY[1,2,3,4]),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, logo_media_id) REFERENCES public.media(store_id, id)
);
CREATE TABLE public.store_publications (
  store_id uuid PRIMARY KEY REFERENCES public.stores(store_id),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.store_address_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  subdomain text NOT NULL UNIQUE CHECK (subdomain ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '90 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stores ADD COLUMN subdomain_changed_at timestamptz;
ALTER TABLE public.media ADD COLUMN upload_type text NOT NULL DEFAULT 'image'
  CHECK (upload_type IN ('logo', 'image'));
ALTER TABLE public.products ADD COLUMN tags text[] NOT NULL DEFAULT '{}'
  CHECK (cardinality(tags) <= 10);
ALTER TABLE public.policy_pages ADD COLUMN reviewed_at timestamptz;
ALTER TABLE public.policy_pages ADD CONSTRAINT policy_body_limit CHECK (length(content) <= 20000);

DO $$
DECLARE t text; r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['store_setup', 'store_publications', 'store_address_history'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON public.%I FOR ALL TO lebrands_app
      USING (store_id = NULLIF(current_setting(''app.store_id'', true), '''')::uuid)
      WITH CHECK (store_id = NULLIF(current_setting(''app.store_id'', true), '''')::uuid)', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO lebrands_app', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', t, r);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Authenticate AND verify membership inside the same tenant transaction.
-- Locking the session/user/member prevents a reset or membership removal
-- from racing a wizard mutation. Forced-reset accounts cannot enter.
CREATE FUNCTION public.authorize_store_session(p_token_hash text, p_store_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM 1 FROM public.sessions s
    JOIN public.users u ON u.id = s.user_id
    JOIN public.store_members m ON m.user_id = u.id
    WHERE s.token_hash = p_token_hash AND s.revoked_at IS NULL AND s.expires_at > now()
      AND NOT u.must_change_password AND m.store_id = p_store_id
    FOR SHARE OF s, u, m;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_subdomain(p_subdomain text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT p_subdomain ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'
    AND p_subdomain <> ALL(ARRAY[
      'www','app','admin','api','brands','customers','mail','notify','news','help',
      'support','status','shop','store','checkout','cart','pay','payments','login',
      'account','dashboard','blog','docs','cdn','static','assets','media','lebrands','lebrandsspace'])
    AND NOT EXISTS (SELECT 1 FROM public.stores WHERE subdomain = p_subdomain)
    AND NOT EXISTS (SELECT 1 FROM public.store_address_history
      WHERE subdomain = p_subdomain AND expires_at > now())
$$;
CREATE FUNCTION public.store_address_available(p_name text, p_store_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT public.check_subdomain(p_name)
    AND NOT EXISTS (SELECT 1 FROM public.store_address_history h
      WHERE h.subdomain = p_name AND h.expires_at > now())
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.store_id = p_store_id AND s.subdomain = p_name)
$$;

-- These names are returned for canonical redirects, not tenant data exposure.
CREATE OR REPLACE FUNCTION public.resolve_store(p_hostname text)
RETURNS TABLE (store_id uuid, subdomain text, name text, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE normalized text := lower(p_hostname);
BEGIN
  IF normalized ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]\.lebrands\.store$' THEN
    RETURN QUERY SELECT s.store_id, s.subdomain, s.name, s.status
      FROM public.stores s WHERE s.status = 'live' AND (
        s.subdomain = split_part(normalized, '.', 1)
        OR EXISTS (SELECT 1 FROM public.store_address_history h
          WHERE h.store_id = s.store_id AND h.subdomain = split_part(normalized, '.', 1)
            AND h.expires_at > now()));
  ELSE
    RETURN QUERY SELECT s.store_id, s.subdomain, s.name, s.status
      FROM public.stores s JOIN public.domains d ON d.store_id = s.store_id
      WHERE d.hostname = normalized AND d.status = 'active' AND s.status = 'live';
  END IF;
END;
$$;

DO $$
DECLARE f regprocedure; r text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.authorize_store_session(text,uuid)'::regprocedure,
    'public.store_address_available(text,uuid)'::regprocedure,
    'public.check_subdomain(text)'::regprocedure,
    'public.resolve_store(text)'::regprocedure
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, r);
      END IF;
    END LOOP;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO lebrands_app', f);
  END LOOP;
END;
$$;
