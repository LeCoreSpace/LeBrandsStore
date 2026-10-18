-- Retain evidence during onboarding and throughout the brand's subscription.
-- No cancellation/deletion automation or manual-review/publication changes.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
   WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
   RAISE EXCEPTION 'Business retention migration requires administrative BYPASSRLS';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE filename='0031_business_documents.sql') THEN
   RAISE EXCEPTION 'Apply business documents before subscription-duration retention';
 END IF;
END $$;

ALTER TABLE public.store_business_documents
 ADD COLUMN retention_policy text NOT NULL DEFAULT 'subscription_lifetime_v1'
   CHECK(retention_policy='subscription_lifetime_v1'),
 ALTER COLUMN retention_review_at DROP NOT NULL;
COMMENT ON COLUMN public.store_business_documents.retention_review_at IS
 'Legacy review-date history only; not a deletion deadline. New evidence uses subscription_lifetime_v1 without a fixed date.';
COMMENT ON COLUMN public.store_business_documents.retention_policy IS
 'Retain during onboarding and subscription. Cancellation and legal-hold policy is undecided; no automatic deletion.';

CREATE FUNCTION public.business_document_retention_policy()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('key','subscription_lifetime_v1',
   'during_onboarding',true,'during_subscription',true,
   'after_cancellation','not_decided','automatic_deletion',false);
$$;
REVOKE ALL ON FUNCTION public.business_document_retention_policy()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.business_document_retention_policy() TO lebrands_app;

