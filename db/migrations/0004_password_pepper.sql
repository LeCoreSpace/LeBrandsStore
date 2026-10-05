-- Manual only. Preserve prior migration checksums and existing legacy records.
-- Legacy unpeppered 600k hashes cannot be verified on production Workers;
-- support must reset them. No password or pepper can be recovered/migrated here.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Password migration requires an administrative BYPASSRLS role';
  END IF;
END;
$$;

CREATE FUNCTION public.valid_password_record(p_hash text, p_algo text, p_iterations integer, p_salt text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT coalesce(
    p_algo = 'pbkdf2-sha256' AND p_iterations BETWEEN 1 AND 100000
    AND p_salt ~ '^[0-9a-f]{32}$'
    AND p_hash ~ '^pbkdf2-sha256\$v1\$p[1-9][0-9]{0,5}\$[1-9][0-9]*\$[0-9a-f]{32}\$[0-9a-f]{64}$'
    AND split_part(p_hash, '$', 4) = p_iterations::text
    AND split_part(p_hash, '$', 5) = p_salt, false)
$$;
REVOKE ALL ON FUNCTION public.valid_password_record(text, text, integer, text) FROM PUBLIC;

ALTER TABLE public.users DROP CONSTRAINT users_password_record;
ALTER TABLE public.users ADD CONSTRAINT users_password_record CHECK (
  (password_hash IS NULL AND password_algo IS NULL AND password_iterations IS NULL AND password_salt IS NULL)
  OR public.valid_password_record(password_hash, password_algo, password_iterations, password_salt)
  OR (
    password_algo IS NOT NULL AND password_algo = 'pbkdf2-sha256'
    AND password_iterations IS NOT NULL AND password_iterations >= 600000
    AND password_hash IS NOT NULL AND password_hash ~ '^[0-9a-f]{64}$'
    AND password_salt IS NOT NULL AND password_salt ~ '^[0-9a-f]{32}$'
  )
);

CREATE OR REPLACE FUNCTION public.register_user(
  p_email text, p_name text, p_hash text, p_algo text, p_iterations integer, p_salt text,
  p_phone text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_email IS NULL OR p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 120
    OR length(p_email) > 254
    OR lower(trim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR (p_phone IS NOT NULL AND length(p_phone) > 30)
    OR p_iterations IS DISTINCT FROM 100000
    OR NOT public.valid_password_record(p_hash, p_algo, p_iterations, p_salt) THEN
    RAISE EXCEPTION 'Invalid registration details' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.users (email, name, phone, password_hash, password_algo, password_iterations, password_salt)
  VALUES (lower(trim(p_email)), trim(p_name), p_phone, p_hash, p_algo, p_iterations, p_salt)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_password(
  p_token_hash text, p_hash text, p_algo text, p_iterations integer, p_salt text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_user uuid;
BEGIN
  SELECT s.user_id INTO v_user FROM public.sessions s
    WHERE s.token_hash = p_token_hash AND s.revoked_at IS NULL AND s.expires_at > now()
    FOR UPDATE;
  IF v_user IS NULL THEN RETURN false; END IF;
  IF p_iterations IS DISTINCT FROM 100000
    OR NOT public.valid_password_record(p_hash, p_algo, p_iterations, p_salt) THEN
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

CREATE FUNCTION public.rehash_password(
  p_user_id uuid, p_expected_hash text, p_hash text, p_algo text, p_iterations integer, p_salt text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_iterations IS DISTINCT FROM 100000
    OR NOT public.valid_password_record(p_hash, p_algo, p_iterations, p_salt) THEN
    RAISE EXCEPTION 'Invalid password record' USING ERRCODE = '22023';
  END IF;
  -- Worker calls only after successful verification, inside its locked login
  -- transaction. CAS prevents overwriting a concurrent reset or password change.
  -- Rehashing never clears a forced-reset flag or revokes existing sessions.
  UPDATE public.users SET password_hash = p_hash, password_algo = p_algo,
    password_iterations = p_iterations, password_salt = p_salt
    WHERE id = p_user_id AND password_hash = p_expected_hash;
  RETURN FOUND;
END;
$$;

DO $$
DECLARE v_role text; v_func regprocedure;
BEGIN
  FOR v_func IN SELECT p.oid::regprocedure FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[
      'valid_password_record', 'register_user', 'change_password', 'rehash_password'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_func);
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = v_role) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', v_func, v_role);
      END IF;
    END LOOP;
    IF v_func <> 'public.valid_password_record(text,text,integer,text)'::regprocedure THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO lebrands_app', v_func);
    END IF;
  END LOOP;
END;
$$;
