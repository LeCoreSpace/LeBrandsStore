import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { defaultPageLayouts, validateLayout, sanitizeRichText, mergeSettingsToLayouts, SECTION_SCHEMAS, PAGE_KEYS } from "../src/public/aura-layout.js";
import { compilePageSchemaSnapshot } from "../db/page-schema-migration.js";
import { renderAura } from "../src/public/aura.js";

const id = "11111111-1111-4111-8111-111111111111";
const data = { store: { store_id:id,name:"Actual merchant",subdomain:"actual" }, settings:{brand_name:"Actual merchant",tagline:"Original title",description:"Actual description",color_preset:"ivory",font_preset:"serif",accent_color:"#214a3d"}, products:[],policies:[] };
const make = () => structuredClone(defaultPageLayouts(data).home);
test("all canonical pages validate and registry matches the immutable migration snapshot", async () => {
  const layouts=defaultPageLayouts(data);
  for(const page of PAGE_KEYS)assert.ok(validateLayout(page,layouts[page],{storeId:id}).length>=2,page);
  const snapshot=JSON.parse(await readFile(new URL("../db/schema-snapshots/aura-v1.json",import.meta.url),"utf8"));
  const sections=Object.fromEntries(Object.entries(SECTION_SCHEMAS).map(([id,s])=>[id,{pages:s.allowedPages,fields:s.fields,min:s.minItems,max:s.maxItems,blocks:s.blockFields,required:s.requiredOn}]));
  const packed=compilePageSchemaSnapshot({sections,pages:PAGE_KEYS});
  assert.deepEqual(compilePageSchemaSnapshot(snapshot),packed);
});
for(const [name,mutate] of [
  ["unknown section",x=>x[1].type="foreign"],
  ["unknown field",x=>x.find(s=>s.type==="hero").settings.private_html="<script>"],
  ["wrong field type",x=>x.find(s=>s.type==="hero").settings.title=44],
  ["oversized text",x=>x.find(s=>s.type==="hero").settings.title="a".repeat(241)],
  ["script URL",x=>x.find(s=>s.type==="hero").settings.link="javascript:alert(1)"],
  ["private URL",x=>x.find(s=>s.type==="hero").settings.link="https://127.0.0.1/private"],
  ["unsafe rich text",x=>x.find(s=>s.type==="hero").settings.description='<p onclick="alert(1)">Hi</p>'],
  ["missing header",x=>x.splice(x.findIndex(s=>s.type==="header"),1)],
  ["disabled footer",x=>x.at(-1).settings.enabled=false],
  ["numeric instance id",x=>x[0].id=2],
  ["foreign-store image",x=>x.find(s=>s.type==="hero").settings.image={url:"https://media.lebrands.store/stores/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp",alt:"Actual photo"}],
  ["video without poster",x=>{const s=x.find(s=>s.type==="hero").settings;s.variant="video";s.video={url:`https://media.lebrands.store/stores/${id}/33333333-3333-4333-8333-333333333333.mp4`,alt:"Brand video"};}],
]) test(`layout rejects ${name}`,()=>{const x=make();mutate(x);assert.throws(()=>validateLayout("home",x,{storeId:id}));});
test("rich text keeps only balanced allowed formatting",()=>{
  assert.equal(sanitizeRichText("<p>A <strong>real</strong> story.</p>"),"<p>A <strong>real</strong> story.</p>");
  for(const html of ["<script>x</script>","<strong>x","<p style='x'>y</p>","<iframe></iframe>"])assert.throws(()=>sanitizeRichText(html));
});
test("wizard changes preserve custom section order and unrelated fields",()=>{
  const layouts=defaultPageLayouts(data);
  const hero=layouts.home.find(x=>x.type==="hero");hero.settings.label="Merchant button";
  layouts.home.splice(2,0,{id:"custom-statement",type:"statement",settings:{enabled:true,kicker:"",text:"Keep this"},blocks:[]});
  const merged=mergeSettingsToLayouts(layouts,{...data.settings,tagline:"New title"},data,["tagline"]);
  assert.deepEqual(merged.home.map(x=>x.id),layouts.home.map(x=>x.id));
  assert.equal(merged.home.find(x=>x.type==="hero").settings.title,"New title");
  assert.equal(merged.home.find(x=>x.type==="hero").settings.label,"Merchant button");
  assert.equal(merged.home.find(x=>x.id==="custom-statement").settings.text,"Keep this");
  assert.equal(hero.settings.title,"Original title","Input remains unmodified.");
});
test("explicit published layout never falls back to settings or missing page drafts",()=>{
  assert.doesNotMatch(renderAura({...data,layouts:{}}),/<section/);
  const layouts=defaultPageLayouts(data);
  layouts.home.find(x=>x.type==="hero").settings.title="Published title";
  assert.match(renderAura({...data,settings:{...data.settings,tagline:"Secret draft"},layouts}),/Published title/);
  assert.doesNotMatch(renderAura({...data,settings:{...data.settings,tagline:"Secret draft"},layouts}),/<h1[^>]*>Secret draft/);
});
