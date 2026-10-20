/** Pointer + keyboard reordering between section rows. Pure helpers first, DOM controller below. */
export const DRAG_THRESHOLD = 5;
/** Slot (0..n) whose insertion point is nearest the pointer, from row midpoints. */
export const slotFromY = (mids, y) => mids.filter(m => m < y).length;
/** Order after moving id into slot (slot counts positions in the ORIGINAL order). */
export function moveToSlot(order, id, slot) {
  const i = order.indexOf(id); if (i < 0 || slot < 0 || slot > order.length) return null;
  const to = slot > i ? slot - 1 : slot; if (to === i) return null;
  const next = order.filter(x => x !== id); next.splice(to, 0, id); return next;
}
/** A move is valid when the item is movable and every locked item keeps its index. */
export function validMove(order, id, slot, locked = () => false) {
  if (locked(id)) return null;
  const next = moveToSlot(order, id, slot); if (!next) return null;
  return order.every((x, i) => !locked(x) || next[i] === x) ? next : null;
}
/** Nearest valid slot from `slot` moving in dir (-1 or 1); null when none. */
export function stepSlot(order, id, slot, dir, locked) {
  for (let s = slot + dir; s >= 0 && s <= order.length; s += dir) if (validMove(order, id, s, locked)) return s;
  return null;
}
const reduced = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

