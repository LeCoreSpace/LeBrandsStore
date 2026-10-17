-- Brand-specific values remain tenant-owned and cannot contaminate public masters.
ALTER TABLE public.catalogue_variant_option_values
  ADD COLUMN store_id uuid REFERENCES public.stores(store_id) ON DELETE CASCADE,
  ADD COLUMN product_type_id bigint REFERENCES public.catalogue_product_types(id),
  ADD CONSTRAINT catalogue_private_value_context CHECK((store_id IS NULL)=(product_type_id IS NULL));
ALTER TABLE public.catalogue_product_type_option_values
  ADD COLUMN store_id uuid REFERENCES public.stores(store_id) ON DELETE CASCADE;
CREATE INDEX catalogue_private_value_lookup ON public.catalogue_variant_option_values(store_id,product_type_id,option_id);
DROP POLICY catalogue_reference_read ON public.catalogue_variant_option_values;
DROP POLICY catalogue_reference_read ON public.catalogue_product_type_option_values;
CREATE POLICY catalogue_reference_read ON public.catalogue_variant_option_values FOR SELECT TO lebrands_app
  USING(review_status='approved' AND(store_id IS NULL OR store_id=NULLIF(current_setting('app.store_id',true),'')::uuid));
CREATE POLICY catalogue_reference_read ON public.catalogue_product_type_option_values FOR SELECT TO lebrands_app
  USING(review_status='approved' AND(store_id IS NULL OR store_id=NULLIF(current_setting('app.store_id',true),'')::uuid));

