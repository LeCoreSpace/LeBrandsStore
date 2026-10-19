-- Operator-applied only. Creates no administrators and changes no existing stores.
DO $$ BEGIN
 IF NOT coalesce((SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user),false) THEN
  RAISE EXCEPTION 'Administrative BYPASSRLS connection required';
 END IF;
 IF to_regclass('public.platform_business_reviewers') IS NULL
 OR to_regclass('public.billing_subscriptions') IS NULL
 OR to_regclass('public.billing_payments') IS NULL THEN
  RAISE EXCEPTION 'Apply business review and platform billing migrations first';
 END IF;
END $$;

CREATE TABLE public.platform_administrators (
 user_id uuid PRIMARY KEY REFERENCES public.users(id),
 username text UNIQUE NOT NULL CHECK(username=lower(username) AND username ~ '^[a-z][a-z0-9_.-]{2,39}$'),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.platform_store_controls (
 store_id uuid PRIMARY KEY REFERENCES public.stores(store_id),
 suspended boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.platform_admin_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES public.stores(store_id),
 actor_id uuid NOT NULL REFERENCES public.users(id),
 action text NOT NULL CHECK(action IN('suspend','restore')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000),
 from_status text NOT NULL,
 to_status text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_admin_events_store_time ON public.platform_admin_events(store_id,created_at DESC);
ALTER TABLE public.platform_administrators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_store_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admin_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_administrators,public.platform_store_controls,public.platform_admin_events
 FROM PUBLIC,lebrands_app,anon,authenticated,service_role;

CREATE FUNCTION public.platform_admin_actor(p_token text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 SELECT u.id INTO actor FROM public.sessions s JOIN public.users u ON u.id=s.user_id
 JOIN public.platform_administrators a ON a.user_id=u.id AND a.active
 WHERE s.token_hash=p_token AND s.revoked_at IS NULL AND s.expires_at>now()
 AND NOT u.must_change_password FOR SHARE OF s,u,a;
 IF actor IS NULL THEN RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE='42501'; END IF;
 RETURN actor;
END $$;
CREATE FUNCTION public.platform_admin_access(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 actor:=public.platform_admin_actor(p_token);
 RETURN (SELECT jsonb_build_object('name',u.name,'username',a.username)
 FROM public.users u JOIN public.platform_administrators a ON a.user_id=u.id WHERE u.id=actor);
END $$;
-- Login lookup exposes only an existing account identifier, never a password.
CREATE FUNCTION public.platform_admin_login_identity(p_username text) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT u.email FROM public.users u JOIN public.platform_administrators a ON a.user_id=u.id
 WHERE a.username=p_username AND a.active
$$;
CREATE FUNCTION public.platform_admin_store_record(p_store uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(
 'store_id',s.store_id,'name',s.name,'subdomain',s.subdomain,'status',s.status,
 'country',s.country,'currency',s.currency,'created_at',s.created_at,
 'order_count',(SELECT count(*) FROM public.orders o WHERE o.store_id=s.store_id),
 'product_count',(SELECT count(*) FROM public.products p WHERE p.store_id=s.store_id),
 'suspended',coalesce(c.suspended,false),'suspension_revision',coalesce(c.revision,0),
 'business_status',(SELECT v.status FROM public.store_business_verifications v WHERE v.store_id=s.store_id),
 'gst_state',(SELECT v.state FROM public.store_gstin_verifications v WHERE v.store_id=s.store_id ORDER BY v.created_at DESC,v.id DESC LIMIT 1),
 'gst_confirmed',coalesce((s.settings->>'gstin_invoice_identity_locked')='true',false),
 'subscription',(SELECT jsonb_build_object('plan',p.code,'status',b.status,'mode',b.mode,
   'interval',b.billing_interval,'period_end',b.period_end,'free_expires_at',b.free_expires_at)
   FROM public.billing_subscriptions b JOIN public.billing_plans p ON p.id=b.plan_id WHERE b.store_id=s.store_id
   ORDER BY CASE WHEN b.mode='test' THEN 1 ELSE 0 END,b.created_at DESC,b.id DESC LIMIT 1),
 'payment',(SELECT jsonb_build_object('status',b.status,'mode',b.mode,'amount_minor',b.amount_minor,
   'currency',b.currency,'captured_at',b.captured_at) FROM (
    SELECT b.id,b.store_id,b.status,b.mode,b.amount_minor,b.currency,b.captured_at,b.created_at FROM public.billing_payments b
    UNION ALL SELECT c.id,c.store_id,c.status,c.mode,c.total_minor,c.currency,NULL::timestamptz,c.created_at
    FROM public.billing_checkout_sessions c WHERE c.status<>'paid'
   ) b WHERE b.store_id=s.store_id
   ORDER BY b.created_at DESC,b.id DESC LIMIT 1),
 'integrations',coalesce((SELECT jsonb_agg(jsonb_build_object('provider',i.provider,'status',i.status,'updated_at',i.updated_at) ORDER BY i.provider)
   FROM public.integrations i WHERE i.store_id=s.store_id),'[]'::jsonb),
 'domains',coalesce((SELECT jsonb_agg(jsonb_build_object('hostname',d.hostname,'status',d.status,'is_primary',d.is_primary,'updated_at',d.updated_at) ORDER BY d.is_primary DESC,d.hostname)
   FROM public.domains d WHERE d.store_id=s.store_id),'[]'::jsonb))
 FROM public.stores s LEFT JOIN public.platform_store_controls c ON c.store_id=s.store_id WHERE s.store_id=p_store
$$;
CREATE FUNCTION public.platform_admin_overview(p_token text,p_query text,p_status text,p_page integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE rows_json jsonb; summary_json jsonb; more boolean;
BEGIN
 PERFORM public.platform_admin_actor(p_token);
 IF p_query IS NULL OR length(p_query)>100 OR p_status IS NULL
 OR p_status NOT IN('all','draft','live','paused','suspended') OR p_page IS NULL OR p_page<0 OR p_page>1000 THEN
  RAISE EXCEPTION 'Invalid store filter' USING ERRCODE='22023';
 END IF;
 SELECT jsonb_build_object('stores',count(*),'live',count(*) FILTER(WHERE s.status='live'),
  'draft',count(*) FILTER(WHERE s.status='draft'),'paused',count(*) FILTER(WHERE s.status='paused' AND NOT coalesce(c.suspended,false)),
  'suspended',count(*) FILTER(WHERE c.suspended),
  'orders',(SELECT count(*) FROM public.orders),
  'pending_reviews',(SELECT count(*) FROM public.store_business_verifications WHERE status='pending_review'),
  'custom_domains',(SELECT count(*) FROM public.domains WHERE status='active'),
  'payment_issues',(SELECT count(*) FROM public.stores x WHERE
    EXISTS(SELECT 1 FROM public.integrations i WHERE i.store_id=x.store_id AND i.provider='razorpay' AND i.status='error')
    OR (SELECT c.status FROM public.billing_checkout_sessions c WHERE c.store_id=x.store_id ORDER BY c.created_at DESC,c.id DESC LIMIT 1)='failed'))
 INTO summary_json FROM public.stores s LEFT JOIN public.platform_store_controls c ON c.store_id=s.store_id;
 SELECT coalesce(jsonb_agg(public.platform_admin_store_record(t.store_id) ORDER BY t.created_at DESC,t.store_id),'[]'::jsonb)
 INTO rows_json FROM (
  SELECT s.store_id,s.created_at FROM public.stores s LEFT JOIN public.platform_store_controls c ON c.store_id=s.store_id
  WHERE (p_query='' OR strpos(lower(s.name),lower(p_query))>0 OR strpos(s.subdomain,lower(p_query))>0)
  AND (p_status='all' OR (p_status='suspended' AND coalesce(c.suspended,false))
   OR (p_status=s.status AND NOT coalesce(c.suspended,false)))
  ORDER BY s.created_at DESC,s.store_id LIMIT 26 OFFSET p_page*25
 ) t;
 more:=jsonb_array_length(rows_json)>25;
 IF more THEN rows_json:=rows_json-25; END IF;
 RETURN jsonb_build_object('summary',summary_json,'stores',rows_json,'has_more',more,
  'page',p_page,'query',p_query,'status',p_status);
END $$;
CREATE FUNCTION public.platform_admin_detail(p_token text,p_store uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE record_json jsonb; history_json jsonb;
BEGIN
 PERFORM public.platform_admin_actor(p_token);
 record_json:=public.platform_admin_store_record(p_store);
 IF record_json IS NULL THEN RAISE EXCEPTION 'Store not found' USING ERRCODE='P0002'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) INTO history_json FROM (
  SELECT e.action,e.reason,e.created_at,e.from_status,e.to_status,u.name AS actor_name
  FROM public.platform_admin_events e JOIN public.users u ON u.id=e.actor_id
  WHERE e.store_id=p_store ORDER BY e.created_at DESC,e.id DESC LIMIT 100
 ) t;
 RETURN jsonb_build_object('store',record_json,'history',history_json);
END $$;
CREATE FUNCTION public.platform_admin_suspension(p_token text,p_store uuid,p_revision bigint,p_action text,p_reason text,p_confirmation text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; store_row public.stores%ROWTYPE; control_row public.platform_store_controls%ROWTYPE; next_status text;
BEGIN
 actor:=public.platform_admin_actor(p_token);
 IF p_action IS NULL OR p_action NOT IN('suspend','restore') OR p_reason IS NULL
 OR length(btrim(p_reason)) NOT BETWEEN 10 AND 1000 OR p_revision IS NULL OR p_revision<0 THEN
  RAISE EXCEPTION 'Enter a valid action and a reason of 10 to 1000 characters' USING ERRCODE='22023';
 END IF;
 SELECT * INTO store_row FROM public.stores WHERE store_id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Store not found' USING ERRCODE='P0002'; END IF;
 IF p_confirmation IS DISTINCT FROM store_row.subdomain THEN
  RAISE EXCEPTION 'Type the exact store address to confirm' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM public.store_members WHERE store_id=p_store AND user_id=actor) THEN
  RAISE EXCEPTION 'Administrators cannot change an affiliated store' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.platform_store_controls(store_id) VALUES(p_store) ON CONFLICT DO NOTHING;
 SELECT * INTO control_row FROM public.platform_store_controls WHERE store_id=p_store FOR UPDATE;
 IF control_row.revision<>p_revision THEN
  RAISE EXCEPTION 'Store controls changed. Refresh before recording a decision.' USING ERRCODE='40001';
 END IF;
 IF (p_action='suspend')=control_row.suspended THEN
  RAISE EXCEPTION 'This action is already recorded' USING ERRCODE='22023';
 END IF;
 next_status:=CASE WHEN p_action='suspend' THEN 'paused' ELSE 'draft' END;
 UPDATE public.platform_store_controls SET suspended=(p_action='suspend'),revision=revision+1,updated_at=now() WHERE store_id=p_store;
 UPDATE public.stores SET status=next_status,updated_at=now() WHERE store_id=p_store;
 INSERT INTO public.platform_admin_events(store_id,actor_id,action,reason,from_status,to_status)
 VALUES(p_store,actor,p_action,btrim(p_reason),store_row.status,next_status);
END $$;
CREATE FUNCTION public.platform_suspension_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.status='live' AND EXISTS(SELECT 1 FROM public.platform_store_controls WHERE store_id=NEW.store_id AND suspended) THEN
  RAISE EXCEPTION 'This store is suspended by the platform' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER platform_suspension_guard BEFORE INSERT OR UPDATE OF status ON public.stores
 FOR EACH ROW EXECUTE FUNCTION public.platform_suspension_guard();

REVOKE ALL ON FUNCTION public.platform_admin_actor(text),public.platform_admin_store_record(uuid),
 public.platform_suspension_guard() FROM PUBLIC,lebrands_app,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.platform_admin_access(text),public.platform_admin_login_identity(text),
 public.platform_admin_overview(text,text,text,integer),public.platform_admin_detail(text,uuid),
 public.platform_admin_suspension(text,uuid,bigint,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.platform_admin_access(text),public.platform_admin_login_identity(text),
 public.platform_admin_overview(text,text,text,integer),public.platform_admin_detail(text,uuid),
 public.platform_admin_suspension(text,uuid,bigint,text,text,text) TO lebrands_app;
