-- Optional, typed product details for all source product types.
-- Existing references, merchant selections and SKU dimensions are unchanged.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Run as an administrative BYPASSRLS role';
  END IF;
END $$;
CREATE TEMP TABLE d2c_descriptor_seed(payload jsonb NOT NULL) ON COMMIT DROP;
__D2C_DESCRIPTOR_COVERAGE_V1__

DO $$ BEGIN
  IF (SELECT count(*) FROM d2c_descriptor_seed,
    jsonb_to_recordset(payload->'profiles') a(type_key text)
    JOIN public.catalogue_product_types t USING(type_key)
    WHERE t.is_active AND t.review_status='approved')<>1698 THEN
    RAISE EXCEPTION 'All 1698 product types must be available before descriptor import';
  END IF;
  IF EXISTS(SELECT 1 FROM d2c_descriptor_seed,
    jsonb_to_recordset(payload->'descriptors') a(key text,name text,input_type text,unit text)
    JOIN public.catalogue_descriptors d ON d.descriptor_key=a.key
    WHERE d.name<>a.name OR d.input_type<>a.input_type OR d.unit IS DISTINCT FROM a.unit
      OR NOT d.is_active OR d.review_status<>'approved') THEN
    RAISE EXCEPTION 'Descriptor definition collision or retirement; review before importing';
  END IF;
END $$;

INSERT INTO public.catalogue_descriptors(descriptor_key,name,input_type,unit,review_status,is_active)
SELECT a.key,a.name,a.input_type,a.unit,'approved',true FROM d2c_descriptor_seed,
  jsonb_to_recordset(payload->'descriptors') a(key text,name text,input_type text,unit text)
ON CONFLICT(descriptor_key) DO NOTHING;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM d2c_descriptor_seed,
    jsonb_to_recordset(payload->'descriptors') a(key text,items jsonb)
    JOIN public.catalogue_descriptors d ON d.descriptor_key=a.key
    CROSS JOIN LATERAL jsonb_to_recordset(a.items) v(key text,label text)
    JOIN public.catalogue_descriptor_values old ON old.descriptor_id=d.id AND old.value_key=v.key
    WHERE old.label<>v.label OR NOT old.is_active OR old.review_status<>'approved') THEN
    RAISE EXCEPTION 'Descriptor value collision or retirement; review before importing';
  END IF;
END $$;

INSERT INTO public.catalogue_descriptor_values(descriptor_id,value_key,label,sort_order,review_status,is_active)
SELECT d.id,v.key,v.label,v.sort_order,'approved',true FROM d2c_descriptor_seed,
  jsonb_to_recordset(payload->'descriptors') a(key text,items jsonb)
  JOIN public.catalogue_descriptors d ON d.descriptor_key=a.key
  CROSS JOIN LATERAL jsonb_to_recordset(a.items) v(key text,label text,sort_order integer)
ON CONFLICT(descriptor_id,value_key) DO NOTHING;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM d2c_descriptor_seed,
    jsonb_to_recordset(payload->'assignments') a(type_key text,descriptor_key text)
    JOIN public.catalogue_product_types t USING(type_key)
    JOIN public.catalogue_descriptors d USING(descriptor_key)
    JOIN public.catalogue_product_type_descriptors m ON m.product_type_id=t.id AND m.descriptor_id=d.id
    WHERE NOT m.is_active OR m.review_status<>'approved' OR m.is_required) THEN
    RAISE EXCEPTION 'Existing descriptor applicability conflicts with optional import';
  END IF;
END $$;

INSERT INTO public.catalogue_product_type_descriptors(product_type_id,descriptor_id,is_required,sort_order,review_status,is_active)
SELECT t.id,d.id,false,a.sort_order,'approved',true FROM d2c_descriptor_seed,
  jsonb_to_recordset(payload->'assignments') a(type_key text,descriptor_key text,sort_order integer)
  JOIN public.catalogue_product_types t USING(type_key)
  JOIN public.catalogue_descriptors d USING(descriptor_key)
WHERE NOT EXISTS(SELECT 1 FROM public.catalogue_product_type_descriptors old
  JOIN public.catalogue_descriptors existing ON existing.id=old.descriptor_id
  WHERE old.product_type_id=t.id AND lower(btrim(existing.name))=lower(btrim(d.name))
    AND existing.id<>d.id)
ON CONFLICT(product_type_id,descriptor_id) DO NOTHING;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM d2c_descriptor_seed,
    jsonb_to_recordset(payload->'profiles') a(type_key text)
    JOIN public.catalogue_product_types t USING(type_key)
    WHERE NOT EXISTS(SELECT 1 FROM public.catalogue_product_type_descriptors m
      JOIN public.catalogue_descriptors d ON d.id=m.descriptor_id
      WHERE m.product_type_id=t.id AND m.is_active AND m.review_status='approved'
        AND d.is_active AND d.review_status='approved')) THEN
    RAISE EXCEPTION 'Incomplete descriptor coverage';
  END IF;
END $$;
