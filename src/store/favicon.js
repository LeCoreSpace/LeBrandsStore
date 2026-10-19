import {storefrontIcon} from "../public/aura.js";
import {serveMedia} from "./media.js";
import {SECURITY_HEADERS} from "../auth/security.js";

export async function serveStoreIcon(request,env,settings,storeId){
  const icon=storefrontIcon(settings);
  const headers={...SECURITY_HEADERS,"cache-control":"public, max-age=3600"};
  // Reuse the public media gate, including AI-publication checks. Never make
  // this endpoint an arbitrary image proxy or expose unpublished R2 objects.
  const ownLogo=icon.href.startsWith(`https://media.lebrands.store/stores/${storeId}/`);
  if(ownLogo&&env.IMAGES&&env.MEDIA){
    try{
      const source=await serveMedia(new Request(icon.href),env);
      if(source.ok&&source.body){
        const size=new URL(request.url).pathname==="/apple-touch-icon.png"?180:64;
        const output=await env.IMAGES.input(source.body).transform({width:size,height:size,fit:"contain"}).output({format:"image/png"});
        return new Response(request.method==="HEAD"?null:output.image(),{headers:{...headers,"content-type":"image/png"}});
      }
      headers["x-favicon-fallback"]="logo_unavailable";
    }catch{headers["x-favicon-fallback"]="resize_unavailable";}
  }else if(icon.href.startsWith("https://")||icon.href.startsWith("/assets/img/")){
    return new Response(null,{status:302,headers:{...headers,location:icon.href}});
  }
  return new Response(request.method==="HEAD"?null:icon.svg,{headers:{...headers,"content-type":"image/svg+xml; charset=utf-8",
    "content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; sandbox"}});
}
