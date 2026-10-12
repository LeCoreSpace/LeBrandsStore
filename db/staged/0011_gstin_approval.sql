-- STAGED ONLY: do not place this file in db/migrations until 0009 has been
-- manually migrated and deployed. db:migrate applies ALL pending migrations.
-- This is the approval/verification storage foundation for the 0011 flow.
ALTER TABLE public.stores DROP CONSTRAINT stores_status_check;
ALTER TABLE public.stores ADD CONSTRAINT stores_status_check
  CHECK (status IN ('draft','awaiting_approval','live','paused'));
ALTER TABLE public.stores
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN approved_by text,
  ADD COLUMN approval_note text,
  ADD COLUMN approval_revoked_at timestamptz,
  ADD COLUMN approval_revocation_note text,
  ADD CONSTRAINT store_approval_pair CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
  ADD CONSTRAINT store_approval_revocation_pair CHECK
    (approval_revoked_at IS NULL OR (approved_at IS NOT NULL AND approval_revocation_note IS NOT NULL));

-- Preserve every existing live storefront. Do not require a current provider
-- result for stores that were already live at migration time.
UPDATE public.stores SET approved_at = now(), approved_by = 'migration-0011',
  approval_note = 'Already live before the approval rollout'
  WHERE status = 'live';
INSERT INTO public.audit_log (store_id,actor_type,action,entity_type,entity_id,metadata)
SELECT store_id,'system','store.approved','store',store_id,
  '{"approved_by":"migration-0011","reason":"already_live"}'::jsonb
FROM public.stores WHERE status = 'live' AND approved_by = 'migration-0011';

CREATE TABLE public.store_gstin_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(store_id),
  gstin text NOT NULL,
  state text NOT NULL CHECK (state IN ('verified','unverified','blocked')),
  normalized jsonb,
  raw_response jsonb,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verified_gstin_record CHECK (state <> 'verified' OR
    (normalized IS NOT NULL AND raw_response IS NOT NULL AND verified_at IS NOT NULL
      AND normalized->>'gstin' = gstin AND normalized->>'status' = 'Active'
      AND normalized->>'taxpayer_type' = 'Regular'))
);
CREATE INDEX store_gstin_verified_idx ON public.store_gstin_verifications
  (store_id,gstin,created_at DESC);
ALTER TABLE public.store_gstin_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_gstin_verifications FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.store_gstin_verifications FROM PUBLIC,lebrands_app;
GRANT SELECT,INSERT ON TABLE public.store_gstin_verifications TO lebrands_app;
CREATE POLICY gstin_select ON public.store_gstin_verifications FOR SELECT TO lebrands_app
  USING (store_id = NULLIF(current_setting('app.store_id',true),'')::uuid);
CREATE POLICY gstin_insert ON public.store_gstin_verifications FOR INSERT TO lebrands_app
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id',true),'')::uuid);
ALTER TABLE public.store_gstin_verifications OWNER TO postgres;

-- The APP role already has UPDATE on stores for brand-owned fields. A trigger
-- protects approval metadata, so no brand role or Worker endpoint can set or
-- clear approval fields even if a caller bypasses the Worker allowlist.
CREATE FUNCTION public.guard_store_approval() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog,public AS $$
BEGIN
  IF current_user <> 'postgres' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.approved_at IS NOT NULL OR NEW.approved_by IS NOT NULL
        OR NEW.approval_note IS NOT NULL OR NEW.approval_revoked_at IS NOT NULL
        OR NEW.approval_revocation_note IS NOT NULL THEN
        RAISE EXCEPTION 'Only platform reviewers can change approval'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSE
      IF NEW.approved_at IS DISTINCT FROM OLD.approved_at
        OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
        OR NEW.approval_note IS DISTINCT FROM OLD.approval_note
        OR NEW.approval_revoked_at IS DISTINCT FROM OLD.approval_revoked_at
        OR NEW.approval_revocation_note IS DISTINCT FROM OLD.approval_revocation_note THEN
        RAISE EXCEPTION 'Only platform reviewers can change approval'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  END IF;
  IF NEW.status = 'live' AND (NEW.approved_at IS NULL OR NEW.approval_revoked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Store requires platform approval before going live'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION public.guard_store_approval() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_store_approval() FROM PUBLIC,lebrands_app;
CREATE TRIGGER guard_store_approval BEFORE INSERT OR UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.guard_store_approval();
DO $$
DECLARE role_name text;
BEGIN
  FOR role_name IN SELECT rolname FROM pg_catalog.pg_roles
    WHERE rolname IN ('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.store_gstin_verifications FROM %I', role_name);
    EXECUTE format('REVOKE ALL ON FUNCTION public.guard_store_approval() FROM %I', role_name);
  END LOOP;
END $$;

-- Even a direct APP call to the invoice authority cannot issue an invoice
-- for a manually reviewed or stale/unverified registration after rollout.
-- Existing invoice records, snapshots, and cancellations are untouched.
CREATE OR REPLACE FUNCTION public.invoice_supplier(p_store_id uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog,public AS $$
DECLARE v_settings jsonb; v_supplier jsonb; v_signature text; v_status text;
BEGIN
  SELECT st.settings INTO v_settings FROM public.store_setup st WHERE st.store_id = p_store_id;
  SELECT s.status INTO v_status FROM public.stores s WHERE s.store_id = p_store_id;
  IF v_status IS DISTINCT FROM 'live' OR NOT EXISTS (
    SELECT 1 FROM (
      SELECT * FROM public.store_gstin_verifications
      WHERE store_id = p_store_id ORDER BY created_at DESC,id DESC LIMIT 1
    ) v
    WHERE v.gstin = v_settings->>'gstin'
      AND v.state = 'verified' AND v.verified_at >= now() - interval '30 days'
      AND v.normalized->>'status' = 'Active' AND v.normalized->>'taxpayer_type' = 'Regular'
      AND v.normalized->'principal_address'->>'state_code' = v_settings->>'business_state'
      AND v_settings->>'business_state' = left(v.gstin,2)
      AND v_settings->>'legal_name' = v.normalized->>'legal_name'
      AND (
        (v_settings->>'business_line1' = v.normalized->'principal_address'->>'line1'
          AND v_settings->>'business_city' = v.normalized->'principal_address'->>'city'
          AND v_settings->>'business_pincode' = v.normalized->'principal_address'->>'pin')
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(v.normalized->'additional_addresses','[]'::jsonb)) a(value)
          WHERE v_settings->>'business_line1' = a.value->>'line1'
            AND v_settings->>'business_city' = a.value->>'city'
            AND v_settings->>'business_pincode' = a.value->>'pin'
            AND v_settings->>'business_state' = a.value->>'state_code'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Verify the active Regular GSTIN and registered supplier details in Settings before shipping'
      USING ERRCODE = 'check_violation';
  END IF;
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
