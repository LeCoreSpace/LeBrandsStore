-- Phase 3: owner-consented Free service only. No paid offers, mandates, legacy
-- enrolment, subscription gate on Ann/editor, or scheduled expiry enforcement.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Free subscription migration requires administrative BYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE filename='0037_platform_billing.sql') THEN
    RAISE EXCEPTION 'Apply and review 0037_platform_billing.sql first';
  END IF;
END $$;

-- Free is selected before registration evidence exists. Do not invent a legal
-- name from the brand name or claim a verified invoice identity at this point.
ALTER TABLE public.billing_accounts ALTER COLUMN legal_name DROP NOT NULL;
ALTER TABLE public.billing_accounts ADD COLUMN identity_status text NOT NULL DEFAULT 'unconfirmed'
  CHECK (identity_status IN ('unconfirmed','confirmed'));
ALTER TABLE public.billing_accounts ADD CONSTRAINT billing_confirmed_identity
  CHECK (identity_status<>'confirmed' OR
    (legal_name IS NOT NULL AND length(btrim(legal_name)) BETWEEN 1 AND 240));

-- Only the agreed India Free offer becomes selectable. Paid prices stay off.
UPDATE public.billing_plans SET offer_state='offered' WHERE code='free' AND version=1;
UPDATE public.billing_plan_prices SET enabled=true WHERE plan_id=
  (SELECT id FROM public.billing_plans WHERE code='free' AND version=1)
  AND country_code='IN' AND currency='INR' AND billing_interval='free'
  AND price_kind='fixed' AND amount_minor=0 AND version=1;

