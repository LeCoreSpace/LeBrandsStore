import {registerLeaveGuard} from "./catalogue-confirm.js";
import { MEDIA_LIMITS as L, formatBytes, validateFile, validateDimensions, layoutImage, renderCrop, encodeWebp, webmSupport } from "./product-media-processing.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const safeUrl = v => { try { const u = new URL(String(v || ""), location.href); return ["https:", "http:", "blob:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } };

function openDialog(html, label) {
  const dlg = document.createElement("dialog");
  dlg.className = "lb-media-dialog"; dlg.setAttribute("aria-label", label); dlg.innerHTML = html;
  document.body.append(dlg); dlg.showModal();
  return dlg;
}
function confirmDialog(title, message, confirmLabel) {
  return new Promise(resolve => {
    const dlg = openDialog(`<div><h2>${esc(title)}</h2><p>${esc(message)}</p><div class="lb-media-foot"><button type="button" data-no>Keep it</button><button type="button" data-primary data-yes>${esc(confirmLabel)}</button></div></div>`, title);
    const done = v => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.querySelector("[data-no]").addEventListener("click", () => done(false));
    dlg.querySelector("[data-yes]").addEventListener("click", () => done(true));
    dlg.addEventListener("cancel", e => { e.preventDefault(); done(false); });
    dlg.querySelector("[data-no]").focus();
  });
}

