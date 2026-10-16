import { escapeHtml, layout, brandMark, accountHeader, footer } from "./layout.js";

const APP_ORIGIN = "https://app.lebrands.store";

function accountDoc(title, body, extraHead = "") {
  const routes = {
    "Your stores": "/",
    "Create account": "/signup",
    "Sign in": "/login",
    "Forgot your password?": "/forgot-password",
    "Create a store": "/stores/new",
    "Change password": "/account",
    "Something went wrong": "/error",
  };
  return layout({
    title: `${title} | LeBrands.Store`,
    description: "Manage your LeBrands.Store account.",
    canonical: `${APP_ORIGIN}${routes[title] || "/"}`,
    noindex: true,
    body,
    extraHead,
  });
}

function alertBlock(error, notice) {
  return `${error ? `<div class="form-alert" role="alert">${escapeHtml(error)}</div>` : ""}${notice ? `<div class="form-notice" role="status">${escapeHtml(notice)}</div>` : ""}`;
}

function authFrame({ eyebrow, heading, intro, title, description, form, after, user }) {
  return accountDoc(title, `${accountHeader(user)}<main class="wrap auth-shell">
    <section class="auth-intro"><div class="eyebrow">${escapeHtml(eyebrow)}</div><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(intro)}</p>
      <div class="auth-stamp"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#f1e5ea"/><path d="M12 20h16M20 12v16" stroke="#6b1735" stroke-width="1.5"/></svg><span>Built for independent Indian brands</span></div>
    </section>
    <section class="auth-card"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p>${form}${after || ""}</section>
  </main>`);
}

function signup(data) {
  const values = data.values || {};
  return authFrame({
    eyebrow: "A good place to begin",
    heading: "Your brand deserves its own address.",
    intro: "Make a home for your products, your customers and the next version of your business.",
    title: "Create your account",
    description: "A few details, then you can claim your store name.",
    form: `${alertBlock(data.error, data.notice)}<form method="post" action="/signup" autocomplete="on">
      <div class="form-control"><label for="name">Your name</label><input id="name" name="name" type="text" autocomplete="name" required maxlength="120" value="${escapeHtml(values.name || "")}" placeholder="Aarav Mehta"></div>
      <div class="form-control"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" required maxlength="254" value="${escapeHtml(values.email || "")}" placeholder="you@yourbrand.in"></div>
      <div class="form-control"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="new-password" required minlength="10" placeholder="At least 10 characters"><span class="form-help">Use at least 10 characters.</span></div>
      <div class="form-control"><label for="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" autocomplete="new-password" required minlength="10" placeholder="Enter it again"></div>
      <label class="checkbox-row"><input type="checkbox" name="terms" value="yes" required><span>I agree to the <a class="inline-link" href="https://lebrands.store/terms">Terms</a> and <a class="inline-link" href="https://lebrands.store/privacy">Privacy Policy</a>.</span></label>
      <button class="button" type="submit">Create account <span aria-hidden="true">↗</span></button>
    </form>`,
    after: `<div class="form-foot">Already have an account? <a href="/login">Sign in</a></div>`,
  });
}

function login(data) {
  const values = data.values || {};
  const mustChange = Boolean(data.user?.must_change_password);
  return authFrame({
    eyebrow: "Welcome back",
    heading: "Your next chapter is waiting.",
    intro: "Sign in to pick up where your brand left off.",
    title: "Sign in",
    description: "Use the email and password for your LeBrands.Store account.",
    form: `${alertBlock(data.error, data.notice)}<form method="post" action="/login" autocomplete="on">
      <div class="form-control"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" required maxlength="254" value="${escapeHtml(values.email || "")}" placeholder="you@yourbrand.in"></div>
      <div class="form-control"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Your password"></div>
      <button class="button" type="submit">Sign in <span aria-hidden="true">↗</span></button>
    </form>`,
    after: `<div class="form-foot"><a href="/forgot-password">Forgot your password?</a>${mustChange ? '<br><span class="form-help">A password reset is required before continuing.</span>' : ""}</div><div class="form-foot">New to LeBrands? <a href="/signup">Create an account</a></div>`,
  });
}

function forgotPassword(data) {
  return authFrame({
    eyebrow: "Account access",
    heading: "We'll help you get back in.",
    intro: "Password reset by email is not available yet. Our support team can help with account access.",
    title: "Forgot your password?",
    description: "Contact support and we'll help you reset your password.",
    form: `${alertBlock(data.error, data.notice)}<p style="font-size:14px;color:var(--ink);margin:0">Contact <a class="inline-link" href="mailto:support@lebrands.store">support@lebrands.store</a> to reset your password.</p>`,
    after: `<div class="form-foot"><a href="/login">Back to sign in</a></div>`,
  });
}

function forcedNotice(data) {
  return data.user?.must_change_password
    ? '<div class="form-alert" role="alert"><strong>Password reset required.</strong> Set a new password to continue. Store links are unavailable until your password has been changed.</div>'
    : "";
}

