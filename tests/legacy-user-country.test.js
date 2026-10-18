import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {setupAnnFixtureDatabase} from "../src/ann-preview-fixture.js";
import {migrationSelection} from "../db/migration-selection.js";
const migration=await readFile(new URL("../db/staged/0036_legacy_user_country.sql",import.meta.url),"utf8");

test("country-only legacy update is explicit, expires on phone entry and cannot exempt new accounts",async()=>{
  const originalContact=await readFile(new URL("../db/staged/0030_registration_contact.sql",import.meta.url),"utf8");
  assert.equal(migration.match(/string_to_array\('([^']+)'/)[1],originalContact.match(/string_to_array\('([^']+)'/)[1]);
  assert.deepEqual(migrationSelection(["--staged-legacy-user-country"]),{
    staged:true,filename:"0036_legacy_user_country.sql",requires:"0030_registration_contact.sql"});
  const pg=await setupAnnFixtureDatabase({businessDocuments:true});
  try{
    await pg.exec("UPDATE public.users SET country_code=NULL,phone=NULL");
    const original=(await pg.query("SELECT id,(to_jsonb(u)-'country_code'-'updated_at')::text AS unchanged FROM users u ORDER BY id")).rows;
    const registrations=(await pg.query("SELECT oid FROM pg_proc WHERE proname='register_user' ORDER BY oid")).rows;
    await pg.transaction(tx=>tx.exec(migration));
    const rows=(await pg.query("SELECT id,country_code,phone,legacy_country_only,(to_jsonb(u)-'country_code'-'legacy_country_only'-'updated_at')::text AS unchanged FROM users u ORDER BY id")).rows;
    assert.equal(rows.length,2);
    rows.forEach((row,i)=>{
      assert.equal(row.country_code,"IN");assert.equal(row.phone,null);assert.equal(row.legacy_country_only,true);
      assert.equal(row.unchanged,original[i].unchanged);
    });
    assert.deepEqual((await pg.query("SELECT oid FROM pg_proc WHERE proname='register_user' ORDER BY oid")).rows,registrations);
    await assert.rejects(pg.query("UPDATE users SET country_code='ZZ' WHERE id=$1",[rows[0].id]),/users_registration_contact/);
    await pg.query("UPDATE users SET phone='+919876543210' WHERE id=$1",[rows[0].id]);
    assert.equal((await pg.query("SELECT legacy_country_only FROM users WHERE id=$1",[rows[0].id])).rows[0].legacy_country_only,false);
    await assert.rejects(pg.query("UPDATE users SET phone=NULL WHERE id=$1",[rows[0].id]),/users_registration_contact/);
    // Deliberately grant more access than production to prove the trigger
    // rejects re-enabling exceptions even when column permissions allow it.
    await pg.exec("GRANT SELECT,UPDATE ON public.users TO lebrands_app; CREATE POLICY legacy_country_probe ON public.users FOR ALL TO lebrands_app USING(true) WITH CHECK(true); SET ROLE lebrands_app");
    await assert.rejects(pg.query("UPDATE users SET legacy_country_only=true WHERE id=$1",[rows[0].id]),/Legacy contact exceptions require an administrator/);
    await pg.exec("RESET ROLE");
    const newId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    await assert.rejects(pg.query("INSERT INTO users(id,email,name,country_code) VALUES($1,'new-legacy-probe@example.com','New account','IN')",[newId]),/users_registration_contact/);
    await pg.query("INSERT INTO users(id,email,name,country_code,phone) VALUES($1,'new-legacy-probe@example.com','New account','IN','+919876543211')",[newId]);
    assert.equal((await pg.query("SELECT legacy_country_only FROM users WHERE id=$1",[newId])).rows[0].legacy_country_only,false);
    await assert.rejects(pg.transaction(tx=>tx.exec(migration)),/Expected exactly two legacy accounts/);
  }finally{await pg.close();}
});
