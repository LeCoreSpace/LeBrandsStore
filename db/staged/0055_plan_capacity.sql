-- Manual migration: node db/migrate.js --staged-plan-capacity.
-- The migration runner owns the transaction and checksum record atomically.
-- Existing above-limit records are retained; only excess growth is rejected.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TABLE public.plan_capacity_transactions (
 store_id uuid PRIMARY KEY REFERENCES public.stores(store_id) ON DELETE CASCADE,
 transaction_id bigint NOT NULL,
 baseline jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.plan_capacity_transactions FROM PUBLIC,lebrands_app;
ALTER TABLE public.plan_capacity_transactions ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public._plan_capacity_usage(p_store uuid) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH catalogue AS (
  SELECT p.id::text AS id,coalesce(o.id::text,'base') AS sku
  FROM public.products p LEFT JOIN public.product_options o
   ON o.store_id=p.store_id AND o.product_id=p.id
  WHERE p.store_id=p_store AND p.status<>'archived'
 ), live_entries AS (
  SELECT coalesce(p->>'id','invalid-'||n::text) AS id,
   CASE WHEN v IS NULL THEN 'base' ELSE coalesce(v->>'id',v->>'sku','published-variant-'||vn::text) END AS sku
  FROM public.store_publications s
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(nullif(s.snapshot->'products','null'::jsonb),'[]'::jsonb)) WITH ORDINALITY AS x(p,n)
  LEFT JOIN LATERAL jsonb_array_elements(coalesce(nullif(p->'variants','null'::jsonb),'[]'::jsonb)) WITH ORDINALITY AS y(v,vn) ON true
  WHERE s.store_id=p_store
 ), entries AS (
  SELECT * FROM catalogue UNION SELECT * FROM live_entries
 ), active AS (
  SELECT count(*) AS n FROM public.store_members WHERE store_id=p_store AND role<>'owner'
 ), pending AS (
  SELECT count(DISTINCT lower(i.email)) AS n FROM public.email_staff_invites i
  WHERE i.store_id=p_store AND i.accepted_at IS NULL AND i.expires_at>now()
   AND NOT EXISTS(SELECT 1 FROM public.store_members m JOIN public.users u ON u.id=m.user_id
    WHERE m.store_id=p_store AND lower(u.email)=lower(i.email))
 )
 SELECT jsonb_build_object('products',(SELECT count(DISTINCT id) FROM entries),
  'skus',(SELECT count(*) FROM entries),
  'storage',(SELECT coalesce(sum(size_bytes),0) FROM public.media WHERE store_id=p_store),
  'staff',(SELECT n FROM active)+(SELECT n FROM pending),
  'staff_active',(SELECT n FROM active),'staff_pending',(SELECT n FROM pending))
$$;

