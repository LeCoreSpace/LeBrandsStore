import { createDb } from "../db.js";
import { renderAccount } from "../ui/accounts.js";
import { accountRepository } from "./repository.js";
import { handleStoreRoutes, isStoreRoute } from "../store/routes.js";
import { handlePageRoutes, isPageRoute } from "../store/page-routes.js";
import {handleGSTINRoutes,isGSTINRoute} from "../gstin/routes.js";
import {renderEditor} from "../ui/editor.js";
import {isAiRoute,handleAiRoutes} from "../ai/routes.js";
import {aiEnabled} from "../ai/repository.js";
import {loadDraft} from "../store/repository.js";
import {isEmailAccountPath,handleEmailAccount,emailAccountDocument} from "../email/account-routes.js";
import {handleStaffInvitation,isStaffPath} from "../email/staff.js";
import { isMerchantCheckoutPath, merchantCheckout } from "../checkout/merchant.js";
import { isDashboardPath, handleDashboard } from "../dashboard/routes.js";
import { assertPasswordPepper, hashPassword, needsPasswordRehash, randomToken, sha256, validatePassword, verifyPassword } from "./passwords.js";
import {
  GENERIC_LOGIN_ERROR, SECURITY_HEADERS, ipHash, isValidOrigin, normalizeEmail,
  readForm, readSessionToken, sessionCookie, validateSubdomain,
} from "./security.js";

const html = (view, data = {}, status = 200) => new Response(renderAccount(view, data), {
  status, headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8" },
});
const redirect = (path, cookie) => new Response(null, {
  status: 303, headers: { ...SECURITY_HEADERS, location: path, ...(cookie ? { "set-cookie": cookie } : {}) },
});
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8" },
});
const nameValue = (value) => typeof value === "string" && value.trim().length >= 1 &&
  value.trim().length <= 120 && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;

