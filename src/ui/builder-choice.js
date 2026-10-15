import { escapeHtml } from "./layout.js";
import { documentPage } from "./dashboard.js";

const esc = escapeHtml;
const MODE_LABELS = { ann: "Build your Store with Ann", standard: "Standard Builder" };

export function renderBuilderChoice(data = {}, user = {}, options = {}) {
  const store = data.store && typeof data.store === "object" ? data.store : {};
  const settings = data.settings && typeof data.settings === "object" ? data.settings : {};
  const id = encodeURIComponent(String(store.store_id || ""));
  const root = `/stores/${id}`;
  const annEnabled = options.annEnabled === true;
  const canChoose = ["owner", "admin"].includes(data.role);
  const saved = MODE_LABELS[settings.builder_mode] ? settings.builder_mode : "";
  const steps = ["Brand basics", "Theme", "Products", "Review and publish"];
  const savedNote = (mode) => saved === mode ? '<span class="bc-saved">Last used</span>' : "";
  const error = options.error ? `<p class="bc-error" role="alert">${esc(options.error)}</p>` : "";
  const body = `<link rel="stylesheet" href="/assets/builder-choice.css">
  <section class="bc" aria-labelledby="bc-title">
    <header class="bc-head">
      <div>
        <h1 id="bc-title">Build your storefront</h1>
        <p>Choose how to set up ${esc(store.name || "your store")}. Both paths reuse your existing drafts and catalogue. Nothing is reset.</p>
        ${saved ? `<p class="bc-current">Current builder: <strong>${esc(MODE_LABELS[saved])}</strong></p>` : ""}
      </div>
      <nav class="bc-links" aria-label="Existing store">
        <a href="${root}/styles">Explore Aura styles</a>
        <a href="${root}/editor">Open editor</a>
        <a href="${root}">Store dashboard</a>
      </nav>
    </header>
    ${error}
    <div class="bc-grid">
      <article class="bc-path" aria-labelledby="bc-ann">
        <div class="bc-top"><h2 id="bc-ann">Build your Store with Ann</h2>${savedNote("ann")}</div>
        <p>Choose a style, plan your collections and describe products with Ann. See your whole store change as you answer, then finish selling settings in the existing setup.</p>
        <p class="bc-status ${annEnabled ? "" : "is-off"}">${annEnabled ? "Interactive preview and saved planning progress are available." : options.error ? "Standard Builder is available while Ann is unavailable." : "Guided builder is not enabled for this store."}</p>
        ${annEnabled && canChoose
          ? `<form method="post" action="${root}/build"><input type="hidden" name="mode" value="ann"><button class="bc-btn" type="submit">Build with Ann</button></form>`
          : `<button class="bc-btn" type="button" disabled aria-disabled="true">Build with Ann</button>`}
      </article>
      <article class="bc-path" aria-labelledby="bc-std">
        <div class="bc-top"><h2 id="bc-std">Standard Builder</h2>${savedNote("standard")}</div>
        <p>Work through each step yourself, then fine tune in the Aura editor.</p>
        <ol class="bc-steps">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
        <form method="post" action="${root}/build"><input type="hidden" name="mode" value="standard"><button class="bc-btn" type="submit" ${canChoose ? "" : "disabled"}>Use Standard Builder</button></form>
        ${canChoose ? "" : '<p class="bc-status">Ask a store owner or admin to choose a builder.</p>'}
      </article>
    </div>
  </section>`;
  return documentPage("builder", { ...data, draft: data }, user, body);
}
