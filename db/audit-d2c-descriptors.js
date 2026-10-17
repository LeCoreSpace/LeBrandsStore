import postgres from "postgres";
import {mkdir,writeFile} from "node:fs/promises";
import {clearPgEnvironment,validateSupabaseUrl,logDatabaseFailure} from "./connection.js";
import {d2cDescriptorSeed} from "./d2c-descriptor-seed.js";
import {csvText} from "./catalogue-audit.js";

clearPgEnvironment();
let sql;
try{
  validateSupabaseUrl(process.env.SUPABASE_DB_URL);
  sql=postgres(process.env.SUPABASE_DB_URL,{ssl:"require",max:1});
  const {payload}=await d2cDescriptorSeed();
  const rows=await sql`SELECT t.type_key,t.name AS product_type,d.id AS descriptor_id,
    d.descriptor_key,d.name AS descriptor,d.input_type,d.unit,m.is_required,
    COALESCE((SELECT jsonb_agg(v.label ORDER BY v.sort_order,v.id)
      FROM public.catalogue_descriptor_values v WHERE v.descriptor_id=d.id
      AND v.is_active AND v.review_status='approved'),'[]'::jsonb)::text AS preset_values
    FROM public.catalogue_product_types t JOIN public.catalogue_product_type_descriptors m ON m.product_type_id=t.id
    JOIN public.catalogue_descriptors d ON d.id=m.descriptor_id
    WHERE t.is_active AND t.review_status='approved' AND m.is_active AND m.review_status='approved'
      AND d.is_active AND d.review_status='approved' ORDER BY t.type_key,m.sort_order,d.id`;
  const byType=new Map();
  for(const row of rows){const list=byType.get(row.type_key)||[];list.push(row);byType.set(row.type_key,list);}
  const coverage=payload.profiles.map(p=>{
    const refs=byType.get(p.type_key)||[];
    if(!refs.length)throw Error(`No active descriptors: ${p.type_key}`);
    for(const name of p.fields)if(!refs.some(r=>r.descriptor.toLowerCase().trim()===name.toLowerCase().trim()))
      throw Error(`Missing expected descriptor ${p.type_key}:${name}`);
    return{type_key:p.type_key,profile:p.profile_key,descriptor_count:refs.length,descriptors:refs.map(r=>r.descriptor)};
  });
  const [counts]=await sql`SELECT
    (SELECT count(*)::int FROM catalogue_descriptors) AS descriptor_definitions,
    (SELECT count(*)::int FROM catalogue_descriptor_values) AS descriptor_values,
    (SELECT count(*)::int FROM catalogue_product_type_descriptors WHERE is_active AND review_status='approved') AS active_type_descriptor_links`;
  const summary={...counts,source_product_types:payload.profiles.length,types_with_descriptors:coverage.length,
    types_missing_descriptors:payload.profiles.length-coverage.length,
    descriptor_profiles:new Set(payload.profiles.map(p=>p.profile_key)).size,
    added_curated_definitions:payload.descriptors.length,
    added_preset_values:payload.descriptors.reduce((n,d)=>n+d.items.length,0)};
  const output="generated-artifacts/d2c-descriptors";
  await mkdir(output,{recursive:true});
  await writeFile(`${output}/coverage.csv`,csvText(coverage,["type_key","profile","descriptor_count","descriptors"]));
  await writeFile(`${output}/details.csv`,csvText(rows,["type_key","product_type","descriptor_id","descriptor","input_type","unit","is_required","preset_values"]));
  await writeFile(`${output}/summary.json`,JSON.stringify(summary,null,2)+"\n");
  console.log(JSON.stringify(summary,null,2));
}catch(error){
  logDatabaseFailure("D2C descriptor audit failed",error,process.env.SUPABASE_DB_URL);
  process.exitCode=1;
}finally{await sql?.end({timeout:5});}
