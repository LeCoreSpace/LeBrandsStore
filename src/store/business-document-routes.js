import { SECURITY_HEADERS, isValidOrigin } from "../auth/security.js";
import { dashboardAccess } from "../dashboard/repository.js";
import { gstinEnabled, verificationState } from "../gstin/service.js";
import { REGISTRATION_COUNTRIES } from "../public/registration-validation.js";

const ROOT = /^\/api\/stores\/([a-f0-9-]{36})\/business-verification(?:\/documents\/([a-f0-9-]{36}))?$/i;
const MAX_FILE = 5 * 1024 * 1024;
const MAX_BODY = MAX_FILE + 64 * 1024;
const supported = new Set(REGISTRATION_COUNTRIES.map(item => item.code));
const respond = (value, status = 200) => Response.json(value, { status, headers: {
  ...SECURITY_HEADERS, "cache-control": "no-store", "x-content-type-options": "nosniff",
} });
const fail = (message, status = 400, field) =>
  Object.assign(new Error(message), { status, ...(field ? { errors: { [field]: message } } : {}) });
const decode = value => typeof value === "string" ? JSON.parse(value) : value;

export const isBusinessDocumentRoute = path => ROOT.test(path);

async function limitedBody(request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY) throw fail("Document exceeds 5 MB.", 413, "file");
  if (!request.body) throw fail("Choose a document.", 400, "file");
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY) { await reader.cancel(); throw fail("Document exceeds 5 MB.", 413, "file"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

export function validateBusinessFile(file, bytes) {
  if (!file || !(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_FILE)
    throw fail("Choose one PDF, JPEG or PNG document up to 5 MB.", 400, "file");
  const mime = file.type?.toLowerCase();
  const valid = mime === "application/pdf"
    ? bytes.length > 20 && new TextDecoder().decode(bytes.subarray(0, 8)).startsWith("%PDF-1.")
      && new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 1024))).includes("%%EOF")
    : mime === "image/png"
      ? bytes.length > 32 && [137,80,78,71,13,10,26,10].every((x, i) => bytes[i] === x)
        && new TextDecoder().decode(bytes.subarray(12, 16)) === "IHDR"
      : mime === "image/jpeg"
        ? bytes.length > 16 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          && bytes.at(-2) === 255 && bytes.at(-1) === 217
        : false;
  if (!valid) throw fail("File contents must match a valid PDF, JPEG or PNG.", 400, "file");
  return mime;
}

async function scan(env, bytes, mime) {
  if (!env.BUSINESS_DOCUMENT_SCANNER?.fetch) throw fail("Security screening is not configured. Document uploads are paused.", 503);
  let response, verdict;
  try {
    response = await env.BUSINESS_DOCUMENT_SCANNER.fetch("https://scanner.internal/scan", {
      method: "POST", headers: { "content-type": mime, "x-document-size": String(bytes.length) },
      body: bytes, signal: AbortSignal.timeout(12000),
    });
    verdict = response.ok && await response.json();
  } catch { throw fail("Security screening is unavailable. No document was submitted.", 503); }
  if (!verdict || verdict.clean !== true || verdict.engine !== "configured")
    throw fail("Document did not pass security screening. No document was submitted.", 400, "file");
}

function validateDetails(value, gst) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).some(k => !["expected_revision","country_code","legal_name","registration_type","registration_number","explanation","document_type"].includes(k)))
    throw fail("Check the business details.");
  const country = value.country_code;
  if (!supported.has(country)) throw fail("Choose a supported business country.", 400, "country_code");
  const name = typeof value.legal_name === "string" ? value.legal_name.trim() : "";
  if (name.length < 2 || name.length > 160 || /[\u0000-\u001f\u007f<>]/u.test(name))
    throw fail("Enter a registered business name from 2 to 160 characters.", 400, "legal_name");
  if (!Number.isInteger(value.expected_revision) || value.expected_revision < 0)
    throw fail("Reload your business details before submitting.", 409);
  const number = typeof value.registration_number === "string" ? value.registration_number.trim() : "";
  const explanation = typeof value.explanation === "string" ? value.explanation.trim() : "";
  if (number.length > 64 || /[\u0000-\u001f\u007f<>]/u.test(number)) throw fail("Check the registration number.", 400, "registration_number");
  if (explanation.length > 1000 || /[\u0000-\u001f\u007f<>]/u.test(explanation)) throw fail("Keep the explanation below 1,000 characters.", 400, "explanation");
  const type = value.registration_type;
  if (country === "IN") {
    if (!gst.verified || !gst.address_confirmed)
      throw fail("Verify GSTIN and confirm the registered invoice address in Ann first.", 409);
    if (type !== "gst_registered" || number !== gst.gstin || name !== gst.legal_name ||
      value.document_type !== "gst_certificate") throw fail("Use the confirmed GST registration and certificate.", 400);
  } else if (type === "not_registered") {
    if (explanation.length < 30) throw fail("Explain why registration is not applicable in at least 30 characters.", 400, "explanation");
    if (number) throw fail("Do not enter a registration number for the not-registered option.", 400, "registration_number");
  } else if (!["tax_registered","business_registered"].includes(type) || number.length < 2 ||
    !["tax_registration","business_registration"].includes(value.document_type)) {
    throw fail("Enter your registration details and choose matching evidence.", 400, "registration_type");
  } else if ((type === "tax_registered" ? "tax_registration" : "business_registration") !== value.document_type)
    throw fail("Choose a document that matches the registration type.", 400, "document_type");
  return { country, name, number, explanation, type, documentType: type === "not_registered" ? null : value.document_type,
    revision: value.expected_revision };
}