export function attachSectionDrag(o) {
  const root = o.root, doc = root.ownerDocument || document, win = doc.defaultView || window;
  const rows = () => [...root.querySelectorAll("[data-sec-row]")];
  const say = t => o.announce?.(t);
  let s = null; // active session
  function cleanup() {
    if (!s) return;
    const x = s; s = null;
    cancelAnimationFrame(x.raf); x.ghost?.remove(); x.line?.remove();
    x.row?.classList.remove("is-dragging", "is-grabbed"); x.list?.classList.remove("is-sorting");
    doc.removeEventListener("pointermove", x.move); doc.removeEventListener("pointerup", x.up); doc.removeEventListener("pointercancel", x.cancel);
    doc.removeEventListener("keydown", x.key, true); x.handle?.removeEventListener("lostpointercapture", x.cancel);
    try { x.handle?.releasePointerCapture?.(x.pid); } catch { /* released */ }
  }
  function flip(before) {
    if (reduced()) return;
    const moved = [];
    for (const r of rows()) { const b = before.get(r.dataset.secRow); if (!b) continue; const dy = b - r.getBoundingClientRect().top; if (Math.abs(dy) > 1) { r.style.transition = "none"; r.style.transform = `translate3d(0,${dy}px,0)`; moved.push(r); } }
    if (!moved.length) return;
    requestAnimationFrame(() => requestAnimationFrame(() => { for (const r of moved) { r.style.transition = "transform .22s cubic-bezier(.2,.8,.2,1)"; r.style.transform = ""; r.addEventListener("transitionend", () => { r.style.transition = ""; }, { once: true }); } }));
  }
  function commit(next, id, focus) {
    const before = new Map(rows().map(r => [r.dataset.secRow, r.getBoundingClientRect().top]));
    let ok = false;
    try { ok = o.canDrag?.() !== false && o.onDrop(next, id) !== false; } catch { ok = false; }
    if (!ok) { say(`${o.label?.(id) || "Section"} could not be moved. Nothing changed.`); return; }
    flip(before);
    if (focus) root.querySelector(`[data-ws-grip="${CSS.escape(id)}"]`)?.focus?.({ preventScroll: true });
    say(`${o.label?.(id) || "Section"} moved to position ${next.indexOf(id) + 1} of ${next.length}. Save draft to keep it.`);
  }
  function lineAt(slot) {
    const rs = rows(); if (!s.line || !rs.length) return;
    const ref = slot < rs.length ? rs[slot] : rs[rs.length - 1], y = (slot < rs.length ? ref.offsetTop : ref.offsetTop + ref.offsetHeight) - 1;
    s.line.style.transform = `translate3d(0,${y}px,0)`; s.line.hidden = false;
  }
  function makeLine(list) { const l = doc.createElement("div"); l.className = "aw-dropline"; l.setAttribute("aria-hidden", "true"); l.hidden = true; list.appendChild(l); return l; }
  function begin(id, handle, mode) {
    const row = handle.closest("[data-sec-row]"), list = row?.parentElement; if (!row || !list || o.locked?.(id)) return null;
    row.classList.add(mode === "key" ? "is-grabbed" : "is-dragging"); list.classList.add("is-sorting");
    return { id, handle, row, list, line: makeLine(list), slot: null, order: o.getOrder() };
  }
  function target(y) {
    const mids = rows().map(r => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; });
    const slot = slotFromY(mids, y), next = validMove(s.order, s.id, slot, o.locked);
    s.slot = next ? slot : null; s.next = next;
    if (next) lineAt(slot); else if (s.line) s.line.hidden = true;
  }
  function scrollLoop() {
    if (!s || s.mode !== "ptr" || !s.started) return;
    const sc = o.scroller?.(); if (sc) { const b = sc.getBoundingClientRect(), z = 48; const v = s.y < b.top + z ? -Math.ceil((b.top + z - s.y) / 4) : s.y > b.bottom - z ? Math.ceil((s.y - (b.bottom - z)) / 4) : 0; if (v) { sc.scrollTop += Math.max(-18, Math.min(18, v)); target(s.y); moveGhost(); } }
    s.raf = requestAnimationFrame(scrollLoop);
  }
  function moveGhost() { if (s.ghost) s.ghost.style.transform = `translate3d(0,${s.y - s.startY}px,0) scale(1.01)`; }

  root.addEventListener("pointerdown", e => {
    const h = e.target.closest?.("[data-ws-grip]"); if (!h || s || o.canDrag?.() === false || (e.button !== undefined && e.button !== 0) || h.disabled) return;
    const id = h.dataset.wsGrip, ses = begin(id, h, "ptr"); if (!ses) return;
    ses.row.classList.remove("is-dragging");
    s = Object.assign(ses, { mode: "ptr", pid: e.pointerId, startX: e.clientX, startY: e.clientY, y: e.clientY, started: false });
    try { h.setPointerCapture?.(e.pointerId); } catch { /* unsupported */ }
    s.move = ev => {
      if (!s || ev.pointerId !== s.pid) return; s.y = ev.clientY;
      if (!s.started) {
        if (Math.hypot(ev.clientX - s.startX, ev.clientY - s.startY) < DRAG_THRESHOLD) return;
        s.started = true; s.row.classList.add("is-dragging");
        const r = s.row.getBoundingClientRect(), g = s.row.cloneNode(true);
        g.classList.add("aw-ghost"); g.removeAttribute("data-sec-row"); Object.assign(g.style, { position: "fixed", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", pointerEvents: "none", margin: "0", zIndex: "1300" });
        doc.body.appendChild(g); s.ghost = g; s.raf = requestAnimationFrame(scrollLoop);
        say("Dragging " + (o.label?.(s.id) || "section") + ".");
      }
      ev.preventDefault(); moveGhost(); target(ev.clientY);
    };
    s.up = ev => {
      if (!s || ev.pointerId !== s.pid) return;
      const { started, next, id: sid } = s; cleanup();
      if (started) { const stop = x => { x.stopPropagation(); x.preventDefault(); }; win.addEventListener("click", stop, true); setTimeout(() => win.removeEventListener("click", stop, true), 60); if (next) commit(next, sid, false); }
    };
    s.cancel = () => { if (s?.started) say("Move cancelled."); cleanup(); };
    s.key = ev => { if (ev.key === "Escape") { ev.preventDefault(); s.cancel(); } };
    doc.addEventListener("pointermove", s.move, { passive: false }); doc.addEventListener("pointerup", s.up); doc.addEventListener("pointercancel", s.cancel);
    doc.addEventListener("keydown", s.key, true); h.addEventListener("lostpointercapture", s.cancel);
  });
  root.addEventListener("keydown", e => {
    const h = e.target.closest?.("[data-ws-grip]"); if (!h) return;
    const id = h.dataset.wsGrip;
    if (s?.mode === "key" && o.canDrag?.() === false) { cleanup(); h.setAttribute("aria-pressed", "false"); say("Editing is unavailable right now."); return; }
    if (s?.mode === "key") {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cleanup(); h.setAttribute("aria-pressed", "false"); say("Move cancelled."); return; }
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); const { next, id: sid } = s; cleanup(); h.setAttribute("aria-pressed", "false"); if (next) commit(next, sid, true); else say("Dropped in the same place."); return; }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault(); const to = stepSlot(s.order, s.id, s.slot, e.key === "ArrowUp" ? -1 : 1, o.locked);
        if (to === null) { say("No further position that way."); return; }
        s.slot = to; s.next = validMove(s.order, s.id, to, o.locked); lineAt(to);
        say(`${o.label?.(s.id) || "Section"} will go to position ${(s.next || s.order).indexOf(s.id) + 1} of ${s.order.length}. Space to drop, Escape to cancel.`);
      }
      return;
    }
    if ((e.key === " " || e.key === "Enter") && !s) {
      if (o.canDrag?.() === false) { e.preventDefault(); say("Editing is unavailable right now."); return; }
      e.preventDefault(); const ses = begin(id, h, "key"); if (!ses) return;
      s = Object.assign(ses, { mode: "key", slot: ses.order.indexOf(id), next: null });
      s.cancel = () => cleanup(); h.setAttribute("aria-pressed", "true"); lineAt(s.slot);
      say(`${o.label?.(id) || "Section"} picked up. Arrow up or down to move, Space to drop, Escape to cancel.`);
    }
  });
  root.addEventListener("focusout", e => { if (s?.mode === "key" && e.target.closest?.("[data-ws-grip]")) { e.target.setAttribute("aria-pressed", "false"); cleanup(); } });
  return { cancel: cleanup, active: () => Boolean(s) };
}
