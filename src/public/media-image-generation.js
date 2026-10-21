const root = document.querySelector("[data-ai-root]");
if (root) {
  const q = s => root.querySelector(s);
  let cfg = {};
  try { cfg = JSON.parse(q("[data-ai-config]").textContent) || {}; } catch {}
  const sid = cfg.storeId || root.dataset.storeId || "";
  const preview = cfg.preview === true || root.dataset.preview === "true";
  const base = `/api/stores/${encodeURIComponent(sid)}/media-library/ai`;
  const lib = `/api/stores/${encodeURIComponent(sid)}/media-library`;
  const $ = { status: q("[data-ai-status]"), form: q("[data-ai-form]"), place: q("[data-ai-placement]"), pinfo: q("[data-ai-placement-info]"), prompt: q("[data-ai-prompt]"), count: q("[data-ai-count]"), err: q("[data-ai-error]"), gen: q("[data-ai-generate]"), stage: q("[data-ai-stage]"), el: q("[data-ai-elapsed]"), ra: q("[data-ai-result-actions]"), save: q("[data-ai-save]"), check: q("[data-ai-check]"), retry: q("[data-ai-retry]"), smsg: q("[data-ai-save-msg]"), jobs: q("[data-ai-jobs]"), refSel: q("[data-ai-ref-selected]"), refClear: q("[data-ai-ref-clear]"), refToggle: q("[data-ai-ref-toggle]"), refPanel: q("[data-ai-ref-panel]"), refQ: q("[data-ai-ref-q]"), refSearch: q("[data-ai-ref-search]"), refMsg: q("[data-ai-ref-msg]"), refGrid: q("[data-ai-ref-grid]"), refPrev: q("[data-ai-ref-prev]"), refNext: q("[data-ai-ref-next]"), refPage: q("[data-ai-ref-page]") };
  const el = (t, text, a = {}) => { const n = document.createElement(t); if (text != null) n.textContent = text; for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); return n; };
  const safeUrl = v => { try { const s = String(v || ""); const u = new URL(s, location.origin); return u.protocol === "https:" || (s.startsWith("/") && !s.startsWith("//")) ? s : ""; } catch { return ""; } };
  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); });
  const ACTIVE = ["queued", "generating"];
  let state = { available: false, can_generate: false, reason: "", remaining: null, placements: [] };
  let imgFor = "", loaded = false, job = null, ref = null, requestId = null, requestKey = "", busy = false, timer = null, tick = null, saving = false, blobUrl = "";
  let refOffset = 0, refLimit = 12, refTotal = 0, refMore = false;

  const api = async (path, opts = {}) => {
    const o = { credentials: "same-origin", headers: { Accept: "application/json" }, ...opts };
    if (opts.body !== undefined) { o.headers = { ...o.headers, "Content-Type": "application/json" }; o.body = JSON.stringify(opts.body); }
    const r = await fetch(path, o);
    let d = null; try { d = await r.json(); } catch {}
    if (!r.ok) { const e = new Error((d && (d.error || d.message || d.reason)) || `Request failed (${r.status})`); e.status = r.status; throw e; }
    return d || {};
  };
  const setErr = m => { $.err.hidden = !m; $.err.textContent = m || ""; };
  const fmt = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; };
  const selectedPlacement = () => state.placements.find(p => p.id === $.place.value);

  const refresh = () => {
    const ready = !preview && state.available && state.can_generate && $.place.value && $.prompt.value.trim() && !busy && !(job && ACTIVE.includes(job.status));
    $.gen.disabled = !ready;
    $.count.textContent = String($.prompt.value.length);
    const p = selectedPlacement();
    $.pinfo.textContent = p ? `${p.category ? p.category + ". " : ""}${p.width} x ${p.height} px, ratio ${p.ratio}. The result is created at this exact size.` : "";
  };

  const clearBlob = () => { if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = ""; } };
  const showImage = async j => {
    clearBlob(); imgFor = j.id;
    try {
      const r = await fetch(`${base}/${encodeURIComponent(j.id)}/image`, { credentials: "same-origin" });
      if (!r.ok) throw new Error();
      blobUrl = URL.createObjectURL(await r.blob());
      if (job && job.id === j.id) { const img = el("img", null, { src: blobUrl, alt: "Generated image preview" }); if (j.width && j.height) img.style.aspectRatio = `${j.width} / ${j.height}`; $.stage.replaceChildren(img); }
    } catch { imgFor = ""; $.stage.replaceChildren(el("p", "The image could not be loaded. Use Check status to try again.", { class: "mig-empty" })); }
  };

  const render = () => {
    const j = job;
    $.ra.hidden = !j;
    $.save.hidden = !j || !["ready", "saved"].includes(j.status);
    $.retry.hidden = !j || ACTIVE.includes(j.status);
    $.save.disabled = preview || saving || !j || j.status !== "ready";
    $.save.textContent = j && j.status === "saved" ? "Saved" : saving ? "Saving..." : "Save to library";
    $.retry.textContent = j && j.status === "failed" ? "Edit prompt and try again" : "Edit prompt and retry";
    if (!j) { $.stage.replaceChildren(el("p", "Your generated image will appear here.", { class: "mig-empty" })); $.el.textContent = ""; return; }
    if (ACTIVE.includes(j.status)) {
      const w = el("div", null, { class: "mig-wait" });
      w.append(el("span", null, { class: "mig-dot", "aria-hidden": "true" }), el("p", j.status === "queued" ? "Queued. Waiting for a free slot." : "Generating your image. This can take up to a minute."));
      $.stage.replaceChildren(w);
    } else if (j.status === "failed") {
      $.stage.replaceChildren(el("p", j.error || "Generation failed. Nothing was saved.", { class: "mig-empty is-error" }));
    } else if (imgFor !== j.id) { showImage(j); }
    updateElapsed();
  };
  const updateElapsed = () => {
    const j = job; if (!j) return;
    if (ACTIVE.includes(j.status)) { const t = new Date(j.created_at).getTime(); $.el.textContent = Number.isNaN(t) ? "" : `Elapsed: ${fmt(Date.now() - t)}`; }
    else if (j.total_ms != null) $.el.textContent = `Finished in ${fmt(j.total_ms)}.`;
    else $.el.textContent = "";
  };

  const renderJobs = list => {
    $.jobs.replaceChildren();
    if (!list.length) { $.jobs.append(el("li", "None yet.", { class: "mig-hint" })); return; }
    list.slice(0, 8).forEach(j => {
      const li = el("li"); const b = el("button", null, { type: "button", class: "mig-job" });
      const p = state.placements.find(x => x.id === j.placement_id);
      b.append(el("strong", (p && p.title) || "Placement"), el("span", String(j.prompt || "").slice(0, 80)), el("small", j.status));
      b.addEventListener("click", () => { job = j; imgFor = ""; render(); poll(); });
      li.append(b); $.jobs.append(li);
    });
  };
  let recent = [];
  const upsert = j => { recent = [j, ...recent.filter(x => x.id !== j.id)]; renderJobs(recent); };

  const stopPoll = () => { clearTimeout(timer); timer = null; };
  const poll = () => {
    stopPoll(); clearInterval(tick); tick = null;
    if (!job || !ACTIVE.includes(job.status)) return;
    tick = setInterval(updateElapsed, 1000);
    const run = async () => {
      if (document.hidden || !job || !ACTIVE.includes(job.status)) return;
      const id = job.id;
      try {
        const d = await api(`${base}/${encodeURIComponent(id)}`);
        if (job && job.id === id && d.job) { job = d.job; upsert(job); render(); }
      } catch {}
      if (job && ACTIVE.includes(job.status)) timer = setTimeout(run, 2500); else { clearInterval(tick); tick = null; refresh(); }
    };
    timer = setTimeout(run, 2000);
  };
  document.addEventListener("visibilitychange", () => { if (!document.hidden && job && ACTIVE.includes(job.status)) { updateElapsed(); poll(); } else stopPoll(); });

  const load = async () => {
    if (preview) return;
    try { await loadState(); } catch (e) { $.status.textContent = "Availability could not be loaded. " + e.message; $.ra.hidden = false; $.save.hidden = true; $.retry.hidden = true; return; }
  };
  const loadState = async () => {
    const d = await api(base);
    state = { ...state, ...d, placements: Array.isArray(d.placements) ? d.placements : [] };
    const keep = $.place.value;
    $.place.replaceChildren(el("option", "Choose a placement", { value: "" }));
    state.placements.forEach(p => $.place.append(el("option", `${p.title} (${p.width} x ${p.height})`, { value: p.id })));
    $.place.value = keep;
    if (preview) $.status.textContent = "Read-only preview. Generation is disabled.";
    else if (!state.available) $.status.textContent = state.reason || "Image generation is not available right now.";
    else if (!state.can_generate) $.status.textContent = state.reason || "Your trial generations are used up.";
    else $.status.textContent = state.remaining != null ? `Controlled trial: ${state.remaining} generation${state.remaining === 1 ? "" : "s"} remaining. No charge.` : "Controlled trial: no charge.";
    recent = Array.isArray(d.jobs) ? d.jobs : [];
    renderJobs(recent);
    if (!job) { const a = recent.find(j => ACTIVE.includes(j.status)) || recent[0]; if (a && !preview) { job = a; if (a.placement_id && !$.place.value) $.place.value = a.placement_id; render(); poll(); } }
    refresh();
  };

  $.form.addEventListener("submit", async e => {
    e.preventDefault();
    if ($.gen.disabled) return;
    const body = { placement_id: $.place.value, prompt: $.prompt.value.trim(), reference_id: ref ? ref.id : null };
    const key = JSON.stringify(body);
    if (!requestId || key !== requestKey) { requestId = uuid(); requestKey = key; }
    body.request_id = requestId; busy = true; setErr(""); refresh();
    $.gen.textContent = "Starting...";
    try {
      const d = await api(base, { method: "POST", body });
      job = d.job; upsert(job); imgFor = ""; requestId = null; render(); poll();
      if (state.remaining != null && state.remaining > 0) state.remaining -= 1;
    } catch (er) { setErr(er.status ? er.message : "Network problem. Nothing is retried automatically. Press Generate again to resend the same request safely."); }
    busy = false; $.gen.textContent = "Generate image"; refresh();
  });
  $.place.addEventListener("change", refresh);
  $.prompt.addEventListener("input", refresh);
  $.check.addEventListener("click", async () => {
    $.check.disabled = true;
    try {
      if (job) { const d = await api(`${base}/${encodeURIComponent(job.id)}`); if (d.job) { job = d.job; upsert(job); } render(); poll(); }
      else if (!loaded || !state.available) await loadState();
      else await loadState();
    } catch (e) { $.status.textContent = "Could not refresh. " + e.message; }
    $.check.disabled = false; refresh();
  });
  $.retry.addEventListener("click", () => { $.prompt.focus(); setErr(""); });
  $.save.addEventListener("click", async () => {
    if (!job || job.status !== "ready" || saving) return;
    saving = true; render(); $.smsg.replaceChildren();
    try {
      const d = await api(`${base}/${encodeURIComponent(job.id)}/save`, { method: "POST", body: {} });
      if (d.job) { job = d.job; upsert(job); }
      const a = el("a", "View in Your media", { href: location.pathname + "?tab=library" }); const s = safeUrl(d.media && d.media.url);
      $.smsg.append(el("span", "Saved to your library. "), a);
      if (s) a.dataset.mediaUrl = s;
    } catch (er) { $.smsg.textContent = "Save failed. " + er.message; }
    saving = false; render();
  });

  const setRef = r => {
    ref = r;
    $.refSel.querySelector("span").textContent = r ? r.filename || "Untitled file" : "No reference selected";
    $.refClear.hidden = !r; refresh();
  };
  $.refClear.addEventListener("click", () => setRef(null));
  const OK = ["image/png", "image/jpeg", "image/webp"];
  const loadRefs = async () => {
    $.refMsg.textContent = "Loading images..."; $.refGrid.replaceChildren();
    try {
      const p = new URLSearchParams({ type: "image", offset: String(refOffset) }); const t = $.refQ.value.trim(); if (t) p.set("q", t);
      const d = await api(`${lib}?${p}`);
      refLimit = d.limit || refLimit; refTotal = d.total || 0; refMore = d.has_more === true;
      const items = (d.items || []).filter(i => OK.includes(String(i.content_type || "").toLowerCase()) && safeUrl(i.url) && Number(i.size_bytes) > 0 && Number(i.size_bytes) <= 4194304 && Number(i.width) > 0 && Number(i.height) > 0 && Number(i.width) * Number(i.height) <= 4000000);
      $.refMsg.textContent = items.length ? "" : "No eligible images on this page. References must be PNG, JPEG or WebP, up to 4 MB and 4 megapixels.";
      items.forEach(i => {
        const li = el("li"); const on = ref && ref.id === i.id;
        const b = el("button", null, { type: "button", class: "mig-ref", "aria-pressed": String(!!on) });
        b.append(el("img", null, { src: safeUrl(i.url), alt: "", loading: "lazy" }), el("span", i.filename || "Untitled file"));
        b.addEventListener("click", () => { setRef(i); $.refGrid.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); });
        li.append(b); $.refGrid.append(li);
      });
      $.refPage.textContent = `${refTotal ? refOffset + 1 : 0} to ${refOffset + (d.items || []).length} of ${refTotal}`;
    } catch (e) { $.refMsg.textContent = "Could not load media. " + e.message; }
    $.refPrev.disabled = refOffset <= 0; $.refNext.disabled = !refMore;
  };
  $.refToggle.addEventListener("click", () => {
    const open = $.refPanel.hidden; $.refPanel.hidden = !open; $.refToggle.setAttribute("aria-expanded", String(open));
    if (open && !$.refGrid.children.length) loadRefs();
  });
  $.refSearch.addEventListener("click", () => { refOffset = 0; loadRefs(); });
  $.refQ.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); refOffset = 0; loadRefs(); } });
  $.refPrev.addEventListener("click", () => { refOffset = Math.max(0, refOffset - refLimit); loadRefs(); });
  $.refNext.addEventListener("click", () => { refOffset += refLimit; loadRefs(); });

  const panel = root.closest("[data-panel]");
  const maybeLoad = () => { if (loaded || (panel && panel.hidden)) return; loaded = true; load(); };
  if (panel) { new MutationObserver(maybeLoad).observe(panel, { attributes: true, attributeFilter: ["hidden"] }); }
  maybeLoad();
  window.addEventListener("pagehide", clearBlob);
}
