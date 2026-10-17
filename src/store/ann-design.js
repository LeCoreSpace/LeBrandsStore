import { loadDraft, saveSetup } from "./repository.js";
import { audit } from "../dashboard/repository.js";
import { annReference } from "./ann-repository.js";
import { validateAnnAnswers } from "./ann-input.js";
import { draftFingerprint } from "./ann-application.js";
import { settingsPatch, badInput } from "./input.js";
import { annPreviewConfiguration } from "../public/ann-config.js";
import { publishChecklist, UUID } from "../public/validation.js";
import { isDesignCopyKey, isDesignMediaKey, getDesignCopyLimit, isAnnDesign } from "../public/ann-design-model.js";
import { SHOWCASE_MEDIA, resolveShowcasePack } from "../public/aura-showcase-assets.js";
import { designSeedCopy } from "../public/aura-showcase.js";
import { styleDemonstration } from "../public/style-demo-copy.js";
import { stylePreviewData } from "../public/style-preview.js";
import { projectAnnPreview } from "../public/ann-projection.js";
import { prefilledSection } from "../public/aura-starters.js";
import { validDesignSections } from "../public/ann-section-layout.js";
import {validateDesignMenus} from "../public/ann-menu-model.js";

const plain = value => value !== null && typeof value === "object" && !Array.isArray(value);
const conflict = () => { throw Object.assign(new Error("Your store draft changed in another window. Reload the saved design before trying again. Your unsaved edits are kept."), { status: 409 }); };
const keys = (value, allowed) => {
  if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key))) throw badInput("Use the design editor's supported fields.");
};
export function validateDesignRequest(body, creating = false) {
  keys(body, ["expected_draft", "confirm", "answers","catalogue_mode", ...(creating ? [] : ["copy", "media","sections","menus"])]);
  if(body.menus!==undefined&&body.menus!==null)body.menus=validateDesignMenus(body.menus);
  if(body.catalogue_mode!==undefined&&!["sample","own"].includes(body.catalogue_mode))throw badInput("Choose sample or own catalogue for the draft preview.");
  if(body.sections!==undefined&&!validDesignSections(body.sections))throw badInput("Choose valid page sections. Product purchase and contact forms must remain available.");
  if (body.confirm !== true || !/^[a-f0-9]{64}$/.test(body.expected_draft || "")) throw badInput("Load the current draft and confirm your design changes.");
  if (creating && !plain(body.answers)) throw badInput("Choose a design before saving it.");
  if (body.copy !== undefined) {
    if(!plain(body.copy)||Object.keys(body.copy).length>300||Object.keys(body.copy).some(key=>!isDesignCopyKey(key)))throw badInput("Choose supported section text fields.");
    for (const [key, text] of Object.entries(body.copy)) {
      if(text===null&&key.startsWith("section."))continue;
      if (typeof text !== "string" || [...text].length > getDesignCopyLimit(key) ||
        /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
        throw badInput(`Use plain text within ${getDesignCopyLimit(key)} characters for ${key}.`);
      }
    }
  }
  if (body.media !== undefined) {
    if(!plain(body.media)||Object.keys(body.media).length>150||Object.keys(body.media).some(key=>!isDesignMediaKey(key)))throw badInput("Choose supported section media fields.");
    if (Object.values(body.media).some(id => id !== null && !UUID.test(id || ""))) throw badInput("Choose an image uploaded to this store.");
  }
  if (new TextEncoder().encode(JSON.stringify(body)).length > 60000) throw badInput("This design is too large. Shorten the text before saving.");
  return body;
}
export function seedDesignMedia(style, source) {
  const pack = source ? resolveShowcasePack(source).media : SHOWCASE_MEDIA[style];
  return structuredClone({ hero: pack.hero, lifestyle: pack.lifestyle,
    collection0: pack.collections.c01, collection1: pack.collections.c02 });
}
async function ownedImages(tx, storeId) {
  const rows = await tx`SELECT id,alt_text,object_key,width,height FROM public.media m WHERE store_id=${storeId}
    AND upload_type='image' AND kind='image'
    AND COALESCE(to_jsonb(m)->>'approval_status','approved')='approved'
    ORDER BY created_at DESC,id LIMIT 500`;
  return rows.map(row => ({ ...row, url: `https://media.lebrands.store/${row.object_key}` }));
}
async function ownedVideos(tx,storeId){
  const rows=await tx`SELECT id,alt_text,object_key,width,height FROM public.media m WHERE store_id=${storeId}
    AND upload_type='video' AND kind='video'
    AND COALESCE(to_jsonb(m)->>'approval_status','approved')='approved'
    ORDER BY created_at DESC,id LIMIT 500`;
  return rows.map(row=>({...row,kind:"video",url:`https://media.lebrands.store/${row.object_key}`}));
}
export async function prepareAnnDesign(tx, storeId, draft) {
  const data = draft || await loadDraft(tx, storeId);
  return { expected_draft: await draftFingerprint(data), draft: data,
    design: isAnnDesign(data.settings.ann_design) ? data.settings.ann_design : null,
    images: await ownedImages(tx, storeId), videos:await ownedVideos(tx,storeId), checklist: publishChecklist(data),
    publish_url: `/stores/${storeId}/setup?step=4` };
}
/** Read-only projection shared by design adoption and the editor handoff. */
export function seedAnnDesign(data, answers, catalogueMode = "sample") {
  const plan = structuredClone(answers);
  const config = annPreviewConfiguration(plan, data.settings);
  plan.style_preset = config.theme.style_preset;
  const demo = styleDemonstration(projectAnnPreview(
    stylePreviewData(data, { showcase: true }), config, { prefilled: prefilledSection }).data,
  config.theme.style_preset);
  return { version: 1, style: config.theme.style_preset, plan, catalogue_mode: catalogueMode, sections: {},
    copy: designSeedCopy(demo, { ...demo.settings, ...config.theme }),
    media_pack: resolveShowcasePack(demo).key,
    media: seedDesignMedia(config.theme.style_preset, demo) };
}

