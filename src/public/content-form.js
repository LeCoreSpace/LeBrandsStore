// Pure helpers for merchant content forms. Rich text is stored as a small HTML subset;
// merchants edit it as plain paragraphs with "- " list lines.
const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const escapeText = (v) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
export function richToText(html) {
  return String(html ?? "")
    .replace(/<li[^>]*>/gi, "\n- ").replace(/<\/(p|ul|ol|div)>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "").replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENT[m])
    .replace(/\n{3,}/g, "\n\n").trim();
}
export function textToRich(text) {
  const blocks = String(text ?? "").replace(/\r/g, "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.every((l) => /^-\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${escapeText(l.replace(/^-\s+/, ""))}</li>`).join("")}</ul>`;
    return `<p>${lines.map(escapeText).join("<br>")}</p>`;
  }).join("");
}
/** Keep rows with at least one filled field, trimmed. Rows missing a required key are reported. */
export function cleanRows(rows, keys, required) {
  const out = [], errors = [];
  rows.forEach((row, i) => {
    const r = Object.fromEntries(keys.map((k) => [k, String(row[k] ?? "").trim()]));
    if (!keys.some((k) => r[k])) return;
    const missing = required.find((k) => !r[k]);
    if (missing) errors.push(`Row ${i + 1}: ${missing} is required.`);
    else out.push(r);
  });
  return { rows: out, errors };
}
export const slugify = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
