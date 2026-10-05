-- Custom Worker-managed accounts. No Supabase Auth or Data API is used.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Accounts migration requires an administrative BYPASSRLS role';
  END IF;
END;
$$;

UPDATE public.users SET email = lower(email) WHERE email <> lower(email);
ALTER TABLE public.users
  ADD COLUMN phone text,
  ADD COLUMN password_hash text,
  ADD COLUMN password_algo text,
  ADD COLUMN password_iterations integer,
  ADD COLUMN password_salt text,
  ADD COLUMN last_login_at timestamptz,
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
  ADD CONSTRAINT users_password_record CHECK (
    (password_hash IS NULL AND password_algo IS NULL AND password_iterations IS NULL AND password_salt IS NULL)
    OR (password_hash IS NOT NULL AND password_algo IS NOT NULL AND password_algo = 'pbkdf2-sha256'
      AND password_iterations IS NOT NULL AND password_iterations >= 600000 AND password_salt IS NOT NULL
      AND password_hash ~ '^[0-9a-f]{64}$' AND password_salt ~ '^[0-9a-f]{32}$')
  );

CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX sessions_user_idx ON public.sessions (user_id);
CREATE INDEX sessions_expiry_idx ON public.sessions (expires_at);
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email = lower(email)),
  ip_hash text NOT NULL CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  success boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_email_idx ON public.login_attempts (email, created_at DESC) WHERE NOT success;
CREATE INDEX login_attempts_ip_idx ON public.login_attempts (ip_hash, created_at DESC) WHERE NOT success;
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.login_attempts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.users, public.sessions, public.login_attempts FROM PUBLIC, lebrands_app;

