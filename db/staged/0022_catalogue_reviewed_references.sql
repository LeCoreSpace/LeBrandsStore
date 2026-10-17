-- User-approved Phase 1 proposals. No guessed memberships or context-review roles.
-- Run through the manual runner; immutable inputs expand the marker below.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Run as an administrative BYPASSRLS role';
  END IF;
  IF EXISTS(SELECT 1 FROM public.catalogue_subcategory_product_types)
    OR EXISTS(SELECT 1 FROM public.catalogue_variant_options)
    OR EXISTS(SELECT 1 FROM public.catalogue_descriptors) THEN
    RAISE EXCEPTION 'Reference import requires empty new masters; review existing assignments before merging';
  END IF;
END $$;
CREATE TEMP TABLE catalogue_reference_seed_v1(payload jsonb NOT NULL) ON COMMIT DROP;
__CATALOGUE_REVIEWED_REFERENCES_V1__

DO $$ BEGIN
  IF (SELECT count(*) FROM jsonb_to_recordset((SELECT payload->'type_links' FROM catalogue_reference_seed_v1))
    AS x(subcategory_id bigint,type_key text) JOIN public.catalogue_product_types t USING(type_key)
    JOIN public.catalogue_subcategories s USING(subcategory_id) WHERE s.is_active) <> 313 THEN
    RAISE EXCEPTION 'Reviewed type mappings do not resolve to the existing active taxonomy';
  END IF;
END $$;

INSERT INTO public.catalogue_variant_options(option_key,name,review_status,is_active)
SELECT key,name,'approved',true FROM jsonb_to_recordset((SELECT payload->'options' FROM catalogue_reference_seed_v1))
  AS x(key text,name text) ORDER BY key;
INSERT INTO public.catalogue_variant_option_values(option_id,value_key,label,sort_order,review_status,is_active)
SELECT o.id,v.key,v.label,v.sort_order,'approved',true
FROM jsonb_to_recordset((SELECT payload->'options' FROM catalogue_reference_seed_v1)) AS x(key text,items jsonb)
JOIN public.catalogue_variant_options o ON o.option_key=x.key
CROSS JOIN LATERAL jsonb_to_recordset(x.items) AS v(key text,label text,sort_order integer)
ORDER BY o.id,v.sort_order,v.key;

INSERT INTO public.catalogue_descriptors(descriptor_key,name,input_type,unit,review_status,is_active)
SELECT key,name,input_type,unit,'approved',true FROM jsonb_to_recordset((SELECT payload->'descriptors' FROM catalogue_reference_seed_v1))
  AS x(key text,name text,input_type text,unit text) ORDER BY key;
INSERT INTO public.catalogue_descriptor_values(descriptor_id,value_key,label,sort_order,review_status,is_active)
SELECT d.id,v.key,v.label,v.sort_order,'approved',true
FROM jsonb_to_recordset((SELECT payload->'descriptors' FROM catalogue_reference_seed_v1)) AS x(key text,items jsonb)
JOIN public.catalogue_descriptors d ON d.descriptor_key=x.key
CROSS JOIN LATERAL jsonb_to_recordset(x.items) AS v(key text,label text,sort_order integer)
ORDER BY d.id,v.sort_order,v.key;

INSERT INTO public.catalogue_product_type_options(product_type_id,option_id,sort_order,review_status,is_active)
SELECT t.id,o.id,x.sort_order,'approved',true
FROM jsonb_to_recordset((SELECT payload->'option_links' FROM catalogue_reference_seed_v1)) AS x(type_key text,option_key text,sort_order integer)
JOIN public.catalogue_product_types t USING(type_key) JOIN public.catalogue_variant_options o ON o.option_key=x.option_key;
INSERT INTO public.catalogue_product_type_option_values(product_type_id,option_id,value_id,sort_order,review_status,is_active)
SELECT t.id,o.id,v.id,(chosen.ordinality-1)::integer,'approved',true
FROM jsonb_to_recordset((SELECT payload->'option_links' FROM catalogue_reference_seed_v1)) AS x(type_key text,option_key text,value_keys jsonb)
JOIN public.catalogue_product_types t USING(type_key) JOIN public.catalogue_variant_options o ON o.option_key=x.option_key
CROSS JOIN LATERAL jsonb_array_elements_text(x.value_keys) WITH ORDINALITY AS chosen(key,ordinality)
JOIN public.catalogue_variant_option_values v ON v.option_id=o.id AND v.value_key=chosen.key;
INSERT INTO public.catalogue_product_type_descriptors(product_type_id,descriptor_id,is_required,sort_order,review_status,is_active)
SELECT t.id,d.id,x.is_required,x.sort_order,'approved',true
FROM jsonb_to_recordset((SELECT payload->'descriptor_links' FROM catalogue_reference_seed_v1))
  AS x(type_key text,descriptor_key text,is_required boolean,sort_order integer)
JOIN public.catalogue_product_types t USING(type_key) JOIN public.catalogue_descriptors d ON d.descriptor_key=x.descriptor_key;

UPDATE public.catalogue_product_types t SET review_status='approved',is_active=true
WHERE EXISTS(SELECT 1 FROM jsonb_to_recordset((SELECT payload->'type_links' FROM catalogue_reference_seed_v1))
  AS x(type_key text) WHERE x.type_key=t.type_key);
INSERT INTO public.catalogue_subcategory_product_types(subcategory_id,product_type_id,review_status,is_active)
SELECT x.subcategory_id,t.id,'approved',true
FROM jsonb_to_recordset((SELECT payload->'type_links' FROM catalogue_reference_seed_v1)) AS x(subcategory_id bigint,type_key text)
JOIN public.catalogue_product_types t USING(type_key);
