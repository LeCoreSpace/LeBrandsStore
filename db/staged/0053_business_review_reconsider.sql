-- Explicitly staged. Opening Review again is read-only; only recording a new
-- manual decision changes verification or queues an email through 0052.
DO $$ BEGIN
 IF NOT coalesce((SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user),false)
 OR to_regprocedure('public.business_review_notify()') IS NULL
 OR to_regprocedure('public.business_review_decide(text,uuid,integer,text,text,boolean)') IS NULL THEN
  RAISE EXCEPTION 'Administrative migration connection and post-publication review foundations required';
 END IF;
END $$;

-- Keep the original decision function and its approved-state guard unchanged.
-- This explicit path only accepts the approved revision the reviewer examined.
CREATE FUNCTION public.business_review_reconsider(p_token text,p_store uuid,p_revision integer,p_decision text,p_note text,p_manual boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; v public.store_business_verifications%ROWTYPE; country text;
BEGIN
 actor:=public.business_review_target(p_token,p_store);
 SELECT * INTO v FROM public.store_business_verifications WHERE store_id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found' USING ERRCODE='P0002'; END IF;
 IF p_revision IS DISTINCT FROM v.revision OR v.status IS DISTINCT FROM 'approved' THEN
  RAISE EXCEPTION 'Submission changed. Reload and review the latest version.' USING ERRCODE='40001';
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
  'manual_review',true,'review_again',true,'reviewed_submission',to_jsonb(v)-'feedback'));
 RETURN v.revision+1;
END $$;
REVOKE ALL ON FUNCTION public.business_review_reconsider(text,uuid,integer,text,text,boolean)
 FROM PUBLIC,lebrands_app,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.business_review_reconsider(text,uuid,integer,text,text,boolean) TO lebrands_app;
