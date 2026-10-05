export const PASSWORD_ALGO = "pbkdf2-sha256";
export const PASSWORD_ITERATIONS = 600000;
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

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  try {
    return new Uint8Array(await crypto.subtle.deriveBits({
      name: "PBKDF2", hash: "SHA-256", salt, iterations,
    }, key, 256));
  } catch {
    // Never lower the work factor to accommodate a runtime iteration limit.
    throw Object.assign(new Error("Runtime must support PBKDF2-SHA256 at 600,000 iterations."), {
      code: "PASSWORD_RUNTIME_UNSUPPORTED",
    });
  }
}

export async function hashPassword(password) {
  const error = validatePassword(password);
  if (error) throw Object.assign(new Error(error), { code: "INVALID_PASSWORD" });
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    password_algo: PASSWORD_ALGO,
    password_iterations: PASSWORD_ITERATIONS,
    password_salt: hex(salt),
    password_hash: hex(await derive(password, salt, PASSWORD_ITERATIONS)),
  };
}

export const DUMMY_RECORD = {
  password_algo: PASSWORD_ALGO, password_iterations: PASSWORD_ITERATIONS,
  password_salt: "00000000000000000000000000000000",
  password_hash: "0000000000000000000000000000000000000000000000000000000000000000",
};

export async function verifyPassword(password, record) {
  if (typeof password !== "string" || encoder.encode(password).length > 1024) return false;
  const valid = record?.password_algo === PASSWORD_ALGO &&
    Number.isInteger(record.password_iterations) && record.password_iterations >= 600000 &&
    record.password_iterations <= 2000000 && /^[0-9a-f]{32}$/.test(record.password_salt ?? "") &&
    /^[0-9a-f]{64}$/.test(record.password_hash ?? "");
  const selected = valid ? record : DUMMY_RECORD;
  const derived = await derive(password, bytes(selected.password_salt), selected.password_iterations);
  return constantTimeEqual(derived, bytes(selected.password_hash)) && Boolean(valid);
}

export async function sha256(value) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export function randomToken() {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}
