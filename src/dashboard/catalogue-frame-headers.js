import {SECURITY_HEADERS} from "../auth/security.js";

// Private dashboard pages remain unframeable by default. Only authenticated
// catalogue form responses opted into Ann may be embedded on the same origin.
export function catalogueFrameHeaders(request,view,headers=SECURITY_HEADERS){
  const result={...headers},url=new URL(request.url);
  if(!["GET","HEAD"].includes(request.method)
    ||!["product-new","product","collection-new","collection"].includes(view)
    ||url.searchParams.getAll("ann_modal").length!==1
    ||url.searchParams.get("ann_modal")!=="1")return result;
  result["x-frame-options"]="SAMEORIGIN";
  result["content-security-policy"]=headers["content-security-policy"].replace("frame-ancestors 'none'","frame-ancestors 'self'");
  return result;
}
