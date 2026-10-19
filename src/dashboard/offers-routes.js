import {SECURITY_HEADERS} from "../auth/security.js";
import {readJson} from "../store/input.js";
import {UUID} from "../public/validation.js";
import {commerceError} from "../public/commerce-rules.js";
import {dashboardAccess} from "./repository.js";
import {offerDashboard,readOffers,saveOffer} from "../offers/repository.js";
import {renderDashboard} from "../ui/dashboard.js";
export async function handleOffersDashboard(request,db,user,token,id,child,action){
  const url=new URL(request.url),api=url.pathname.startsWith("/api/"),read=["GET","HEAD"].includes(request.method);
  if((!read&&(!api||request.method!=="POST"))||
    (child&&(!UUID.test(child)||action!=="status"||read))||(!child&&action))
    throw commerceError("Method not allowed.",undefined,405);
  if(!read&&request.headers.get("origin")!==url.origin)throw commerceError("Reload your dashboard before saving.",undefined,403);
  const body=read?null:await readJson(request,65536);
  const data=await db.withMemberStore(id,token,async tx=>{
    const role=await dashboardAccess(tx,id,user.id);
    if(!["owner","admin"].includes(role))throw commerceError("Only owners and admins can manage offers.",undefined,403);
    if(!read){
      let input=body;
      if(child){
        const current=(await readOffers(tx,id)).find(o=>o.id===child);
        if(!current)throw commerceError("Offer not found.",undefined,404);
        input={...current,status:body.status,expected_revision:body.expected_revision};
      }
      await saveOffer(tx,id,token,input);
    }
    return{...await offerDashboard(tx,id),role};
  },{lockStore:!read});
  return new Response(request.method==="HEAD"?null:api?JSON.stringify(data):renderDashboard("offers",data,user),
    {headers:{...SECURITY_HEADERS,"cache-control":"no-store","x-robots-tag":"noindex, nofollow",
      "content-type":api?"application/json; charset=utf-8":"text/html; charset=utf-8"}});
}