CREATE FUNCTION public.billing_require_owner(p_store uuid,p_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
  IF p_store IS NULL OR p_store::text IS DISTINCT FROM current_setting('app.store_id',true)
    OR p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Billing owner access required' USING ERRCODE='42501';
  END IF;
  SELECT u.id INTO actor FROM public.sessions s
    JOIN public.users u ON u.id=s.user_id
    JOIN public.store_members m ON m.user_id=u.id AND m.store_id=p_store
    WHERE s.token_hash=p_token AND s.revoked_at IS NULL AND s.expires_at>now()
      AND NOT u.must_change_password AND m.role='owner'
    FOR SHARE OF s,u,m;
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Billing owner access required' USING ERRCODE='42501';
  END IF;
  -- Enables the existing owner-only billing SELECT policies in this transaction.
  PERFORM set_config('app.account_session_hash',p_token,true);
  RETURN actor;
END $$;
REVOKE ALL ON FUNCTION public.billing_require_owner(uuid,text) FROM PUBLIC,lebrands_app;

CREATE FUNCTION public.billing_free_state(p_store uuid,p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; country text; offer jsonb; selected jsonb; reason text;
  free_exists boolean; current_exists boolean; legacy_store boolean;
BEGIN
  actor:=public.billing_require_owner(p_store,p_token);
  SELECT coalesce(a.business_country,u.country_code) INTO country
    FROM public.users u LEFT JOIN public.store_business_access a ON a.store_id=p_store
    WHERE u.id=actor;
  SELECT EXISTS(SELECT 1 FROM public.billing_subscriptions
    WHERE store_id=p_store AND billing_interval='free') INTO free_exists;
  SELECT EXISTS(SELECT 1 FROM public.billing_subscriptions WHERE store_id=p_store
    AND status IN ('building','trialing','active','grace','paused')) INTO current_exists;
  SELECT status='live' OR EXISTS(SELECT 1 FROM public.store_publications WHERE store_id=p_store)
    INTO legacy_store FROM public.stores WHERE store_id=p_store;
  SELECT jsonb_build_object(
    'id',s.id,'plan',p.code,'plan_version',p.version,'status',s.status,
    'effective_status',CASE WHEN s.billing_interval='free' AND s.free_expires_at<=now()
      AND s.status='trialing' THEN 'expired' ELSE s.status END,
    'country_code',s.country_code,'currency',s.currency,'mode',s.mode,
    'terms_version',s.terms_version,'accepted_at',s.accepted_at,
    'free_live_started_at',s.free_live_started_at,'free_expires_at',s.free_expires_at,
    'remaining_live_seconds',CASE WHEN s.billing_interval<>'free' THEN NULL
      WHEN s.free_live_started_at IS NULL THEN 2592000::bigint
      ELSE greatest(0,ceil(extract(epoch FROM s.free_expires_at-now()))::bigint) END,
    'entitlements',s.entitlement_snapshot,'revision',s.revision
  ) INTO selected FROM public.billing_subscriptions s JOIN public.billing_plans p ON p.id=s.plan_id
    WHERE s.store_id=p_store ORDER BY
      CASE WHEN s.status IN ('building','trialing','active','grace','paused') THEN 0 ELSE 1 END,
      s.created_at DESC,s.id DESC LIMIT 1;
  IF free_exists OR current_exists THEN reason:='already_enrolled';
  ELSIF legacy_store THEN reason:='legacy_transition_required';
  ELSIF country IS NULL THEN reason:='country_required';
  ELSIF country<>'IN' THEN reason:='unsupported_country';
  ELSE
    SELECT jsonb_build_object(
      'plan','free','plan_version',p.version,'price_id',x.id,'country_code',x.country_code,
      'currency',x.currency,'amount_minor',x.amount_minor,'terms_version','free-v1',
      'live_days',p.free_live_days,'timer_starts','first_successful_publication',
      'entitlements',(SELECT jsonb_object_agg(f.feature_key,
        jsonb_build_object('included',f.included,'value',f.value))
        FROM public.billing_plan_features f WHERE f.plan_id=p.id)
    ) INTO offer FROM public.billing_plans p JOIN public.billing_plan_prices x ON x.plan_id=p.id
      WHERE p.code='free' AND p.version=1 AND p.offer_state='offered' AND p.free_live_days=30
        AND x.enabled AND x.country_code=country AND x.currency='INR'
        AND x.billing_interval='free' AND x.price_kind='fixed' AND x.amount_minor=0;
    reason:=CASE WHEN offer IS NULL THEN 'offer_unavailable' ELSE 'available' END;
  END IF;
  RETURN jsonb_build_object('subscription',selected,'free_enrolment_exists',free_exists,
    'can_enrol',reason='available','reason',reason,'country_code',country,
    'offer',offer,'server_time',clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION public.billing_free_state(uuid,text) FROM PUBLIC,lebrands_app;
GRANT EXECUTE ON FUNCTION public.billing_free_state(uuid,text) TO lebrands_app;

CREATE FUNCTION public.billing_activate_free(
  p_store uuid,p_token text,p_price uuid,p_terms text,p_accepted boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; state jsonb; offer jsonb; account_id uuid; selected_price uuid;
  sub_id uuid; plan_id uuid; account_country text;
BEGIN
  actor:=public.billing_require_owner(p_store,p_token);
  IF p_accepted IS DISTINCT FROM true OR p_terms IS DISTINCT FROM 'free-v1' OR p_price IS NULL THEN
    RAISE EXCEPTION 'Explicit Free terms acceptance required' USING ERRCODE='22023';
  END IF;
  -- All new enrolments serialize on the existing tenant row, including direct
  -- calls which do not use the Worker's withMemberStore wrapper.
  PERFORM 1 FROM public.stores WHERE store_id=p_store FOR UPDATE;
  state:=public.billing_free_state(p_store,p_token);
  IF (state->>'free_enrolment_exists')::boolean THEN
    -- Duplicate request is a no-op. Never rewrite consent, revive or reset Free.
    RETURN state;
  END IF;
  IF state->>'reason'='legacy_transition_required' THEN
    RAISE EXCEPTION 'Existing published stores require reviewed transition' USING ERRCODE='PBF02';
  END IF;
  IF (state->>'can_enrol')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Free offer is not available for this store' USING ERRCODE='PBF01';
  END IF;
  offer:=state->'offer';
  selected_price:=(offer->>'price_id')::uuid;
  IF selected_price IS DISTINCT FROM p_price THEN
    RAISE EXCEPTION 'Reload the current Free offer' USING ERRCODE='PBF03';
  END IF;
  -- Lock both catalogue authorities until the acceptance transaction commits.
  SELECT p.id INTO plan_id FROM public.billing_plan_prices x
    JOIN public.billing_plans p ON p.id=x.plan_id
    WHERE x.id=selected_price AND x.enabled AND x.amount_minor=0
      AND p.offer_state='offered' FOR SHARE OF p,x;
  IF plan_id IS NULL THEN
    RAISE EXCEPTION 'Free offer is not available for this store' USING ERRCODE='PBF01';
  END IF;
  SELECT id,country_code INTO account_id,account_country FROM public.billing_accounts
    WHERE store_id=p_store FOR UPDATE;
  IF account_id IS NOT NULL AND account_country IS DISTINCT FROM offer->>'country_code' THEN
    RAISE EXCEPTION 'Billing country requires review' USING ERRCODE='PBF01';
  END IF;
  IF account_id IS NULL THEN
    INSERT INTO public.billing_accounts(store_id,billing_contact_user_id,country_code,legal_name)
      VALUES(p_store,actor,offer->>'country_code',NULL) RETURNING id INTO account_id;
  END IF;
  INSERT INTO public.billing_subscriptions
    (store_id,billing_account_id,plan_id,price_id,country_code,currency,billing_interval,
     mode,status,terms_version,accepted_at,accepted_by,entitlement_snapshot)
  VALUES(p_store,account_id,plan_id,selected_price,offer->>'country_code','INR','free',
    'none','building',p_terms,clock_timestamp(),actor,offer->'entitlements')
  RETURNING id INTO sub_id;
  INSERT INTO public.billing_subscription_events
    (store_id,subscription_id,event_key,event_type,actor_user_id,safe_details)
  VALUES(p_store,sub_id,'free_enrolled:'||p_store::text,'free.enrolled',actor,
    jsonb_build_object('terms_version',p_terms,'price_id',selected_price,'live_days',30));
  RETURN public.billing_free_state(p_store,p_token);
END $$;
REVOKE ALL ON FUNCTION public.billing_activate_free(uuid,text,uuid,text,boolean) FROM PUBLIC,lebrands_app;
GRANT EXECUTE ON FUNCTION public.billing_activate_free(uuid,text,uuid,text,boolean) TO lebrands_app;

CREATE FUNCTION public.billing_start_free_on_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE sub_id uuid; started timestamptz;
BEGIN
  -- AFTER triggers: publication snapshot and actual live status must both
  -- exist in the same transaction. Existing business/GST checks run unchanged.
  IF NOT EXISTS(SELECT 1 FROM public.stores WHERE store_id=NEW.store_id AND status='live')
    OR NOT EXISTS(SELECT 1 FROM public.store_publications WHERE store_id=NEW.store_id) THEN
    RETURN NEW;
  END IF;
  SELECT id INTO sub_id FROM public.billing_subscriptions WHERE store_id=NEW.store_id
    AND billing_interval='free' AND status='building' AND free_live_started_at IS NULL
    FOR UPDATE;
  IF sub_id IS NULL THEN RETURN NEW; END IF;
  -- Do not start or grant a trial from approval alone or an unapproved write.
  IF public.business_publication_access(NEW.store_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Business documents must be approved before publishing' USING ERRCODE='42501';
  END IF;
  started:=clock_timestamp();
  UPDATE public.billing_subscriptions SET status='trialing',free_live_started_at=started,
    free_expires_at=started+interval '720 hours',revision=revision+1 WHERE id=sub_id;
  INSERT INTO public.billing_subscription_events(store_id,subscription_id,event_key,event_type,safe_details)
    VALUES(NEW.store_id,sub_id,'free_live_started:'||sub_id::text,'free.live_started',
      jsonb_build_object('started_at',started,'expires_at',started+interval '720 hours'));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.billing_start_free_on_publication() FROM PUBLIC,lebrands_app;
CREATE TRIGGER billing_start_free_from_snapshot AFTER INSERT OR UPDATE ON public.store_publications
  FOR EACH ROW EXECUTE FUNCTION public.billing_start_free_on_publication();
CREATE TRIGGER billing_start_free_from_live_status AFTER UPDATE OF status ON public.stores
  FOR EACH ROW WHEN (NEW.status='live') EXECUTE FUNCTION public.billing_start_free_on_publication();

DO $$
DECLARE r text; f text;
BEGIN
  FOR r IN SELECT rolname FROM pg_catalog.pg_roles
    WHERE rolname IN ('anon','authenticated','service_role')
  LOOP
    FOREACH f IN ARRAY ARRAY[
      'billing_require_owner(uuid,text)','billing_free_state(uuid,text)',
      'billing_activate_free(uuid,text,uuid,text,boolean)','billing_start_free_on_publication()'
    ] LOOP EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM %I',f,r); END LOOP;
  END LOOP;
END $$;
