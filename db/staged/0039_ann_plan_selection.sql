-- New-store enrolment rollout. Existing stores remain exempt until the
-- separately consented legacy transition. No charges or payment activation.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user
    AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Ann plan selection requires administrative BYPASSRLS';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.schema_migrations WHERE filename='0038_free_subscriptions.sql') THEN
    RAISE EXCEPTION 'Apply and review 0038_free_subscriptions.sql first';
  END IF;
END $$;
ALTER TABLE public.stores ADD COLUMN billing_enrolment_required boolean NOT NULL DEFAULT false;
-- ADD COLUMN materializes false for existing rows; only future stores default true.
ALTER TABLE public.stores ALTER COLUMN billing_enrolment_required SET DEFAULT true;

CREATE FUNCTION public.billing_has_build_plan(p_store uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM public.stores t WHERE t.store_id=p_store AND
    (NOT t.billing_enrolment_required OR EXISTS(
      SELECT 1 FROM public.billing_subscriptions s WHERE s.store_id=t.store_id
        AND ((s.billing_interval='free' AND s.terms_version='free-v1')
          OR (s.billing_interval<>'free' AND s.status IN ('active','grace'))))))
$$;
REVOKE ALL ON FUNCTION public.billing_has_build_plan(uuid) FROM PUBLIC,lebrands_app;

CREATE FUNCTION public.billing_build_access(p_store uuid,p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE required boolean; allowed boolean; confirmed boolean;
BEGIN
  IF p_store IS NULL OR p_store::text IS DISTINCT FROM current_setting('app.store_id',true)
    OR NOT coalesce(public.authorize_store_session(p_token,p_store),false) THEN
    RAISE EXCEPTION 'Store access denied' USING ERRCODE='42501';
  END IF;
  SELECT billing_enrolment_required INTO required FROM public.stores WHERE store_id=p_store;
  allowed:=public.billing_has_build_plan(p_store);
  SELECT coalesce(settings->>'ann_store_name_confirmed','false')='true'
    INTO confirmed FROM public.store_setup WHERE store_id=p_store;
  RETURN jsonb_build_object('available',true,'enforced',required,'allowed',allowed,
    'name_confirmed',coalesce(confirmed,false),
    'reason',CASE WHEN allowed THEN 'allowed' ELSE 'plan_required' END);
END $$;
REVOKE ALL ON FUNCTION public.billing_build_access(uuid,text) FROM PUBLIC,lebrands_app;
GRANT EXECUTE ON FUNCTION public.billing_build_access(uuid,text) TO lebrands_app;

CREATE FUNCTION public.billing_protect_rollout_flag()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF current_user='lebrands_app' THEN
    IF TG_OP='INSERT' THEN NEW.billing_enrolment_required:=true;
    ELSIF NEW.billing_enrolment_required IS DISTINCT FROM OLD.billing_enrolment_required THEN
      RAISE EXCEPTION 'Billing rollout is platform-owned' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.billing_protect_rollout_flag() FROM PUBLIC,lebrands_app;
CREATE TRIGGER billing_protect_rollout_flag BEFORE INSERT OR UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.billing_protect_rollout_flag();

CREATE FUNCTION public.billing_require_build_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_TABLE_NAME='stores' THEN
    IF NEW.status<>'live' THEN RETURN NEW; END IF;
  END IF;
  IF NOT public.billing_has_build_plan(NEW.store_id) THEN
    RAISE EXCEPTION 'Choose and accept a plan in Ann before continuing' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.billing_require_build_plan() FROM PUBLIC,lebrands_app;
CREATE TRIGGER billing_plan_before_ann_save BEFORE INSERT OR UPDATE ON public.ann_builder_sessions
  FOR EACH ROW EXECUTE FUNCTION public.billing_require_build_plan();
CREATE TRIGGER billing_plan_before_publication BEFORE INSERT OR UPDATE ON public.store_publications
  FOR EACH ROW EXECUTE FUNCTION public.billing_require_build_plan();
CREATE TRIGGER billing_plan_before_live BEFORE UPDATE OF status ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.billing_require_build_plan();

-- Free consent must also follow the name-confirmation step when called directly.
CREATE FUNCTION public.billing_require_confirmed_name()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.stores WHERE store_id=NEW.store_id AND billing_enrolment_required)
    AND NOT EXISTS(SELECT 1 FROM public.store_setup WHERE store_id=NEW.store_id
      AND settings->>'ann_store_name_confirmed'='true') THEN
    RAISE EXCEPTION 'Confirm your store name in Ann first' USING ERRCODE='PBF04';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.billing_require_confirmed_name() FROM PUBLIC,lebrands_app;
CREATE TRIGGER billing_plan_after_name BEFORE INSERT ON public.billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.billing_require_confirmed_name();

DO $$ DECLARE r text; f text; BEGIN
  FOR r IN SELECT rolname FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role')
  LOOP
    FOREACH f IN ARRAY ARRAY['billing_has_build_plan(uuid)','billing_build_access(uuid,text)',
      'billing_protect_rollout_flag()','billing_require_build_plan()','billing_require_confirmed_name()']
    LOOP EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM %I',f,r); END LOOP;
  END LOOP;
END $$;
