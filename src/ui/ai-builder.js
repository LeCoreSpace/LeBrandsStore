import { documentPage } from "./dashboard.js";
import { escapeHtml } from "./layout.js";

const safeJson = (value) => JSON.stringify(value ?? {}).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

export function renderAiBuilder(boot, user) {
  const b = boot && typeof boot === "object" ? boot : {};
  const storeId = String(b.store_id || "");
  const body = `<link rel="stylesheet" href="/assets/ai-builder.css">
    <div class="aib" data-ai-builder data-store-id="${escapeHtml(storeId)}">
      <div class="aib-loading" aria-hidden="true"><i></i><i></i><i></i></div>
      <noscript><p class="aib-notice">The store builder needs JavaScript to run.</p></noscript>
    </div>
    <script type="application/json" id="ai-builder-boot">${safeJson(b)}</script>
    <script type="module" src="/assets/ai-builder.js"></script>`;
  return documentPage("ai-builder", { store: { store_id: storeId, name: b.store_name || "" }, role: b.role || "editor", draft: b.draft }, user, body);
}
