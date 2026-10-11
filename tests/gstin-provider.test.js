import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GSTINProviderError, mapGSTINResponse, parseGSTINResponse, lookupGSTIN } from "../src/gstin/provider.js";

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
      city: "Example Locality",
      district: "Example District",
      state: "Maharashtra",
      state_code: "27",
      pin: "400001",
    },
    additional_addresses: [],
    nature_of_business: ["Retail Business", "Wholesale Business"],
    warnings: [],
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

test("city selects city, then locality, then district without mutating the raw response", () => {
  const body = active();
  body.data.pradr.addr.st = "Another Example Street";
  assert.equal(mapGSTINResponse(body).principal_address.state_code, "27");
  assert.equal(mapGSTINResponse(body).principal_address.city, "Example Locality");
  assert.equal(body.data.pradr.addr.city, "");
  assert.equal(mapGSTINResponse(body).principal_address.line2, "Another Example Street, Example Locality");
  body.data.pradr.addr.city = "Explicit Town";
  assert.equal(mapGSTINResponse(body).principal_address.city, "Explicit Town");
  body.data.pradr.addr.city = "";
  body.data.pradr.addr.loc = "";
  assert.equal(mapGSTINResponse(body).principal_address.city, "Example District");
});

test("valid additional addresses survive malformed entries, with safe indexed warnings", () => {
  const result = mapGSTINResponse(fixture("additional-addresses-synthetic"));
  assert.equal(result.status, "Active");
  assert.equal(result.additional_addresses.length, 1);
  assert.equal(result.additional_addresses[0].line1, "202, Synthetic Depot");
  assert.equal(result.additional_addresses[0].city, "Example Depot Locality");
  assert.deepEqual(result.warnings, [{
    code: "INVALID_ADDITIONAL_ADDRESS", index: 1,
    message: "An additional registered address could not be read and was skipped.",
  }]);
  const body = active();
  body.data.adadr = {};
  assert.equal(mapGSTINResponse(body).warnings[0].code, "INVALID_ADDITIONAL_ADDRESS_LIST");
  body.data.adadr = [null, {}, { addr: [] }];
  assert.equal(mapGSTINResponse(body).warnings.length, 3);
  assert.equal(mapGSTINResponse(body).principal_address.state_code, "27");
  body.data.pradr.addr = {};
  assert.throws(() => mapGSTINResponse(body), errorCode("MALFORMED"));
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

// This is a fictional test credential, not a workspace secret.
const mockKey = "synthetic/path?key#value";
const mockEnv = { GSTIN_KEY: mockKey };
test("live adapter uses exactly the supplied GET path contract and retains raw data server-side", async () => {
  let calls = 0;
  const result = await lookupGSTIN(mockEnv, "27ABCDE1234F1Z0", {
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, `https://sheet.gstincheck.co.in/check/${encodeURIComponent(mockKey)}/27ABCDE1234F1Z0`);
      assert.equal(options.method, "GET");
      assert.equal(options.redirect, "manual");
      assert.equal(options.headers, undefined);
      assert.equal(options.body, undefined);
      assert.ok(options.signal instanceof AbortSignal);
      return Response.json(active());
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.registration.principal_address.city, "Example Locality");
  assert.equal(result.raw_response.data.pradr.addr.city, "");
});

test("invalid GSTIN or missing GSTIN_KEY makes no provider call", async () => {
  let calls = 0;
  const options = { fetchImpl: async () => { calls++; throw new Error("Unexpected call"); } };
  await assert.rejects(lookupGSTIN(mockEnv, "invalid", options), errorCode("INVALID_GSTIN"));
  await assert.rejects(lookupGSTIN({ GSTIN_API_KEY: "unused" }, "27ABCDE1234F1Z0", options), errorCode("UNCONFIGURED"));
  assert.equal(calls, 0);
});

test("credential-bearing errors, stacks and provider messages never escape the adapter", async () => {
  for (const fetchImpl of [
    async url => { throw new Error(`Fetch failed: ${url} with ${mockKey}`); },
    async url => { throw Object.assign(new GSTINProviderError("MALFORMED", url), { cause: new Error(mockKey) }); },
    async () => Response.json({ flag: false, message: mockKey }, { status: 200 }),
    async () => new Response(mockKey, { status: 503 }),
    async () => new Response(mockKey, { status: 302, headers: { location: "https://example.invalid/" } }),
  ]) {
    await assert.rejects(lookupGSTIN(mockEnv, "27ABCDE1234F1Z0", { fetchImpl }), error => {
      const visible = `${error.message}\n${error.stack}\n${JSON.stringify(error)}`;
      assert.equal(visible.includes(mockKey), false);
      assert.equal(visible.includes(encodeURIComponent(mockKey)), false);
      assert.equal(visible.includes("https://sheet.gstincheck.co.in/check/"), false);
      assert.equal(error.cause, undefined);
      return error instanceof GSTINProviderError;
    });
  }
});

test("eight-second default deadline covers fetch AND body reading, even if transport ignores abort", async () => {
  const source = readFileSync(new URL("../src/gstin/provider.js", import.meta.url), "utf8");
  assert.match(source, /timeoutMs = 8000/);
  assert.match(source, /Math\.min\(8000/);
  let signal;
  await assert.rejects(lookupGSTIN(mockEnv, "27ABCDE1234F1Z0", {
    timeoutMs: 5,
    fetchImpl: async (_, options) => { signal = options.signal; return new Promise(() => {}); },
  }), errorCode("TIMEOUT"));
  assert.equal(signal.aborted, true);
  await assert.rejects(lookupGSTIN(mockEnv, "27ABCDE1234F1Z0", {
    timeoutMs: 5,
    fetchImpl: async () => ({ status: 200, json: () => new Promise(() => {}) }),
  }), errorCode("TIMEOUT"));
});
