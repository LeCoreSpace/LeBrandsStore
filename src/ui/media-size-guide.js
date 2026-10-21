import { escapeHtml } from "./layout.js";
const esc = escapeHtml;
const list = v => Array.isArray(v) ? v : [];
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const mb = n => `${(num(n) / 1048576).toFixed(0)} MB`;
const safeHref = h => { const s = String(h || ""); return /^\/[^/\\]/.test(s) ? s : ""; };
const cssRatio = b => /^\d{1,2}:\d{1,2}$/.test(b.ratio) ? b.ratio.replace(":", " / ") : b.ratio === "Flexible" && num(b.width) > 0 && num(b.height) > 0 ? `${num(b.width)} / ${num(b.height)}` : "3 / 2";
const size = b => b && b.height > 0 ? `${num(b.width)} x ${num(b.height)} px` : `${num(b.width)} px wide`;
const SRC = { ann_design: "Saved Ann design", style_preset: "Saved classic theme", aura_default: "Classic default", compare: "Comparison" };

function frame(label, b) {
  const natural = b.ratio === "Natural", flexible = b.ratio === "Flexible";
  return `<figure class="msg-fig"><div class="msg-frame${natural || flexible ? " is-natural" : ""}" style="aspect-ratio:${cssRatio(b)}" role="img" aria-label="${esc(label)} frame, ${esc(b.ratio)}"><span>${esc(b.ratio)}</span></div><figcaption><b>${esc(label)}</b>${esc(size(b))}<br>${natural ? "Natural proportions, no crop" : flexible ? "Flexible ratio, covers the box, centre the subject" : `Ratio ${esc(b.ratio)}, cover crop`}</figcaption></figure>`;
}
function card(i, limits) {
  const links = list(i.locations).map(l => ({ ...l, href: safeHref(l.href) })).filter(l => l.href);
  return `<li class="msg-card" id="msg-${esc(i.id)}"><header><h3>${esc(i.title)}</h3><p>${esc(i.placement)}${i.active ? "" : ' <span class="msg-tag">Optional placement</span>'}</p></header>
  <div class="msg-figs">${frame("Desktop", i.desktop)}${frame("Mobile", i.mobile)}</div>
  <dl class="msg-facts"><div><dt>Formats</dt><dd>${list(i.formats).map(esc).join(", ")}</dd></div><div><dt>Max file</dt><dd>${esc(mb(i.max_bytes))}</dd></div></dl>
  <ul class="msg-notes">${list(i.notes).map(n => `<li>${esc(n)}</li>`).join("")}</ul>
  ${links.length ? `<p class="msg-links">${links.map(l => `<a class="lb-button lb-button-outline lb-button-small" href="${esc(l.href)}">Edit in ${esc(l.label)}</a>`).join("")}</p>` : ""}</li>`;
}

export function renderMediaSizeGuide(guide = {}, { base = "", theme = "current", category = "all" } = {}) {
  const g = guide || {}, t = g.theme || {}, saved = g.saved_theme || {}, lim = g.limits || {};
  const themes = list(g.themes), cats = list(g.categories), items = list(g.items);
  const comparing = t.source === "compare";
  const th = themes.some(x => x.id === theme) ? theme : "current";
  const ct = cats.some(x => x.id === category) ? category : "all";
  const filtered = th !== "current" || ct !== "all";
  const form = `<form class="msg-form" method="get" action="${esc(base)}"><input type="hidden" name="tab" value="sizes">
  <label><span>Compare theme</span><select name="guide_theme"><option value="current"${th === "current" ? " selected" : ""}>Current: ${esc(saved.name || "Saved theme")}</option>${themes.map(x => `<option value="${esc(x.id)}"${x.id === th ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
  <label><span>Section</span><select name="guide_category"><option value="all"${ct === "all" ? " selected" : ""}>All placements</option>${cats.map(x => `<option value="${esc(x.id)}"${x.id === ct ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
  <button class="lb-button lb-button-small" type="submit">Show guide</button>${filtered ? `<a class="lb-reset" href="${esc(base)}?tab=sizes">Reset</a>` : ""}</form>`;
  const grid = items.length ? `<ul class="msg-grid">${items.map(i => card(i, lim)).join("")}</ul>` : `<section class="lb-empty"><h2>No placements in this section</h2><p>Choose All placements to see every size.</p></section>`;
  return `<section class="msg" aria-labelledby="msg-h"><h2 id="msg-h">Image size guide</h2>
  <p class="msg-lead">Recommended export sizes for each place images appear. These are recommendations, not requirements: any shape within the limits uploads fine, and themes crop to fit.</p>
  <p class="msg-banner${comparing ? " is-compare" : ""}" role="status"><strong>${comparing ? `Comparing ${esc(t.name)}` : `Your saved theme: ${esc(t.name)}`}</strong> ${esc(SRC[t.source] || "")}. ${esc(g.notice || "")}${comparing ? ` Your store stays on ${esc(saved.name || "its saved theme")}.` : ""}</p>
  ${form}<p class="msg-count">${num(g.total)} ${num(g.total) === 1 ? "placement" : "placements"}</p>${grid}
  <section class="msg-limits"><h3>Upload limits</h3><ul><li>Images: PNG, JPEG or WebP, up to ${esc(mb(lim.image_bytes))}.</li><li>Logos: up to ${esc(mb(lim.logo_bytes))}, and sanitized SVG is accepted for logos only.</li><li>Videos: MP4 or WebM, up to ${esc(mb(lim.video_bytes))}.</li><li>Up to ${num(lim.max_axis).toLocaleString("en-IN")} px on a side and ${(num(lim.max_pixels) / 1e6).toFixed(0)} megapixels.</li><li>Upload larger than the recommendation for sharp screens, but keep files light for faster pages.</li></ul></section></section>`;
}
