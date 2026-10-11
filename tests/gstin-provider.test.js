import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GSTINProviderError, mapGSTINResponse, parseGSTINResponse } from "../src/gstin/provider.js";

const fixture = name => JSON.parse(readFileSync(new URL(`../test/fixtures/gstin-${name}.json`, import.meta.url), "utf8"));
const active = () => fixture("active-synthetic");
const errorCode = code => error => error instanceof GSTINProviderError && error.code === code;

test("public-search fields normalize using only the supplied schema", () => {
  const result = mapGSTINResponse(active(), { expectedGSTIN: "27ABCDE1234F1Z0" });
  assert.deepEqual(result, {
    gstin: "27ABCDE1234F1Z0",
    legal_name: "EXAMPLE FIXTURE BUSINESS",
    trade_name: "Example Fixture Shop",
    status: "Active",
    taxpayer_type: "Regular",
    constitution: "Proprietorship",
    registration_date: "01/07/2017",
    cancellation_date: "",
    principal_address: {
      line1: "101, Synthetic Building",
      line2: "Example Street, Example Locality",
      city: "",
      district: "Example District",
      state: "Maharashtra",
      state_code: "27",
      pin: "400001",
    },
    additional_addresses: [],
    nature_of_business: ["Retail Business", "Wholesale Business"],
  });
});

test("cancelled and Composition registrations retain their actual status and type", () => {
  const cancelled = mapGSTINResponse(fixture("cancelled-synthetic"));
  assert.equal(cancelled.status, "Cancelled");
  assert.equal(cancelled.cancellation_date, "01/04/2025");
  const composition = mapGSTINResponse(fixture("composition-synthetic"));
  assert.equal(composition.status, "Active");
  assert.equal(composition.taxpayer_type, "Composition");
  // Mapping registration details alone never marks a registration eligible.
  assert.equal("verified" in composition, false);
});

test("flag=false and every non-200 response fail, even with valid data", async () => {
  assert.throws(() => mapGSTINResponse(fixture("not-found-synthetic")), errorCode("NOT_FOUND"));
  for (const status of [201, 204, 301, 400, 401, 403, 404, 429, 500, 503]) {
    assert.throws(() => mapGSTINResponse(active(), { httpStatus: status }),
      errorCode(status === 404 ? "NOT_FOUND" : status === 429 ? "RATE_LIMIT" : "HTTP_ERROR"));
  }
  await assert.rejects(parseGSTINResponse(new Response("private provider error", { status: 503 })),
    errorCode("HTTP_ERROR"));
});

test("malformed responses fail closed without leaking provider data", async () => {
  assert.throws(() => mapGSTINResponse(fixture("malformed-synthetic")), errorCode("MALFORMED"));
  for (const body of [null, [], {}, { flag: "true" }, { flag: true, data: [] }]) {
    assert.throws(() => mapGSTINResponse(body), errorCode("MALFORMED"));
  }
  for (const change of [
    data => { data.gstin = "27ABCDE1234F1ZX"; },
    data => { data.lgnm = null; },
    data => { data.dty = ""; },
    data => { data.pradr.addr.pncd = "bad"; },
    data => { data.pradr.addr.stcd = "Tamil Nadu"; },
    data => { data.pradr.addr.stcd = "27"; },
    data => { data.pradr.addr.city = null; },
    data => { data.nba = "Retail"; },
    data => { data.adadr = {}; },
    data => { data.rgdt = "31/02/2020"; },
    data => { data.cxdt = "not a date"; },
  ]) {
    const body = active();
    change(body.data);
    assert.throws(() => mapGSTINResponse(body), errorCode("MALFORMED"));
  }
  await assert.rejects(parseGSTINResponse(new Response("not JSON")), errorCode("MALFORMED"));
  assert.throws(() => mapGSTINResponse(active(), { expectedGSTIN: "33ABCDE1234F1Z7" }), errorCode("MALFORMED"));
});

test("empty city is not invented, and unobserved additional-address schemas are rejected", () => {
  const body = active();
  body.data.pradr.addr.st = "Another Example Street";
  assert.equal(mapGSTINResponse(body).principal_address.state_code, "27");
  assert.equal(mapGSTINResponse(body).principal_address.city, "");
  assert.equal(mapGSTINResponse(body).principal_address.line2, "Another Example Street, Example Locality");
  body.data.adadr = [structuredClone(body.data.pradr)];
  assert.throws(() => mapGSTINResponse(body), errorCode("UNSUPPORTED_ADDRESS_SCHEMA"));
});

test("synthetic active fixture matches the real fixture's field structure without printing real values", () => {
  const shape = value => Array.isArray(value) ? "array"
    : value !== null && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, shape(value[key])]))
      : value === null ? "null" : typeof value;
  const actual = fixture("active-sample");
  assert.deepEqual(shape(active()), shape(actual));
  // Boolean-only assertions ensure failures do not print the real registration.
  let mapped = false;
  try { mapGSTINResponse(actual); mapped = true; } catch { /* checked below */ }
  assert.equal(mapped, true, "The real active response must be accepted without logging its contents.");
});
