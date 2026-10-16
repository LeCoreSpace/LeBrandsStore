const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const enc = new TextEncoder();
const to64 = bytes => btoa(String.fromCharCode(...bytes));
const from64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

async function encryptionKey(secret) {
  if (typeof secret !== "string" || secret.length < 32) fail("Secure connection storage is not configured. Your account was not saved.", 503);
  const material = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode("lebrands-connections-v1"),
    info: enc.encode("merchant-provider-credentials") }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function sealCredentials(secret, storeId, provider, value) {
  const key = await encryptionKey(secret), iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(`${storeId}:${provider}`) }, key, enc.encode(JSON.stringify(value)));
  return `v1.${to64(iv)}.${to64(new Uint8Array(cipher))}`;
}
export async function openCredentials(secret, storeId, provider, value) {
  const [version, iv, ciphertext] = String(value).split(".");
  if (version !== "v1" || !iv || !ciphertext) fail("Reconnect this account before using it.", 503);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: from64(iv), additionalData: enc.encode(`${storeId}:${provider}`) },
      await encryptionKey(secret), from64(ciphertext));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch { fail("Reconnect this account before using it.", 503); }
}
async function providerJson(url, options = {}, fetcher = fetch) {
  let response;
  try { response = await fetcher(url, { ...options, redirect: "error", signal: AbortSignal.timeout(12000) }); }
  catch { fail("The provider could not be reached. Your saved connection is unchanged. Try again later.", 502); }
  if (!response.ok) {
    if ([401, 403].includes(response.status)) fail("The provider did not accept these credentials or permissions. Check them in your provider account.", 400);
    fail("The provider could not complete this check. Your saved connection is unchanged.", 502);
  }
  let body;
  try { body = await response.json(); } catch { fail("The provider returned an unreadable response. Try again later.", 502); }
  return body;
}
export async function verifyRazorpay(credentials, fetcher = fetch) {
  const { key_id, key_secret, webhook_secret } = credentials || {};
  if (typeof key_id !== "string" || !/^rzp_(test|live)_[A-Za-z0-9]{8,64}$/.test(key_id) ||
      typeof key_secret !== "string" || !/^[\x21-\x7e]{8,256}$/.test(key_secret) ||
      typeof webhook_secret !== "string" || !/^[\x21-\x7e]{16,256}$/.test(webhook_secret))
    fail("Enter a valid Razorpay key ID, key secret and a webhook secret of at least 16 characters.");
  const body = await providerJson("https://api.razorpay.com/v1/orders?count=1", {
    headers: { authorization: `Basic ${btoa(`${key_id}:${key_secret}`)}` },
  }, fetcher);
  if (body.entity !== "collection" || !Array.isArray(body.items)) fail("Razorpay did not return a valid account verification response.", 502);
  // Never persist or expose the order returned by the read-only verification.
  return { credentials: { key_id, key_secret, webhook_secret }, metadata: {
    mode: key_id.startsWith("rzp_live_") ? "live" : "test", checked_at: new Date().toISOString(),
    credentials_verified: true, webhook_verified: false, runtime_ready: false,
  } };
}
export async function verifyShiprocket(credentials, fetcher = fetch) {
  const { email, password } = credentials || {};
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== "string" || password.length < 8 || password.length > 256)
    fail("Enter the email and password of your Shiprocket API user, not your main account login.");
  const auth = await providerJson("https://apiv2.shiprocket.in/v1/external/auth/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }),
  }, fetcher);
  if (typeof auth.token !== "string" || auth.token.length < 16) fail("Shiprocket did not return a valid access token.", 502);
  const pickup = await providerJson("https://apiv2.shiprocket.in/v1/external/settings/company/pickup", {
    headers: { authorization: `Bearer ${auth.token}` },
  }, fetcher);
  if (!Array.isArray(pickup.data?.shipping_address)) fail("Shiprocket did not return pickup locations. Check your API user's permissions.", 502);
  return { credentials: { email, password }, metadata: { checked_at: new Date().toISOString(),
    credentials_verified: true, pickup_count: pickup.data.shipping_address.length, runtime_ready: false } };
}
export function domainHostname(value) {
  if (typeof value !== "string") fail("Enter a domain such as www.yourbrand.com, without https:// or a page path.");
  const name = value.trim().toLowerCase();
  const labels = name.split(".");
  if (name.length > 253 || labels.length < 3 || !/^[a-z]{2,63}$/.test(labels.at(-1)) ||
      labels.some(l => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l)) ||
      /(?:^|\.)(?:lebrands\.store|workers\.dev|localhost|local|internal|test|invalid|example)$/.test(name))
    fail("Use a public subdomain you own, such as www.yourbrand.com. Root domains and platform addresses are not supported here.");
  return name;
}
export function cloudflareAvailable(env) {
  return Boolean(env.CLOUDFLARE_API_TOKEN && /^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ZONE_ID || "") &&
    /^[a-z0-9.-]+\.lebrands\.store$/.test(env.CUSTOM_DOMAIN_CNAME_TARGET || ""));
}
async function cloudflare(env, path, options, fetcher) {
  if (!cloudflareAvailable(env)) fail("Custom-domain provisioning needs platform configuration. You can keep using your included store address.", 503);
  const body = await providerJson(`https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/custom_hostnames${path}`, {
    ...options, headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "content-type": "application/json" },
  }, fetcher);
  if (body.success !== true || !body.result || typeof body.result.id !== "string") fail("Cloudflare could not verify this hostname. Your current store address is unchanged.", 502);
  return body.result;
}
export async function provisionDomain(env, hostname, fetcher = fetch) {
  return cloudflare(env, "", { method: "POST", body: JSON.stringify({ hostname, ssl: { method: "txt", type: "dv" } }) }, fetcher);
}
export async function checkDomain(env, id, hostname, fetcher = fetch) {
  if (!/^[a-f0-9-]{32,36}$/i.test(id)) fail("This domain needs to be connected again.", 400);
  const result = await cloudflare(env, `/${id}`, { method: "GET" }, fetcher);
  if (result.hostname !== hostname) fail("The provider hostname does not match this store's connection.", 409);
  const dns = await providerJson(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=CNAME`, {
    headers: { accept: "application/dns-json" },
  }, fetcher);
  const cname = (dns.Answer || []).some(a => a.type === 5 && String(a.name).replace(/\.$/, "").toLowerCase() === hostname &&
    String(a.data).replace(/\.$/, "").toLowerCase() === env.CUSTOM_DOMAIN_CNAME_TARGET);
  return { ...result, cname_verified: cname };
}
export function domainEvidence(result, env) {
  const rows = [{ type: "CNAME", name: result.hostname, value: env.CUSTOM_DOMAIN_CNAME_TARGET }];
  if (result.ownership_verification?.type === "txt") rows.push({ type: "TXT", name: result.ownership_verification.name, value: result.ownership_verification.value });
  for (const r of result.ssl?.validation_records || []) if (r.txt_name && r.txt_value) rows.push({ type: "TXT", name: r.txt_name, value: r.txt_value });
  return { dns_records: rows.slice(0, 10), hostname_status: String(result.status || "pending").slice(0, 50),
    ssl_status: String(result.ssl?.status || "pending").slice(0, 50), cname_verified: result.cname_verified === true,
    checked_at: new Date().toISOString() };
}
