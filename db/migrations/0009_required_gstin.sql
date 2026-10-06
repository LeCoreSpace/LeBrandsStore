-- New invoices are GST invoices only. Historical documents remain untouched,
-- readable and cancellable; this is INSERT-only, not a new Bill of Supply flow.
CREATE FUNCTION public.gstin_is_valid(p_gstin text,p_state text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE
  v_alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_sum integer := 0;
  v_factor integer := 2;
  v_product integer;
  v_i integer;
BEGIN
  IF p_gstin IS NULL OR p_state IS NULL
    OR p_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
    OR p_state !~ '^(0[1-9]|1[0-9]|2[0-4]|26|27|29|3[0-8])$'
    OR left(p_gstin,2) <> p_state THEN RETURN false; END IF;
  FOR v_i IN REVERSE 14..1 LOOP
    v_product := (strpos(v_alphabet,substr(p_gstin,v_i,1)) - 1) * v_factor;
    v_sum := v_sum + v_product / 36 + v_product % 36;
    v_factor := 3 - v_factor;
  END LOOP;
  RETURN substr(v_alphabet,((36 - v_sum % 36) % 36) + 1,1) = right(p_gstin,1);
END $$;
ALTER FUNCTION public.gstin_is_valid(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.gstin_is_valid(text,text) FROM PUBLIC, lebrands_app;

CREATE FUNCTION public.validate_new_tax_invoice()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_item jsonb;
BEGIN
  IF NEW.document_type <> 'tax_invoice' OR NOT public.gstin_is_valid(
    NEW.snapshot->'supplier'->>'gstin',NEW.snapshot->'supplier'->>'state') THEN
    RAISE EXCEPTION 'A valid GSTIN matching the registered business state is required for new invoices'
      USING ERRCODE = 'check_violation';
  END IF;
  FOR v_item IN SELECT element.value FROM
    jsonb_array_elements(COALESCE(NEW.snapshot->'items','[]'::jsonb)) AS element(value) LOOP
    IF (v_item->>'gst_rate')::numeric = 0 AND (
      COALESCE((v_item->>'tax_paise')::bigint,0) <> 0
      OR COALESCE((v_item->>'cgst_paise')::bigint,0) <> 0
      OR COALESCE((v_item->>'sgst_paise')::bigint,0) <> 0
      OR COALESCE((v_item->>'igst_paise')::bigint,0) <> 0) THEN
      RAISE EXCEPTION 'Exempt invoice lines must have zero tax' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
ALTER FUNCTION public.validate_new_tax_invoice() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.validate_new_tax_invoice() FROM PUBLIC, lebrands_app;
CREATE TRIGGER validate_new_tax_invoice BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.validate_new_tax_invoice();
DO $$
DECLARE v_role text;
BEGIN
  FOR v_role IN SELECT rolname FROM pg_catalog.pg_roles
    WHERE rolname IN ('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.gstin_is_valid(text,text),
      public.validate_new_tax_invoice() FROM %I',v_role);
  END LOOP;
END $$;
