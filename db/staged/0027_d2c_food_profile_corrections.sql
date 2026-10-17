-- Functional membership review: Dragées and Pouch Meal are foods, not pills/bags.
-- Retire incorrect applicability, never delete values or merchant selections.
CREATE TEMP TABLE d2c_profile_correction_seed(payload jsonb NOT NULL) ON COMMIT DROP;
__D2C_MEMBERSHIP_PROFILE_CORRECTIONS_V1__
DO $$ BEGIN
  IF (SELECT count(*) FROM d2c_profile_correction_seed,
    jsonb_array_elements_text(payload->'types') k(type_key)
    JOIN public.catalogue_product_types t USING(type_key))<>2 THEN
    RAISE EXCEPTION 'Food correction must resolve exactly two source types';
  END IF;
  IF EXISTS(SELECT 1 FROM d2c_profile_correction_seed,
    jsonb_to_recordset(payload->'axes') a(option_key text)
    LEFT JOIN public.catalogue_variant_options o USING(option_key)
    WHERE o.id IS NULL OR NOT o.is_active OR o.review_status<>'approved') THEN
    RAISE EXCEPTION 'Food correction requires approved existing option masters';
  END IF;
END $$;

UPDATE public.catalogue_product_type_options m SET is_active=false,updated_at=now()
FROM public.catalogue_product_types t,d2c_profile_correction_seed seed
WHERE t.id=m.product_type_id AND m.is_active AND t.type_key IN(
  SELECT jsonb_array_elements_text(seed.payload->'types'))
AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(seed.payload->'axes') a(option_key text)
  JOIN public.catalogue_variant_options o USING(option_key) WHERE o.id=m.option_id);
UPDATE public.catalogue_product_type_option_values m SET is_active=false,updated_at=now()
FROM public.catalogue_product_types t,d2c_profile_correction_seed seed
WHERE t.id=m.product_type_id AND m.is_active AND t.type_key IN(
  SELECT jsonb_array_elements_text(seed.payload->'types'))
AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(seed.payload->'axes') a(option_key text,labels jsonb)
  JOIN public.catalogue_variant_options o USING(option_key)
  JOIN public.catalogue_variant_option_values v ON v.option_id=o.id AND v.id=m.value_id
  WHERE o.id=m.option_id AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(a.labels) l(label)
    WHERE lower(l.label)=lower(v.label)));

INSERT INTO public.catalogue_product_type_options(product_type_id,option_id,sort_order,review_status,is_active)
SELECT t.id,o.id,a.position,'approved',true FROM d2c_profile_correction_seed seed,
  jsonb_array_elements_text(seed.payload->'types') k(type_key)
  JOIN public.catalogue_product_types t USING(type_key)
  CROSS JOIN LATERAL jsonb_to_recordset(seed.payload->'axes') a(option_key text,position integer)
  JOIN public.catalogue_variant_options o USING(option_key)
ON CONFLICT(product_type_id,option_id) DO UPDATE SET is_active=true,review_status='approved',sort_order=excluded.sort_order;

INSERT INTO public.catalogue_product_type_option_values(product_type_id,option_id,value_id,sort_order,review_status,is_active)
SELECT t.id,o.id,v.id,(label.ordinality-1)::integer,'approved',true FROM d2c_profile_correction_seed seed,
  jsonb_array_elements_text(seed.payload->'types') k(type_key)
  JOIN public.catalogue_product_types t USING(type_key)
  CROSS JOIN LATERAL jsonb_to_recordset(seed.payload->'axes') a(option_key text,labels jsonb)
  JOIN public.catalogue_variant_options o USING(option_key)
  CROSS JOIN LATERAL jsonb_array_elements_text(a.labels) WITH ORDINALITY label(value,ordinality)
  JOIN public.catalogue_variant_option_values v ON v.option_id=o.id AND lower(v.label)=lower(label.value)
    AND v.store_id IS NULL AND v.is_active AND v.review_status='approved'
ON CONFLICT(product_type_id,option_id,value_id) DO UPDATE SET is_active=true,review_status='approved',sort_order=excluded.sort_order;

UPDATE public.catalogue_variant_profile_assignments p SET profile_key=seed.payload->>'profile_key',
  source='curated_d2c_membership_review'
FROM public.catalogue_product_types t,d2c_profile_correction_seed seed
WHERE p.product_type_id=t.id AND t.type_key IN(SELECT jsonb_array_elements_text(seed.payload->'types'));
