import { SECURITY_HEADERS, isValidOrigin } from "../auth/security.js";
import { UUID } from "../public/validation.js";
import { dashboardAccess } from "../dashboard/repository.js";
import { readJson } from "./input.js";
import { prepareAnnOnboarding, saveAnnOnboarding, requireAnnGSTIN } from "./ann-onboarding.js";
import { validateAnnSave, mergeAnnAnswers, validateAnnAnswers } from "./ann-input.js";
import { annReady, annReference, loadAnnSession, annSessionResponse } from "./ann-repository.js";
import { prepareAnnApplication, applyAnnApplication } from "./ann-application.js";
import { prepareAnnReadiness, saveAnnReadiness } from "./ann-readiness.js";
import { handleStoreRoutes } from "./routes.js";
import { prepareAnnDesign, saveAnnDesign } from "./ann-design.js";
import { prepareAnnLaunch, saveAnnLaunch } from "./ann-launch.js";
const pattern = /^\/api\/stores\/([a-f0-9-]{36})\/ann\/(reference|session|application|readiness|media|design|launch|onboarding)$/i;
export const isAnnRoute = path => pattern.test(path);
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...SECURITY_HEADERS, "content-type": "application/json", "cache-control": "no-store" },
});
export async function handleAnnRoutes(request, env, db, user, tokenHash) {
  const url = new URL(request.url), match = url.pathname.match(pattern);
  if (!match || !UUID.test(match[1])) return json({ error: "Page not found." }, 404);
  if (!user || user.must_change_password) return json({ error: "Sign in and complete any required password change first." }, 401);
  const [, storeId, action] = match, writing = request.method === "PATCH" || request.method === "POST";
  if (!(action==="media" ? request.method==="POST" : ["GET","HEAD"].includes(request.method) || (request.method === "PATCH" && ["session","readiness","design","launch","onboarding"].includes(action)) || (request.method === "POST" && ["application","design"].includes(action)))) return json({ error: "Method not allowed." }, 405);
  if (["application","readiness","media","design","launch","onboarding"].includes(action) && env.ANN_BUILDER_ENABLED === "false") return json({ error: "Ann is temporarily paused. Your existing store is unchanged." }, 503);
  if (writing && !isValidOrigin(request)) return json({ error: "This request did not come from the account website." }, 403);
  try {
    if(action==="media"){
      // Ann's readonly members cannot upload through this facade. Authorize
      // before reading file bytes; the existing store route owns validation,
      // the R2 write, tenant checks and orphan cleanup.
      await db.withMemberStore(storeId,tokenHash,async tx=>{
        await dashboardAccess(tx,storeId,user.id,true);
        await annReady(tx);
      });
      url.pathname=`/api/stores/${storeId}/media`;
      return await handleStoreRoutes(new Request(url,request),env,db,user,tokenHash);
    }
    const data = await db.withMemberStore(storeId, tokenHash, async tx => {
      await dashboardAccess(tx, storeId, user.id, writing);
      if (action === "design") return writing
        ? saveAnnDesign(tx, storeId, user.id, await readJson(request), request.method === "POST")
        : prepareAnnDesign(tx, storeId);
      await annReady(tx);
      if(action==="onboarding")return writing?saveAnnOnboarding(tx,storeId,user.id,await readJson(request)):prepareAnnOnboarding(tx,storeId);
      if (action === "launch") return writing
        ? saveAnnLaunch(tx, storeId, user.id, env, await readJson(request))
        : prepareAnnLaunch(tx, storeId, user.id, env);
      if (action==="readiness") return writing
        ? saveAnnReadiness(tx,storeId,user.id,await readJson(request))
        : prepareAnnReadiness(tx,storeId,user.id);
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
      if(body.current_step!=="business"&&(body.current_step==="selling"||session?.current_step==="business"))await requireAnnGSTIN(tx,storeId);
      if ((session?.revision || 0) !== body.expected_revision) return { conflict: true };
      const merged = mergeAnnAnswers(session?.answers, body.answers);
      const reference = await annReference(tx, Number.isSafeInteger(merged.answers.subcategory_id) ? merged.answers.subcategory_id : null);
      const answers = validateAnnAnswers(merged.answers, reference);
      // Bind serialized JSON as text first. A directly inferred jsonb parameter
      // makes postgres.js JSON.stringify this string again (a JSON string, not
      // the object required by ann_builder_sessions).
      await tx`SELECT public.ann_save_session(${storeId}::uuid,${tokenHash}::text,${body.expected_revision}::integer,
        ${body.current_step}::text,${JSON.stringify(answers)}::text::jsonb) AS revision`;
      session = await loadAnnSession(tx, storeId);
      return annSessionResponse(tx, storeId, session, merged.cleared);
    });
    if (data.conflict) return json({ error: "Ann progress changed in another tab. Reload your progress before saving." }, 409);
    return request.method === "HEAD" ? new Response(null, { headers: json({}).headers }) : json(data);
  } catch (error) {
    if (["42501","FORBIDDEN"].includes(error.code) || error.status === 403) return json({ error: "You do not have permission for this action." }, 403);
    if (["40001","23505"].includes(error.code)) return json({ error: "Ann progress changed in another tab. Reload your progress before saving." }, 409);
    if ([400,404,409,429,502,503].includes(error.status)) return json({ error: error.message,
      ...(action==="readiness" && error.errors ? {errors:error.errors}:{}),
    }, error.status);
    // Identifiers/codes only: never log SQL, answer text, tokens or connection details.
    const identifier = value => typeof value === "string" && /^[a-zA-Z0-9_]{1,64}$/.test(value) ? value : undefined;
    console.error("Ann request failed", { action, code: identifier(error.code), type: identifier(error.name),
      table: identifier(error.table_name), column: identifier(error.column_name) });
    return json({ error: "Ann progress is temporarily unavailable. Your existing store is unchanged." }, 503);
  }
}
