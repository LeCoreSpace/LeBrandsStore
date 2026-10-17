-- Additive, curated SKU dimensions for every source product type.
-- This does NOT guess missing category memberships, approve pending types,
-- generate merchant SKUs or modify descriptors, prices, stock or saved axes.
CREATE TEMP TABLE d2c_variant_seed(payload jsonb NOT NULL) ON COMMIT DROP;
__D2C_VARIANT_PROFILES_V1__
DO $$ BEGIN
  IF (SELECT count(*) FROM jsonb_to_recordset((SELECT payload->'assignments' FROM d2c_variant_seed)) x(type_key text)
    JOIN public.catalogue_product_types t USING(type_key))<>1698 THEN
    RAISE EXCEPTION 'Every source product type must resolve exactly once';
  END IF;
END $$;

CREATE TABLE public.catalogue_variant_profile_assignments(
  product_type_id bigint PRIMARY KEY REFERENCES public.catalogue_product_types(id),
  profile_key text NOT NULL,
  source text NOT NULL DEFAULT 'curated_d2c',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.catalogue_variant_profile_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogue_variant_profile_assignments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalogue_variant_profile_assignments FROM PUBLIC,lebrands_app,anon,authenticated,service_role;
GRANT SELECT ON public.catalogue_variant_profile_assignments TO lebrands_app;
CREATE POLICY catalogue_profile_read ON public.catalogue_variant_profile_assignments FOR SELECT TO lebrands_app USING(true);

INSERT INTO public.catalogue_variant_options(option_key,name,review_status,is_active)
SELECT key,name,'approved',true FROM jsonb_to_recordset((SELECT payload->'options' FROM d2c_variant_seed)) x(key text,name text)
ON CONFLICT(option_key) DO NOTHING;
INSERT INTO public.catalogue_variant_option_values(option_id,value_key,label,sort_order,review_status,is_active)
SELECT o.id,v.key,v.label,v.sort_order,'approved',true
FROM jsonb_to_recordset((SELECT payload->'options' FROM d2c_variant_seed)) x(key text,items jsonb)
JOIN public.catalogue_variant_options o ON o.option_key=x.key
CROSS JOIN LATERAL jsonb_to_recordset(x.items) v(key text,label text,sort_order integer)
WHERE NOT EXISTS(SELECT 1 FROM public.catalogue_variant_option_values old WHERE old.option_id=o.id AND lower(old.label)=lower(v.label))
ON CONFLICT(option_id,value_key) DO NOTHING;

CREATE TEMP TABLE d2c_type_axes ON COMMIT DROP AS
SELECT t.id AS product_type_id,p.key AS profile_key,a.option_key,a.position,a.labels
FROM jsonb_to_recordset((SELECT payload->'assignments' FROM d2c_variant_seed)) x(type_key text,profile_key text)
JOIN public.catalogue_product_types t USING(type_key)
JOIN jsonb_to_recordset((SELECT payload->'profiles' FROM d2c_variant_seed)) p(key text,axes jsonb) ON p.key=x.profile_key
CROSS JOIN LATERAL jsonb_to_recordset(p.axes) a(option_key text,position integer,labels jsonb);
INSERT INTO public.catalogue_variant_profile_assignments(product_type_id,profile_key)
SELECT DISTINCT product_type_id,profile_key FROM d2c_type_axes;
INSERT INTO public.catalogue_product_type_options(product_type_id,option_id,sort_order,review_status,is_active)
SELECT a.product_type_id,o.id,a.position,'approved',true FROM d2c_type_axes a
JOIN public.catalogue_variant_options o ON o.option_key=a.option_key
ON CONFLICT(product_type_id,option_id) DO NOTHING;
INSERT INTO public.catalogue_product_type_option_values(product_type_id,option_id,value_id,sort_order,review_status,is_active)
SELECT a.product_type_id,o.id,chosen.id,(v.ordinality-1)::integer,'approved',true
FROM d2c_type_axes a JOIN public.catalogue_variant_options o ON o.option_key=a.option_key
CROSS JOIN LATERAL jsonb_array_elements_text(a.labels) WITH ORDINALITY v(label,ordinality)
JOIN LATERAL(SELECT id FROM public.catalogue_variant_option_values existing
  WHERE existing.option_id=o.id AND lower(existing.label)=lower(v.label) ORDER BY id LIMIT 1) chosen ON true
ON CONFLICT(product_type_id,option_id,value_id) DO NOTHING;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.catalogue_variant_profile_assignments)<>1698 THEN
    RAISE EXCEPTION 'Incomplete curated variant coverage';
  END IF;
END $$;
