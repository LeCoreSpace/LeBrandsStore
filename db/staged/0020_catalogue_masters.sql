-- Catalogue Phase 2: preserve taxonomy IDs and merchant commerce records.
-- Unreviewed product types are seeded pending/inactive. No inferred mappings.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Run as an administrative BYPASSRLS role';
  END IF;
  IF current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION 'PostgreSQL 15+ is required for RLS-safe compatibility views';
  END IF;
  IF to_regclass('public.catalogue_categories') IS NOT NULL OR
     to_regclass('public.catalogue_subcategories') IS NOT NULL THEN
    RAISE EXCEPTION 'Catalogue taxonomy already exists; check migration history';
  END IF;
END $$;

ALTER TABLE public.aura_library_categories RENAME TO catalogue_categories;
ALTER TABLE public.aura_library_subcategories RENAME TO catalogue_subcategories;
ALTER TABLE public.catalogue_categories ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.catalogue_subcategories ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.catalogue_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.catalogue_subcategories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Old published Workers can continue reading during the deployment transition.
-- security_invoker is essential: views must not bypass the underlying RLS.
CREATE VIEW public.aura_library_categories WITH(security_invoker=true) AS
  SELECT category_id,name,slug,brand_type,is_active,created_at FROM public.catalogue_categories;
CREATE VIEW public.aura_library_subcategories WITH(security_invoker=true) AS
  SELECT subcategory_id,category_id,name,slug,is_active,created_at FROM public.catalogue_subcategories;
REVOKE ALL ON public.aura_library_categories,public.aura_library_subcategories FROM PUBLIC,lebrands_app;
GRANT SELECT ON public.aura_library_categories,public.aura_library_subcategories TO lebrands_app;

CREATE TABLE public.catalogue_product_types (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type_key text NOT NULL UNIQUE CHECK(type_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
  source_usage_count integer CHECK(source_usage_count > 0),
  review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN('pending','approved','rejected')),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(NOT is_active OR review_status='approved')
);
CREATE TABLE public.catalogue_subcategory_product_types (
  subcategory_id bigint NOT NULL REFERENCES public.catalogue_subcategories(subcategory_id),
  product_type_id bigint NOT NULL REFERENCES public.catalogue_product_types(id),
  review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN('pending','approved','rejected')),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(subcategory_id,product_type_id),
  CHECK(NOT is_active OR review_status='approved')
);
CREATE INDEX catalogue_types_subcategory ON public.catalogue_subcategory_product_types(product_type_id,subcategory_id);

CREATE TABLE public.catalogue_variant_options (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  option_key text NOT NULL UNIQUE CHECK(option_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
  review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN('pending','approved','rejected')),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(NOT is_active OR review_status='approved')
);
CREATE TABLE public.catalogue_variant_option_values (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  option_id bigint NOT NULL REFERENCES public.catalogue_variant_options(id),
  value_key text NOT NULL CHECK(length(btrim(value_key)) BETWEEN 1 AND 120),
  label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 200),
  sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order >= 0),
  review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN('pending','approved','rejected')),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(option_id,value_key), UNIQUE(option_id,id),
  CHECK(NOT is_active OR review_status='approved')
);
CREATE TABLE public.catalogue_product_type_options (
  product_type_id bigint NOT NULL REFERENCES public.catalogue_product_types(id),
  option_id bigint NOT NULL REFERENCES public.catalogue_variant_options(id),
  sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order >= 0),
  review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN('pending','approved','rejected')),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(product_type_id,option_id),
  CHECK(NOT is_active OR review_status='approved')
);
CREATE TABLE public.catalogue_product_type_option_values (
  product_type_id bigint NOT NULL,
  option_id bigint NOT NULL,
  value_id bigint NOT NULL,
  sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order >= 0),
  review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN('pending','approved','rejected')),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(product_type_id,option_id,value_id),
  FOREIGN KEY(product_type_id,option_id) REFERENCES public.catalogue_product_type_options(product_type_id,option_id),
  FOREIGN KEY(option_id,value_id) REFERENCES public.catalogue_variant_option_values(option_id,id),
  CHECK(NOT is_active OR review_status='approved')
);

