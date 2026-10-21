import { escapeHtml } from "./layout.js";
import { documentPage } from "./dashboard.js";
import {renderMediaSizeGuide} from "./media-size-guide.js";

const esc = escapeHtml;
const list = v => Array.isArray(v) ? v : [];
const safeJson = v => JSON.stringify(v ?? {}).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const head = '<link rel="stylesheet" href="/assets/media-library.css"><link rel="stylesheet" href="/assets/media-size-guide.css"><script type="module" src="/assets/media-library.js"></script>';
const safeUrl = v => { try { const s = String(v || ""); const u = new URL(s, "https://app.lebrands.store"); return u.protocol === "https:" || (s.startsWith("/") && !s.startsWith("//")) ? s : ""; } catch { return ""; } };
const bytes = n => { n = Number(n); if (!Number.isFinite(n) || n < 0) return "Not recorded"; if (n < 1024) return `${n} B`; if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`; if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`; return `${(n / 1073741824).toFixed(2)} GB`; };
const dims = i => i.width > 0 && i.height > 0 ? `${i.width} x ${i.height} px` : "Not recorded";
const when = v => { const d = new Date(v); return Number.isNaN(d.getTime()) ? "Not recorded" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }); };
const TYPES = [["all", "All media"], ["image", "Images"], ["video", "Videos"], ["logo", "Logos"]];

function tile(i, n) {
  const url = safeUrl(i.url), video = i.kind === "video";
  const thumb = !url ? `<span class="lml-nothumb">No preview</span>` : video ? `<video src="${esc(url)}" preload="metadata" muted playsinline tabindex="-1" aria-hidden="true"></video>` : `<img src="${esc(url)}" alt="" loading="lazy">`;
  return `<li><button type="button" class="lml-tile" data-open="${n}" aria-haspopup="dialog"><span class="lml-thumb">${thumb}${video ? '<span class="lml-badge">Video</span>' : ""}</span><span class="lml-cap"><strong>${esc(i.filename || "Untitled file")}</strong><small>${esc(dims(i))} / ${esc(bytes(i.size_bytes))}</small></span></button></li>`;
}

