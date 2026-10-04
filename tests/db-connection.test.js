import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";
import { printConnectionTarget, supabaseConnectionOptions } from "../db/connection.js";

const HOST = "aws-0-ap-south-1.pooler.supabase.com";
const FIXTURE = `postgresql://postgres.fixture:synthetic-password@${HOST}:5432/postgres`;

test("accepts a Supabase session-pooler URL with explicit connection settings", () => {
  const options = supabaseConnectionOptions(FIXTURE);
  assert.equal(options.host, HOST);
  assert.equal(options.port, 5432);
  assert.equal(options.username, "postgres.fixture");
  assert.equal(options.database, "postgres");
  assert.equal(options.password(), "synthetic-password");
  assert.equal(options.ssl, "require");
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
  ["invalid TLS mode", `${FIXTURE}?sslmode=unexpected`],
]) {
  test(`rejects ${label} configuration without exposing the URL or password`, () => {
    assert.throws(() => supabaseConnectionOptions(value), (error) => {
      assert.match(error.message, /SUPABASE_DB_URL/);
      assert.ok(!error.message.includes("synthetic-password"));
      if (value) assert.notEqual(error.message, value);
      return true;
    });
  });
}

test("defaults port from the URL configuration and decodes credentials", () => {
  const options = supabaseConnectionOptions(
    `postgres://postgres%2Efixture:encoded%40password@${HOST}/postgres?sslmode=verify-full`,
  );
  assert.equal(options.port, 5432);
  assert.equal(options.username, "postgres.fixture");
  assert.equal(options.password(), "encoded@password");
  assert.equal(options.ssl, "verify-full");
});

test("URL query parameters cannot redirect the validated connection", () => {
  const options = supabaseConnectionOptions(`${FIXTURE}?host=localhost&port=9999&user=other&password=other`);
  assert.equal(options.host, HOST);
  assert.equal(options.port, 5432);
  assert.equal(options.username, "postgres.fixture");
  assert.equal(options.password(), "synthetic-password");
});

test("target logging contains only username, hostname and port", () => {
  const capture = mock.method(console, "info", () => {});
  try {
    printConnectionTarget(supabaseConnectionOptions(FIXTURE));
    assert.equal(capture.mock.calls.length, 1);
    const [message] = capture.mock.calls[0].arguments;
    assert.deepEqual(JSON.parse(message), { username: "postgres.fixture", hostname: HOST, port: 5432 });
    assert.ok(!message.includes("synthetic-password"));
    assert.ok(!message.includes("postgresql://"));
  } finally {
    capture.mock.restore();
  }
});

test("both scripts read only SUPABASE_DB_URL and log the target before constructing the client", () => {
  for (const name of ["migrate", "seed"]) {
    const source = readFileSync(new URL(`../db/${name}.js`, import.meta.url), "utf8");
    assert.deepEqual(source.match(/process\.env\.[A-Z_]+/g), ["process.env.SUPABASE_DB_URL"]);
    assert.ok(source.indexOf("printConnectionTarget(connectionOptions)") < source.indexOf("sql = postgres(connectionOptions)"));
    assert.ok(!source.includes("postgres(databaseUrl"));
  }
});

test("the actual driver's configuration ignores fabricated PG* variables without connecting", () => {
  // The child gets ONLY synthetic environment values, never workspace secrets.
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import postgres from "postgres";
    import { supabaseConnectionOptions } from "./db/connection.js";
    const options = supabaseConnectionOptions("postgres://user@${HOST}/postgres");
    const sql = postgres(options);
    assert.deepEqual(sql.options.host, ["${HOST}"]);
    assert.deepEqual(sql.options.port, [5432]);
    assert.equal(sql.options.user, "user");
    assert.equal(sql.options.database, "postgres");
    assert.equal(sql.options.pass(), "");
    assert.equal(sql.options.ssl, "require");
    assert.equal(sql.options.target_session_attrs, "read-write");
    assert.equal(sql.options.connect_timeout, 10);
    assert.equal(sql.options.connection.application_name, "lebrands-db-admin");
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