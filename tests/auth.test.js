import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac, pbkdf2Sync } from "node:crypto";
import { hashPassword, verifyPassword, validatePassword, constantTimeEqual, sha256, needsPasswordRehash, PASSWORD_ITERATIONS } from "../src/auth/passwords.js";
import {
  isValidOrigin, sessionCookie, readSessionToken, validateSubdomain, normalizeEmail, ipHash,
} from "../src/auth/security.js";
import { PRICING } from "../src/config/pricing.js";
import { renderHome, renderLegal } from "../src/ui/home.js";
import { renderAccount } from "../src/ui/accounts.js";
import { handleAccounts } from "../src/auth/routes.js";
import { accountRepository } from "../src/auth/repository.js";

// Deliberately public synthetic test fixture, never a deployment secret.
const TEST_ENV = { PASSWORD_PEPPER: Buffer.alloc(32, 0x42).toString("base64") };

test("peppered PBKDF2-SHA256 uses exactly 100000 iterations and fresh 16-byte salts", async () => {
  const record = await hashPassword("A distinctly better password 73!", TEST_ENV);
  const second = await hashPassword("A distinctly better password 73!", TEST_ENV);
  assert.equal(record.password_iterations, 100000);
  assert.equal(record.password_algo, "pbkdf2-sha256");
  assert.equal(record.password_salt.length, 32);
  assert.match(record.password_hash, /^pbkdf2-sha256\$v1\$p1\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.notEqual(record.password_salt, second.password_salt);
  assert.equal(await verifyPassword("A distinctly better password 73!", record, TEST_ENV), true);
  assert.equal(await verifyPassword("Wrong but long password 99!", record, TEST_ENV), false);
  assert.equal(await verifyPassword("some long password", null, TEST_ENV), false);
  const hmac = createHmac("sha256", Buffer.from(TEST_ENV.PASSWORD_PEPPER, "base64")).update("A distinctly better password 73!").digest();
  assert.equal(record.password_hash.split("$").at(-1),
    pbkdf2Sync(hmac, Buffer.from(record.password_salt, "hex"), 100000, 32, "sha256").toString("hex"));
  assert.equal(needsPasswordRehash(record, TEST_ENV), false);
});

test("no hashing or verification invokes PBKDF2 above the production Workers limit", async (context) => {
  // Workers production rejects >100,000 iterations even when local wrangler dev accepts them.
  assert.equal(PASSWORD_ITERATIONS, 100000);
  const original = crypto.subtle.deriveBits.bind(crypto.subtle);
  const calls = [];
  context.mock.method(crypto.subtle, "deriveBits", (algorithm, ...args) => {
    assert.ok(algorithm.iterations <= 100000);
    calls.push(algorithm.iterations);
    return original(algorithm, ...args);
  });
  const record = await hashPassword("Some independent secure password!", TEST_ENV);
  await verifyPassword("Some independent secure password!", record, TEST_ENV);
  assert.equal(await verifyPassword("Some independent secure password!", {
    ...record, password_iterations: 600000, password_hash: "a".repeat(64),
  }, TEST_ENV), false);
  assert.equal(await verifyPassword("Some independent secure password!", {
    ...record, password_iterations: 100001, password_hash: record.password_hash.replace("$100000$", "$100001$"),
  }, TEST_ENV), false);
  assert.deepEqual(calls, [100000, 100000, 100000, 100000]);
});

test("missing, malformed and short peppers fail closed; wrong peppers never verify", async () => {
  for (const env of [{}, { PASSWORD_PEPPER: "invalid!" }, { PASSWORD_PEPPER: Buffer.alloc(31).toString("base64") }]) {
    await assert.rejects(hashPassword("Another secure test password!", env), { code: "PASSWORD_PEPPER_UNAVAILABLE", message: "Password service is unavailable." });
    await assert.rejects(verifyPassword("Another secure test password!", null, env), { code: "PASSWORD_PEPPER_UNAVAILABLE" });
  }
  const record = await hashPassword("Another secure test password!", TEST_ENV);
  assert.equal(await verifyPassword("Another secure test password!", record, {
    PASSWORD_PEPPER: Buffer.alloc(32, 0x43).toString("base64"),
  }), false);
});

function lowerWorkFactorRecord(password, env) {
  const salt = "ab".repeat(16);
  const key = createHmac("sha256", Buffer.from(env.PASSWORD_PEPPER, "base64")).update(password).digest();
  const digest = pbkdf2Sync(key, Buffer.from(salt, "hex"), 50000, 32, "sha256").toString("hex");
  return { password_algo: "pbkdf2-sha256", password_iterations: 50000, password_salt: salt,
    password_hash: `pbkdf2-sha256$v1$p1$50000$${salt}$${digest}` };
}

test("compatible older work factors and pepper versions are marked for upgrade", async () => {
  const password = "A distinctly better password 73!";
  const older = lowerWorkFactorRecord(password, TEST_ENV);
  assert.equal(await verifyPassword(password, older, TEST_ENV), true);
  assert.equal(needsPasswordRehash(older, TEST_ENV), true);
  const current = await hashPassword(password, TEST_ENV);
  const rotated = { PASSWORD_PEPPER_VERSION: "2", PASSWORD_PEPPER: Buffer.alloc(32, 0x43).toString("base64"),
    PASSWORD_PEPPER_V1: TEST_ENV.PASSWORD_PEPPER };
  assert.equal(await verifyPassword(password, current, rotated), true);
  assert.equal(needsPasswordRehash(current, rotated), true);
  const updated = await hashPassword(password, rotated);
  assert.match(updated.password_hash, /\$p2\$100000\$/);
  assert.equal(await verifyPassword(password, updated, rotated), true);
});

test("the real login repository rehashes atomically before issuing a session and checks CAS", async () => {
  const old = { user_id: "fixture-user", ...lowerWorkFactorRecord("A secure test password!", TEST_ENV) };
  const upgrade = await hashPassword("A secure test password!", TEST_ENV);
  for (const changed of [true, false]) {
    const calls = [];
    const tx = async (strings, ...values) => {
      const query = strings.join("?");
      calls.push({ query, values });
      if (query.includes("is_login_locked")) return [{ locked: false }];
      if (query.includes("get_password_record")) return [old];
      if (query.includes("rehash_password")) return [{ changed }];
      return [];
    };
    const repository = accountRepository({ account: (fn) => fn(tx) });
    const operation = repository.login("fixture@example.com", "a".repeat(64), async () => ({
      userId: old.user_id, tokenHash: "b".repeat(64), userAgent: "offline", upgrade,
    }));
    if (changed) await operation;
    else await assert.rejects(operation, { code: "PASSWORD_REHASH_CONFLICT" });
    const rehash = calls.findIndex((call) => call.query.includes("rehash_password"));
    const session = calls.findIndex((call) => call.query.includes("create_session"));
    assert.equal(calls[rehash].values[1], old.password_hash);
    assert.equal(calls[rehash].values[2], upgrade.password_hash);
    if (changed) assert.ok(session > rehash);
    else assert.equal(session, -1);
  }
});

test("missing pepper produces a generic service error and never writes account data", async (context) => {
  context.mock.method(console, "error", () => {});
  for (const path of ["/login", "/signup"]) {
    const response = await handleAccounts(new Request(`https://app.lebrands.store${path}`, {
      method: "POST", headers: { origin: "https://app.lebrands.store", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ name: "Owner", email: "owner@example.com", password: "A secure test password!", confirm: "A secure test password!", terms: "yes" }),
    }), {}, null, {
      createDb: () => ({ close: async () => {} }),
      repository: {
        register: () => assert.fail("Must not register without pepper"),
        login: () => assert.fail("Must not log in without pepper"),
      },
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("set-cookie"), null);
    const body = await response.text();
    assert.match(body, /Accounts are temporarily unavailable/);
    assert.ok(!body.includes("PASSWORD_PEPPER"));
  }
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
      if (result) {
        if (result.upgrade) Object.assign(users.get(email), result.upgrade);
        sessions.set(result.tokenHash, users.get(email));
      }
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
  const env = { ...TEST_ENV, SESSION_SECRET: "offline-fixture-secret-not-a-real-key-12345" };
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
  Object.assign(repo.users.get("owner@example.com"), lowerWorkFactorRecord(password, TEST_ENV));
  const login = await call("/login", { email: fields.email, password });
  assert.equal(login.status, 303);
  assert.equal(repo.users.get("owner@example.com").password_iterations, 100000);
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
