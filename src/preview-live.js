// Development-only bridge. Never imported by the production Worker.
import { createDb } from "./db.js";
import { APP_ORIGIN } from "./auth/security.js";
import {isRazorpayOAuthRoute} from "./connections/razorpay-oauth.js";

export const isPreviewAccountPath=path=>
  ["/signup","/login","/forgot-password","/verify-email","/reset-password","/invite","/account","/logout","/dashboard","/stores/new","/api/subdomain-check"].includes(path)||
  path==="/admin"||path.startsWith("/admin/")||path.startsWith("/api/stores/")||
  /^\/stores\/[^/]+(?:\/|$)/.test(path)||isRazorpayOAuthRoute(path);

export const isLivePreview = env => Boolean(env && Object.hasOwn(env, "PREVIEW_LIVE_DATABASE") && env.PREVIEW_LIVE_DATABASE === "enabled");

export function livePreviewEnv(env) {
  if (!isLivePreview(env)) return env;
  if (!env.SUPABASE_APP_DB_URL || !env.PASSWORD_PEPPER || !env.SESSION_SECRET || !env.REPLIT_DEV_DOMAIN) {
    throw Object.assign(new Error("Live preview secrets are not configured."), { code: "PREVIEW_CONFIGURATION" });
  }
  const connection = new URL(env.SUPABASE_APP_DB_URL);
  if (!["postgres:", "postgresql:"].includes(connection.protocol) ||
      !/(?:^|\.)supabase\.(?:com|co)$/.test(connection.hostname) ||
      decodeURIComponent(connection.username).split(".")[0] !== "lebrands_app") {
    throw Object.assign(new Error("Live preview requires the restricted Supabase application connection."), { code: "PREVIEW_DATABASE_ROLE" });
  }
  connection.searchParams.set("sslmode", "require");
  const result = { ...env, HYPERDRIVE: { connectionString: connection.toString() } };
  // Defence in depth. These are not declared as preview Worker bindings either.
  delete result.SUPABASE_DB_URL;
  delete result.CLOUDFLARE_API_TOKEN;
  delete result.CLOUDFLARE_ACCOUNT_ID;
  return result;
}

export function previewAccountRequest(request, target, env) {
  if (!isLivePreview(env) || ["GET", "HEAD"].includes(request.method)) return new Request(target, request);
  const domain = String(env.REPLIT_DEV_DOMAIN || "");
  if (!/^[a-z0-9.-]+\.replit\.dev$/i.test(domain) ||
      request.headers.get("origin") !== `https://${domain}`) return null;
  // Only this workspace's exact browser origin can cross the development
  // bridge. Production's host/origin checks are unchanged.
  const headers = new Headers(request.headers);
  headers.set("origin", APP_ORIGIN);
  return new Request(target, new Request(request, { headers }));
}

export function livePreviewHeaders(headers, env) {
  if (!isLivePreview(env)) return;
  const cookie = headers.get("set-cookie");
  if (cookie) headers.set("set-cookie", cookie.replace("SameSite=Lax", "SameSite=None; Partitioned"));
  const csp = headers.get("content-security-policy");
  if (csp) headers.set("content-security-policy",
    csp.replace("frame-ancestors *", "frame-ancestors 'self' https://replit.com https://*.replit.com"));
}

export async function previewDatabaseStatus(env) {
  let db;
  try {
    db = createDb(livePreviewEnv(env));
    const result = await db.account(async tx => {
      const [row] = await tx`SELECT current_user AS role,
        to_regclass('public.store_pages') IS NOT NULL AS pages_available,
        to_regclass('public.store_gstin_verifications') IS NOT NULL AS gstin_available`;
      return row;
    });
    return Response.json({ connected: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    // Never return database messages, connection strings or provider URLs.
    const code = /^[A-Z0-9_]{1,50}$/.test(error?.code || "") ? error.code : "CONNECTION_FAILED";
    let reason = String(error?.message || "Unknown connection error");
    const sensitive = Object.entries(env).filter(([key]) => /SECRET|PEPPER|KEY|TOKEN|DB_URL/.test(key))
      .map(([, value]) => value).filter(value => typeof value === "string" && value.length > 3);
    try {
      const url = new URL(env.SUPABASE_APP_DB_URL);
      sensitive.push(url.password, decodeURIComponent(url.password), url.toString());
    } catch {}
    for (const value of sensitive.filter(Boolean).sort((a,b)=>b.length-a.length)) reason = reason.replaceAll(value, "[redacted]");
    reason = reason.replace(/(?:postgres(?:ql)?|https?):\/\/\S+/gi, "[redacted URL]");
    console.error("Live preview database check failed", { code, reason: reason.slice(0, 240) });
    return Response.json({ connected: false, code, error: "The live preview database connection is unavailable." },
      { status: 503, headers: { "cache-control": "no-store" } });
  } finally {
    if (db) await db.close();
  }
}
