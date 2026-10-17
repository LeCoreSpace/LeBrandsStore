-- Additive catalogue metadata. Existing sellable variants remain product_options.
ALTER TABLE public.products ADD COLUMN catalogue jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.product_options ADD COLUMN attributes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD CONSTRAINT products_catalogue_object
  CHECK (jsonb_typeof(catalogue)='object');
ALTER TABLE public.product_options ADD CONSTRAINT product_options_attributes_array
  CHECK (jsonb_typeof(attributes)='array' AND jsonb_array_length(attributes)<=3);
