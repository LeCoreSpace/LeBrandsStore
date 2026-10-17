import { ANN_REFERENCE_VERSION, ANN_STEPS, ANN_PALETTES, ANN_FONTS, ANN_EXTRA_SECTIONS, annPreviewConfiguration } from "../public/ann-config.js";
import { AURA_STYLES } from "../public/aura-styles.js";
import {productSuggestions} from "../public/ann-product-suggestions.js";
const parse = value => typeof value === "string" ? JSON.parse(value) : value;
export async function annReady(tx) {
  const [row] = await tx`SELECT to_regclass('public.ann_builder_sessions') IS NOT NULL
    AND to_regclass('public.ann_reference_attributes') IS NOT NULL
    AND to_regclass('public.ann_reference_values') IS NOT NULL
    AND to_regprocedure('public.ann_save_session(uuid,text,integer,text,jsonb)') IS NOT NULL AS ready`;
  if (!row?.ready) throw Object.assign(new Error("Ann needs its Stage 3 migration before progress can be saved."), { status: 503 });
}
export async function annReference(tx, subcategoryId) {
  // Explicit schema-version bridge while old and new Workers coexist.
  const [schema] = await tx`SELECT
    to_regclass('public.catalogue_categories') IS NOT NULL AS categories_ready,
    to_regclass('public.catalogue_subcategories') IS NOT NULL AS subcategories_ready`;
  if (!!schema?.categories_ready !== !!schema?.subcategories_ready) {
    throw Object.assign(new Error("The catalogue taxonomy migration is incomplete."), { status: 503 });
  }
  const categories = schema?.categories_ready
    ? await tx`SELECT category_id,name,slug FROM public.catalogue_categories WHERE is_active ORDER BY category_id`
    : await tx`SELECT category_id,name,slug FROM public.aura_library_categories WHERE is_active ORDER BY category_id`;
  const subcategories = schema?.subcategories_ready
    ? await tx`SELECT subcategory_id,category_id,name,slug FROM public.catalogue_subcategories WHERE is_active ORDER BY category_id,subcategory_id`
    : await tx`SELECT subcategory_id,category_id,name,slug FROM public.aura_library_subcategories WHERE is_active ORDER BY category_id,subcategory_id`;
  const attributes = subcategoryId ? await tx`SELECT a.id,a.subcategory_id,a.name,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'value',v.value) ORDER BY v.sort_order,v.id)
      FROM public.ann_reference_values v WHERE v.attribute_id=a.id),'[]'::jsonb)::text AS values_json
    FROM public.ann_reference_attributes a WHERE a.subcategory_id=${subcategoryId} ORDER BY a.sort_order,a.id` : [];
  return {
    reference_version: ANN_REFERENCE_VERSION,
    categories: categories.map(c => ({ ...c, category_id: Number(c.category_id) })),
    subcategories: subcategories.map(s => ({ ...s, category_id: Number(s.category_id), subcategory_id: Number(s.subcategory_id) })),
    attributes: attributes.map(({ values_json, ...a }) => ({ ...a, id: Number(a.id), subcategory_id: Number(a.subcategory_id), values: parse(values_json) })),
    product_suggestions:productSuggestions(subcategories.find(s=>Number(s.subcategory_id)===subcategoryId),attributes.map(({values_json,...a})=>({...a,values:parse(values_json)}))),
    styles: AURA_STYLES, palettes: ANN_PALETTES, fonts: ANN_FONTS,
    steps: ANN_STEPS, optional_sections: ANN_EXTRA_SECTIONS,
  };
}
export async function loadAnnSession(tx, storeId) {
  const [row] = await tx`SELECT revision,current_step,reference_version,answers::text AS answers_json,
    created_at::text AS created_at,updated_at::text AS updated_at FROM public.ann_builder_sessions WHERE store_id=${storeId}`;
  if (!row) return null;
  const { answers_json, ...session } = row;
  return { ...session, answers: parse(answers_json) };
}
export async function annSessionResponse(tx, storeId, session, cleared = []) {
  const [setup] = await tx`SELECT settings::text AS settings_json FROM public.store_setup WHERE store_id=${storeId}`;
  return { session, preview: annPreviewConfiguration(session?.answers || {}, setup ? parse(setup.settings_json) : {}), cleared_fields: cleared };
}
