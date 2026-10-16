import { gstinError, INDIAN_STATES } from "../public/commerce-rules.js";

// Only this server-side module knows the provider URL, credentials and schema.
// Never log request URLs, raw responses, transport exceptions or their stacks.
export class GSTINProviderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GSTINProviderError";
    this.code = code;
  }
}

const malformed = () => {
  throw new GSTINProviderError("MALFORMED", "The GSTIN provider returned an incomplete or invalid response.");
};
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
function text(value, required = false) {
  if (typeof value !== "string" || (required && !value.trim())) malformed();
  return value.trim();
}

function checkHTTP(status) {
  if (status === 429) {
    throw new GSTINProviderError("RATE_LIMIT", "The GSTIN provider is temporarily rate limited.");
  }
  if (status === 404) {
    throw new GSTINProviderError("NOT_FOUND", "The GSTIN provider could not find this registration.");
  }
  if (status !== 200) {
    throw new GSTINProviderError("HTTP_ERROR", "The GSTIN provider could not verify this registration.");
  }
}

function address(value, gstin) {
  if (!object(value) || !object(value.addr)) malformed();
  const source = value.addr;
  // In the supplied fixture stcd is the STATE NAME, not a numeric code;
  // st is a street/local address component, not the state.
  const state = text(source.stcd, true);
  const knownState = INDIAN_STATES.find(item => item.name.toLowerCase() === state.toLowerCase());
  if (!knownState || knownState.code !== gstin.slice(0, 2)) malformed();
  const pin = text(source.pncd, true);
  if (!/^[1-9][0-9]{5}$/.test(pin)) malformed();
  const line1 = [text(source.bno), text(source.bnm), text(source.flno)].filter(Boolean).join(", ");
  const line2 = [text(source.st), text(source.loc)].filter(Boolean).join(", ");
  if (!line1 && !line2) malformed();
  return {
    line1,
    line2,
    ...(typeof value.adr==="string"&&value.adr.trim()?{formatted_address:value.adr.trim()}:{}),
    // Provider field selection, not invented data. Raw values remain in the
    // raw response returned separately for store-scoped server persistence.
    city: text(source.city) || text(source.loc) || text(source.dst),
    district: text(source.dst),
    state,
    state_code: knownState.code,
    pin,
  };
}

/**
 * Normalize only fields observed in test/fixtures/gstin-active-sample.json.
 * Dates remain provider DD/MM/YYYY strings; empty cancellation dates stay "".
 * Unknown fields, jurisdiction codes, coordinates and verification flags are
 * deliberately not copied into the normalized result.
 */
export function mapGSTINResponse(body, { httpStatus = 200, expectedGSTIN } = {}) {
  checkHTTP(httpStatus);
  if (!object(body) || typeof body.flag !== "boolean") malformed();
  if (!body.flag) {
    throw new GSTINProviderError("NOT_FOUND", "The GSTIN provider could not verify this registration.");
  }
  const data = body.data;
  if (!object(data)) malformed();
  const gstin = text(data.gstin, true);
  if (gstinError(gstin) || (expectedGSTIN !== undefined && gstin !== expectedGSTIN)) malformed();
  if (!Array.isArray(data.nba)) malformed();
  const warnings = [], additionalAddresses = [];
  // Additional entries use the same addr shape as pradr (and may carry ntr).
  // A broken depot entry must not invalidate the principal registration.
  if (Array.isArray(data.adadr)) {
    data.adadr.forEach((entry, index) => {
      try {
        additionalAddresses.push(address(entry, gstin));
      } catch {
        warnings.push({
          code: "INVALID_ADDITIONAL_ADDRESS", index,
          message: "An additional registered address could not be read and was skipped.",
        });
      }
    });
  } else {
    warnings.push({
      code: "INVALID_ADDITIONAL_ADDRESS_LIST",
      message: "Additional registered addresses could not be read and were skipped.",
    });
  }
  const result = {
    gstin,
    legal_name: text(data.lgnm, true),
    trade_name: text(data.tradeNam),
    status: text(data.sts, true),
    taxpayer_type: text(data.dty, true),
    constitution: text(data.ctb),
    registration_date: text(data.rgdt, true),
    cancellation_date: text(data.cxdt),
    principal_address: address(data.pradr, gstin),
    additional_addresses: additionalAddresses,
    nature_of_business: data.nba.map(item => text(item, true)),
    warnings,
  };
  if (!validPortalDate(result.registration_date) ||
      (result.cancellation_date && !validPortalDate(result.cancellation_date))) malformed();
  return result;
}

function validPortalDate(value) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return false;
  const [day, month, year] = value.split("/").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

async function responseBody(response) {
  checkHTTP(response.status);
  try {
    return await response.json();
  } catch {
    malformed();
  }
}

export async function parseGSTINResponse(response, expectedGSTIN) {
  return mapGSTINResponse(await responseBody(response), { httpStatus: response.status, expectedGSTIN });
}

const safeFailures = {
  NETWORK_ERROR: "We could not connect to the GST provider. Please retry in a minute.",
  MALFORMED: "The GSTIN provider returned an incomplete or invalid response.",
  NOT_FOUND: "The GSTIN provider could not verify this registration.",
  RATE_LIMIT: "The GSTIN provider is temporarily rate limited.",
  HTTP_ERROR: "The GSTIN provider could not verify this registration.",
  TIMEOUT: "GSTIN verification timed out. Please try again.",
};

/**
 * Server-only lookup. Tests inject a fetch implementation; callers never
 * receive the request URL/key or original exception/cause/stack.
 * Raw data must remain server-side and be stored under tenant-scoped RLS.
 */
export async function lookupGSTIN(env, gstin, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  if (gstinError(gstin)) {
    throw new GSTINProviderError("INVALID_GSTIN", "Check the GSTIN format and checksum before verification.");
  }
  const key = env?.GSTIN_KEY;
  if (typeof key !== "string" || !key.trim()) {
    throw new GSTINProviderError("UNCONFIGURED", "GSTIN verification is not configured.");
  }
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new GSTINProviderError("TIMEOUT", safeFailures.TIMEOUT));
    }, Math.min(8000, Math.max(1, timeoutMs)));
  });
  try {
    const result = await Promise.race([
      (async () => {
        const response = await fetchImpl(
          `https://sheet.gstincheck.co.in/check/${encodeURIComponent(key.trim())}/${encodeURIComponent(gstin)}`,
          { method: "GET", redirect: "manual", signal: controller.signal },
        );
        const raw = await responseBody(response);
        return {
          registration: mapGSTINResponse(raw, { httpStatus: response.status, expectedGSTIN: gstin }),
          raw_response: raw,
        };
      })(),
      timeout,
    ]);
    return result;
  } catch (error) {
    // Construct a new safe error, with no cause. Fetch exceptions can include
    // the credential-bearing URL in both message and stack.
    const code = controller.signal.aborted ? "TIMEOUT"
      : error instanceof GSTINProviderError && Object.hasOwn(safeFailures, error.code) ? error.code : "NETWORK_ERROR";
    throw new GSTINProviderError(code, safeFailures[code] || "GSTIN verification is temporarily unavailable.");
  } finally {
    clearTimeout(timer);
  }
}
