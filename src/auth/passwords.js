export const PASSWORD_ALGO = "pbkdf2-sha256";
// Production Cloudflare Workers reject PBKDF2 above 100,000; local workerd does not.
export const PASSWORD_ITERATIONS = 100000;
export const PASSWORD_FORMAT_VERSION = "v1";
const COMMON = new Set([
  "password", "password1", "password123", "password1234", "password12345",
  "1234567890", "12345678901", "123456789012", "qwerty12345", "qwertyuiop",
  "abcdefghij", "letmein1234", "welcome123", "welcome1234", "admin12345",
  "iloveyou123", "changeme123", "lebrands123", "0000000000",
]);
const encoder = new TextEncoder();
export const hex = (bytes) => [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
const bytes = (value) => Uint8Array.from(value.match(/../g), (part) => parseInt(part, 16));

export function validatePassword(password) {
  if (typeof password !== "string" || [...password].length < 10) return "Use at least 10 characters.";
  if (encoder.encode(password).length > 1024) return "Use a password shorter than 1,024 bytes.";
  if (COMMON.has(password.toLowerCase().trim())) return "Choose a less common password.";
  return null;
}

export function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

function pepperVersion(env) {
  const value = String(env?.PASSWORD_PEPPER_VERSION ?? "1");
  if (!/^[1-9][0-9]{0,5}$/.test(value)) throw pepperError();
  return Number(value);
}

function pepperError() {
  return Object.assign(new Error("Password service is unavailable."), { code: "PASSWORD_PEPPER_UNAVAILABLE" });
}

async function pepperKey(env, version = pepperVersion(env)) {
  const current = pepperVersion(env);
  const value = version === current ? env?.PASSWORD_PEPPER : env?.[`PASSWORD_PEPPER_V${version}`];
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw pepperError();
  let decoded;
  try { decoded = Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }
  catch { throw pepperError(); }
  if (decoded.length < 32 || decoded.length > 1024) throw pepperError();
  return crypto.subtle.importKey("raw", decoded, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function assertPasswordPepper(env) {
  await pepperKey(env);
}

function parseRecord(record) {
  const parts = record?.password_hash?.split("$") ?? [];
  const [algo, version, pepper, iterations, salt, hash] = parts;
  if (parts.length !== 6 || algo !== PASSWORD_ALGO || version !== PASSWORD_FORMAT_VERSION ||
    !/^p[1-9][0-9]{0,5}$/.test(pepper) || !/^[1-9][0-9]*$/.test(iterations) ||
    Number(iterations) > PASSWORD_ITERATIONS || !/^[0-9a-f]{32}$/.test(salt) ||
    !/^[0-9a-f]{64}$/.test(hash) || record.password_algo !== algo ||
    record.password_iterations !== Number(iterations) || record.password_salt !== salt) return null;
  return { iterations: Number(iterations), salt, hash, pepperVersion: Number(pepper.slice(1)) };
}

export function needsPasswordRehash(record, env) {
  const parsed = parseRecord(record);
  return !parsed || parsed.iterations !== PASSWORD_ITERATIONS || parsed.pepperVersion !== pepperVersion(env);
}

async function derive(password, salt, iterations, env, version = pepperVersion(env)) {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PASSWORD_ITERATIONS) throw new Error("Invalid password work factor.");
  const hmac = await crypto.subtle.sign("HMAC", await pepperKey(env, version), encoder.encode(password));
  const key = await crypto.subtle.importKey("raw", hmac, "PBKDF2", false, ["deriveBits"]);
  try {
    return new Uint8Array(await crypto.subtle.deriveBits({
      name: "PBKDF2", hash: "SHA-256", salt, iterations,
    }, key, 256));
  } catch {
    throw Object.assign(new Error("Password service is unavailable."), {
      code: "PASSWORD_RUNTIME_UNSUPPORTED",
    });
  }
}

export async function hashPassword(password, env) {
  await assertPasswordPepper(env);
  const error = validatePassword(password);
  if (error) throw Object.assign(new Error(error), { code: "INVALID_PASSWORD" });
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    password_algo: PASSWORD_ALGO,
    password_iterations: PASSWORD_ITERATIONS,
    password_salt: hex(salt),
    password_hash: `${PASSWORD_ALGO}$${PASSWORD_FORMAT_VERSION}$p${pepperVersion(env)}$${PASSWORD_ITERATIONS}$${hex(salt)}$${hex(await derive(password, salt, PASSWORD_ITERATIONS, env))}`,
  };
}

export const DUMMY_RECORD = {
  password_algo: PASSWORD_ALGO, password_iterations: PASSWORD_ITERATIONS,
  password_salt: "00000000000000000000000000000000",
  password_hash: `${PASSWORD_ALGO}$v1$p1$100000$${"0".repeat(32)}$${"0".repeat(64)}`,
};

export async function verifyPassword(password, record, env) {
  // Configuration failure must never become an ordinary password mismatch.
  await assertPasswordPepper(env);
  if (typeof password !== "string" || encoder.encode(password).length > 1024) return false;
  const parsed = parseRecord(record);
  const selected = parsed ?? { iterations: PASSWORD_ITERATIONS, salt: "0".repeat(32), hash: "0".repeat(64), pepperVersion: pepperVersion(env) };
  const derived = await derive(password, bytes(selected.salt), selected.iterations, env, selected.pepperVersion);
  return constantTimeEqual(derived, bytes(selected.hash)) && Boolean(parsed);
}

export async function sha256(value) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export function randomToken() {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}
