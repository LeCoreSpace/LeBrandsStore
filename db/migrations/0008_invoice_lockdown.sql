-- Review/apply manually. Never modify the already-applied migration 0007.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'postgres' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Invoice function owner postgres must bypass forced RLS';
  END IF;
END $$;

-- Invoice lines are embedded in invoices.snapshot.items, not a separate table.
-- order_items remains writable for checkout; it is not an invoice-items table.
REVOKE ALL ON TABLE public.invoices, public.invoice_sequences FROM PUBLIC, lebrands_app;
GRANT SELECT ON TABLE public.invoices, public.invoice_sequences TO lebrands_app;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_sequences FORCE ROW LEVEL SECURITY;
DROP POLICY tenant_isolation ON public.invoices;
CREATE POLICY tenant_isolation ON public.invoices FOR SELECT TO lebrands_app
  USING (store_id = NULLIF(current_setting('app.store_id',true),'')::uuid);
DROP POLICY tenant_isolation ON public.invoice_sequences;
CREATE POLICY tenant_isolation ON public.invoice_sequences FOR SELECT TO lebrands_app
  USING (store_id = NULLIF(current_setting('app.store_id',true),'')::uuid);

CREATE FUNCTION public.issue_invoice(p_order_id uuid)
RETURNS TABLE(id uuid,invoice_number text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_store_id uuid;
  v_order public.orders%ROWTYPE;
  v_store public.stores%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_settings jsonb;
  v_supplier jsonb;
  v_items jsonb;
  v_state text;
  v_document_type text;
  v_now timestamptz := now();
  v_start integer;
  v_fy text;
  v_last bigint;
  v_prefix text;
  v_number text;
BEGIN
  BEGIN
    v_store_id := NULLIF(current_setting('app.store_id',true),'')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Store context is required' USING ERRCODE = 'insufficient_privilege';
  END;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Store context is required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Definer bypasses RLS: every tenant read/write below explicitly filters store_id.
  SELECT o.* INTO v_order FROM public.orders o
    WHERE o.store_id = v_store_id AND o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order is not in the current store' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT i.* INTO v_invoice FROM public.invoices i
    WHERE i.store_id = v_store_id AND i.order_id = p_order_id;
  IF FOUND THEN
    RETURN QUERY SELECT v_invoice.id,v_invoice.invoice_number;
    RETURN;
  END IF;
  IF v_order.status NOT IN ('shipped','delivered','returned','rto') THEN
    RAISE EXCEPTION 'Invoices are issued when an order is shipped' USING ERRCODE = 'check_violation';
  END IF;
  SELECT s.* INTO v_store FROM public.stores s WHERE s.store_id = v_store_id;
  SELECT p.snapshot->'settings' INTO v_settings FROM public.store_publications p
    WHERE p.store_id = v_store_id;
  v_settings := COALESCE(v_settings,'{}'::jsonb);
  IF v_order.supplier_snapshot IS NOT NULL THEN
    v_supplier := v_order.supplier_snapshot;
  ELSE
    -- Same legacy fallback as inferStoreState: valid GST prefix, then state name
    -- in the address (alphabetical order), otherwise an empty state.
    SELECT s.code INTO v_state FROM (VALUES
      ('01','Jammu and Kashmir'),('02','Himachal Pradesh'),('03','Punjab'),('04','Chandigarh'),
      ('05','Uttarakhand'),('06','Haryana'),('07','Delhi'),('08','Rajasthan'),('09','Uttar Pradesh'),
      ('10','Bihar'),('11','Sikkim'),('12','Arunachal Pradesh'),('13','Nagaland'),('14','Manipur'),
      ('15','Mizoram'),('16','Tripura'),('17','Meghalaya'),('18','Assam'),('19','West Bengal'),
      ('20','Jharkhand'),('21','Odisha'),('22','Chhattisgarh'),('23','Madhya Pradesh'),('24','Gujarat'),
      ('26','Dadra and Nagar Haveli and Daman and Diu'),('27','Maharashtra'),('29','Karnataka'),
      ('30','Goa'),('31','Lakshadweep'),('32','Kerala'),('33','Tamil Nadu'),('34','Puducherry'),
      ('35','Andaman and Nicobar Islands'),('36','Telangana'),('37','Andhra Pradesh'),('38','Ladakh')
    ) AS s(code,name)
      WHERE s.code = left(COALESCE(v_settings->>'gstin',''),2)
        OR position(lower(s.name) IN lower(COALESCE(v_settings->>'address',''))) > 0
      ORDER BY (s.code = left(COALESCE(v_settings->>'gstin',''),2)) DESC,s.name LIMIT 1;
    v_supplier := jsonb_build_object(
      'legal_name',COALESCE(NULLIF(v_settings->>'legal_name',''),v_store.name),
      'address',v_settings->>'address','gstin',COALESCE(v_settings->>'gstin',''),
      'state',COALESCE(v_state,''));
  END IF;
  IF COALESCE(v_supplier->>'legal_name','') = '' OR COALESCE(v_supplier->>'address','') = '' THEN
    RAISE EXCEPTION 'Complete the supplier legal name and address before shipping' USING ERRCODE = 'check_violation';
  END IF;
  v_document_type := CASE WHEN COALESCE(v_supplier->>'gstin','') <> '' THEN 'tax_invoice' ELSE 'receipt' END;
  IF v_document_type = 'tax_invoice' THEN
    IF COALESCE(v_supplier->>'gstin','') !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
      OR left(v_supplier->>'gstin',2) IS DISTINCT FROM v_supplier->>'state' THEN
      RAISE EXCEPTION 'The supplier GSTIN and GST state do not match' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.order_items oi
      WHERE oi.store_id = v_store_id AND oi.order_id = p_order_id AND oi.tax_paise > 0
        AND CASE WHEN v_supplier->>'state' = v_order.shipping_address->>'state'
          THEN oi.igst_paise <> 0 ELSE oi.cgst_paise <> 0 OR oi.sgst_paise <> 0 END) THEN
      RAISE EXCEPTION 'The stored order tax split does not match the place of supply' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(oi) ORDER BY oi.created_at,oi.id),'[]'::jsonb)
    INTO v_items FROM public.order_items oi WHERE oi.store_id = v_store_id AND oi.order_id = p_order_id;
  v_start := extract(year FROM v_now AT TIME ZONE 'Asia/Kolkata')::integer;
  IF extract(month FROM v_now AT TIME ZONE 'Asia/Kolkata') < 4 THEN v_start := v_start - 1; END IF;
  v_fy := v_start::text || '-' || right((v_start + 1)::text,2);
  -- Concurrent first orders compete on the unique store/FY row; rollback also
  -- rolls back its creation/increment, so no allocation survives failed issuance.
  INSERT INTO public.invoice_sequences(store_id,financial_year,last_number)
    VALUES (v_store_id,v_fy,0) ON CONFLICT(store_id,financial_year) DO NOTHING;
  SELECT seq.last_number INTO v_last FROM public.invoice_sequences seq
    WHERE seq.store_id = v_store_id AND seq.financial_year = v_fy FOR UPDATE;
  v_last := v_last + 1;
  IF v_last > 9007199254740991 THEN
    RAISE EXCEPTION 'Invalid document sequence' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.invoice_sequences seq SET last_number = v_last
    WHERE seq.store_id = v_store_id AND seq.financial_year = v_fy;
  v_prefix := COALESCE(NULLIF(upper(left(regexp_replace(COALESCE(v_store.subdomain,''),'[^a-zA-Z0-9]','','g'),12)),''),'STO');
  v_number := v_prefix || '/' || v_fy || '/' || lpad(v_last::text,greatest(4,length(v_last::text)),'0');
  INSERT INTO public.invoices(store_id,order_id,invoice_number,financial_year,document_type,
    subtotal_paise,tax_paise,total_paise,snapshot,issued_at)
    VALUES (v_store_id,p_order_id,v_number,v_fy,v_document_type,v_order.subtotal_paise,
      CASE WHEN v_document_type = 'tax_invoice' THEN v_order.tax_paise ELSE 0 END,v_order.total_paise,
      jsonb_build_object('supplier',v_supplier,'customer',v_order.shipping_address,'items',v_items,
        'order_number',v_order.order_number,'totals',to_jsonb(v_order),'place_of_supply',v_order.shipping_address->>'state'),v_now)
    RETURNING * INTO v_invoice;
  RETURN QUERY SELECT v_invoice.id,v_invoice.invoice_number;