CREATE FUNCTION public.register_user(
  p_email text, p_name text, p_hash text, p_algo text, p_iterations integer, p_salt text,
  p_phone text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF length(trim(p_name)) NOT BETWEEN 1 AND 120 OR length(p_email) > 254
    OR lower(trim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR (p_phone IS NOT NULL AND length(p_phone) > 30)
    OR p_algo <> 'pbkdf2-sha256' OR p_iterations <> 600000
    OR p_hash !~ '^[0-9a-f]{64}$' OR p_salt !~ '^[0-9a-f]{32}$'
    OR p_hash IS NULL OR p_salt IS NULL OR p_algo IS NULL OR p_iterations IS NULL THEN
    RAISE EXCEPTION 'Invalid registration details' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.users (email, name, phone, password_hash, password_algo, password_iterations, password_salt)
  VALUES (lower(trim(p_email)), trim(p_name), p_phone, p_hash, p_algo, p_iterations, p_salt)
  ON CONFLICT DO NOTHING; -- Same outward response for existing/new emails.
END;
$$;

CREATE FUNCTION public.get_password_record(p_email text)
RETURNS TABLE (user_id uuid, password_hash text, password_algo text,
  password_iterations integer, password_salt text)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT u.id, u.password_hash, u.password_algo, u.password_iterations, u.password_salt
  FROM public.users u WHERE u.email = lower(trim(p_email)) AND u.password_hash IS NOT NULL FOR UPDATE
$$;

CREATE FUNCTION public.record_login_attempt(p_email text, p_ip_hash text, p_success boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  INSERT INTO public.login_attempts (email, ip_hash, success)
  VALUES (lower(trim(p_email)), p_ip_hash, p_success)
$$;

CREATE FUNCTION public.is_login_locked(p_email text, p_ip_hash text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT
    (SELECT count(*) FROM public.login_attempts a WHERE NOT a.success
      AND a.created_at > now() - interval '15 minutes' AND a.email = lower(trim(p_email))) >= 10
    OR
    (SELECT count(*) FROM public.login_attempts a WHERE NOT a.success
      AND a.created_at > now() - interval '15 minutes' AND a.ip_hash = p_ip_hash) >= 10
$$;

CREATE FUNCTION public.create_session(p_user_id uuid, p_token_hash text, p_user_agent text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id AND password_hash IS NOT NULL) THEN
    RAISE EXCEPTION 'Invalid account' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.sessions (user_id, token_hash, user_agent)
  VALUES (p_user_id, p_token_hash, left(p_user_agent, 512));
  UPDATE public.users SET last_login_at = now() WHERE id = p_user_id;
END;
$$;

CREATE FUNCTION public.get_session(p_token_hash text)
RETURNS TABLE (user_id uuid, name text, email text, phone text,
  must_change_password boolean, stores jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_user uuid;
BEGIN
  UPDATE public.sessions s SET last_seen_at = now()
  WHERE s.token_hash = p_token_hash AND s.revoked_at IS NULL AND s.expires_at > now()
  RETURNING s.user_id INTO v_user;
  IF v_user IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT u.id, u.name, u.email, u.phone, u.must_change_password,
    coalesce((SELECT jsonb_agg(jsonb_build_object(
      'store_id', st.store_id, 'name', st.name, 'subdomain', st.subdomain,
      'status', st.status, 'role', m.role) ORDER BY st.created_at)
      FROM public.store_members m JOIN public.stores st ON st.store_id = m.store_id
      WHERE m.user_id = u.id), '[]'::jsonb)
    FROM public.users u WHERE u.id = v_user;
END;
$$;

CREATE FUNCTION public.revoke_session(p_token_hash text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  UPDATE public.sessions SET revoked_at = now()
  WHERE token_hash = p_token_hash AND revoked_at IS NULL
$$;

CREATE FUNCTION public.change_password(
  p_token_hash text, p_hash text, p_algo text, p_iterations integer, p_salt text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_user uuid;
BEGIN
  SELECT s.user_id INTO v_user FROM public.sessions s
    WHERE s.token_hash = p_token_hash AND s.revoked_at IS NULL AND s.expires_at > now()
    FOR UPDATE;
  IF v_user IS NULL THEN RETURN false; END IF;
  IF p_algo <> 'pbkdf2-sha256' OR p_iterations <> 600000
    OR p_hash !~ '^[0-9a-f]{64}$' OR p_salt !~ '^[0-9a-f]{32}$'
    OR p_hash IS NULL OR p_salt IS NULL OR p_algo IS NULL OR p_iterations IS NULL THEN
    RAISE EXCEPTION 'Invalid password record' USING ERRCODE = '22023';
  END IF;
  UPDATE public.users SET password_hash = p_hash, password_algo = p_algo,
    password_iterations = p_iterations, password_salt = p_salt, must_change_password = false
    WHERE id = v_user;
  UPDATE public.sessions SET revoked_at = now() WHERE user_id = v_user
    AND token_hash <> p_token_hash AND revoked_at IS NULL;
  RETURN true;
END;
$$;

CREATE FUNCTION public.check_subdomain(p_subdomain text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT p_subdomain ~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$'
    AND p_subdomain <> ALL(ARRAY[
      'www','app','admin','api','brands','customers','mail','notify','news','help',
      'support','status','shop','store','checkout','cart','pay','payments','login',
      'account','dashboard','blog','docs','cdn','static','assets','media','lebrands','lebrandsspace'])
    AND NOT EXISTS (SELECT 1 FROM public.stores WHERE subdomain = p_subdomain)
$$;

CREATE FUNCTION public.create_brand_and_store(
  p_user_id uuid, p_brand_name text, p_subdomain text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_brand uuid; v_store uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sessions s JOIN public.users u ON u.id = s.user_id
    WHERE s.token_hash = nullif(current_setting('app.account_session_hash', true), '')
      AND s.user_id = p_user_id
      AND s.revoked_at IS NULL AND s.expires_at > now() AND NOT u.must_change_password) THEN
    RAISE EXCEPTION 'Invalid session' USING ERRCODE = '42501';
  END IF;
  IF length(trim(p_brand_name)) NOT BETWEEN 1 AND 120
    OR NOT coalesce(public.check_subdomain(p_subdomain), false) THEN
    RAISE EXCEPTION 'Store address is not available' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.brands (name, legal_name) VALUES (trim(p_brand_name), trim(p_brand_name))
    RETURNING id INTO v_brand;
  INSERT INTO public.stores (brand_id, subdomain, name, status)
    VALUES (v_brand, p_subdomain, trim(p_brand_name), 'draft') RETURNING store_id INTO v_store;
  INSERT INTO public.store_members (store_id, user_id, role) VALUES (v_store, p_user_id, 'owner');
  RETURN v_store;
END;
$$;

DO $$
DECLARE v_role text; v_func regprocedure;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON public.users, public.sessions, public.login_attempts FROM %I', v_role);
    END IF;
  END LOOP;
  FOR v_func IN SELECT p.oid::regprocedure FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[
      'register_user','get_password_record','record_login_attempt','is_login_locked',
      'create_session','get_session','revoke_session','change_password','check_subdomain','create_brand_and_store'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_func);
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = v_role) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', v_func, v_role);
      END IF;
    END LOOP;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO lebrands_app', v_func);
  END LOOP;
END;
$$;