export function annDesignSettings(data, plan, reference) {
  const config = annPreviewConfiguration(plan, data.settings);
  const category = reference.categories.find(c => Number(c.category_id) === Number(plan.category_id));
  const subcategory = reference.subcategories.find(c => Number(c.subcategory_id) === Number(plan.subcategory_id));
  return settingsPatch({ ...config.theme, theme: "aura",
    ...(config.brand.store_name ? { brand_name: config.brand.store_name } : {}),
    ...(category && subcategory ? { category: category.slug, subcategory: subcategory.slug } : {}) });
}

export async function saveAnnDesign(tx, storeId, userId, raw, creating = false) {
  const body = validateDesignRequest(raw, creating);
  const data = await loadDraft(tx, storeId);
  if (await draftFingerprint(data) !== body.expected_draft) conflict();
  const previous = data.settings.ann_design;
  if (!creating && !isAnnDesign(previous)) throw badInput("Use a design first, then edit its saved draft.");
  const plan = structuredClone(body.answers ?? previous?.plan ?? {});
  const reference = await annReference(tx, Number.isSafeInteger(plan.subcategory_id) ? plan.subcategory_id : null);
  validateAnnAnswers(plan, reference);
  const config = annPreviewConfiguration(plan, data.settings);
  plan.style_preset = config.theme.style_preset;
  if (!creating && config.theme.style_preset !== previous.style) {
    throw badInput("Use this design to switch styles. Existing edits will not be silently moved to another layout.");
  }
  let design;
  if (creating) {
    design = seedAnnDesign(data, plan, body.catalogue_mode || "sample");
    if(previous?.menus)design.menus=structuredClone(previous.menus);
  } else design = { ...structuredClone(previous), plan,
    copy: { ...previous.copy, ...body.copy }, media: { ...previous.media } };
  for(const [key,value] of Object.entries(design.copy))if(value===null)delete design.copy[key];
  if(body.sections)design.sections=structuredClone(body.sections);
  if(body.menus===null)delete design.menus;
  else if(body.menus!==undefined)design.menus=structuredClone(body.menus);
  if(body.catalogue_mode)design.catalogue_mode=body.catalogue_mode;
  if (body.media) {
    for (const [key, id] of Object.entries(body.media)) {
      if (id === null) { const original=seedDesignMedia(design.media_pack || design.style)[key];if(original)design.media[key]=original;else delete design.media[key]; continue; }
      // Resolve each identifier against this tenant, not an arbitrary client URL
      // or a limited picker page. Previously uploaded images remain editable.
      const kind=/\.video\d+$/.test(key)?"video":"image";
      const [image] = await tx`SELECT id,object_key,alt_text,width,height FROM public.media m WHERE store_id=${storeId}
        AND id=${id} AND upload_type=${kind} AND kind=${kind}
        AND COALESCE(to_jsonb(m)->>'approval_status','approved')='approved'`;
      if (!image || !image.object_key?.startsWith(`stores/${storeId}/`))
        throw Object.assign(new Error("Choose approved media belonging to this store."), { status: 403 });
      design.media[key] = { url: `https://media.lebrands.store/${image.object_key}`,
        alt: image.alt_text || "", width: image.width || 1024, height: image.height || 1024, media_id: image.id,kind };
    }
  }
  const validatedSettings = annDesignSettings(data, plan, reference);
  const settings = Object.fromEntries(Object.entries(validatedSettings)
    .filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(data.settings[key])));
  // Persist the validated model using the existing store_setup JSON document;
  // draft-only storage is copied by the established guarded publication path.
  const draft = await saveSetup(tx, storeId, { ...settings, ann_design: design });
  await audit(tx, storeId, userId, creating ? "ann.design_used" : "ann.design_saved", "store", storeId, { style: design.style });
  return prepareAnnDesign(tx, storeId, draft);
}
