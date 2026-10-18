import { REGISTRATION_COUNTRIES, validateRegistration } from "./registration-validation.js";

const form = document.querySelector("#registration-form");
if (form) {
  const country = form.elements.country, phone = form.elements.phone;
  let submitted = false;
  const values = () => Object.fromEntries(new FormData(form));
  function showErrors(errors, all = false) {
    for (const field of ["name", "email", "country", "phone", "password", "confirm", "terms"]) {
      const input = form.elements[field];
      if (!all && document.activeElement === input) continue;
      const error = errors[field] || "";
      input.setAttribute("aria-invalid", String(Boolean(error)));
      const message = document.getElementById(`${field}-error`);
      if (message) { message.textContent = error; message.hidden = !error; }
    }
  }
  function updateCountry() {
    const selected = REGISTRATION_COUNTRIES.find(item => item.code === country.value);
    document.getElementById("phone-code").textContent = selected?.callingCode || "+";
    document.getElementById("phone-help").textContent = selected
      ? `Use a ${selected.name} phone number. You can enter the national number or include ${selected.callingCode}.`
      : "Choose your country, then enter your phone number.";
    phone.disabled = !selected;
  }
  updateCountry();
  country.addEventListener("change", () => {
    updateCountry();
    const { errors } = validateRegistration(values());
    if (submitted) showErrors(errors, true);
    else for (const field of ["country", "phone"]) {
      const error = field === "phone" && !phone.value.trim() ? "" : errors[field] || "";
      form.elements[field].setAttribute("aria-invalid", String(Boolean(error)));
      const message = document.getElementById(`${field}-error`);
      if (message) { message.textContent = error; message.hidden = !error; }
    }
  });
  form.addEventListener("focusout", event => {
    const field = event.target.name;
    if (!field) return;
    const { errors } = validateRegistration(values());
    if (submitted) showErrors(errors, true);
    else {
      const message = document.getElementById(`${field}-error`);
      const error = errors[field] || "";
      event.target.setAttribute("aria-invalid", String(Boolean(error)));
      if (message) { message.textContent = error; message.hidden = !error; }
    }
  });
  form.addEventListener("input", () => { if (submitted) showErrors(validateRegistration(values()).errors, true); });
  form.addEventListener("submit", event => {
    submitted = true;
    const { errors } = validateRegistration(values());
    showErrors(errors, true);
    if (Object.keys(errors).length) {
      event.preventDefault();
      form.elements[Object.keys(errors)[0]]?.focus();
    }
  });
  // The server validates the same rules when JavaScript is unavailable.
  form.noValidate = true;
}
