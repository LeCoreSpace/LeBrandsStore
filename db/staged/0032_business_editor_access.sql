-- Seeding every existing tenant must not run through an RLS-filtered app role.
DO $$
BEGIN
  IF NOT COALESCE((SELECT rolsuper OR rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user),false) THEN
    RAISE EXCEPTION 'Run this migration using an administrative BYPASSRLS connection, never the application connection.';
  END IF;
END $$;
-- Phase 3. Existing stores are explicitly assigned India at the user's request.
-- This does NOT verify accounts, GSTINs or documents and does not rewrite invoices.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.schema_migrations WHERE filename='0031_business_documents.sql') THEN
   RAISE EXCEPTION 'Apply business documents migration before editor access';
 END IF;
END $$;
CREATE TABLE public.store_business_access (
 store_id uuid PRIMARY KEY REFERENCES public.stores(store_id),
 business_country text CHECK (business_country ~ '^[A-Z]{2}$'),
 revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
 source text NOT NULL CHECK (source IN ('existing_india','new_store','merchant')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.store_business_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_business_access FROM PUBLIC,lebrands_app,anon,authenticated,service_role;
INSERT INTO public.store_business_access(store_id,business_country,source)
SELECT store_id,'IN','existing_india' FROM public.stores;

CREATE FUNCTION public.business_access_new_store() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO public.store_business_access(store_id,business_country,source)
 VALUES(NEW.store_id,NULL,'new_store');
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.business_access_new_store() FROM PUBLIC,lebrands_app,anon,authenticated,service_role;
CREATE TRIGGER business_access_new_store AFTER INSERT ON public.stores
 FOR EACH ROW EXECUTE FUNCTION public.business_access_new_store();

CREATE FUNCTION public.business_editor_access(p_store uuid,p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public.store_business_access%ROWTYPE; v public.store_business_verifications%ROWTYPE;
 s jsonb; reason text; gst_ok boolean:=false; document_ok boolean:=false;
BEGIN
 IF NOT public.authorize_store_session(p_token,p_store)
 THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.store_business_access WHERE store_id=p_store;
 SELECT * INTO v FROM public.store_business_verifications WHERE store_id=p_store;
 SELECT settings INTO s FROM public.store_setup WHERE store_id=p_store;
 IF a.store_id IS NULL THEN
   reason:='setup_required';
 ELSIF a.business_country IS NULL THEN
   reason:='country_required';
 ELSE
   IF a.business_country='IN' THEN
     SELECT coalesce(s->>'gstin_invoice_identity_locked','false')='true'
       AND coalesce((SELECT g.state='verified' FROM public.store_gstin_verifications g
         WHERE g.store_id=p_store AND g.gstin=s->>'gstin'
         ORDER BY g.created_at DESC,g.id DESC LIMIT 1),false) INTO gst_ok;
   END IF;
   SELECT EXISTS(SELECT 1 FROM public.store_business_documents d WHERE d.store_id=p_store
     AND d.submission_version=v.submission_version AND d.scan_status='clean') INTO document_ok;
   IF a.business_country='IN' AND NOT gst_ok THEN reason:='gst_required';
   ELSIF v.store_id IS NULL OR v.country_code IS DISTINCT FROM a.business_country THEN reason:='documents_required';
   ELSIF v.status='changes_requested' THEN reason:='changes_requested';
   ELSIF v.registration_type='not_registered' AND v.status<>'approved' THEN reason:='exception_review_required';
   ELSIF (v.registration_type='not_registered' AND a.business_country<>'IN' AND v.status='approved')
     OR (v.status IN ('pending_review','approved') AND document_ok
       AND (a.business_country<>'IN' OR v.registration_type='gst_registered'))
     THEN reason:='ready';
   ELSE reason:='documents_required';
   END IF;
 END IF;
 RETURN jsonb_build_object('available',true,'enforced',true,'allowed',reason='ready',
   'reason',reason,'business_country',a.business_country,'revision',coalesce(a.revision,0),
   'gst_required',a.business_country='IN','status',v.status,
   'country_locked',v.store_id IS NOT NULL OR coalesce(s->>'gstin_invoice_identity_locked','false')='true');
END $$;

CREATE FUNCTION public.business_set_country(p_store uuid,p_token text,p_country text,p_revision integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public.store_business_access%ROWTYPE; s jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sessions se JOIN public.users u ON u.id=se.user_id
   JOIN public.store_members m ON m.user_id=u.id AND m.store_id=p_store AND m.role IN ('owner','admin')
   WHERE se.token_hash=p_token AND se.revoked_at IS NULL AND se.expires_at>now() AND NOT u.must_change_password)
 THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_country IS NULL OR p_country !~ '^[A-Z]{2}$'
 THEN RAISE EXCEPTION 'Choose a business country' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.stores WHERE store_id=p_store FOR UPDATE;
 SELECT * INTO a FROM public.store_business_access WHERE store_id=p_store FOR UPDATE;
 IF a.store_id IS NULL OR a.revision IS DISTINCT FROM p_revision
 THEN RAISE EXCEPTION 'Business country changed; reload before continuing' USING ERRCODE='40001'; END IF;
 SELECT settings INTO s FROM public.store_setup WHERE store_id=p_store;
 IF a.business_country IS DISTINCT FROM p_country AND
   (EXISTS(SELECT 1 FROM public.store_business_verifications WHERE store_id=p_store)
    OR coalesce(s->>'gstin_invoice_identity_locked','false')='true')
 THEN RAISE EXCEPTION 'Business country is locked by submitted evidence or the confirmed invoice identity' USING ERRCODE='22023'; END IF;
 UPDATE public.store_business_access SET business_country=p_country,revision=revision+1,source='merchant',updated_at=now()
 WHERE store_id=p_store;
END $$;

CREATE FUNCTION public.business_document_country_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.store_business_access a
   WHERE a.store_id=NEW.store_id AND a.business_country=NEW.country_code)
 THEN RAISE EXCEPTION 'Confirm the business country in Ann before submitting evidence' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.business_document_country_guard() FROM PUBLIC,lebrands_app,anon,authenticated,service_role;
CREATE TRIGGER business_document_country_guard BEFORE INSERT OR UPDATE OF country_code
 ON public.store_business_verifications FOR EACH ROW EXECUTE FUNCTION public.business_document_country_guard();
REVOKE ALL ON FUNCTION public.business_editor_access(uuid,text),public.business_set_country(uuid,text,text,integer)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.business_editor_access(uuid,text),public.business_set_country(uuid,text,text,integer) TO lebrands_app;
