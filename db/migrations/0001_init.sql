-- Shared registries: brands and users can belong to multiple stores; themes are
-- platform definitions. They are not directly accessible by the Worker role.
-- stores.store_id is the tenant's primary key. All tenant children reference it.

CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_brand_id text UNIQUE,
  name text NOT NULL,
  legal_name text NOT NULL,
  gstin varchar(15),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_user_id text UNIQUE,
  name text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON public.users (lower(email));

CREATE TABLE public.themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.stores (
  store_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id),
  theme_id uuid REFERENCES public.themes(id),
  subdomain text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'paused')),
  country char(2) NOT NULL DEFAULT 'IN' CHECK (country ~ '^[A-Z]{2}$'),
  currency char(3) NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  mall_category_id text,
  theme_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (subdomain ~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$'),
  CHECK (subdomain NOT IN (
    'www', 'app', 'admin', 'api', 'brands', 'customers', 'mail', 'notify',
    'news', 'help', 'support', 'status', 'shop', 'store', 'checkout', 'cart',
    'pay', 'payments', 'login', 'account', 'dashboard', 'blog', 'docs',
    'cdn', 'static', 'assets', 'media', 'lebrands', 'lebrandsspace'
  ))
);
CREATE INDEX stores_brand_idx ON public.stores (brand_id);
CREATE INDEX stores_theme_idx ON public.stores (theme_id);

CREATE TABLE public.store_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  user_id uuid NOT NULL REFERENCES public.users(id),
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'editor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, user_id)
);
CREATE INDEX store_members_user_idx ON public.store_members (user_id);

CREATE TABLE public.pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  slug text NOT NULL,
  title text NOT NULL,
  page_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  draft_content jsonb NOT NULL DEFAULT '{"sections":[]}'::jsonb,
  published_content jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  UNIQUE (store_id, slug)
);

CREATE TABLE public.page_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  page_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  content jsonb NOT NULL,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, page_id) REFERENCES public.pages(store_id, id),
  UNIQUE (store_id, page_id, version)
);

CREATE TABLE public.media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  object_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('image', 'video')),
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  width integer CHECK (width > 0),
  height integer CHECK (height > 0),
  alt_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  UNIQUE (store_id, object_key),
  CHECK (starts_with(object_key, 'stores/' || store_id::text || '/'))
);

CREATE TABLE public.policy_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  slug text NOT NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, slug)
);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  title text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  sku text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  price_paise bigint NOT NULL DEFAULT 0 CHECK (price_paise >= 0),
  compare_at_price_paise bigint CHECK (compare_at_price_paise >= 0),
  cost_price_paise bigint CHECK (cost_price_paise >= 0),
  hsn_code text,
  gst_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (gst_rate BETWEEN 0 AND 100),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  track_inventory boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  UNIQUE (store_id, slug),
  UNIQUE (store_id, sku)
);
CREATE INDEX products_status_idx ON public.products (store_id, status);

CREATE TABLE public.product_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  product_id uuid NOT NULL,
  name text NOT NULL,
  value text NOT NULL,
  sku text,
  price_paise bigint CHECK (price_paise >= 0),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, product_id) REFERENCES public.products(store_id, id),
  UNIQUE (store_id, id),
  UNIQUE (store_id, product_id, id),
  UNIQUE (store_id, product_id, name, value),
  UNIQUE (store_id, sku)
);

CREATE TABLE public.product_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  product_id uuid NOT NULL,
  media_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, product_id) REFERENCES public.products(store_id, id),
  FOREIGN KEY (store_id, media_id) REFERENCES public.media(store_id, id),
  UNIQUE (store_id, product_id, media_id)
);
CREATE INDEX product_media_media_idx ON public.product_media (store_id, media_id);

CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  title text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  UNIQUE (store_id, slug)
);

CREATE TABLE public.collection_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  collection_id uuid NOT NULL,
  product_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, collection_id) REFERENCES public.collections(store_id, id),
  FOREIGN KEY (store_id, product_id) REFERENCES public.products(store_id, id),
  UNIQUE (store_id, collection_id, product_id)
);
CREATE INDEX collection_products_product_idx ON public.collection_products (store_id, product_id);

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  UNIQUE (store_id, phone)
);
CREATE INDEX customers_email_idx ON public.customers (store_id, lower(email));

