import {renderMediaLibrary} from "./ui/media-library.js";
import {mediaLibraryFilters} from "./dashboard/media-library.js";
import {buildMediaSizeGuide} from "./public/media-placement-guide.js";

// Read-only, development-only visual fixture. Never registered by production.
export function mediaLibraryPreview(request,store,settings={}){
  const filters=mediaLibraryFilters(new URL(request.url));
  const items=["indigo-shirt","ecru-shirt","rust-kurta","olive-overshirt","ecru-trousers","indigo-kurta"].map((name,i)=>({
    id:`example-media-${i}`,url:`/__example-media/${name}.webp`,filename:`${name}.webp`,
    kind:"image",upload_type:"image",content_type:"image/webp",size_bytes:64000+i*1800,
    width:2000,height:2500,alt_text:`Example ${name.replaceAll("-"," ")}`,created_at:"2026-10-21T08:00:00Z",
    usage:i<2?[{label:"Example product reference",href:`/stores/${store.store_id}/products`}]:[],usage_checked:true
  }));
  const selected=items.filter(m=>(filters.type==="all"||filters.type===m.kind)
    &&m.filename.includes(filters.query.toLowerCase()));
  const data={store,role:"editor",...filters,items:selected.slice(filters.offset,filters.offset+36),
    total:selected.length,library_total:items.length,has_more:false,storage:{used:410000,limit:536870912},
    size_guide:buildMediaSizeGuide({storeId:store.store_id,settings,theme:filters.guide_theme,category:filters.guide_category})};
  return new Response(request.method==="HEAD"?null:renderMediaLibrary(data,{name:"Example reviewer"},{base:"/__media-library-preview"}),
    {headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-robots-tag":"noindex, nofollow"}});
}
