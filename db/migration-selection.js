export function migrationSelection(args) {
  const values = args.filter(value => value !== "--");
  if(values.length===1&&values[0]==="--staged-d2c-food-profiles"){
    return {staged:true,filename:"0027_d2c_food_profile_corrections.sql",requires:"0026_d2c_type_memberships.sql"};
  }
  if(values.length===1&&values[0]==="--staged-d2c-memberships"){
    return {staged:true,filename:"0026_d2c_type_memberships.sql",requires:"0025_catalogue_writer_identity.sql"};
  }
  if(values.length===1&&values[0]==="--staged-catalogue-writer-identity"){
    return {staged:true,filename:"0025_catalogue_writer_identity.sql",requires:"0024_store_variant_values.sql"};
  }
  if(values.length===1&&values[0]==="--staged-d2c-variants"){
    return {staged:true,filename:"0023_d2c_variant_profiles.sql",requires:"0022_catalogue_reviewed_references.sql"};
  }
  if(values.length===1&&values[0]==="--staged-store-variant-values"){
    return {staged:true,filename:"0024_store_variant_values.sql",requires:"0023_d2c_variant_profiles.sql"};
  }
  if(values.length===1&&values[0]==="--staged-catalogue-references"){
    return {staged:true,filename:"0022_catalogue_reviewed_references.sql",requires:"0021_catalogue_forms_api.sql"};
  }
  if(values.length===1&&values[0]==="--staged-catalogue-api"){
    return {staged:true,filename:"0021_catalogue_forms_api.sql",requires:"0020_catalogue_masters.sql"};
  }
  if (values.length === 1 && values[0] === "--staged-catalogue-masters") {
    return { staged: true, filename: "0020_catalogue_masters.sql", requires: "0019_catalogue_forms.sql" };
  }
  if(values.length===1&&values[0]==="--staged-catalogue"){
    return {staged:true,filename:"0019_catalogue_forms.sql",requires:"0018_commerce_runtime.sql"};
  }
  if (values.length === 1 && values[0] === "--staged-gstin") {
    return { staged: true, filename: "0011_gstin_approval.sql", requires: "0009_required_gstin.sql" };
  }
  if (values.length === 1 && values[0] === "--staged-commerce") {
    return { staged: true, filename: "0018_commerce_runtime.sql", requires: "0017_ann_launch_setup.sql" };
  }
  if (values.length === 1 && values[0] === "--staged-launch") {
    return { staged: true, filename: "0017_ann_launch_setup.sql", requires: "0016_ann_foundation.sql" };
  }
  if (values.length === 1 && values[0] === "--staged-ann") {
    return { staged: true, filename: "0016_ann_foundation.sql", requires: "0015_aura_starter_library.sql" };
  }
  if (!values.length) return { staged: false };
  if (values.length === 1 && values[0] === "--staged-aura") {
    return { staged: true, filename: "0012_aura_skeleton_sections.sql" };
  }
  if (values.length === 1 && values[0] === "--staged-ai") {
    return { staged: true, filename: "0013_ai_builder.sql", requires: "0012_aura_skeleton_sections.sql" };
  }
  if (values.length === 1 && values[0] === "--staged-email") {
    return { staged: true, filename: "0014_transactional_email.sql", requires: "0013_ai_builder.sql" };
  }
  if (values.length === 1 && values[0] === "--staged-starters") {
    return { staged: true, filename: "0015_aura_starter_library.sql", requires: "0012_aura_skeleton_sections.sql" };
  }
  throw new Error("Use no arguments for regular migrations, --staged-gstin, --staged-aura, --staged-ai, --staged-email, --staged-starters, --staged-ann, --staged-launch, --staged-commerce, --staged-catalogue, --staged-catalogue-masters, --staged-catalogue-api, --staged-catalogue-references, --staged-d2c-variants, --staged-store-variant-values, --staged-catalogue-writer-identity, --staged-d2c-memberships or --staged-d2c-food-profiles.");
}