function dashboard(data) {
  const user = data.user || {};
  const stores = Array.isArray(data.stores) ? data.stores : [];
  const name = user.name || user.email || "there";
  const arrow = '<svg class="ah-arrow" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const rows = stores.map((store, i) => {
    const subdomain = escapeHtml(store.subdomain || "");
    const host = `${subdomain}.lebrands.store`;
    const id = escapeHtml(store.store_id);
    const status = escapeHtml(store.status || "unknown");
    const initial = escapeHtml(String(store.name || "U").trim().charAt(0).toUpperCase() || "U");
    return `<article class="store-row" style="--i:${i}"><div class="store-main"><span class="store-initial" aria-hidden="true">${initial}</span><div class="store-id"><div class="store-name">${escapeHtml(store.name || "Untitled store")}</div><div class="store-url">${subdomain ? `<a href="https://${subdomain}.lebrands.store">${host}</a>` : "Store address unavailable"}</div></div></div>
      <div class="store-meta"><span class="status-pill" data-status="${status}">${status}</span><span class="store-role">${escapeHtml(store.role || "member")}</span></div>
      <nav class="store-actions" aria-label="Store links"><a class="inline-link primary-link" href="/stores/${id}">Open dashboard ${arrow}</a><a class="inline-link" href="/stores/${id}/build">Build your store</a>${store.role === "owner" ? `<a class="inline-link" href="/stores/${id}/settings/checkout">Checkout settings</a>` : ""}${store.status === "live" ? `<a class="inline-link" href="https://${subdomain}.lebrands.store" target="_blank" rel="noopener">View store</a>` : ""}</nav></article>`;
  }).join("");
  return accountDoc("Your stores", `${accountHeader(user)}<main class="wrap dashboard-main">
    ${forcedNotice(data)}
    <div class="dashboard-title"><div><div class="eyebrow">Your LeBrands account</div><h1>Good to see you, ${escapeHtml(name)}.</h1><p>Your stores, gathered in one place.</p></div>
      <div class="dashboard-actions">${!user.must_change_password ? '<a class="button" href="/stores/new">Create a store <span aria-hidden="true">+</span></a>' : ""}</div>
    </div>
    ${alertBlock(data.error, data.notice)}
    ${user.must_change_password ? "" : stores.length
      ? `<section aria-label="Your stores" class="store-list">${rows}</section>`
      : `<section class="empty-card"><div class="empty-mark" aria-hidden="true">+</div><h2>Your first store starts here.</h2><p>Claim a store address for your brand and start shaping its home online.</p><a class="button" href="/stores/new">Create your store <span aria-hidden="true">↗</span></a></section>`}
    <div class="form-foot" style="text-align:left;margin-top:27px"><a href="/account">Account and password</a></div>
  </main>${footer()}`, '<link rel="stylesheet" href="/assets/account-home.css">');
}

function newStore(data) {
  return authFrame({
    eyebrow:"Build your store with Ann",user:data.user,
    heading:"Your brand. Your store. Let's begin.",
    intro:"Ann will help you create your store one small choice at a time, with a live preview beside your conversation.",
    title:"Start building with Ann",
    description:"Add your business details, choose a look and bring your products together. You can fine-tune everything in the theme editor later.",
    form:`${alertBlock(data.error,data.notice)}<form method="post" action="/stores/new"><input type="hidden" name="start_with_ann" value="1"><button class="button" type="submit">Build my store with Ann</button></form><p class="form-help">This creates an unpublished draft. Your store only goes live after you review and publish.</p>`,
    after:'<div class="form-foot"><a href="/">Back to your stores</a></div>',
  });
}
function account(data) {
  const mustChange = Boolean(data.user?.must_change_password);
  return authFrame({
    eyebrow: "Your account",
    user: data.user,
    heading: mustChange ? "One important step before you continue." : "Keep your account yours.",
    intro: mustChange ? "A temporary password was used to give you access. Reset it now to protect your account and unlock your stores." : "Choose a new password whenever you need to refresh your account security.",
    title: "Change password",
    description: "Enter your current password, then choose a new one.",
    form: `${alertBlock(data.error, data.notice)}<form method="post" action="/account" autocomplete="on">
      <div class="form-control"><label for="current_password">Current password</label><input id="current_password" name="current_password" type="password" autocomplete="current-password" required placeholder="Current password"></div>
      <div class="form-control"><label for="password">New password</label><input id="password" name="password" type="password" autocomplete="new-password" required minlength="10" placeholder="At least 10 characters"><span class="form-help">Use at least 10 characters.</span></div>
      <div class="form-control"><label for="confirm">Confirm new password</label><input id="confirm" name="confirm" type="password" autocomplete="new-password" required minlength="10" placeholder="Enter it again"></div>
      <button class="button" type="submit">Update password</button>
    </form>`,
    after: mustChange ? "" : `<div class="form-foot"><a href="/">Back to your stores</a></div>`,
  });
}

function errorPage(data) {
  const message = data.error || "We couldn't load this page right now.";
  return accountDoc("Something went wrong", `${accountHeader()}<main class="wrap legal-page">
    <div class="error-code">A small setback</div><h1>Let's get you back on track.</h1>${alertBlock(message, data.notice)}
    <p>Your account and store information have not been changed by this page.</p>
    <div class="error-actions"><a class="button" href="/">Return to your stores</a><a class="button button-outline" href="mailto:support@lebrands.store">Contact support</a></div>
  </main>${footer()}`);
}

export function renderAccount(view, data = {}) {
  switch (view) {
    case "signup": return signup(data);
    case "login": return login(data);
    case "dashboard": return dashboard(data);
    case "new-store": return newStore(data);
    case "account": return account(data);
    case "forgot-password": return forgotPassword(data);
    case "error": return errorPage(data);
    default: return errorPage({ ...data, error: data.error || "This account page could not be found." });
  }
}
