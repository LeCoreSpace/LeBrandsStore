export function migrationSelection(args) {
  const values = args.filter(value => value !== "--");
  if(values.length===1&&values[0]==="--staged-checkout-email-auth"){
    return{staged:true,filename:"0045_checkout_email_auth.sql",requires:"0018_commerce_runtime.sql"};
  }
  if(values.length===1&&values[0]==="--staged-store-offers"){
    return{staged:true,filename:"0044_store_offers.sql",requires:"0029_sku_checkout.sql"};
  }
  if(values.length===1&&values[0]==="--staged-email-preferences"){
    return{staged:true,filename:"0043_email_preferences.sql",requires:"0014_transactional_email.sql"};
  }
  if(values.length===1&&values[0]==="--staged-commerce-analytics"){
    return{staged:true,filename:"0042_commerce_analytics.sql",requires:"0041_catalogue_cogs.sql"};
  }
  if(values.length===1&&values[0]==="--staged-catalogue-cogs"){
    return {staged:true,filename:"0041_catalogue_cogs.sql",requires:"0021_catalogue_forms_api.sql"};
  }
  if(values.length===1&&values[0]==="--staged-billing-test-checkout"){
    return {staged:true,filename:"0040_billing_test_checkout.sql",requires:"0039_ann_plan_selection.sql"};
  }
  if(values.length===1&&values[0]==="--staged-ann-plan-selection"){
    return {staged:true,filename:"0039_ann_plan_selection.sql",requires:"0038_free_subscriptions.sql"};
  }
  if(values.length===1&&values[0]==="--staged-free-subscriptions"){
    return {staged:true,filename:"0038_free_subscriptions.sql",requires:"0037_platform_billing.sql"};
  }
  if(values.length===1&&values[0]==="--staged-platform-billing"){
    return {staged:true,filename:"0037_platform_billing.sql",requires:"0035_business_document_review.sql"};
  }
  if(values.length===1&&values[0]==="--staged-legacy-user-country"){
    return {staged:true,filename:"0036_legacy_user_country.sql",requires:"0030_registration_contact.sql"};
  }
  if(values.length===1&&values[0]==="--staged-business-document-review"){
    return {staged:true,filename:"0035_business_document_review.sql",requires:"0034_business_document_scanning.sql"};
  }
  if(values.length===1&&values[0]==="--staged-business-document-scanning"){
    return {staged:true,filename:"0034_business_document_scanning.sql",requires:"0033_business_document_retention.sql"};
  }
  if(values.length===1&&values[0]==="--staged-business-document-retention"){
    return {staged:true,filename:"0033_business_document_retention.sql",requires:"0031_business_documents.sql"};
  }
  if(values.length===1&&values[0]==="--staged-registration-contact"){
    return {staged:true,filename:"0030_registration_contact.sql",requires:"0004_password_pepper.sql"};
  }
  if(values.length===1&&values[0]==="--staged-business-documents"){
    return {staged:true,filename:"0031_business_documents.sql",requires:"0030_registration_contact.sql"};
  }
  if(values.length===1&&values[0]==="--staged-business-editor-access"){
    return {staged:true,filename:"0032_business_editor_access.sql",requires:"0031_business_documents.sql"};
  }
  if(values.length===1&&values[0]==="--staged-sku-checkout"){
    return {staged:true,filename:"0029_sku_checkout.sql",requires:"0028_d2c_descriptor_coverage.sql"};
  }
  if(values.length===1&&values[0]==="--staged-d2c-descriptors"){
    return {staged:true,filename:"0028_d2c_descriptor_coverage.sql",requires:"0027_d2c_food_profile_corrections.sql"};
  }
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
  throw new Error("Use no arguments for regular migrations, --staged-ann-plan-selection, --staged-free-subscriptions, --staged-platform-billing, --staged-business-document-review, --staged-registration-contact, --staged-business-documents, --staged-business-editor-access, --staged-business-document-retention, --staged-business-document-scanning, --staged-gstin, --staged-aura, --staged-ai, --staged-email, --staged-starters, --staged-ann, --staged-launch, --staged-commerce, --staged-catalogue, --staged-catalogue-masters, --staged-catalogue-api, --staged-catalogue-references, --staged-d2c-variants, --staged-store-variant-values, --staged-catalogue-writer-identity, --staged-d2c-memberships, --staged-d2c-food-profiles or --staged-d2c-descriptors.");
}
