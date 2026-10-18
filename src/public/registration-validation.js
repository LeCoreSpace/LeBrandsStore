import { getCountries, getCountryCallingCode, parsePhoneNumberWithError } from "libphonenumber-js/max";
import { validatePassword } from "./password-policy.js";

const supported = new Set(getCountries());
const names = new Intl.DisplayNames(["en"], { type: "region" });
export const REGISTRATION_COUNTRIES = getCountries().map(code => ({
  code, name: names.of(code), callingCode: `+${getCountryCallingCode(code)}`,
})).sort((a, b) => a.name.localeCompare(b.name, "en"));

export function validateRegistration(values) {
  const errors = {};
  const name = typeof values.name === "string" ? values.name.trim() : "";
  const email = typeof values.email === "string" ? values.email.trim().toLowerCase() : "";
  const country = typeof values.country === "string" ? values.country : "";
  const rawPhone = typeof values.phone === "string" ? values.phone.trim() : "";
  if (!name || [...name].length > 120 || /[\u0000-\u001f\u007f]/u.test(name)) errors.name = "Enter your name using 1 to 120 characters.";
  const parts = email.split("@");
  const local = parts[0], domain = parts[1] || "";
  if (parts.length !== 2 || email.length > 254 || local.length > 64 ||
      !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) ||
      local.startsWith(".") || local.endsWith(".") || local.includes("..") ||
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(domain)) {
    errors.email = "Enter a valid email address.";
  }
  if (!supported.has(country)) errors.country = "Choose your country.";
  let phone;
  if (!rawPhone) errors.phone = "Enter your phone number.";
  else if (rawPhone.length > 64 || !/^\+?[0-9().\s-]+$/.test(rawPhone)) errors.phone = "Enter a phone number without letters or extensions.";
  else if (!errors.country) {
    try {
      const number = parsePhoneNumberWithError(rawPhone, { defaultCountry: country, extract: false });
      if (number.ext || !number.isValid() || number.country !== country) throw new Error("Invalid phone");
      phone = number.number;
    } catch {
      errors.phone = `Enter a valid phone number for ${names.of(country)} (${`+${getCountryCallingCode(country)}`}).`;
    }
  }
  const passwordError = validatePassword(values.password);
  if (passwordError) errors.password = passwordError;
  if (!values.confirm || values.password !== values.confirm) errors.confirm = "Your passwords do not match.";
  if (values.terms !== "yes") errors.terms = "Accept the Terms and Privacy Policy to continue.";
  return { errors, data: { name, email, country, phone } };
}
