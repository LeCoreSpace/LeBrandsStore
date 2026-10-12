import { pagesEnabled, savePage, restorePage, pageHistory, draftPageResponse } from "./pages.js";
import { loadDraft } from "./repository.js";
import { readJson } from "./input.js";
import { SECURITY_HEADERS } from "../auth/security.js";
import { UUID } from "../public/validation.js";
import { PAGE_KEYS } from "../public/aura-layout.js";
import { audit } from "../dashboard/repository.js";
export const isPageRoute = path => /^\/api\/stores\/[^/]+\/pages(?:\/|$)/.test(path);
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
export async function handlePageRoutes(request, env, db, user, tokenHash) {
  const url = new URL(request.url), match = url.pathname.match(/^\/api\/stores\/([^/]+)\/pages(?:\/([^/]+))?(?:\/(history|restore))?$/);
  if (!match || !UUID.test(match[1])) return json({ error: "Page not found." }, 404);
  if (!user || user.must_change_password) return json({ error: "Sign in first." }, 401);
  const [, id, page, action] = match;
  if (page && !PAGE_KEYS.includes(page)) return json({ error: "Page not found." }, 404);
  const read = request.method === "GET", save = request.method === "PUT" && page && !action, restore = request.method === "POST" && action === "restore";
  if (!read && !save && !restore) return json({ error: "Method not allowed." }, 405);
  if(!read&&page==="checkout")return json({error:"Checkout layout is not editable."},403);
  try {
    // Account routing has already applied the same exact-origin and session
    // protection used by the existing wizard API.
    const result = await db.withMemberStore(id, tokenHash, async tx => {
      if (!await pagesEnabled(tx)) throw Object.assign(new Error("The page architecture migration has not been applied."), { status: 503 });
      if (read && action === "history") return pageHistory(tx, id, page);
      const data = await loadDraft(tx, id);
      if (read) return page ? { layout: draftPageResponse(data).layouts[page], revision: data.page_versions?.[page] || { version: 0 } } : draftPageResponse(data);
      const body = await readJson(request);
      const keys = restore ? ["version", "expected_version"] : ["layout", "expected_version"];
      if (!body || Object.keys(body).some(key => !keys.includes(key))) throw Object.assign(new Error("Unknown page field."), { status: 400 });
      const row = restore
        ? await restorePage(tx, id, page, body.version, body.expected_version, tokenHash)
        : await savePage(tx, id, page, body.layout, body.expected_version, tokenHash, data);
      await audit(tx, id, user.id, restore ? "store.page_restored" : "store.page_saved", "store_page", id, { page_key: page, version: row.version });
      return row;
    });
    return json(result);
  } catch (error) {
    const status = error.code === "42501" ? 403 : error.code === "40001" ? 409 : error.code === "22023" ? 400 : error.status || 503;
    return json({ error: status < 500 ? error.message : "Page services are unavailable. Please try again." }, status);
  }
}
