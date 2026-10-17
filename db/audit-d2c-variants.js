import postgres from "postgres";
import {mkdir,writeFile} from "node:fs/promises";
import {clearPgEnvironment,validateSupabaseUrl,logDatabaseFailure} from "./connection.js";
clearPgEnvironment();
let sql;
try{
  validateSupabaseUrl(process.env.SUPABASE_DB_URL);
  sql=postgres(process.env.SUPABASE_DB_URL,{ssl:"require",max:1});
  const rows=await sql`SELECT t.type_key,t.name,p.profile_key,t.review_status,t.is_active,
    (SELECT count(*)::int FROM public.catalogue_subcategory_product_types st
      WHERE st.product_type_id=t.id AND st.is_active AND st.review_status='approved') AS memberships,
    (SELECT count(*)::int FROM public.catalogue_product_type_options o
      WHERE o.product_type_id=t.id AND o.is_active AND o.review_status='approved') AS option_count
    FROM public.catalogue_product_types t LEFT JOIN public.catalogue_variant_profile_assignments p ON p.product_type_id=t.id
    ORDER BY t.type_key`;
  const [counts]=await sql`SELECT
    (SELECT count(*)::int FROM public.catalogue_variant_options WHERE is_active AND review_status='approved') AS variant_options,
    (SELECT count(*)::int FROM public.catalogue_variant_option_values WHERE store_id IS NULL AND is_active AND review_status='approved') AS shared_values,
    (SELECT count(*)::int FROM public.catalogue_product_type_options WHERE is_active AND review_status='approved') AS type_option_links,
    (SELECT count(*)::int FROM public.catalogue_product_type_option_values WHERE store_id IS NULL AND is_active AND review_status='approved') AS type_value_links`;
  const summary={product_types:rows.length,covered_types:rows.filter(r=>r.profile_key&&r.option_count>0).length,
    profiles:new Set(rows.map(r=>r.profile_key).filter(Boolean)).size,active_types:rows.filter(r=>r.is_active).length,
    types_missing_memberships:rows.filter(r=>!r.memberships).length,...counts};
  if(summary.product_types!==1698||summary.covered_types!==1698)throw Error("Incomplete D2C variant coverage.");
  const output="generated-artifacts/d2c-variants";
  await mkdir(output,{recursive:true});
  const quote=v=>`"${String(v??"").replaceAll('"','""')}"`;
  const keys=["type_key","name","profile_key","review_status","is_active","memberships","option_count"];
  await writeFile(`${output}/coverage.csv`,[keys.join(","),...rows.map(r=>keys.map(k=>quote(r[k])).join(","))].join("\n")+"\n");
  await writeFile(`${output}/summary.json`,JSON.stringify(summary,null,2)+"\n");
  console.log(JSON.stringify(summary,null,2));
}catch(error){logDatabaseFailure("D2C variant coverage audit failed",error,process.env.SUPABASE_DB_URL);process.exitCode=1;}
finally{if(sql)await sql.end();}
