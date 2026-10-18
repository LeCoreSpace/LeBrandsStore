import { SECURITY_HEADERS, readForm, isValidOrigin } from "../auth/security.js";
import { dashboardAccess } from "../dashboard/repository.js";
import { loadDraft } from "./repository.js";
import { renderBuilderChoice } from "../ui/builder-choice.js";
import { renderAnnBuilder } from "../ui/ann-builder.js";
import { annReady, annReference, loadAnnSession, annSessionResponse } from "./ann-repository.js";
import { UUID } from "../public/validation.js";
import {businessEditorAccess,protectedEditorLinks} from "./business-access.js";
import {REGISTRATION_COUNTRIES} from "../public/registration-validation.js";

// The guided planning UI is available only when its database is ready.
// It never applies a theme, creates inventory or bypasses publication checks.
export const ANN_WORKFLOW_READY = true;
export const annBuilderEnabled = (env = {}) =>
  ANN_WORKFLOW_READY && env.ANN_BUILDER_ENABLED !== "false";
export const isBuilderRoute = path =>
  /^\/stores\/[a-f0-9-]{36}\/build(?:\/(?:standard|ann))?$/i.test(path);
const redirect = path => new Response(null, {
  status: 303, headers: { ...SECURITY_HEADERS, "cache-control": "no-store", location: path },
});
const json = (error, status) => new Response(JSON.stringify({ error }), {
  status, headers: { ...SECURITY_HEADERS, "cache-control": "no-store", "content-type": "application/json" },
});

export async function handleBuilderRoutes(request, env, db, user, tokenHash) {
  const match = new URL(request.url).pathname.match(/^\/stores\/([a-f0-9-]{36})\/build(?:\/(standard|ann))?$/i);
  if (!match || !UUID.test(match[1])) return json("Page not found.", 404);
  if (!user || user.must_change_password) return json("Sign in first.", 401);
  const [, id, target] = match;
  if (!["GET", "HEAD", "POST"].includes(request.method)) return json("Method not allowed.", 405);
  try {
    if (request.method === "POST") {
      if (!isValidOrigin(request)) return json("This request did not come from the account website.", 403);
      if (target) return json("Choose a builder from the builder selection page.", 405);
      const form = await readForm(request);
      const mode = form.get("mode"),chosenMode="ann";
      if (!["standard", "ann"].includes(mode)) return json("Choose a valid builder.", 400);
      if (!annBuilderEnabled(env)) return json("Ann is temporarily unavailable. Your saved store and theme editor are unchanged.", 409);
      await db.withMemberStore(id, tokenHash, async tx => {
        await dashboardAccess(tx, id, user.id, true);
        await annReady(tx);
        // Merge only this preference. Do not invalidate policies, alter wizard
        // progress, write page layouts, change inventory or publish anything.
        await tx`INSERT INTO public.store_setup(store_id,settings)
          VALUES(${id},jsonb_build_object('builder_mode', ${chosenMode}::text))
          ON CONFLICT(store_id) DO UPDATE SET settings =
            public.store_setup.settings || EXCLUDED.settings`;
      });
      return redirect(`/stores/${id}/build/ann`);
    }
    const data = await db.withMemberStore(id, tokenHash, async tx => {
      const role = await dashboardAccess(tx, id, user.id);
      const data = { ...await loadDraft(tx, id), role };
      data.business_access=await businessEditorAccess(tx,id,tokenHash);
      data.business_countries=REGISTRATION_COUNTRIES.map(({code,name})=>({code,name}));
      if (annBuilderEnabled(env)) {
        try {
          await annReady(tx);
          data.annAvailable = true;
        } catch (error) {
          if (error.status !== 503) throw error;
          data.annUnavailable = error.message;
        }
        if (target === "ann" && data.annAvailable) {
          data.annOptions = {
            reference: await annReference(tx),
            sessionResponse: await annSessionResponse(tx, id, await loadAnnSession(tx, id)),
          };
        }
      }
    return data;
    },{lockStore:false});
    if (target !== "ann") return redirect(`/stores/${id}/build/ann`);
    // Never send this route into the legacy AI-generation interface.
    if (target === "ann" && !annBuilderEnabled(env)) data.annUnavailable="Ann is temporarily unavailable. Your saved store and theme editor are unchanged.";
    const html = target === "ann" && data.annAvailable
      ? renderAnnBuilder(data, user, data.annOptions)
      : renderBuilderChoice(data, user, {
        annEnabled: data.annAvailable === true,
        error: data.annUnavailable,
      });
    return new Response(request.method === "HEAD" ? null : protectedEditorLinks(html,id,data.business_access), {
      headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    return json(error.status === 403 || error.code === "42501" ? "You do not have access to change this store." :
      error.status === 503 ? error.message : "Unable to open the builder. Please try again.",
      error.status || (error.code === "42501" ? 403 : 500));
  }
}
