(function () {
  document.querySelectorAll("[data-toggle-password]").forEach(function (b) {
    var i = document.getElementById(b.getAttribute("data-toggle-password"));
    if (!i) return;
    b.hidden = false;
    b.addEventListener("click", function () {
      var show = i.type === "password";
      i.type = show ? "text" : "password";
      b.textContent = show ? "Hide" : "Show";
      b.setAttribute("aria-pressed", String(show));
    });
  });
  var form = document.querySelector("[data-confirm-form]");
  var dlg = document.getElementById("pa-dialog");
  if (!form || !dlg || typeof dlg.showModal !== "function") {
    if (form) { var p = document.createElement("p"); p.className = "pa-alert"; p.setAttribute("role", "alert"); p.textContent = "This browser cannot show the confirmation dialog. Use a current browser to suspend or restore stores."; form.appendChild(p); form.querySelector("[data-open-confirm]").disabled = true; }
    return;
  }
  var input = dlg.querySelector("[data-confirm-input]");
  var go = dlg.querySelector("[data-submit-confirm]");
  var sub = form.getAttribute("data-subdomain");
  var opener = form.querySelector("[data-open-confirm]");
  form.addEventListener("submit", function (e) {
    if (form.dataset.confirmed === "1") return;
    e.preventDefault();
    if (!form.reportValidity()) return;
    dlg.querySelector("[data-dialog-reason]").textContent = form.elements.reason.value;
    input.value = ""; go.disabled = true;
    dlg.showModal(); input.focus();
  });
  input.addEventListener("input", function () { go.disabled = input.value !== sub; });
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); if (!go.disabled) go.click(); } });
  dlg.querySelector("[data-cancel]").addEventListener("click", function (e) { e.preventDefault(); dlg.close(); });
  dlg.addEventListener("close", function () { if (form.dataset.confirmed !== "1" && opener) opener.focus(); });
  go.addEventListener("click", function () {
    if (input.value !== sub) return;
    form.elements.confirmation.value = input.value;
    form.dataset.confirmed = "1";
    go.disabled = true;
    form.submit();
  });
})();
