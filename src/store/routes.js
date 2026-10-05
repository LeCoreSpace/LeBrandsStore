import { renderWizard } from "../ui/wizard.js";
import { SECURITY_HEADERS } from "../auth/security.js";
import { UUID } from "../public/validation.js";
import { settingsPatch, progressPatch, productPatch, readJson, readBody, badInput } from "./input.js";
import { validateUpload } from "./media.js";
import {
  loadDraft, saveSetup, saveProduct, deleteProduct, insertMedia,
  regeneratePolicies, savePolicy, publish,
} from "./repository.js";

export const isStoreRoute = (path) => /^\/(?:api\/)?stores\/[^/]+\//.test(path);
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8" },
});
const unavailable = () => Object.assign(new Error("Store services are temporarily unavailable. Please try again."), { status: 503 });
export async function handleStoreRoutes(request, env, db, user, tokenHash) {
  const url = new URL(request.url), api = url.pathname.startsWith("/api/");
  const match = url.pathname.match(/^\/(?:api\/)?stores\/([^/]+)\/(setup|products|media|policies|publish|unpublish)(?:\/([^/]+))?$/);
  if (!match || !UUID.test(match[1])) return json({ error: "Page not found." }, 404);
  if (!user || user.must_change_password) return json({ error: "Sign in and complete any required password change first." }, 401);
  const [, id, action, child] = match;
  let uploadedKey;
  try {
    if (!api) {
      if (action !== "setup" || child || !["GET", "HEAD"].includes(request.method)) return json({ error: "Page not found." }, 404);
      const data = await db.withMemberStore(id, tokenHash, (tx) => loadDraft(tx, id));
      return new Response(request.method === "HEAD" ? null : renderWizard(data, user), {
        headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8" },
      });
    }
    const verb = request.method;
    const route = `${verb} ${action}${child ? "/child" : ""}`;
    const supported = [
      "GET setup", "PATCH setup", "POST products", "PATCH products/child", "DELETE products/child",
      "POST media", "PUT policies/child", "POST policies/child", "POST publish", "POST unpublish",
    ];
    if (!supported.includes(route) || (action === "products" && child && !UUID.test(child)) ||
      (action === "policies" && verb === "POST" && child !== "generate")) return json({ error: "Method or page not available." }, 405);
    // Authorize before reading or storing an upload. No bytes reach R2 for outsiders.
    const result = await db.withMemberStore(id, tokenHash, async (tx) => {
      if (route === "GET setup") return loadDraft(tx, id);
      if (route === "PATCH setup") {
        const body = await readJson(request);
        if (!Object.keys(body).length || Object.keys(body).some((k) => !["settings", "progress"].includes(k))) throw badInput("Use the setup form.");
        return saveSetup(tx, id, body.settings === undefined ? undefined : settingsPatch(body.settings),
          body.progress === undefined ? undefined : progressPatch(body.progress));
      }
      if (route === "POST products" || route === "PATCH products/child") return saveProduct(tx, id, child, productPatch(await readJson(request)));
      if (route === "DELETE products/child") return deleteProduct(tx, id, child);
      if (route === "POST media") {
        if (!env.MEDIA) throw unavailable();
        if (!/^multipart\/form-data;\s*boundary=/i.test(request.headers.get("content-type") ?? "")) throw badInput("Choose a file to upload.");
        const bytes = await readBody(request, 10 * 1024 * 1024 + 65536);
        let form;
        try { form = await new Response(bytes, { headers: { "content-type": request.headers.get("content-type") } }).formData(); }
        catch { throw badInput("Use a valid file upload."); }
        if ([...form.keys()].some((key) => !["file", "type", "alt"].includes(key)) ||
          ["file", "type", "alt"].some((key) => form.getAll(key).length > 1)) throw badInput("Upload one file at a time.");
        const file = form.get("file"), type = form.get("type"), alt = form.get("alt") ?? "";
        if (!file || typeof file.arrayBuffer !== "function" || typeof alt !== "string" || alt.length > 200) throw badInput("Choose an image and keep its alt text within 200 characters.");
        const data = new Uint8Array(await file.arrayBuffer()), metadata = validateUpload(data, type);
        uploadedKey = `stores/${id}/${crypto.randomUUID()}.${metadata.ext}`;
        await env.MEDIA.put(uploadedKey, data, {
          httpMetadata: { contentType: metadata.contentType, cacheControl: "public, max-age=31536000, immutable" },
        });
        return { media: await insertMedia(tx, id, uploadedKey, type, data.length, metadata, alt.trim() || (type === "logo" ? `${user.name || "Brand"} logo` : "Product image")) };
      }
      if (route === "POST policies/child") return regeneratePolicies(tx, id);
      if (route === "PUT policies/child") return savePolicy(tx, id, child, await readJson(request));
      return publish(tx, id, action === "publish");
    });
    return json(result);
  } catch (error) {
    // A failed DB insert/commit must not leave an untracked uploaded object.
    if (uploadedKey) {
      try { await env.MEDIA.delete(uploadedKey); }
      catch { console.error("Orphan media cleanup failed", { code: "R2_CLEANUP_FAILED" }); }
    }
    console.error("Store setup request failed", { code: error?.code ?? (error?.status ? "REQUEST_REJECTED" : "STORE_SERVICE_ERROR") });
    let status = error.status ?? 503;
    let message = error.status ? error.message : "Store services are temporarily unavailable. Please try again.";
    if (error.code === "23505") { status = 409; message = "That store address or SKU is already in use."; }
    if (error.code === "23503") { status = 409; message = "That item is in use or is not part of this store."; }
    return json({ error: message, ...(error.errors ? { errors: error.errors } : {}) }, status);
  }
}
