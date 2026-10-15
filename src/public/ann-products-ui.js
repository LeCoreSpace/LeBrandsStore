import { CURRENT_GST_RATES, LEGACY_GST_RATES } from "./commerce-rules.js";
import { productGSTWarning } from "./validation.js";
import { inrToPaise } from "./ann-money.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MAX_IMG = 8, MAX_BYTES = 10 * 1024 * 1024, TYPES = ["image/jpeg", "image/png", "image/webp"];
const paiseToInr = p => (p === null || p === undefined || !Number.isSafeInteger(Number(p))) ? "" : `${Math.floor(Number(p) / 100)}.${String(Number(p) % 100).padStart(2, "0")}`;
const safeUrl = u => {
  const s = String(u ?? "");
  if (s.startsWith("/") && !s.startsWith("//") && !s.includes("\\")) return s;
  try { const x = new URL(s); return x.protocol === "https:" && x.hostname === "media.lebrands.store" ? x.href : ""; } catch { return ""; }
};
const fromServer = p => ({
  title: p.title ?? "", description: p.description ?? "", price: paiseToInr(p.price_paise), compare: paiseToInr(p.compare_at_paise),
  sku: p.sku ?? "", tags: (p.tags || []).join(", "), hsn: p.hsn_code ?? "", gst: p.gst_rate === null || p.gst_rate === undefined ? "" : String(p.gst_rate),
  images: (p.images || []).map(i => ({ id: i.id, alt: i.alt ?? "" })),
});
const splitTags = s => String(s).split(",").map(t => t.trim()).filter(Boolean);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function attachAnnProducts({ api, readOnly, submit, onDraw }) {
  let latest = null, off = false, uploadingId = "", saveMessages={};
  const server = new Map(), models = new Map(), acks = {}, msgs = {}, files = {}, addSel = {}, choices = new Map();
  const slot = () => document.querySelector("#ann-readiness-slot");
  const dirty = id => { const s = server.get(id), m = models.get(id); return !!s && !!m && Object.keys(fromServer(s)).some(k=>!same(m[k],fromServer(s)[k])); };
  const redraw = () => { try { onDraw?.(); } catch { /* parent redraw must not break edits */ } };
  const locked = () => readOnly || off;

  function receive(data, { reset = false, savedId = null } = {}) {
    latest = data;
    const list = data?.products || [], ids = new Set(list.map(p => p.id));
    for (const m of data?.image_media || []) if (m?.id) choices.set(m.id, { id: m.id, url: m.url, alt: m.alt ?? "" });
    for (const p of list) for (const i of p.images || []) if (i?.id && !choices.has(i.id)) choices.set(i.id, { id: i.id, url: i.url, alt: i.alt ?? "" });
    for (const p of list) {
      const wasDirty = models.has(p.id) && dirty(p.id);
      const previous=server.has(p.id)?fromServer(server.get(p.id)):null, next=fromServer(p), model=models.get(p.id);
      server.set(p.id, p);
      if (reset || p.id === savedId || !models.has(p.id) || !wasDirty) {
        models.set(p.id, fromServer(p)); acks[p.id] = false; msgs[p.id] = "";
        if (reset || p.id === savedId) { delete files[p.id]; delete addSel[p.id]; }
      } else {
        // Preserve only edited fields, not old values of clean sibling fields.
        // This matters when another product changes a shared photo description.
        for(const k of Object.keys(next))if(same(model[k],previous[k]))model[k]=next[k];
        const oldImages=new Map(previous.images.map(i=>[i.id,i])), newImages=new Map(next.images.map(i=>[i.id,i]));
        for(const im of model.images)if(im.alt===oldImages.get(im.id)?.alt&&newImages.has(im.id))im.alt=newImages.get(im.id).alt;
      }
    }
    for (const id of [...models.keys()]) if (!ids.has(id)) { models.delete(id); server.delete(id); delete acks[id]; delete msgs[id]; delete files[id]; }
  }

  function buildPatch(id) {
    const s = server.get(id), m = models.get(id), patch = {};
    const title = m.title.trim(), desc = m.description.trim();
    if (title !== (s.title ?? "")) patch.title = title;
    if (desc !== (s.description ?? "")) patch.description = desc;
    if (m.price !== paiseToInr(s.price_paise)) {
      const v = inrToPaise(m.price);
      if (v !== s.price_paise) patch.price_paise = v;
    }
    const cmp = m.compare.trim();
    if (cmp === "") { if (s.compare_at_paise != null) patch.compare_at_paise = null; }
    else { const v = inrToPaise(cmp); if (v !== s.compare_at_paise) patch.compare_at_paise = v; }
    const sku = m.sku.trim();
    if (sku !== (s.sku ?? "")) { if ([...sku].length > 80) throw new Error("Keep the SKU within 80 characters."); patch.sku = sku; }
    const tags = splitTags(m.tags);
    if (!same(tags, s.tags || [])) {
      if (tags.length > 10 || tags.some(t => [...t].length > 40)) throw new Error("Use up to 10 tags, each within 40 characters.");
      patch.tags = tags;
    }
    const hsn = m.hsn.trim();
    if (hsn !== (s.hsn_code ?? "")) { if (!/^(?:\d{4}|\d{6}|\d{8})$/.test(hsn)) throw new Error("Enter a 4, 6 or 8-digit HSN code."); patch.hsn_code = hsn; }
    if (m.gst !== "" && (s.gst_rate==null || Number(m.gst) !== Number(s.gst_rate))) {
      const g = Number(m.gst);
      if (!CURRENT_GST_RATES.includes(g)) throw new Error("Choose a current GST rate.");
      patch.gst_rate = g;
    } else if (m.gst === "" && s.gst_rate != null) throw new Error("Choose a GST rate explicitly.");
    const imgs = m.images.map(i => ({ id: i.id, alt: i.alt.trim() })), before = (s.images || []).map(i => ({ id: i.id, alt: (i.alt ?? "").trim() }));
    if (!same(imgs, before)) {
      if (imgs.length < 1 || imgs.length > MAX_IMG) throw new Error("Add 1 to 8 product images.");
      patch.images = imgs;
    }
    return patch;
  }

  function save(id) {
    if (locked() || uploadingId || !acks[id] || !dirty(id)) return;
    let patch;
    try { patch = buildPatch(id); } catch (e) { msgs[id] = e.message; return redraw(); }
    if (!Object.keys(patch).length) { msgs[id] = "Nothing has changed."; return redraw(); }
    msgs[id] = "";
    return submit(`product:${id}`, { action: "product", product: { id, patch } }, () => receive(latest, { savedId: id }));
  }

  async function upload(id) {
    const f = files[id], m = models.get(id);
    if (locked() || uploadingId || !f || !m) return;
    uploadingId = id; msgs[id] = ""; redraw();
    try {
      const fd = new FormData();
      fd.append("file", f); fd.append("type", "image"); fd.append("alt", (m.uploadAlt || "").trim());
      const res = await fetch(`${api}/media`, { method: "POST", credentials: "same-origin", body: fd });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.media?.id) throw new Error(out.error || "Could not upload the photo. Your edits and file are kept.");
      const md = out.media;
      choices.set(md.id, { id: md.id, url: md.url, alt: md.alt ?? "" });
      if (m.images.length < MAX_IMG && !m.images.some(i => i.id === md.id)) m.images.push({ id: md.id, alt: md.alt ?? "" });
      m.uploadAlt = ""; acks[id] = false; delete files[id];
      msgs[id] = "Photo uploaded. It is not saved to the product until you confirm and save.";
    } catch (e) { msgs[id] = e.message; }
    finally { uploadingId = ""; redraw(); }
  }

  function setField(id, f, val, i) {
    const m = models.get(id); if (!m) return;
    if (f === "alt") { if (m.images[i]) m.images[i].alt = val; }
    else if (f === "addsel") { addSel[id] = val; return redraw(); }
    else if (f === "uploadAlt") { m.uploadAlt = val; return; }
    else if (f in m) m[f] = val; else return;
    acks[id] = false; msgs[id] = ""; redraw();
  }

  function click(e) {
    const b = e.target.closest("[data-pd]"), node = slot();
    if (!b || !node?.contains(b) || b.tagName !== "BUTTON") return;
    e.preventDefault();
    if (locked()) return;
    const id = b.dataset.id, a = b.dataset.pd, m = models.get(id), i = Number(b.dataset.i);
    if (!m) return;
    if (a === "upload") return void upload(id);
    if (uploadingId) return;
    if (a === "save") return void save(id);
    if (a === "undo") { const s = server.get(id); models.set(id, fromServer(s)); acks[id] = false; msgs[id] = ""; }
    else if (a === "rm") m.images.splice(i, 1);
    else if (a === "up" && i > 0) [m.images[i - 1], m.images[i]] = [m.images[i], m.images[i - 1]];
    else if (a === "down" && i < m.images.length - 1) [m.images[i + 1], m.images[i]] = [m.images[i], m.images[i + 1]];
    else if (a === "add") {
      const pick = choices.get(addSel[id]);
      if (!pick || m.images.length >= MAX_IMG || m.images.some(x => x.id === pick.id)) return;
      m.images.push({ id: pick.id, alt: pick.alt }); delete addSel[id];
    } else return;
    acks[id] = a === "undo" ? false : false; msgs[id] = ""; redraw();
  }

  function field(e) {
    const n = e.target, node = slot();
    if (!node?.contains(n) || !n.dataset) return;
    const d = n.dataset;
    if ("pdAck" in d) { if (!locked() && !uploadingId && dirty(d.id)) { acks[d.id] = n.checked; redraw(); } return; }
    if ("pdFile" in d) {
      if (locked()) return;
      const f = n.files?.[0]; delete files[d.id];
      if (f) {
        if (!TYPES.includes(f.type)) msgs[d.id] = "Choose a JPEG, PNG or WebP photo.";
        else if (f.size > MAX_BYTES) msgs[d.id] = "Photos can be at most 10 MB.";
        else { files[d.id] = f; msgs[d.id] = ""; }
      }
      return redraw();
    }
    if ("pdF" in d && !locked() && !uploadingId) setField(d.id, d.pdF, n.value, Number(d.i));
  }

  document.addEventListener("click", click);
  document.addEventListener("input", e => { if (e.target.tagName !== "SELECT" && e.target.type !== "checkbox" && e.target.type !== "file") field(e); });
  document.addEventListener("change", e => { if (e.target.tagName === "SELECT" || e.target.type === "checkbox" || e.target.type === "file") field(e); });

  function gstOptions(id) {
    const s = server.get(id), orig = s?.gst_rate, m = models.get(id);
    const legacy = LEGACY_GST_RATES.includes(Number(orig)) ? [Number(orig)] : [];
    const rates = [...CURRENT_GST_RATES, ...legacy].sort((a, b) => a - b);
    return `<option value="">Choose a rate</option>${rates.map(r => `<option value="${r}"${String(r) === m.gst || (m.gst !== "" && Number(m.gst) === r) ? " selected" : ""}>${r}%${r === 0 ? " / Exempt" : ""}${legacy.includes(r) ? " (legacy rate)" : ""}</option>`).join("")}`;
  }
  function input(id, f, label, v, o = {}, dis) {
    const key = `pd-${id}-${f}`, tag = o.area ? "textarea" : "input";
    const err = o.err ? ` aria-invalid="true" aria-describedby="${esc(key)}-e"` : "";
    const ctl = o.area ? `<textarea id="${esc(key)}" rows="4" data-rd-key="${esc(key)}" data-pd-f="${f}" data-id="${esc(id)}"${dis}${err}>${esc(v)}</textarea>`
      : `<${tag} id="${esc(key)}" data-rd-key="${esc(key)}" data-pd-f="${f}" data-id="${esc(id)}" value="${esc(v)}"${o.mode ? ` inputmode="${o.mode}"` : ""}${dis}${err}>`;
    return `<label class="ann-field" for="${esc(key)}">${esc(label)}${ctl}</label>${o.err ? `<p class="ann-error" id="${esc(key)}-e">${esc(o.err)}</p>` : ""}`;
  }
  function photos(id, m, dis) {
    const sel = new Set(m.images.map(i => i.id));
    const avail = [...choices.values()].filter(c => !sel.has(c.id));
    const rows = m.images.map((im, i) => {
      const c = choices.get(im.id), u = safeUrl(c?.url), k = `pd-${id}-alt-${i}`;
      return `<li class="ann-item">${u ? `<img src="${esc(u)}" alt="" width="64" height="64" loading="lazy">` : `<span class="ann-note">Preview unavailable</span>`}
        <label class="ann-field" for="${esc(k)}">Photo ${i + 1} description<input id="${esc(k)}" data-rd-key="${esc(k)}" data-pd-f="alt" data-id="${esc(id)}" data-i="${i}" value="${esc(im.alt)}"${dis}></label>
        <div class="ann-actions"><button type="button" class="ann-btn alt" data-pd="up" data-id="${esc(id)}" data-i="${i}"${i === 0 ? " disabled" : dis}>Move earlier</button>
        <button type="button" class="ann-btn alt" data-pd="down" data-id="${esc(id)}" data-i="${i}"${i === m.images.length - 1 ? " disabled" : dis}>Move later</button>
        <button type="button" class="ann-btn alt" data-pd="rm" data-id="${esc(id)}" data-i="${i}"${dis}>Remove</button></div></li>`;
    }).join("");
    const full = m.images.length >= MAX_IMG, f = files[id];
    return `<p class="ann-note">Photos: ${m.images.length} of ${MAX_IMG}. The first photo is the main one. Order only changes when you use the buttons.</p>
      ${rows ? `<ol>${rows}</ol>` : `<p class="ann-note">No photos selected. A product needs 1 to 8.</p>`}
      <label class="ann-field" for="pd-${esc(id)}-addsel">Add an approved store photo<select id="pd-${esc(id)}-addsel" data-rd-key="pd-${esc(id)}-addsel" data-pd-f="addsel" data-id="${esc(id)}"${dis}>
        <option value="">Choose a photo</option>${avail.map(c => `<option value="${esc(c.id)}"${addSel[id] === c.id ? " selected" : ""}>${esc(c.alt || c.id.slice(0, 8))}</option>`).join("")}</select></label>
      <button type="button" class="ann-btn alt" data-pd="add" data-id="${esc(id)}"${full || !addSel[id] ? " disabled" : dis}>Add photo</button>
      <label class="ann-field" for="pd-${esc(id)}-file">Upload a new photo (JPEG, PNG or WebP, up to 10 MB)<input type="file" id="pd-${esc(id)}-file" data-rd-key="pd-${esc(id)}-file" data-pd-file="1" data-id="${esc(id)}" accept="image/jpeg,image/png,image/webp"${dis}></label>
      ${f ? `<p class="ann-note">Selected file: ${esc(f.name)}</p>` : ""}
      <label class="ann-field" for="pd-${esc(id)}-ualt">Description for the uploaded photo<input id="pd-${esc(id)}-ualt" data-rd-key="pd-${esc(id)}-ualt" data-pd-f="uploadAlt" data-id="${esc(id)}" value="${esc(m.uploadAlt || "")}"${dis}></label>
      <button type="button" class="ann-btn alt" data-pd="upload" data-id="${esc(id)}"${f && !uploadingId ? dis : " disabled"}>${uploadingId === id ? "Uploading" : "Upload photo"}</button>
      <p class="ann-note">Uploading adds the photo to your store library only. It joins this product when you confirm and save. Photo descriptions are shared by products using the same upload. The library shows up to 200 recent approved photos.</p>`;
  }
  function card(p) {
    const id = p.id, m = models.get(id) || fromServer(p), dis = (locked() || uploadingId) ? " disabled" : "";
    const errs = p.errors || {}, d = dirty(id);
    const warn = productGSTWarning({ gst_rate: m.gst, hsn_code: m.hsn });
    const legacy = LEGACY_GST_RATES.includes(Number(p.gst_rate)) && Number(m.gst) === Number(p.gst_rate);
    const stock = p.stock === null || p.stock === undefined ? "Always in stock" : String(p.stock);
    return `<fieldset class="ann-item"><legend>${esc(p.title || "Untitled product")}</legend>
      ${Object.keys(errs).length ? `<p class="ann-callout" role="status">Saved problems: ${Object.entries(errs).map(([k, v]) => esc(`${k.replace(/_/g, " ")}: ${v}`)).join("; ")}</p>` : ""}
      ${input(id, "title", "Title", m.title, { err: errs.title }, dis)}
      ${input(id, "description", "Description", m.description, { area: true, err: errs.description }, dis)}
      ${input(id, "price", "Selling price (INR)", m.price, { mode: "decimal", err: errs.price_paise }, dis)}
      ${input(id, "compare", "Compare-at price (INR, optional)", m.compare, { mode: "decimal", err: errs.compare_at_paise }, dis)}
      ${input(id, "sku", "SKU", m.sku, { err: errs.sku }, dis)}
      ${input(id, "tags", "Tags (comma separated, up to 10)", m.tags, { err: errs.tags }, dis)}
      ${input(id, "hsn", "HSN code", m.hsn, { mode: "numeric", err: errs.hsn_code }, dis)}
      <label class="ann-field" for="pd-${esc(id)}-gst">GST rate<select id="pd-${esc(id)}-gst" data-rd-key="pd-${esc(id)}-gst" data-pd-f="gst" data-id="${esc(id)}"${dis}>${gstOptions(id)}</select></label>
      ${errs.gst_rate ? `<p class="ann-error">${esc(errs.gst_rate)}</p>` : ""}
      ${legacy ? `<p class="ann-callout" role="status">This product uses a legacy GST rate of ${esc(p.gst_rate)}%. It is kept as is. Confirm it is still correct before saving, or choose a current rate.</p>` : ""}
      ${warn ? `<p class="ann-callout" role="status">${esc(warn)}</p>` : ""}
      ${errs.images ? `<p class="ann-error">${esc(errs.images)}</p>` : ""}
      ${photos(id, m, dis)}
      <p class="ann-note">Stock: ${esc(stock)} (read only). Stock and variants are managed with the catalogue tools.</p>
      <label class="ann-check"><input type="checkbox" data-rd-key="pd-${esc(id)}-ack" data-pd-ack="1" data-id="${esc(id)}"${acks[id] ? " checked" : ""}${d && !locked() && !uploadingId ? "" : " disabled"}><span>I confirm saving these changes to this draft product. Nothing is published.</span></label>
      ${msgs[id] ? `<p class="${/uploaded/.test(msgs[id]) ? "ann-callout" : "ann-error"}" role="${/uploaded/.test(msgs[id]) ? "status" : "alert"}">${esc(msgs[id])}</p>` : ""}
      ${saveMessages[`product:${id}`] ? `<p class="${saveMessages[`product:${id}`].type==="err"?"ann-error":"ann-callout"}" role="${saveMessages[`product:${id}`].type==="err"?"alert":"status"}">${esc(saveMessages[`product:${id}`].text)}</p>` : ""}
      <div class="ann-actions"><button type="button" class="ann-btn" data-pd="save" data-id="${esc(id)}"${d && acks[id] && !locked() && !uploadingId ? "" : " disabled"}>Save product</button>
      <button type="button" class="ann-btn alt" data-pd="undo" data-id="${esc(id)}"${d && !locked() && !uploadingId ? "" : " disabled"}>Discard edits</button></div></fieldset>`;
  }
  function render(data, { disabled = false, messages={} } = {}) {
    off = !!disabled;
    saveMessages=messages;
    if (data && data !== latest) { latest = data; if (!models.size && (data.products || []).length) receive(data); }
    const list = data?.products || [];
    if (!list.length) return `<h3 id="ann-products">Products</h3><p class="ann-note">No real products yet. Products are created with the catalogue tools or by applying your confirmed Ann plan.</p>`;
    return `<h3 id="ann-products">Products</h3><p class="ann-note">Edits save to draft products only. Nothing is published, and prices and tax are checked again when you publish.</p>${list.map(card).join("")}`;
  }
  return {
    receive, render,
    hasUnsavedChanges: () => !!uploadingId || Object.keys(files).length>0 || [...models.keys()].some(id=>dirty(id)||!!models.get(id).uploadAlt),
    isUploading: () => !!uploadingId,
  };
}
