// Platform marketing only. Never include this in account or merchant layouts.
export const GOOGLE_TAG_ID = "G-E8407V71QH";
export const GOOGLE_TAG_HEAD = `<script>
(function () {
  if (!["lebrands.store", "www.lebrands.store"].includes(window.location.hostname)) return;
  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === "1") return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  var referrer = "";
  try { var ref = new URL(document.referrer); referrer = ref.origin + ref.pathname; } catch (_) {}
  window.gtag("config", "${GOOGLE_TAG_ID}", {
    page_location: window.location.origin + window.location.pathname,
    page_referrer: referrer,
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });
  var script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID}";
  document.head.appendChild(script);
})();
</script>`;

export function googleTagCsp(csp) {
  return csp
    .replace("script-src 'self' 'unsafe-inline'", "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com")
    .replace("connect-src 'self'", "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com")
    .replace("img-src 'self'", "img-src 'self' https://www.google-analytics.com");
}
