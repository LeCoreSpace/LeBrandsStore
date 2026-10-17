-- Backward-compatible SKU checkout. Never rewrites historical order lines.
ALTER TABLE public.order_items ADD COLUMN option_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK(jsonb_typeof(option_snapshot)='array' AND jsonb_array_length(option_snapshot)<=3);

-- Reject base-only inserts from older Workers after a product acquires variants.
-- Keep ordinary tenant RLS and composite ownership FKs; no extra write grants.
CREATE FUNCTION public.guard_order_sku() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.product_option_id IS NULL AND EXISTS(
    SELECT 1 FROM public.product_options v WHERE v.store_id=NEW.store_id AND v.product_id=NEW.product_id
  ) THEN
    RAISE EXCEPTION 'A selected SKU is required for this product' USING ERRCODE='23514';
  END IF;
  IF NEW.product_option_id IS NOT NULL AND (
    NEW.sku IS NULL OR btrim(NEW.sku)='' OR jsonb_array_length(NEW.option_snapshot)=0
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.option_snapshot) a
      WHERE jsonb_typeof(a)<>'object' OR jsonb_typeof(a->'name') IS DISTINCT FROM 'string'
        OR jsonb_typeof(a->'value') IS DISTINCT FROM 'string'
        OR length(btrim(a->>'name'))=0 OR length(btrim(a->>'value'))=0)
  ) THEN
    RAISE EXCEPTION 'SKU and selected option snapshots are required' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_sku_guard BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_sku();
REVOKE ALL ON FUNCTION public.guard_order_sku() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.sku_checkout_ready() RETURNS boolean LANGUAGE sql STABLE
  SET search_path=pg_catalog AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.sku_checkout_ready() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sku_checkout_ready() TO lebrands_app;
