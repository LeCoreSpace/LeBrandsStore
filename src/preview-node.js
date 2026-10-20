// Node-side development adapter for local Worker TCP/TLS limitations.
// Runs the SAME preview/production handlers, not a second application.
import { Readable } from "node:stream";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { getPlatformProxy } from "wrangler";
import preview from "./preview.js";
import { annPreviewFixture } from "./ann-preview-fixture.js";
import {businessReviewPreview} from "./business-review-preview-fixture.js";
import {platformAdminPreview} from "./platform-admin-preview-fixture.js";
import {skuCheckoutPreview} from "./sku-checkout-preview-fixture.js";
import {inventoryPreview} from "./inventory-preview-fixture.js";
import {cogsPreview} from "./cogs-preview-fixture.js";
import {analyticsPreview} from "./analytics-preview-fixture.js";
import {checkoutSettingsPreview} from "./checkout-settings-preview-fixture.js";
import {annPlanPreview} from "./ann-plan-preview-fixture.js";
import {billingPreview} from "./billing-preview-fixture.js";
import {marketingPreview} from "./marketing-preview-fixture.js";
import {supportPreview} from "./support-preview-fixture.js";
import {isPreviewAccountPath} from "./preview-live.js";

const types = { js:"text/javascript; charset=utf-8", css:"text/css; charset=utf-8",
  svg:"image/svg+xml", png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg",
  webp:"image/webp", avif:"image/avif", ico:"image/x-icon",
  woff2:"font/woff2", ttf:"font/ttf", json:"application/json" };
export const nativeAccountPath = path => isPreviewAccountPath(path) ||
  ["/__database-status","/editor","/plans"].includes(path);

export function nativePreviewBindings(runtime){
  const env={PREVIEW_LIVE_DATABASE:"enabled"};
  for(const key of ["SUPABASE_APP_DB_URL","PASSWORD_PEPPER","SESSION_SECRET","GSTIN_KEY","REPLIT_DEV_DOMAIN",
    "RAZORPAY_OAUTH_CLIENT_ID","RAZORPAY_OAUTH_CLIENT_SECRET","RAZORPAY_OAUTH_MODE",
    "RAZORPAY_OAUTH_REDIRECT_URI","RAZORPAY_OAUTH_WEBHOOK_SECRET","INTEGRATION_ENCRYPTION_KEY"])
    if(typeof runtime[key]==="string")env[key]=runtime[key];
  return env;
}

export function createNativePreview(root, runtime = process.env) {
  // Never copy process.env wholesale: the administrative URL/API token must
  // not become application bindings.
  const env = nativePreviewBindings(runtime);
  const publicRoot = resolve(root, "src/public");
  env.ASSETS = { async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const file = resolve(publicRoot, `.${pathname}`);
    if (!file.startsWith(publicRoot + sep)) return new Response("Not found", {status:404});
    try {
      const data = await readFile(file);
      return new Response(request.method === "HEAD" ? null : data, {
        headers: {"content-type": types[file.split(".").pop()] || "application/octet-stream"}
      });
    } catch { return new Response("Not found", {status:404}); }
  }};
  // Preserve the existing LOCAL R2 store. Connecting SQL does not silently
  // grant live bucket access or upload/delete production objects.
  let platform;
  const bucket = async () => {
    platform ||= getPlatformProxy({configPath:resolve(root,"wrangler.preview.jsonc"),
      persist:{path:resolve(root,".wrangler/state/v3")}});
    return (await platform).env.MEDIA;
  };
  env.MEDIA = Object.fromEntries(["get","head","put","delete"].map(method =>
    [method,async (...args)=>(await bucket())[method](...args)]));

  const middleware = async (req, res, next) => {
    if(await checkoutSettingsPreview(req,res))return;
    if(await supportPreview(req,res))return;
    if(await marketingPreview(req,res))return;
    if(await billingPreview(req,res))return;
    if(await annPlanPreview(req,res))return;
    if(await inventoryPreview(req,res,env.REPLIT_DEV_DOMAIN?`https://${env.REPLIT_DEV_DOMAIN}`:undefined))return;
    if(await analyticsPreview(req,res,env.REPLIT_DEV_DOMAIN?`https://${env.REPLIT_DEV_DOMAIN}`:undefined))return;
    if(await cogsPreview(req,res,env.REPLIT_DEV_DOMAIN?`https://${env.REPLIT_DEV_DOMAIN}`:undefined))return;
    if(await skuCheckoutPreview(req,res,env.REPLIT_DEV_DOMAIN?`https://${env.REPLIT_DEV_DOMAIN}`:undefined))return;
    if(await platformAdminPreview(req,res))return;
    if(await businessReviewPreview(req,res))return;
    if (await annPreviewFixture(req, res, env.REPLIT_DEV_DOMAIN ? `https://${env.REPLIT_DEV_DOMAIN}` : undefined)) return;
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    if (!nativeAccountPath(pathname)) return next();
    try {
      const headers = new Headers();
      for (const [key,value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) value.forEach(item=>headers.append(key,item));
        else if (value !== undefined) headers.set(key,value);
      }
      // Cloudflare normally replaces this header at the edge. Native local
      // callers must not choose their own IP bucket to bypass login limits.
      headers.delete("cf-connecting-ip");
      const init = {method:req.method,headers};
      if (!["GET","HEAD"].includes(req.method)) Object.assign(init,{body:Readable.toWeb(req),duplex:"half"});
      const request = new Request(`https://${env.REPLIT_DEV_DOMAIN}${req.url}`,init);
      const jobs = [];
      const response = await preview.fetch(request,env,{waitUntil:job=>jobs.push(Promise.resolve(job).catch(()=>{}))});
      res.statusCode = response.status;
      for (const [key,value] of response.headers) if(key!=="set-cookie") res.setHeader(key,value);
      const cookies = response.headers.getSetCookie();
      if(cookies.length) res.setHeader("set-cookie",cookies);
      if(response.body) Readable.fromWeb(response.body).pipe(res);
      else res.end();
      await Promise.all(jobs);
    } catch {
      // Never dump the Request, environment, exception stack or DB URL.
      res.statusCode = 503;
      res.setHeader("content-type","application/json");
      res.end('{"error":"The live preview service is unavailable."}');
    }
  };
  middleware.close = async () => { if(platform) await (await platform).dispose(); };
  return middleware;
}