CREATE TABLE public.catalogue_descriptors (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  descriptor_key text NOT NULL UNIQUE CHECK(descriptor_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
  input_type text NOT NULL CHECK(input_type IN('single_select','multi_select','text','number','boolean')),
  unit text CHECK(length(btrim(unit)) BETWEEN 1 AND 20),
  review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN('pending','approved','rejected')),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,input_type),
  CHECK(NOT is_active OR review_status='approved')
);
CREATE TABLE public.catalogue_descriptor_values (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  descriptor_id bigint NOT NULL REFERENCES public.catalogue_descriptors(id),
  value_key text NOT NULL CHECK(length(btrim(value_key)) BETWEEN 1 AND 120),
  label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 200),
  sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order >= 0),
  review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN('pending','approved','rejected')),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(descriptor_id,value_key), UNIQUE(descriptor_id,id),
  CHECK(NOT is_active OR review_status='approved')
);
CREATE TABLE public.catalogue_product_type_descriptors (
  product_type_id bigint NOT NULL REFERENCES public.catalogue_product_types(id),
  descriptor_id bigint NOT NULL REFERENCES public.catalogue_descriptors(id),
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order >= 0),
  review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN('pending','approved','rejected')),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(product_type_id,descriptor_id),
  CHECK(NOT is_active OR review_status='approved')
);

-- Existing products retain NULL references; no title-based classification.
ALTER TABLE public.products
  ADD COLUMN category_id bigint REFERENCES public.catalogue_categories(category_id),
  ADD COLUMN subcategory_id bigint,
  ADD COLUMN product_type_id bigint REFERENCES public.catalogue_product_types(id),
  ADD CONSTRAINT products_catalogue_parent CHECK(
    (subcategory_id IS NULL OR category_id IS NOT NULL) AND
    (product_type_id IS NULL OR subcategory_id IS NOT NULL)),
  ADD CONSTRAINT products_catalogue_subcategory FOREIGN KEY(category_id,subcategory_id)
    REFERENCES public.catalogue_subcategories(category_id,subcategory_id),
  ADD CONSTRAINT products_catalogue_type FOREIGN KEY(subcategory_id,product_type_id)
    REFERENCES public.catalogue_subcategory_product_types(subcategory_id,product_type_id),
  ADD CONSTRAINT products_catalogue_identity UNIQUE(store_id,id,product_type_id);
CREATE INDEX products_catalogue_type_idx ON public.products(store_id,product_type_id);

