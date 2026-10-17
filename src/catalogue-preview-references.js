// Isolated PGlite fixtures only. Never imported by the production Worker.
export async function seedCataloguePreviewReferences(pg) {
  const type = (await pg.query("UPDATE catalogue_product_types SET review_status='approved',is_active=true WHERE type_key='dress' RETURNING id")).rows[0].id;
  await pg.query("INSERT INTO catalogue_subcategory_product_types(subcategory_id,product_type_id,review_status,is_active) VALUES(2,$1,'approved',true)", [type]);
  const options = [];
  for (const [key, name, labels] of [["size", "Size", ["S", "M"]], ["colour", "Colour", ["Burgundy", "Ivory"]]]) {
    const option = (await pg.query("INSERT INTO catalogue_variant_options(option_key,name,review_status,is_active) VALUES($1,$2,'approved',true) RETURNING id", [key, name])).rows[0].id;
    await pg.query("INSERT INTO catalogue_product_type_options(product_type_id,option_id,review_status,is_active) VALUES($1,$2,'approved',true)", [type, option]);
    const values = [];
    for (const [sort, label] of labels.entries()) {
      const value = (await pg.query("INSERT INTO catalogue_variant_option_values(option_id,value_key,label,sort_order,review_status,is_active) VALUES($1,$2,$3,$4,'approved',true) RETURNING id", [option, label.toLowerCase(), label, sort])).rows[0].id;
      await pg.query("INSERT INTO catalogue_product_type_option_values(product_type_id,option_id,value_id,sort_order,review_status,is_active) VALUES($1,$2,$3,$4,'approved',true)", [type, option, value, sort]);
      values.push({ id: Number(value), value: label });
    }
    options.push({ id: Number(option), name, values });
  }
  const descriptors = [];
  for (const [key, name, kind, required, labels, unit] of [
    ["fit", "Fit", "single_select", true, ["Regular", "Relaxed"], null],
    ["material", "Material", "multi_select", false, ["Cotton", "Silk"], null],
    ["care", "Care instructions", "text", false, [], null],
    ["weight", "Weight", "number", false, [], "g"],
    ["lined", "Lined", "boolean", false, [], null],
  ]) {
    const id = (await pg.query("INSERT INTO catalogue_descriptors(descriptor_key,name,input_type,unit,review_status,is_active) VALUES($1,$2,$3,$4,'approved',true) RETURNING id", [key, name, kind, unit])).rows[0].id;
    await pg.query("INSERT INTO catalogue_product_type_descriptors(product_type_id,descriptor_id,is_required,review_status,is_active) VALUES($1,$2,$3,'approved',true)", [type, id, required]);
    const values = [];
    for (const label of labels) {
      const value = (await pg.query("INSERT INTO catalogue_descriptor_values(descriptor_id,value_key,label,review_status,is_active) VALUES($1,$2,$3,'approved',true) RETURNING id", [id, label.toLowerCase(), label])).rows[0].id;
      values.push({ id: Number(value), value: label });
    }
    descriptors.push({ id: Number(id), name, input_type: kind, is_required: required, values });
  }
  return { type: Number(type), options, descriptors };
}