export async function handleAccounts(request, env, ctx, dependencies = {}) {
  const url = new URL(request.url);
  const path = url.pathname;
  const editorMatch=path.match(/^\/stores\/([0-9a-f-]{36})\/editor$/i);
  const storeRoute = isStaffPath(path)||isStoreRoute(path) || isPageRoute(path) || isGSTINRoute(path) || isAiRoute(path) || !!editorMatch || path==="/editor";
  const publicViews = { "/signup": "signup", "/login": "login", "/forgot-password": "forgot-password", "/reset-password":"forgot-password","/invite":"forgot-password" };
  if (!["GET", "POST", "HEAD", ...(storeRoute ? ["PATCH", "PUT", "DELETE"] : [])].includes(request.method)) return html("error", { error: "Method not allowed." }, 405);
  if (!["GET", "HEAD"].includes(request.method) && !isValidOrigin(request)) {
    return html("error", { error: "This request did not come from the account website." }, 403);
  }
  const token = readSessionToken(request);
  if ((request.method === "GET" || request.method === "HEAD") && publicViews[path] && !token && !isEmailAccountPath(path)) {
    return html(publicViews[path], {
      notice: path === "/login" && url.searchParams.get("notice") === "signup"
        ? "Your request has been processed. Sign in to continue, or contact support if you need help." : undefined,
    });
  }
  if (!token && ["/", "/account", "/stores/new", "/api/subdomain-check", "/logout"].includes(path)) {
    return path.startsWith("/api/") ? json({ available: false, error: "Sign in to check an address." }, 401) : redirect("/login");
  }
  if (!token && storeRoute) {
    return path.startsWith("/api/") ? json({ error: "Sign in to manage your store." }, 401) : redirect("/login");
  }
  if (!storeRoute && !["/", "/account", "/stores/new", "/api/subdomain-check", "/logout", "/verify-email", ...Object.keys(publicViews)].includes(path)) {
    return html("error", { error: "Page not found." }, 404);
  }

  let db;
  try {
    db = (dependencies.createDb ?? createDb)(env);
    const repo = dependencies.repository ?? accountRepository(db);
    const tokenHash = token ? await sha256(token) : null;
    if(path==="/verify-email"&&["GET","HEAD"].includes(request.method)){
      // GET/HEAD never consumes the link. A POST confirmation prevents email-scanner consumption.
      const value=url.searchParams.get("token")||"";
      return emailAccountDocument(`<h1 style="font-size:28px">Verify your email</h1><form method="post" action="/verify-email"><input type="hidden" name="token" value="${/^[a-f0-9]{64}$/.test(value)?value:""}"><button>Confirm email</button></form>`);
    }
    if(path==="/verify-email"&&request.method==="POST"){
      const form=await readForm(request),value=form.get("token")||"";
      if(!/^[a-f0-9]{64}$/.test(value))return html("error",{error:"This verification link is invalid or expired."},400);
      const valid=await db.account(async tx=>{
        if(!await aiEnabled(tx))return false;
        const[row]=await tx`SELECT public.ai_confirm_verification(${await sha256(value)}) AS ok`;return row.ok;
      });
      return valid?redirect("/"):html("error",{error:"This verification link is invalid or expired."},400);
    }
    const session = tokenHash ? await repo.session(tokenHash) : null;
    const user = session ? { ...session, id: session.user_id } : null;
    if(isEmailAccountPath(path))return await handleEmailAccount(request,env,db,user,tokenHash);
    const inviteRoute=path.match(/^\/(?:api\/)?stores\/([a-f0-9-]{36})\/(?:staff-invitations|team)$/i);
    if(inviteRoute)return await handleStaffInvitation(request,env,db,user,tokenHash,inviteRoute[1]);
    if (token && !session && !publicViews[path]) {
      return path.startsWith("/api/") ? json({ available: false, error: "Sign in again." }, 401)
        : redirect("/login", sessionCookie("", true));
    }
    if (user?.must_change_password && path !== "/account" && path !== "/logout") {
      return path.startsWith("/api/") ? json({ available: false, error: "Change your password first." }, 403) : redirect("/account");
    }
    if (isPageRoute(path)) return await handlePageRoutes(request, env, db, user, tokenHash);
    if (isGSTINRoute(path)) return await handleGSTINRoutes(request,env,db,user,tokenHash);
    if (isAiRoute(path)) return await handleAiRoutes(request,env,db,user,tokenHash);
    if (path==="/editor") {
      if(request.method!=="GET")return html("error",{error:"Method not allowed."},405);
      const store=session.stores?.[0];
      return redirect(store?`/stores/${store.store_id}/editor`:"/");
    }
    if(editorMatch){
      if(request.method!=="GET")return html("error",{error:"Method not allowed."},405);
      const data=await db.withMemberStore(editorMatch[1],tokenHash,async tx=>{
        const draft=await loadDraft(tx,editorMatch[1]);
        draft.ai_builder_enabled=await aiEnabled(tx);
        if(draft.ai_builder_enabled)await tx`UPDATE public.ai_generation_jobs SET previewed_at=now()
          WHERE store_id=${editorMatch[1]} AND status='completed' AND previewed_at IS NULL`;
        const[member]=await tx`SELECT role FROM public.store_members WHERE store_id=${editorMatch[1]} AND user_id=${user.id}`;
        return{...draft,role:member?.role};
      });
      return new Response(renderEditor(data,user),{headers:{...SECURITY_HEADERS,"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
    }
    if (isDashboardPath(path,request.method)) return await handleDashboard(request,db,user,tokenHash,env);
    if (isMerchantCheckoutPath(path)) return await merchantCheckout(request,db,user,tokenHash);
    if (isStoreRoute(path)) return await handleStoreRoutes(request, env, db, user, tokenHash);
    if (request.method !== "POST") {
      if (path === "/api/subdomain-check") {
        const name = url.searchParams.get("name") ?? "";
        if (!validateSubdomain(name)) return json({ available: false, error: "Use 3 to 30 lowercase letters, numbers or hyphens. Reserved names are unavailable." });
        const storeId = url.searchParams.get("store_id");
        if (storeId) {
          return json({ available: await db.withMemberStore(storeId, tokenHash, async (tx) => {
            const [row] = await tx`SELECT public.store_address_available(${name}, ${storeId}) AS available`;
            return row.available;
          }) });
        }
        return json({ available: await repo.availability(name) });
      }
      if (publicViews[path]) return user ? redirect("/") : html(publicViews[path]);
      if (path === "/") return html("dashboard", { user, stores: session.stores });
      if (path === "/stores/new") return html("new-store", { user });
      if (path === "/account") return html("account", { user });
      // GET must never log a user out; show the dashboard's POST sign-out form.
      return html("dashboard", { user, stores: session.stores, notice: "Use Sign out to end this session." });
    }

    const form = await readForm(request);
    if (path === "/signup") {
      await assertPasswordPepper(env);
      if (user) return redirect("/");
      const email = normalizeEmail(form.get("email"));
      const name = nameValue(form.get("name"));
      const password = form.get("password");
      const values = { name: form.get("name"), email: form.get("email") };
      const error = !name ? "Enter your name." : !email ? "Enter a valid email address."
        : form.get("terms") !== "yes" ? "Accept the terms to continue."
          : password !== form.get("confirm") ? "Your passwords do not match." : validatePassword(password);
      if (error) return html("signup", { error, values }, 400);
      await repo.register(email, name, await hashPassword(password, env));
      // Never disclose whether the email already existed. Both cases are identical.
      return redirect("/login?notice=signup");
    }
    if (path === "/login") {
      await assertPasswordPepper(env);
      if (user) return redirect("/");
      const email = normalizeEmail(form.get("email"));
      const password = form.get("password") ?? "";
      if (!email || new TextEncoder().encode(password).length > 1024) {
        return html("login", { error: GENERIC_LOGIN_ERROR }, 400);
      }
      const ip = await ipHash(request, env.SESSION_SECRET);
      const result = await repo.login(email, ip, async (record) => {
        const valid = await verifyPassword(password, record, env);
        if (!valid || !record) return null;
        const raw = randomToken();
        return { token: raw, tokenHash: await sha256(raw), userId: record.user_id,
          upgrade: needsPasswordRehash(record, env) ? await hashPassword(password, env) : null,
          userAgent: request.headers.get("user-agent") ?? "" };
      });
      if (!result) return html("login", { error: GENERIC_LOGIN_ERROR, values: { email } }, 400);
      const current = await repo.session(result.tokenHash);
      if (!current) throw Object.assign(new Error("New session was unavailable."), { code: "SESSION_UNAVAILABLE" });
      return redirect(current.must_change_password ? "/account" : "/", sessionCookie(result.token));
    }
    if (!user) return redirect("/login", sessionCookie("", true));
    if (path === "/logout") {
      await repo.revoke(tokenHash);
      return redirect("/login", sessionCookie("", true));
    }
    if (path === "/stores/new") {
      const brandName = nameValue(form.get("brand_name"));
      const subdomain = form.get("subdomain") ?? "";
      const values = { brand_name: form.get("brand_name"), subdomain };
      if (!brandName || [...brandName].length < 2 || [...brandName].length > 40 || !validateSubdomain(subdomain)) {
        return html("new-store", { user, values, error: "Use a brand name of 2 to 40 characters and a valid, non-reserved store address." }, 400);
      }
      try {
        const storeId = await repo.createStore(user.id, brandName, subdomain, tokenHash);
        if (storeId) return redirect(`/stores/${storeId}/setup`);
      } catch (error) {
        if (["23505", "22023"].includes(error.code)) {
          return html("new-store", { user, values, error: "That store address is not available. Choose another." }, 409);
        }
        throw error;
      }
      return redirect("/");
    }
    if (path === "/account") {
      await assertPasswordPepper(env);
      const password = form.get("password");
      const error = password !== form.get("confirm") ? "Your passwords do not match." : validatePassword(password);
      if (error) return html("account", { user, error }, 400);
      const old = await repo.getPassword(user.email);
      if (!await verifyPassword(form.get("current_password") ?? "", old, env)) {
        return html("account", { user, error: GENERIC_LOGIN_ERROR }, 400);
      }
      if (await verifyPassword(password, old, env)) {
        return html("account", { user, error: "Choose a new password, different from your current password." }, 400);
      }
      if (!await repo.changePassword(tokenHash, await hashPassword(password, env))) {
        return redirect("/login", sessionCookie("", true));
      }
      return html("account", { user: { ...user, must_change_password: false }, notice: "Password changed. Other sessions have been signed out." });
    }
    return html("error", { error: "Method not allowed." }, 405);
  } catch (error) {
    console.error("Account request failed", { code: error?.code ?? "UNKNOWN" });
    const message = error?.code === "INVALID_FORM" ? error.message
      : error?.code === "PASSWORD_RUNTIME_UNSUPPORTED"
        ? "Password hashing is unavailable in this runtime. Contact support@lebrands.store."
        : "Accounts are temporarily unavailable. Please try again later.";
    return path.startsWith("/api/") ? json({ available: false, error: message }, 503)
      : html("error", { error: message }, error?.code === "INVALID_FORM" ? 400 : 503);
  } finally {
    if (db) {
      const cleanup = db.close().catch(() => console.error("Account connection cleanup failed"));
      if (ctx?.waitUntil) ctx.waitUntil(cleanup);
      else await cleanup;
    }
  }
}
