import { SECURITY_HEADERS } from "../auth/security.js";
import { dashboardAccess } from "../dashboard/repository.js";
import { loadDraft } from "./repository.js";
import { renderStyleStudio } from "../ui/style-studio.js";
import {requireBusinessEditorAccess} from "./business-access.js";

export const isStyleStudioRoute = path => /^\/stores\/[a-f0-9-]{36}\/styles$/i.test(path);
export async function handleStyleStudio(request, env, db, user, hash) {
  const id = new URL(request.url).pathname.split("/")[2];
  if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed.", { status: 405, headers: SECURITY_HEADERS });
  try {
    const data = await db.withMemberStore(id, hash, async tx => {
      await requireBusinessEditorAccess(tx,id,hash);
      const role = await dashboardAccess(tx, id, user.id);
      return { ...await loadDraft(tx, id), role };
    },{lockStore:false});
    return new Response(request.method === "HEAD" ? null : renderStyleStudio(data, user), {
      headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    if(error.businessAccess)return new Response(null,{status:303,headers:{...SECURITY_HEADERS,"cache-control":"no-store",location:`/stores/${id}/build/ann?business=1`}});
    return new Response("Unable to open store styles.", { status: error.status || (error.code === "42501" ? 403 : 500), headers: SECURITY_HEADERS });
  }
}
