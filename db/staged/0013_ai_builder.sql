-- Add a standalone FAQ page without rewriting either applied Aura migration.
ALTER TABLE public.store_pages DROP CONSTRAINT store_pages_page_key_check;
ALTER TABLE public.store_pages ADD CONSTRAINT store_pages_page_key_check CHECK(page_key IN(
 'home','collection','product','about','contact','faq','policy-privacy','policy-terms','policy-shipping',
 'policy-cancellation-refund','policy-contact','policy-pricing','cart','checkout','track','confirmation','404'));
ALTER FUNCTION public.aura_section_schemas() RENAME TO aura_pre_ai_section_schemas;
CREATE FUNCTION public.aura_section_schemas() RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE schemas jsonb:=public.aura_pre_ai_section_schemas(); k text;
BEGIN
 FOREACH k IN ARRAY ARRAY['header','footer','faq'] LOOP
   schemas:=jsonb_set(schemas,ARRAY[k,'pages'],(schemas#>ARRAY[k,'pages'])||'["faq"]'::jsonb);
 END LOOP;
 RETURN schemas;
END;
$$;
REVOKE ALL ON FUNCTION public.aura_section_schemas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aura_section_schemas() TO lebrands_app;
ALTER FUNCTION public.aura_default_layout(text,jsonb) RENAME TO aura_pre_ai_default_layout;
CREATE FUNCTION public.aura_default_layout(p_page text,p_snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_page='faq' THEN
  RETURN jsonb_build_array(public.aura_section('header'),public.aura_section('faq','{"enabled":false}'::jsonb),public.aura_section('footer'));
 END IF;
 RETURN public.aura_pre_ai_default_layout(p_page,p_snapshot);
END;
$$;
REVOKE ALL ON FUNCTION public.aura_default_layout(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aura_default_layout(text,jsonb) TO lebrands_app;
-- MANUAL ONLY. No existing layouts, publications, accounts or products are backfilled.
ALTER TABLE public.users ADD COLUMN email_verified_at timestamptz;
CREATE TABLE public.ai_email_verifications (
  user_id uuid PRIMARY KEY REFERENCES public.users(id), token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
REVOKE ALL ON public.ai_email_verifications FROM PUBLIC,lebrands_app;
CREATE TABLE public.ai_build_allowances (
  store_id uuid PRIMARY KEY REFERENCES public.stores(store_id), extra_builds integer NOT NULL DEFAULT 0 CHECK(extra_builds BETWEEN 0 AND 100),
  reason text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES public.stores(store_id),
  user_id uuid NOT NULL REFERENCES public.users(id), status text NOT NULL DEFAULT 'ready'
    CHECK(status IN('ready','queued','generating','review','failed','ready_to_save','completed','cancelled')),
  brief jsonb NOT NULL CHECK(jsonb_typeof(brief)='object' AND octet_length(brief::text)<=65536),
  plan jsonb NOT NULL CHECK(jsonb_typeof(plan)='array' AND jsonb_array_length(plan) BETWEEN 1 AND 100),
  approved jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(approved)='array'),
  candidate jsonb, cursor integer NOT NULL DEFAULT 0 CHECK(cursor>=0),
  version integer NOT NULL DEFAULT 0 CHECK(version>=0), base_versions jsonb NOT NULL DEFAULT '{}',
  base_updated_at timestamptz, lease_until timestamptz, error text,
  previewed_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), CHECK(cursor<=jsonb_array_length(plan)),
  UNIQUE(store_id,id)
);
CREATE UNIQUE INDEX ai_one_active_job ON public.ai_generation_jobs(store_id)
  WHERE status NOT IN('completed','cancelled');
CREATE TABLE public.ai_usage (
  id uuid PRIMARY KEY, store_id uuid NOT NULL, job_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN('text','image')),
  status text NOT NULL DEFAULT 'reserved' CHECK(status IN('reserved','settled')),
  reserved_usd numeric(12,6) NOT NULL CHECK(reserved_usd>=0),
  cost_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK(cost_usd>=0),
  input_tokens integer NOT NULL DEFAULT 0 CHECK(input_tokens>=0), output_tokens integer NOT NULL DEFAULT 0 CHECK(output_tokens>=0),
  images integer NOT NULL DEFAULT 0 CHECK(images BETWEEN 0 AND 1), cost_estimated boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(store_id,job_id) REFERENCES public.ai_generation_jobs(store_id,id)
);
CREATE TABLE public.ai_platform_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), monthly_cap_usd numeric(12,6) NOT NULL CHECK(monthly_cap_usd>=0)
);
INSERT INTO public.ai_platform_settings(singleton,monthly_cap_usd) VALUES(true,20);
REVOKE ALL ON public.ai_platform_settings FROM PUBLIC,lebrands_app;
ALTER TABLE public.ai_build_allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_build_allowances FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generation_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_allowance_tenant ON public.ai_build_allowances FOR ALL TO lebrands_app
 USING(store_id=NULLIF(current_setting('app.store_id',true),'')::uuid) WITH CHECK(store_id=NULLIF(current_setting('app.store_id',true),'')::uuid);