CREATE TABLE public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  customer_id uuid NOT NULL,
  recipient_name text NOT NULL,
  phone text,
  address_line_1 text NOT NULL,
  address_line_2 text,
  landmark text,
  city text NOT NULL,
  state text NOT NULL,
  pincode text NOT NULL,
  country char(2) NOT NULL DEFAULT 'IN',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, customer_id) REFERENCES public.customers(store_id, id)
);
CREATE INDEX customer_addresses_customer_idx ON public.customer_addresses (store_id, customer_id);
CREATE UNIQUE INDEX customer_addresses_default_idx
  ON public.customer_addresses (store_id, customer_id) WHERE is_default;

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  customer_id uuid NOT NULL,
  order_number text NOT NULL,
  status text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'confirmed', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
  currency char(3) NOT NULL DEFAULT 'INR',
  subtotal_paise bigint NOT NULL CHECK (subtotal_paise >= 0),
  tax_paise bigint NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
  shipping_paise bigint NOT NULL DEFAULT 0 CHECK (shipping_paise >= 0),
  cod_fee_paise bigint NOT NULL DEFAULT 0 CHECK (cod_fee_paise >= 0),
  discount_paise bigint NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  total_paise bigint NOT NULL CHECK (total_paise >= 0),
  shipping_address jsonb NOT NULL,
  billing_address jsonb,
  source text NOT NULL DEFAULT 'direct',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, customer_id) REFERENCES public.customers(store_id, id),
  UNIQUE (store_id, id),
  UNIQUE (store_id, order_number)
);
CREATE INDEX orders_customer_idx ON public.orders (store_id, customer_id);
CREATE INDEX orders_status_created_idx ON public.orders (store_id, status, created_at DESC);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  order_id uuid NOT NULL,
  product_id uuid,
  product_option_id uuid,
  title text NOT NULL,
  sku text,
  hsn_code text,
  gst_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (gst_rate BETWEEN 0 AND 100),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_paise bigint NOT NULL CHECK (unit_price_paise >= 0),
  tax_paise bigint NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
  total_paise bigint NOT NULL CHECK (total_paise >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, order_id) REFERENCES public.orders(store_id, id),
  FOREIGN KEY (store_id, product_id) REFERENCES public.products(store_id, id),
  FOREIGN KEY (store_id, product_id, product_option_id)
    REFERENCES public.product_options(store_id, product_id, id),
  CHECK (product_option_id IS NULL OR product_id IS NOT NULL)
);
CREATE INDEX order_items_order_idx ON public.order_items (store_id, order_id);
CREATE INDEX order_items_product_idx ON public.order_items (store_id, product_id);
CREATE INDEX order_items_option_idx ON public.order_items (store_id, product_id, product_option_id);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  order_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('razorpay', 'cod', 'manual')),
  provider_payment_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'authorized', 'captured', 'failed', 'refunded')),
  amount_paise bigint NOT NULL CHECK (amount_paise >= 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, order_id) REFERENCES public.orders(store_id, id),
  UNIQUE (store_id, id),
  UNIQUE (store_id, provider, provider_payment_id)
);
CREATE INDEX payments_order_idx ON public.payments (store_id, order_id);

CREATE TABLE public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  order_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual', 'shiprocket')),
  provider_shipment_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'shipped', 'delivered', 'cancelled')),
  courier text,
  tracking_number text,
  tracking_url text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, order_id) REFERENCES public.orders(store_id, id),
  UNIQUE (store_id, provider, provider_shipment_id)
);
CREATE INDEX shipments_order_idx ON public.shipments (store_id, order_id);
CREATE INDEX shipments_tracking_idx ON public.shipments (store_id, tracking_number);

CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  order_id uuid NOT NULL,
  payment_id uuid,
  provider_refund_id text,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, order_id) REFERENCES public.orders(store_id, id),
  FOREIGN KEY (store_id, payment_id) REFERENCES public.payments(store_id, id),
  UNIQUE (store_id, provider_refund_id)
);
CREATE INDEX refunds_order_idx ON public.refunds (store_id, order_id);
CREATE INDEX refunds_payment_idx ON public.refunds (store_id, payment_id);

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  order_id uuid NOT NULL,
  invoice_number text NOT NULL,
  financial_year text NOT NULL CHECK (financial_year ~ '^[0-9]{4}-[0-9]{2}$'),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'cancelled')),
  subtotal_paise bigint NOT NULL CHECK (subtotal_paise >= 0),
  tax_paise bigint NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
  total_paise bigint NOT NULL CHECK (total_paise >= 0),
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, order_id) REFERENCES public.orders(store_id, id),
  UNIQUE (store_id, invoice_number),
  UNIQUE (store_id, order_id)
);

CREATE TABLE public.invoice_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  financial_year text NOT NULL CHECK (financial_year ~ '^[0-9]{4}-[0-9]{2}$'),
  last_number bigint NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, financial_year)
);

CREATE TABLE public.domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  hostname text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'failed', 'disabled')),
  is_primary boolean NOT NULL DEFAULT false,
  cloudflare_hostname_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (hostname = lower(hostname) AND length(hostname) <= 253),
  CHECK (hostname ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  CHECK (hostname <> 'lebrands.store' AND hostname NOT LIKE '%.lebrands.store')
);
CREATE INDEX domains_store_idx ON public.domains (store_id);
CREATE UNIQUE INDEX domains_primary_idx ON public.domains (store_id) WHERE is_primary;

CREATE TABLE public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  provider text NOT NULL CHECK (provider IN ('razorpay', 'shiprocket')),
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connected', 'error')),
  credentials_ciphertext text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, provider)
);

CREATE TABLE public.otp_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  order_id uuid,
  phone text NOT NULL,
  purpose text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, order_id) REFERENCES public.orders(store_id, id)
);
CREATE INDEX otp_verifications_phone_idx ON public.otp_verifications (store_id, phone, purpose, created_at DESC);
CREATE INDEX otp_verifications_order_idx ON public.otp_verifications (store_id, order_id);
CREATE INDEX otp_verifications_expiry_idx ON public.otp_verifications (expires_at);

CREATE TABLE public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  order_id uuid,
  recipient text NOT NULL,
  template text NOT NULL,
  provider_message_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_code text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, order_id) REFERENCES public.orders(store_id, id)
);
CREATE INDEX email_log_order_idx ON public.email_log (store_id, order_id);
CREATE INDEX email_log_status_idx ON public.email_log (store_id, status, created_at DESC);
CREATE INDEX email_log_provider_idx ON public.email_log (store_id, provider_message_id);

CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, provider, event_id)
);
CREATE INDEX webhook_events_status_idx ON public.webhook_events (store_id, status, created_at);

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  actor_user_id uuid REFERENCES public.users(id),
  actor_type text NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'system', 'platform_admin')),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_store_created_idx ON public.audit_log (store_id, created_at DESC);
CREATE INDEX audit_log_actor_idx ON public.audit_log (actor_user_id);
CREATE INDEX audit_log_entity_idx ON public.audit_log (store_id, entity_type, entity_id);

-- Every app table maintains updated_at automatically.
CREATE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  NEW.updated_at := statement_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'brands', 'stores', 'users', 'store_members', 'themes', 'pages',
    'page_versions', 'media', 'policy_pages', 'products', 'product_options',
    'product_media', 'collections', 'collection_products', 'customers',
    'customer_addresses', 'orders', 'order_items', 'payments', 'shipments',
    'refunds', 'invoices', 'invoice_sequences', 'domains', 'integrations',
    'otp_verifications', 'email_log', 'webhook_events', 'audit_log'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',
      table_name
    );
  END LOOP;
END;
$$;

-- Requirements: orders and invoices are cancelled/refunded, never deleted.
CREATE FUNCTION public.prevent_history_deletion()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Orders and invoices cannot be deleted; cancel or refund instead'
    USING ERRCODE = '23514';
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_history_deletion() FROM PUBLIC;
CREATE TRIGGER preserve_order_history BEFORE DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.prevent_history_deletion();
CREATE TRIGGER preserve_invoice_history BEFORE DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.prevent_history_deletion();