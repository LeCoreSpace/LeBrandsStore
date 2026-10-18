const COMMON = new Set([
  "password", "password1", "password123", "password1234", "password12345",
  "1234567890", "12345678901", "123456789012", "qwerty12345", "qwertyuiop",
  "abcdefghij", "letmein1234", "welcome123", "welcome1234", "admin12345",
  "iloveyou123", "changeme123", "lebrands123", "0000000000",
]);

export function validatePassword(password) {
  if (typeof password !== "string" || [...password].length < 10) return "Use at least 10 characters.";
  if (new TextEncoder().encode(password).length > 1024) return "Use a password shorter than 1,024 bytes.";
  if (COMMON.has(password.toLowerCase().trim())) return "Choose a less common password.";
  return null;
}