CREATE POLICY ai_job_tenant ON public.ai_generation_jobs FOR ALL TO lebrands_app
 USING(store_id=NULLIF(current_setting('app.store_id',true),'')::uuid) WITH CHECK(store_id=NULLIF(current_setting('app.store_id',true),'')::uuid);
CREATE POLICY ai_usage_tenant ON public.ai_usage FOR ALL TO lebrands_app
 USING(store_id=NULLIF(current_setting('app.store_id',true),'')::uuid) WITH CHECK(store_id=NULLIF(current_setting('app.store_id',true),'')::uuid);
REVOKE ALL ON public.ai_build_allowances,public.ai_generation_jobs,public.ai_usage FROM PUBLIC,lebrands_app;
GRANT SELECT ON public.ai_build_allowances,public.ai_usage TO lebrands_app;
GRANT SELECT,INSERT,UPDATE ON public.ai_generation_jobs TO lebrands_app;

ALTER TABLE public.media ADD COLUMN ai_generated boolean NOT NULL DEFAULT false,
 ADD COLUMN source_media_id uuid, ADD COLUMN approval_status text NOT NULL DEFAULT 'approved' CHECK(approval_status IN('pending','approved','discarded')),
 ADD CONSTRAINT ai_source_same_store FOREIGN KEY(store_id,source_media_id) REFERENCES public.media(store_id,id),
 ADD CONSTRAINT ai_source_required CHECK(NOT ai_generated OR source_media_id IS NOT NULL);

CREATE FUNCTION public.ai_account_verified(p_hash text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.sessions s JOIN public.users u ON u.id=s.user_id
 WHERE s.token_hash=p_hash AND s.revoked_at IS NULL AND s.expires_at>now()
 AND NOT u.must_change_password AND u.email_verified_at IS NOT NULL)
