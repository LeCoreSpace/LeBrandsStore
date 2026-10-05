import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword, validatePassword, constantTimeEqual, sha256 } from "../src/auth/passwords.js";
import {
  isValidOrigin, sessionCookie, readSessionToken, validateSubdomain, normalizeEmail, ipHash,
} from "../src/auth/security.js";
import { PRICING } from "../src/config/pricing.js";
import { renderHome, renderLegal } from "../src/ui/home.js";
import { renderAccount } from "../src/ui/accounts.js";
import { handleAccounts } from "../src/auth/routes.js";

test("PBKDF2-SHA256 hashes have 600000 iterations, fresh 16-byte salts, and verify correctly", async () => {
  const record = await hashPassword("A distinctly better password 73!");
  const second = await hashPassword("A distinctly better password 73!");
  assert.equal(record.password_iterations, 600000);
  assert.equal(record.password_algo, "pbkdf2-sha256");
  assert.equal(record.password_salt.length, 32);
  assert.equal(record.password_hash.length, 64);
  assert.notEqual(record.password_salt, second.password_salt);
  assert.equal(await verifyPassword("A distinctly better password 73!", record), true);
  assert.equal(await verifyPassword("Wrong but long password 99!", record), false);
  assert.equal(await verifyPassword("some long password", null), false);
});

test("weak/common passwords are rejected, including case variations", () => {
  for (const value of ["short", "1234567890", "PASSWORD123", "qwertyuiop", "welcome1234"]) {
    assert.ok(validatePassword(value));
  }
  assert.equal(validatePassword("A distinctly better password 73!"), null);
  assert.ok(validatePassword("x".repeat(1025)));
  assert.equal(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2])), true);
  assert.equal(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([2, 1])), false);
});

test("cookies have every required flag and are host-only; token hashes are one-way", async () => {
  const token = "a".repeat(64);
  const cookie = sessionCookie(token);
  for (const flag of ["__Host-lbs_session=", "Secure", "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=2592000"]) assert.ok(cookie.includes(flag));
  assert.ok(!cookie.includes("Domain="));
  assert.ok(sessionCookie("", true).includes("Max-Age=0"));
  assert.notEqual(await sha256(token), token);
  assert.equal(readSessionToken(new Request("https://app.lebrands.store/", { headers: { cookie } })), token);
  assert.equal(readSessionToken(new Request("https://app.lebrands.store/", { headers: { cookie: `${cookie}; __Host-lbs_session=${token}` } })), null);
});

test("POST origin must be the exact HTTPS account origin", () => {
  for (const origin of ["https://evil.test", "http://app.lebrands.store", "https://app.lebrands.store.evil.test", "null", ""]) {
    assert.equal(isValidOrigin(new Request("https://app.lebrands.store/login", { headers: { origin } })), false);
  }
  assert.equal(isValidOrigin(new Request("https://app.lebrands.store/login", { headers: { origin: "https://app.lebrands.store" } })), true);
});

test("subdomains match the schema and reject reserved addresses; emails are canonical", () => {
  for (const name of ["ab", "-brand", "brand-", "Brand", "a.b", "www", "app", "checkout", "x".repeat(31)]) assert.equal(validateSubdomain(name), false);
  for (const name of ["brand", "my-brand-2026", "abc"]) assert.equal(validateSubdomain(name), true);
  assert.equal(normalizeEmail("  Owner@Example.COM  "), "owner@example.com");
  assert.equal(normalizeEmail("not-an-email"), null);
});

test("homepage pricing comes from the single config and legal pages are marked draft", () => {
  const original = PRICING.plans[0].foundingPrice;
  try {
    PRICING.plans[0].foundingPrice = 12345;
    const rendered = renderHome();
    assert.match(rendered, /12,345/);
    assert.match(rendered.replace(/<[^>]+>/g, ""), /Make your online brand dream come true/);
    assert.match(rendered, /https:\/\/app\.lebrands\.store\/signup/);
    assert.match(rendered, /og:title/);
    assert.match(renderLegal("privacy"), /draft/i);
  } finally { PRICING.plans[0].foundingPrice = original; }
});

test("all account views escape user input, never redisplay passwords, and are noindex", () => {
  for (const view of ["signup", "login", "dashboard", "new-store", "account", "forgot-password"]) {
    const rendered = renderAccount(view, {
      user: { name: "<script>alert(1)</script>", email: "test@example.com" }, stores: [],
      error: "<img src=x onerror=alert(1)>", values: { name: "<script>bad</script>", password: "never-display-this" },
    });
    assert.ok(!rendered.includes("<script>alert(1)</script>"));
    assert.ok(!rendered.includes("<img src=x"));
    assert.ok(!rendered.includes("never-display-this"));
    assert.match(rendered, /noindex/);
  }
});