CREATE TABLE public.product_variant_axes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  product_id uuid NOT NULL,
  product_type_id bigint NOT NULL,
  option_id bigint NOT NULL,
  position smallint NOT NULL CHECK(position BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(store_id,product_id,product_type_id) REFERENCES public.products(store_id,id,product_type_id),
  FOREIGN KEY(product_type_id,option_id) REFERENCES public.catalogue_product_type_options(product_type_id,option_id),
  UNIQUE(store_id,product_id,position),
  UNIQUE(store_id,product_id,option_id,product_type_id),
  UNIQUE(store_id,product_id,option_id)
);
CREATE TABLE public.product_variant_axis_values (
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  product_id uuid NOT NULL,
  product_type_id bigint NOT NULL,
  option_id bigint NOT NULL,
  value_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(store_id,product_id,option_id,value_id),
  FOREIGN KEY(store_id,product_id,option_id,product_type_id)
    REFERENCES public.product_variant_axes(store_id,product_id,option_id,product_type_id),
  FOREIGN KEY(product_type_id,option_id,value_id)
    REFERENCES public.catalogue_product_type_option_values(product_type_id,option_id,value_id)
);
CREATE TABLE public.product_variant_option_values (
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  product_id uuid NOT NULL,
  product_option_id uuid NOT NULL,
  option_id bigint NOT NULL,
  value_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(store_id,product_option_id,option_id),
  FOREIGN KEY(store_id,product_id,product_option_id) REFERENCES public.product_options(store_id,product_id,id),
  FOREIGN KEY(store_id,product_id,option_id,value_id)
    REFERENCES public.product_variant_axis_values(store_id,product_id,option_id,value_id)
);
CREATE TABLE public.product_descriptor_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  product_id uuid NOT NULL,
  product_type_id bigint NOT NULL,
  descriptor_id bigint NOT NULL,
  input_type text NOT NULL,
  value_id bigint,
  text_value text,
  number_value numeric(24,6),
  boolean_value boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(store_id,product_id,product_type_id) REFERENCES public.products(store_id,id,product_type_id),
  FOREIGN KEY(product_type_id,descriptor_id) REFERENCES public.catalogue_product_type_descriptors(product_type_id,descriptor_id),
  FOREIGN KEY(descriptor_id,input_type) REFERENCES public.catalogue_descriptors(id,input_type),
  FOREIGN KEY(descriptor_id,value_id) REFERENCES public.catalogue_descriptor_values(descriptor_id,id),
  UNIQUE(store_id,product_id,descriptor_id,value_id),
  CHECK(num_nonnulls(value_id,text_value,number_value,boolean_value)=1),
  CHECK(number_value IS NULL OR number_value NOT IN('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
  CHECK(
    (input_type IN('single_select','multi_select') AND value_id IS NOT NULL) OR
    (input_type='text' AND text_value IS NOT NULL AND length(btrim(text_value)) BETWEEN 1 AND 4000) OR
    (input_type='number' AND number_value IS NOT NULL) OR
    (input_type='boolean' AND boolean_value IS NOT NULL))
);
CREATE UNIQUE INDEX product_descriptor_single_value
  ON public.product_descriptor_values(store_id,product_id,descriptor_id)
  WHERE input_type <> 'multi_select';

-- Shared reference data is administrator-written. Pending data is never visible.
-- Retired approved values remain readable for historical product interpretation.
DO $$
DECLARE table_name text; role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'catalogue_product_types','catalogue_subcategory_product_types',
    'catalogue_variant_options','catalogue_variant_option_values',
    'catalogue_product_type_options','catalogue_product_type_option_values',
    'catalogue_descriptors','catalogue_descriptor_values','catalogue_product_type_descriptors',
    'product_variant_axes','product_variant_axis_values','product_variant_option_values','product_descriptor_values'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO postgres',table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',table_name);
    FOR role_name IN SELECT rolname FROM pg_roles
      WHERE rolname IN('lebrands_app','anon','authenticated','service_role')
    LOOP
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',table_name,role_name);
    END LOOP;
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO lebrands_app',table_name);
    EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',table_name);
    IF starts_with(table_name,'catalogue_') THEN
      EXECUTE format('CREATE POLICY catalogue_reference_read ON public.%I FOR SELECT TO lebrands_app USING(review_status=''approved'')',table_name);
    ELSE
      EXECUTE format('CREATE POLICY catalogue_product_tenant_read ON public.%I FOR SELECT TO lebrands_app USING(store_id=NULLIF(current_setting(''app.store_id'',true),'''')::uuid)',table_name);
    END IF;
  END LOOP;
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN('anon','authenticated','service_role')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.aura_library_categories,public.aura_library_subcategories FROM %I',role_name);
  END LOOP;
END $$;

ALTER POLICY catalogue_reference_read ON public.catalogue_subcategory_product_types USING(
  review_status='approved' AND
  EXISTS(SELECT 1 FROM public.catalogue_product_types p WHERE p.id=product_type_id) AND
  EXISTS(SELECT 1 FROM public.catalogue_subcategories s WHERE s.subcategory_id=catalogue_subcategory_product_types.subcategory_id));
ALTER POLICY catalogue_reference_read ON public.catalogue_variant_option_values USING(
  review_status='approved' AND
  EXISTS(SELECT 1 FROM public.catalogue_variant_options o WHERE o.id=option_id));
ALTER POLICY catalogue_reference_read ON public.catalogue_descriptor_values USING(
  review_status='approved' AND
  EXISTS(SELECT 1 FROM public.catalogue_descriptors d WHERE d.id=descriptor_id));
ALTER POLICY catalogue_reference_read ON public.catalogue_product_type_options USING(
  review_status='approved' AND
  EXISTS(SELECT 1 FROM public.catalogue_product_types p WHERE p.id=product_type_id) AND
  EXISTS(SELECT 1 FROM public.catalogue_variant_options o WHERE o.id=option_id));
ALTER POLICY catalogue_reference_read ON public.catalogue_product_type_option_values USING(
  review_status='approved' AND
  EXISTS(SELECT 1 FROM public.catalogue_product_type_options o
    WHERE o.product_type_id=catalogue_product_type_option_values.product_type_id
      AND o.option_id=catalogue_product_type_option_values.option_id) AND
  EXISTS(SELECT 1 FROM public.catalogue_variant_option_values v WHERE v.option_id=catalogue_product_type_option_values.option_id AND v.id=value_id));
ALTER POLICY catalogue_reference_read ON public.catalogue_product_type_descriptors USING(
  review_status='approved' AND
  EXISTS(SELECT 1 FROM public.catalogue_product_types p WHERE p.id=product_type_id) AND
  EXISTS(SELECT 1 FROM public.catalogue_descriptors d WHERE d.id=descriptor_id));

-- Row-count metadata is not membership. No type/subcategory links are invented.
__CATALOGUE_PRODUCT_TYPES_V1__