$$;
CREATE FUNCTION public.ai_issue_verification(p_session text,p_token text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid; address text;
BEGIN
 IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid token' USING ERRCODE='22023'; END IF;
 SELECT u.id,u.email INTO uid,address FROM public.sessions s JOIN public.users u ON u.id=s.user_id
 WHERE s.token_hash=p_session AND s.revoked_at IS NULL AND s.expires_at>now() AND NOT u.must_change_password FOR UPDATE OF u;
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in first' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.ai_email_verifications WHERE user_id=uid AND issued_at>now()-interval '1 minute') THEN
  RAISE EXCEPTION 'Please wait a minute before requesting another verification email' USING ERRCODE='P0001';
 END IF;
 INSERT INTO public.ai_email_verifications(user_id,token_hash,expires_at) VALUES(uid,p_token,now()+interval '30 minutes')
 ON CONFLICT(user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,issued_at=now(),expires_at=EXCLUDED.expires_at;
 RETURN address;
END $$;
CREATE FUNCTION public.ai_confirm_verification(p_token text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid;
BEGIN
 DELETE FROM public.ai_email_verifications WHERE token_hash=p_token AND expires_at>now() RETURNING user_id INTO uid;
 IF uid IS NULL THEN RETURN false; END IF;
 UPDATE public.users SET email_verified_at=now() WHERE id=uid;
 RETURN true;
END $$;
CREATE FUNCTION public.ai_budget_reserve(p_store uuid,p_job uuid,p_operation uuid,p_kind text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cap numeric; used numeric; amount numeric;
BEGIN
 IF p_store IS DISTINCT FROM NULLIF(current_setting('app.store_id',true),'')::uuid THEN
  RAISE EXCEPTION 'Store isolation denied' USING ERRCODE='42501';
 END IF;
 IF p_operation IS NULL OR NOT EXISTS(SELECT 1 FROM public.ai_generation_jobs WHERE store_id=p_store AND id=p_job AND status='generating') THEN
  RAISE EXCEPTION 'Invalid generation operation' USING ERRCODE='22023';
 END IF;
 amount:=CASE p_kind WHEN 'text' THEN 0.20 WHEN 'image' THEN 0.35 ELSE NULL END;
 IF amount IS NULL THEN RAISE EXCEPTION 'Invalid usage kind' USING ERRCODE='22023'; END IF;
 SELECT monthly_cap_usd INTO cap FROM public.ai_platform_settings WHERE singleton FOR UPDATE;
 SELECT COALESCE(sum(CASE WHEN status='reserved' THEN reserved_usd ELSE cost_usd END),0) INTO used
 FROM public.ai_usage WHERE created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 IF used+amount>cap THEN RAISE EXCEPTION 'AI spending limit reached. Please try again later.' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.ai_usage(id,store_id,job_id,kind,reserved_usd) VALUES(p_operation,p_store,p_job,p_kind,amount);
 RETURN p_operation;
END $$;
CREATE FUNCTION public.ai_budget_settle(p_store uuid,p_operation uuid,p_input integer,p_output integer,p_images integer,p_cost numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_store IS DISTINCT FROM NULLIF(current_setting('app.store_id',true),'')::uuid THEN RAISE EXCEPTION 'Store isolation denied' USING ERRCODE='42501'; END IF;
 IF p_input IS NULL OR p_output IS NULL OR p_cost IS NULL OR p_images IS NULL OR p_input<0 OR p_output<0 OR p_images NOT BETWEEN 0 AND 1 OR p_cost<0 THEN
  RAISE EXCEPTION 'Invalid usage' USING ERRCODE='22023';
 END IF;
 PERFORM singleton FROM public.ai_platform_settings WHERE singleton FOR UPDATE;
 UPDATE public.ai_usage SET status='settled',input_tokens=p_input,output_tokens=p_output,images=p_images,cost_usd=p_cost
 WHERE store_id=p_store AND id=p_operation AND status='reserved';
 IF NOT FOUND THEN RAISE EXCEPTION 'Usage already settled or not found' USING ERRCODE='22023'; END IF;
END $$;
CREATE FUNCTION public.ai_global_cap() RETURNS numeric LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT monthly_cap_usd FROM public.ai_platform_settings WHERE singleton
$$;
CREATE FUNCTION public.ai_guard_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE allowance integer; count_done integer;
BEGIN
 IF NEW.store_id IS DISTINCT FROM NULLIF(current_setting('app.store_id',true),'')::uuid THEN RAISE EXCEPTION 'Store isolation denied' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (NEW.store_id<>OLD.store_id OR NEW.user_id<>OLD.user_id OR NEW.brief<>OLD.brief OR NEW.plan<>OLD.plan) THEN
  RAISE EXCEPTION 'Build identity and inputs are immutable' USING ERRCODE='22023';
 END IF;
 IF TG_OP='INSERT' OR (NEW.status='completed' AND OLD.status<>'completed') THEN
  PERFORM store_id FROM public.stores WHERE store_id=NEW.store_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.user_id AND email_verified_at IS NOT NULL AND NOT must_change_password) THEN
   RAISE EXCEPTION 'Verify your email before AI generation' USING ERRCODE='42501';
  END IF;
  SELECT 1+COALESCE((SELECT extra_builds FROM public.ai_build_allowances WHERE store_id=NEW.store_id),0) INTO allowance;
  SELECT count(*) INTO count_done FROM public.ai_generation_jobs WHERE store_id=NEW.store_id AND status='completed' AND id<>NEW.id;
  IF count_done>=allowance THEN RAISE EXCEPTION 'This store has used its completed AI build allowance' USING ERRCODE='P0001'; END IF;
 END IF;
 IF NEW.status='completed' AND (NEW.cursor<>jsonb_array_length(NEW.plan) OR jsonb_array_length(NEW.approved)<>NEW.cursor) THEN
  RAISE EXCEPTION 'Approve every section before saving the build' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ai_job_guard BEFORE INSERT OR UPDATE ON public.ai_generation_jobs FOR EACH ROW EXECUTE FUNCTION public.ai_guard_job();
CREATE FUNCTION public.ai_media_public(p_store uuid,p_key text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.media m WHERE store_id=p_store
 AND (object_key=p_key OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(renditions,'[]'::jsonb)) r
   WHERE r->>'url'='https://media.lebrands.store/'||p_key))
 AND (NOT ai_generated OR approval_status='approved'))
$$;
REVOKE ALL ON FUNCTION public.ai_account_verified(text),public.ai_issue_verification(text,text),
 public.ai_confirm_verification(text),public.ai_budget_reserve(uuid,uuid,uuid,text),
 public.ai_budget_settle(uuid,uuid,integer,integer,integer,numeric),public.ai_global_cap(),
 public.ai_guard_job(),public.ai_media_public(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_account_verified(text),public.ai_issue_verification(text,text),
 public.ai_confirm_verification(text),public.ai_budget_reserve(uuid,uuid,uuid,text),
 public.ai_budget_settle(uuid,uuid,integer,integer,integer,numeric),public.ai_global_cap(),
 public.ai_media_public(uuid,text) TO lebrands_app;
