-- Manual staged migration. No charges, historical repricing or published edits.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Offers migration requires an administrative BYPASSRLS role';
 END IF;
END $$;
ALTER TABLE public.order_items ADD COLUMN discount_paise bigint NOT NULL DEFAULT 0
 CHECK(discount_paise>=0 AND discount_paise<=total_paise);
CREATE FUNCTION public.offer_line_amount() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.discount_paise:=CASE WHEN EXISTS(SELECT 1 FROM public.orders
    WHERE store_id=NEW.store_id AND id=NEW.order_id AND discount_paise>0)
    THEN NEW.total_paise-NEW.taxable_paise-NEW.tax_paise ELSE 0 END;
 ELSIF NEW.discount_paise IS DISTINCT FROM OLD.discount_paise THEN
  RAISE EXCEPTION 'Historical discount allocations are immutable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.offer_line_amount() FROM PUBLIC;
CREATE TRIGGER offer_line_amount BEFORE INSERT OR UPDATE ON public.order_items
 FOR EACH ROW EXECUTE FUNCTION public.offer_line_amount();
CREATE TABLE public.offers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES public.stores(store_id),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
 method text NOT NULL CHECK(method IN ('automatic','code')),
 scope text NOT NULL CHECK(scope IN ('order','product','collection')),
 kind text NOT NULL CHECK(kind IN ('percentage','fixed','buy_x_get_y','bundle','tiered','shipping')),
 value bigint NOT NULL DEFAULT 0 CHECK(value>=0 AND value<=10000000000),
 currency char(3) NOT NULL DEFAULT 'INR',
 min_spend_paise bigint NOT NULL DEFAULT 0 CHECK(min_spend_paise>=0),
 min_quantity integer NOT NULL DEFAULT 1 CHECK(min_quantity BETWEEN 1 AND 10000),
 max_discount_paise bigint CHECK(max_discount_paise>0),
 starts_at timestamptz,
 ends_at timestamptz,
 usage_limit integer CHECK(usage_limit>0),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','paused')),
 revision integer NOT NULL DEFAULT 1,
 rule_version integer NOT NULL DEFAULT 1 CHECK(rule_version>0),
 rules jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(rules)='object'),
 combination_policy jsonb NOT NULL DEFAULT '{"mode":"best_single"}'::jsonb
   CHECK(combination_policy='{"mode":"best_single"}'::jsonb),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(store_id,id),
 CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at>starts_at),
 CHECK(status<>'active' OR (kind IN ('percentage','fixed') AND value>0
   AND (kind<>'percentage' OR value<=10000) AND rules='{}'::jsonb AND rule_version=1))
);
CREATE INDEX offers_store_status ON public.offers(store_id,status);
CREATE TABLE public.offer_targets (
 store_id uuid NOT NULL,
 offer_id uuid NOT NULL,
 product_id uuid,
 collection_id uuid,
 excluded boolean NOT NULL DEFAULT false,
 FOREIGN KEY(store_id,offer_id) REFERENCES public.offers(store_id,id) ON DELETE CASCADE,
 FOREIGN KEY(store_id,product_id) REFERENCES public.products(store_id,id),
 FOREIGN KEY(store_id,collection_id) REFERENCES public.collections(store_id,id),
 CHECK((product_id IS NULL)<>(collection_id IS NULL))
);
CREATE UNIQUE INDEX offer_product_target ON public.offer_targets(store_id,offer_id,product_id) WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX offer_collection_target ON public.offer_targets(store_id,offer_id,collection_id) WHERE collection_id IS NOT NULL;
CREATE TABLE public.offer_codes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL,
 offer_id uuid NOT NULL,
 code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9-]{2,31}$'),
 active boolean NOT NULL DEFAULT true,
 FOREIGN KEY(store_id,offer_id) REFERENCES public.offers(store_id,id) ON DELETE CASCADE,
 UNIQUE(store_id,code), UNIQUE(store_id,id)
);
-- Future bundle composition is relational, not hidden in a product description.
-- Activation stays blocked until its versioned evaluator is implemented.
CREATE TABLE public.offer_bundles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL,
 offer_id uuid NOT NULL,
 name text NOT NULL,
 pricing_mode text NOT NULL CHECK(pricing_mode IN ('fixed_total','percentage','cheapest_free')),
 configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(configuration)='object'),
 FOREIGN KEY(store_id,offer_id) REFERENCES public.offers(store_id,id) ON DELETE CASCADE,
 UNIQUE(store_id,id)
);
CREATE UNIQUE INDEX offer_bundle_sku_identity ON public.product_options(store_id,product_id,id);
CREATE TABLE public.offer_bundle_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL,
 bundle_id uuid NOT NULL,
 product_id uuid,
 product_option_id uuid,
 collection_id uuid,
 role text NOT NULL CHECK(role IN ('qualifier','reward','component')),
 quantity integer NOT NULL CHECK(quantity>0),
 FOREIGN KEY(store_id,bundle_id) REFERENCES public.offer_bundles(store_id,id) ON DELETE CASCADE,
 FOREIGN KEY(store_id,product_id) REFERENCES public.products(store_id,id),
 FOREIGN KEY(store_id,collection_id) REFERENCES public.collections(store_id,id),
 FOREIGN KEY(store_id,product_id,product_option_id) REFERENCES public.product_options(store_id,product_id,id),
 CHECK((product_id IS NULL)<>(collection_id IS NULL)),
 CHECK(product_option_id IS NULL OR product_id IS NOT NULL)
);
CREATE TABLE public.offer_redemptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL,
 offer_id uuid NOT NULL,
 order_id uuid NOT NULL,
 customer_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('held','committed','released')),
 amount_paise bigint NOT NULL CHECK(amount_paise>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(store_id,offer_id) REFERENCES public.offers(store_id,id),
 FOREIGN KEY(store_id,order_id) REFERENCES public.orders(store_id,id),
 FOREIGN KEY(store_id,customer_id) REFERENCES public.customers(store_id,id),
 UNIQUE(store_id,order_id,offer_id)
);
CREATE INDEX offer_usage ON public.offer_redemptions(store_id,offer_id,state);
CREATE TABLE public.order_discounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL,
 order_id uuid NOT NULL,
 offer_id uuid NOT NULL,
 amount_paise bigint NOT NULL CHECK(amount_paise>0),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(store_id,order_id) REFERENCES public.orders(store_id,id),
 FOREIGN KEY(store_id,offer_id) REFERENCES public.offers(store_id,id),
 UNIQUE(store_id,id), UNIQUE(store_id,order_id,offer_id)
);
CREATE UNIQUE INDEX order_items_offer_identity ON public.order_items(store_id,id);
CREATE TABLE public.order_item_discounts (
 store_id uuid NOT NULL,
 order_discount_id uuid NOT NULL,
 order_item_id uuid NOT NULL,
 amount_paise bigint NOT NULL CHECK(amount_paise>0),
 FOREIGN KEY(store_id,order_discount_id) REFERENCES public.order_discounts(store_id,id),
 FOREIGN KEY(store_id,order_item_id) REFERENCES public.order_items(store_id,id),
 PRIMARY KEY(store_id,order_discount_id,order_item_id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['offers','offer_targets','offer_codes','offer_bundles','offer_bundle_items',
   'offer_redemptions','order_discounts','order_item_discounts'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_scope ON public.%I USING (store_id = nullif(current_setting(''app.store_id'',true),'''')::uuid) WITH CHECK (store_id = nullif(current_setting(''app.store_id'',true),'''')::uuid)',t);
  EXECUTE format('GRANT SELECT ON public.%I TO lebrands_app',t);
 END LOOP;
END $$;
-- Configuration writes require an authenticated owner/admin, never a public cart.
CREATE FUNCTION public.store_offer_save(p_store uuid,p_token text,p_data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid; v_id uuid; v_old public.offers; v_target text; v_scope text; v_code text;
BEGIN
 IF p_store IS DISTINCT FROM nullif(current_setting('app.store_id',true),'')::uuid
   OR NOT public.authorize_store_session(p_token,p_store) THEN
   RAISE EXCEPTION 'Store access denied' USING ERRCODE='42501';
 END IF;
 SELECT s.user_id INTO v_user FROM public.sessions s WHERE s.token_hash=p_token AND s.expires_at>now();
 IF NOT EXISTS(SELECT 1 FROM public.store_members m WHERE m.store_id=p_store AND m.user_id=v_user AND m.role IN ('owner','admin')) THEN
   RAISE EXCEPTION 'Offer management requires owner or admin' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.stores WHERE store_id=p_store FOR UPDATE;
 v_id:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
 SELECT * INTO v_old FROM public.offers WHERE store_id=p_store AND id=v_id FOR UPDATE;
 IF p_data ? 'id' AND (NOT FOUND OR v_old.revision IS DISTINCT FROM (p_data->>'expected_revision')::integer) THEN
   RAISE EXCEPTION 'Offer changed; reload before saving' USING ERRCODE='40001';
 END IF;
 v_scope:=p_data->>'scope';v_code:=nullif(p_data->>'code','');
 IF p_data->>'kind' NOT IN ('percentage','fixed') OR coalesce(p_data->>'status','') NOT IN ('draft','active','paused')
   OR coalesce(p_data->>'method','') NOT IN ('automatic','code') OR v_scope NOT IN ('order','product','collection')
   OR (p_data->>'value')::bigint<=0 OR (p_data->>'kind'='percentage' AND (p_data->>'value')::bigint>10000)
   OR (p_data->>'method'='code' AND (v_code IS NULL OR v_code !~ '^[A-Z0-9][A-Z0-9-]{2,31}$'))
   OR jsonb_typeof(p_data->'target_ids') IS DISTINCT FROM 'array'
   OR (v_scope<>'order' AND jsonb_array_length(p_data->'target_ids')=0)
   THEN RAISE EXCEPTION 'Invalid offer' USING ERRCODE='22023'; END IF;
 IF v_old.id IS NOT NULL AND EXISTS(SELECT 1 FROM public.offer_redemptions WHERE store_id=p_store AND offer_id=v_id AND state IN ('held','committed'))
   AND (v_old.method<>p_data->>'method' OR
     (SELECT code FROM public.offer_codes WHERE store_id=p_store AND offer_id=v_id AND active LIMIT 1) IS DISTINCT FROM
       CASE WHEN p_data->>'method'='code' THEN v_code ELSE NULL END) THEN
   RAISE EXCEPTION 'Used offer codes cannot be renamed; create another offer' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.offers(id,store_id,title,method,scope,kind,value,currency,min_spend_paise,min_quantity,
   max_discount_paise,starts_at,ends_at,usage_limit,status)
 VALUES(v_id,p_store,p_data->>'title',p_data->>'method',v_scope,p_data->>'kind',(p_data->>'value')::bigint,
   (SELECT currency FROM public.stores WHERE store_id=p_store),(p_data->>'min_spend_paise')::bigint,
   (p_data->>'min_quantity')::integer,(p_data->>'max_discount_paise')::bigint,
   (p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz,(p_data->>'usage_limit')::integer,p_data->>'status')
 ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,method=EXCLUDED.method,scope=EXCLUDED.scope,kind=EXCLUDED.kind,
   value=EXCLUDED.value,min_spend_paise=EXCLUDED.min_spend_paise,min_quantity=EXCLUDED.min_quantity,
   max_discount_paise=EXCLUDED.max_discount_paise,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,
   usage_limit=EXCLUDED.usage_limit,status=EXCLUDED.status,revision=public.offers.revision+1,updated_at=now()
 WHERE public.offers.store_id=p_store;
 DELETE FROM public.offer_targets WHERE store_id=p_store AND offer_id=v_id;
 FOR v_target IN SELECT jsonb_array_elements_text(p_data->'target_ids') LOOP
  IF v_scope='product' THEN INSERT INTO public.offer_targets(store_id,offer_id,product_id) VALUES(p_store,v_id,v_target::uuid);
  ELSIF v_scope='collection' THEN INSERT INTO public.offer_targets(store_id,offer_id,collection_id) VALUES(p_store,v_id,v_target::uuid);
  END IF;
 END LOOP;
 -- Retain old codes as inactive reservations, so another promotion cannot reuse
 -- a code customers have already seen in historical orders.
 UPDATE public.offer_codes SET active=false WHERE store_id=p_store AND offer_id=v_id;
 IF p_data->>'method'='code' THEN
  INSERT INTO public.offer_codes(store_id,offer_id,code) VALUES(p_store,v_id,v_code)
  ON CONFLICT(store_id,code) DO UPDATE SET active=true WHERE public.offer_codes.offer_id=v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Code already belongs to another offer' USING ERRCODE='23505'; END IF;
 END IF;
 INSERT INTO public.audit_log(store_id,actor_type,actor_user_id,action,entity_type,entity_id)
 VALUES(p_store,'user',v_user,'offer.saved','offer',v_id);
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.store_offer_save(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_offer_save(uuid,text,jsonb) TO lebrands_app;
GRANT INSERT ON public.offer_redemptions,public.order_discounts,public.order_item_discounts TO lebrands_app;
-- Existing order/payment transitions own held redemption recovery.
CREATE FUNCTION public.offer_order_transition() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.status IN ('paid','processing','packed','shipped','delivered') THEN
  UPDATE public.offer_redemptions SET state='committed' WHERE store_id=NEW.store_id AND order_id=NEW.id AND state='held';
 ELSIF NEW.status IN ('cancelled','refunded','returned','rto') THEN
  UPDATE public.offer_redemptions SET state='released' WHERE store_id=NEW.store_id AND order_id=NEW.id AND state='held';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.offer_order_transition() FROM PUBLIC;
CREATE TRIGGER offer_order_transition AFTER UPDATE OF status ON public.orders
 FOR EACH ROW EXECUTE FUNCTION public.offer_order_transition();
