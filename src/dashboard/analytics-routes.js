import {SECURITY_HEADERS} from "../auth/security.js";
import {commerceError} from "../public/commerce-rules.js";
import {businessEditorAccess,protectedEditorLinks} from "../store/business-access.js";
import {dashboardAccess} from "./repository.js";
import {cogsCanEdit} from "./cogs.js";
import {analyticsFilters,readAnalytics} from "./analytics.js";
import {analyticsExport} from "./analytics-export.js";
import {renderDashboard} from "../ui/dashboard.js";

export async function handleAnalyticsDashboard(request,db,user,tokenHash,id,child,action){
  const url=new URL(request.url),api=url.pathname.startsWith("/api/");
  const exporting=api&&child==="export"&&!action;
  if(!["GET","HEAD"].includes(request.method)||action||(child&&!exporting))throw commerceError("Method not allowed.",undefined,405);
  const format=url.searchParams.get("format")||"csv";
  if(exporting&&!["csv","xlsx"].includes(format))throw commerceError("Choose CSV or Excel format.",undefined,400);
  let editorAccess;
  const result=await db.withMemberStore(id,tokenHash,async tx=>{
    const role=await dashboardAccess(tx,id,user.id);
    if(!cogsCanEdit(role))throw commerceError("Only owners and admins can view analytics.",undefined,403);
    const[store]=await tx`SELECT store_id,name,subdomain,status,currency FROM public.stores WHERE store_id=${id}`;
    const filters=analyticsFilters(url.searchParams,store.currency);
    if(!api)editorAccess=await businessEditorAccess(tx,id,tokenHash);
    return{store,role,analytics:await readAnalytics(tx,id,tokenHash,filters,{exporting})};
  },{lockStore:false});
  const headers={...SECURITY_HEADERS,"cache-control":"no-store","referrer-policy":"no-referrer","x-robots-tag":"noindex, nofollow"};
  if(exporting){
    if(!result.analytics.available)throw commerceError("Apply the COGS and commerce analytics database updates before exporting.",undefined,409);
    const file=analyticsExport(result.analytics,format,result.store);
    return new Response(request.method==="HEAD"?null:file.body,{headers:{...headers,"content-type":file.type,
      "content-disposition":`attachment; filename="${file.filename}"`,"x-content-type-options":"nosniff"}});
  }
  return new Response(request.method==="HEAD"?null:api?JSON.stringify(result):
    protectedEditorLinks(renderDashboard("analytics",{...result,business_access:editorAccess},user),id,editorAccess),
    {headers:{...headers,"content-type":api?"application/json; charset=utf-8":"text/html; charset=utf-8"}});
}
