import { validateClassification } from "../public/catalogue-classification-model.js";
import { badInput } from "./input.js";
const parse = v => typeof v === "string" ? JSON.parse(v) : v;
export async function catalogueApiEnabled(tx) {
  const [row] = await tx`SELECT to_regprocedure('public.catalogue_write_product(uuid,uuid,text,integer,jsonb,text)') IS NOT NULL AS enabled`;
  return row?.enabled === true;
}
export async function catalogueReference(tx, subcategoryId, typeId) {
  if (!await catalogueApiEnabled(tx)) return { enabled: false, product_types: [], product_type: null, options: [], descriptors: [] };
  const [capability]=await tx`SELECT to_regprocedure('public.catalogue_add_variant_value(uuid,text,bigint,bigint,text)') IS NOT NULL AS enabled`;
  const types = subcategoryId ? await tx`SELECT t.id,t.type_key,t.name FROM public.catalogue_product_types t
    JOIN public.catalogue_subcategory_product_types m ON m.product_type_id=t.id
    JOIN public.catalogue_subcategories s ON s.subcategory_id=m.subcategory_id
    JOIN public.catalogue_categories c ON c.category_id=s.category_id
    WHERE m.subcategory_id=${subcategoryId} AND t.is_active AND m.is_active AND s.is_active AND c.is_active
      AND t.review_status='approved' AND m.review_status='approved' ORDER BY t.name,t.id` : [];
  const selected = types.find(t => Number(t.id) === typeId);
  const options = selected ? await tx`SELECT o.id,o.name,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'value',v.label) ORDER BY a.sort_order,v.sort_order,v.id)
      FROM public.catalogue_product_type_option_values a
      JOIN public.catalogue_variant_option_values v ON v.option_id=a.option_id AND v.id=a.value_id
      WHERE a.product_type_id=${typeId} AND a.option_id=o.id AND a.is_active AND v.is_active
        AND a.review_status='approved' AND v.review_status='approved'),'[]'::jsonb)::text AS values_json
    FROM public.catalogue_product_type_options m JOIN public.catalogue_variant_options o ON o.id=m.option_id
    WHERE m.product_type_id=${typeId} AND m.is_active AND o.is_active
      AND m.review_status='approved' AND o.review_status='approved' ORDER BY m.sort_order,o.id` : [];
  const descriptors = selected ? await tx`SELECT d.id,d.name,d.input_type,d.unit,m.is_required,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'value',v.label) ORDER BY v.sort_order,v.id)
      FROM public.catalogue_descriptor_values v WHERE v.descriptor_id=d.id AND v.is_active
        AND v.review_status='approved'),'[]'::jsonb)::text AS values_json
    FROM public.catalogue_product_type_descriptors m JOIN public.catalogue_descriptors d ON d.id=m.descriptor_id
    WHERE m.product_type_id=${typeId} AND m.is_active AND d.is_active
      AND m.review_status='approved' AND d.review_status='approved' ORDER BY m.sort_order,d.id` : [];
  const fields = rows => rows.map(({ values_json, ...r }) => ({ ...r, id: Number(r.id), values: parse(values_json).map(v => ({ ...v, id: Number(v.id) })) }));
  return { enabled: true, custom_values_enabled:capability?.enabled===true, product_types: types.map(t => ({ ...t, id: Number(t.id) })),
    product_type: selected ? { ...selected, id: Number(selected.id) } : null, options: fields(options), descriptors: fields(descriptors) };
}
export async function loadClassifications(tx, storeId) {
  if (!await catalogueApiEnabled(tx)) return new Map();
  const rows = await tx`SELECT p.id,p.catalogue_revision,public.catalogue_product_selection(${storeId},p.id)::text AS selection_json,
    jsonb_build_object('product_type_name',COALESCE(t.name,'Saved product type'),
      'options',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.option_id,
        'name',COALESCE(p.catalogue->'axes'->(a.position-1)->>'name',o.name,'Saved option'),
        'values',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.value_id,
          'value',COALESCE(p.catalogue->'axes'->(a.position-1)->'values'->>v.sort_order,'Saved value'))
          ORDER BY v.sort_order,v.value_id) FROM public.product_variant_axis_values v
          WHERE v.store_id=p.store_id AND v.product_id=p.id AND v.option_id=a.option_id),'[]'::jsonb))
        ORDER BY a.position) FROM public.product_variant_axes a LEFT JOIN public.catalogue_variant_options o ON o.id=a.option_id
        WHERE a.store_id=p.store_id AND a.product_id=p.id),'[]'::jsonb),
      'descriptors',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',chosen.descriptor_id,
        'name',COALESCE(d.name,'Saved detail'),'input_type',chosen.input_type,'unit',d.unit,'is_required',false,
        'values',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.value_id,'value',COALESCE(master.label,'Saved value')) ORDER BY v.value_id)
          FROM public.product_descriptor_values v LEFT JOIN public.catalogue_descriptor_values master
            ON master.descriptor_id=v.descriptor_id AND master.id=v.value_id
          WHERE v.store_id=p.store_id AND v.product_id=p.id AND v.descriptor_id=chosen.descriptor_id AND v.value_id IS NOT NULL),'[]'::jsonb)))
        FROM (SELECT DISTINCT descriptor_id,input_type FROM public.product_descriptor_values WHERE store_id=p.store_id AND product_id=p.id) chosen
        LEFT JOIN public.catalogue_descriptors d ON d.id=chosen.descriptor_id),'[]'::jsonb))::text AS reference_json
    FROM public.products p LEFT JOIN public.catalogue_product_types t ON t.id=p.product_type_id WHERE p.store_id=${storeId} ORDER BY p.id`;
  return new Map(rows.map(r => [r.id, { classification: parse(r.selection_json), catalogue_revision: r.catalogue_revision,
    classification_reference: parse(r.reference_json) }]));
}
const comparable = selection => {
  if (!selection) return null;
  const { expected_revision, ...rest } = validateClassification(selection);
  return JSON.stringify(rest);
};
export async function resolveClassification(tx, storeId, productId, raw, catalogue) {
  const selection = validateClassification(raw);
  if (!await catalogueApiEnabled(tx)) throw Object.assign(new Error("Apply the catalogue forms API database update before choosing product types."), { status: 409 });
  const [saved] = productId ? await tx`SELECT catalogue_revision,public.catalogue_product_selection(${storeId},${productId})::text AS selection_json,
    catalogue::text AS catalogue_json FROM public.products WHERE store_id=${storeId} AND id=${productId}` : [];
  if (Number(saved?.catalogue_revision || 0) !== selection.expected_revision) throw Object.assign(new Error("Product classification changed in another window. Reload before saving."), { status: 409 });
  const previous = parse(saved?.selection_json || null);
  if (selection.clear) {
    if (catalogue.axes.length) throw badInput("Remove variants and generate the updated combinations before clearing the product type.");
    return { selection, catalogue };
  }
  // A retired definition may remain attached unchanged. Never silently replace it.
  if (previous && comparable(selection) === comparable(previous)) {
    const old = parse(saved.catalogue_json);
    if (JSON.stringify(catalogue.axes) !== JSON.stringify(old.axes || [])) throw badInput("Keep the saved variant options, or choose an approved product type to replace them.");
    return { selection, catalogue: { ...catalogue, category: old.category, subcategory: old.subcategory, axes: old.axes || [] } };
  }
  const refs = await catalogueReference(tx, selection.subcategory_id, selection.product_type_id);
  const [scope] = await tx`SELECT c.name AS category,s.name AS subcategory FROM public.catalogue_subcategories s
    JOIN public.catalogue_categories c ON c.category_id=s.category_id
    WHERE s.subcategory_id=${selection.subcategory_id} AND c.category_id=${selection.category_id} AND s.is_active AND c.is_active`;
  if (!refs.product_type || !scope) throw badInput("Choose an approved product type for this category and subcategory.");
  const axes = selection.options.map(pick => {
    const option = refs.options.find(o => o.id === pick.option_id);
    if (!option || pick.value_ids.some(id => !option.values.some(v => v.id === id))) throw badInput("Choose available variant options and values for this product type.");
    return { name: option.name, values: pick.value_ids.map(id => option.values.find(v => v.id === id).value) };
  });
  for (const pick of selection.descriptors) {
    const def = refs.descriptors.find(d => d.id === pick.descriptor_id);
    if (!def) throw badInput("Choose details applicable to this product type.");
    const key = { single_select: "value_ids", multi_select: "value_ids", text: "text_value", number: "number_value", boolean: "boolean_value" }[def.input_type];
    if (!Object.hasOwn(pick, key) || (def.input_type === "single_select" && pick.value_ids.length !== 1) ||
      (pick.value_ids && pick.value_ids.some(id => !def.values.some(v => v.id === id)))) throw badInput(`Check the values for ${def.name}.`);
  }
  if (refs.descriptors.some(d => d.is_required && !selection.descriptors.some(p => p.descriptor_id === d.id))) throw badInput("Complete every required product detail.");
  if (JSON.stringify(axes) !== JSON.stringify(catalogue.axes)) throw badInput("Generate combinations matching the selected catalogue options.");
  return { selection, catalogue: { ...catalogue, ...scope, axes } };
}
export async function writeClassification(tx, storeId, productId, tokenHash, selection, action) {
  try {
    const [row] = await tx`SELECT public.catalogue_write_product(${storeId},${productId},${tokenHash || ""},${selection.expected_revision},
      ${JSON.stringify(selection)}::text::jsonb,${action}) AS revision`;
    return row?.revision;
  } catch (error) {
    if (error.code === "40001") throw Object.assign(new Error("Product classification changed in another window. Reload before saving."), { status: 409 });
    if (error.code === "22023" || error.code === "23514") throw badInput("Check the product type, variants and required details.");
    throw error;
  }
}
