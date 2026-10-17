-- Phase 3: private transactional writes; never approve or populate masters.
ALTER TABLE public.products ADD COLUMN catalogue_revision integer NOT NULL DEFAULT 0 CHECK(catalogue_revision>=0);
ALTER TABLE public.product_variant_axis_values ADD COLUMN sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order>=0);

CREATE FUNCTION public.catalogue_product_selection(p_store uuid,p_product uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN p.product_type_id IS NULL THEN NULL ELSE jsonb_build_object(
   'category_id',p.category_id,'subcategory_id',p.subcategory_id,'product_type_id',p.product_type_id,
   'expected_revision',p.catalogue_revision,
   'options',COALESCE((SELECT jsonb_agg(jsonb_build_object('option_id',a.option_id,
     'value_ids',(SELECT jsonb_agg(v.value_id ORDER BY v.sort_order,v.value_id)
       FROM public.product_variant_axis_values v WHERE v.store_id=p.store_id AND v.product_id=p.id AND v.option_id=a.option_id))
     ORDER BY a.position) FROM public.product_variant_axes a WHERE a.store_id=p.store_id AND a.product_id=p.id),'[]'::jsonb),
   'descriptors',COALESCE((SELECT jsonb_agg(d.selection ORDER BY d.descriptor_id) FROM (
     SELECT v.descriptor_id,CASE
       WHEN v.input_type IN('single_select','multi_select') THEN jsonb_build_object('descriptor_id',v.descriptor_id,'value_ids',jsonb_agg(v.value_id ORDER BY v.value_id))
       WHEN v.input_type='text' THEN jsonb_build_object('descriptor_id',v.descriptor_id,'text_value',max(v.text_value))
       WHEN v.input_type='number' THEN jsonb_build_object('descriptor_id',v.descriptor_id,'number_value',max(v.number_value))
       ELSE jsonb_build_object('descriptor_id',v.descriptor_id,'boolean_value',bool_or(v.boolean_value)) END AS selection
     FROM public.product_descriptor_values v WHERE v.store_id=p.store_id AND v.product_id=p.id
     GROUP BY v.descriptor_id,v.input_type) d),'[]'::jsonb)) END
 FROM public.products p WHERE p.store_id=p_store AND p.id=p_product
   AND p_store=NULLIF(current_setting('app.store_id',true),'')::uuid
$$;
REVOKE ALL ON FUNCTION public.catalogue_product_selection(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalogue_product_selection(uuid,uuid) TO lebrands_app;

CREATE FUNCTION public.catalogue_write_product(
 p_store uuid,p_product uuid,p_token text,p_revision integer,p_selection jsonb,p_action text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p public.products%ROWTYPE; previous jsonb; unchanged boolean; axis jsonb; detail jsonb;
  opt bigint; val bigint; typ bigint; sub bigint; cat bigint; pos integer; value_pos integer;
  def public.catalogue_descriptors%ROWTYPE; input_key text; expected integer:=1; qty integer;
  axes jsonb:='[]'::jsonb; labels jsonb; option_label text; category_label text; subcategory_label text;
BEGIN
 IF p_store IS DISTINCT FROM NULLIF(current_setting('app.store_id',true),'')::uuid
   OR NOT public.authorize_store_session(p_token,p_store) OR NOT EXISTS(
     SELECT 1 FROM public.sessions s JOIN public.store_members m ON m.user_id=s.user_id
     WHERE s.token_hash=p_token AND m.store_id=p_store AND m.role IN('owner','admin'))
 THEN RAISE EXCEPTION 'Store write denied' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN('prepare','save','clear') OR p_revision IS NULL OR p_revision<0
 THEN RAISE EXCEPTION 'Invalid catalogue operation' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.stores WHERE store_id=p_store FOR UPDATE;
 SELECT * INTO p FROM public.products WHERE store_id=p_store AND id=p_product FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product isolation denied' USING ERRCODE='42501'; END IF;
 IF p.catalogue_revision<>p_revision THEN
   RAISE EXCEPTION 'Product classification changed; reload' USING ERRCODE='40001';
 END IF;
 IF p_action='prepare' THEN
   -- Deferred consistency triggers prohibit committing incomplete SKU links.
   DELETE FROM public.product_variant_option_values WHERE store_id=p_store AND product_id=p_product;
   RETURN p_revision;
 END IF;
 previous:=public.catalogue_product_selection(p_store,p_product);
 IF p_action='clear' THEN
   IF NOT COALESCE(p_selection->'clear'='true'::jsonb,false) OR EXISTS(
     SELECT 1 FROM public.product_options WHERE store_id=p_store AND product_id=p_product)
   THEN RAISE EXCEPTION 'Remove variants before clearing classification' USING ERRCODE='22023'; END IF;
 ELSE
   IF NOT COALESCE(jsonb_typeof(p_selection)='object' AND
     jsonb_typeof(p_selection->'options')='array' AND jsonb_typeof(p_selection->'descriptors')='array',false)
   THEN RAISE EXCEPTION 'Invalid classification input' USING ERRCODE='22023'; END IF;
   typ:=(p_selection->>'product_type_id')::bigint;
   sub:=(p_selection->>'subcategory_id')::bigint;
   cat:=(p_selection->>'category_id')::bigint;
   unchanged:=(previous-'expected_revision')=(p_selection-'expected_revision');
   IF NOT COALESCE(unchanged,false) AND NOT EXISTS(
     SELECT 1 FROM public.catalogue_subcategory_product_types m
     JOIN public.catalogue_product_types t ON t.id=m.product_type_id
     JOIN public.catalogue_subcategories s ON s.subcategory_id=m.subcategory_id
     JOIN public.catalogue_categories c ON c.category_id=s.category_id
     WHERE t.id=typ AND s.subcategory_id=sub AND c.category_id=cat
       AND m.review_status='approved' AND t.review_status='approved'
       AND m.is_active AND t.is_active AND s.is_active AND c.is_active)
   THEN RAISE EXCEPTION 'Unapproved product type or category' USING ERRCODE='22023'; END IF;
   IF typ IS NULL OR sub IS NULL OR cat IS NULL OR jsonb_array_length(p_selection->'options')>3 OR
     (SELECT count(*)<>count(DISTINCT x->>'option_id') FROM jsonb_array_elements(p_selection->'options') x)
   THEN RAISE EXCEPTION 'Invalid buying options' USING ERRCODE='22023'; END IF;
   pos:=0;
   FOR axis IN SELECT value FROM jsonb_array_elements(p_selection->'options') LOOP
     opt:=(axis->>'option_id')::bigint;
     IF NOT COALESCE(jsonb_typeof(axis->'value_ids')='array',false)
     THEN RAISE EXCEPTION 'Missing option values' USING ERRCODE='22023'; END IF;
     qty:=jsonb_array_length(axis->'value_ids'); expected:=expected*qty;
     IF qty<1 OR qty>50 OR expected>200 OR
       (SELECT count(*)<>count(DISTINCT value) FROM jsonb_array_elements(axis->'value_ids'))
     THEN RAISE EXCEPTION 'Invalid combinations' USING ERRCODE='22023'; END IF;
     IF NOT COALESCE(unchanged,false) AND (NOT EXISTS(
       SELECT 1 FROM public.catalogue_product_type_options m JOIN public.catalogue_variant_options o ON o.id=m.option_id
       WHERE m.product_type_id=typ AND m.option_id=opt AND m.is_active AND o.is_active
         AND m.review_status='approved' AND o.review_status='approved') OR EXISTS(
       SELECT 1 FROM jsonb_array_elements_text(axis->'value_ids') requested(value)
       WHERE NOT EXISTS(SELECT 1 FROM public.catalogue_product_type_option_values m
         JOIN public.catalogue_variant_option_values v ON v.option_id=m.option_id AND v.id=m.value_id
         WHERE m.product_type_id=typ AND m.option_id=opt AND v.id=requested.value::bigint
           AND m.is_active AND v.is_active AND m.review_status='approved' AND v.review_status='approved')))
     THEN RAISE EXCEPTION 'Unapproved option or value' USING ERRCODE='22023'; END IF;
     SELECT o.name INTO option_label FROM public.catalogue_variant_options o WHERE o.id=opt;
     SELECT jsonb_agg(v.label ORDER BY requested.ord) INTO labels
       FROM jsonb_array_elements_text(axis->'value_ids') WITH ORDINALITY requested(value,ord)
       JOIN public.catalogue_variant_option_values v ON v.id=requested.value::bigint AND v.option_id=opt;
     axes:=axes||jsonb_build_array(jsonb_build_object('name',option_label,'values',labels));
     pos:=pos+1;
   END LOOP;
   IF COALESCE(unchanged,false) THEN axes:=p.catalogue->'axes'; END IF;
   IF axes IS DISTINCT FROM COALESCE(p.catalogue->'axes','[]'::jsonb)
   THEN RAISE EXCEPTION 'Combinations do not match classification' USING ERRCODE='22023'; END IF;
   IF (SELECT count(*)<>count(DISTINCT x->>'descriptor_id') FROM jsonb_array_elements(p_selection->'descriptors') x)
   THEN RAISE EXCEPTION 'Repeated descriptor' USING ERRCODE='22023'; END IF;
   FOR detail IN SELECT value FROM jsonb_array_elements(p_selection->'descriptors') LOOP
     SELECT * INTO def FROM public.catalogue_descriptors WHERE id=(detail->>'descriptor_id')::bigint;
     IF NOT FOUND THEN RAISE EXCEPTION 'Unknown descriptor' USING ERRCODE='22023'; END IF;
     IF NOT COALESCE(unchanged,false) AND (def.review_status<>'approved' OR NOT def.is_active OR NOT EXISTS(
       SELECT 1 FROM public.catalogue_product_type_descriptors m WHERE m.product_type_id=typ AND m.descriptor_id=def.id
         AND m.review_status='approved' AND m.is_active))
     THEN RAISE EXCEPTION 'Unapproved descriptor' USING ERRCODE='22023'; END IF;
     input_key:=CASE def.input_type WHEN 'single_select' THEN 'value_ids' WHEN 'multi_select' THEN 'value_ids'
       WHEN 'text' THEN 'text_value' WHEN 'number' THEN 'number_value' ELSE 'boolean_value' END;
     IF NOT detail ? input_key OR (SELECT count(*) FROM jsonb_object_keys(detail))<>2
     THEN RAISE EXCEPTION 'Invalid descriptor input type' USING ERRCODE='22023'; END IF;
     IF input_key='value_ids' THEN
       IF NOT COALESCE(jsonb_typeof(detail->'value_ids')='array',false)
       THEN RAISE EXCEPTION 'Invalid descriptor choices' USING ERRCODE='22023'; END IF;
       IF jsonb_array_length(detail->'value_ids')<1 OR
         (def.input_type='single_select' AND jsonb_array_length(detail->'value_ids')<>1) OR
         (SELECT count(*)<>count(DISTINCT value) FROM jsonb_array_elements(detail->'value_ids')) OR EXISTS(
         SELECT 1 FROM jsonb_array_elements_text(detail->'value_ids') requested(value)
         WHERE NOT EXISTS(SELECT 1 FROM public.catalogue_descriptor_values v
           WHERE v.descriptor_id=def.id AND v.id=requested.value::bigint
             AND (COALESCE(unchanged,false) OR (v.is_active AND v.review_status='approved'))))
       THEN RAISE EXCEPTION 'Invalid descriptor value' USING ERRCODE='22023'; END IF;
     ELSIF jsonb_typeof(detail->input_key) IS DISTINCT FROM
       (CASE def.input_type WHEN 'text' THEN 'string' WHEN 'number' THEN 'number' ELSE 'boolean' END)
     THEN RAISE EXCEPTION 'Invalid scalar descriptor' USING ERRCODE='22023'; END IF;
   END LOOP;
   IF NOT COALESCE(unchanged,false) AND EXISTS(
     SELECT 1 FROM public.catalogue_product_type_descriptors m JOIN public.catalogue_descriptors d ON d.id=m.descriptor_id
     WHERE m.product_type_id=typ AND m.is_required AND m.is_active AND d.is_active
       AND m.review_status='approved' AND d.review_status='approved'
       AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_selection->'descriptors') x WHERE (x->>'descriptor_id')::bigint=m.descriptor_id))
   THEN RAISE EXCEPTION 'Required descriptor missing' USING ERRCODE='22023'; END IF;
 END IF;
 DELETE FROM public.product_variant_option_values WHERE store_id=p_store AND product_id=p_product;
 DELETE FROM public.product_variant_axis_values WHERE store_id=p_store AND product_id=p_product;
 DELETE FROM public.product_variant_axes WHERE store_id=p_store AND product_id=p_product;
 DELETE FROM public.product_descriptor_values WHERE store_id=p_store AND product_id=p_product;
 IF p_action='clear' THEN
   UPDATE public.products SET category_id=NULL,subcategory_id=NULL,product_type_id=NULL,
     catalogue=jsonb_set(catalogue,'{axes}','[]'::jsonb),catalogue_revision=catalogue_revision+1 WHERE store_id=p_store AND id=p_product;
   RETURN p_revision+1;
 END IF;
 SELECT c.name,s.name INTO category_label,subcategory_label FROM public.catalogue_subcategories s
   JOIN public.catalogue_categories c ON c.category_id=s.category_id WHERE s.subcategory_id=sub AND c.category_id=cat;
 UPDATE public.products SET category_id=cat,subcategory_id=sub,product_type_id=typ,catalogue_revision=catalogue_revision+1,
   catalogue=catalogue||jsonb_build_object('category',category_label,'subcategory',subcategory_label,'axes',axes)
   WHERE store_id=p_store AND id=p_product;
 pos:=0;
 FOR axis IN SELECT value FROM jsonb_array_elements(p_selection->'options') LOOP
   pos:=pos+1; opt:=(axis->>'option_id')::bigint;
   INSERT INTO public.product_variant_axes(store_id,product_id,product_type_id,option_id,position) VALUES(p_store,p_product,typ,opt,pos);
   value_pos:=0;
   FOR val IN SELECT value::bigint FROM jsonb_array_elements_text(axis->'value_ids') LOOP
     INSERT INTO public.product_variant_axis_values(store_id,product_id,product_type_id,option_id,value_id,sort_order)
       VALUES(p_store,p_product,typ,opt,val,value_pos);
     value_pos:=value_pos+1;
   END LOOP;
 END LOOP;
 FOR detail IN SELECT value FROM jsonb_array_elements(p_selection->'descriptors') LOOP
   SELECT * INTO def FROM public.catalogue_descriptors WHERE id=(detail->>'descriptor_id')::bigint;
   IF def.input_type IN('single_select','multi_select') THEN
     INSERT INTO public.product_descriptor_values(store_id,product_id,product_type_id,descriptor_id,input_type,value_id)
       SELECT p_store,p_product,typ,def.id,def.input_type,value::bigint FROM jsonb_array_elements_text(detail->'value_ids');
   ELSE
     INSERT INTO public.product_descriptor_values(store_id,product_id,product_type_id,descriptor_id,input_type,text_value,number_value,boolean_value)
       VALUES(p_store,p_product,typ,def.id,def.input_type,
         CASE WHEN def.input_type='text' THEN detail->>'text_value' END,
         CASE WHEN def.input_type='number' THEN (detail->>'number_value')::numeric END,
         CASE WHEN def.input_type='boolean' THEN (detail->>'boolean_value')::boolean END);
   END IF;
 END LOOP;
 INSERT INTO public.product_variant_option_values(store_id,product_id,product_option_id,option_id,value_id)
   SELECT p_store,p_product,sku.id,a.option_id,v.value_id FROM public.product_options sku
   JOIN public.product_variant_axes a ON a.store_id=sku.store_id AND a.product_id=sku.product_id
   JOIN public.product_variant_axis_values v ON v.store_id=a.store_id AND v.product_id=a.product_id AND v.option_id=a.option_id
   WHERE sku.store_id=p_store AND sku.product_id=p_product
     AND sku.attributes->>(a.position-1)=axes->(a.position-1)->'values'->>v.sort_order;
 RETURN p_revision+1;
END $$;
REVOKE ALL ON FUNCTION public.catalogue_write_product(uuid,uuid,text,integer,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalogue_write_product(uuid,uuid,text,integer,jsonb,text) TO lebrands_app;

-- A prepare call cannot be committed on its own, nor can direct legacy DML
-- leave a classified product with incomplete or mismatched SKU associations.
CREATE FUNCTION public.catalogue_check_product_variants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE sid uuid; pid uuid; axes_count integer; combinations integer:=1; values_count integer; a record; p public.products%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='products' THEN sid:=COALESCE(NEW.store_id,OLD.store_id); pid:=COALESCE(NEW.id,OLD.id);
 ELSE sid:=COALESCE(NEW.store_id,OLD.store_id); pid:=COALESCE(NEW.product_id,OLD.product_id); END IF;
 SELECT * INTO p FROM public.products WHERE store_id=sid AND id=pid;
 IF NOT FOUND OR p.product_type_id IS NULL THEN RETURN NULL; END IF;
 SELECT count(*) INTO axes_count FROM public.product_variant_axes WHERE store_id=sid AND product_id=pid;
 FOR a IN SELECT * FROM public.product_variant_axes WHERE store_id=sid AND product_id=pid LOOP
   SELECT count(*) INTO values_count FROM public.product_variant_axis_values WHERE store_id=sid AND product_id=pid AND option_id=a.option_id;
   IF values_count<1 THEN RAISE EXCEPTION 'Missing variant axis values' USING ERRCODE='23514'; END IF;
   combinations:=combinations*values_count;
 END LOOP;
 IF axes_count=0 THEN combinations:=0; END IF;
 IF combinations>200 OR (SELECT count(*) FROM public.product_options WHERE store_id=sid AND product_id=pid)<>combinations
   OR EXISTS(SELECT 1 FROM public.product_options sku WHERE sku.store_id=sid AND sku.product_id=pid AND (
     jsonb_array_length(sku.attributes)<>axes_count OR
     (SELECT count(*) FROM public.product_variant_option_values l WHERE l.store_id=sid AND l.product_option_id=sku.id)<>axes_count))
   OR EXISTS(SELECT 1 FROM public.product_variant_option_values l
     JOIN public.product_variant_axes ax ON ax.store_id=l.store_id AND ax.product_id=l.product_id AND ax.option_id=l.option_id
     JOIN public.product_variant_axis_values av ON av.store_id=l.store_id AND av.product_id=l.product_id AND av.option_id=l.option_id AND av.value_id=l.value_id
     JOIN public.product_options sku ON sku.store_id=l.store_id AND sku.id=l.product_option_id
     WHERE l.store_id=sid AND l.product_id=pid AND sku.attributes->>(ax.position-1)
       IS DISTINCT FROM p.catalogue->'axes'->(ax.position-1)->'values'->>av.sort_order)
 THEN RAISE EXCEPTION 'Incomplete classified product combinations' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.catalogue_check_product_variants() FROM PUBLIC;
DO $$
DECLARE tbl text; r text;
BEGIN
 FOREACH tbl IN ARRAY ARRAY['products','product_options','product_variant_axes','product_variant_axis_values','product_variant_option_values'] LOOP
   EXECUTE format('CREATE CONSTRAINT TRIGGER catalogue_variant_consistency AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.catalogue_check_product_variants()',tbl);
 END LOOP;
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN('anon','authenticated','service_role') LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION public.catalogue_product_selection(uuid,uuid),public.catalogue_write_product(uuid,uuid,text,integer,jsonb,text),public.catalogue_check_product_variants() FROM %I',r);
 END LOOP;
END $$;
