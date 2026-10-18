-- Phase 2 only. Manual application after 0030. No publication, invoice,
-- subscription or theme-editor access rules are changed by this migration.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
   WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
   RAISE EXCEPTION 'Business document migration requires administrative BYPASSRLS';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE filename='0011_gstin_approval.sql')
    OR NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE filename='0017_ann_launch_setup.sql')
    OR NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE filename='0030_registration_contact.sql') THEN
   RAISE EXCEPTION 'Apply GST, Ann launch and registration contact migrations before business documents';
 END IF;
END $$;

CREATE TABLE public.business_document_requirements (
  key text PRIMARY KEY,
  version integer NOT NULL CHECK (version > 0),
  country_code text NOT NULL CHECK (country_code='*' OR country_code ~ '^[A-Z]{2}$'),
  label text NOT NULL,
  description text NOT NULL,
  registration_types jsonb NOT NULL CHECK (jsonb_typeof(registration_types)='array'),
  document_types jsonb NOT NULL CHECK (jsonb_typeof(document_types)='array'),
  allow_exception boolean NOT NULL,
  current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_code,version)
);
CREATE UNIQUE INDEX business_document_current_country ON public.business_document_requirements(country_code) WHERE current;
INSERT INTO public.business_document_requirements
  (key,version,country_code,label,description,registration_types,document_types,allow_exception)
VALUES
  ('IN-v1',1,'IN','India: GST registration certificate',
   'Submit the GST registration certificate for the verified GSTIN and confirmed registered address.',
   '[{"value":"gst_registered","label":"GST registered"}]'::jsonb,
   '[{"value":"gst_certificate","label":"GST registration certificate"}]'::jsonb,false),
  ('MANUAL-v1',1,'*','Manual business assessment',
   'Country-specific tax requirements have not yet been reviewed. Submit available tax or business registration evidence, or explain why registration is not applicable. This does not confirm tax compliance.',
   '[{"value":"tax_registered","label":"Tax registered"},{"value":"business_registered","label":"Business registered"},{"value":"not_registered","label":"Not registered or not applicable"}]'::jsonb,
   '[{"value":"tax_registration","label":"Tax registration evidence"},{"value":"business_registration","label":"Business registration evidence"}]'::jsonb,true);
REVOKE ALL ON public.business_document_requirements FROM PUBLIC,lebrands_app,anon,authenticated,service_role;

