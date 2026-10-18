const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MIMES = ["application/pdf", "image/jpeg", "image/png"];
const STATUS = { pending_review: "Pending business review", changes_requested: "Changes requested", approved: "Approved" };
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function attachAnnBusinessDocuments({ api, readOnly, onError, onSubmitted } = {}) {
  let dlg = null, data = null, loading = false, busy = false, loadError = "", opener = null;
  let errors = {}, formError = "", success = "", dirty = false, discarding = false, file = null;
  let form = { country_code: "", legal_name: "", registration_type: "", registration_number: "", explanation: "", document_type: "" };
  let seeded = false;

  const report = m => { try { onError?.(m); } catch {} };
  const reqs = () => data?.requirements || [];
  const reqFor = c => reqs().find(r => r.country_code === c) || reqs().find(r => r.country_code === "*") || null;
  const isIN = () => form.country_code === "IN";
  const approved = () => data?.verification?.status === "approved";
  const locked = () => readOnly || approved();

  function seed() {
    const v = data?.verification;
    form = {
      country_code: data?.business_country || v?.country_code || data?.account_country || "",
      legal_name: v?.legal_name || "", registration_type: v?.registration_type || "",
      registration_number: v?.registration_number || "", explanation: v?.explanation || "",
      document_type: v?.documents?.[0]?.document_type || "",
    };
    seeded = true;
  }
  function fixIN() {
    if (isIN() && data?.gst) { form.legal_name = data.gst.legal_name || ""; form.registration_number = data.gst.gstin || ""; form.registration_type = "gst_registered"; form.document_type = "gst_certificate"; }
  }

  async function load() {
    loading = true; loadError = ""; draw();
    try {
      const res = await fetch(api, { credentials: "same-origin", headers: { accept: "application/json" } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.available === false) throw new Error(body.error || "Business documents are not available yet.");
      data = body; if (!seeded || !dirty) seed();
    } catch (e) { loadError = e.message || "Business documents could not be loaded."; report(loadError); }
    loading = false; draw();
  }

  function validate() {
    const e = {}, r = reqFor(form.country_code);
    if (!form.country_code) e.country_code = "Choose your country.";
    if (!r) return e;
    const gstBlocked = isIN() && !(data.gst?.verified && data.gst?.address_confirmed);
    if (gstBlocked) e.form = "Verify your GST number and confirm your address in Ann's GST step first.";
    if (!form.legal_name.trim()) e.legal_name = "Enter the legal business name.";
    if (!form.registration_type) e.registration_type = "Choose a registration type.";
    const exc = form.registration_type === "not_registered";
    if (exc) {
      if (form.explanation.trim().length < 30) e.explanation = "Explain in at least 30 characters.";
    } else {
      if (!form.registration_number.trim()) e.registration_number = "Enter the registration number.";
      if (!form.document_type) e.document_type = "Choose a document type.";
      if (!data.uploads_available) e.file = data.upload_message || "Uploads are unavailable right now.";
      else if (!file) e.file = "Choose a PDF, JPEG or PNG file. A replacement file is needed each time you submit.";
    }
    if (file && !exc) {
      if (!MIMES.includes(file.type)) e.file = "The file must be a PDF, JPEG or PNG.";
      else if (file.size > (data.max_file_bytes || 5242880)) e.file = "The file must be 5 MiB or smaller.";
      else if (file.size === 0) e.file = "The file is empty.";
    }
    return e;
  }

  async function submit() {
    if (busy || locked()) return;
    fixIN(); errors = validate(); formError = errors.form || ""; success = "";
    if (Object.keys(errors).length) { draw(); dlg?.querySelector("[aria-invalid=true]")?.focus(); return; }
    busy = true; draw();
    const exc = form.registration_type === "not_registered";
    const details = { expected_revision: data.verification?.revision ?? 0, country_code: form.country_code, legal_name: form.legal_name.trim(),
      registration_type: form.registration_type, registration_number: exc ? "" : form.registration_number.trim(), explanation: exc ? form.explanation.trim() : "", document_type: exc ? "" : form.document_type };
    const fd = new FormData(); fd.append("details", JSON.stringify(details));
    if (!exc && file) fd.append("file", file, file.name);
    try {
      const res = await fetch(api, { method: "POST", credentials: "same-origin", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        errors = body.errors && typeof body.errors === "object" ? body.errors : {};
        formError = res.status === 409 ? (body.error || "This record changed elsewhere. Reload it, then submit again.") : (body.error || "Your submission was not saved. Your entries are kept.");
        report(formError);
      } else {
        data = body; file = null; dirty = false; errors = {}; formError = ""; seed();
        success = "Submitted. Status: " + (STATUS[body.verification?.status] || "received") + ".";
        onSubmitted?.(body);
      }
    } catch { formError = "The network failed. Your entries are kept. Try again."; report(formError); }
    busy = false; draw();
  }

  function set(name, value) { form[name] = value; dirty = true; delete errors[name]; success = ""; }

  function field(name, label, inner, hint) {
    const err = errors[name];
    return `<div class="abd-field"><label for="abd-${name}">${label}</label>${inner}${hint ? `<span class="abd-hint" id="abd-${name}-h">${hint}</span>` : ""}${err ? `<p class="abd-field-error" id="abd-${name}-e" role="alert">${esc(err)}</p>` : ""}</div>`;
  }
  const attrs = name => `id="abd-${name}" name="${name}" data-f="${name}"${errors[name] ? ` aria-invalid="true" aria-describedby="abd-${name}-e"` : ""}${locked() || busy ? " disabled" : ""}`;

  function formHtml() {
    const r = reqFor(form.country_code), v = data.verification, ind = isIN();
    const exc = form.registration_type === "not_registered";
    const dis = locked() || busy;
    let h = "";
    if (v) h += `<p><span class="abd-status" data-s="${esc(v.status)}">${esc(STATUS[v.status] || v.status)}</span> <span class="abd-hint">Revision ${v.revision}. This is separate from GST verification.</span></p>`;
    if (v?.status === "approved") h += `<p class="abd-note">This record is approved and read only.</p>`;
    if (v?.feedback) h += `<p class="abd-warn"><strong>Reviewer feedback:</strong> ${esc(v.feedback)}</p>`;
    if (v?.status === "pending_review") h += `<p class="abd-note">Your submission is waiting for review. You may submit a corrected version.</p>`;
    if(data.business_access?.enforced&&!data.business_country)
      h+=`<p class="abd-warn">Confirm your business country in Ann before submitting evidence.</p>`;
    else if(data.business_access?.enforced)
      h+=`<p class="abd-hint">Business country is managed in Ann. Submitted evidence and confirmed invoice details cannot be relabelled here.</p>`;
    h += `<div class="abd-field"><label for="abd-country_code">Business country</label><select ${attrs("country_code")}><option value="">Choose a country</option>${(data.countries || []).map(c => `<option value="${esc(c.code)}"${c.code === form.country_code ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select><span class="abd-hint">${data.account_country ? "Your account country is only a suggestion, not proof." : "Choose where your business is registered."}</span>${errors.country_code ? `<p class="abd-field-error" role="alert">${esc(errors.country_code)}</p>` : ""}</div>`;
    if (!r) return h;
    h += ind ? `<p class="abd-note">${esc(r.label)}: ${esc(r.description)}</p>` : `<p class="abd-note">${esc(r.label)}: ${esc(r.description)} This country is assessed manually. Submitting makes no claim about legal tax compliance.</p>`;
    if (ind && !(data.gst?.verified && data.gst?.address_confirmed)) h += `<p class="abd-warn">Indian submissions need a verified GST number and a confirmed address. Close this window and return to the GST step in Ann.</p>`;
    h += field("legal_name", "Legal business name", `<input type="text" maxlength="200" ${attrs("legal_name")} value="${esc(ind ? data.gst?.legal_name : form.legal_name)}"${ind ? " readonly" : ""}>`, ind ? "Taken from your verified GST record." : "");
    h += field("registration_type", "Registration type", `<select ${attrs("registration_type")}><option value="">Choose</option>${r.registration_types.filter(t => t.value !== "not_registered" || r.allow_exception).map(t => `<option value="${esc(t.value)}"${t.value === form.registration_type ? " selected" : ""}>${esc(t.label)}</option>`).join("")}</select>`);
    if (exc) {
      h += field("explanation", "Why is there no registration?", `<textarea rows="4" maxlength="1000" ${attrs("explanation")}>${esc(form.explanation)}</textarea>`, "Use 30 to 1,000 characters.");
    } else if (form.registration_type) {
      h += field("registration_number", ind ? "GST number" : "Registration number", `<input type="text" maxlength="64" autocomplete="off" ${attrs("registration_number")} value="${esc(ind ? data.gst?.gstin : form.registration_number)}"${ind ? " readonly" : ""}>`);
      h += field("document_type", "Document type", `<select ${attrs("document_type")}><option value="">Choose</option>${r.document_types.map(t => `<option value="${esc(t.value)}"${t.value === form.document_type ? " selected" : ""}>${esc(t.label)}</option>`).join("")}</select>`);
      if (!data.uploads_available) h += `<p class="abd-warn">${esc(data.upload_message || "File uploads are unavailable right now.")}</p>`;
      h += field("file", "Document file", `<input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" ${attrs("file")}${data.uploads_available ? "" : " disabled"}>`, `PDF, JPEG or PNG, up to 5 MiB.${file ? " Selected: " + esc(file.name) : ""}`);
    }
    return h + (dis ? "" : "");
  }

  function docsHtml() {
    const docs = data.verification?.documents || [];
    if (!docs.length) return "";
    return `<section aria-label="Submitted documents"><h3 style="margin:0 0 6px;font-size:14px">Submitted documents</h3><ul class="abd-docs">${docs.map(d => `<li>${esc(d.filename)} (${esc(d.document_type)}, ${(d.size / 1024).toFixed(0)} KB). ${d.scan_status === "clean" ? "Scan passed." : "Scan problem: this file did not pass scanning. Submit a replacement."} ${d.download_url && String(d.download_url).startsWith("/") && !String(d.download_url).startsWith("//") ? `<a href="${esc(d.download_url)}" download>Download</a>` : ""}</li>`).join("")}</ul></section>`;
  }

  function draw() {
    if (!dlg) return;
    const keep = document.activeElement?.id;
    let body;
    if (loading && !data) body = `<div class="abd-skel"></div><div class="abd-skel"></div><div class="abd-skel"></div>`;
    else if (!data) body = `<p class="abd-alert" role="alert">${esc(loadError || "Business documents are not available.")}</p>`;
    else {
      const days = data.retention_days;
      body = `${loadError ? `<p class="abd-alert" role="alert">${esc(loadError)}</p>` : ""}<p>Submit your business registration details for manual review. Ann's conversation language does not affect this form.</p>
        <p class="abd-note">Documents are private files${days ? `. Retention is scheduled for review after ${days} days` : ""}. A deletion schedule must be confirmed separately.</p>
        <p class="abd-note">Document review does not enable subscription payments or change your tax or invoice status.</p>
        ${formHtml()}${docsHtml()}
        ${formError ? `<p class="abd-alert" role="alert">${esc(formError)}</p>` : ""}${success ? `<p class="abd-note" role="status">${esc(success)}</p>` : ""}
        ${busy ? `<p class="abd-hint" role="status">Uploading and submitting. Please wait.</p>` : ""}`;
    }
    const canSend = data && data.retention_days && (!data.business_access?.enforced||data.business_country) && !locked() && !busy && !discarding && reqFor(form.country_code);
    dlg.innerHTML = `<div class="abd-head"><div><h2 id="abd-title">Business documents</h2></div><button type="button" class="abd-btn alt" data-a="close"${busy ? " disabled" : ""}>Close</button></div>
      <div class="abd-body" aria-busy="${loading || busy}">${discarding ? `<div class="abd-discard" role="alertdialog" aria-labelledby="abd-dt"><strong id="abd-dt">Discard your unsaved entries?</strong><div class="abd-foot" style="padding:0;border:0;justify-content:flex-start"><button type="button" class="abd-btn" data-a="discard">Discard</button><button type="button" class="abd-btn alt" data-a="keep">Keep editing</button></div></div>` : ""}${data && !data.retention_days ? `<p class="abd-warn">Business submissions are paused until the platform configures its document retention review policy.</p>` : ""}<div${discarding ? " inert" : ""}>${body}</div></div>
      <div class="abd-foot">${!data && !loading ? `<button type="button" class="abd-btn alt" data-a="retry">Retry</button>` : ""}${data && !readOnly && !approved() ? `<button type="button" class="abd-btn" data-a="submit"${canSend ? "" : " disabled"}>${busy ? "Submitting..." : data.verification ? "Resubmit for review" : "Submit for review"}</button>` : ""}</div>`;
    const picker = dlg.querySelector('input[type="file"]');
    if (file && picker && typeof DataTransfer === "function") {
      const selection = new DataTransfer(); selection.items.add(file); picker.files = selection.files;
    }
    if(data?.business_access?.enforced){
      const country=dlg.querySelector('[data-f="country_code"]');
      if(country)country.disabled=true;
    }
    if (keep) dlg.querySelector("#" + CSS.escape(keep))?.focus();
    else if (discarding) dlg.querySelector("[data-a=keep]")?.focus();
  }

  function requestClose() {
    if (busy) return;
    if (dirty) { discarding = true; draw(); dlg?.querySelector("[data-a=keep]")?.focus(); return; }
    close(true);
  }
  function close(force) {
    if (!dlg || (busy && !force)) return;
    if (dlg.open) dlg.close();
    dlg.remove(); dlg = null; discarding = false;
    file = null; dirty = false; seeded = false; data = null;
    try { opener?.focus?.(); } catch {}
  }

  function build() {
    dlg = document.createElement("dialog");
    dlg.setAttribute("data-ann-native-fields", "");
    dlg.className = "abd-dialog"; dlg.setAttribute("aria-labelledby", "abd-title"); dlg.setAttribute("aria-modal", "true");
    dlg.addEventListener("cancel", e => { e.preventDefault(); requestClose(); });
    dlg.addEventListener("mousedown", e => { if (e.target === dlg) requestClose(); });
    dlg.addEventListener("keydown", e => {
      if (e.key !== "Tab") return;
      const n = [...dlg.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null || x === document.activeElement);
      if (!n.length) return;
      const a = n[0], z = n[n.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    });
    dlg.addEventListener("click", e => {
      const b = e.target.closest("[data-a]"); if (!b || b.disabled) return;
      const a = b.dataset.a;
      if (a === "close") requestClose();
      else if (a === "keep") { discarding = false; draw(); }
      else if (a === "discard") { dirty = false; close(true); }
      else if (a === "retry") void load();
      else if (a === "submit") void submit();
    });
    dlg.addEventListener("change", e => {
      const t = e.target, n = t.dataset?.f; if (!n || busy) return;
      if (n === "file") { file = t.files?.[0] || null; dirty = true; delete errors.file; draw(); return; }
      set(n, t.value);
      if (n === "country_code") { form.registration_type = ""; form.document_type = ""; fixIN(); }
      draw();
    });
    dlg.addEventListener("input", e => {
      const n = e.target.dataset?.f; if (n && n !== "file" && e.target.tagName !== "SELECT") set(n, e.target.value);
    });
    document.body.appendChild(dlg);
  }

  function open() {
    if (dlg) return;
    opener = document.activeElement; discarding = false; success = ""; formError = ""; errors = {};
    build(); draw(); dlg.showModal();
    void load().then(() => dlg?.querySelector("#abd-title")?.closest("dialog") && dlg.querySelector("select,button")?.focus());
  }
  return { open, hasUnsavedChanges: () => busy || dirty, close: requestClose };
}
