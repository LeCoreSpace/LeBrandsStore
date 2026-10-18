-- Deploy the restricted review routes before applying this staged migration.
-- No reviewer is auto-enrolled; no store is auto-approved, unpublished or resumed.
DO $$ BEGIN
 IF NOT coalesce((SELECT rolsuper OR rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user),false) THEN
  RAISE EXCEPTION 'Administrative BYPASSRLS connection required';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.schema_migrations WHERE filename='0034_business_document_scanning.sql')
 OR NOT EXISTS(SELECT 1 FROM public.schema_migrations WHERE filename='0032_business_editor_access.sql') THEN
  RAISE EXCEPTION 'Apply business editor access and private document scanning migrations first';
 END IF;
END $$;

CREATE TABLE public.platform_business_reviewers (
 user_id uuid PRIMARY KEY REFERENCES public.users(id),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_business_reviewers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_business_reviewers FROM PUBLIC,lebrands_app,anon,authenticated,service_role;
ALTER TABLE public.store_business_verifications
 ADD COLUMN reviewed_at timestamptz,
 ADD COLUMN reviewed_by uuid REFERENCES public.users(id);
CREATE INDEX business_review_queue ON public.store_business_verifications(status,submitted_at,store_id);
CREATE FUNCTION public.business_review_reset() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.submission_version IS DISTINCT FROM OLD.submission_version THEN
  NEW.reviewed_at:=NULL; NEW.reviewed_by:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.business_review_reset() FROM PUBLIC,lebrands_app,anon,authenticated,service_role;
CREATE TRIGGER business_review_reset BEFORE UPDATE ON public.store_business_verifications
 FOR EACH ROW EXECUTE FUNCTION public.business_review_reset();

CREATE FUNCTION public.business_review_actor(p_token text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 SELECT u.id INTO actor FROM public.sessions s JOIN public.users u ON u.id=s.user_id
 JOIN public.platform_business_reviewers r ON r.user_id=u.id AND r.active
 WHERE s.token_hash=p_token AND s.revoked_at IS NULL AND s.expires_at>now()
 AND NOT u.must_change_password FOR SHARE OF s,u,r;
 IF actor IS NULL THEN RAISE EXCEPTION 'Platform reviewer access required' USING ERRCODE='42501'; END IF;
 RETURN actor;
END $$;
CREATE FUNCTION public.business_review_access(p_token text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN PERFORM public.business_review_actor(p_token); RETURN true; END $$;

CREATE FUNCTION public.business_review_target(p_token text,p_store uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 actor:=public.business_review_actor(p_token);
 PERFORM 1 FROM public.stores WHERE store_id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM public.store_members WHERE store_id=p_store AND user_id=actor) THEN
  RAISE EXCEPTION 'Reviewers cannot review an affiliated store' USING ERRCODE='42501';
 END IF;
 RETURN actor;
END $$;

CREATE FUNCTION public.business_review_queue(p_token text,p_status text,p_offset integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; rows_json jsonb; more boolean;
BEGIN
 actor:=public.business_review_actor(p_token);
 IF p_status IS NULL OR p_status NOT IN('pending_review','changes_requested','approved','all')
 OR p_offset IS NULL OR p_offset<0 OR p_offset>30000 THEN
  RAISE EXCEPTION 'Invalid queue filter' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) INTO rows_json FROM (
  SELECT v.store_id,s.name AS store_name,v.country_code,v.legal_name,v.status,v.revision,v.submission_version,v.submitted_at
  FROM public.store_business_verifications v JOIN public.stores s ON s.store_id=v.store_id
  WHERE (p_status='all' OR v.status=p_status)
  AND NOT EXISTS(SELECT 1 FROM public.store_members m WHERE m.store_id=v.store_id AND m.user_id=actor)
  ORDER BY v.submitted_at,v.store_id LIMIT 30 OFFSET p_offset
 ) q;
 SELECT EXISTS(SELECT 1 FROM public.store_business_verifications v
  WHERE (p_status='all' OR v.status=p_status)
  AND NOT EXISTS(SELECT 1 FROM public.store_members m WHERE m.store_id=v.store_id AND m.user_id=actor)
  ORDER BY v.submitted_at,v.store_id LIMIT 1 OFFSET p_offset+30) INTO more;
 RETURN jsonb_build_object('rows',rows_json,'has_more',more);
END $$;

CREATE FUNCTION public.business_review_detail(p_token text,p_store uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v public.store_business_verifications%ROWTYPE; docs jsonb; events jsonb; store_json jsonb;
BEGIN
 PERFORM public.business_review_target(p_token,p_store);
 SELECT * INTO v FROM public.store_business_verifications WHERE store_id=p_store FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found' USING ERRCODE='P0002'; END IF;
 SELECT jsonb_build_object('store_id',store_id,'name',name,'status',status) INTO store_json
 FROM public.stores WHERE store_id=p_store;
 SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) INTO docs FROM (
  SELECT id,filename,document_type,mime,size_bytes,scan_status,submission_version,uploaded_at
  FROM public.store_business_documents WHERE store_id=p_store
  ORDER BY submission_version DESC,uploaded_at DESC LIMIT 100
 ) d;
 SELECT coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) INTO events FROM (
  SELECT e.id,e.event_type,e.submission_version,u.name AS actor_name,e.created_at,e.submission
  FROM public.store_business_verification_events e LEFT JOIN public.users u ON u.id=e.actor_user_id
  WHERE e.store_id=p_store ORDER BY e.id DESC LIMIT 100
 ) e;
 RETURN jsonb_build_object('store',store_json,'verification',to_jsonb(v),
  'documents',docs,'events',events);
END $$;

CREATE FUNCTION public.business_review_document(p_token text,p_store uuid,p_document uuid)
RETURNS TABLE(object_key text,mime text,size_bytes integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM public.business_review_target(p_token,p_store);
 RETURN QUERY SELECT d.object_key,d.mime,d.size_bytes FROM public.store_business_documents d
 WHERE d.store_id=p_store AND d.id=p_document AND d.scan_status='clean';
END $$;

CREATE FUNCTION public.business_review_decide(p_token text,p_store uuid,p_revision integer,p_decision text,p_note text,p_manual boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; v public.store_business_verifications%ROWTYPE; country text;
BEGIN
 actor:=public.business_review_target(p_token,p_store);
 SELECT * INTO v FROM public.store_business_verifications WHERE store_id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found' USING ERRCODE='P0002'; END IF;
 IF p_revision IS DISTINCT FROM v.revision OR v.status='approved' THEN
  RAISE EXCEPTION 'Submission changed or is already approved. Reload and review the latest version.' USING ERRCODE='40001';
 END IF;
 IF p_manual IS DISTINCT FROM true OR p_decision IS NULL OR p_decision NOT IN('approved','changes_requested')
 OR p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 10 AND 1000 THEN
  RAISE EXCEPTION 'Confirm manual review and enter a decision note of 10 to 1000 characters' USING ERRCODE='22023';
 END IF;
 SELECT business_country INTO country FROM public.store_business_access WHERE store_id=p_store;
 IF p_decision='approved' THEN
  IF country IS DISTINCT FROM v.country_code THEN
   RAISE EXCEPTION 'Confirm the business country before approval' USING ERRCODE='22023';
  END IF;
  IF v.registration_type='not_registered' THEN
   IF length(coalesce(v.explanation,''))<30 THEN
    RAISE EXCEPTION 'Registration exception needs supporting explanation' USING ERRCODE='22023';
   END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM public.store_business_documents
    WHERE store_id=p_store AND submission_version=v.submission_version AND scan_status='clean') THEN
   RAISE EXCEPTION 'Current submission needs a security-screened document' USING ERRCODE='22023';
  END IF;
 END IF;
 UPDATE public.store_business_verifications SET status=p_decision,feedback=btrim(p_note),
  reviewed_at=now(),reviewed_by=actor,revision=revision+1,updated_at=now() WHERE store_id=p_store;
 INSERT INTO public.store_business_verification_events(store_id,submission_version,event_type,actor_user_id,submission)
 VALUES(p_store,v.submission_version,p_decision,actor,jsonb_build_object(
  'revision_before',v.revision,'revision_after',v.revision+1,'note',btrim(p_note),
  'manual_review',true,'reviewed_submission',to_jsonb(v)-'feedback'));
 RETURN v.revision+1;
END $$;

CREATE FUNCTION public.business_review_history_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Business review history is append only' USING ERRCODE='42501'; END $$;
CREATE TRIGGER business_review_history_guard BEFORE UPDATE OR DELETE ON public.store_business_verification_events
 FOR EACH ROW EXECUTE FUNCTION public.business_review_history_guard();

CREATE FUNCTION public.business_publication_access(p_store uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_store::text IS DISTINCT FROM current_setting('app.store_id',true) THEN
  RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';
 END IF;
 RETURN EXISTS(SELECT 1 FROM public.store_business_verifications v
  JOIN public.store_business_access a ON a.store_id=v.store_id AND a.business_country=v.country_code
  WHERE v.store_id=p_store AND v.status='approved');
END $$;

CREATE FUNCTION public.business_publication_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE id uuid;
BEGIN
 IF TG_TABLE_NAME='stores' THEN
  IF NEW.status<>'live' THEN RETURN NEW; END IF;
 END IF;
 id:=NEW.store_id;
 PERFORM 1 FROM public.stores WHERE store_id=id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.store_business_verifications v
   JOIN public.store_business_access a ON a.store_id=v.store_id AND a.business_country=v.country_code
   WHERE v.store_id=id AND v.status='approved') THEN
  RAISE EXCEPTION 'Business documents must be approved before publishing' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER business_publication_guard BEFORE INSERT OR UPDATE ON public.store_publications
 FOR EACH ROW EXECUTE FUNCTION public.business_publication_guard();
CREATE TRIGGER business_publication_status_guard BEFORE INSERT OR UPDATE OF status ON public.stores
 FOR EACH ROW EXECUTE FUNCTION public.business_publication_guard();

-- Replace the obsolete first-publication approval requirement with document
-- review. Preserve callable identity and metadata protection; never clear a
-- legacy suspension/revocation when business evidence is approved.
CREATE OR REPLACE FUNCTION public.guard_store_approval() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_user<>'postgres' THEN
  IF TG_OP='INSERT' THEN
   IF NEW.approved_at IS NOT NULL OR NEW.approved_by IS NOT NULL OR NEW.approval_note IS NOT NULL
    OR NEW.approval_revoked_at IS NOT NULL OR NEW.approval_revocation_note IS NOT NULL THEN
    RAISE EXCEPTION 'Only platform reviewers can change approval' USING ERRCODE='42501';
   END IF;
  ELSIF NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
   OR NEW.approval_note IS DISTINCT FROM OLD.approval_note OR NEW.approval_revoked_at IS DISTINCT FROM OLD.approval_revoked_at
   OR NEW.approval_revocation_note IS DISTINCT FROM OLD.approval_revocation_note THEN
   RAISE EXCEPTION 'Only platform reviewers can change approval' USING ERRCODE='42501';
  END IF;
 END IF;
 IF NEW.status='live' AND NEW.approval_revoked_at IS NOT NULL THEN
  RAISE EXCEPTION 'Store approval is revoked. Separate reinstatement is required.' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;

DO $$ DECLARE f text; BEGIN
 FOREACH f IN ARRAY ARRAY[
 'business_review_actor(text)','business_review_access(text)','business_review_target(text,uuid)',
 'business_review_queue(text,text,integer)','business_review_detail(text,uuid)',
 'business_review_document(text,uuid,uuid)','business_review_decide(text,uuid,integer,text,text,boolean)',
 'business_review_history_guard()','business_publication_access(uuid)','business_publication_guard()'] LOOP
  EXECUTE 'ALTER FUNCTION public.'||f||' OWNER TO postgres';
  EXECUTE 'REVOKE ALL ON FUNCTION public.'||f||' FROM PUBLIC,lebrands_app,anon,authenticated,service_role';
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.business_review_access(text),public.business_review_queue(text,text,integer),
 public.business_review_detail(text,uuid),public.business_review_document(text,uuid,uuid),
 public.business_review_decide(text,uuid,integer,text,text,boolean),public.business_publication_access(uuid) TO lebrands_app;