CREATE FUNCTION public.catalogue_assert_writer(p_store uuid,p_token text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_store IS DISTINCT FROM NULLIF(current_setting('app.store_id',true),'')::uuid
    OR NOT public.authorize_store_session(p_token,p_store) OR NOT EXISTS(
      SELECT 1 FROM public.sessions s JOIN public.store_members m ON m.user_id=s.user_id
      WHERE s.token_hash=p_token AND m.store_id=p_store AND m.role IN('owner','admin'))
  THEN RAISE EXCEPTION 'Store write denied' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.catalogue_assert_writer(uuid,text) FROM PUBLIC,lebrands_app,anon,authenticated,service_role;

CREATE FUNCTION public.catalogue_private_value_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v public.catalogue_variant_option_values%ROWTYPE; typ bigint;
BEGIN
  SELECT * INTO v FROM public.catalogue_variant_option_values WHERE id=NEW.value_id AND option_id=NEW.option_id;
  IF TG_TABLE_NAME='catalogue_product_type_option_values' THEN
    IF v.store_id IS DISTINCT FROM NEW.store_id OR (v.store_id IS NOT NULL AND v.product_type_id IS DISTINCT FROM NEW.product_type_id)
    THEN RAISE EXCEPTION 'Variant value ownership mismatch' USING ERRCODE='42501'; END IF;
  ELSIF v.store_id IS NOT NULL THEN
    SELECT product_type_id INTO typ FROM public.products WHERE store_id=NEW.store_id AND id=NEW.product_id;
    IF v.store_id IS DISTINCT FROM NEW.store_id OR v.product_type_id IS DISTINCT FROM typ
    THEN RAISE EXCEPTION 'Variant value isolation denied' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.catalogue_private_value_guard() FROM PUBLIC,lebrands_app,anon,authenticated,service_role;
CREATE TRIGGER catalogue_private_mapping_guard BEFORE INSERT OR UPDATE ON public.catalogue_product_type_option_values
FOR EACH ROW EXECUTE FUNCTION public.catalogue_private_value_guard();
CREATE TRIGGER catalogue_private_axis_guard BEFORE INSERT OR UPDATE ON public.product_variant_axis_values
FOR EACH ROW EXECUTE FUNCTION public.catalogue_private_value_guard();
CREATE TRIGGER catalogue_private_sku_guard BEFORE INSERT OR UPDATE ON public.product_variant_option_values
FOR EACH ROW EXECUTE FUNCTION public.catalogue_private_value_guard();

CREATE FUNCTION public.catalogue_add_variant_value(p_store uuid,p_token text,p_type bigint,p_option bigint,p_value text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result_id bigint; result_label text; next_order integer; value_key text;
BEGIN
  PERFORM public.catalogue_assert_writer(p_store,p_token);
  p_value:=btrim(p_value);
  IF p_value IS NULL OR length(p_value) NOT BETWEEN 1 AND 200 OR p_value ~ '[[:cntrl:]<>]'
  THEN RAISE EXCEPTION 'Enter a value of 1 to 200 characters without markup or control characters' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.stores WHERE store_id=p_store FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.catalogue_product_types t
    JOIN public.catalogue_product_type_options m ON m.product_type_id=t.id
    JOIN public.catalogue_variant_options o ON o.id=m.option_id
    WHERE t.id=p_type AND o.id=p_option AND t.review_status='approved' AND t.is_active
      AND m.review_status='approved' AND m.is_active AND o.review_status='approved' AND o.is_active
      AND EXISTS(SELECT 1 FROM public.catalogue_subcategory_product_types st
        JOIN public.catalogue_subcategories s USING(subcategory_id)
        JOIN public.catalogue_categories c ON c.category_id=s.category_id
        WHERE st.product_type_id=t.id AND st.review_status='approved' AND st.is_active AND s.is_active AND c.is_active))
  THEN RAISE EXCEPTION 'Select an available product type and one of its product options' USING ERRCODE='22023'; END IF;
  SELECT v.id,v.label INTO result_id,result_label FROM public.catalogue_variant_option_values v
    JOIN public.catalogue_product_type_option_values m ON m.value_id=v.id AND m.option_id=v.option_id
    WHERE m.product_type_id=p_type AND v.option_id=p_option AND lower(v.label)=lower(p_value)
      AND v.is_active AND m.is_active AND v.review_status='approved' AND m.review_status='approved'
      AND (v.store_id IS NULL OR(v.store_id=p_store AND v.product_type_id=p_type))
      AND (m.store_id IS NULL OR m.store_id=p_store)
    ORDER BY (v.store_id IS NOT NULL) DESC,v.id LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('value',jsonb_build_object('id',result_id,'value',result_label),'created',false); END IF;
  SELECT count(*)::integer INTO next_order FROM public.catalogue_variant_option_values
    WHERE store_id=p_store AND product_type_id=p_type AND option_id=p_option;
  IF next_order>=500 THEN RAISE EXCEPTION 'This store already has 500 custom values for this product option' USING ERRCODE='22023'; END IF;
  value_key:='private_'||replace(p_store::text,'-','')||'_'||p_type::text||'_'||md5(lower(p_value));
  INSERT INTO public.catalogue_variant_option_values(option_id,value_key,label,sort_order,review_status,is_active,store_id,product_type_id)
    VALUES(p_option,value_key,p_value,next_order,'approved',true,p_store,p_type) RETURNING id INTO result_id;
  INSERT INTO public.catalogue_product_type_option_values(product_type_id,option_id,value_id,sort_order,review_status,is_active,store_id)
    VALUES(p_type,p_option,result_id,next_order+10000,'approved',true,p_store);
  RETURN jsonb_build_object('value',jsonb_build_object('id',result_id,'value',p_value),'created',true);
END $$;
REVOKE ALL ON FUNCTION public.catalogue_add_variant_value(uuid,text,bigint,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.catalogue_add_variant_value(uuid,text,bigint,bigint,text) TO lebrands_app;

-- Keep the original writer and its concurrency, financial isolation and retired
-- selection checks intact. All entry points now guard tenant-private values,
-- including the "unchanged" branch of the historical writer.
ALTER FUNCTION public.catalogue_write_product(uuid,uuid,text,integer,jsonb,text) RENAME TO catalogue_write_product_v1;
REVOKE ALL ON FUNCTION public.catalogue_write_product_v1(uuid,uuid,text,integer,jsonb,text) FROM PUBLIC,lebrands_app,anon,authenticated,service_role;
CREATE FUNCTION public.catalogue_write_product(p_store uuid,p_product uuid,p_token text,p_revision integer,p_selection jsonb,p_action text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM public.catalogue_assert_writer(p_store,p_token);
  IF jsonb_typeof(p_selection->'options')='array' THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_selection->'options') a
      CROSS JOIN LATERAL jsonb_array_elements_text(a->'value_ids') requested(id)
      JOIN public.catalogue_variant_option_values v ON v.id=requested.id::bigint
      WHERE v.store_id IS NOT NULL AND(v.store_id IS DISTINCT FROM p_store
        OR v.product_type_id IS DISTINCT FROM (p_selection->>'product_type_id')::bigint))
    THEN RAISE EXCEPTION 'Variant value isolation denied' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN public.catalogue_write_product_v1(p_store,p_product,p_token,p_revision,p_selection,p_action);
END $$;
REVOKE ALL ON FUNCTION public.catalogue_write_product(uuid,uuid,text,integer,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.catalogue_write_product(uuid,uuid,text,integer,jsonb,text) TO lebrands_app;