export function attachProductMediaEditor({ form, api, request, notify, onPendingChange = () => {} }) {
  const section = form?.querySelector(".lb-image-editor");
  const grid = form?.querySelector("[data-images]");
  if (!section || !grid) return null;
  const input = section.querySelector("[data-media-input]");
  const addButton = section.querySelector("[data-media-add]");
  const queueNode = document.createElement("ul"); queueNode.className = "lb-media-queue"; queueNode.setAttribute("aria-label", "Media in progress");
  const live = document.createElement("p"); live.className = "lb-sr-only"; live.setAttribute("role", "status"); live.setAttribute("aria-live", "polite");
  grid.after(queueNode); grid.before(live);
  let replaceTarget = null;
  const replaceInput = document.createElement("input");
  replaceInput.dataset.mediaReplaceInput = "";
  replaceInput.type = "file"; replaceInput.hidden = true; replaceInput.accept = "image/png,image/jpeg,image/webp,video/mp4,video/webm";
  section.append(replaceInput);
  const items = []; // queue rows: staging | uploading | failed
  let seq = 0, chain = Promise.resolve();
  const cards = () => [...grid.querySelectorAll("[data-image-id]")];
  const typeOf = c => c.dataset.mediaType === "video" ? "video" : "image";
  const say = t => { live.textContent = t; };

  function reportPending() {
    onPendingChange(items.length);
    const uploading = items.some(i => i.state === "uploading");
    if (uploading) section.dataset.uploadState = "uploading"; else delete section.dataset.uploadState;
    if (addButton) addButton.disabled = false;
  }
  function changed() {
    refresh();
    form.dispatchEvent(new Event("input", { bubbles: true }));
    form.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ---------- cards ----------
  function actionsHtml() {
    return `<div class="lb-media-actions" role="group" aria-label="Order and cover"><button type="button" data-media-move="-1">Move earlier</button><button type="button" data-media-move="1">Move later</button><button type="button" data-media-cover>Make cover</button><button type="button" data-media-replace>Replace</button></div>`;
  }
  function ensure(card) {
    if (card.dataset.mediaReady) return;
    card.dataset.mediaReady = "1";
    const type = typeOf(card), url = safeUrl(card.dataset.mediaUrl);
    let slot = card.querySelector(".lb-media-slot");
    if (!slot) { slot = document.createElement("div"); slot.className = "lb-media-slot"; card.prepend(slot); const legacy = card.querySelector(":scope > img"); if (legacy) slot.append(legacy); }
    if (type === "video" && !slot.querySelector("video")) {
      slot.replaceChildren();
      if (url) { const v = document.createElement("video"); v.src = url; v.controls = true; v.preload = "metadata"; v.playsInline = true; v.setAttribute("playsinline", ""); slot.append(v); }
    } else if (type === "image" && !slot.querySelector("img") && url) {
      const img = document.createElement("img"); img.src = url; img.alt = card.querySelector("[data-image-alt]")?.value || ""; slot.append(img);
    }
    if (!slot.querySelector(".lb-media-badges")) { const b = document.createElement("div"); b.className = "lb-media-badges"; slot.append(b); }
    const cap = card.querySelector("figcaption");
    if (cap && !cap.querySelector(".lb-media-actions")) cap.insertAdjacentHTML("afterbegin", actionsHtml());
    const rm = card.querySelector("[data-image-remove]"); if (rm) rm.classList.add("lb-text-button");
  }
  function buildCard(media) {
    const fig = document.createElement("figure");
    fig.className = "lb-image-card"; fig.dataset.imageId = media.id; fig.dataset.mediaType = media.type === "video" ? "video" : "image"; fig.dataset.mediaUrl = media.url;
    fig.innerHTML = `<div class="lb-media-slot"></div><figcaption><label>Alt text<input value="${esc(media.alt || "")}" maxlength="200" data-image-alt></label><button type="button" class="lb-text-button" data-image-remove>Remove</button></figcaption>`;
    ensure(fig); return fig;
  }
  function refresh() {
    const all = cards();
    all.forEach(ensure);
    all.forEach((c, i) => {
      const next = all[i + 1], prev = all[i - 1], type = typeOf(c), label = c.querySelector("[data-image-alt]")?.value || `item ${i + 1}`;
      const [pb, nb] = c.querySelectorAll("[data-media-move]"), cover = c.querySelector("[data-media-cover]"), rm = c.querySelector("[data-image-remove]");
      if (pb) { pb.disabled = i === 0 || (i === 1 && type === "video"); pb.setAttribute("aria-label", `Move ${label} earlier, position ${i + 1} of ${all.length}`); }
      if (nb) { nb.disabled = !next || (i === 0 && typeOf(next) === "video"); nb.setAttribute("aria-label", `Move ${label} later, position ${i + 1} of ${all.length}`); }
      const rp = c.querySelector("[data-media-replace]");
      if (rp) { rp.disabled = items.some(x => x.replace === c); rp.setAttribute("aria-label", `Replace ${label}, keeps its position`); }
      if (cover) { cover.hidden = type === "video" || i === 0; cover.setAttribute("aria-label", `Make ${label} the cover`); }
      if (rm) rm.disabled = i === 0 && !!next && typeOf(next) === "video" && !all.slice(1).some(x => typeOf(x) === "image");
      const badges = c.querySelector(".lb-media-badges");
      if (badges) badges.innerHTML = `${i === 0 ? '<span class="lb-media-badge">Cover</span>' : ""}${type === "video" ? '<span class="lb-media-badge">Video</span>' : ""}`;
      void prev;
    });
    const count = section.querySelector("[data-media-count]");
    if (count) count.textContent = `${all.length} of ${L.maxAssets} added`;
  }
  function move(card, to, focusSel) {
    const all = cards(), from = all.indexOf(card);
    to = Math.max(0, Math.min(all.length - 1, to));
    if (from < 0 || to === from) return;
    const test = all.filter(c => c !== card); test.splice(to, 0, card);
    if (typeOf(test[0]) === "video") { notify("A video cannot be the first item. The cover must be an image.", true); return; }
    if (to > from) all[to].after(card); else all[to].before(card);
    changed(); say(`Moved to position ${to + 1} of ${all.length}.`);
    card.querySelector(focusSel)?.focus();
  }
  form.addEventListener("click", async event => {
    const card = event.target.closest("[data-image-id]");
    if (!card || !grid.contains(card)) return;
    const mv = event.target.closest("[data-media-move]");
    if (mv && !mv.disabled) { const d = Number(mv.dataset.mediaMove); move(card, cards().indexOf(card) + d, `[data-media-move="${d}"]`); return; }
    const rpb = event.target.closest("[data-media-replace]");
    if (rpb) { if (!rpb.disabled) { replaceTarget = card; replaceInput.click(); } return; }
    if (event.target.closest("[data-media-cover]")) { move(card, 0, "[data-media-cover]"); return; }
    const rm = event.target.closest("[data-image-remove]");
    if (rm) {
      event.preventDefault();
      const ok = await confirmDialog("Remove this media?", "It is removed from the product when you save. The file is not deleted from your media library.", "Remove");
      if (!ok || !card.isConnected) return;
      const next = card.nextElementSibling || card.previousElementSibling;
      const rest = cards().filter(c => c !== card);
      if (rest.length && typeOf(rest[0]) === "video") {
        const img = rest.find(c => typeOf(c) === "image");
        if (!img) { notify("Keep at least one image first. The cover cannot be a video.", true); return; }
        rest[0].before(img);
      }
      card.remove(); changed(); say("Media removed."); (next?.querySelector("[data-image-remove]") || addButton)?.focus();
    }
  });
  grid.addEventListener("keydown", event => {
    if (!event.altKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const card = event.target.closest("[data-image-id]"); if (!card) return;
    event.preventDefault();
    const d = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
    move(card, cards().indexOf(card) + d, `[data-media-move="${d}"]`);
  });
  grid.addEventListener("input", event => {
    if (event.target.matches("[data-image-alt]")) { const img = event.target.closest("[data-image-id]")?.querySelector(".lb-media-slot img"); if (img) img.alt = event.target.value; }
  });

  // ---------- queue rows ----------
  function paintQueue() {
    queueNode.innerHTML = items.map(i => `<li data-state="${i.state}" data-item="${i.id}"><span class="grow"><strong>${i.replace ? "Replacing: " : ""}${esc(i.label)}</strong><br>${i.state === "failed" ? `<span class="lb-media-err">${esc(i.error || "Upload failed.")} Not uploaded.</span>` : i.state === "uploading" ? `Uploading ${formatBytes(i.blob.size)}…` : "Waiting for your confirmation…"}</span>${i.state === "failed" ? `<button type="button" data-retry>Retry upload</button><button type="button" data-discard>Discard</button>` : ""}${i.state === "uploading" ? '<span class="lb-media-bar" aria-hidden="true"><i></i></span>' : ""}</li>`).join("");
    reportPending();
  }
  queueNode.addEventListener("click", event => {
    const li = event.target.closest("[data-item]"); const item = li && items.find(i => String(i.id) === li.dataset.item); if (!item) return;
    if (event.target.closest("[data-discard]")) { items.splice(items.indexOf(item), 1); paintQueue(); say("Discarded. Nothing was uploaded."); }
    else if (event.target.closest("[data-retry]")) upload(item);
  });
  async function upload(item) {
    if (item.state === "uploading") return;
    item.state = "uploading"; item.error = ""; paintQueue();
    try {
      const body = new FormData();
      body.append("file", item.blob, item.name); body.append("type", item.type); body.append("alt", item.alt);
      const result = await request(`${api}/media`, { method: "POST", body });
      const media = result?.media;
      if (!media?.id || !media?.url) throw new Error("The upload did not return usable media.");
      if (item.type === "video" && cards().length === 0) throw new Error("Add an image first. The cover must be an image.");
      const fresh = { ...media, type: media.type || item.type, alt: media.alt ?? item.alt };
      if (item.replace) {
        const old = item.replace;
        if (!old.isConnected) {
          items.splice(items.indexOf(item), 1); paintQueue();
          notify(`${item.label} uploaded to your library, but the original was removed first, so it was not attached.`, true); return;
        }
        if (cards().indexOf(old) === 0 && fresh.type === "video") throw new Error("The cover must be an image. The original was kept.");
        const node = buildCard(fresh); old.replaceWith(node);
        items.splice(items.indexOf(item), 1); paintQueue(); changed();
        node.querySelector("[data-media-replace]")?.focus();
        say(`${item.label} replaced the original. Save the product to keep it.`);
        notify(`${item.label} replaced the original. Save the product to keep it.`); return;
      }
      grid.append(buildCard(fresh));
      items.splice(items.indexOf(item), 1); paintQueue(); changed();
      say(`${item.label} uploaded. Save the product to keep it.`);
      notify(`${item.label} uploaded. Save the product to keep it.`);
    } catch (error) {
      item.state = "failed"; item.error = error?.message || "Upload failed."; paintQueue();
      notify(`${item.label} was not uploaded. ${item.error}`, true);
    }
  }

  // ---------- image staging ----------
  async function stageImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.src = url;
      try { await img.decode(); } catch { throw new Error(`${file.name} could not be decoded as an image.`); }
      const bad = validateDimensions(img.naturalWidth, img.naturalHeight);
      if (bad) throw new Error(`${file.name}: ${bad}`);
      return await new Promise(resolve => {
        const VW = 320, VH = 400, iw = img.naturalWidth, ih = img.naturalHeight;
        const st = { fit: false, zoom: 1, ox: 0, oy: 0 };
        const base = file.name.replace(/\.[^.]+$/, "").slice(0, 120);
        const dlg = openDialog(`<form><h2>Frame the 4:5 image</h2><p>${esc(file.name)}, ${iw} by ${ih} px. Drag to pan, or focus the frame and use arrow keys. Output is WebP up to ${L.outW} by ${L.outH}, never enlarged.</p>
          <div class="lb-media-frame" tabindex="0" role="group" aria-label="Crop preview. Arrow keys pan, plus and minus zoom."><canvas width="${VW}" height="${VH}"></canvas></div>
          <div class="lb-media-controls"><label>Zoom <input type="range" min="1" max="4" step="0.01" value="1" data-zoom></label><label><input type="checkbox" data-fit> Fit without crop (white padding)</label></div>
          <label class="lb-field">Alt text<input data-alt maxlength="200" value="${esc(base)}"></label><p class="lb-media-err" data-err role="alert" hidden></p>
          <div class="lb-media-foot"><button type="button" data-cancel>Cancel</button><button type="submit" data-primary>Use this and upload</button></div></form>`, "Crop image");
        const frame = dlg.querySelector(".lb-media-frame"), cv = dlg.querySelector("canvas"), ctx = cv.getContext("2d");
        const zoom = dlg.querySelector("[data-zoom]"), fit = dlg.querySelector("[data-fit]");
        const draw = () => { const l = layoutImage(iw, ih, VW, VH, st); st.ox = l.ox; st.oy = l.oy; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, VW, VH); ctx.drawImage(img, l.x, l.y, l.dw, l.dh); zoom.disabled = st.fit; };
        let drag = null; const kx = () => frame.clientWidth ? VW / frame.clientWidth : 1;
        frame.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, ox: st.ox, oy: st.oy }; frame.setPointerCapture(e.pointerId); frame.style.cursor = "grabbing"; });
        frame.addEventListener("pointermove", e => { if (!drag || st.fit) return; st.ox = drag.ox + (e.clientX - drag.x) * kx(); st.oy = drag.oy + (e.clientY - drag.y) * kx(); draw(); });
        const end = () => { drag = null; frame.style.cursor = ""; }; frame.addEventListener("pointerup", end); frame.addEventListener("pointercancel", end);
        frame.addEventListener("keydown", e => {
          const s = e.shiftKey ? 30 : 10, k = { ArrowLeft: [s, 0], ArrowRight: [-s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] }[e.key];
          if (k) { e.preventDefault(); st.ox += k[0]; st.oy += k[1]; draw(); }
          else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoom.value = Math.min(4, +zoom.value + .1); zoom.dispatchEvent(new Event("input")); }
          else if (e.key === "-") { e.preventDefault(); zoom.value = Math.max(1, +zoom.value - .1); zoom.dispatchEvent(new Event("input")); }
        });
        zoom.addEventListener("input", () => { st.zoom = +zoom.value; draw(); });
        fit.addEventListener("change", () => { st.fit = fit.checked; draw(); });
        const finish = v => { dlg.close(); dlg.remove(); resolve(v); };
        dlg.querySelector("[data-cancel]").addEventListener("click", () => finish(null));
        dlg.addEventListener("cancel", e => { e.preventDefault(); finish(null); });
        dlg.querySelector("form").addEventListener("submit", async e => {
          e.preventDefault();
          const btn = dlg.querySelector("[data-primary]"), err = dlg.querySelector("[data-err]"); btn.disabled = true; btn.textContent = "Encoding…"; err.hidden = true;
          try {
            const out = await encodeWebp(renderCrop(img, iw, ih, VW, VH, st));
            const ext = out.webp ? "webp" : "png";
            if (!out.webp) notify("This browser cannot write WebP. The framed image is uploaded as PNG instead.");
            finish({ blob: out.blob, name: `${base || "image"}.${ext}`, alt: dlg.querySelector("[data-alt]").value.trim() });
          } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; btn.textContent = "Use this and upload"; }
        });
        draw(); frame.focus();
      });
    } finally { URL.revokeObjectURL(url); }
  }

  // ---------- video staging ----------
  function probe(url) {
    return new Promise((resolve, reject) => {
      const v = document.createElement("video"); v.preload = "metadata";
      const finish=(meta,error)=>{clearTimeout(timeout);v.onloadedmetadata=null;v.onerror=null;v.removeAttribute("src");v.load();error?reject(error):resolve(meta);};
      const timeout=setTimeout(()=>finish(null,new Error("Video preview timed out.")),8000);
      v.onloadedmetadata = () => finish({ duration: v.duration, w: v.videoWidth, h: v.videoHeight });
      v.onerror = () => finish(null,new Error("This browser cannot decode the video."));
      v.src = url;
    });
  }
  const audioFail = () => Object.assign(new Error("Audio could not be processed in this browser, so the video was not converted. Upload the original instead."), { audio: true });
  async function convertWebm(url, mime, onProgress, signal, audioCtx) {
    const v = document.createElement("video");
    v.playsInline = true; v.preload = "auto";
    let cancelled = false, rec = null, timer = 0;
    const tracks = [];
    const onAbort = () => { cancelled = true; if (rec && rec.state !== "inactive") rec.stop(); };
    signal.addEventListener("abort", onAbort);
    const cleanup = () => {
      clearInterval(timer); v.ontimeupdate = null; v.onended = null; try { v.pause(); } catch { /* ignore */ }
      tracks.forEach(t => { try { t.stop(); } catch { /* ignore */ } });
      try { audioCtx.close(); } catch { /* ignore */ }
      signal.removeEventListener("abort", onAbort);
      v.removeAttribute("src"); v.load();
    };
    const cancelErr = () => Object.assign(new Error("Conversion cancelled."), { cancelled: true });
    try {
      if (!audioCtx || !HTMLCanvasElement.prototype.captureStream) throw audioCtx ? new Error("This browser cannot record canvas video, so the video was not converted. Upload the original instead.") : audioFail();
      await new Promise((res, rej) => {
        let ok = false; const done = () => { if (!ok) { ok = true; res(); } };
        v.addEventListener("loadeddata", done, { once: true }); v.addEventListener("canplay", done, { once: true });
        v.onerror = () => rej(new Error("The video could not be decoded for conversion."));
        v.src = url;
      });
      if (cancelled) throw cancelErr();
      const duration = v.duration, trimmed = Number.isFinite(duration)&&duration > L.maxVideoSeconds, limit = Math.min(duration || L.maxVideoSeconds, L.maxVideoSeconds);
      const vw = v.videoWidth, vh = v.videoHeight;
      if (!vw || !vh) throw new Error("The video has no readable picture.");
      // Fit without crop onto a 4:5 canvas, never above 720x900 and never upscaled.
      const s = Math.min(720 / vw, 900 / vh, 1);
      const cw = Math.min(720,Math.max(8,Math.ceil(Math.max(vw*s,vh*s*.8)/8)*8));
      const ch = cw * 1.25;
      const canvas = document.createElement("canvas"); canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext("2d");
      const dw = vw * s, dh = vh * s;
      const paint = () => { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cw, ch); ctx.drawImage(v, (cw - dw) / 2, (ch - dh) / 2, dw, dh); };
      let dest;
      try {
        const src = audioCtx.createMediaElementSource(v);
        dest = audioCtx.createMediaStreamDestination(); src.connect(dest);
        await audioCtx.resume();
      } catch { throw audioFail(); }
      if (audioCtx.state !== "running" || !dest.stream.getAudioTracks().length) throw audioFail();
      if(cancelled||signal.aborted)throw cancelErr();
      paint();
      const stream = canvas.captureStream(30);
      dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
      tracks.push(...stream.getTracks(), ...dest.stream.getTracks());
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1800000, audioBitsPerSecond: 96000 });
      const chunks = []; rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      return await new Promise((resolve, reject) => {
        let failure = null, last = Date.now(), stopping=false;
        const stopRec = err => { if (err && !failure) failure = err; if(stopping)return;stopping=true;if (rec.state !== "inactive") rec.stop(); };
        rec.onstop = () => cancelled ? reject(cancelErr()) : failure ? reject(failure) : resolve({ blob: new Blob(chunks, { type: "video/webm" }), trimmed, audioNote: "Audio was captured from the source; a clip with no sound stays silent." });
        rec.onerror = () => stopRec(new Error("The browser encoder failed."));
        timer = setInterval(() => {
          paint();
          if (Date.now() - last > 15000) stopRec(new Error("Conversion stalled."));
        }, 33);
        v.ontimeupdate = () => { last = Date.now(); onProgress(Math.min(1, v.currentTime / limit)); if (v.currentTime >= limit) stopRec(); };
        v.onended = () => stopRec();
        rec.start(500);
        v.play().catch(() => stopRec(new Error("The browser blocked playback needed for conversion.")));
      });
    } finally { cleanup(); }
  }
  async function stageVideo(file) {
    const originalUrl = URL.createObjectURL(file); let convertedUrl = "";
    try {
      let meta=null; try { meta = await probe(originalUrl); } catch { /* A valid original can still be uploaded when this browser lacks its decoder. */ }
      const mime = meta ? webmSupport() : "", long = Number.isFinite(meta?.duration)&&meta.duration > L.maxVideoSeconds;
      return await new Promise(resolve => {
        const dlg = openDialog(`<div><h2>Prepare video</h2><p>${esc(file.name)}, ${formatBytes(file.size)}${Number.isFinite(meta?.duration)?`, ${Math.round(meta.duration)} seconds`:"; duration unavailable"}. Short clips under ${L.maxVideoSeconds} seconds work best.</p>
          ${meta?`<video controls preload="metadata" playsinline data-pv src="${originalUrl}"></video>`:'<p role="status">This browser cannot preview or convert this video. You can upload the original; its file format and size will still be validated.</p>'}
          <p data-info>${mime ? `Conversion to WebM runs in your browser in real time. ${long ? `This clip is longer than ${L.maxVideoSeconds} seconds, so only the first ${L.maxVideoSeconds} seconds are converted. ` : ""}Audio is kept when the source has an audio track. The result must stay under 10 MB.` : "This browser cannot convert video. The original file can be uploaded as it is, without conversion."} Duration is not checked by the server.</p>
          <p class="lb-media-err" data-err role="alert" hidden></p><p data-progress role="status" hidden></p>
          <label class="lb-field">Alt text<input data-alt maxlength="200" value="${esc(file.name.replace(/\.[^.]+$/, ""))}"></label>
          <div class="lb-media-foot"><button type="button" data-cancel>Cancel</button>${mime ? "<button type=\"button\" data-convert>Convert to WebM</button>" : ""}<button type="button" data-primary data-original>Upload original ${file.type === "video/webm" ? "WebM" : "MP4"} (not converted)</button></div></div>`, "Prepare video");
        const q = s => dlg.querySelector(s); let ctl = null, converted = null;
        const finish = v => { ctl?.abort(); dlg.close(); dlg.remove(); resolve(v); };
        const err = t => { q("[data-err]").textContent = t; q("[data-err]").hidden = !t; };
        const alt = () => q("[data-alt]").value.trim();
        q("[data-cancel]").addEventListener("click", () => finish(null));
        dlg.addEventListener("cancel", e => { e.preventDefault(); finish(null); });
        q("[data-original]").addEventListener("click", () => finish({ blob: file, name: file.name, alt: alt() }));
        q("[data-convert]")?.addEventListener("click", async e => {
          if (converted) { finish({ blob: converted, name: file.name.replace(/\.[^.]+$/, "") + ".webm", alt: alt() }); return; }
          const btn = e.currentTarget; err(""); btn.disabled = true; ctl = new AbortController();
          const AC = window.AudioContext || window.webkitAudioContext; let actx = null;
          try { actx = AC ? new AC() : null; actx?.resume?.().catch(() => {}); } catch { actx = null; }
          const prog = q("[data-progress]"); prog.hidden = false; prog.textContent = "Converting, 0%. Keep this dialog open.";
          q("[data-cancel]").textContent = "Cancel conversion";
          try {
            const out = await convertWebm(originalUrl, mime, p => { if (dlg.isConnected) prog.textContent = `Converting, ${Math.round(p * 100)}%. Keep this dialog open.`; }, ctl.signal, actx);
            if (!dlg.isConnected) return;
            if (!out.blob.size) throw new Error("The encoder produced an empty file.");
            if (out.blob.size > L.maxBytes) throw new Error(`The converted WebM is ${formatBytes(out.blob.size)}, over the 10 MB limit.${file.size <= L.maxBytes ? " You can upload the original instead." : ""}`);
            converted = out.blob; convertedUrl = URL.createObjectURL(converted);
            q("[data-pv]").src = convertedUrl; prog.textContent = `Converted to WebM, ${formatBytes(converted.size)}, 4:5 with the full frame kept. ${out.audioNote}${out.trimmed ? ` Trimmed to the first ${L.maxVideoSeconds} seconds.` : ""} Preview above is the converted file.`;
            btn.textContent = "Upload converted WebM"; btn.dataset.primary = ""; btn.disabled = false; q("[data-cancel]").textContent = "Cancel";
          } catch (x) {
            if (!dlg.isConnected) return;
            if (!x.cancelled) { err(x.message || "Conversion failed."); prog.hidden = true; }
            else prog.textContent = "Conversion cancelled. Nothing was uploaded.";
            btn.disabled = false; q("[data-cancel]").textContent = "Cancel"; ctl = null;
          }
        });
        q("[data-cancel]").focus();
      });
    } finally { URL.revokeObjectURL(originalUrl); if (convertedUrl) URL.revokeObjectURL(convertedUrl); }
  }

  // ---------- selection ----------
  async function handle(file, old = null) {
    const check = validateFile(file);
    if (!check.ok) { notify(check.error, true); return; }
    if (old && !old.isConnected) { notify("That item was removed. Nothing was replaced.", true); return; }
    if (old && cards().indexOf(old) === 0 && check.type === "video") { notify("The cover must stay an image. Choose an image to replace it.", true); return; }
    if (!old && cards().length + items.filter(i => !i.replace).length >= L.maxAssets) { notify("A product can have up to 8 media items.", true); return; }
    if (!old && check.type === "video" && !cards().some(c => typeOf(c) === "image")) { notify(items.length ? "Retry or discard the pending image first. The cover must be an image." : "Add an image first. The first item is the listing cover and must be an image.", true); return; }
    const row = { id: ++seq, label: file.name, state: "staging", blob: file, type: check.type, name: file.name, alt: "", replace: old };
    items.push(row); old && refresh(); paintQueue();
    let staged;
    try { staged = check.type === "image" ? await stageImage(file) : await stageVideo(file); }
    catch (e) { items.splice(items.indexOf(row), 1); paintQueue(); refresh(); notify(e.message || "This file could not be prepared.", true); return; }
    if (!staged) { items.splice(items.indexOf(row), 1); paintQueue(); refresh(); say(`${file.name} cancelled. Nothing was uploaded.`); return; }
    Object.assign(row, { blob: staged.blob, name: staged.name, alt: staged.alt });
    await upload(row); refresh();
  }
  const enqueue = (files, old) => { for (const f of files) chain = chain.then(() => handle(f, old)).catch(e => notify(e?.message || "Media could not be added.", true)); };
  replaceInput.addEventListener("change", () => {
    const f = replaceInput.files?.[0], old = replaceTarget; replaceInput.value = ""; replaceTarget = null;
    if (f && old) enqueue([f], old);
  });
  // Drag and drop: only file drags, never let the browser navigate to a dropped file.
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes("Files");
  let depth = 0;
  window.addEventListener("dragover", e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener("drop", e => { if (hasFiles(e)) e.preventDefault(); });
  section.addEventListener("dragenter", e => { if (!hasFiles(e)) return; e.preventDefault(); if (++depth === 1) { section.classList.add("is-dragover"); say("Drop to add media. JPEG, PNG or WebP images, MP4 or WebM video, 10 MB each. Unsupported files are rejected."); } });
  section.addEventListener("dragover", e => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
  section.addEventListener("dragleave", e => { if (!hasFiles(e)) return; if (--depth <= 0) { depth = 0; section.classList.remove("is-dragover"); } });
  section.addEventListener("drop", e => {
    if (!hasFiles(e)) return; e.preventDefault(); depth = 0; section.classList.remove("is-dragover");
    enqueue([...e.dataTransfer.files]);
  });
  addButton?.addEventListener("click", () => input?.click());
  input?.addEventListener("change", () => { const files = [...(input.files || [])]; input.value = ""; enqueue(files); });
  registerLeaveGuard(()=>items.length);
  refresh(); reportPending();
  return { refresh, pending: () => items.length };
}
