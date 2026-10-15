import { SECURITY_HEADERS, readForm, isValidOrigin } from "../auth/security.js";
import { dashboardAccess } from "../dashboard/repository.js";
import { loadDraft } from "./repository.js";
import { renderBuilderChoice } from "../ui/builder-choice.js";

// A feature flag alone must not expose a partially implemented Ann workflow.
// Stage 1 establishes the chooser; later stages supply the working Ann route.
export const ANN_WORKFLOW_READY = false;
export const annBuilderEnabled = (env = {}) =>
  ANN_WORKFLOW_READY && env.ANN_BUILDER_ENABLED === "true";
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
  if (!match) return json("Page not found.", 404);
  if (!user || user.must_change_password) return json("Sign in first.", 401);
  const [, id, target] = match;
  if (!["GET", "HEAD", "POST"].includes(request.method)) return json("Method not allowed.", 405);
  try {
    if (request.method === "POST") {
      if (!isValidOrigin(request)) return json("This request did not come from the account website.", 403);
      if (target) return json("Choose a builder from the builder selection page.", 405);
      const form = await readForm(request);
      const mode = form.get("mode");
      if (!["standard", "ann"].includes(mode)) return json("Choose a valid builder.", 400);
      if (mode === "ann" && !annBuilderEnabled(env)) return json("Ann is not enabled. Use Standard Builder to continue.", 409);
      await db.withMemberStore(id, tokenHash, async tx => {
        await dashboardAccess(tx, id, user.id, true);
        // Merge only this preference. Do not invalidate policies, alter wizard
        // progress, write page layouts, change inventory or publish anything.
        await tx`INSERT INTO public.store_setup(store_id,settings)
          VALUES(${id},jsonb_build_object('builder_mode', ${mode}::text))
          ON CONFLICT(store_id) DO UPDATE SET settings =
            public.store_setup.settings || EXCLUDED.settings`;
      });
      return redirect(`/stores/${id}/${mode === "standard" ? "setup" : "build/ann"}`);
    }
    const data = await db.withMemberStore(id, tokenHash, async tx => {
      const role = await dashboardAccess(tx, id, user.id);
      return { ...await loadDraft(tx, id), role };
    });
    if (target === "standard") return redirect(`/stores/${id}/setup`);
    // Never send this route into the legacy AI-generation interface.
    if (target === "ann") return redirect(`/stores/${id}/build`);
    return new Response(request.method === "HEAD" ? null : renderBuilderChoice(data, user, {
      annEnabled: annBuilderEnabled(env),
    }), { headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  } catch (error) {
    return json(error.status === 403 || error.code === "42501" ? "You do not have access to change this store." : "Unable to open the builder. Please try again.",
      error.status || (error.code === "42501" ? 403 : 500));
  }
}