END $$;
ALTER FUNCTION public.issue_invoice(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.issue_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_invoice(uuid) TO lebrands_app;

-- The only other invoice mutation is a guarded cancellation/credit-note record.
-- It is separate from idempotent issuance and exposes no amounts/snapshot edits.
CREATE FUNCTION public.cancel_invoice(p_order_id uuid)
RETURNS TABLE(id uuid,invoice_number text,credit_note_number text,changed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_store_id uuid;
  v_order public.orders%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_subdomain text;
  v_prefix text;
  v_last bigint;
  v_credit text;
BEGIN
  BEGIN
    v_store_id := NULLIF(current_setting('app.store_id',true),'')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Store context is required' USING ERRCODE = 'insufficient_privilege';
  END;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Store context is required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT o.* INTO v_order FROM public.orders o
    WHERE o.store_id = v_store_id AND o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order is not in the current store' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT i.* INTO v_invoice FROM public.invoices i
    WHERE i.store_id = v_store_id AND i.order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_invoice.status = 'cancelled' THEN
    RETURN QUERY SELECT v_invoice.id,v_invoice.invoice_number,v_invoice.credit_note_number,false;
    RETURN;
  END IF;
  IF v_order.status NOT IN ('cancelled','returned','rto') THEN
    RAISE EXCEPTION 'Cancel or return the order before cancelling its invoice' USING ERRCODE = 'check_violation';
  END IF;
  SELECT seq.last_credit_number INTO v_last FROM public.invoice_sequences seq
    WHERE seq.store_id = v_store_id AND seq.financial_year = v_invoice.financial_year FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The invoice sequence is missing' USING ERRCODE = 'check_violation';
  END IF;
  v_last := v_last + 1;
  IF v_last > 9007199254740991 THEN
    RAISE EXCEPTION 'Invalid document sequence' USING ERRCODE = 'check_violation';
  END IF;
  SELECT s.subdomain INTO v_subdomain FROM public.stores s WHERE s.store_id = v_store_id;
  v_prefix := COALESCE(NULLIF(upper(left(regexp_replace(COALESCE(v_subdomain,''),'[^a-zA-Z0-9]','','g'),12)),''),'STO');
  v_credit := v_prefix || '/CN/' || v_invoice.financial_year || '/' || lpad(v_last::text,greatest(4,length(v_last::text)),'0');
  UPDATE public.invoice_sequences seq SET last_credit_number = v_last
    WHERE seq.store_id = v_store_id AND seq.financial_year = v_invoice.financial_year;
  UPDATE public.invoices i SET status = 'cancelled',credit_note_number = v_credit,cancelled_at = now()
    WHERE i.store_id = v_store_id AND i.id = v_invoice.id;
  RETURN QUERY SELECT v_invoice.id,v_invoice.invoice_number,v_credit,true;
END $$;
ALTER FUNCTION public.cancel_invoice(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cancel_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_invoice(uuid) TO lebrands_app;

CREATE OR REPLACE FUNCTION public.protect_issued_invoice() RETURNS trigger LANGUAGE plpgsql
  SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Invoices cannot be deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status = 'issued' AND NEW.status = 'cancelled'
    AND (NEW.credit_note_number IS NULL OR NEW.cancelled_at IS NULL) THEN
    RAISE EXCEPTION 'Cancelled invoices require a dated credit note record' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.order_id IS DISTINCT FROM OLD.order_id
    OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR NEW.financial_year IS DISTINCT FROM OLD.financial_year
    OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.document_type IS DISTINCT FROM OLD.document_type
    OR NEW.subtotal_paise IS DISTINCT FROM OLD.subtotal_paise OR NEW.tax_paise IS DISTINCT FROM OLD.tax_paise
    OR NEW.total_paise IS DISTINCT FROM OLD.total_paise OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
    OR (OLD.status = 'cancelled' AND (NEW.status IS DISTINCT FROM OLD.status
      OR NEW.credit_note_number IS DISTINCT FROM OLD.credit_note_number OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at)) THEN
    RAISE EXCEPTION 'Issued invoice content is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION public.protect_issued_invoice() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.protect_issued_invoice() FROM PUBLIC, lebrands_app;
-- Runs before preserve_invoice_history alphabetically, giving 42501 rather than
-- the old generic history exception. Marked test cleanup already disables triggers
-- transaction-locally as the administrative role; this adds no cleanup bypass.
CREATE TRIGGER invoice_delete_lockdown BEFORE DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.protect_issued_invoice();

CREATE OR REPLACE FUNCTION public.protect_invoice_counter() RETURNS trigger LANGUAGE plpgsql
  SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.financial_year IS DISTINCT FROM OLD.financial_year
    OR NEW.last_number < OLD.last_number OR NEW.last_number > OLD.last_number + 1
    OR NEW.last_credit_number < OLD.last_credit_number OR NEW.last_credit_number > OLD.last_credit_number + 1 THEN
    RAISE EXCEPTION 'Invoice counters cannot be reset, moved or skip numbers' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION public.protect_invoice_counter() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.protect_invoice_counter() FROM PUBLIC, lebrands_app;
-- Supabase default function ACLs can include API roles in addition to PUBLIC.
-- Do not expose these functions through those roles/PostgREST.
DO $$
DECLARE v_role text;
BEGIN
  FOR v_role IN SELECT rolname FROM pg_catalog.pg_roles
    WHERE rolname IN ('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.issue_invoice(uuid), public.cancel_invoice(uuid),
      public.protect_issued_invoice(), public.protect_invoice_counter() FROM %I',v_role);
  END LOOP;
END $$;
