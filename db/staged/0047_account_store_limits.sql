-- Two owned stores per account, at most one live. Existing excess live stores
-- are retained until their owner makes an explicit selection.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.schema_migrations WHERE filename='0039_ann_plan_selection.sql') THEN
  RAISE EXCEPTION 'Apply 0039_ann_plan_selection.sql first';
 END IF;
END $$;

CREATE FUNCTION public.account_store_limit_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.role<>'owner' THEN RETURN NEW; END IF;
 PERFORM 1 FROM public.users WHERE id=NEW.user_id FOR UPDATE;
 IF (SELECT count(*) FROM public.store_members WHERE user_id=NEW.user_id
   AND role='owner' AND store_id<>NEW.store_id)>=2 THEN
  RAISE EXCEPTION 'Your account can own two stores: one live store and one draft.' USING ERRCODE='PSL01';
 END IF;
 IF EXISTS(SELECT 1 FROM public.stores WHERE store_id=NEW.store_id AND status='live')
  AND EXISTS(SELECT 1 FROM public.store_members m JOIN public.stores s USING(store_id)
   WHERE m.user_id=NEW.user_id AND m.role='owner' AND m.store_id<>NEW.store_id AND s.status='live') THEN
  RAISE EXCEPTION 'Only one owned store can be live. Move the other store to draft first.' USING ERRCODE='PSL02';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.account_store_limit_guard() FROM PUBLIC,lebrands_app;
CREATE TRIGGER account_store_limit_before_owner BEFORE INSERT OR UPDATE OF user_id,role,store_id
 ON public.store_members FOR EACH ROW EXECUTE FUNCTION public.account_store_limit_guard();

CREATE FUNCTION public.account_live_store_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 IF NEW.status<>'live' THEN RETURN NEW; END IF;
 FOR actor IN SELECT user_id FROM public.store_members WHERE store_id=NEW.store_id AND role='owner' ORDER BY user_id LOOP
  PERFORM 1 FROM public.users WHERE id=actor FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.store_members m JOIN public.stores s USING(store_id)
   WHERE m.user_id=actor AND m.role='owner' AND m.store_id<>NEW.store_id AND s.status='live') THEN
   RAISE EXCEPTION 'Only one owned store can be live. Choose which store to keep live on your account page.' USING ERRCODE='PSL02';
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.account_live_store_guard() FROM PUBLIC,lebrands_app;
CREATE TRIGGER account_one_live_store BEFORE INSERT OR UPDATE OF status ON public.stores
 FOR EACH ROW EXECUTE FUNCTION public.account_live_store_guard();

CREATE FUNCTION public.account_choose_live_store(p_token text,p_store uuid,p_confirm boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; changed uuid;
BEGIN
 SELECT s.user_id INTO actor FROM public.sessions s JOIN public.users u ON u.id=s.user_id
 WHERE s.token_hash=p_token AND s.revoked_at IS NULL AND s.expires_at>now() AND NOT u.must_change_password;
 IF actor IS NULL THEN RAISE EXCEPTION 'Account access required' USING ERRCODE='42501'; END IF;
 IF p_confirm IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm that your other live stores will become drafts.' USING ERRCODE='22023'; END IF;
 -- Lock stores in deterministic order before the account lock, matching status
 -- updates which already hold their store row when the publication guard runs.
 PERFORM s.store_id FROM public.stores s JOIN public.store_members m USING(store_id)
  WHERE m.user_id=actor AND m.role='owner' ORDER BY s.store_id FOR UPDATE OF s;
 PERFORM 1 FROM public.users WHERE id=actor FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.store_members m JOIN public.stores s USING(store_id)
   WHERE m.user_id=actor AND m.role='owner' AND m.store_id=p_store AND s.status='live') THEN
  RAISE EXCEPTION 'Choose one of your currently live stores.' USING ERRCODE='42501';
 END IF;
 FOR changed IN UPDATE public.stores s SET status='draft'
  WHERE s.store_id<>p_store AND s.status='live'
   AND EXISTS(SELECT 1 FROM public.store_members m WHERE m.store_id=s.store_id AND m.user_id=actor AND m.role='owner')
  RETURNING s.store_id LOOP
  INSERT INTO public.audit_log(store_id,actor_user_id,action,entity_type,entity_id,metadata)
   VALUES(changed,actor,'account.live_store_selected','store',changed,
    jsonb_build_object('kept_live_store',p_store,'new_status','draft'));
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.account_choose_live_store(text,uuid,boolean) FROM PUBLIC,lebrands_app;
GRANT EXECUTE ON FUNCTION public.account_choose_live_store(text,uuid,boolean) TO lebrands_app;

-- A platform-assigned legacy concession is not a merchant's name-step consent.
-- Only the operator can insert one; APP has no direct subscription INSERT grant.
CREATE OR REPLACE FUNCTION public.billing_require_confirmed_name()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT NEW.legacy_concession
  AND EXISTS(SELECT 1 FROM public.stores WHERE store_id=NEW.store_id AND billing_enrolment_required)
  AND NOT EXISTS(SELECT 1 FROM public.store_setup WHERE store_id=NEW.store_id AND settings->>'ann_store_name_confirmed'='true') THEN
  RAISE EXCEPTION 'Confirm your store name in Ann first' USING ERRCODE='PBF04';
 END IF;
 RETURN NEW;
