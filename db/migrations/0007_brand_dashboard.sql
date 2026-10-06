-- Manual only. Never change the preceding migrations.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Dashboard migration requires an administrative BYPASSRLS role';
  END IF;
END $$;
-- Account tables stay private. Resolve a display name only inside the same
-- tenant context and only for a member of that store.
CREATE FUNCTION public.store_actor_name(p_store_id uuid,p_user_id uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT u.name FROM public.users u JOIN public.store_members m ON m.user_id = u.id
    WHERE m.store_id = p_store_id AND u.id = p_user_id
      AND p_store_id = NULLIF(current_setting('app.store_id',true),'')::uuid
$$;
REVOKE ALL ON FUNCTION public.store_actor_name(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_actor_name(uuid,uuid) TO lebrands_app;
ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK
  (status IN ('pending_payment','confirmed','confirmed_cod','paid','processing','packed','shipped','delivered','cancelled','refunded','returned','rto'));
ALTER TABLE public.orders ADD COLUMN payment_collected_at timestamptz;
ALTER TABLE public.orders ADD COLUMN stock_restored_at timestamptz;
ALTER TABLE public.orders ADD COLUMN supplier_snapshot jsonb;
ALTER TABLE public.order_items ADD COLUMN inventory_deducted boolean NOT NULL DEFAULT false;
-- Historical checkout reduced tracked stock; use the best available legacy information.
UPDATE public.order_items i SET inventory_deducted = p.track_inventory
  FROM public.products p WHERE p.store_id = i.store_id AND p.id = i.product_id;
ALTER TABLE public.invoices ADD COLUMN document_type text NOT NULL DEFAULT 'tax_invoice'
  CHECK (document_type IN ('tax_invoice','receipt'));
ALTER TABLE public.invoices ADD COLUMN snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.invoices ADD COLUMN credit_note_number text;
ALTER TABLE public.invoices ADD COLUMN cancelled_at timestamptz;
ALTER TABLE public.invoices ADD CONSTRAINT invoice_cancellation_record CHECK
  ((status = 'issued' AND credit_note_number IS NULL AND cancelled_at IS NULL) OR
   (status = 'cancelled'));
ALTER TABLE public.invoice_sequences ADD COLUMN last_credit_number bigint NOT NULL DEFAULT 0 CHECK (last_credit_number >= 0);
CREATE UNIQUE INDEX invoices_credit_unique ON public.invoices(store_id,credit_note_number);
-- Invoices and audit entries retain their content after issuance.
CREATE FUNCTION public.protect_issued_invoice() RETURNS trigger LANGUAGE plpgsql
  SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.status = 'issued' AND NEW.status = 'cancelled'
     AND (NEW.credit_note_number IS NULL OR NEW.cancelled_at IS NULL) THEN
    RAISE EXCEPTION 'Cancelled invoices require a dated credit note record' USING ERRCODE = '23514';
  END IF;
  IF NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR NEW.financial_year IS DISTINCT FROM OLD.financial_year
     OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.document_type IS DISTINCT FROM OLD.document_type
     OR NEW.subtotal_paise IS DISTINCT FROM OLD.subtotal_paise OR NEW.tax_paise IS DISTINCT FROM OLD.tax_paise
     OR NEW.total_paise IS DISTINCT FROM OLD.total_paise OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
     OR (OLD.status = 'cancelled' AND (NEW.status IS DISTINCT FROM OLD.status
       OR NEW.credit_note_number IS DISTINCT FROM OLD.credit_note_number OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at)) THEN
    RAISE EXCEPTION 'Issued invoice content is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_issued_invoice BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.protect_issued_invoice();
REVOKE ALL ON FUNCTION public.protect_issued_invoice() FROM PUBLIC;
REVOKE UPDATE,DELETE ON public.audit_log FROM lebrands_app;
REVOKE DELETE ON public.invoice_sequences FROM lebrands_app;
CREATE FUNCTION public.protect_invoice_counter() RETURNS trigger LANGUAGE plpgsql
  SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.financial_year IS DISTINCT FROM OLD.financial_year
    OR NEW.last_number < OLD.last_number OR NEW.last_number > OLD.last_number + 1
    OR NEW.last_credit_number < OLD.last_credit_number OR NEW.last_credit_number > OLD.last_credit_number + 1 THEN
    RAISE EXCEPTION 'Invoice counters cannot be reset, moved or skip numbers' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_invoice_counter BEFORE UPDATE ON public.invoice_sequences
  FOR EACH ROW EXECUTE FUNCTION public.protect_invoice_counter();
REVOKE ALL ON FUNCTION public.protect_invoice_counter() FROM PUBLIC;
CREATE INDEX orders_dashboard_source ON public.orders(store_id,created_at,source);
