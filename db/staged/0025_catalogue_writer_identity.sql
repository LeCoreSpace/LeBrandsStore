-- Preserve the original writer's function OID for long-lived prepared callers.
-- Both entry points enforce private-value ownership; no unguarded legacy API.
CREATE FUNCTION public.catalogue_assert_private_selection(p_store uuid,p_selection jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF jsonb_typeof(p_selection->'options')='array' AND EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_selection->'options') a
    CROSS JOIN LATERAL jsonb_array_elements_text(a->'value_ids') requested(id)
    JOIN public.catalogue_variant_option_values v ON v.id=requested.id::bigint
    WHERE v.store_id IS NOT NULL AND(v.store_id IS DISTINCT FROM p_store
      OR v.product_type_id IS DISTINCT FROM(p_selection->>'product_type_id')::bigint))
  THEN RAISE EXCEPTION 'Variant value isolation denied' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.catalogue_assert_private_selection(uuid,jsonb) FROM PUBLIC,lebrands_app,anon,authenticated,service_role;

ALTER FUNCTION public.catalogue_write_product(uuid,uuid,text,integer,jsonb,text) RENAME TO catalogue_write_product_guarded_compat;
ALTER FUNCTION public.catalogue_write_product_v1(uuid,uuid,text,integer,jsonb,text) RENAME TO catalogue_write_product;
DO $migration$
DECLARE definition text; marker text:=E'\nBEGIN\n';
BEGIN
  definition:=pg_get_functiondef('public.catalogue_write_product(uuid,uuid,text,integer,jsonb,text)'::regprocedure);
  IF array_length(string_to_array(definition,marker),1)<>2 OR position('Product isolation denied' IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected original writer definition; do not replace it blindly';
  END IF;
  definition:=replace(definition,marker,marker||
    E' PERFORM public.catalogue_assert_writer(p_store,p_token);\n PERFORM public.catalogue_assert_private_selection(p_store,p_selection);\n');
  EXECUTE definition;
END $migration$;
REVOKE ALL ON FUNCTION public.catalogue_write_product(uuid,uuid,text,integer,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.catalogue_write_product(uuid,uuid,text,integer,jsonb,text) TO lebrands_app;

CREATE OR REPLACE FUNCTION public.catalogue_write_product_guarded_compat(p_store uuid,p_product uuid,p_token text,p_revision integer,p_selection jsonb,p_action text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  RETURN public.catalogue_write_product(p_store,p_product,p_token,p_revision,p_selection,p_action);
END $$;
REVOKE ALL ON FUNCTION public.catalogue_write_product_guarded_compat(uuid,uuid,text,integer,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.catalogue_write_product_guarded_compat(uuid,uuid,text,integer,jsonb,text) TO lebrands_app;
