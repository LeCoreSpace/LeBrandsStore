import { SECURITY_HEADERS, isValidOrigin } from "../auth/security.js";
import { UUID } from "../public/validation.js";
import { dashboardAccess } from "../dashboard/repository.js";
import { readJson } from "./input.js";
import { validateAnnSave, mergeAnnAnswers, validateAnnAnswers } from "./ann-input.js";
import { annReady, annReference, loadAnnSession, annSessionResponse } from "./ann-repository.js";
import { prepareAnnApplication, applyAnnApplication } from "./ann-application.js";
const pattern = /^\/api\/stores\/([a-f0-9-]{36})\/ann\/(reference|session|application)$/i;
export const isAnnRoute = path => pattern.test(path);
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...SECURITY_HEADERS, "content-type": "application/json", "cache-control": "no-store" },
});
export async function handleAnnRoutes(request, env, db, user, tokenHash) {
  const url = new URL(request.url), match = url.pathname.match(pattern);
  if (!match || !UUID.test(match[1])) return json({ error: "Page not found." }, 404);
  if (!user || user.must_change_password) return json({ error: "Sign in and complete any required password change first." }, 401);
  const [, storeId, action] = match, writing = request.method === "PATCH" || request.method === "POST";
  if (!(["GET","HEAD"].includes(request.method) || (request.method === "PATCH" && action === "session") || (request.method === "POST" && action === "application"))) return json({ error: "Method not allowed." }, 405);
  if (action === "application" && env.ANN_BUILDER_ENABLED === "false") return json({ error: "Ann is temporarily paused. Your existing store is unchanged." }, 503);
  if (writing && !isValidOrigin(request)) return json({ error: "This request did not come from the account website." }, 403);
  try {
    const data = await db.withMemberStore(storeId, tokenHash, async tx => {
      await dashboardAccess(tx, storeId, user.id, writing);
      await annReady(tx);
      if (action === "reference") {
        const raw = url.searchParams.get("subcategory_id");
        if (raw !== null && (!/^[1-9][0-9]{0,9}$/.test(raw))) throw Object.assign(new Error("Choose a valid subcategory."), { status: 400 });
        const reference = await annReference(tx, raw === null ? null : Number(raw));
        if (raw !== null && !reference.subcategories.some(s => Number(s.subcategory_id) === Number(raw))) throw Object.assign(new Error("Choose a product subcategory."), { status: 400 });
        return reference;
      }
      let session = await loadAnnSession(tx, storeId);
      if (action === "application") {
        if (!writing) return prepareAnnApplication(tx, storeId, session);
        if (!session) throw Object.assign(new Error("Save your Ann plan before applying."), { status: 400 });
        const raw = await readJson(request);
        const reference = await annReference(tx, session?.answers?.subcategory_id || null);
        session.answers = validateAnnAnswers(structuredClone(session.answers), reference);
        return applyAnnApplication(tx, storeId, tokenHash, user.id, session, reference, raw);
      }
      if (!writing) return annSessionResponse(tx, storeId, session);
      const body = validateAnnSave(await readJson(request));
      if ((session?.revision || 0) !== body.expected_revision) return { conflict: true };
      const merged = mergeAnnAnswers(session?.answers, body.answers);
      const reference = await annReference(tx, Number.isSafeInteger(merged.answers.subcategory_id) ? merged.answers.subcategory_id : null);
      const answers = validateAnnAnswers(merged.answers, reference);
      await tx`SELECT public.ann_save_session(${storeId}::uuid,${tokenHash}::text,${body.expected_revision}::integer,
        ${body.current_step}::text,${JSON.stringify(answers)}::jsonb) AS revision`;
      session = await loadAnnSession(tx, storeId);
      return annSessionResponse(tx, storeId, session, merged.cleared);
    });
    if (data.conflict) return json({ error: "Ann progress changed in another tab. Reload your progress before saving." }, 409);
    return request.method === "HEAD" ? new Response(null, { headers: json({}).headers }) : json(data);
  } catch (error) {
    if (["42501","FORBIDDEN"].includes(error.code) || error.status === 403) return json({ error: "You do not have permission for this action." }, 403);
    if (["40001","23505"].includes(error.code)) return json({ error: "Ann progress changed in another tab. Reload your progress before saving." }, 409);
    if ([400,409,503].includes(error.status)) return json({ error: error.message }, error.status);
    return json({ error: "Ann progress is temporarily unavailable. Your existing store is unchanged." }, 503);
  }
}
