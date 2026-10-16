import { loadDraft } from "./repository.js";
import { loadAnnSession, annReference } from "./ann-repository.js";
import { seedAnnDesign, annDesignSettings } from "./ann-design.js";
import { isAnnDesign } from "../public/ann-design-model.js";

/** Loading the editor must never write or replace a merchant's saved draft. */
export async function loadEditorDraft(tx, storeId) {
  const draft = await loadDraft(tx, storeId);
  if (isAnnDesign(draft.settings.ann_design)) return draft;
  const [schema] = await tx`SELECT to_regclass('public.ann_builder_sessions') IS NOT NULL AS ready`;
  if (!schema?.ready) return draft;
  const session = await loadAnnSession(tx, storeId);
  if (!session || !Object.keys(session.answers || {}).length) return draft;
  const reference = await annReference(tx, session.answers.subcategory_id);
  return { ...draft, ann_design_pending: true,
    settings: { ...draft.settings, ...annDesignSettings(draft, session.answers, reference),
      ann_design: seedAnnDesign(draft, session.answers) } };
}