async function gstState(tx, id) {
  const [row] = await tx`SELECT settings FROM public.store_setup WHERE store_id=${id}`;
  const settings = decode(row?.settings) || {};
  const state = await gstinEnabled(tx) ? await verificationState(tx, id, settings) : { state: "unverified", confirmed: false };
  return { verified: state.state === "verified", address_confirmed: Boolean(state.confirmed && settings.gstin_invoice_identity_locked === true),
    gstin: settings.gstin || "", legal_name: settings.legal_name || "" };
}

function uploadPolicy(env) {
  const days = Number(env.BUSINESS_DOCUMENT_RETENTION_DAYS);
  const retentionDays = Number.isInteger(days) && days >= 30 && days <= 365 ? days : null;
  const available = Boolean(env.BUSINESS_DOCUMENTS?.put && env.BUSINESS_DOCUMENT_SCANNER?.fetch && retentionDays);
  return { uploads_available: available, retention_days: retentionDays, max_file_bytes: MAX_FILE,
    upload_message: available ? "" : "Private storage, security screening and retention review must be configured before document uploads can open." };
}

async function state(tx, id, tokenHash, env) {
  const [row] = await tx`SELECT public.business_document_state(${id},${tokenHash}) AS data`;
  const data = decode(row.data);
  if (data.verification?.documents) for (const doc of data.verification.documents) {
    doc.download_url = `/api/stores/${id}/business-verification/documents/${doc.id}`;
  }
  return { available: true, ...data, countries: REGISTRATION_COUNTRIES.map(({code,name}) => ({code,name})),
    gst: await gstState(tx, id), ...uploadPolicy(env) };
}

async function download(db, env, id, tokenHash, docId, request) {
  if (!env.BUSINESS_DOCUMENTS?.get) throw fail("Private document storage is not configured.", 503);
  const row = await db.withMemberStore(id, tokenHash, async tx => {
    const [record] = await tx`SELECT * FROM public.business_document_download(${id},${tokenHash},${docId})`;
    return record;
  }, { lockStore: false });
  if (!row) throw fail("Document not found.", 404);
  const object = request.method === "HEAD" ? await env.BUSINESS_DOCUMENTS.head(row.object_key)
    : await env.BUSINESS_DOCUMENTS.get(row.object_key);
  if (!object) throw fail("Document is temporarily unavailable.", 503);
  return new Response(request.method === "HEAD" ? null : object.body, {
    headers: { ...SECURITY_HEADERS, "cache-control": "no-store", "content-type": "application/octet-stream",
      "content-disposition": "attachment; filename=\"business-document\"",
      "content-length": String(Number(row.size_bytes)), "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox" },
  });
}

