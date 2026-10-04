import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";
import { clearPgEnvironment, logDatabaseFailure, printConnectionTarget, validateSupabaseUrl } from "../db/connection.js";

const HOST = "aws-0-ap-south-1.pooler.supabase.com";
const FIXTURE = `postgresql://postgres.fixture:synthetic-password@${HOST}:5432/postgres`;

test("validates a Supabase URL and returns metadata only, never credentials", () => {
  assert.deepEqual(validateSupabaseUrl(FIXTURE), {
    username: "postgres.fixture", hostname: HOST, port: 5432,
  });
});

for (const [label, value] of [
  ["missing", undefined],
  ["empty", ""],
  ["malformed", "not-a-url-containing-synthetic-password"],
  ["Replit database", "postgres://user:synthetic-password@localhost:5432/db"],
  ["Supabase .co host", "postgres://user:synthetic-password@db.fixture.supabase.co/postgres"],
  ["suffix spoof", "postgres://user:synthetic-password@not-supabase.com/postgres"],
  ["extended hostname", "postgres://user:synthetic-password@pooler.supabase.com.evil.test/postgres"],
  ["wrong protocol", `https://user:synthetic-password@${HOST}/postgres`],
  ["missing username", `postgres://${HOST}/postgres`],
  ["missing database", `postgres://user:synthetic-password@${HOST}`],
  ["invalid port", `postgres://user:synthetic-password@${HOST}:99999/postgres`],
]) {
  test(`rejects ${label} configuration without exposing the URL or password`, () => {
    assert.throws(() => validateSupabaseUrl(value), (error) => {
      assert.match(error.message, /SUPABASE_DB_URL/);
      assert.ok(!error.message.includes("synthetic-password"));
      if (value) assert.notEqual(error.message, value);
      return true;
    });
  });
}

test("defaults the displayed port and decodes only the displayed username", () => {
  const target = validateSupabaseUrl(
    `postgres://postgres%2Efixture:encoded%40password@${HOST}/postgres?sslmode=verify-full`,
  );
  assert.equal(target.port, 5432);
  assert.equal(target.username, "postgres.fixture");
  assert.equal("password" in target, false);
});

test("validation does not reconstruct the URL or add driver options", () => {
  const target = validateSupabaseUrl(`${FIXTURE}?sslmode=disable`);
  assert.deepEqual(Object.keys(target), ["username", "hostname", "port"]);
});

test("target logging contains only username, hostname and port", () => {
  const capture = mock.method(console, "info", () => {});
  try {
    printConnectionTarget(validateSupabaseUrl(FIXTURE));
    assert.equal(capture.mock.calls.length, 1);
    const [message] = capture.mock.calls[0].arguments;
    assert.deepEqual(JSON.parse(message), { username: "postgres.fixture", hostname: HOST, port: 5432 });
    assert.ok(!message.includes("synthetic-password"));
    assert.ok(!message.includes("postgresql://"));
  } finally {
    capture.mock.restore();
  }
});

test("both scripts clear PG* variables, preserve the URL and construct exactly one client", () => {
  for (const name of ["migrate", "seed"]) {
    const source = readFileSync(new URL(`../db/${name}.js`, import.meta.url), "utf8");
    assert.ok(source.match(/process\.env\.[A-Z_]+/g).every((value) => value === "process.env.SUPABASE_DB_URL"));
    assert.equal(source.match(/\bpostgres\(/g).length, 1);
    const call = 'postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1 })';
    assert.ok(source.includes(call));
    assert.ok(source.indexOf("clearPgEnvironment();") < source.indexOf(call));
    assert.ok(source.indexOf("printConnectionTarget(") < source.indexOf(call));
    assert.ok(!/SET\s+ROLE|SUPABASE_APP_DB_URL|connectionOptions|password:/i.test(source));
    assert.ok(source.includes('logDatabaseFailure("'));
  }
});

test("clears every PG* name without modifying unrelated secrets or inspecting values", () => {
  const env = { PGUSER: "fixture", PGPASSWORD: "fixture", PGHOST: "localhost", pgport: "9999", SUPABASE_DB_URL: FIXTURE, OTHER: "keep" };
  clearPgEnvironment(env);
  assert.deepEqual(env, { SUPABASE_DB_URL: FIXTURE, OTHER: "keep" });
});

test("failure logging includes code and message but redacts URLs and encoded/decoded passwords", () => {
  const capture = mock.method(console, "error", () => {});
  const url = `postgres://postgres.fixture:encoded%40password@${HOST}/postgres`;
  try {
    logDatabaseFailure("Migration failed", {
      code: "28P01",
      message: `password authentication failed for user "postgres.fixture"; ${url} encoded@password encoded%40password`,
    }, url);
    const [message] = capture.mock.calls[0].arguments;
    assert.match(message, /28P01/);
    assert.match(message, /password authentication failed for user "postgres.fixture"/);
    assert.ok(!message.includes(url));
    assert.ok(!message.includes("encoded@password"));
    assert.ok(!message.includes("encoded%40password"));
    assert.ok(!message.includes("postgres://"));
  } finally {
    capture.mock.restore();
  }
});

test("error redaction also handles malformed URLs and other PostgreSQL URLs", () => {
  const capture = mock.method(console, "error", () => {});
  try {
    logDatabaseFailure("Seed failed", { code: "ERR_INVALID_URL", message: "bad-secret-input postgres://someone:hidden@localhost/db" }, "bad-secret-input");
    const [message] = capture.mock.calls[0].arguments;
    assert.match(message, /ERR_INVALID_URL/);
    assert.ok(!message.includes("bad-secret-input"));
    assert.ok(!message.includes("hidden"));
  } finally {
    capture.mock.restore();
  }
});

test("the actual driver uses the original URL's credentials after clearing fabricated PG* variables", () => {
  // The child gets ONLY synthetic environment values, never workspace secrets.
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import postgres from "postgres";
    import { clearPgEnvironment } from "./db/connection.js";
    clearPgEnvironment();
    assert.ok(!Object.keys(process.env).some(key => /^PG/i.test(key)));
    const url = "postgres://user:encoded%2540password%3Avalue@${HOST}/postgres";
    const sql = postgres(url, { ssl: "require", max: 1 });
    assert.deepEqual(sql.options.host, ["${HOST}"]);
    assert.deepEqual(sql.options.port, [5432]);
    assert.equal(sql.options.user, "user");
    assert.equal(sql.options.database, "postgres");
    assert.equal(sql.options.pass, "encoded%40password:value");
    assert.equal(sql.options.ssl, "require");
    assert.equal(sql.options.max, 1);
    await sql.end();
    console.info("Driver options verified without queries.");
  `], {
    cwd: new URL("../", import.meta.url),
    env: {
      PGHOST: "localhost",
      PGPORT: "9999",
      PGUSER: "unexpected-user",
      PGUSERNAME: "unexpected-username",
      PGDATABASE: "unexpected-db",
      PGPASSWORD: "must-never-be-used",
      PGSSL: "disable",
      PGTARGETSESSIONATTRS: "standby",
      PGCONNECT_TIMEOUT: "999",
      PGAPPNAME: "unexpected-app",
    },
    encoding: "utf8",
  });
  assert.match(output, /Driver options verified without queries/);
});