CREATE TABLE public.store_business_verifications (
  store_id uuid PRIMARY KEY REFERENCES public.stores(store_id),
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  legal_name text NOT NULL CHECK (length(legal_name) BETWEEN 2 AND 160),
  registration_type text NOT NULL CHECK (registration_type IN ('gst_registered','tax_registered','business_registered','not_registered')),
  registration_number text,
  explanation text,
  requirement_key text NOT NULL REFERENCES public.business_document_requirements(key),
  requirement_version integer NOT NULL CHECK (requirement_version > 0),
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','changes_requested','approved')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  submission_version integer NOT NULL DEFAULT 1 CHECK (submission_version > 0),
  feedback text NOT NULL DEFAULT '' CHECK (length(feedback) <= 1000),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.store_business_documents (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  submission_version integer NOT NULL CHECK (submission_version > 0),
  requirement_key text NOT NULL REFERENCES public.business_document_requirements(key),
  document_type text NOT NULL CHECK (document_type IN ('gst_certificate','tax_registration','business_registration')),
  object_key text NOT NULL UNIQUE CHECK (object_key ~ '^business-verifications/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 150),
  mime text NOT NULL CHECK (mime IN ('application/pdf','image/jpeg','image/png')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  scan_status text NOT NULL DEFAULT 'clean' CHECK (scan_status='clean'),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  retention_review_at timestamptz NOT NULL,
  UNIQUE(store_id,submission_version)
);
CREATE TABLE public.store_business_verification_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  submission_version integer NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('submitted','resubmitted','changes_requested','approved')),
  actor_user_id uuid REFERENCES public.users(id),
  submission jsonb NOT NULL CHECK (jsonb_typeof(submission)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX store_business_documents_tenant ON public.store_business_documents(store_id,submission_version);
CREATE INDEX store_business_events_tenant ON public.store_business_verification_events(store_id,created_at);
ALTER TABLE public.store_business_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_business_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_business_verification_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_business_verifications,public.store_business_documents,public.store_business_verification_events FROM PUBLIC,lebrands_app,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.store_business_verification_events_id_seq FROM PUBLIC,lebrands_app,anon,authenticated,service_role;

-- Only owner/admin members with a live session can read private submission
-- metadata; the object key never appears in this response.
CREATE FUNCTION public.business_document_state(p_store uuid,p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid; v_record jsonb; v_documents jsonb; v_account_country text;
BEGIN
 SELECT u.id,u.country_code INTO v_user,v_account_country FROM public.sessions s
 JOIN public.users u ON u.id=s.user_id
 JOIN public.store_members m ON m.user_id=u.id AND m.store_id=p_store AND m.role IN ('owner','admin')
 WHERE s.token_hash=p_token AND s.revoked_at IS NULL AND s.expires_at>now() AND NOT u.must_change_password;
 IF v_user IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 SELECT to_jsonb(v) INTO v_record FROM public.store_business_verifications v WHERE v.store_id=p_store;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',d.id,'filename',d.filename,'document_type',d.document_type,'mime',d.mime,
   'size',d.size_bytes,'scan_status',d.scan_status,'uploaded_at',d.uploaded_at)
   ORDER BY d.uploaded_at), '[]'::jsonb) INTO v_documents
 FROM public.store_business_documents d
 JOIN public.store_business_verifications v ON v.store_id=d.store_id AND v.submission_version=d.submission_version
 WHERE d.store_id=p_store;
 RETURN jsonb_build_object(
   'account_country',v_account_country,
   'requirements',(SELECT coalesce(jsonb_agg(jsonb_build_object(
     'key',r.key,'version',r.version,'country_code',r.country_code,'label',r.label,
     'description',r.description,'registration_types',r.registration_types,
     'document_types',r.document_types,'allow_exception',r.allow_exception)),'[]'::jsonb)
     FROM public.business_document_requirements r WHERE r.current),
   'verification',CASE WHEN v_record IS NULL THEN NULL ELSE
     (v_record - 'requirement_key' - 'requirement_version') || jsonb_build_object('documents',v_documents) END);
END $$;

-- Object keys are available to the Worker only after per-document membership
-- and current-submission checks. They are never included in the JSON API.
CREATE FUNCTION public.business_document_download(p_store uuid,p_token text,p_document uuid)
RETURNS TABLE(object_key text,mime text,size_bytes integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.sessions s JOIN public.users u ON u.id=s.user_id
   JOIN public.store_members m ON m.user_id=u.id AND m.store_id=p_store AND m.role IN ('owner','admin')
   WHERE s.token_hash=p_token AND s.revoked_at IS NULL AND s.expires_at>now() AND NOT u.must_change_password)
 THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT d.object_key,d.mime,d.size_bytes FROM public.store_business_documents d
 JOIN public.store_business_verifications v ON v.store_id=d.store_id AND v.submission_version=d.submission_version
 WHERE d.store_id=p_store AND d.id=p_document AND d.scan_status='clean';
END $$;

-- The sole merchant write path; no direct table grants. Review status cannot
-- be changed here, and a reviewer must use a separate future staff-only path.
CREATE FUNCTION public.business_document_submit(
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
 IF p_retention_days NOT BETWEEN 30 AND 365 OR p_retention_days IS NULL
 THEN RAISE EXCEPTION 'Retention configuration unavailable' USING ERRCODE='22023'; END IF;
 IF p_country !~ '^[A-Z]{2}$' OR p_country IS NULL OR p_legal_name IS NULL OR
    length(btrim(p_legal_name)) NOT BETWEEN 2 AND 160 OR
    p_legal_name ~ '[[:cntrl:]<>]' OR
    (p_registration_number IS NOT NULL AND (length(p_registration_number) > 64 OR p_registration_number ~ '[[:cntrl:]<>]')) OR
    (p_explanation IS NOT NULL AND (length(p_explanation)>1000 OR p_explanation ~ '[[:cntrl:]<>]'))
 THEN RAISE EXCEPTION 'Invalid business details' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_requirement FROM public.business_document_requirements
   WHERE current AND country_code=CASE WHEN p_country='IN' THEN 'IN' ELSE '*' END;
 IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_requirement.registration_types) AS t(value) WHERE t.value->>'value'=p_registration_type)
 THEN RAISE EXCEPTION 'Unsupported business document requirement' USING ERRCODE='22023'; END IF;
 IF p_country='IN' THEN
   SELECT settings INTO v_settings FROM public.store_setup WHERE store_id=p_store;
   IF coalesce(v_settings->>'gstin_invoice_identity_locked','false') <> 'true' OR
      NOT EXISTS (SELECT 1 FROM public.store_gstin_verifications g
        WHERE g.store_id=p_store AND g.gstin=v_settings->>'gstin'
        AND g.state='verified' AND g.verified_at IS NOT NULL)
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
     p_object_key <> 'business-verifications/'||p_store::text||'/'||p_document::text OR
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
     document_type,object_key,filename,mime,size_bytes,sha256,retention_review_at)
   VALUES(p_document,p_store,v_version,v_requirement.key,p_document_type,p_object_key,
     p_filename,p_mime,p_size,p_sha256,now()+make_interval(days=>p_retention_days));
 END IF;
 INSERT INTO public.store_business_verification_events(store_id,submission_version,event_type,actor_user_id,submission)
 VALUES(p_store,v_version,CASE WHEN v_version=1 THEN 'submitted' ELSE 'resubmitted' END,v_user,
   jsonb_build_object('country_code',p_country,'legal_name',btrim(p_legal_name),
     'registration_type',p_registration_type,'registration_number',p_registration_number,
     'explanation',p_explanation,'requirement_key',v_requirement.key,
     'requirement_version',v_requirement.version,'document_id',p_document));
 RETURN coalesce(v_current.revision,0)+1;
END $$;

REVOKE ALL ON FUNCTION public.business_document_state(uuid,text),
  public.business_document_download(uuid,text,uuid),
  public.business_document_submit(uuid,text,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,integer)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.business_document_state(uuid,text),
  public.business_document_download(uuid,text,uuid),
  public.business_document_submit(uuid,text,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,integer)
TO lebrands_app;
