import { renderCheckoutSettings } from "./ui/checkout.js";

// Local preview only: no database client or merchant credentials.
export async function checkoutSettingsPreview(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname !== "/__checkout-settings-preview") return false;
  res.setHeader("cache-control", "no-store");
  if (!["GET", "HEAD"].includes(req.method)) {
    res.statusCode = 405;
    res.end("This is a read-only design preview.");
    return true;
  }
  const html = renderCheckoutSettings({
    store: {store_id:"11111111-1111-4111-8111-111111111111",name:"Preview store",status:"draft"},
    settings: {delivery_mode:"free",cod_enabled:true,cod_max_paise:300000,store_state:"33"},
  }, {name:"Preview merchant"})
    .replace("data-checkout-settings", "data-preview-checkout-settings")
    .replace('type="submit"', 'type="submit" disabled title="Read-only design preview"');
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(req.method === "HEAD" ? "" : html);
  return true;
}