function memoryRepository() {
  const users = new Map();
  const sessions = new Map();
  let current;
  let next = 1;
  return {
    async register(email, name, record) {
      if (!users.has(email)) users.set(email, { user_id: String(next++), email, name, ...record, must_change_password: false, stores: [] });
    },
    async login(email, ip, fn) {
      const result = await fn(users.get(email));
      if (result) sessions.set(result.tokenHash, users.get(email));
      return result;
    },
    async getPassword(email) { return users.get(email); },
    async session(hash) { current = sessions.get(hash); return current ?? null; },
    async revoke(hash) { sessions.delete(hash); },
    async availability(name) { return name !== "taken"; },
    async createStore(id, name, subdomain, hash) {
      assert.equal(sessions.get(hash).user_id, id);
      sessions.get(hash).stores.push({ store_id: "store-1", name, subdomain, status: "draft", role: "owner" });
    },
    async changePassword(hash, record) {
      const user = sessions.get(hash);
      if (!user) return false;
      Object.assign(user, record, { must_change_password: false });
      return true;
    },
    users, sessions,
  };
}

test("offline account journey: generic signup, login, draft creation, forced reset and logout", async () => {
  const repo = memoryRepository();
  const deps = { repository: repo, createDb: () => ({ close: async () => {} }) };
  const env = { SESSION_SECRET: "offline-fixture-secret-not-a-real-key-12345" };
  let cookie;
  const call = (path, form) => handleAccounts(new Request(`https://app.lebrands.store${path}`, {
    method: form ? "POST" : "GET",
    headers: { ...(cookie ? { cookie } : {}), ...(form ? { origin: "https://app.lebrands.store", "content-type": "application/x-www-form-urlencoded" } : {}) },
    ...(form ? { body: new URLSearchParams(form) } : {}),
  }), env, null, deps);
  const password = "A distinctly better password 73!";
  const fields = { name: "Brand Owner", email: "OWNER@example.com", password, confirm: password, terms: "yes" };
  const signup = await call("/signup", fields);
  const duplicate = await call("/signup", fields);
  assert.equal(signup.status, 303);
  assert.equal(duplicate.headers.get("location"), signup.headers.get("location"));
  assert.equal(repo.users.size, 1);
  const invalid = await call("/login", { email: fields.email, password: "Wrong password 88!" });
  assert.match(await invalid.text(), /Email or password is incorrect/);
  const login = await call("/login", { email: fields.email, password });
  assert.equal(login.status, 303);
  cookie = login.headers.get("set-cookie").split(";")[0];
  assert.match(await (await call("/")).text(), /Create your store|Create a store/);
  assert.deepEqual(await (await call("/api/subdomain-check?name=app")).json(), {
    available: false, error: "Use 3 to 30 lowercase letters, numbers or hyphens. Reserved names are unavailable.",
  });
  assert.equal((await call("/stores/new", { brand_name: "My Brand", subdomain: "my-brand" })).status, 303);
  assert.match(await (await call("/")).text(), /My Brand/);
  repo.users.get("owner@example.com").must_change_password = true;
  assert.equal((await call("/")).headers.get("location"), "/account");
  assert.equal((await call("/stores/new")).headers.get("location"), "/account");
  const newPassword = "Another distinctly better password 74!";
  const changed = await call("/account", { current_password: password, password: newPassword, confirm: newPassword });
  assert.equal(changed.status, 200);
  assert.equal(repo.users.get("owner@example.com").must_change_password, false);
  assert.equal((await call("/logout", {})).status, 303);
  assert.equal(repo.sessions.size, 0);
  assert.equal((await call("/")).headers.get("location"), "/login");
});

test("untrusted POST never opens a database, and IP hashes are keyed", async () => {
  const response = await handleAccounts(new Request("https://app.lebrands.store/signup", {
    method: "POST", headers: { origin: "https://evil.test" },
  }), {}, null, { createDb: () => { throw new Error("must not connect"); } });
  assert.equal(response.status, 403);
  const request = new Request("https://app.lebrands.store/login", { headers: { "cf-connecting-ip": "192.0.2.1" } });
  assert.notEqual(await ipHash(request, "a".repeat(32)), await ipHash(request, "b".repeat(32)));
});
