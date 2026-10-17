import postgres from "postgres";
import {mkdir,writeFile} from "node:fs/promises";
import {clearPgEnvironment,validateSupabaseUrl,logDatabaseFailure} from "./connection.js";
import {d2cTypeMembershipSeed} from "./d2c-type-memberships.js";
import {csvText} from "./catalogue-audit.js";

clearPgEnvironment();
let sql;
try {
  validateSupabaseUrl(process.env.SUPABASE_DB_URL);
  sql=postgres(process.env.SUPABASE_DB_URL,{ssl:"require",max:1});
  const {payload}=await d2cTypeMembershipSeed();
  const rows=await sql`SELECT t.type_key,t.name AS product_type,c.category_id,c.name AS category,
    s.subcategory_id,s.name AS subcategory,t.review_status,t.is_active,p.profile_key,
    (SELECT count(*)::int FROM public.catalogue_product_type_options o
      WHERE o.product_type_id=t.id AND o.is_active AND o.review_status='approved') AS variant_options,
    (SELECT count(*)::int FROM public.catalogue_product_type_descriptors d
      WHERE d.product_type_id=t.id AND d.is_active AND d.review_status='approved') AS descriptors
    FROM public.catalogue_product_types t
    JOIN public.catalogue_subcategory_product_types m ON m.product_type_id=t.id AND m.is_active AND m.review_status='approved'
    JOIN public.catalogue_subcategories s ON s.subcategory_id=m.subcategory_id AND s.is_active
    JOIN public.catalogue_categories c ON c.category_id=s.category_id AND c.is_active
    LEFT JOIN public.catalogue_variant_profile_assignments p ON p.product_type_id=t.id ORDER BY t.type_key,s.subcategory_id`;
  const live=new Map(rows.map(r=>[`${r.type_key}:${r.subcategory_id}`,r]));
  for(const a of payload.assignments){
    const r=live.get(`${a.type_key}:${a.subcategory_id}`);
    if(!r||!r.is_active||r.review_status!=="approved"||!r.profile_key||!r.variant_options)
      throw Error(`Missing active functional membership/variant profile: ${a.type_key}:${a.subcategory_id}`);
  }
  const known=new Set(payload.assignments.map(a=>a.type_key));
  const sourceRows=rows.filter(r=>known.has(r.type_key));
  const types=new Map(sourceRows.map(r=>[r.type_key,r]));
  const summary={source_product_types:known.size,active_mapped_types:types.size,missing_memberships:known.size-types.size,
    approved_type_links:sourceRows.length,previously_reviewed_links:payload.assignments.filter(a=>a.basis==="previously_reviewed").length,
    new_general_purpose_subcategories:payload.subcategories.length,
    types_with_variant_options:[...types.values()].filter(r=>r.variant_options>0).length,
    types_with_descriptors:[...types.values()].filter(r=>r.descriptors>0).length};
  const report=sourceRows.map(r=>({...r,basis:payload.assignments.find(a=>a.type_key===r.type_key&&a.subcategory_id===Number(r.subcategory_id))?.basis||"existing_reference"}));
  const output="generated-artifacts/d2c-memberships";
  await mkdir(output,{recursive:true});
  await writeFile(`${output}/memberships.csv`,csvText(report,["type_key","product_type","category_id","category","subcategory_id","subcategory","profile_key","variant_options","descriptors","basis"]));
  await writeFile(`${output}/summary.json`,JSON.stringify(summary,null,2)+"\n");
  console.log(JSON.stringify(summary,null,2));
} catch(error) {
  logDatabaseFailure("D2C membership audit failed",error,process.env.SUPABASE_DB_URL);
  process.exitCode=1;
} finally { await sql?.end({timeout:5}); }
