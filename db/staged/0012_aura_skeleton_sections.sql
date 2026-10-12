-- STAGED ONLY. No backfill, data writes, table changes or publish action.
-- Move into migrations only after release review. Requires 0010, not 0011.
-- db/migrate.js expands the immutable catalogue snapshot before execution.
CREATE OR REPLACE FUNCTION public.aura_section_schemas() RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT $schemas$__AURA_SKELETON_SCHEMAS_V1__$schemas$::jsonb
$$;
-- CREATE OR REPLACE preserves the existing owner and EXECUTE ACL.
-- Only adds section definitions: legacy definitions remain identical.
CREATE FUNCTION public.aura_skeleton_available() RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT true
$$;
REVOKE ALL ON FUNCTION public.aura_skeleton_available() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aura_skeleton_available() TO lebrands_app;

-- Preserve 0010's tenant/session checks, revision locks and history triggers.
-- Only replace its blanket checkout refusal with a restricted-section check.
-- CREATE OR REPLACE preserves the existing owner and EXECUTE ACL.
CREATE OR REPLACE FUNCTION public.save_store_page(p_store uuid,p_page text,p_layout jsonb,p_expected integer,p_token text)
RETURNS public.store_pages LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid; row public.store_pages;
BEGIN
  IF p_store IS NULL OR p_store IS DISTINCT FROM NULLIF(current_setting('app.store_id',true),'')::uuid THEN
    RAISE EXCEPTION 'Store access denied' USING ERRCODE='42501';
  END IF;
  IF p_expected IS NULL OR p_expected<0 THEN RAISE EXCEPTION 'Invalid page revision' USING ERRCODE='22023'; END IF;
  actor:=public.store_page_actor(p_store,p_token);
  PERFORM 1 FROM public.stores WHERE store_id=p_store FOR UPDATE;
  PERFORM public.aura_validate_layout(p_store,p_page,p_layout);
  IF p_page='checkout' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_layout) section
    WHERE section->>'type' NOT IN ('header','commerce','trust','footer')
  ) THEN RAISE EXCEPTION 'Checkout supports only protected commerce and reassurance sections' USING ERRCODE='42501'; END IF;
  SELECT * INTO row FROM public.store_pages WHERE store_id=p_store AND page_key=p_page FOR UPDATE;
  IF FOUND THEN
    IF row.version<>p_expected THEN RAISE EXCEPTION 'Page changed in another tab. Reload before saving.' USING ERRCODE='40001'; END IF;
    UPDATE public.store_pages SET draft_layout=p_layout,version=version+1,updated_by=actor WHERE store_id=p_store AND page_key=p_page RETURNING * INTO row;
  ELSE
    IF p_expected<>0 THEN RAISE EXCEPTION 'Page revision is invalid' USING ERRCODE='40001'; END IF;
    INSERT INTO public.store_pages(store_id,page_key,draft_layout,version,updated_by) VALUES(p_store,p_page,p_layout,1,actor) RETURNING * INTO row;
  END IF;
  RETURN row;
END $$;