CREATE FUNCTION public._plan_capacity_limits(p_store uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ent jsonb; result jsonb:='{}'; key text; feature text; item jsonb; amount numeric;
BEGIN
 SELECT entitlement_snapshot INTO ent FROM public.billing_subscriptions
 WHERE store_id=p_store AND status IN('building','trialing','active','grace','paused')
  AND mode IN('none','live') ORDER BY created_at DESC,id DESC LIMIT 1;
 IF ent IS NULL THEN
  SELECT jsonb_object_agg(f.feature_key,jsonb_build_object('included',f.included,'value',f.value)) INTO ent
  FROM public.billing_plan_features f WHERE f.plan_id=(SELECT id FROM public.billing_plans
   WHERE code='free' AND offer_state='offered' ORDER BY version DESC LIMIT 1);
 END IF;
 FOREACH key IN ARRAY ARRAY['products','skus','storage','staff'] LOOP
  feature:=CASE key WHEN 'products' THEN 'published_products' WHEN 'skus' THEN 'published_skus'
   WHEN 'storage' THEN 'public_media_bytes' ELSE 'additional_staff_seats' END;
  item:=ent->feature; amount:=NULL;
  IF item->'included'='false'::jsonb THEN amount:=0;
  ELSIF item->'included'='true'::jsonb AND jsonb_typeof(item->'value')='number' THEN
   amount:=(item->>'value')::numeric;
   IF amount<0 OR amount>9007199254740991 OR amount<>trunc(amount) THEN amount:=NULL; END IF;
  END IF;
  result:=result||jsonb_build_object(key,amount);
 END LOOP;
 RETURN result;
END $$;

CREATE FUNCTION public.plan_capacity(p_store uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_store IS DISTINCT FROM NULLIF(current_setting('app.store_id',true),'')::uuid THEN
  RAISE EXCEPTION 'Store context mismatch' USING ERRCODE='42501';
 END IF;
 RETURN jsonb_build_object('enabled',true,'used',public._plan_capacity_usage(p_store),
  'limits',public._plan_capacity_limits(p_store));
END $$;

CREATE FUNCTION public._plan_capacity_check(p_store uuid,p_before jsonb,p_after jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE limits jsonb:=public._plan_capacity_limits(p_store); key text; cap bigint; old_value bigint; new_value bigint;
BEGIN
 FOREACH key IN ARRAY ARRAY['products','skus','storage','staff'] LOOP
  old_value:=coalesce((p_before->>key)::bigint,0); new_value:=(p_after->>key)::bigint;
  cap:=(limits->>key)::bigint;
  IF key='staff' AND (p_after->>'staff_active')::bigint>(p_before->>'staff_active')::bigint
    AND (cap IS NULL OR (p_after->>'staff_active')::bigint>cap) THEN
   RAISE EXCEPTION 'This action exceeds your plan allowance.' USING ERRCODE='PQU01',
    DETAIL=jsonb_build_object('resource',key,'used',old_value,'projected',new_value,'limit',cap)::text;
  END IF;
  IF new_value>old_value AND (cap IS NULL OR new_value>cap) THEN
   RAISE EXCEPTION 'This action exceeds your plan allowance.' USING ERRCODE='PQU01',
    DETAIL=jsonb_build_object('resource',key,'used',old_value,'projected',new_value,'limit',cap)::text;
  END IF;
 END LOOP;
END $$;

CREATE FUNCTION public._plan_capacity_shape(p_products jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_agg(jsonb_build_array(coalesce(p->>'id','invalid-'||pn::text),
  (SELECT jsonb_agg(coalesce(v->>'id',v->>'sku','published-variant-'||vn::text) ORDER BY coalesce(v->>'id',v->>'sku','published-variant-'||vn::text))
   FROM jsonb_array_elements(coalesce(nullif(p->'variants','null'::jsonb),'[]'::jsonb)) WITH ORDINALITY AS y(v,vn)))
  ORDER BY coalesce(p->>'id','invalid-'||pn::text))
 FROM jsonb_array_elements(coalesce(nullif(p_products,'null'::jsonb),'[]'::jsonb)) WITH ORDINALITY AS x(p,pn)
$$;

CREATE FUNCTION public._plan_capacity_capture() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid; old_shape jsonb; new_shape jsonb;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
   RAISE EXCEPTION 'Store identity cannot change' USING ERRCODE='42501';
  END IF;
  IF TG_TABLE_NAME='products' THEN
   IF NEW.status=OLD.status THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME='product_options' THEN
   IF NEW.product_id=OLD.product_id THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME='media' THEN
   IF NEW.size_bytes=OLD.size_bytes THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME='store_members' THEN
   IF NEW.role=OLD.role AND NEW.user_id=OLD.user_id THEN RETURN NEW; END IF;
  END IF;
  IF TG_TABLE_NAME='store_publications' THEN
   IF NEW.snapshot->'products' IS NOT DISTINCT FROM OLD.snapshot->'products' THEN RETURN NEW; END IF;
   old_shape:=public._plan_capacity_shape(OLD.snapshot->'products');
   new_shape:=public._plan_capacity_shape(NEW.snapshot->'products');
   IF old_shape IS NOT DISTINCT FROM new_shape THEN RETURN NEW; END IF;
  END IF;
 END IF;
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.store_id ELSE NEW.store_id END;
 PERFORM 1 FROM public.stores WHERE store_id=target FOR UPDATE;
 IF NOT FOUND THEN
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.plan_capacity_transactions WHERE store_id=target AND transaction_id=txid_current()) THEN
  INSERT INTO public.plan_capacity_transactions(store_id,transaction_id,baseline)
   VALUES(target,txid_current(),public._plan_capacity_usage(target));
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

CREATE FUNCTION public._plan_capacity_finish() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid; before_usage jsonb;
BEGIN
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.store_id ELSE NEW.store_id END;
 SELECT baseline INTO before_usage FROM public.plan_capacity_transactions
  WHERE store_id=target AND transaction_id=txid_current();
 IF before_usage IS NOT NULL THEN
  PERFORM public._plan_capacity_check(target,before_usage,public._plan_capacity_usage(target));
  DELETE FROM public.plan_capacity_transactions WHERE store_id=target AND transaction_id=txid_current();
 END IF;
 RETURN NULL;
END $$;

DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['products','product_options','media','store_members','email_staff_invites','store_publications'] LOOP
  EXECUTE format('CREATE TRIGGER plan_capacity_capture BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public._plan_capacity_capture()',table_name);
  EXECUTE format('CREATE CONSTRAINT TRIGGER plan_capacity_finish AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public._plan_capacity_finish()',table_name);
 END LOOP;
END $$;

-- Preserve callable identities used by already published Workers.
CREATE OR REPLACE FUNCTION public.email_invite_staff(p_store uuid,p_session text,p_email text,p_role text,p_hash text,p_message jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; invited uuid;
BEGIN
 IF p_store IS DISTINCT FROM NULLIF(current_setting('app.store_id',true),'')::uuid THEN RAISE EXCEPTION 'Store context mismatch' USING ERRCODE='42501'; END IF;
 SELECT s.user_id INTO actor FROM public.sessions s JOIN public.users u ON u.id=s.user_id JOIN public.store_members m ON m.user_id=u.id
 WHERE s.token_hash=p_session AND s.revoked_at IS NULL AND s.expires_at>now() AND NOT u.must_change_password AND m.store_id=p_store AND m.role IN('owner','admin');
 IF actor IS NULL THEN RAISE EXCEPTION 'Owner or admin required' USING ERRCODE='42501'; END IF;
 IF p_role NOT IN('admin','editor') OR p_hash !~ '^[a-f0-9]{64}$' OR length(p_email)>254 OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  OR jsonb_typeof(p_message)<>'object' OR octet_length(p_message::text)>50000 THEN RAISE EXCEPTION 'Check the invitation'; END IF;
 PERFORM 1 FROM public.stores WHERE store_id=p_store FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.store_members m JOIN public.users u ON u.id=m.user_id WHERE m.store_id=p_store AND lower(u.email)=lower(p_email)) THEN
  RAISE EXCEPTION 'This person is already a member of your store.' USING ERRCODE='PQU02';
 END IF;
 UPDATE public.email_staff_invites SET expires_at=now() WHERE store_id=p_store AND lower(email)=lower(p_email) AND accepted_at IS NULL AND expires_at>now();
 INSERT INTO public.email_staff_invites(store_id,email,role,token_hash,invited_by)
  VALUES(p_store,lower(p_email),p_role,p_hash,actor) RETURNING id INTO invited;
 INSERT INTO public.email_log(store_id,recipient,template,event_key,payload)
  VALUES(p_store,lower(p_email),'invite','invite:'||invited::text,jsonb_set(p_message,'{to}',jsonb_build_array(lower(p_email))));
 RETURN invited;
END $$;

CREATE OR REPLACE FUNCTION public.email_accept_invite(p_hash text,p_session text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE invite public.email_staff_invites; actor uuid; address text; target uuid; used jsonb; cap bigint;
BEGIN
 SELECT s.user_id,u.email INTO actor,address FROM public.sessions s JOIN public.users u ON u.id=s.user_id
 WHERE s.token_hash=p_session AND s.revoked_at IS NULL AND s.expires_at>now() AND NOT u.must_change_password;
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in first' USING ERRCODE='42501'; END IF;
 SELECT store_id INTO target FROM public.email_staff_invites WHERE token_hash=p_hash AND expires_at>now() AND accepted_at IS NULL AND email=lower(address);
 IF target IS NULL THEN RAISE EXCEPTION 'Use the invited email with a valid invitation' USING ERRCODE='42501'; END IF;
 IF NULLIF(current_setting('app.store_id',true),'') IS NOT NULL AND target IS DISTINCT FROM NULLIF(current_setting('app.store_id',true),'')::uuid THEN RAISE EXCEPTION 'Store context mismatch' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.stores WHERE store_id=target FOR UPDATE;
 SELECT * INTO invite FROM public.email_staff_invites WHERE token_hash=p_hash AND expires_at>now() AND accepted_at IS NULL AND email=lower(address) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Use the invited email with a valid invitation' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.store_members WHERE store_id=target AND user_id=actor) THEN
  used:=public._plan_capacity_usage(target); cap:=(public._plan_capacity_limits(target)->>'staff')::bigint;
  IF cap IS NULL OR (used->>'staff_active')::bigint+1>cap THEN
   RAISE EXCEPTION 'There are no staff seats available on this plan.' USING ERRCODE='PQU01',
    DETAIL=jsonb_build_object('resource','staff','used',(used->>'staff_active')::bigint,'projected',(used->>'staff_active')::bigint+1,'limit',cap)::text;
  END IF;
 END IF;
 INSERT INTO public.store_members(store_id,user_id,role) VALUES(target,actor,invite.role) ON CONFLICT(store_id,user_id) DO NOTHING;
 UPDATE public.email_staff_invites SET accepted_at=now() WHERE id=invite.id;
 RETURN target;
END $$;

REVOKE ALL ON FUNCTION public._plan_capacity_usage(uuid),public._plan_capacity_limits(uuid),
 public._plan_capacity_check(uuid,jsonb,jsonb),public._plan_capacity_capture(),public._plan_capacity_finish(),
 public._plan_capacity_shape(jsonb),public.plan_capacity(uuid) FROM PUBLIC,lebrands_app;
GRANT EXECUTE ON FUNCTION public.plan_capacity(uuid) TO lebrands_app;
-- Supabase API roles may have direct default grants separate from PUBLIC.
DO $$
DECLARE r text; fn text;
BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON TABLE public.plan_capacity_transactions FROM %I',r);
   FOREACH fn IN ARRAY ARRAY['_plan_capacity_usage(uuid)','_plan_capacity_limits(uuid)',
    '_plan_capacity_check(uuid,jsonb,jsonb)','_plan_capacity_capture()','_plan_capacity_finish()',
    '_plan_capacity_shape(jsonb)','plan_capacity(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM %I',fn,r);
   END LOOP;
  END IF;
 END LOOP;
END $$;
