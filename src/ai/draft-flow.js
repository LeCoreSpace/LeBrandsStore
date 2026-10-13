import { SECTION_SCHEMAS } from "../public/aura-layout.js";
import { mediaUrl } from "../store/media.js";
import { aiError } from "./input.js";
import { updateJob } from "./repository.js";

export const isWholeDraft = job => job.plan?.[0]?.workflow === "whole-store" ||
  job.approved?.[0]?.workflow === "whole-store" || job.candidate?._whole_store === true;

export async function resumeWholeDraft(tx,job) {
  if (!["ready","review","failed"].includes(job.status)) throw aiError("This build is not ready to resume.",409);
  return updateJob(tx,job,{candidate:{...job.candidate,_whole_store:true,_retry_count:0},
    status:"queued",error:null,lease_until:null});
}

export function imageSources(image) {
  return (image.sources||[]).map(source=>({...source,
    height:source.height||Math.round(image.height*source.width/image.width)}));
}

export function fillDeferredImages(prepared,products){
  const photos=products.flatMap(product=>product.images||[]).filter(photo=>photo?.url);
  for(const item of prepared){
    if(!item.deferred_images||!item.section?.blocks.length)continue;
    for(const [index,block] of item.section.blocks.entries()){
      const photo=photos[index%photos.length];
      if(!block.settings.image&&photo)block.settings.image=Object.fromEntries(
        Object.entries(photo).filter(([key])=>["url","alt","width","height","sources"].includes(key)));
    }
    item.section.settings.enabled=item.section.blocks.every(block=>Boolean(block.settings.image));
  }
}
export function attachImages(candidate) {
  const section=candidate.section,images=(candidate.images||[]).filter(i=>i.status==="approved");
  if(!section||!images.length)return;
  const media=image=>({url:mediaUrl(image.key),alt:image.label,width:image.width,height:image.height,sources:imageSources(image)});
  const schema=SECTION_SCHEMAS[section.type];
  if(schema.fields.image)section.settings.image=media(images[0]);
  if(schema.blockFields?.image){
    for(const [index,image] of images.entries()){
      if(!section.blocks[index])section.blocks.push({id:`ai-photo-${index+1}`,type:"item",settings:
        Object.fromEntries(Object.entries(schema.blockFields).map(([key,field])=>[key,field.default??""]))});
      section.blocks[index].settings.image=media(image);
    }
  }
}

export async function advanceWholeDraft(tx,job) {
  const step=job.plan[job.cursor],candidate=job.candidate;
  if(!isWholeDraft(job)||!step||!candidate)throw aiError("The complete draft is not ready.",409);
  if((candidate.images||[]).some(image=>image.status!=="discarded"&&!image.media_id)){
    throw aiError("Wait for draft images to finish.",409);
  }
  const prepared={...candidate,workflow:"whole-store",page:step.page,type:step.type,label:step.label,product_id:step.product_id};
  const cursor=job.cursor+1;
  return updateJob(tx,job,{approved:[...job.approved,prepared],cursor,candidate:null,error:null,
    lease_until:null,status:cursor===job.plan.length?"ready_to_save":"queued"});
}
