// Adaptive split for Ann. Only toggles data attributes; never touches panel DOM, focus or iframe srcdoc.
export const ANN_SPLIT = { chat: "chat", preview: "preview" };

export function mountAnnAdaptiveLayout({ app, frame, menu, onChange } = {}) {
  const grid = app?.querySelector(".ann-grid"), chat = app?.querySelector(".ann-chat"), stage = app?.querySelector(".ann-stage");
  if (!app || !grid || !chat || !stage) return { destroy() {}, getState: () => null, setLocked() {}, setFocus() {} };
  const mq = window.matchMedia?.("(max-width:900px)");
  const state = { focus: ANN_SPLIT.chat, locked: false, applied: ANN_SPLIT.chat };
  const cleanups = [];
  let gesture = false, disposed = false, flushTimer, boundDoc, unbindDoc = () => {};
  const on = (t, e, f, o) => { const options=o===true?{capture:true}:o; t.addEventListener(e, f, options); cleanups.push(() => t.removeEventListener(e, f, options)); };
  const narrow = () => !!mq?.matches;

  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "ann-btn alt sm"; btn.setAttribute("data-layout-lock", "");
  btn.setAttribute("aria-pressed", "false"); btn.setAttribute("aria-controls", "ann-app");
  btn.title = "Hold the current conversation and preview widths";
  btn.textContent = "Lock layout";
  (menu || app.querySelector("#ann-more .ann-more-menu"))?.insertBefore(btn, (menu || app.querySelector("#ann-more .ann-more-menu"))?.querySelector("[data-ws-toggle]") || null);

  function apply() {
    if (disposed) return;
    const next = state.locked || gesture ? state.applied : state.focus;
    state.applied = next;
    app.dataset.split = next;
    app.dataset.splitLocked = String(state.locked);
    btn.setAttribute("aria-pressed", String(state.locked));
    const n = narrow();
    btn.hidden = n; btn.disabled = n;
    onChange?.({ ...state });
  }
  // Drag safety: a gesture that starts on a drag handle/draggable/crop target defers resizing until it ends.
  const DRAG = ".aw-grip,[draggable=true],[data-drag-handle],.aw-sec.is-dragging,.aw-ghost";
  const flush = () => { if (gesture) return; apply(); };
  const endGesture = () => { if (!gesture) return; gesture = false; clearTimeout(flushTimer); flushTimer = setTimeout(flush, 0); };
  const startsDrag = e => { const t = e?.target; return !!(t && t.closest && t.closest(DRAG)); };
  const endEvents = ["pointerup", "pointercancel", "dragend", "drop"];
  for (const ev of endEvents) on(window, ev, endGesture, true);
  const beginGesture = e => { if (startsDrag(e)) gesture = true; };
  function setFocus(which) { if (disposed || !Object.values(ANN_SPLIT).includes(which)) return; state.focus = which; if (!state.locked && !gesture) apply(); }
  function setLocked(v) { state.locked = !!v; apply(); }

  // Intentional input only: pointerdown/click and focusin. Never hover/pointermove.
  const bindPanel = (el, which) => {
    on(el, "pointerdown", e => { beginGesture(e); setFocus(which); }, true);
    on(el, "focusin", () => setFocus(which));
  };
  bindPanel(chat, ANN_SPLIT.chat); bindPanel(stage, ANN_SPLIT.preview);
  on(btn, "click", () => setLocked(!state.locked));

  // Same-origin sandboxed iframe: events inside never bubble to the parent, so rebind per document.
  const bindDoc = () => {
    let doc; try { doc = frame?.contentDocument; } catch { return; }
    if (doc === boundDoc) return;
    unbindDoc(); boundDoc = doc;
    if (!doc) return;
    const listeners = [];
    const listen = (event, handler) => { const options={capture:true};doc.addEventListener(event, handler, options); listeners.push(() => doc.removeEventListener(event, handler, options)); };
    unbindDoc = () => listeners.splice(0).forEach(remove => remove());
    const h = () => setFocus(ANN_SPLIT.preview);
    listen("pointerdown", e => { beginGesture(e); h(); });
    for (const ev of endEvents) listen(ev, endGesture);
    listen("focusin", h);
    listen("keydown", h);
    endGesture();
  };
  if (frame) { on(frame, "load", bindDoc); bindDoc(); }
  if (mq?.addEventListener) on(mq, "change", apply);
  apply();

  return {
    getState: () => ({ ...state, gesture }),
    setLocked, setFocus,
    destroy() { disposed = true; clearTimeout(flushTimer); unbindDoc(); cleanups.splice(0).forEach(f => f()); btn.remove(); delete app.dataset.split; delete app.dataset.splitLocked; },
  };
}
