export function migrationSelection(args) {
  const values = args.filter(value => value !== "--");
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
  throw new Error("Use no arguments for regular migrations, --staged-gstin, --staged-aura, --staged-ai, --staged-email, --staged-starters, --staged-ann, --staged-launch, --staged-commerce, --staged-catalogue or --staged-catalogue-masters.");
}
