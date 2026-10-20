-- Explicitly staged: pending manual review may publish, but tax/billing
-- approval, country, clean-file, revocation and suspension checks stay separate.
DO $$ BEGIN
 IF NOT coalesce((SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user),false)
 OR to_regprocedure('public.business_review_decide(text,uuid,integer,text,text,boolean)') IS NULL
 OR to_regprocedure('public.billing_start_free_on_publication()') IS NULL
 OR to_regprocedure('public.email_pending_stores()') IS NULL THEN
  RAISE EXCEPTION 'Administrative migration connection and review, billing and email foundations required';
 END IF;
END $$;

CREATE FUNCTION public.business_publication_ready(p_store uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_store::text IS DISTINCT FROM current_setting('app.store_id',true) THEN
  RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';
 END IF;
 RETURN EXISTS(SELECT 1 FROM public.store_business_verifications v
 JOIN public.store_business_access a ON a.store_id=v.store_id AND a.business_country=v.country_code
 WHERE v.store_id=p_store AND v.status IN('pending_review','approved')
 AND ((v.registration_type='not_registered' AND v.country_code<>'IN' AND length(coalesce(v.explanation,''))>=30)
 OR (v.registration_type<>'not_registered' AND EXISTS(SELECT 1 FROM public.store_business_documents d
 WHERE d.store_id=v.store_id AND d.submission_version=v.submission_version AND d.scan_status='clean'))));
END $$;
REVOKE ALL ON FUNCTION public.business_publication_ready(uuid) FROM PUBLIC,lebrands_app,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.business_publication_ready(uuid) TO lebrands_app;

-- Keep country/GST and correction recovery intact. A valid non-Indian
-- registration explanation is now reviewable after publication too.
CREATE OR REPLACE FUNCTION public.business_editor_access(p_store uuid,p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public.store_business_access%ROWTYPE; v public.store_business_verifications%ROWTYPE;
 s jsonb; reason text; gst_ok boolean:=false; document_ok boolean:=false;
BEGIN
 IF NOT public.authorize_store_session(p_token,p_store)
 THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.store_business_access WHERE store_id=p_store;
 SELECT * INTO v FROM public.store_business_verifications WHERE store_id=p_store;
 SELECT settings INTO s FROM public.store_setup WHERE store_id=p_store;
 IF a.store_id IS NULL THEN reason:='setup_required';
 ELSIF a.business_country IS NULL THEN reason:='country_required';
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
  ELSIF v.status IN('pending_review','approved')
   AND ((v.registration_type='not_registered' AND a.business_country<>'IN' AND length(coalesce(v.explanation,''))>=30)
   OR (v.registration_type<>'not_registered' AND document_ok
    AND (a.business_country<>'IN' OR v.registration_type='gst_registered'))) THEN reason:='ready';
  ELSE reason:='documents_required';
  END IF;
 END IF;
 RETURN jsonb_build_object('available',true,'enforced',true,'allowed',reason='ready',
  'reason',reason,'business_country',a.business_country,'revision',coalesce(a.revision,0),
  'gst_required',a.business_country='IN','status',v.status,
  'country_locked',v.store_id IS NOT NULL OR coalesce(s->>'gstin_invoice_identity_locked','false')='true');
END $$;

CREATE OR REPLACE FUNCTION public.business_publication_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE id uuid;
BEGIN
 IF TG_TABLE_NAME='stores' THEN
  IF NEW.status<>'live' THEN RETURN NEW; END IF;
 END IF;
 id:=NEW.store_id;
 PERFORM 1 FROM public.stores WHERE store_id=id FOR UPDATE;
 -- Triggers also protect administrative/raw writes without tenant settings.
 IF NOT EXISTS(SELECT 1 FROM public.store_business_verifications v
 JOIN public.store_business_access a ON a.store_id=v.store_id AND a.business_country=v.country_code
 WHERE v.store_id=id AND v.status IN('pending_review','approved')
 AND ((v.registration_type='not_registered' AND v.country_code<>'IN' AND length(coalesce(v.explanation,''))>=30)
 OR (v.registration_type<>'not_registered' AND EXISTS(SELECT 1 FROM public.store_business_documents d
 WHERE d.store_id=v.store_id AND d.submission_version=v.submission_version AND d.scan_status='clean')))) THEN
  RAISE EXCEPTION 'Submit valid, security-screened business documents before publishing. Correct any review feedback.' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.billing_start_free_on_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE sub_id uuid; started timestamptz;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.stores WHERE store_id=NEW.store_id AND status='live')
 OR NOT EXISTS(SELECT 1 FROM public.store_publications WHERE store_id=NEW.store_id) THEN RETURN NEW; END IF;
 SELECT id INTO sub_id FROM public.billing_subscriptions WHERE store_id=NEW.store_id
 AND billing_interval='free' AND status='building' AND free_live_started_at IS NULL FOR UPDATE;
 IF sub_id IS NULL THEN RETURN NEW; END IF;
 IF public.business_publication_ready(NEW.store_id) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Submit valid business documents before publishing' USING ERRCODE='42501';
 END IF;
 started:=clock_timestamp();
 UPDATE public.billing_subscriptions SET status='trialing',free_live_started_at=started,
 free_expires_at=started+interval '720 hours',revision=revision+1 WHERE id=sub_id;
 INSERT INTO public.billing_subscription_events(store_id,subscription_id,event_key,event_type,safe_details)
 VALUES(NEW.store_id,sub_id,'free_live_started:'||sub_id::text,'free.live_started',
 jsonb_build_object('started_at',started,'expires_at',started+interval '720 hours'));
 RETURN NEW;
END $$;

-- Decision and email intent commit together. The existing durable store-email
-- queue owns retries, leases and provider idempotency. No addresses in queue messages.
CREATE FUNCTION public.business_review_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.reviewed_at IS NULL OR NEW.reviewed_by IS NULL OR NEW.status NOT IN('approved','changes_requested')
 OR (NEW.reviewed_at IS NOT DISTINCT FROM OLD.reviewed_at AND NEW.revision=OLD.revision) THEN RETURN NEW; END IF;
 INSERT INTO public.email_log(store_id,recipient,template,event_key,payload)
 SELECT NEW.store_id,u.email,'business_review',
 'business-review:'||NEW.store_id::text||':'||NEW.revision::text||':'||u.id::text,
 jsonb_build_object('decision',NEW.status,'note',NEW.feedback,'store_name',s.name,'recipient_user_id',u.id)
 FROM public.store_members m JOIN public.users u ON u.id=m.user_id
 JOIN public.stores s ON s.store_id=m.store_id
 WHERE m.store_id=NEW.store_id AND m.role='owner'
 ON CONFLICT(store_id,event_key) WHERE event_key IS NOT NULL DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.business_review_notify() FROM PUBLIC,lebrands_app,anon,authenticated,service_role;
CREATE TRIGGER business_review_notify AFTER UPDATE ON public.store_business_verifications
FOR EACH ROW EXECUTE FUNCTION public.business_review_notify();

CREATE FUNCTION public.business_review_email_allowed(p_store uuid,p_job uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_store::text IS DISTINCT FROM current_setting('app.store_id',true) THEN
  RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';
 END IF;
 RETURN EXISTS(SELECT 1 FROM public.email_log e JOIN public.store_members m ON m.store_id=e.store_id AND m.role='owner'
 JOIN public.users u ON u.id=m.user_id
 WHERE e.store_id=p_store AND e.id=p_job AND e.template='business_review'
 AND e.payload->>'recipient_user_id'=u.id::text AND e.recipient=u.email);
END $$;
REVOKE ALL ON FUNCTION public.business_review_email_allowed(uuid,uuid) FROM PUBLIC,lebrands_app,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.business_review_email_allowed(uuid,uuid) TO lebrands_app;

CREATE OR REPLACE FUNCTION public.email_pending_stores() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT DISTINCT store_id FROM public.email_log
 WHERE template IN('confirmed','new_order','shipped','delivered','cancelled','refunded','invite','business_review')
 AND event_key IS NOT NULL AND attempts<8 AND next_attempt_at<=now()
 AND(status='pending' OR(status='sending' AND lease_until<now())) LIMIT 100
$$;
