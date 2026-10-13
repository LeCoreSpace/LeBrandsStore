import { aiError } from "./input.js";
import { productContent } from "./plan.js";
import { updateJob } from "./repository.js";
import { saveSetup,saveProduct,loadDraft,regeneratePolicies,savePolicy } from "../store/repository.js";
import { savePage } from "../store/pages.js";
import { saveCollection } from "../store/catalog.js";
import { defaultPageLayouts,validateLayout } from "../public/aura-layout.js";
import {validateBasics} from "../public/validation.js";
import { isWholeDraft,attachImages,imageSources } from "./draft-flow.js";

export async function completeBuild(tx,job,hash) {
  if(job.status!=="ready_to_save"||job.cursor!==job.plan.length||job.approved.length!==job.plan.length)throw aiError("Wait for the complete store draft before saving.",409);
  const storeId=job.store_id;
  const [unchanged]=await tx`SELECT updated_at IS NOT DISTINCT FROM ${job.base_updated_at} AS ok FROM public.store_setup WHERE store_id=${storeId}`;
  if(!unchanged?.ok)throw aiError("Store settings changed during the build. Your current draft is unchanged. Cancel this build and restart with the latest settings.",409);
  const rows=await tx`SELECT page_key,version FROM public.store_pages WHERE store_id=${storeId}`;
  for(const row of rows)if(row.version!==(job.base_versions[row.page_key]?.version??0))throw aiError("A page changed during the build. Your current draft is unchanged. Restart with the latest pages.",409);
   if(isWholeDraft(job)){
     for(const prepared of job.approved){
       for(const image of prepared.images||[]){
         if(image.status==="discarded")continue;
         if(!image.media_id)throw aiError("Wait for all draft images to finish.",409);
         const owned=await tx`UPDATE public.media SET approval_status='approved',renditions=${tx.json(imageSources(image))}
           WHERE store_id=${job.store_id} AND id=${image.media_id} AND object_key=${image.key}
             AND ai_generated AND approval_status IN('pending','approved') RETURNING id`;
         if(!owned.length)throw aiError("A generated draft image is unavailable.",409);
         image.status="approved";
       }
       attachImages(prepared);
     }
   }
  const b=job.brief.brand,s=job.brief.selling;
  const existing=await loadDraft(tx,storeId);
  const category=validateBasics({...existing.settings,category:b.category}).category?existing.settings.category:b.category;
  await saveSetup(tx,storeId,{brand_name:b.name,tagline:b.tagline,description:b.sells,category,
    support_email:s.contact_email,support_phone:s.phone,address:existing.settings.address||s.address,theme:"aura",font_preset:"modern",
    color_preset:"white",accent_color:b.colours[0]||"#214a3d",...(b.logo_id?{logo_media_id:b.logo_id}:{})});
  for(const product of job.brief.products){
    const [exists]=await tx`SELECT id FROM public.products WHERE store_id=${storeId} AND id=${product.id}`;
    if(!exists)await tx`INSERT INTO public.products(id,store_id,title,slug,price_paise,gst_rate,stock,track_inventory)
      VALUES(${product.id},${storeId},${product.name},${product.id},${product.price_paise},${product.gst_rate},${product.stock},true)`;
    const step=job.approved.find(item=>item.product_id===product.id);
    const generated=(step?.images||[]).filter(image=>image.status==="approved").map(image=>({id:image.media_id,alt:`${product.name}: AI image approved by the brand`}));
    await saveProduct(tx,storeId,product.id,{title:product.name,description:product.description||product.features.join("\n"),hsn_code:product.hsn,
      images:[...product.photo_ids.map(id=>({id,alt:product.name})),...generated],
      content:step?.content||productContent(product,s)});
  }
  await tx`INSERT INTO public.collections(id,store_id,title,slug,description)
    VALUES(${job.brief.collection_id},${storeId},${b.category},${`ai-${job.brief.collection_id.slice(0,8)}`},${b.sells})`;
  await saveCollection(tx,storeId,job.brief.collection_id,{product_ids:job.brief.products.map(p=>p.id)});
  const setup=await loadDraft(tx,storeId);
  if(!Object.keys(validateBasics(setup.settings)).length)await regeneratePolicies(tx,storeId);
  else{
    for(const kind of ["privacy","terms","shipping","cancellation-refund","contact","pricing"]){
      await tx`INSERT INTO public.policy_pages(store_id,slug,title,content)
        VALUES(${storeId},${kind},${kind==="cancellation-refund"?"Cancellation and refunds":kind},
          'Review before publishing. Complete the registered business details and review this policy. No missing legal details have been invented.')
        ON CONFLICT(store_id,slug) DO NOTHING`;
    }
  }
  for(const approved of job.approved){
    if(!approved.page.startsWith("policy-")||!approved.body||approved.page.endsWith("privacy")||approved.page.endsWith("terms"))continue;
    await savePolicy(tx,storeId,approved.page.slice(7),{body:`Review before publishing.\n\n${approved.body}`,reviewed:false});
  }
  const data=await loadDraft(tx,storeId);
  const layouts={...defaultPageLayouts(data)};
  for(const page of ["home","collection","product","cart","checkout"]){
    layouts[page]=job.approved.filter(item=>item.page===page&&item.section).map(item=>item.section);
  }
  for(const page of ["about","contact"]){
    const body=job.approved.find(item=>item.page===page&&item.body)?.body||"";
    for(const section of layouts[page]){
      if(section.type==="about"){
        if("body" in section.settings)section.settings.body=body;
        if("text" in section.settings)section.settings.text=body;
      }
    }
  }
  const faq=job.approved.find(item=>item.page==="faq"&&item.section)?.section;
  if(faq)layouts.faq=layouts.faq.map(section=>section.type==="faq"?faq:section);
  const context={storeId,productIds:new Set(data.products.map(p=>p.id)),collectionIds:new Set(data.collections.map(c=>c.id))};
  for(const [page,layout] of Object.entries(layouts)){
    await savePage(tx,storeId,page,validateLayout(page,layout,context),data.page_versions?.[page]?.version||0,hash,data);
  }
  await tx`UPDATE public.policy_pages SET reviewed_at=null WHERE store_id=${storeId}`;
  return updateJob(tx,job,{status:"completed",completed_at:new Date(),candidate:null});
}
