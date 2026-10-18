-- Phase 6 is a sandbox, not a commercial launch. Paid offers remain disabled.
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.schema_migrations WHERE filename='0039_ann_plan_selection.sql') THEN
  RAISE EXCEPTION 'Apply 0039_ann_plan_selection.sql first';
 END IF;
END $$;

-- Keep the existing function identity and response contract. Sandbox purchases
-- must never appear as the store's current subscription, even after Free expires.
CREATE OR REPLACE FUNCTION public.billing_free_state(p_store uuid,p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; country text; offer jsonb; selected jsonb; reason text;
 free_exists boolean; current_exists boolean; legacy_store boolean;
BEGIN
 actor:=public.billing_require_owner(p_store,p_token);
 SELECT coalesce(a.business_country,u.country_code) INTO country
  FROM public.users u LEFT JOIN public.store_business_access a ON a.store_id=p_store WHERE u.id=actor;
 SELECT EXISTS(SELECT 1 FROM public.billing_subscriptions WHERE store_id=p_store AND billing_interval='free') INTO free_exists;
 SELECT EXISTS(SELECT 1 FROM public.billing_subscriptions WHERE store_id=p_store AND mode<>'test'
  AND status IN ('building','trialing','active','grace','paused')) INTO current_exists;
 SELECT status='live' OR EXISTS(SELECT 1 FROM public.store_publications WHERE store_id=p_store)
  INTO legacy_store FROM public.stores WHERE store_id=p_store;
 SELECT jsonb_build_object('id',s.id,'plan',p.code,'plan_version',p.version,'status',s.status,
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
 WHERE s.store_id=p_store AND s.mode<>'test' ORDER BY
  CASE WHEN s.status IN ('building','trialing','active','grace','paused') THEN 0 ELSE 1 END,
  s.created_at DESC,s.id DESC LIMIT 1;
 IF free_exists OR current_exists THEN reason:='already_enrolled';
 ELSIF legacy_store THEN reason:='legacy_transition_required';
 ELSIF country IS NULL THEN reason:='country_required';
 ELSIF country<>'IN' THEN reason:='unsupported_country';
 ELSE
  SELECT jsonb_build_object('plan','free','plan_version',p.version,'price_id',x.id,
   'country_code',x.country_code,'currency',x.currency,'amount_minor',x.amount_minor,
   'terms_version','free-v1','live_days',p.free_live_days,'timer_starts','first_successful_publication',
   'entitlements',(SELECT jsonb_object_agg(f.feature_key,jsonb_build_object('included',f.included,'value',f.value))
    FROM public.billing_plan_features f WHERE f.plan_id=p.id))
  INTO offer FROM public.billing_plans p JOIN public.billing_plan_prices x ON x.plan_id=p.id
  WHERE p.code='free' AND p.version=1 AND p.offer_state='offered' AND p.free_live_days=30
   AND x.enabled AND x.country_code=country AND x.currency='INR'
   AND x.billing_interval='free' AND x.price_kind='fixed' AND x.amount_minor=0;
  reason:=CASE WHEN offer IS NULL THEN 'offer_unavailable' ELSE 'available' END;
 END IF;
 RETURN jsonb_build_object('subscription',selected,'free_enrolment_exists',free_exists,
  'can_enrol',reason='available','reason',reason,'country_code',country,
  'offer',offer,'server_time',clock_timestamp());
END $$;

-- A capability derived inside the Worker is required for financial writes.
-- Only its SHA256 is stored here; it is never exposed through an API.
CREATE TABLE public.billing_test_configuration (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 verifier_sha256 text CHECK(verifier_sha256 ~ '^[a-f0-9]{64}$'),
 configured_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT enabled OR verifier_sha256 IS NOT NULL)
);
INSERT INTO public.billing_test_configuration(singleton) VALUES(true);
ALTER TABLE public.billing_test_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_test_configuration FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_test_configuration FROM PUBLIC,lebrands_app;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON public.billing_test_configuration FROM %I',r);
  END IF;
 END LOOP;
END $$;

CREATE FUNCTION public.billing_test_state(p_store uuid,p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ready boolean; approved boolean; attempts jsonb;
BEGIN
 PERFORM public.billing_require_owner(p_store,p_token);
 SELECT enabled INTO ready FROM public.billing_test_configuration WHERE singleton;
 approved:=public.business_publication_access(p_store) AND EXISTS(
  SELECT 1 FROM public.store_business_access WHERE store_id=p_store AND business_country='IN');
 SELECT coalesce(jsonb_agg(x ORDER BY x.created_at DESC),'[]'::jsonb) INTO attempts FROM (
  SELECT c.id,c.status,c.provider_order_id,c.total_minor,c.subtotal_minor,c.tax_minor,c.currency,
   c.expires_at,c.created_at,p.code AS plan,s.billing_interval,
   EXISTS(SELECT 1 FROM public.billing_payments pay WHERE pay.checkout_session_id=c.id) AS verified
  FROM public.billing_checkout_sessions c JOIN public.billing_subscriptions s ON s.id=c.subscription_id
  JOIN public.billing_plans p ON p.id=s.plan_id
  WHERE c.store_id=p_store AND c.mode='test' AND c.provider='razorpay'
  ORDER BY c.created_at DESC LIMIT 20
 ) x;
 RETURN jsonb_build_object('available',coalesce(ready,false),'eligible',approved,
  'reason',CASE WHEN NOT coalesce(ready,false) THEN 'not_configured'
   WHEN NOT approved THEN 'business_approval_required' ELSE 'available' END,
  'attempts',attempts,'mode','test','terms_version','paid-test-v1');
END $$;

-- Narrow operation interface: no arbitrary subscription fields or live writes.
CREATE FUNCTION public.billing_test_write(
 p_store uuid,p_token text,p_capability text,p_action text,p_input jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; cfg public.billing_test_configuration; c public.billing_checkout_sessions;
 price public.billing_plan_prices; plan public.billing_plans; account_id uuid; sub_id uuid;
 ents jsonb; payment_id text;
BEGIN
 actor:=public.billing_require_owner(p_store,p_token);
 SELECT * INTO cfg FROM public.billing_test_configuration WHERE singleton;
 IF NOT coalesce(cfg.enabled,false) OR p_capability IS NULL OR
  encode(sha256(convert_to(p_capability,'UTF8')),'hex') IS DISTINCT FROM cfg.verifier_sha256 THEN
  RAISE EXCEPTION 'Test payment verifier unavailable' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Invalid checkout input' USING ERRCODE='22023';
 END IF;
 PERFORM 1 FROM public.stores WHERE store_id=p_store FOR UPDATE;
 IF p_action='prepare' THEN
  IF p_input->>'terms_version' IS DISTINCT FROM 'paid-test-v1' OR
   p_input->'accepted' IS DISTINCT FROM 'true'::jsonb OR
   p_input->>'idempotency_key' IS NULL OR
   p_input->>'idempotency_key' !~ '^[a-f0-9-]{36}$' THEN
   RAISE EXCEPTION 'Accept current sandbox terms' USING ERRCODE='22023';
  END IF;
  SELECT * INTO c FROM public.billing_checkout_sessions WHERE store_id=p_store
   AND idempotency_key=p_input->>'idempotency_key';
  IF FOUND THEN
   IF NOT EXISTS(SELECT 1 FROM public.billing_subscriptions WHERE id=c.subscription_id
    AND price_id=(p_input->>'price_id')::uuid) THEN
    RAISE EXCEPTION 'Checkout key already used for another price' USING ERRCODE='22023';
   END IF;
   RETURN jsonb_build_object('checkout',to_jsonb(c),'create_order',false);
  END IF;
  IF NOT public.business_publication_access(p_store) OR NOT EXISTS(
   SELECT 1 FROM public.store_business_access WHERE store_id=p_store AND business_country='IN') THEN
   RAISE EXCEPTION 'Approved Indian business required' USING ERRCODE='PBT01';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.billing_subscriptions WHERE store_id=p_store
   AND billing_interval='free') THEN
   RAISE EXCEPTION 'Accept Free in Ann before testing paid checkout' USING ERRCODE='PBT02';
  END IF;
  SELECT * INTO price FROM public.billing_plan_prices WHERE id=(p_input->>'price_id')::uuid
   AND country_code='IN' AND currency='INR' AND billing_interval IN ('monthly','annual')
   AND price_kind='fixed' AND amount_minor>0 AND version=1;
  SELECT * INTO plan FROM public.billing_plans WHERE id=price.plan_id AND version=1
   AND code IN ('launch','grow','scale') AND NOT contract_required;
  IF plan.id IS NULL THEN
   RAISE EXCEPTION 'Sandbox price unavailable' USING ERRCODE='22023';
  END IF;
  -- A second tab/repeated click must resume, not create another payable order.
  IF EXISTS(SELECT 1 FROM public.billing_checkout_sessions WHERE store_id=p_store
   AND mode='test' AND status IN ('created','pending') AND expires_at>now()) THEN
   RAISE EXCEPTION 'Resume the existing test checkout first' USING ERRCODE='PBT03';
  END IF;
  SELECT id INTO account_id FROM public.billing_accounts WHERE store_id=p_store AND country_code='IN';
  IF account_id IS NULL THEN RAISE EXCEPTION 'Billing identity unavailable' USING ERRCODE='PBT02'; END IF;
  SELECT jsonb_object_agg(feature_key,jsonb_build_object('included',included,'value',value))
   INTO ents FROM public.billing_plan_features WHERE plan_id=plan.id;
  INSERT INTO public.billing_subscriptions(store_id,billing_account_id,plan_id,price_id,
   country_code,currency,billing_interval,mode,status,terms_version,accepted_at,accepted_by,entitlement_snapshot)
   VALUES(p_store,account_id,plan.id,price.id,'IN','INR',price.billing_interval,'test','pending',
    'paid-test-v1',now(),actor,ents) RETURNING id INTO sub_id;
  INSERT INTO public.billing_checkout_sessions(store_id,subscription_id,mode,provider,
   idempotency_key,purpose,currency,subtotal_minor,tax_minor,total_minor,tax_snapshot,
   entitlement_snapshot,expires_at)
   VALUES(p_store,sub_id,'test','razorpay',p_input->>'idempotency_key','initial','INR',
    price.amount_minor,0,price.amount_minor,
    '{"simulation_only":true,"tax_approved":false,"label":"Tax not assessed in sandbox"}',ents,now()+interval '30 minutes')
   RETURNING * INTO c;
  INSERT INTO public.billing_subscription_events(store_id,subscription_id,event_key,event_type,actor_user_id)
   VALUES(p_store,sub_id,'test-consent:'||c.id,'test_checkout_consented',actor);
  RETURN jsonb_build_object('checkout',to_jsonb(c),'create_order',true);
 END IF;
 SELECT * INTO c FROM public.billing_checkout_sessions WHERE id=(p_input->>'checkout_id')::uuid
  AND store_id=p_store AND mode='test' AND provider='razorpay' FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Test checkout not found' USING ERRCODE='42501'; END IF;
 IF p_action='bind' THEN
  IF p_input->>'order_id' IS NULL OR p_input->>'order_id' !~ '^order_[A-Za-z0-9]+$' OR
   (c.provider_order_id IS NOT NULL AND c.provider_order_id<>p_input->>'order_id') THEN
   RAISE EXCEPTION 'Order binding mismatch' USING ERRCODE='22023';
  END IF;
  UPDATE public.billing_checkout_sessions SET provider_order_id=p_input->>'order_id',status='pending'
   WHERE id=c.id AND provider_order_id IS NULL;
 ELSIF p_action='settle' THEN
  payment_id:=p_input->>'payment_id';
  IF c.provider_order_id IS NULL OR c.provider_order_id IS DISTINCT FROM p_input->>'order_id'
   OR payment_id IS NULL OR payment_id !~ '^pay_[A-Za-z0-9]+$'
   OR (p_input->>'amount_minor')::bigint IS DISTINCT FROM c.total_minor
   OR p_input->>'currency' IS DISTINCT FROM c.currency THEN
   RAISE EXCEPTION 'Verified payment mismatch' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM public.billing_payments WHERE checkout_session_id=c.id
   AND provider_payment_id<>payment_id) THEN
   RAISE EXCEPTION 'Checkout already has a different payment' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.billing_payments(store_id,subscription_id,checkout_session_id,provider,mode,
   provider_payment_id,currency,amount_minor,status,verified_at,captured_at)
   VALUES(p_store,c.subscription_id,c.id,'razorpay','test',payment_id,c.currency,c.total_minor,
    'captured',now(),now()) ON CONFLICT(checkout_session_id) DO NOTHING;
  UPDATE public.billing_checkout_sessions SET status='paid' WHERE id=c.id;
  INSERT INTO public.billing_subscription_events(store_id,subscription_id,event_key,event_type,actor_user_id,safe_details)
   VALUES(p_store,c.subscription_id,'test-capture:'||c.id,'test_payment_verified',actor,
    '{"simulation_only":true,"live_entitlements_unchanged":true}')
   ON CONFLICT(store_id,event_key) DO NOTHING;
  -- Deliberately pending: test payments NEVER become live service authority.
 ELSE RAISE EXCEPTION 'Unsupported test operation' USING ERRCODE='22023';
 END IF;
 SELECT * INTO c FROM public.billing_checkout_sessions WHERE id=c.id;
 RETURN jsonb_build_object('checkout',to_jsonb(c),'create_order',false);
END $$;
REVOKE ALL ON FUNCTION public.billing_test_state(uuid,text),
 public.billing_test_write(uuid,text,text,text,jsonb) FROM PUBLIC,lebrands_app;
GRANT EXECUTE ON FUNCTION public.billing_test_state(uuid,text),
 public.billing_test_write(uuid,text,text,text,jsonb) TO lebrands_app;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON FUNCTION public.billing_test_state(uuid,text), public.billing_test_write(uuid,text,text,text,jsonb) FROM %I',r);
  END IF;
 END LOOP;
END $$;
