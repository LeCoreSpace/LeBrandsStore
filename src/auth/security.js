import { RESERVED_SUBDOMAINS } from "../reserved.js";
import { hex } from "./passwords.js";
export const APP_ORIGIN = "https://app.lebrands.store";
export const COOKIE_NAME = "__Host-lbs_session";
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
export const GENERIC_LOGIN_ERROR = "Email or password is incorrect";

export function isValidOrigin(request) {
  return request.headers.get("origin") === APP_ORIGIN;
}

export function sessionCookie(token, clear = false) {
  if (!clear && !/^[0-9a-f]{64}$/.test(token)) throw new Error("Invalid session token.");
  return `${COOKIE_NAME}=${clear ? "" : token}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear ? 0 : SESSION_SECONDS}`;
}

export function readSessionToken(request) {
  const entries = (request.headers.get("cookie") ?? "").split(";").map((value) => value.trim());
  const tokens = entries.filter((value) => value.startsWith(`${COOKIE_NAME}=`));
  if (tokens.length !== 1) return null;
  const value = tokens[0].slice(COOKIE_NAME.length + 1);
  return /^[0-9a-f]{64}$/.test(value) ? value : null;
}

export function normalizeEmail(email) {
  const value = String(email ?? "").trim().toLowerCase();
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

export function validateSubdomain(value) {
  return typeof value === "string" && /^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$/.test(value) &&
    !RESERVED_SUBDOMAINS.includes(value);
}

export async function ipHash(request, secret) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw Object.assign(new Error("Worker SESSION_SECRET must contain at least 32 characters."), { code: "MISSING_SESSION_SECRET" });
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  // Production Cloudflare supplies this header. Missing headers share a deny-safe bucket.
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(request.headers.get("cf-connecting-ip") ?? "unknown")));
}

export const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://media.lebrands.store; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self' blob:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

export async function readForm(request) {
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
    throw Object.assign(new Error("Use the provided form."), { code: "INVALID_FORM" });
  }
  // Stream with a hard cap rather than trusting Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return new URLSearchParams();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      throw Object.assign(new Error("Form is too large."), { code: "INVALID_FORM" });
    }
    chunks.push(value);
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  const form = new URLSearchParams(new TextDecoder().decode(data));
  if ([...new Set(form.keys())].some((key) => form.getAll(key).length > 1)) {
    throw Object.assign(new Error("Duplicate form fields are not allowed."), { code: "INVALID_FORM" });
  }
  return form;
}
