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

-- GST Rule 46/53 numbering. Existing documents and counters are never rewritten.
CREATE FUNCTION public.default_invoice_prefix(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT left(COALESCE(NULLIF(regexp_replace(upper(COALESCE(p_name,'')),'[^B-DF-HJ-NP-TV-Z0-9]','','g'),''),
    NULLIF(regexp_replace(upper(COALESCE(p_name,'')),'[^A-Z0-9]','','g'),''),'STO'),3)
$$;
CREATE FUNCTION public.invoice_serial(p_prefix text,p_fy text,p_sequence bigint,p_credit boolean)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE v_number text;
BEGIN
  IF p_prefix IS NULL OR p_prefix !~ '^[A-Z0-9]{1,4}$' OR p_fy IS NULL
    OR p_fy !~ '^[0-9]{4}-[0-9]{2}$' OR p_sequence IS NULL OR p_sequence < 1
    OR p_sequence > 9007199254740991 THEN
    RAISE EXCEPTION 'Invalid document serial' USING ERRCODE = 'check_violation';
  END IF;
  v_number := p_prefix || CASE WHEN p_credit THEN 'C' ELSE '' END || '/' ||
    substr(p_fy,3) || '/' || lpad(p_sequence::text,greatest(4,length(p_sequence::text)),'0');
  IF length(v_number) > 16 THEN
    RAISE EXCEPTION 'Document serial cannot exceed 16 characters' USING ERRCODE = 'check_violation';
  END IF;
  RETURN v_number;
END $$;

ALTER TABLE public.store_setup ADD CONSTRAINT invoice_prefix_valid
  CHECK (settings->>'invoice_prefix' IS NULL OR settings->>'invoice_prefix' ~ '^[A-Z0-9]{1,4}$');
-- Pin defaults on existing stores, not on their historical financial documents.
-- This prevents a brand rename from changing an implicit prefix after issuance.
UPDATE public.store_setup st SET settings = jsonb_set(st.settings,'{invoice_prefix}',
  to_jsonb(public.default_invoice_prefix(COALESCE(st.settings->>'brand_name',s.name))))
  FROM public.stores s WHERE s.store_id = st.store_id AND st.settings->>'invoice_prefix' IS NULL;
-- Pin the published default independently of any unpublished draft changes.
UPDATE public.store_publications p SET snapshot = jsonb_set(p.snapshot,'{settings}',
  COALESCE(p.snapshot->'settings','{}'::jsonb) || jsonb_build_object('invoice_prefix',
    public.default_invoice_prefix(COALESCE(p.snapshot->'settings'->>'brand_name',
      p.snapshot->'store'->>'name',s.name))))
  FROM public.stores s WHERE s.store_id = p.store_id
    AND p.snapshot->'settings'->>'invoice_prefix' IS NULL;
ALTER TABLE public.store_publications ADD CONSTRAINT published_invoice_prefix_valid
  CHECK (snapshot->'settings'->>'invoice_prefix' IS NULL
    OR snapshot->'settings'->>'invoice_prefix' ~ '^[A-Z0-9]{1,4}$');
CREATE FUNCTION public.guard_invoice_prefix() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public AS $$
DECLARE v_old text; v_new text; v_name text; v_start timestamp; v_boundary timestamptz; v_scope uuid;
  v_id uuid; v_old_settings jsonb; v_new_settings jsonb; v_existing_published boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN v_id := NEW.store_id; ELSE v_id := OLD.store_id; END IF;
  IF TG_TABLE_NAME = 'store_publications' THEN
    -- Serialize direct SQL republish/delete with issuance as well as Worker
    -- writes, whose outer transaction already locks the store first.
    PERFORM 1 FROM public.store_setup st WHERE st.store_id = v_id FOR UPDATE;
    IF TG_OP = 'INSERT' THEN
      -- BEFORE INSERT also runs for ON CONFLICT republish. Compare that
      -- candidate against the existing published prefix, not an empty row.
      SELECT COALESCE(p.snapshot->'settings','{}'::jsonb) INTO v_old_settings
        FROM public.store_publications p WHERE p.store_id = v_id FOR UPDATE;
      v_existing_published := FOUND;
      v_old_settings := COALESCE(v_old_settings,'{}'::jsonb);
    ELSE v_old_settings := COALESCE(OLD.snapshot->'settings','{}'::jsonb); END IF;
    IF TG_OP <> 'DELETE' THEN v_new_settings := COALESCE(NEW.snapshot->'settings','{}'::jsonb); END IF;
  ELSE
    v_old_settings := OLD.settings;
    IF TG_OP <> 'DELETE' THEN v_new_settings := NEW.settings; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    v_start := date_trunc('year',now() AT TIME ZONE 'Asia/Kolkata') + interval '3 months';
    IF now() AT TIME ZONE 'Asia/Kolkata' < v_start THEN v_start := v_start - interval '1 year'; END IF;
    v_boundary := v_start AT TIME ZONE 'Asia/Kolkata';
    IF EXISTS (SELECT 1 FROM public.invoices i WHERE i.store_id = v_id AND
      (i.issued_at >= v_boundary OR (i.credit_note_number IS NOT NULL AND i.cancelled_at >= v_boundary))) THEN
      RAISE EXCEPTION 'Invoice prefix is locked until the next Indian financial year' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;
  SELECT s.name INTO v_name FROM public.stores s WHERE s.store_id = v_id;
  v_old := COALESCE(v_old_settings->>'invoice_prefix',public.default_invoice_prefix(COALESCE(v_old_settings->>'brand_name',v_name)));
  v_new := COALESCE(v_new_settings->>'invoice_prefix',public.default_invoice_prefix(COALESCE(v_new_settings->>'brand_name',v_name)));
  IF v_old IS DISTINCT FROM v_new OR
    (v_old_settings->>'invoice_prefix' IS NOT NULL AND v_new_settings->>'invoice_prefix' IS NULL)
    OR (TG_OP = 'INSERT' AND TG_TABLE_NAME = 'store_publications' AND NOT v_existing_published) THEN
    BEGIN
      v_scope := NULLIF(current_setting('app.store_id',true),'')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Store context is required' USING ERRCODE = 'insufficient_privilege';
    END;
    IF v_scope IS DISTINCT FROM v_id OR NEW.store_id IS DISTINCT FROM v_id THEN
      RAISE EXCEPTION 'Store context is required' USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_start := date_trunc('year',now() AT TIME ZONE 'Asia/Kolkata') + interval '3 months';
    IF now() AT TIME ZONE 'Asia/Kolkata' < v_start THEN v_start := v_start - interval '1 year'; END IF;
    v_boundary := v_start AT TIME ZONE 'Asia/Kolkata';
    IF EXISTS (SELECT 1 FROM public.invoices i WHERE i.store_id = v_id AND
      ((i.issued_at >= v_boundary AND i.issued_at < v_boundary + interval '1 year') OR
       (i.credit_note_number IS NOT NULL AND i.cancelled_at >= v_boundary AND i.cancelled_at < v_boundary + interval '1 year'))) THEN
      RAISE EXCEPTION 'Invoice prefix is locked until the next Indian financial year'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'store_publications' THEN
    NEW.snapshot := jsonb_set(NEW.snapshot,'{settings}',
      v_new_settings || jsonb_build_object('invoice_prefix',v_new));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_invoice_prefix BEFORE UPDATE OF settings ON public.store_setup
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_prefix();
CREATE TRIGGER guard_invoice_prefix_delete BEFORE DELETE ON public.store_setup
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_prefix();
CREATE TRIGGER guard_published_invoice_prefix BEFORE INSERT OR UPDATE OF snapshot ON public.store_publications
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_prefix();
CREATE TRIGGER guard_published_invoice_prefix_delete BEFORE DELETE ON public.store_publications
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_prefix();

CREATE FUNCTION public.supplier_is_complete(p_supplier jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog,public AS $$
  SELECT COALESCE(length(trim(p_supplier->>'legal_name')) > 0
    AND length(trim(p_supplier->>'line1')) > 0 AND length(trim(p_supplier->>'city')) > 0
    AND p_supplier->>'pincode' ~ '^[1-9][0-9]{5}$'
    AND public.gstin_is_valid(p_supplier->>'gstin',p_supplier->>'state'),false)
$$;
CREATE FUNCTION public.invoice_supplier(p_store_id uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog,public AS $$
DECLARE v_settings jsonb; v_supplier jsonb; v_signature text;
BEGIN
  SELECT st.settings INTO v_settings FROM public.store_setup st WHERE st.store_id = p_store_id;
  SELECT 'https://media.lebrands.store/' || m.object_key INTO v_signature FROM public.media m
    WHERE m.store_id = p_store_id AND m.id::text = v_settings->>'signature_media_id' AND m.upload_type = 'logo'
      AND m.object_key LIKE 'stores/' || p_store_id::text || '/%';
  v_supplier := jsonb_build_object('legal_name',v_settings->>'legal_name',
    'line1',v_settings->>'business_line1','line2',v_settings->>'business_line2',
    'city',v_settings->>'business_city','pincode',v_settings->>'business_pincode',
    'state',v_settings->>'business_state','gstin',v_settings->>'gstin','signature_url',v_signature,
    'address',concat_ws(E'\n',v_settings->>'business_line1',NULLIF(v_settings->>'business_line2',''),
      concat_ws(' ',v_settings->>'business_city',v_settings->>'business_pincode')));
  IF NOT public.supplier_is_complete(v_supplier) THEN
    RAISE EXCEPTION 'Complete the registered legal name, full address and valid GSTIN in Settings before shipping'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN v_supplier;
END $$;

CREATE OR REPLACE FUNCTION public.issue_invoice(p_order_id uuid)
RETURNS TABLE(id uuid,invoice_number text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public AS $$
DECLARE v_store_id uuid; v_order public.orders%ROWTYPE; v_invoice public.invoices%ROWTYPE;
  v_settings jsonb; v_supplier jsonb; v_items jsonb; v_prefix text;
  v_now timestamptz := now(); v_start integer; v_fy text; v_last bigint; v_number text;
BEGIN
  BEGIN
    v_store_id := NULLIF(current_setting('app.store_id',true),'')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Store context is required' USING ERRCODE = 'insufficient_privilege';
  END;
  IF v_store_id IS NULL THEN RAISE EXCEPTION 'Store context is required' USING ERRCODE = 'insufficient_privilege'; END IF;
  -- Match the Worker's outer store lock before any order/settings row lock.
  PERFORM 1 FROM public.stores s WHERE s.store_id = v_store_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Store is not in the current context' USING ERRCODE = 'insufficient_privilege'; END IF;
  -- Shared lock ordering: store, setup, publication, order, store/FY counter.
  -- Financial numbering reads only published settings, never draft settings.
  PERFORM 1 FROM public.store_setup st WHERE st.store_id = v_store_id FOR UPDATE;
  SELECT p.snapshot->'settings' INTO v_settings FROM public.store_publications p
    WHERE p.store_id = v_store_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Published invoice settings are required' USING ERRCODE = 'insufficient_privilege'; END IF;
  v_prefix := v_settings->>'invoice_prefix';
  IF v_prefix IS NULL OR btrim(v_prefix) = '' THEN
    RAISE EXCEPTION 'Published invoice prefix is missing; republish the store with a valid invoice prefix'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT o.* INTO v_order FROM public.orders o WHERE o.store_id = v_store_id AND o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order is not in the current store' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT i.* INTO v_invoice FROM public.invoices i WHERE i.store_id = v_store_id AND i.order_id = p_order_id;
  IF FOUND THEN RETURN QUERY SELECT v_invoice.id,v_invoice.invoice_number; RETURN; END IF;
  IF v_order.status NOT IN ('shipped','delivered','returned','rto') THEN
    RAISE EXCEPTION 'Invoices are issued when an order is shipped' USING ERRCODE = 'check_violation';
  END IF;
  v_supplier := public.invoice_supplier(v_store_id);
  IF EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.store_id = v_store_id AND oi.order_id = p_order_id
    AND oi.tax_paise > 0 AND CASE WHEN v_supplier->>'state' = v_order.shipping_address->>'state'
      THEN oi.igst_paise <> 0 ELSE oi.cgst_paise <> 0 OR oi.sgst_paise <> 0 END) THEN
    RAISE EXCEPTION 'The stored order tax split does not match the place of supply' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(oi) || jsonb_build_object('uqc','NOS') ORDER BY oi.created_at,oi.id),'[]'::jsonb)
    INTO v_items FROM public.order_items oi WHERE oi.store_id = v_store_id AND oi.order_id = p_order_id;
  v_start := extract(year FROM v_now AT TIME ZONE 'Asia/Kolkata')::integer;
  IF extract(month FROM v_now AT TIME ZONE 'Asia/Kolkata') < 4 THEN v_start := v_start - 1; END IF;
  v_fy := v_start::text || '-' || right((v_start + 1)::text,2);
  INSERT INTO public.invoice_sequences(store_id,financial_year,last_number)
    VALUES (v_store_id,v_fy,0) ON CONFLICT(store_id,financial_year) DO NOTHING;
  SELECT seq.last_number INTO v_last FROM public.invoice_sequences seq
    WHERE seq.store_id = v_store_id AND seq.financial_year = v_fy FOR UPDATE;
  v_last := v_last + 1;
  v_number := public.invoice_serial(v_prefix,v_fy,v_last,false);
  UPDATE public.invoice_sequences seq SET last_number = v_last WHERE seq.store_id = v_store_id AND seq.financial_year = v_fy;
  INSERT INTO public.invoices(store_id,order_id,invoice_number,financial_year,document_type,
    subtotal_paise,tax_paise,total_paise,snapshot,issued_at)
    VALUES (v_store_id,p_order_id,v_number,v_fy,'tax_invoice',v_order.subtotal_paise,v_order.tax_paise,v_order.total_paise,
      jsonb_build_object('supplier',v_supplier,'customer',v_order.shipping_address,'items',v_items,
        'order_number',v_order.order_number,'totals',to_jsonb(v_order),'place_of_supply',v_order.shipping_address->>'state'),v_now)
    RETURNING * INTO v_invoice;
  RETURN QUERY SELECT v_invoice.id,v_invoice.invoice_number;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_invoice(p_order_id uuid)
RETURNS TABLE(id uuid,invoice_number text,credit_note_number text,changed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public AS $$
DECLARE v_store_id uuid; v_order public.orders%ROWTYPE; v_invoice public.invoices%ROWTYPE;
  v_settings jsonb; v_prefix text; v_last bigint; v_credit text; v_fy text;
  v_now timestamptz := now(); v_start integer;
BEGIN
  BEGIN
    v_store_id := NULLIF(current_setting('app.store_id',true),'')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Store context is required' USING ERRCODE = 'insufficient_privilege';
  END;
  IF v_store_id IS NULL THEN RAISE EXCEPTION 'Store context is required' USING ERRCODE = 'insufficient_privilege'; END IF;
  PERFORM 1 FROM public.stores s WHERE s.store_id = v_store_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Store is not in the current context' USING ERRCODE = 'insufficient_privilege'; END IF;
  PERFORM 1 FROM public.store_setup st WHERE st.store_id = v_store_id FOR UPDATE;
  SELECT p.snapshot->'settings' INTO v_settings FROM public.store_publications p
    WHERE p.store_id = v_store_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Published invoice settings are required' USING ERRCODE = 'insufficient_privilege'; END IF;
  v_prefix := v_settings->>'invoice_prefix';
  IF v_prefix IS NULL OR btrim(v_prefix) = '' THEN
    RAISE EXCEPTION 'Published invoice prefix is missing; republish the store with a valid invoice prefix'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT o.* INTO v_order FROM public.orders o WHERE o.store_id = v_store_id AND o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order is not in the current store' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT i.* INTO v_invoice FROM public.invoices i WHERE i.store_id = v_store_id AND i.order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_invoice.status = 'cancelled' THEN
    RETURN QUERY SELECT v_invoice.id,v_invoice.invoice_number,v_invoice.credit_note_number,false; RETURN;
  END IF;
  IF v_order.status NOT IN ('cancelled','returned','rto') THEN
    RAISE EXCEPTION 'Cancel or return the order before cancelling its invoice' USING ERRCODE = 'check_violation';
  END IF;
  v_start := extract(year FROM v_now AT TIME ZONE 'Asia/Kolkata')::integer;
  IF extract(month FROM v_now AT TIME ZONE 'Asia/Kolkata') < 4 THEN v_start := v_start - 1; END IF;
  v_fy := v_start::text || '-' || right((v_start + 1)::text,2);
  INSERT INTO public.invoice_sequences(store_id,financial_year,last_number,last_credit_number)
    VALUES (v_store_id,v_fy,0,0) ON CONFLICT(store_id,financial_year) DO NOTHING;
  SELECT seq.last_credit_number INTO v_last FROM public.invoice_sequences seq
    WHERE seq.store_id = v_store_id AND seq.financial_year = v_fy FOR UPDATE;
  v_last := v_last + 1;
  v_credit := public.invoice_serial(v_prefix,v_fy,v_last,true);
  UPDATE public.invoice_sequences seq SET last_credit_number = v_last WHERE seq.store_id = v_store_id AND seq.financial_year = v_fy;
  UPDATE public.invoices i SET status = 'cancelled',credit_note_number = v_credit,cancelled_at = v_now
    WHERE i.store_id = v_store_id AND i.id = v_invoice.id;
  RETURN QUERY SELECT v_invoice.id,v_invoice.invoice_number,v_credit,true;
END $$;

-- New helpers are internal only. Replaced authorities keep 0008's APP EXECUTE
-- boundary; no invoice/counter table grant or RLS policy is changed.
ALTER FUNCTION public.default_invoice_prefix(text) OWNER TO postgres;
ALTER FUNCTION public.invoice_serial(text,text,bigint,boolean) OWNER TO postgres;
ALTER FUNCTION public.guard_invoice_prefix() OWNER TO postgres;
ALTER FUNCTION public.supplier_is_complete(jsonb) OWNER TO postgres;
ALTER FUNCTION public.invoice_supplier(uuid) OWNER TO postgres;
ALTER FUNCTION public.issue_invoice(uuid) OWNER TO postgres;
ALTER FUNCTION public.cancel_invoice(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.default_invoice_prefix(text),public.invoice_serial(text,text,bigint,boolean),
  public.guard_invoice_prefix(),public.supplier_is_complete(jsonb),public.invoice_supplier(uuid) FROM PUBLIC,lebrands_app;
REVOKE ALL ON FUNCTION public.issue_invoice(uuid),public.cancel_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_invoice(uuid),public.cancel_invoice(uuid) TO lebrands_app;
DO $$
DECLARE v_role text;
BEGIN
  FOR v_role IN SELECT rolname FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.default_invoice_prefix(text),public.invoice_serial(text,text,bigint,boolean),
      public.guard_invoice_prefix(),public.supplier_is_complete(jsonb),public.invoice_supplier(uuid),
      public.issue_invoice(uuid),public.cancel_invoice(uuid) FROM %I',v_role);
  END LOOP;
END $$;
ALTER FUNCTION public.gstin_is_valid(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.gstin_is_valid(text,text) FROM PUBLIC, lebrands_app;

CREATE FUNCTION public.validate_new_tax_invoice()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_item jsonb;
BEGIN
  IF NOT public.supplier_is_complete(NEW.snapshot->'supplier') THEN
    RAISE EXCEPTION 'Complete the registered supplier address and GSTIN in Settings' USING ERRCODE = 'check_violation';
  END IF;
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
