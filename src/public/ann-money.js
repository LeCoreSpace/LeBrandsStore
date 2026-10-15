export function inrToPaise(value, { allowZero = false } = {}) {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(raw)) throw new Error("Enter an amount in INR with at most two decimal places.");
  const [whole, fraction = ""] = raw.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (paise < (allowZero ? 0 : 1)) throw new Error("Enter an amount above zero.");
  if (paise > 10000000000) throw new Error("Enter an amount no more than INR 100,000,000.");
  return paise;
}
export function paiseToInr(p) {
  if (p === null || p === undefined || !Number.isSafeInteger(Number(p))) return "";
  const n = Number(p);
  return `${Math.floor(n / 100)}.${String(n % 100).padStart(2, "0")}`;
}
