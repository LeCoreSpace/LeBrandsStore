import {SECURITY_HEADERS} from "../auth/security.js";
import {UUID} from "../public/validation.js";
import {commerceError} from "../public/commerce-rules.js";
import {dashboardAccess} from "../dashboard/repository.js";
import {pagesEnabled,pageLayouts,skeletonEnabled} from "../store/pages.js";
import {serveStoreDiscovery,storeCanonicalOrigin,storeDiscoveryPages} from "../store/discovery.js";
import {blogPublications,parseBlogJSON} from "./publication.js";
import {renderStoreDiscovery} from "../ui/store-discovery.js";

export const isContentLLMPath=path=>/^\/(?:api\/)?stores\/[^/]+\/content-llm$/.test(path);
export async function storeDiscoveryDashboard(tx,id){
  const [store]=await tx`SELECT store_id,name,subdomain,status FROM public.stores WHERE store_id=${id}`;
  const [publication]=await tx`SELECT snapshot::text AS snapshot,
    (SELECT hostname FROM public.domains WHERE store_id=${id} AND status='active' AND is_primary=true ORDER BY hostname LIMIT 1) AS hostname
    FROM public.store_publications WHERE store_id=${id}`;
  let data=publication?.snapshot?parseBlogJSON(publication.snapshot):null;
  const published=store?.status==="live"&&!!data;
  if(data){
    data={...data,store:{...data.store,...store},settings:{...data.settings,subdomain:store.subdomain}};
    if(await pagesEnabled(tx)){
      const layouts=await pageLayouts(tx,id,{published:true});
      data={...data,layouts:layouts.layouts,aura_skeleton_enabled:await skeletonEnabled(tx)};
    }
    Object.assign(data,await blogPublications(tx,id));
  }
  const origin=storeCanonicalOrigin({store},publication?.hostname);
  const paths=["/robots.txt","/sitemap.xml","/llms.txt","/llm.txt"];
  const shards=published?Math.ceil(storeDiscoveryPages(data).length/20000):0;
  // A bounded view page shows complete shard bodies, never truncated files.
  const files=[];
  for(const path of paths){
    const response=serveStoreDiscovery(new Request(origin+path),published?data:null,origin);
    files.push({name:path.slice(1),path,url:origin+path,status:response.status,content:await response.text(),
      location:response.headers.get("location"),content_type:response.headers.get("content-type")});
  }
  return {store,available:true,published,origin,files,sitemap_shards:shards>1?shards:0};
}
export async function handleContentLLM(request,db,user,token,id){
  const headers={...SECURITY_HEADERS,"cache-control":"no-store","x-robots-tag":"noindex, nofollow"};
  const json=(data,status=200)=>new Response(request.method==="HEAD"?null:JSON.stringify(data),{status,headers:{...headers,"content-type":"application/json; charset=utf-8"}});
  try{
    if(!user || user.must_change_password)throw commerceError("Sign in to view store content.",undefined,401);
    if(!UUID.test(id))throw commerceError("Store not found.",undefined,404);
    if(!["GET","HEAD"].includes(request.method))throw commerceError("Method not allowed.",undefined,405);
    const url=new URL(request.url),shard=url.searchParams.get("shard");
    if(shard!==null&&!/^[1-9][0-9]{0,6}$/.test(shard))throw commerceError("Choose a valid sitemap shard.",undefined,400);
    const data=await db.withMemberStore(id,token,async tx=>{
      const role=await dashboardAccess(tx,id,user.id);
      if(!["owner","admin","editor"].includes(role))throw commerceError("You cannot view store content.",undefined,403);
      await tx`SELECT set_config('app.blog_token',${token},true)`;
      const result=await storeDiscoveryDashboard(tx,id);
      if(shard){
        if(!result.published||Number(shard)>result.sitemap_shards)throw commerceError("Sitemap shard not found.",undefined,404);
        // Generate the requested shard through the same source as the public file.
        const [saved]=await tx`SELECT snapshot::text AS snapshot FROM public.store_publications WHERE store_id=${id}`;
        let source={...parseBlogJSON(saved.snapshot),store:result.store,...await blogPublications(tx,id)};
        if(await pagesEnabled(tx))source.layouts=(await pageLayouts(tx,id,{published:true})).layouts;
        const path=`/sitemaps/${shard}.xml`,r=serveStoreDiscovery(new Request(result.origin+path),source,result.origin);
        result.files.push({name:path.slice(1),path,url:result.origin+path,status:r.status,content:await r.text(),content_type:r.headers.get("content-type")});
      }
      return {...result,role};
    },{lockStore:false});
    if(url.pathname.startsWith("/api/"))return json(data);
    return new Response(request.method==="HEAD"?null:renderStoreDiscovery(data,user),{headers:{...headers,"content-type":"text/html; charset=utf-8"}});
  }catch(error){return json({error:error.status?error.message:"Discovery files are temporarily unavailable. Please retry."},error.status||503);}
}
