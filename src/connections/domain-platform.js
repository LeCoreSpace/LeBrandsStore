import { remoteJson, failure } from "./runtime-client.js";
import { cloudflareAvailable } from "./providers.js";
export async function domainPlatform(env,fetcher=fetch) {
  const labels=["Platform API configured","Active SaaS fallback origin","Proxied customer CNAME target","Custom-hostname traffic routed to the store Worker"];
  const diagnostics=labels.map(label=>({label,complete:false}));
  if (!cloudflareAvailable(env)) return {ready:false,diagnostics};
  diagnostics[0].complete=true;
  const base=`https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}`;
  const get=async path=>{
    const r=await remoteJson(`${base}${path}`,{headers:{authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`}},fetcher);
    if (r.success!==true) throw failure("Cloudflare platform configuration needs attention.",502);
    return r.result;
  };
  try {
    const [fallback,dns,routes]=await Promise.all([get("/custom_hostnames/fallback_origin"),
      get(`/dns_records?name=${encodeURIComponent(env.CUSTOM_DOMAIN_CNAME_TARGET)}&type=CNAME`),get("/workers/routes")]);
    diagnostics[1].complete=fallback?.status==="active" && /^[a-z0-9.-]+\.lebrands\.store$/.test(fallback.origin);
    diagnostics[2].complete=Array.isArray(dns) && dns.some(d=>d.name===env.CUSTOM_DOMAIN_CNAME_TARGET && d.proxied===true && d.content===fallback?.origin);
    diagnostics[3].complete=Array.isArray(routes) && routes.some(r=>r.pattern==="*/*" && r.script===(env.CLOUDFLARE_WORKER_NAME||"lebrands-store"));
  } catch { /* Specific readiness indicators, never false success or raw API errors. */ }
  return {ready:diagnostics.every(d=>d.complete),diagnostics};
}