END $$;

-- Explicit operator-only transition. Never resets an existing Free clock or a
-- live paid subscription, and never fabricates an original publication date.
CREATE FUNCTION public.platform_transition_free(p_store uuid,p_first_publication timestamptz)
RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE actor uuid; country text; account_id uuid; price public.billing_plan_prices%ROWTYPE;
 plan_id uuid; entitlements jsonb; sub_id uuid; result text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Administrative connection required' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.stores WHERE store_id=p_store FOR UPDATE;
 SELECT user_id INTO actor FROM public.store_members WHERE store_id=p_store AND role='owner' ORDER BY created_at,user_id LIMIT 1;
 IF actor IS NULL THEN RETURN 'no_account_owner'; END IF;
 IF EXISTS(SELECT 1 FROM public.billing_subscriptions WHERE store_id=p_store AND billing_interval<>'free'
   AND mode='live' AND status IN ('active','grace','paused')) THEN RETURN 'paid_preserved'; END IF;
 IF EXISTS(SELECT 1 FROM public.billing_subscriptions WHERE store_id=p_store AND billing_interval='free') THEN
  UPDATE public.stores SET billing_enrolment_required=true WHERE store_id=p_store;
  RETURN 'free_preserved';
 END IF;
 IF EXISTS(SELECT 1 FROM public.billing_subscriptions WHERE store_id=p_store AND status IN ('building','trialing','active','grace','paused')) THEN
  RAISE EXCEPTION 'Review the existing non-Free entitlement before transition' USING ERRCODE='22023';
 END IF;
 IF p_first_publication>now() OR (p_first_publication IS NULL AND
   (EXISTS(SELECT 1 FROM public.store_publications WHERE store_id=p_store)
    OR EXISTS(SELECT 1 FROM public.stores WHERE store_id=p_store AND status='live'))) THEN
  RAISE EXCEPTION 'Historical publication evidence required' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(a.business_country,u.country_code) INTO country FROM public.users u
  LEFT JOIN public.store_business_access a ON a.store_id=p_store WHERE u.id=actor;
 SELECT x.* INTO price FROM public.billing_plan_prices x JOIN public.billing_plans p ON p.id=x.plan_id
  WHERE p.code='free' AND p.version=1 AND p.offer_state='offered' AND p.free_live_days=30
   AND x.enabled AND x.country_code=country AND x.billing_interval='free' AND x.price_kind='fixed' AND x.amount_minor=0;
 IF price.id IS NULL THEN RAISE EXCEPTION 'No approved Free offer for the business country' USING ERRCODE='22023'; END IF;
 plan_id:=price.plan_id;
 SELECT jsonb_object_agg(feature_key,jsonb_build_object('included',included,'value',value))
  INTO entitlements FROM public.billing_plan_features WHERE billing_plan_features.plan_id=price.plan_id;
 SELECT id INTO account_id FROM public.billing_accounts WHERE store_id=p_store AND country_code=country FOR UPDATE;
 IF account_id IS NULL THEN
  INSERT INTO public.billing_accounts(store_id,billing_contact_user_id,country_code,legal_name)
   VALUES(p_store,actor,country,NULL) RETURNING id INTO account_id;
 END IF;
 result:=CASE WHEN p_first_publication IS NULL THEN 'building'
  WHEN p_first_publication+interval '720 hours'<=now() THEN 'expired' ELSE 'trialing' END;
 INSERT INTO public.billing_subscriptions(store_id,billing_account_id,plan_id,price_id,country_code,currency,
  billing_interval,mode,status,terms_version,accepted_at,accepted_by,legacy_concession,entitlement_snapshot,
  free_live_started_at,free_expires_at)
 VALUES(p_store,account_id,plan_id,price.id,country,price.currency,'free','none',result,'free-v1',now(),actor,true,entitlements,
  p_first_publication,p_first_publication+interval '720 hours') RETURNING id INTO sub_id;
 INSERT INTO public.billing_subscription_events(store_id,subscription_id,event_key,event_type,safe_details)
  VALUES(p_store,sub_id,'platform_free_transition:'||p_store,'free.platform_assigned',
   jsonb_build_object('source','platform_transition','publication_evidence',p_first_publication,'merchant_acceptance',false));
 UPDATE public.stores SET billing_enrolment_required=true WHERE store_id=p_store;
 RETURN 'free_assigned_'||result;
END $$;
REVOKE ALL ON FUNCTION public.platform_transition_free(uuid,timestamptz) FROM PUBLIC,lebrands_app;
DO $$ DECLARE r text; f text; BEGIN
 FOR r IN SELECT rolname FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  FOREACH f IN ARRAY ARRAY['account_store_limit_guard()','account_live_store_guard()',
   'account_choose_live_store(text,uuid,boolean)','platform_transition_free(uuid,timestamptz)'] LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM %I',f,r);
  END LOOP;
 END LOOP;
END $$;
