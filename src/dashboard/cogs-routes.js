import {SECURITY_HEADERS} from "../auth/security.js";
import {renderDashboard} from "../ui/dashboard.js";
import {UUID} from "../public/validation.js";
import {readJson} from "../store/input.js";
import {commerceError} from "../public/commerce-rules.js";
import {dashboardAccess} from "./repository.js";
import {cogsCanEdit,cogsFilters,listCosts,saveCosts,costHistory} from "./cogs.js";
import {businessEditorAccess,protectedEditorLinks} from "../store/business-access.js";

export async function handleCogsDashboard(request,db,user,tokenHash,id,child,action){
  const url=new URL(request.url),api=url.pathname.startsWith("/api/");
  const read=["GET","HEAD"].includes(request.method);
  const history=api&&read&&UUID.test(child??"")&&action==="history";
  if((child&&!history)||(!read&&(!api||request.method!=="POST"))||(!child&&action))
    throw commerceError("Method not allowed.",undefined,405);
  if(!read&&request.headers.get("origin")!==url.origin)
    throw commerceError("Open COGS in your dashboard before saving.",undefined,403);
  const filters=cogsFilters(url.searchParams);
  let editorAccess;
  const result=await db.withMemberStore(id,tokenHash,async tx=>{
    const role=await dashboardAccess(tx,id,user.id);
    if(!cogsCanEdit(role))throw commerceError("Only store owners and admins can access product costs.",undefined,403);
    if(history)return costHistory(tx,id,tokenHash,child);
    if(!api)editorAccess=await businessEditorAccess(tx,id,tokenHash);
    if(!read)await saveCosts(tx,id,tokenHash,await readJson(request,65536));
    const [store]=await tx`SELECT store_id,name,subdomain,status,currency FROM public.stores WHERE store_id=${id}`;
    return{store,role,cogs:await listCosts(tx,id,tokenHash,filters)};
  },{lockStore:!read});
  const headers={...SECURITY_HEADERS,"cache-control":"no-store","referrer-policy":"no-referrer","x-robots-tag":"noindex, nofollow"};
  return new Response(request.method==="HEAD"?null:api?JSON.stringify(result):protectedEditorLinks(renderDashboard("cogs",{...result,business_access:editorAccess},user),id,editorAccess),
    {headers:{...headers,"content-type":api?"application/json; charset=utf-8":"text/html; charset=utf-8"}});
}
