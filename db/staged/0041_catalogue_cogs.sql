-- Stage 1: private costs only. No charge activation, public price changes or
-- historical margin reconstruction. Apply with --staged-catalogue-cogs.
DO $$ BEGIN
 IF to_regclass('public.product_options') IS NULL OR
    NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='product_options' AND column_name='attributes') THEN
   RAISE EXCEPTION 'Apply the catalogue forms migrations before catalogue COGS';
 END IF;
 IF EXISTS(SELECT 1 FROM public.products WHERE cost_price_paise>1000000000000) THEN
   RAISE EXCEPTION 'Review legacy costs above the supported cost limit before migrating';
 END IF;
END $$;

-- Base product cost remains products.cost_price_paise. This table holds its
-- revision, and separately holds private SKU overrides; null SKU cost inherits.
CREATE TABLE public.catalogue_costs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES public.stores(store_id),
 product_id uuid NOT NULL,
 product_option_id uuid,
 cost_price_paise bigint CHECK(cost_price_paise BETWEEN 0 AND 1000000000000),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(product_option_id IS NOT NULL OR cost_price_paise IS NULL),
 CHECK(product_option_id IS NULL OR product_option_id<>'00000000-0000-0000-0000-000000000000'::uuid),
 FOREIGN KEY(store_id,product_id) REFERENCES public.products(store_id,id) ON DELETE CASCADE,
 FOREIGN KEY(store_id,product_id,product_option_id) REFERENCES public.product_options(store_id,product_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX catalogue_costs_identity ON public.catalogue_costs
 (store_id,product_id,coalesce(product_option_id,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE TABLE public.catalogue_cost_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES public.stores(store_id),
 product_id uuid NOT NULL,
 product_option_id uuid,
 variant_label text,
 previous_cost_paise bigint,
 cost_price_paise bigint,
 currency char(3) NOT NULL,
 revision integer NOT NULL,
 actor_user_id uuid REFERENCES public.users(id),
 effective_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL DEFAULT 'merchant_update'
);
CREATE INDEX catalogue_cost_history_lookup ON public.catalogue_cost_history(store_id,product_id,effective_at DESC,id DESC);
-- The foundational table has a globally unique id, but no tenant/id key.
CREATE UNIQUE INDEX order_items_cost_tenant_identity ON public.order_items(store_id,id);
CREATE TABLE public.order_item_costs (
 store_id uuid NOT NULL REFERENCES public.stores(store_id),
 order_item_id uuid NOT NULL,
 product_id uuid,
 product_option_id uuid,
 unit_cost_paise bigint,
 currency char(3) NOT NULL,
 cost_source text NOT NULL CHECK(cost_source IN ('product','override','missing','currency_mismatch')),
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 capture_reason text NOT NULL CHECK(capture_reason IN ('historical_unknown','at_order_creation')),
 PRIMARY KEY(store_id,order_item_id),
 FOREIGN KEY(store_id,order_item_id) REFERENCES public.order_items(store_id,id) ON DELETE CASCADE
);
-- Never fabricate previous sales' costs from today's catalogue.
INSERT INTO public.order_item_costs(store_id,order_item_id,product_id,product_option_id,currency,cost_source,capture_reason)
 SELECT i.store_id,i.id,i.product_id,i.product_option_id,o.currency,'missing','historical_unknown'
 FROM public.order_items i JOIN public.orders o ON o.store_id=i.store_id AND o.id=i.order_id;
INSERT INTO public.catalogue_costs(store_id,product_id,revision)
 SELECT store_id,id,1 FROM public.products WHERE cost_price_paise IS NOT NULL;
INSERT INTO public.catalogue_cost_history(store_id,product_id,cost_price_paise,currency,revision,reason)
 SELECT p.store_id,p.id,p.cost_price_paise,s.currency,1,'legacy_cost_at_migration'
 FROM public.products p JOIN public.stores s ON s.store_id=p.store_id WHERE p.cost_price_paise IS NOT NULL;

ALTER TABLE public.catalogue_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogue_cost_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_costs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalogue_costs,public.catalogue_cost_history,public.order_item_costs
 FROM PUBLIC,lebrands_app,anon,authenticated,service_role;

CREATE FUNCTION public.catalogue_cost_actor(sid uuid,token text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; member_role text;
BEGIN
 IF sid IS DISTINCT FROM nullif(current_setting('app.store_id',true),'')::uuid
   OR NOT public.authorize_store_session(token,sid) THEN
   RAISE EXCEPTION 'Cost access denied' USING ERRCODE='42501';
 END IF;
 SELECT se.user_id,m.role INTO actor,member_role FROM public.sessions se
 JOIN public.store_members m ON m.user_id=se.user_id AND m.store_id=sid
 WHERE se.token_hash=token AND se.expires_at>now();
 IF actor IS NULL OR member_role NOT IN ('owner','admin') THEN
   RAISE EXCEPTION 'Only owners and admins can manage product costs' USING ERRCODE='42501';
 END IF;
 RETURN actor;
END $$;
REVOKE ALL ON FUNCTION public.catalogue_cost_actor(uuid,text) FROM PUBLIC,lebrands_app,anon,authenticated,service_role;

CREATE FUNCTION public.catalogue_cost_set(sid uuid,token text,pid uuid,oid uuid,amount bigint,expected integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; p public.products%ROWTYPE; c public.catalogue_costs%ROWTYPE;
 old_amount bigint; next_revision integer; label text; currency_code char(3);
BEGIN
 actor:=public.catalogue_cost_actor(sid,token);
 IF expected IS NULL OR expected<0 OR amount<0 OR amount>1000000000000 THEN
   RAISE EXCEPTION 'Use a non-negative cost and valid revision' USING ERRCODE='22023';
 END IF;
 SELECT * INTO p FROM public.products WHERE store_id=sid AND id=pid FOR UPDATE;
 IF NOT FOUND OR p.status='archived' THEN
   RAISE EXCEPTION 'Choose an existing unarchived product in this store' USING ERRCODE='22023';
 END IF;
 IF oid IS NOT NULL THEN
   SELECT coalesce(nullif(sku,''),name||': '||value) INTO label
    FROM public.product_options WHERE store_id=sid AND product_id=pid AND id=oid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Choose a SKU belonging to this product and store' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT * INTO c FROM public.catalogue_costs WHERE store_id=sid AND product_id=pid AND product_option_id IS NOT DISTINCT FROM oid FOR UPDATE;
 IF coalesce(c.revision,0)<>expected THEN
   RAISE EXCEPTION 'Cost changed. Reload the latest costs before saving.' USING ERRCODE='40001';
 END IF;
 old_amount:=CASE WHEN oid IS NULL THEN p.cost_price_paise ELSE c.cost_price_paise END;
 IF old_amount IS NOT DISTINCT FROM amount THEN RETURN jsonb_build_object('revision',coalesce(c.revision,0)); END IF;
 next_revision:=coalesce(c.revision,0)+1;
 SELECT currency INTO currency_code FROM public.stores WHERE store_id=sid;
 IF oid IS NULL THEN UPDATE public.products SET cost_price_paise=amount WHERE store_id=sid AND id=pid; END IF;
 IF c.id IS NULL THEN
   INSERT INTO public.catalogue_costs(store_id,product_id,product_option_id,cost_price_paise,revision)
    VALUES(sid,pid,oid,CASE WHEN oid IS NULL THEN NULL ELSE amount END,next_revision);
 ELSE
   UPDATE public.catalogue_costs SET cost_price_paise=CASE WHEN oid IS NULL THEN NULL ELSE amount END,
    revision=next_revision,updated_at=clock_timestamp() WHERE id=c.id;
 END IF;
 INSERT INTO public.catalogue_cost_history(store_id,product_id,product_option_id,variant_label,
   previous_cost_paise,cost_price_paise,currency,revision,actor_user_id)
  VALUES(sid,pid,oid,label,old_amount,amount,currency_code,next_revision,actor);
 RETURN jsonb_build_object('revision',next_revision);
END $$;

CREATE FUNCTION public.catalogue_cost_list(sid uuid,token text,query text DEFAULT '',missing_only boolean DEFAULT false,
 page_limit integer DEFAULT 50,page_offset integer DEFAULT 0) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb; currency_code char(3);
BEGIN
 PERFORM public.catalogue_cost_actor(sid,token);
 IF page_limit IS NULL OR page_offset IS NULL OR query IS NULL OR missing_only IS NULL OR
    page_limit NOT BETWEEN 1 AND 100 OR page_offset<0 OR length(query)>100 THEN
   RAISE EXCEPTION 'Use valid cost filters' USING ERRCODE='22023';
 END IF;
 SELECT currency INTO currency_code FROM public.stores WHERE store_id=sid;
 WITH entries AS (
  SELECT p.id AS product_id,NULL::uuid AS product_option_id,p.title,coalesce(p.sku,'') AS sku,
   NULL::text AS variant_label,p.cost_price_paise,p.cost_price_paise AS effective_cost_paise,
   CASE WHEN p.cost_price_paise IS NULL THEN 'missing' ELSE 'product' END AS cost_source,
   coalesce(c.revision,0) AS revision,c.updated_at AS updated_at,p.created_at,0 AS row_order
  FROM public.products p LEFT JOIN public.catalogue_costs c ON c.store_id=p.store_id AND c.product_id=p.id AND c.product_option_id IS NULL
  WHERE p.store_id=sid AND p.status<>'archived'
  UNION ALL
  SELECT p.id,v.id,p.title,coalesce(v.sku,''),v.name||': '||v.value,c.cost_price_paise,
   coalesce(c.cost_price_paise,p.cost_price_paise),
   CASE WHEN c.cost_price_paise IS NOT NULL THEN 'override' WHEN p.cost_price_paise IS NOT NULL THEN 'inherited' ELSE 'missing' END,
   coalesce(c.revision,0),CASE WHEN c.cost_price_paise IS NOT NULL THEN c.updated_at ELSE greatest(c.updated_at,b.updated_at) END,p.created_at,v.sort_order+1
  FROM public.products p JOIN public.product_options v ON v.store_id=p.store_id AND v.product_id=p.id
  LEFT JOIN public.catalogue_costs c ON c.store_id=p.store_id AND c.product_id=p.id AND c.product_option_id=v.id
  LEFT JOIN public.catalogue_costs b ON b.store_id=p.store_id AND b.product_id=p.id AND b.product_option_id IS NULL
  WHERE p.store_id=sid AND p.status<>'archived'
 ), filtered AS (
  SELECT * FROM entries WHERE (NOT missing_only OR effective_cost_paise IS NULL)
   AND (query='' OR position(lower(query) IN lower(title||' '||sku||' '||coalesce(variant_label,'')))>0)
 ), page AS (
  SELECT * FROM filtered ORDER BY lower(title),product_id,row_order,product_option_id
  LIMIT page_limit OFFSET page_offset
 )
 SELECT jsonb_build_object('available',true,'can_edit',true,'currency',currency_code,
   'items',coalesce((SELECT jsonb_agg(to_jsonb(x)-'created_at'-'row_order') FROM page x),'[]'::jsonb),
   'total',(SELECT count(*) FROM filtered),'limit',page_limit,'offset',page_offset) INTO result;
 RETURN result;
END $$;

CREATE FUNCTION public.catalogue_cost_history_read(sid uuid,token text,pid uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM public.catalogue_cost_actor(sid,token);
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(h)) FROM (
  SELECT h.id,h.product_id,h.product_option_id,h.variant_label,h.previous_cost_paise,h.cost_price_paise,
    h.currency,h.revision,h.effective_at,public.store_actor_name(sid,h.actor_user_id) AS actor_name
  FROM public.catalogue_cost_history h WHERE h.store_id=sid AND h.product_id=pid
  ORDER BY h.effective_at DESC,h.id DESC LIMIT 100
 )h),'[]'::jsonb);
END $$;

CREATE FUNCTION public.catalogue_product_cost_read(sid uuid,token text,pid uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM public.catalogue_cost_actor(sid,token);
 RETURN (SELECT jsonb_build_object('cost_price_paise',p.cost_price_paise,'cost_revision',coalesce(c.revision,0))
  FROM public.products p LEFT JOIN public.catalogue_costs c ON c.store_id=p.store_id AND c.product_id=p.id AND c.product_option_id IS NULL
  WHERE p.store_id=sid AND p.id=pid);
END $$;

-- Plain APP catalogue writes must not bypass the tenant/actor-checked cost setter.
CREATE FUNCTION public.catalogue_cost_write_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF current_user='lebrands_app' AND
   ((TG_OP='INSERT' AND NEW.cost_price_paise IS NOT NULL) OR
    (TG_OP='UPDATE' AND NEW.cost_price_paise IS DISTINCT FROM OLD.cost_price_paise)) THEN
   RAISE EXCEPTION 'Use the authorised catalogue cost function' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER products_cost_guard BEFORE INSERT OR UPDATE OF cost_price_paise ON public.products
 FOR EACH ROW EXECUTE FUNCTION public.catalogue_cost_write_guard();

CREATE FUNCTION public.capture_order_item_cost() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE amount bigint; source text:='missing'; order_currency char(3); store_currency char(3);
BEGIN
 IF NEW.store_id IS DISTINCT FROM nullif(current_setting('app.store_id',true),'')::uuid THEN
   RAISE EXCEPTION 'Cost snapshot tenant mismatch' USING ERRCODE='42501';
 END IF;
 SELECT o.currency,s.currency INTO order_currency,store_currency FROM public.orders o
 JOIN public.stores s ON s.store_id=o.store_id WHERE o.store_id=NEW.store_id AND o.id=NEW.order_id;
 SELECT cost_price_paise INTO amount FROM public.catalogue_costs
  WHERE store_id=NEW.store_id AND product_id=NEW.product_id AND product_option_id=NEW.product_option_id;
 IF amount IS NOT NULL THEN source:='override';
 ELSE
  SELECT cost_price_paise INTO amount FROM public.products WHERE store_id=NEW.store_id AND id=NEW.product_id;
  IF amount IS NOT NULL THEN source:='product'; END IF;
 END IF;
 IF order_currency<>store_currency THEN amount:=NULL;source:='currency_mismatch'; END IF;
 INSERT INTO public.order_item_costs(store_id,order_item_id,product_id,product_option_id,unit_cost_paise,currency,cost_source,capture_reason)
  VALUES(NEW.store_id,NEW.id,NEW.product_id,NEW.product_option_id,amount,order_currency,source,'at_order_creation');
 RETURN NEW;
END $$;
CREATE TRIGGER capture_order_item_cost AFTER INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.capture_order_item_cost();

REVOKE ALL ON FUNCTION public.catalogue_cost_set(uuid,text,uuid,uuid,bigint,integer),
 public.catalogue_cost_list(uuid,text,text,boolean,integer,integer),
 public.catalogue_cost_history_read(uuid,text,uuid),public.catalogue_cost_write_guard(),public.capture_order_item_cost()
 FROM PUBLIC,lebrands_app,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.catalogue_cost_set(uuid,text,uuid,uuid,bigint,integer),
 public.catalogue_cost_list(uuid,text,text,boolean,integer,integer),public.catalogue_cost_history_read(uuid,text,uuid) TO lebrands_app;
REVOKE ALL ON FUNCTION public.catalogue_product_cost_read(uuid,text,uuid) FROM PUBLIC,lebrands_app,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.catalogue_product_cost_read(uuid,text,uuid) TO lebrands_app;
