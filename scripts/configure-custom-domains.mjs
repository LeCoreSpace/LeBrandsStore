// Operator-only. Read-only unless --apply is explicitly passed. Never print tokens.
// Cloudflare for SaaS must first be enabled by the account owner; this script
// does not purchase plans, replace existing DNS, or delete any infrastructure.
import { pathToFileURL } from "node:url";
const target="brands.lebrands.store",origin="store-origin.lebrands.store",worker="lebrands-store";
export async function configureDomains({token,accountId,apply=false,fetcher=fetch,log=console.log}) {
  if (!token || !accountId) throw new Error("Cloudflare credentials are required in the operator environment.");
  const api=async(path,method="GET",body)=>{
    const r=await fetcher(`https://api.cloudflare.com/client/v4${path}`,{method,redirect:"error",signal:AbortSignal.timeout(15000),
      headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
    const data=await r.json().catch(()=>({}));
    if (r.status===404 && path.endsWith("/custom_hostnames/fallback_origin")) return null;
    if (!r.ok || data.success!==true) {
      const operation=path.startsWith("/zones?")?"zone discovery":path.includes("/dns_records")?"DNS records":path.includes("/workers/routes")?"Worker routes":"SaaS fallback origin";
      throw new Error(`Cloudflare ${method} ${operation} check failed (${r.status}). Check the token's permissions for this operation and Cloudflare for SaaS configuration.`);
    }
    return data.result;
  };
  const zones=await api(`/zones?name=lebrands.store&account.id=${encodeURIComponent(accountId)}`);
  if (!Array.isArray(zones) || zones.length!==1 || zones[0].status!=="active") throw new Error("The active lebrands.store zone was not found in this account.");
  const zone=zones[0].id,base=`/zones/${zone}`;
  const [originRecords,targetRecords,routes]=await Promise.all([
    api(`${base}/dns_records?name=${encodeURIComponent(origin)}&per_page=100`),
    api(`${base}/dns_records?name=${encodeURIComponent(target)}&per_page=100`),
    api(`${base}/workers/routes`)]);
  const dns=[...originRecords,...targetRecords];
  const checkDns=(name,type,content)=>{
    const matches=dns.filter(r=>r.name===name);
    if (matches.length>1) throw new Error(`${name} has multiple DNS records. Review them manually; nothing was overwritten.`);
    const existing=matches[0];
    if (existing && !(existing.type===type && existing.content===content && existing.proxied===true)) throw new Error(`${name} already has different DNS. Review it manually; nothing was overwritten.`);
    return existing;
  };
  const records=[{type:"AAAA",name:origin,content:"100::",proxied:true},{type:"CNAME",name:target,content:origin,proxied:true}];
  for (const r of records) checkDns(r.name,r.type,r.content);
  const catchAll=routes.find(r=>r.pattern==="*/*");
  if (catchAll && catchAll.script!==worker) throw new Error("A catch-all route already belongs to a different service. Resolve the route manually.");
  // Detect conflicting fallback instead of replacing another SaaS service.
  const fallback=await api(`${base}/custom_hostnames/fallback_origin`);
  if (fallback?.origin && fallback.origin!==origin) throw new Error("A different SaaS fallback origin already exists. Review it manually.");
  log(JSON.stringify({mode:apply?"apply":"read-only",zone_id:zone,worker,
    planned:{records,worker_route:"*/*",fallback_origin:origin},
    warning:"The catch-all route covers all custom hostnames entering this zone. Existing more-specific routes still take precedence. Cloudflare may charge for custom hostnames under your plan."},null,2));
  if (apply) {
    for (const r of records) if (!checkDns(r.name,r.type,r.content)) await api(`${base}/dns_records`,"POST",r);
    if (!catchAll) await api(`${base}/workers/routes`,"POST",{pattern:"*/*",script:worker});
    if (fallback?.origin!==origin) await api(`${base}/custom_hostnames/fallback_origin`,"PUT",{origin});
    const verified=await api(`${base}/custom_hostnames/fallback_origin`);
    log(`Fallback status: ${verified.status||"pending"}. Wait for active before merchant activation.`);
  }
  log(`Worker configuration: CLOUDFLARE_ZONE_ID=${zone}; CUSTOM_DOMAIN_CNAME_TARGET=${target}; CLOUDFLARE_WORKER_NAME=${worker}. Keep the API token in a Worker secret, never a plaintext variable.`);
  log("Keep the */* route in your Cloudflare deployment route configuration so later deployments do not remove it.");
  return {zone,target,origin,apply};
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const flags=process.argv.slice(2);
  if (flags.some(f=>f!=="--apply")) throw new Error("Use no flags for a read-only check, or --apply for explicit infrastructure changes.");
  configureDomains({token:process.env.CLOUDFLARE_API_TOKEN,accountId:process.env.CLOUDFLARE_ACCOUNT_ID,apply:flags.includes("--apply")})
    .catch(e=>{console.error(e.message);process.exitCode=1;});
}
