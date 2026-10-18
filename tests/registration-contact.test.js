import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { REGISTRATION_COUNTRIES, validateRegistration } from "../src/public/registration-validation.js";
import { hashPassword } from "../src/auth/passwords.js";
import { renderAccount } from "../src/ui/accounts.js";
import { handleAccounts } from "../src/auth/routes.js";
import { migrationSelection } from "../db/migration-selection.js";

const env = { PASSWORD_PEPPER: Buffer.alloc(32, 0x42).toString("base64") };
const valid = { name: "Example Owner", email: " OWNER@example.com ", country: "IN",
  phone: "9876543210", password: "A distinctly better password 73!",
  confirm: "A distinctly better password 73!", terms: "yes" };

test("registration validates international numbers against the selected country", () => {
  for (const [country, phone, normalized] of [
    ["IN", "98765 43210", "+919876543210"],
    ["IN", "+91 98765 43210", "+919876543210"],
    ["US", "(650) 253-0000", "+16502530000"],
    ["GB", "020 7946 0018", "+442079460018"],
    ["AU", "0412 345 678", "+61412345678"],
    ["SG", "8123 4567", "+6581234567"],
    ["AE", "050 123 4567", "+971501234567"],
  ]) {
    const result = validateRegistration({ ...valid, country, phone });
    assert.deepEqual(result.errors, {}, `${country}: ${JSON.stringify(result.errors)}`);
    assert.equal(result.data.phone, normalized);
    assert.equal(result.data.email, "owner@example.com");
  }
  for (const phone of ["123", "+1 650 253 0000", "call 9876543210", "9876543210 ext 2", "1".repeat(80)]) {
    assert.ok(validateRegistration({ ...valid, phone }).errors.phone, phone);
  }
  for (const country of ["", "ZZ", "in", null]) assert.ok(validateRegistration({ ...valid, country }).errors.country);
});

test("all registration fields have authoritative validation without retaining passwords", async () => {
  assert.deepEqual(Object.keys(validateRegistration({}).errors).sort(),
    ["name", "email", "country", "phone", "password", "confirm", "terms"].sort());
  for (const email of ["a..b@example.com", ".a@example.com", "a@-bad.com", "a@example..com", "a@@example.com", `${"a".repeat(65)}@example.com`])
    assert.ok(validateRegistration({ ...valid, email }).errors.email, email);
  assert.ok(validateRegistration({ ...valid, name: "x".repeat(121) }).errors.name);
  assert.ok(validateRegistration({ ...valid, name: "x\u0000y" }).errors.name);
  assert.ok(validateRegistration({ ...valid, password: "password1234", confirm: "password1234" }).errors.password);
  assert.ok(validateRegistration({ ...valid, password: "x".repeat(1025) }).errors.password);
  assert.ok(validateRegistration({ ...valid, confirm: "different" }).errors.confirm);
  assert.ok(validateRegistration({ ...valid, terms: "" }).errors.terms);

  let writes = 0;
  const response = await handleAccounts(new Request("https://app.lebrands.store/signup", {
    method: "POST", headers: { origin: "https://app.lebrands.store", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...valid, country: "GB", phone: "123", confirm: "wrong" }),
  }), env, null, { createDb: () => ({ close: async () => {} }), repository: { register() { writes++; } } });
  assert.equal(response.status, 400);
  assert.equal(writes, 0);
  const html = await response.text();
  assert.match(html, /value="GB" selected/);
  assert.match(html, /value="123"/);
  assert.match(html, /id="phone-error"[^>]*>Enter a valid phone number/);
  assert.doesNotMatch(html, /value="A distinctly better password/);
  assert.match(html, /name="terms"[^>]*checked/);
});

test("registration form exposes calling codes and accessible field errors", () => {
  const html = renderAccount("signup", {});
  assert.ok(REGISTRATION_COUNTRIES.length > 200);
  assert.match(html, /India \(\+91\)/);
  assert.match(html, /type="module" src="\/assets\/registration.js"/);
  for (const field of ["name", "email", "country", "phone", "password", "confirm", "terms"])
    assert.match(html, new RegExp(`id="${field}-error"`));
  assert.match(html, /id="phone-code"/);
  assert.match(html, /autocomplete="tel"/);
});

test("staged contact migration uses real foundational schema and preserves accounts and privileges", async () => {
  const pg = new PGlite();
  const record = await hashPassword(valid.password, env);
  const args = [valid.email.trim().toLowerCase(), valid.name, record.password_hash, record.password_algo,
    record.password_iterations, record.password_salt, "+919876543210", "IN"];
  try {
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.schema_migrations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), filename text NOT NULL UNIQUE,
        checksum text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`);
    for (const file of ["0001_init.sql", "0002_rls.sql", "0003_accounts.sql", "0004_password_pepper.sql"])
      await pg.exec(await readFile(`db/migrations/${file}`, "utf8"));
    await pg.query("INSERT INTO public.users(email,name,phone) VALUES('legacy@example.com','Legacy','unformatted legacy phone')");
    const before = (await pg.query("SELECT 'public.register_user(text,text,text,text,integer,text,text)'::regprocedure::oid AS oid")).rows[0].oid;
    await pg.exec("ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role");
    const migration = await readFile("db/staged/0030_registration_contact.sql", "utf8");
    assert.deepEqual(migration.match(/string_to_array\('([^']+)'/)[1].split(",").sort(),
      REGISTRATION_COUNTRIES.map(item => item.code).sort());
    await pg.exec(migration);
    const legacy = (await pg.query("SELECT phone,country_code FROM public.users WHERE email='legacy@example.com'")).rows[0];
    assert.deepEqual(legacy, { phone: "unformatted legacy phone", country_code: null });
    const after = (await pg.query("SELECT 'public.register_user(text,text,text,text,integer,text,text)'::regprocedure::oid AS oid")).rows[0].oid;
    assert.equal(after, before);
    await pg.exec("SET ROLE lebrands_app");
    await pg.query("SELECT public.register_user_with_contact($1,$2,$3,$4,$5,$6,$7,$8)", args);
    await pg.query("SELECT public.register_user_with_contact($1,$2,$3,$4,$5,$6,$7,$8)",
      [...args.slice(0, 6), "+442079460018", "GB"]);
    await assert.rejects(pg.query("UPDATE public.users SET phone='+16502530000'"), /permission denied/);
    await pg.exec("RESET ROLE");
    const users = (await pg.query("SELECT email,phone,country_code FROM public.users WHERE email=$1", [args[0]])).rows;
    assert.deepEqual(users, [{ email: "owner@example.com", phone: "+919876543210", country_code: "IN" }]);
    for (const role of ["anon", "authenticated", "service_role"]) {
      await pg.exec(`SET ROLE ${role}`);
      await assert.rejects(pg.query("SELECT public.register_user_with_contact($1,$2,$3,$4,$5,$6,$7,$8)", args), /permission denied/);
      await pg.exec("RESET ROLE");
    }
    for (const [phone, country] of [["invalid", "IN"], ["+919876543210", "ZZ"], [null, "IN"], ["+919876543210", null]]) {
      await assert.rejects(pg.query("SELECT public.register_user_with_contact($1,$2,$3,$4,$5,$6,$7,$8)",
        ["other@example.com", ...args.slice(1, 6), phone, country]));
    }
    assert.deepEqual(migrationSelection(["--staged-registration-contact"]), {
      staged: true, filename: "0030_registration_contact.sql", requires: "0004_password_pepper.sql",
    });
  } finally { await pg.close(); }
});