export async function handleBusinessDocumentRoutes(request, env, db, user, tokenHash) {
  const match = new URL(request.url).pathname.match(ROOT);
  if (!match) return respond({ error: "Page not found." }, 404);
  if (!user || user.must_change_password) return respond({ error: "Sign in first." }, 401);
  const [, storeId, matchedDocumentId] = match;
  const isGet = request.method === "GET" || request.method === "HEAD";
  if (matchedDocumentId ? !isGet : !isGet && request.method !== "POST") return respond({ error: "Method not allowed." }, 405);
  if (!isGet && !isValidOrigin(request)) return respond({ error: "Invalid request origin." }, 403);
  try {
    if (matchedDocumentId) return await download(db, env, storeId, tokenHash, matchedDocumentId, request);
    if (isGet) {
      const result = await db.withMemberStore(storeId, tokenHash, async tx => {
        await dashboardAccess(tx, storeId, user.id, true);
        return state(tx, storeId, tokenHash, env);
      }, { lockStore: false });
      return isGet && request.method === "HEAD" ? new Response(null, { headers: respond({}).headers }) : respond(result);
    }
    const current = await db.withMemberStore(storeId, tokenHash, async tx => {
      await dashboardAccess(tx, storeId, user.id, true);
      return state(tx, storeId, tokenHash, env);
    }, { lockStore: false });
    if (!current.retention_days) throw fail("Document retention review policy must be configured before business submissions can open.", 503);
    if (!/^multipart\/form-data;\s*boundary=/i.test(request.headers.get("content-type") || ""))
      throw fail("Choose a document and submit the form.");
    const bytes = await limitedBody(request);
    const form = await new Response(bytes, { headers: { "content-type": request.headers.get("content-type") } }).formData();
    if ([...form.keys()].some(k => !["details","file"].includes(k)) || typeof form.get("details") !== "string")
      throw fail("Check the business details.");
    let raw;
    try { raw = JSON.parse(form.get("details")); } catch { throw fail("Check the business details."); }
    const details = validateDetails(raw, current.gst);
    if (current.verification?.status === "approved") throw fail("Approved documents cannot be replaced.", 409);
    if (details.revision !== (current.verification?.revision || 0))
      throw fail("Business details changed in another tab. Reload before submitting.", 409);
    const file = form.get("file");
    let documentId = null, objectKey = null, mime = null, digest = null, fileBytes = null, filename = null;
    if (details.type === "not_registered") {
      if (file) throw fail("Do not attach a file for manual assessment.", 400, "file");
    } else {
      if (!current.uploads_available) throw fail(current.upload_message, 503, "file");
      if (!file || typeof file.arrayBuffer !== "function" || typeof file.size !== "number")
        throw fail("Choose a document to upload.", 400, "file");
      if (file.size > MAX_FILE) throw fail("Document exceeds 5 MB.", 413, "file");
      fileBytes = new Uint8Array(await file.arrayBuffer());
      mime = validateBusinessFile(file, fileBytes);
      filename = String(file.name || "business-document").split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f<>]/gu, "").slice(0, 150) || "business-document";
      await scan(env, fileBytes, mime);
      documentId = crypto.randomUUID();
      objectKey = `business-verifications/${storeId}/${documentId}`;
      digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", fileBytes))]
        .map(x => x.toString(16).padStart(2, "0")).join("");
    }
    if (objectKey) {
      try { await env.BUSINESS_DOCUMENTS.put(objectKey, fileBytes, { httpMetadata: { contentType: "application/octet-stream" } }); }
      catch { throw fail("Private storage is unavailable. No document was submitted.", 503); }
    }
    try {
      const result = await db.withMemberStore(storeId, tokenHash, async tx => {
        await dashboardAccess(tx, storeId, user.id, true);
        const freshGST = await gstState(tx, storeId);
        validateDetails(raw, freshGST);
        await tx`SELECT public.business_document_submit(${storeId},${tokenHash},${details.revision},
          ${details.country},${details.name},${details.type},${details.number || null},
          ${details.explanation || null},${documentId},${details.documentType},${objectKey},
          ${filename},${mime},${fileBytes?.length || null},${digest},${current.retention_days}) AS revision`;
        return state(tx, storeId, tokenHash, env);
      });
      return respond(result, 201);
    } catch (error) {
      if (objectKey) try { await env.BUSINESS_DOCUMENTS.delete(objectKey); }
        catch { console.error("Orphan business document cleanup failed", { code: "PRIVATE_STORAGE_CLEANUP_FAILED" }); }
      throw error;
    }
  } catch (error) {
    if (["42501","FORBIDDEN"].includes(error.code) || error.status === 403) return respond({ error: "You do not have permission." }, 403);
    if (["40001","23505"].includes(error.code)) return respond({ error: "Business details changed in another tab. Reload before submitting." }, 409);
    if (error.code === "42P01" || error.code === "42883") return respond({ available: false, error: "Business-document database update is required first." }, 503);
    if ([400,404,409,413,503].includes(error.status)) return respond({ error: error.message, ...(error.errors ? { errors: error.errors } : {}) }, error.status);
    // Never log content, keys, names, tokens, file bytes or SQL.
    console.error("Business document request unavailable", { code: /^[A-Z0-9_]{1,10}$/.test(error.code || "") ? error.code : "UNAVAILABLE" });
    return respond({ error: "Business documents are temporarily unavailable. No changes were saved." }, 503);
  }
}