export function renderMediaLibrary(data = {}, user, options={}) {
  const store = data.store || {}, sid = String(store.store_id || "");
  const base = options.base || `/stores/${encodeURIComponent(sid)}/media-library`;
  const items = list(data.items);
  const q = String(data.query || ""), type = TYPES.some(t => t[0] === data.type) ? data.type : "all";
  const offset = Math.max(0, Number.parseInt(data.offset, 10) || 0), limit = Number.parseInt(data.limit, 10) || 36;
  const total = Math.max(0, Number(data.total) || 0);
  const qs = o => { const p = new URLSearchParams(); if (q) p.set("q", q); if (type !== "all") p.set("type", type); if (o > 0) p.set("offset", String(o)); const s = p.toString(); return base + (s ? "?" + s : ""); };
  const st = data.storage;
  const storage = st && Number.isFinite(Number(st.used)) ? `<p class="lml-storage">Storage used: ${esc(bytes(st.used))}${st.limit != null && Number(st.limit) > 0 ? ` of ${esc(bytes(st.limit))}` : ""}</p>` : "";
  const filtered = q || type !== "all";
  const grid = items.length ? `<ul class="lml-grid">${items.map(tile).join("")}</ul>` : `<section class="lb-empty"><span class="lb-empty-mark" aria-hidden="true"></span><h2>${filtered ? "No media matches your search" : "No media in your library yet"}</h2><p>${filtered ? "Try a different word or choose All media." : "Images and videos saved to your store will appear here."}</p>${filtered ? `<a class="lb-button lb-button-outline" href="${base}">Clear filters</a>` : ""}</section>`;
  const pager = offset > 0 || data.has_more === true ? `<nav class="lml-pager" aria-label="Media pages"><span>Showing ${items.length ? offset + 1 : 0} to ${offset + items.length} of ${total}</span><span class="lml-pager-links">${offset > 0 ? `<a class="lb-button lb-button-outline lb-button-small" rel="prev" href="${esc(qs(Math.max(0, offset - limit)))}">Previous</a>` : ""}${data.has_more === true ? `<a class="lb-button lb-button-outline lb-button-small" rel="next" href="${esc(qs(offset + limit))}">Next</a>` : ""}</span></nav>` : "";
  const tabs = [["library", "Your media"], ["sizes", "Image size guide"], ["ai", "AI Image Generation"]];
  const library = `<form class="lml-filter" method="get" action="${base}" role="search"><label class="lml-search"><span>Search media</span><input type="search" name="q" value="${esc(q)}" maxlength="100" placeholder="File name or description"></label><label><span>Type</span><select name="type">${TYPES.map(([v, l]) => `<option value="${v}"${v === type ? " selected" : ""}>${l}</option>`).join("")}</select></label><button class="lb-button lb-button-small" type="submit">Search</button>${filtered ? `<a class="lb-reset" href="${base}">Reset</a>` : ""}</form>
    <p class="lml-count" role="status">${total.toLocaleString("en-IN")} ${total === 1 ? "file" : "files"}${filtered ? " found" : ""}. Read only.</p>${storage}${grid}${pager}`;
  const sizes = data.size_guide
    ?renderMediaSizeGuide(data.size_guide,{base,theme:data.guide_theme,category:data.guide_category})
    :'<section class="lml-info"><h2>Image size guide</h2><p>Size guidance could not be loaded. Refresh to try again.</p></section>';
  const ai = `<section class="lml-info"><h2>AI Image Generation</h2><span class="lml-stage">Planned, not available yet</span><p>Image generation is not connected. Nothing on this page creates, sends or charges for images.</p><p>The planned flow:</p><ol class="lml-steps"><li>Pick a placement. It sets the dimensions and aspect ratio.</li><li>Optionally choose a reference image from your media library.</li><li>Describe the image you want.</li><li>Generate, then review the result.</li><li>Accept it or regenerate.</li><li>Save the accepted image to your library.</li></ol><p>There is no cropping step, because the placement sets the shape up front.</p></section>`;
  const panels = { library, sizes, ai };
  const selectedTab=tabs.some(([key])=>key===data.tab)?data.tab:"library";
  const refreshUrl=selectedTab==="library"?qs(offset):`${base}?${new URLSearchParams({
    tab:selectedTab,guide_theme:data.guide_theme||"current",guide_category:data.guide_category||"all"})}`;
  const boot = { items: items.map(i => ({ id: i.id, url: safeUrl(i.url), filename: i.filename, kind: i.kind, upload_type: i.upload_type, content_type: i.content_type, size: bytes(i.size_bytes), dims: dims(i), alt: i.alt_text || "", created: when(i.created_at), usage: list(i.usage).map(u => ({ label: u.label, href: safeUrl(u.href) })) })) };
  const body = `<div class="lml" data-ml-root><div class="lb-page-heading"><div><h1>Media library</h1><p>Browse the images and videos saved for ${esc(store.name || "your store")}. This view is read only.</p></div><div class="lb-heading-actions"><a class="lb-button lb-button-outline" href="${esc(refreshUrl)}">Refresh</a></div></div>
    <div class="lml-tabs" role="tablist" aria-label="Media library sections">${tabs.map(([k, l]) => `<button type="button" role="tab" id="lml-tab-${k}" aria-controls="lml-panel-${k}" aria-selected="${k === selectedTab}" tabindex="${k === selectedTab ? 0 : -1}" data-tab="${k}">${l}</button>`).join("")}</div>
    ${tabs.map(([k]) => `<div role="tabpanel" id="lml-panel-${k}" aria-labelledby="lml-tab-${k}" tabindex="0" data-panel="${k}"${k !== selectedTab ? " hidden" : ""}>${panels[k]}</div>`).join("")}
    <dialog class="lml-dialog" data-dialog aria-labelledby="lml-dlg-title"><div class="lml-dlg"><header><h2 id="lml-dlg-title" tabindex="-1" data-d-title></h2><button type="button" class="lb-button lb-button-small lb-button-outline" data-close>Close</button></header><div class="lml-preview" data-d-preview></div><dl class="lml-facts" data-d-facts></dl><h3>Where it is used</h3><div data-d-usage></div></div></dialog>
    <script type="application/json" id="media-library-data">${safeJson(boot)}</script></div>`;
  return documentPage("media-library", data, user, body, head);
}