-- Preserve signature/OID for prepared callers in published Workers.
-- p_retention_days remains for compatibility but can no longer set a deadline.
CREATE OR REPLACE FUNCTION public.business_document_submit(
 p_store uuid,p_token text,p_revision integer,p_country text,p_legal_name text,
 p_registration_type text,p_registration_number text,p_explanation text,
 p_document uuid,p_document_type text,p_object_key text,p_filename text,p_mime text,
 p_size integer,p_sha256 text,p_retention_days integer
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid; v_current public.store_business_verifications%ROWTYPE;
 v_requirement public.business_document_requirements%ROWTYPE;
 v_version integer; v_settings jsonb;
BEGIN
 SELECT u.id INTO v_user FROM public.sessions s JOIN public.users u ON u.id=s.user_id
 JOIN public.store_members m ON m.user_id=u.id AND m.store_id=p_store AND m.role IN ('owner','admin')
 WHERE s.token_hash=p_token AND s.revoked_at IS NULL AND s.expires_at>now() AND NOT u.must_change_password;
 IF v_user IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.stores WHERE store_id=p_store FOR UPDATE;
 SELECT * INTO v_current FROM public.store_business_verifications WHERE store_id=p_store FOR UPDATE;
 IF p_revision IS DISTINCT FROM coalesce(v_current.revision,0) OR v_current.status='approved'
 THEN RAISE EXCEPTION 'Submission changed; reload before trying again' USING ERRCODE='40001'; END IF;
 IF p_country !~ '^[A-Z]{2}$' OR p_country IS NULL OR p_legal_name IS NULL OR
   length(btrim(p_legal_name)) NOT BETWEEN 2 AND 160 OR
   p_legal_name ~ '[[:cntrl:]<>]' OR
   (p_registration_number IS NOT NULL AND (length(p_registration_number)>64 OR p_registration_number ~ '[[:cntrl:]<>]')) OR
   (p_explanation IS NOT NULL AND (length(p_explanation)>1000 OR p_explanation ~ '[[:cntrl:]<>]'))
 THEN RAISE EXCEPTION 'Invalid business details' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_requirement FROM public.business_document_requirements
 WHERE current AND country_code=CASE WHEN p_country='IN' THEN 'IN' ELSE '*' END;
 IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_requirement.registration_types) AS t(value) WHERE t.value->>'value'=p_registration_type)
 THEN RAISE EXCEPTION 'Unsupported business document requirement' USING ERRCODE='22023'; END IF;
 IF p_country='IN' THEN
   SELECT settings INTO v_settings FROM public.store_setup WHERE store_id=p_store;
   IF coalesce(v_settings->>'gstin_invoice_identity_locked','false')<>'true' OR
     NOT EXISTS (SELECT 1 FROM public.store_gstin_verifications g WHERE g.store_id=p_store
       AND g.gstin=v_settings->>'gstin' AND g.state='verified' AND g.verified_at IS NOT NULL)
   THEN RAISE EXCEPTION 'Verify GSTIN and confirm the registered address first' USING ERRCODE='22023'; END IF;
   IF p_registration_number IS DISTINCT FROM v_settings->>'gstin'
   THEN RAISE EXCEPTION 'Use the confirmed GSTIN' USING ERRCODE='22023'; END IF;
   IF btrim(p_legal_name) IS DISTINCT FROM v_settings->>'legal_name'
   THEN RAISE EXCEPTION 'Use the confirmed registered business name' USING ERRCODE='22023'; END IF;
 ELSIF p_registration_type<>'not_registered' AND (p_registration_number IS NULL OR length(btrim(p_registration_number))<2) THEN
   RAISE EXCEPTION 'Registration number required' USING ERRCODE='22023';
 END IF;
 IF p_registration_type='not_registered' THEN
   IF NOT v_requirement.allow_exception OR p_explanation IS NULL OR length(btrim(p_explanation))<30 OR p_document IS NOT NULL OR p_object_key IS NOT NULL
   THEN RAISE EXCEPTION 'Explain why registration is not applicable' USING ERRCODE='22023'; END IF;
 ELSE
   IF p_document IS NULL OR p_object_key IS NULL OR p_filename IS NULL OR p_mime IS NULL OR p_size IS NULL OR p_sha256 IS NULL OR
     NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_requirement.document_types) AS t(value) WHERE t.value->>'value'=p_document_type) OR
     p_object_key<>'business-verifications/'||p_store::text||'/'||p_document::text OR
     length(p_filename) NOT BETWEEN 1 AND 150 OR p_filename ~ '[[:cntrl:]<>]' OR
     p_mime NOT IN ('application/pdf','image/jpeg','image/png') OR
     p_size NOT BETWEEN 1 AND 5242880 OR p_sha256 !~ '^[0-9a-f]{64}$'
   THEN RAISE EXCEPTION 'Valid scanned document required' USING ERRCODE='22023'; END IF;
 END IF;
 IF (SELECT count(*) FROM public.store_business_verification_events
   WHERE store_id=p_store AND created_at>now()-interval '1 hour')>=5
 THEN RAISE EXCEPTION 'Too many submissions. Try again later' USING ERRCODE='22023'; END IF;
 v_version:=coalesce(v_current.submission_version,0)+1;
 IF v_current.store_id IS NULL THEN
   INSERT INTO public.store_business_verifications(store_id,country_code,legal_name,registration_type,
     registration_number,explanation,requirement_key,requirement_version,submission_version)
   VALUES(p_store,p_country,btrim(p_legal_name),p_registration_type,nullif(btrim(p_registration_number),''),
     nullif(btrim(p_explanation),''),v_requirement.key,v_requirement.version,v_version);
 ELSE
   UPDATE public.store_business_verifications SET country_code=p_country,legal_name=btrim(p_legal_name),
     registration_type=p_registration_type,registration_number=nullif(btrim(p_registration_number),''),
     explanation=nullif(btrim(p_explanation),''),requirement_key=v_requirement.key,
     requirement_version=v_requirement.version,submission_version=v_version,
     revision=revision+1,status='pending_review',feedback='',submitted_at=now(),updated_at=now()
   WHERE store_id=p_store;
 END IF;
 IF p_document IS NOT NULL THEN
   INSERT INTO public.store_business_documents(id,store_id,submission_version,requirement_key,
     document_type,object_key,filename,mime,size_bytes,sha256,retention_review_at,retention_policy)
   VALUES(p_document,p_store,v_version,v_requirement.key,p_document_type,p_object_key,
     p_filename,p_mime,p_size,p_sha256,NULL,'subscription_lifetime_v1');
 END IF;
 INSERT INTO public.store_business_verification_events(store_id,submission_version,event_type,actor_user_id,submission)
 VALUES(p_store,v_version,CASE WHEN v_version=1 THEN 'submitted' ELSE 'resubmitted' END,v_user,
   jsonb_build_object('country_code',p_country,'legal_name',btrim(p_legal_name),
     'registration_type',p_registration_type,'registration_number',p_registration_number,
     'explanation',p_explanation,'requirement_key',v_requirement.key,
     'requirement_version',v_requirement.version,'document_id',p_document));
 RETURN coalesce(v_current.revision,0)+1;
END $$;
-- CREATE OR REPLACE retains the original grants and function identity.
