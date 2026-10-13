export function migrationSelection(args) {
  const values = args.filter(value => value !== "--");
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
  throw new Error("Use no arguments for regular migrations, --staged-aura, --staged-ai or --staged-email.");
}
