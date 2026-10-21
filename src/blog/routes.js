import {SECURITY_HEADERS} from "../auth/security.js";
import {UUID} from "../public/validation.js";
import {readJson} from "../store/input.js";
import {commerceError} from "../public/commerce-rules.js";
import {dashboardAccess,audit} from "../dashboard/repository.js";
import {blogAvailable,blogDashboard,saveBlogArticle,deleteBlogArticle} from "./repository.js";
import {renderStoreBlog,renderStoreBlogPreview} from "../ui/store-blog.js";
import {changeBlogPublication} from "./publication.js";

export function isBlogDashboard(path) {
  return /^\/(?:api\/)?stores\/[^/]+\/blog(?:\/[^/]+(?:\/(?:preview|publish|unpublish))?)?$/.test(path);
}
export async function handleBlogDashboard(request,db,user,token,id,child,action) {
  const url = new URL(request.url), api = url.pathname.startsWith("/api/"), read = ["GET","HEAD"].includes(request.method);
  const headers = {...SECURITY_HEADERS,"cache-control":"no-store","x-robots-tag":"noindex, nofollow","referrer-policy":"no-referrer"};
  const json = (data,status=200) => new Response(request.method==="HEAD"?null:JSON.stringify(data),
    {status,headers:{...headers,"content-type":"application/json; charset=utf-8"}});
  try {
    if (!user || user.must_change_password) throw commerceError("Sign in to manage articles.",undefined,401);
    if (!UUID.test(id) || (child && child !== "new" && !UUID.test(child))) throw commerceError("Article not found.",undefined,404);
    const publishing=["publish","unpublish"].includes(action);
    if(publishing && (!api || read || request.method!=="POST" || !child || child==="new"))
      throw commerceError("Method not allowed.",undefined,405);
    if ((!publishing && action && (action!=="preview" || !child || child==="new" || api || !read)) ||
      (api && child==="new") || (!read && !publishing && (!api || action || !["POST","PUT","DELETE"].includes(request.method))) ||
      (!read && !publishing && (request.method==="POST" ? !!child : !child)))
      throw commerceError("Method not allowed.",undefined,405);
    if (!read && request.headers.get("origin") !== url.origin) throw commerceError("Reload your dashboard before saving.",undefined,403);
    const rawOffset=url.searchParams.get("offset") || "0";
    if (!/^(0|[1-9][0-9]{0,6})$/.test(rawOffset)) throw commerceError("Choose a valid article page.",undefined,400);
    const body = read ? null : await readJson(request,700000);
    const data = await db.withMemberStore(id,token,async tx=>{
      const role = await dashboardAccess(tx,id,user.id);
      if (!["owner","admin","editor"].includes(role)) throw commerceError("You cannot edit store articles.",undefined,403);
      await tx`SELECT set_config('app.blog_token',${token},true)`;
      if (!read && !await blogAvailable(tx)) throw commerceError("The blog editor needs its database update before saving.",undefined,503);
      let saved = null;
      if (!read) {
        if(publishing)await changeBlogPublication(tx,id,child,body,action);
        else if (request.method==="DELETE") await deleteBlogArticle(tx,id,child,body);
        else saved = await saveBlogArticle(tx,id,child || null,body);
        await audit(tx,id,user.id,publishing?`blog.${action}`:request.method==="DELETE"?"blog.deleted":child?"blog.edited":"blog.created","blog",child || saved.id);
      }
      const detailId = publishing?child:read ? (child && child!=="new" ? child : null) : saved?.id;
      return {...await blogDashboard(tx,id,{articleId:detailId,includeResources:api || !!child,offset:Number(rawOffset)}),role};
    },{lockStore:!read});
    if (api) return json(data,request.method==="POST"&&!publishing?201:200);
    return new Response(request.method==="HEAD"?null:action==="preview"?renderStoreBlogPreview(data):renderStoreBlog({...data,editing:!!child},user),
      {headers:{...headers,"content-type":"text/html; charset=utf-8"}});
  } catch (error) {
    if (error.code === "23505") return json({error:"An article already uses that address. Choose another.",code:"BLOG_SLUG_TAKEN"},409);
    return json({error:error.status?error.message:"The blog editor is temporarily unavailable. Please retry."},error.status || 503);
  }
}
