// Node development middleware only. Never imported by the production Worker.
// An isolated in-memory PostgreSQL instance; no credentials or live store data.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { renderAnnBuilder } from "./ui/ann-builder.js";
import {renderAnnThemeEditor} from "./ui/ann-theme-editor.js";
import {renderWizard} from "./ui/wizard.js";
import {loadEditorDraft} from "./store/editor-draft.js";
import { handleAnnRoutes } from "./store/ann-routes.js";
import { annReference, annSessionResponse, loadAnnSession } from "./store/ann-repository.js";
import { preparePageMigration } from "../db/page-schema-migration.js";
import { DEFAULT_SETTINGS, loadDraft } from "./store/repository.js";
import { APP_ORIGIN } from "./auth/security.js";
import { STYLE_IDS, styleSettings } from "./public/aura-styles.js";
import { TAXONOMY } from "./public/aura-taxonomy-data.js";
import { renderAura } from "./public/aura.js";
import { defaultPageLayouts } from "./public/aura-layout.js";
import { stylePreviewData, renderStylePreview } from "./public/style-preview.js";
import {mapGSTINResponse} from "./gstin/provider.js";
import {handleGSTINRoutes} from "./gstin/routes.js";

const storeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ownerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const editorId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const prefix = "/__ann-builder-preview";
// Use Aura's existing permitted local-image namespace. Never weaken the
// production image allowlist to accommodate a development fixture URL.
export const ANN_FIXTURE_MEDIA_PREFIX = "/assets/img/ann-preview/";
const fixtureData = {
  store: { store_id: storeId, name: "Example Studio", subdomain: "example-studio" },
  settings: { ...DEFAULT_SETTINGS, brand_name: "Example Studio", category: "fashion", subcategory: "mens-clothing" },
  products: [], collections: [], layouts: {}, policies: [], reviews: [],
  aura_skeleton_enabled: true, aura_starter_enabled: true, role: "owner",
};
let database;
const sampleProductId="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const samplePhotoId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const memoryMedia=new Map();
const fixtureMedia={
  async put(key,bytes,options){memoryMedia.set(key,{bytes:new Uint8Array(bytes),type:options.httpMetadata.contentType});},
  async delete(key){memoryMedia.delete(key);},
};
export async function setupAnnFixtureDatabase({samplePolicies=false,sampleCatalogue=false,verifiedBusiness=false}={}) {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.schema_migrations(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),filename text NOT NULL UNIQUE,
        checksum text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());`);
    for (const file of ["0001_init.sql","0002_rls.sql","0003_accounts.sql","0004_password_pepper.sql","0005_store_wizard.sql","0006_cod_checkout.sql","0007_brand_dashboard.sql","0008_invoice_lockdown.sql","0009_required_gstin.sql","0010_store_pages.sql"]) {
      await pg.exec(await preparePageMigration(file, await readFile(new URL(`../db/migrations/${file}`, import.meta.url), "utf8")));
    }
    for (const file of ["0012_aura_skeleton_sections.sql","0015_aura_starter_library.sql","0016_ann_foundation.sql","0017_ann_launch_setup.sql","0018_commerce_runtime.sql"]) {
      await pg.exec(await preparePageMigration(file, await readFile(new URL(`../db/staged/${file}`, import.meta.url), "utf8")));
    }
    await pg.exec(`
      INSERT INTO brands(id,name,legal_name) VALUES('${storeId}','Example Studio','Example Studio');
      INSERT INTO stores(store_id,brand_id,subdomain,name) VALUES('${storeId}','${storeId}','ann-test-store','Example Studio');
      INSERT INTO users(id,name,email) VALUES('${ownerId}','Example owner','owner@example.invalid'),('${editorId}','Example editor','editor@example.invalid');
      INSERT INTO store_members(store_id,user_id,role) VALUES('${storeId}','${ownerId}','owner'),('${storeId}','${editorId}','editor');
      INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('${"a".repeat(64)}','${ownerId}',now()+interval '1 day'),('${"b".repeat(64)}','${editorId}',now()+interval '1 day');`);
    await pg.query("INSERT INTO store_setup(store_id,settings) VALUES($1,$2) ON CONFLICT(store_id) DO UPDATE SET settings=EXCLUDED.settings", [storeId, JSON.stringify(fixtureData.settings)]);
    if(samplePolicies)for(const kind of ["privacy","terms","shipping","cancellation-refund","contact","pricing"])
      await pg.query("INSERT INTO policy_pages(store_id,slug,title,content) VALUES($1,$2,$3,$4)",
        [storeId,kind,`Sample ${kind} policy`,"Fictional local preview policy only. Replace this example with the merchant's actual operating terms and review before publication."]);
    if(sampleCatalogue){
      await pg.query(`INSERT INTO products(id,store_id,title,slug,description,price_paise,gst_rate,stock,track_inventory,sku,hsn_code)
        VALUES($1,$2,'Sample cotton shirt','sample-cotton-shirt','A fictional cotton shirt for isolated product editing tests only.',129909,12,7,true,'ANN-SAMPLE','')`,
        [sampleProductId,storeId]);
      await pg.query(`INSERT INTO media(id,store_id,object_key,kind,content_type,size_bytes,upload_type,alt_text)
        VALUES($1,$2,$3,'image','image/webp',32,'image','Sample approved shirt photograph')`,
        [samplePhotoId,storeId,`stores/${storeId}/${samplePhotoId}.webp`]);
    }
    if(verifiedBusiness){
      // Development-only synthetic evidence, confirmed by the real handler.
      // No provider lookup, credentials, live database or production bypass.
      await pg.exec(await readFile(new URL("../db/staged/0011_gstin_approval.sql",import.meta.url),"utf8"));
      const raw=JSON.parse(await readFile(new URL("../test/fixtures/gstin-active-sample.json",import.meta.url),"utf8"));
      const registration=mapGSTINResponse(raw);
      const record=(await pg.query(`INSERT INTO public.store_gstin_verifications
        (store_id,gstin,state,normalized,raw_response,verified_at)
        VALUES($1,$2,'verified',$3::jsonb,$4::jsonb,now()) RETURNING id`,
        [storeId,registration.gstin,JSON.stringify(registration),JSON.stringify(raw)])).rows[0];
      const response=await handleGSTINRoutes(new Request(`${APP_ORIGIN}/api/stores/${storeId}/gstin/confirm`,{
        method:"POST",headers:{origin:APP_ORIGIN,"content-type":"application/json"},
        body:JSON.stringify({verification_id:record.id,address_index:0,lock_invoice_address:true}),
      }),{},annFixtureAdapter(pg),{id:ownerId},"a".repeat(64));
      if(!response.ok)throw new Error("Synthetic GST invoice identity could not be confirmed.");
    }
    return pg;
  } catch (error) { await pg.close(); throw error; }
}
const getDatabase = () => database ||= setupAnnFixtureDatabase({samplePolicies:true,sampleCatalogue:true,verifiedBusiness:true}).catch(error => { database = null; throw error; });
export function annFixtureAdapter(pg) {
  return { withMemberStore: async (id, hash, fn) => {
    if (id !== storeId || !["a".repeat(64), "b".repeat(64)].includes(hash))
      throw Object.assign(new Error("Fixture access denied"), { status: 403 });
    return pg.transaction(async trx => {
      await trx.exec("SET LOCAL ROLE lebrands_app");
      const access = await trx.query("SELECT public.authorize_store_session($1,$2) AS allowed", [hash, storeId]);
      if (!access.rows[0]?.allowed) throw Object.assign(new Error("Fixture access denied"), { status: 403 });
      await trx.query("SELECT set_config('app.store_id',$1,true)", [storeId]);
      await trx.query("SELECT store_id FROM public.stores WHERE store_id=$1 FOR UPDATE", [storeId]);
      const tx = async (strings, ...values) => (await trx.query(
        strings.reduce((sql, part, i) => sql + (i ? `$${i}` : "") + part, ""), values)).rows;
      tx.json = value => JSON.stringify(value);
      return fn(tx);
    });
  }};
}
export async function annPreviewFixture(req, res, previewOrigin) {
  const host = req.headers.host || "localhost";
  const origin = `${/^localhost|^127\./.test(host) ? "http" : "https"}://${host}`;
  const url = new URL(req.url || "/", previewOrigin || origin);
  if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/") &&
      !url.pathname.startsWith(ANN_FIXTURE_MEDIA_PREFIX)) return false;
  try {
    if(url.pathname.startsWith(ANN_FIXTURE_MEDIA_PREFIX) || url.pathname.startsWith(`${prefix}/media/`)){
      const mediaPrefix=url.pathname.startsWith(ANN_FIXTURE_MEDIA_PREFIX)?ANN_FIXTURE_MEDIA_PREFIX:`${prefix}/media/`;
      const file=url.pathname.slice(mediaPrefix.length);
      if(!["GET","HEAD"].includes(req.method)||!/^[a-f0-9-]{36}\.(?:png|jpg|webp|mp4|webm)$/.test(file)){res.statusCode=404;res.end();return true;}
      res.setHeader("cache-control","no-store");
      const item=memoryMedia.get(`stores/${storeId}/${file}`);
      if(item){res.setHeader("content-type",item.type);res.end(req.method==="HEAD"?undefined:item.bytes);}
      else if(file===`${samplePhotoId}.webp`){res.statusCode=302;res.setHeader("location","/assets/img/aura-starters/c001-s001/v01/c001-s001-product-p01-front-v01.webp");res.end();}
      else{res.statusCode=404;res.end();}
      return true;
    }
    // Public marketing captures use only fictional, in-memory sample content.
    if (url.pathname === `${prefix}/storefront` && ["GET","HEAD"].includes(req.method)) {
      const settings = { ...styleSettings("boutique"), brand_name: "Example Studio", category: "beauty-and-personal-care", subcategory: "skincare" };
      const sample = stylePreviewData({ store: { store_id: storeId, name: "Example Studio" }, settings,
        products: [], collections: [], layouts: {}, policies: [], reviews: [] }, { showcase: true });
      res.setHeader("content-type","text/html; charset=utf-8");
      res.setHeader("cache-control","no-store");
      const page = ["product","checkout"].includes(url.searchParams.get("page")) ? url.searchParams.get("page") : "home";
      res.end(req.method === "HEAD" ? undefined : renderStylePreview(sample, settings, { page }));
      return true;
    }
    const pg = await getDatabase(), db = annFixtureAdapter(pg);
    const readonly = url.searchParams.get("readonly") === "1" || url.pathname.includes("/read-only-api/");
    const user = { id: readonly ? editorId : ownerId, name: "Example member", email: "member@example.invalid" };
    const hash = (readonly ? "b" : "a").repeat(64);
    let response;
    if(url.pathname===`${prefix}/review`&&["GET","HEAD"].includes(req.method)){
      const draft=await db.withMemberStore(storeId,hash,tx=>loadDraft(tx,storeId));
      response=new Response(renderWizard(draft,{}, {reviewOnly:true}).replace('id="wizard"','id="wizard" data-visual-only="true"'),{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
    } else if(url.pathname===`${prefix}/editor`&&["GET","HEAD"].includes(req.method)){
      const draft=await db.withMemberStore(storeId,hash,tx=>loadEditorDraft(tx,storeId));
      if(!draft.settings.ann_design)response=new Response("Save an Ann design in the isolated preview first.",{status:409});
      else response=new Response(renderAnnThemeEditor({...draft,role:readonly?"editor":"owner",ann_api_root:`${prefix}/${readonly?"read-only-api":"api"}`,ann_root:prefix},user),{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
    } else if (url.pathname===prefix && url.searchParams.get("checkout")==="1" && ["GET","HEAD"].includes(req.method)) {
      const sample={...fixtureData,products:[{id:sampleProductId,title:"Sample cotton shirt",slug:"sample-cotton-shirt",price_paise:129909,stock:7,
        status:"active",description:"Fictional preview product only.",images:[],gst_rate:12}]};
      sample.layouts=defaultPageLayouts(sample);
      response=new Response(req.method==="HEAD"?null:renderAura(sample,{commerce:true,page:"checkout",siteKey:"isolated-preview-key"}),
        {headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
    } else if (url.pathname === prefix && ["GET", "HEAD"].includes(req.method)) {
      const options = await db.withMemberStore(storeId, hash, async tx => ({
        reference: await annReference(tx),
        sessionResponse: await annSessionResponse(tx, storeId, await loadAnnSession(tx, storeId)),
        draft: await loadDraft(tx, storeId),
        apiRoot: prefix + (readonly ? "/read-only-api" : "/api"), readOnly: readonly,
      }));
      // Screenshot controls affect only this response clone, never a stored
      // fixture session or any merchant. This module is development-only.
      const requestedStyle = url.searchParams.get("style");
      const requestedCategory = TAXONOMY.categories.find(c => c.slug === url.searchParams.get("category"));
      const requestedSubcategory = requestedCategory && TAXONOMY.subcategories.find(s =>
        s.category_id === requestedCategory.id && s.slug === url.searchParams.get("subcategory"));
      if (requestedCategory && requestedSubcategory) {
        options.draft.settings = { ...options.draft.settings, category: requestedCategory.slug, subcategory: requestedSubcategory.slug };
        if (options.sessionResponse.session) options.sessionResponse.session = {
          ...options.sessionResponse.session, answers: {
            ...options.sessionResponse.session.answers,
            category_id: requestedCategory.id, subcategory_id: requestedSubcategory.id,
          },
        };
      }
      if (STYLE_IDS.includes(requestedStyle)) {
        const theme = styleSettings(requestedStyle);
        options.draft.settings = { ...options.draft.settings, ...theme };
        options.sessionResponse.preview = {
          ...options.sessionResponse.preview,
          theme: { ...options.sessionResponse.preview?.theme, ...theme },
        };
        if (options.sessionResponse.session) options.sessionResponse.session = {
          ...options.sessionResponse.session,
          answers: { ...options.sessionResponse.session.answers, ...theme },
        };
      }
      let html = renderAnnBuilder({ ...options.draft, role: readonly ? "editor" : "owner" }, user, options);
      if (url.searchParams.get("device") === "mobile") {
        html = html.replace('id="ann-canvas" data-device="desktop"', 'id="ann-canvas" data-device="mobile"')
          .replace('data-device="desktop" aria-pressed="true"', 'data-device="desktop" aria-pressed="false"')
          .replace('data-device="mobile" aria-pressed="false"', 'data-device="mobile" aria-pressed="true"');
      }
      // Fixed, development-only capture targets. No arbitrary selectors or
      // executable query text enter the page; the production Worker excludes
      // this entire isolated fixture.
      const target = {
        "before-after": '[data-niche-section="before-after"]',
        bundle: ".sc-bundle", reviews: ".sc-reviews", ugc: ".sc-ugcs",
        guide: "[data-niche-profile]", footer: ".sc-ft",
      }[url.searchParams.get("section")];
      if (typeof target === "string") html = html.replace("</body>", `<script>
        document.getElementById("ann-preview").addEventListener("load",()=>setTimeout(()=>{
          document.getElementById("ann-preview").contentDocument?.querySelector(${JSON.stringify(target)})?.scrollIntoView({block:"start",behavior:"instant"});
        },180));
      </script></body>`);
      response = new Response(req.method === "HEAD" ? null : html,
      { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    } else {
      const match = url.pathname.match(/^\/__ann-builder-preview\/(?:api|read-only-api)\/(reference|session|application|readiness|media|design|launch|onboarding)$/);
      if (!match) response = new Response("Not found", { status: 404 });
      else {
        url.pathname = `/api/stores/${storeId}/ann/${match[1]}`;
        const headers = new Headers(req.headers);
        // The production handler requires its account origin. Translate only
        // the explicitly configured same-origin development request.
        const incomingOrigin = headers.get("origin");
        // The shared development proxy strips its public port. This translation
        // applies only to the isolated fixture, never to production CSRF checks.
        let fixtureOrigin = incomingOrigin === url.origin;
        try {
          const hostname = new URL(incomingOrigin).hostname;
          fixtureOrigin ||= ["localhost", "127.0.0.1", new URL(previewOrigin).hostname, process.env.REPLIT_DEV_DOMAIN].includes(hostname);
        } catch { /* Missing or invalid origins remain rejected. */ }
        if (fixtureOrigin) headers.set("origin", APP_ORIGIN);
        const init = { method: req.method, headers };
        if (!["GET", "HEAD"].includes(req.method)) Object.assign(init, { body: Readable.toWeb(req), duplex: "half" });
        response = await handleAnnRoutes(new Request(url, init), {MEDIA:fixtureMedia}, db, user, hash);
      }
    }
    // Fixture photos never request production media. All bytes and records
    // above belong to this isolated process, not a merchant's R2 bucket.
    if(response.body&&/application\/json|text\/html/.test(response.headers.get("content-type")||"")){
      // Images use the existing local-image namespace. Keep video URLs in their
      // real allowlisted shape; isolated browser tests intercept these exact
      // synthetic-store URLs and fulfill them from the in-memory media route.
      let text=(await response.text()).replace(
        new RegExp(`https://media\\.lebrands\\.store/stores/${storeId}/([a-f0-9-]{36}\\.(?:png|jpe?g|webp|svg))`,"gi"),
        (_,file)=>ANN_FIXTURE_MEDIA_PREFIX+file);
      if(/application\/json/.test(response.headers.get("content-type")||"")){
        const body=JSON.parse(text);
        if(body.publish_url)body.publish_url=`${prefix}/review`;
        text=JSON.stringify(body);
      }
      response=new Response(text,{status:response.status,headers:response.headers});
    }
    res.statusCode = response.status;
    for (const [key, value] of response.headers) res.setHeader(key, value);
    if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
  } catch (error) {
    // This fixture has no credentials or live connections. Report only its
    // local failure message, never a Request, environment or SQL payload.
    console.error("Isolated Ann fixture:", error.code || "fixture_error", error.message);
    res.statusCode = 503;
    res.setHeader("content-type", "application/json");
    res.end('{"error":"The isolated Ann preview fixture could not start."}');
  }
  return true;
}
