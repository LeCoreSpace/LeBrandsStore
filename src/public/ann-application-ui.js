const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function rupeesToPaise(value) {
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(String(value).trim())) throw new Error("Enter a price in INR with at most two decimal places.");
  const [whole, fraction = ""] = String(value).trim().split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (paise < 1 || paise > 10000000000) throw new Error("Enter a price above zero and no more than INR 100,000,000.");
  return paise;
}
export function stockQuantity(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const stock = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(stock) || stock > 10000000) throw new Error("Enter whole stock units from 0 to 10,000,000, or leave stock blank.");
  return stock;
}
export function attachAnnApplication({ api, root, readOnly, context, beforePrepare, onApplied }) {
  let prepared, preparing = false, applying = false, message = "", confirmed = false, pageChoices;
  const products = new Map(), collections = new Map();
  let preparedRevision;
  const slot = () => document.querySelector("#ann-application-slot");
  function draw() {
    const node = slot(); if (!node) return;
    const { answers, revision, dirty } = context();
    const applied = prepared?.application?.revision === revision;
    const disabled = readOnly || applying || preparing;
    const dis = disabled ? " disabled" : "";
    const targets = (items, selected, extra) => extra + items.map(i => `<option value="${esc(i.id)}"${selected === i.id ? " selected" : ""}>${esc(i.title)}</option>`).join("");
    node.innerHTML = `<h2>Make this your store draft</h2>
      <p>Link your existing products or create products with details you confirm. Example prices, stock and product photos are not imported. No changes are published.</p>
      <p class="ann-note">Prices and catalogue choices below are saved only when you apply the draft, not when you save the Ann plan.</p>
      ${message ? `<p class="ann-callout" role="status">${esc(message)}</p>` : ""}
      ${dirty ? '<p class="ann-callout">Save your latest plan first.</p>' : ""}
      ${!prepared ? `<button type="button" class="ann-btn" data-ann-prepare${disabled || dirty || !revision ? " disabled" : ""}>${preparing ? "Preparing" : "Prepare draft changes"}</button>` : `
      ${applied ? `<p class="ann-callout">This saved plan is already applied. Continue in the editor or Products. A changed Ann plan can be saved and prepared again.</p>` : ""}
      <fieldset${dis}><legend>Page drafts to replace</legend><p class="ann-note">Only checked pages are replaced. Saved page versions remain recoverable in the editor. Policies are not replaced.</p>
        ${prepared.pages.map(p => `<label class="ann-check"><input type="checkbox" data-ann-page="${p.key}"${pageChoices.has(p.key) ? " checked" : ""}><span>${esc(p.key)}${p.version ? " (existing draft)" : ""}</span></label>`).join("")}</fieldset>
      ${(answers.collections || []).map(c => {
        const target = collections.get(c.key) || prepared.application?.collections?.[c.key] || "new";
        return `<label class="ann-field">Collection: ${esc(c.name)}<select data-ann-collection="${esc(c.key)}"${dis}>${targets(prepared.collections, target, `<option value="new"${target === "new" ? " selected" : ""}>Create new collection</option>`)}</select></label>`;
      }).join("")}
      <p class="ann-note">Existing collection text and images are kept. Confirmed products are added without removing current members.</p>
      ${(answers.product_ideas || []).map(p => {
        const row = products.get(p.key) || { target: prepared.application?.products?.[p.key] || "skip" };
        return `<fieldset class="ann-item"${dis}><legend>${esc(p.name)}</legend>
          <label class="ann-field">Product action<select data-ann-product="${esc(p.key)}" data-ann-field="target">${targets(prepared.products, row.target, `<option value="skip"${row.target === "skip" ? " selected" : ""}>Keep as an idea, do not create</option><option value="new"${row.target === "new" ? " selected" : ""}>Create new product</option>`)}</select></label>
          ${row.target === "new" ? `
            <label class="ann-field">Selling price (INR)<input inputmode="decimal" data-ann-product="${esc(p.key)}" data-ann-field="price" value="${esc(row.price || "")}" placeholder="1299.00"></label>
            <label class="ann-field">GST rate<select data-ann-product="${esc(p.key)}" data-ann-field="gst">${["",0,5,18,40].map(rate => `<option value="${rate}"${String(row.gst ?? "") === String(rate) ? " selected" : ""}>${rate === "" ? "Choose explicitly" : rate + "%"}</option>`).join("")}</select></label>
            <label class="ann-field">HSN code<input data-ann-product="${esc(p.key)}" data-ann-field="hsn" value="${esc(row.hsn || "")}" maxlength="8"></label>
            <label class="ann-field">Stock quantity<input inputmode="numeric" data-ann-product="${esc(p.key)}" data-ann-field="stock" value="${esc(row.stock || "")}"></label>
            <p class="ann-note">Blank stock means inventory is not tracked. Zero means out of stock.</p>
            <label class="ann-field">Your product photo<select data-ann-product="${esc(p.key)}" data-ann-field="media"><option value="">Add a real photo later in Products</option>${prepared.images.map(m => `<option value="${esc(m.id)}"${row.media === m.id ? " selected" : ""}>${esc(m.alt_text || m.object_key.split("/").pop())}</option>`).join("")}</select></label>
            <p class="ann-note">Products without real photos or required tax details must be completed before publishing.</p>` : row.target !== "skip" ? '<p class="ann-note">Existing product name, description, photos, price and stock are not changed.</p>' : ""}
        </fieldset>`;
      }).join("")}
      <label class="ann-check"><input type="checkbox" data-ann-confirm${confirmed ? " checked" : ""}${dis}><span>I confirm these product details and collection additions, and replacement of the checked page drafts. Brand and product changes may require another policy review.</span></label>
      <div class="ann-actions"><button type="button" class="ann-btn" data-ann-apply${disabled || dirty || !confirmed || applied ? " disabled" : ""}>${applying ? "Applying draft" : "Apply confirmed draft"}</button>
      <button type="button" class="ann-btn alt" data-ann-prepare${disabled || dirty ? " disabled" : ""}>Refresh draft check</button></div>
      <h3>Publishing checks</h3><ul>${prepared.checklist.map(c => `<li>${c.complete ? "Complete" : "Needs attention"}: ${esc(c.label || c.title || c.key)}</li>`).join("")}</ul>
      <div class="ann-actions"><a href="${root}/products">Manage products</a><a href="${root}/setup">Complete selling and business setup</a><a href="${root}/editor">Review in theme editor</a></div>`}`;
  }
  async function prepare() {
    if (context().dirty) { message = "Save your plan first."; draw(); return; }
    preparing = true; message = ""; draw();
    try {
      if (!readOnly && beforePrepare && !await beforePrepare()) throw new Error("Resolve the saved-plan conflict before preparing draft changes.");
      const response = await fetch(`${api}/application`, { credentials: "same-origin" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not check the current store draft.");
      if (result.expected_revision !== context().revision) throw new Error("Ann changed in another window. Reload the saved plan before preparing draft changes.");
      prepared = result; preparedRevision = result.expected_revision;
      pageChoices ||= new Set(result.pages.map(p => p.key));
      confirmed = false;
    } catch (error) { message = error.message; }
    finally { preparing = false; draw(); }
  }
  async function apply() {
    if (readOnly || applying || !confirmed || context().dirty) return;
    applying = true; message = ""; draw();
    try {
      if (!prepared || context().revision !== prepared.expected_revision) throw new Error("Save and prepare the latest Ann plan before applying.");
      const { answers } = context();
      const rows = (answers.product_ideas || []).map(p => {
        const row = products.get(p.key) || { target: prepared.application?.products?.[p.key] || "skip" };
        if (row.target !== "new") return { key: p.key, target: row.target };
        if (row.gst === undefined || row.gst === "") throw new Error(`Choose a GST rate for ${p.name}.`);
        return { key: p.key, target: "new", price_paise: rupeesToPaise(row.price || ""), gst_rate: Number(row.gst),
          hsn_code: row.hsn || "", stock: stockQuantity(row.stock), media_id: row.media || null };
      });
      const body = { expected_revision: prepared.expected_revision, expected_draft: prepared.expected_draft, confirm: true,
        pages: [...pageChoices], products: rows, collections: (answers.collections || []).map(c => ({
          key: c.key, target: collections.get(c.key) || prepared.application?.collections?.[c.key] || "new",
        })) };
      const response = await fetch(`${api}/application`, { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not apply the draft. No partial changes were saved.");
      prepared.application = result.application; prepared.checklist = result.checklist;
      prepared.products = result.draft.products.map(p => ({ id: p.id, title: p.title }));
      prepared.collections = result.draft.collections.map(c => ({ id: c.id, title: c.title }));
      products.clear(); collections.clear();
      confirmed = false; message = "Draft applied. Nothing was published. Review your pages and complete the remaining checks.";
      onApplied(result);
    } catch (error) { message = error.message; }
    finally { applying = false; draw(); }
  }
  document.addEventListener("click", event => {
    const button = event.target.closest("button"); if (!button || !slot()?.contains(button)) return;
    if ("annPrepare" in button.dataset) void prepare();
    if ("annApply" in button.dataset) void apply();
  });
  document.addEventListener("input", event => {
    const node = event.target, d = node.dataset; if (!slot()?.contains(node)) return;
    if ("annProduct" in d) {
      const row = products.get(d.annProduct) || { target: prepared.application?.products?.[d.annProduct] || "skip" };
      row[d.annField] = node.value; products.set(d.annProduct, row); confirmed = false;
      if (d.annField === "target") draw();
      else { const checkbox = slot().querySelector("[data-ann-confirm]"); if (checkbox) checkbox.checked = false; const submit = slot().querySelector("[data-ann-apply]"); if (submit) submit.disabled = true; }
    } else if ("annCollection" in d) { collections.set(d.annCollection, node.value); confirmed = false; draw(); }
    else if ("annPage" in d) { node.checked ? pageChoices.add(d.annPage) : pageChoices.delete(d.annPage); confirmed = false; draw(); }
    else if ("annConfirm" in d) { confirmed = node.checked; draw(); }
  });
  return {
    hasUnappliedChanges: () => products.size > 0 || collections.size > 0 || applying,
    mount() { if (preparedRevision !== context().revision && !applying) { prepared = null; confirmed = false; } draw(); },
  };
}
