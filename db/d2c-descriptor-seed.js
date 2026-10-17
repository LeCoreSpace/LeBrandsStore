import {createHash} from "node:crypto";
import {d2cVariantSeed} from "./d2c-variant-seed.js";
import {reviewedCatalogueSeed} from "./catalogue-reviewed-seed.js";
import {DESCRIPTORS} from "./d2c-descriptor-definitions.js";
import {DESCRIPTOR_PROFILES,DESCRIPTOR_TYPE_OVERRIDES} from "./d2c-descriptor-profiles.js";
import {canonicalLabel} from "./catalogue-audit.js";

const hash=v=>createHash("sha256").update(v).digest("hex").slice(0,32);
export async function d2cDescriptorSeed(){
  const [{payload:variants},{payload:reviewed}]=await Promise.all([d2cVariantSeed(),reviewedCatalogueSeed()]);
  const typeKeys=new Set(variants.assignments.map(t=>t.type_key)),overrides=new Map();
  for(const[profile,words]of DESCRIPTOR_TYPE_OVERRIDES)for(const key of words.split(/\s+/)){
    if(!typeKeys.has(key)||overrides.has(key))throw Error(`Invalid descriptor override: ${key}`);
    overrides.set(key,profile);
  }
  const existingNames=new Map(),oldDefs=new Map(reviewed.descriptors.map(d=>[d.key,d]));
  for(const link of reviewed.descriptor_links){
    const names=existingNames.get(link.type_key)||new Set();
    names.add(canonicalLabel(oldDefs.get(link.descriptor_key).name));
    existingNames.set(link.type_key,names);
  }
  const definitions=new Map(),assignments=[],profiles=[];
  for(const t of variants.assignments){
    const profile_key=overrides.get(t.type_key)||t.profile_key;
    if(!DESCRIPTOR_PROFILES[profile_key])throw Error(`No descriptor profile: ${t.type_key}`);
    const fields=["manufacturer","origin","contents",...DESCRIPTOR_PROFILES[profile_key].split(" ")];
    if(new Set(fields).size!==fields.length)throw Error(`Repeated descriptor in ${profile_key}`);
    const names=new Set();
    for(const[fieldIndex,field]of fields.entries()){
      const def=DESCRIPTORS[field];
      if(!def)throw Error(`Unknown descriptor: ${profile_key}:${field}`);
      if(names.has(canonicalLabel(def.name)))throw Error(`Repeated descriptor label in ${profile_key}`);
      names.add(canonicalLabel(def.name));
      if(existingNames.get(t.type_key)?.has(canonicalLabel(def.name)))continue;
      const key=`d2c_descriptor_${hash(JSON.stringify(def))}`;
      if(!definitions.has(key))definitions.set(key,{key,...def,items:def.values.map((label,sort_order)=>({
        key:`d2c_value_${hash(label.toLowerCase())}`,label,sort_order,
      }))});
      assignments.push({type_key:t.type_key,descriptor_key:key,sort_order:1000+fieldIndex});
    }
    profiles.push({type_key:t.type_key,profile_key,fields:fields.map(f=>DESCRIPTORS[f].name)});
  }
  const payload={descriptors:[...definitions.values()].sort((a,b)=>a.key.localeCompare(b.key,"en")),
    assignments,profiles};
  if(profiles.length!==1698)throw Error("Incomplete descriptor coverage");
  return{payload,sql:`INSERT INTO d2c_descriptor_seed(payload) VALUES ('${JSON.stringify(payload).replaceAll("'","''")}'::jsonb);`};
}
