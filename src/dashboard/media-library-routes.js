import {SECURITY_HEADERS} from "../auth/security.js";
import {UUID} from "../public/validation.js";
import {dashboardAccess} from "./repository.js";
import {commerceError} from "../public/commerce-rules.js";
import {mediaLibrary,mediaLibraryFilters} from "./media-library.js";
import {renderMediaLibrary} from "../ui/media-library.js";

export const isMediaLibraryPath=path=>/^\/(?:api\/)?stores\/[^/]+\/media-library$/.test(path);
export async function handleMediaLibrary(request,db,user,token,id){
  const headers={...SECURITY_HEADERS,"cache-control":"no-store","x-robots-tag":"noindex, nofollow"};
  const json=(body,status=200)=>new Response(request.method==="HEAD"?null:JSON.stringify(body),
    {status,headers:{...headers,"content-type":"application/json; charset=utf-8",...(status===405?{allow:"GET, HEAD"}:{})}});
  try{
    if(!user||user.must_change_password)throw commerceError("Sign in to view your media.",undefined,401);
    if(!UUID.test(id))throw commerceError("Store not found.",undefined,404);
    if(!["GET","HEAD"].includes(request.method))throw commerceError("Method not allowed.",undefined,405);
    const url=new URL(request.url),filters=mediaLibraryFilters(url);
    const data=await db.withMemberStore(id,token,async tx=>{
      const role=await dashboardAccess(tx,id,user.id);
      if(!["owner","admin","editor"].includes(role))throw commerceError("You cannot view this store's media.",undefined,403);
      // Private blog-reference reads require the same session scope as the editor.
      await tx`SELECT set_config('app.blog_token',${token},true)`;
      return {...await mediaLibrary(tx,id,filters),role};
    },{lockStore:false});
    if(url.pathname.startsWith("/api/"))return json(data);
    return new Response(request.method==="HEAD"?null:renderMediaLibrary(data,user),
      {headers:{...headers,"content-type":"text/html; charset=utf-8"}});
  }catch(error){
    return json({error:error.status?error.message:"The media library is temporarily unavailable. Please retry."},error.status||503);
  }
}
