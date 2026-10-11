import { gstinError, INDIAN_STATES } from "../public/commerce-rules.js";

// This module alone translates the provider's GST public-search response.
// No endpoint or authentication contract has been supplied: do not guess one.
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
    // A blank city stays blank. Locality and district are not assumed cities.
    city: text(source.city),
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
  if (!Array.isArray(data.adadr) || !Array.isArray(data.nba)) malformed();
  // The real fixture's adadr is empty. Until an actual nonempty example is
  // supplied, fail explicitly rather than invent its item schema.
  if (data.adadr.length) {
    throw new GSTINProviderError("UNSUPPORTED_ADDRESS_SCHEMA", "Additional registered addresses could not be verified. The provider response format needs confirmation.");
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
    additional_addresses: [],
    nature_of_business: data.nba.map(item => text(item, true)),
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

// Accepts a Response from a future server-only transport. Do not log or expose
// raw response bodies, including provider error messages.
export async function parseGSTINResponse(response, expectedGSTIN) {
  checkHTTP(response.status);
  let body;
  try {
    body = await response.json();
  } catch {
    malformed();
  }
  return mapGSTINResponse(body, { httpStatus: response.status, expectedGSTIN });
}
