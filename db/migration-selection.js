export function migrationSelection(args) {
  const values = args.filter(value => value !== "--");
  if (!values.length) return { staged: false };
  if (values.length === 1 && values[0] === "--staged-aura") {
    return { staged: true, filename: "0012_aura_skeleton_sections.sql" };
  }
  throw new Error("Use no arguments for regular migrations, or --staged-aura for the reviewed Aura catalogue only.");
}
