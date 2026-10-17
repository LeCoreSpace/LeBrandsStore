import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {parseCsv} from "./ann-reference-seed.js";
import {DIMENSIONS, PROFILES, profileForType} from "./d2c-variant-profiles.js";
const hash = value => createHash("sha256").update(value).digest("hex");
const stable = (prefix, value) => `${prefix}_${hash(value.toLocaleLowerCase("en")).slice(0,32)}`;
export async function d2cVariantSeed() {
  const bytes = await readFile(new URL("../attached_assets/all_product_types_1792232609406.csv",import.meta.url));
  if(hash(bytes)!=="6da7213349f3b124dcf0f339193d471941e7115af644e007c4e6e545cdcdd221") throw Error("Product-type source changed; create a new reviewed migration.");
  const source = parseCsv(bytes.toString("utf8"));
  const options = new Map();
  const profiles = Object.entries(PROFILES).sort(([a],[b])=>a.localeCompare(b,"en")).map(([key,p])=>({
    key,title:p.title,axes:p.axes.map((axis,position)=>{
      const d=DIMENSIONS[axis]; if(!d) throw Error(`Unknown dimension ${axis}`);
      const [name,labels]=d, option_key=stable("option",name);
      if(!options.has(option_key))options.set(option_key,{key:option_key,name,items:[]});
      const option=options.get(option_key);
      for(const label of labels) if(!option.items.some(v=>v.label.toLowerCase()===label.toLowerCase()))
        option.items.push({key:stable("d2c_value",label),label,sort_order:option.items.length});
      return {option_key,position,labels};
    }),
  }));
  const assignments=source.map(t=>{
    const profile_key=profileForType(t.type_key);
    if(!PROFILES[profile_key])throw Error(`No curated variant profile: ${t.type_key}`);
    return{type_key:t.type_key,profile_key};
  }).sort((a,b)=>a.type_key.localeCompare(b.type_key,"en"));
  if(assignments.length!==1698||new Set(assignments.map(t=>t.type_key)).size!==1698)throw Error("Unexpected product-type count.");
  const payload={options:[...options.values()].sort((a,b)=>a.key.localeCompare(b.key,"en")),profiles,assignments};
  return {payload,sql:`INSERT INTO d2c_variant_seed(payload) VALUES ('${JSON.stringify(payload).replaceAll("'","''")}'::jsonb);`};
}
