import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { livePreviewEnv, previewAccountRequest, livePreviewHeaders } from "../src/preview-live.js";

// Synthetic credentials only. No sockets or environment variables.
const env = {
  PREVIEW_LIVE_DATABASE: "enabled",
  SUPABASE_APP_DB_URL: "postgres://lebrands_app:synthetic@db.example.supabase.co:5432/postgres",
  SUPABASE_DB_URL: "must-not-reach-worker",
  CLOUDFLARE_API_TOKEN: "must-not-reach-worker",
  PASSWORD_PEPPER: "synthetic", SESSION_SECRET: "synthetic",
  REPLIT_DEV_DOMAIN: "test-workspace.replit.dev",
};

test("live preview only uses the restricted connection with TLS and strips administrative secrets", () => {
  const bound = livePreviewEnv(env);
  assert.equal(new URL(bound.HYPERDRIVE.connectionString).searchParams.get("sslmode"), "require");
  assert.equal(bound.SUPABASE_DB_URL, undefined);
  assert.equal(bound.CLOUDFLARE_API_TOKEN, undefined);
  assert.throws(() => livePreviewEnv({ ...env, SUPABASE_APP_DB_URL: env.SUPABASE_APP_DB_URL.replace("lebrands_app", "postgres") }));
  assert.throws(() => livePreviewEnv({ ...env, SESSION_SECRET: "" }));
});

test("preview only normalises writes from this workspace's exact browser origin", async () => {
  const make = origin => new Request("https://test-workspace.replit.dev/signup",
    { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: "name=Test" });
  const forwarded = previewAccountRequest(make("https://test-workspace.replit.dev"), "https://app.lebrands.store/signup", env);
  assert.equal(forwarded.headers.get("origin"), "https://app.lebrands.store");
  assert.equal(await forwarded.text(), "name=Test");
  for (const origin of ["https://attacker.replit.dev", "https://app.lebrands.store", "null", ""]) {
    assert.equal(previewAccountRequest(make(origin), "https://app.lebrands.store/signup", env), null);
  }
});

test("preview iframe cookies remain secure and partitioned without changing production cookies", () => {
  const headers = new Headers({ "set-cookie": "__Host-session=synthetic; Secure; HttpOnly; SameSite=Lax; Path=/",
    "content-security-policy": "default-src 'self'; frame-ancestors *" });
  livePreviewHeaders(headers, env);
  assert.match(headers.get("set-cookie"), /Secure; HttpOnly; SameSite=None; Partitioned/);
  assert.doesNotMatch(headers.get("content-security-policy"), /frame-ancestors \*/);
  const production = new Headers({ "set-cookie": "cookie; SameSite=Lax" });
  livePreviewHeaders(production, {});
  assert.equal(production.get("set-cookie"), "cookie; SameSite=Lax");
});

test("live preview bindings exclude the administrator URL and production entry remains separate", async () => {
  const config = JSON.parse(await readFile("wrangler.preview.jsonc", "utf8"));
  assert.ok(config.secrets.required.includes("SUPABASE_APP_DB_URL"));
  assert.ok(!config.secrets.required.includes("SUPABASE_DB_URL"));
  const source = await readFile("src/index.js", "utf8");
  assert.doesNotMatch(source, /preview-live|__database-status/);
});
