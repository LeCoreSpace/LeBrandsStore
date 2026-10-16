import { openCredentials } from "./providers.js";
export const keyFor = env => env.INTEGRATION_ENCRYPTION_KEY || env.SESSION_SECRET;
export const failure = (message, status = 409) => Object.assign(new Error(message), { status });
export async function connection(tx, storeId, provider, env) {
  const [row] = await tx`SELECT status,credentials_ciphertext,metadata::text FROM public.integrations WHERE store_id=${storeId} AND provider=${provider}`;
  if (row?.status !== "connected") throw failure(`Reconnect ${provider} before continuing.`);
  return { ...row, metadata: JSON.parse(row.metadata),
    credentials: await openCredentials(keyFor(env), storeId, provider, row.credentials_ciphertext) };
}
export async function remoteJson(url, options = {}, fetcher = fetch) {
  let response;
  try { response = await fetcher(url, { ...options, redirect: "error", signal: AbortSignal.timeout(12000) }); }
  catch { throw Object.assign(failure("Provider response uncertain. Reconcile the provider account before retrying a booking or refund.", 502), { ambiguous: options.method === "POST" }); }
  if (!response.ok) throw Object.assign(failure(
    [401,403].includes(response.status) ? "Provider credentials or permissions need attention." :
      response.status === 429 ? "Provider rate limit reached. The operation will be retried." : "Provider rejected this operation. Check account settings, balance and order details.",
    response.status === 429 ? 429 : 502), { providerStatus: response.status, ambiguous: response.status >= 500 && options.method === "POST" });
  if (response.status === 204) return {};
  try { return await response.json(); }
  catch { throw Object.assign(failure("Provider returned an unreadable response. Reconcile before retrying.", 502), { ambiguous: options.method === "POST" }); }
}
// Credential resolution is independent of checkout/fulfilment. Partner OAuth
// can supply access_token here without rewriting order or job lifecycles.
export function razorpayClient(credentials, fetcher = fetch) {
  const authorization = credentials.access_token ? `Bearer ${credentials.access_token}` :
    `Basic ${btoa(`${credentials.key_id}:${credentials.key_secret}`)}`;
  return (path, method = "GET", body) => {
    if (!/^\/(?:orders|payments)(?:[/?]|$)/.test(path)) throw failure("Unsupported payment operation.");
    return remoteJson(`https://api.razorpay.com/v1${path}`, { method,
      headers: { authorization, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }, fetcher);
  };
}
export function shiprocketClient(credentials, fetcher = fetch) {
  let token = credentials.access_token || null;
  async function login() {
    const auth = await remoteJson("https://apiv2.shiprocket.in/v1/external/auth/login", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ email: credentials.email, password: credentials.password }) }, fetcher);
    if (typeof auth.token !== "string") throw failure("Shiprocket did not return an access token.", 502);
    token = auth.token;
  }
  return async (path, method = "GET", body) => {
    if (!/^\/(?:settings\/company\/pickup|courier\/|orders|manifests\/)/.test(path)) throw failure("Unsupported shipping operation.");
    if (!token) await login();
    const run = () => remoteJson(`https://apiv2.shiprocket.in/v1/external${path}`, { method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}) }, fetcher);
    try { return await run(); } catch (e) {
      if (e.providerStatus !== 401 || credentials.access_token) throw e;
      await login(); return run();
    }
  };
}
export async function verifyHmac(secret, value, signature) {
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const bytes = Uint8Array.from(signature.match(/../g), s => parseInt(s, 16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(value));
}
export async function boundedText(request, max = 262144) {
  const reader = request.body?.getReader();
  if (!reader) throw failure("A request body is required.", 400);
  let length = 0, chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length; if (length > max) { await reader.cancel(); throw failure("Request too large.", 413); } chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const all = new Uint8Array(length); let at = 0;
  for (const chunk of chunks) { all.set(chunk, at); at += chunk.length; }
  return new TextDecoder("utf-8", { fatal: true }).decode(all);
}
