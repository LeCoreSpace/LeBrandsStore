import {buildMediaSizeGuide} from "../public/media-placement-guide.js";

// Exact provider-compatible dimensions: multiples of 16, at most 1.6 MP.
// There is no merchant crop step or client-selected output size/model.
const SIZES={"1:1":[1024,1024],"4:5":[1024,1280],"3:4":[960,1280],
  "4:3":[1280,960],"16:9":[1536,864],"16:10":[1536,960],"3:2":[1536,1024],"9:16":[864,1536]};
export function imagePlacements(settings,storeId){
  const guide=buildMediaSizeGuide({settings,storeId});
  return guide.items.filter(i=>!["product-video","home-hero-video","press-logo","cart-thumb"].includes(i.id)
    &&i.formats.some(f=>["PNG","JPEG","WebP"].includes(f))).map(i=>{
    const ratio=SIZES[i.desktop.ratio]?i.desktop.ratio:i.id==="brand-logo"?"3:2":"4:3";
    const [width,height]=SIZES[ratio];
    return{id:i.id,title:i.title,category:i.category,width,height,ratio};
  });
}
export function imageInput(body,placements){
  const fail=message=>{throw Object.assign(new Error(message),{status:400});};
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if(!body||typeof body!=="object"||Array.isArray(body))fail("Describe the image using the generation form.");
  const placement=placements.find(p=>p.id===body.placement_id);
  if(!placement)fail("Choose an image placement.");
  if(typeof body.prompt!=="string"||body.prompt.trim().length<10||body.prompt.length>1500||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(body.prompt))fail("Use a description between 10 and 1,500 characters.");
  if(!uuid.test(body.request_id||""))fail("Refresh the generation form before trying again.");
  if(body.reference_id!=null&&!uuid.test(body.reference_id))fail("Choose a reference from your media library.");
  if(Object.keys(body).some(k=>!["placement_id","prompt","reference_id","request_id"].includes(k)))fail("Image settings are chosen by the placement.");
  return{...placement,prompt:body.prompt.trim(),reference_id:body.reference_id||null,request_id:body.request_id};
}
