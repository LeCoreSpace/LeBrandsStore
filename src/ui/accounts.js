import { escapeHtml, layout, brandMark, accountHeader, footer } from "./layout.js";

const APP_ORIGIN = "https://app.lebrands.store";

function accountDoc(title, body) {
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
  });
}

function alertBlock(error, notice) {
  return `${error ? `<div class="form-alert" role="alert">${escapeHtml(error)}</div>` : ""}${notice ? `<div class="form-notice" role="status">${escapeHtml(notice)}</div>` : ""}`;
}

function authFrame({ eyebrow, heading, intro, title, description, form, after, user }) {
  return accountDoc(title, `${accountHeader(user)}<main class="wrap auth-shell">
    <section class="auth-intro"><div class="eyebrow">${escapeHtml(eyebrow)}</div><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(intro)}</p>
      <div class="auth-stamp"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#e4e9d4"/><path d="M12 20h16M20 12v16" stroke="#214a3d" stroke-width="1.5"/></svg><span>Built for independent Indian brands</span></div>
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
  const rows = stores.map((store) => {
    const subdomain = escapeHtml(store.subdomain || "");
    const host = `${subdomain}.lebrands.store`;
    return `<article class="store-row"><div><div class="store-name">${escapeHtml(store.name || "Untitled store")}</div><div class="store-url">${subdomain ? `<a href="https://${subdomain}.lebrands.store">${host}</a>` : "Store address unavailable"}</div></div>
      <span class="status-pill">${escapeHtml(store.status || "unknown")}</span><div class="store-role">${escapeHtml(store.role || "member")}<br><a class="inline-link" href="/stores/${escapeHtml(store.store_id)}/setup">Continue setup</a>${store.role === "owner" ? `<br><a class="inline-link" href="/stores/${escapeHtml(store.store_id)}/settings/checkout">Checkout settings</a><br><a class="inline-link" href="/stores/${escapeHtml(store.store_id)}/orders">Orders</a>` : ""}${store.status === "live" ? `<br><a class="inline-link" href="https://${subdomain}.lebrands.store" target="_blank" rel="noopener">View store</a>` : ""}</div></article>`;
  }).join("");
  return accountDoc("Your stores", `${accountHeader(user)}<main class="wrap dashboard-main">
    ${forcedNotice(data)}
    <div class="dashboard-title"><div><div class="eyebrow">Your LeBrands account</div><h1>Good to see you, ${escapeHtml(name)}.</h1><p>Your stores, gathered in one place.</p></div>
      <div class="dashboard-actions">${!user.must_change_password ? '<a class="button" href="/stores/new">Create a store <span aria-hidden="true">+</span></a>' : ""}<form method="post" action="/logout"><button class="quiet-button" type="submit">Sign out</button></form></div>
    </div>
    ${alertBlock(data.error, data.notice)}
    ${user.must_change_password ? "" : stores.length
      ? `<section aria-label="Your stores" class="store-list">${rows}</section>`
      : `<section class="empty-card"><div class="empty-mark" aria-hidden="true">+</div><h2>Your first store starts here.</h2><p>Claim a store address for your brand and start shaping its home online.</p><a class="button" href="/stores/new">Create your store <span aria-hidden="true">↗</span></a></section>`}
    <div class="form-foot" style="text-align:left;margin-top:27px"><a href="/account">Account and password</a></div>
  </main>${footer()}`);
}

function newStore(data) {
  const values = data.values || {};
  return authFrame({
    eyebrow: "A home for your brand",
    user: data.user,
    heading: "Claim your place on the internet.",
    intro: "Choose a brand name and a short store address. You can begin with this address and connect your own domain later.",
    title: "Create a store",
    description: "Choose the name customers will see and the address they'll remember.",
    form: `${alertBlock(data.error, data.notice)}<form method="post" action="/stores/new" id="new-store-form" autocomplete="on">
      <div class="form-control"><label for="brand_name">Brand name</label><input id="brand_name" name="brand_name" type="text" minlength="2" maxlength="40" required value="${escapeHtml(values.brand_name || "")}" placeholder="Moru Studio"></div>
      <div class="form-control"><label for="subdomain">Store address</label><div class="subdomain-wrap"><input id="subdomain" name="subdomain" type="text" autocapitalize="none" autocomplete="off" spellcheck="false" minlength="3" maxlength="30" pattern="[a-z0-9][a-z0-9-]{1,28}[a-z0-9]" required value="${escapeHtml(values.subdomain || "")}" placeholder="moru"><span class="subdomain-suffix">.lebrands.store</span></div><span class="form-help">Lowercase letters, numbers and hyphens. 3 to 30 characters.</span><span class="availability" id="subdomain-availability" aria-live="polite" role="status">Enter an address to check availability.</span></div>
      <button class="button" id="create-store-submit" type="submit" disabled>Create store <span aria-hidden="true">↗</span></button>
    </form>
    <script>
      (() => {
        const input = document.getElementById("subdomain");
        const status = document.getElementById("subdomain-availability");
        const submit = document.getElementById("create-store-submit");
        if (!input || !status || !submit) return;
        let timer = 0;
        let sequence = 0;
        const setStatus = (message, state) => {
          status.textContent = message;
          status.dataset.state = state || "";
          submit.disabled = state !== "available";
        };
        input.addEventListener("input", () => {
          const name = input.value.trim().toLowerCase();
          input.value = name;
          const check = ++sequence;
          clearTimeout(timer);
          if (!name) { setStatus("Enter an address to check availability.", ""); return; }
          if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(name)) {
            setStatus("Use 3 to 30 lowercase letters, numbers or hyphens; start and end with a letter or number.", "error");
            return;
          }
          setStatus("Checking address…", "");
          timer = window.setTimeout(async () => {
            try {
              const response = await fetch("/api/subdomain-check?name=" + encodeURIComponent(name), {
                method: "GET", headers: { "Accept": "application/json" }, credentials: "same-origin"
              });
              if (!response.ok) throw new Error("Availability check returned " + response.status);
              const result = await response.json();
              if (check !== sequence) return;
              if (result.available === true) setStatus(name + ".lebrands.store is available.", "available");
              else if (result.available === false) setStatus("That address is not available. Try another.", "unavailable");
              else setStatus("We couldn't confirm availability. Please try again.", "error");
            } catch {
              if (check === sequence) setStatus("Availability check failed. Check your connection and try again.", "error");
            }
          }, 350);
        });
      })();
    </script>`,
    after: `<div class="form-foot"><a href="/">Back to your stores</a></div>`,
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
