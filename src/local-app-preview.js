// Local-only navigation shell. Never imported by the production Worker.
import { renderAccount } from "./ui/accounts.js";
import { renderDashboard } from "./ui/dashboard.js";
import { escapeHtml } from "./ui/layout.js";
import { exampleFixture, exampleInvoice, exampleMedia } from "./local-example-fixture.js";
import { dateFilters } from "./public/dashboard-rules.js";
import { renderAura } from "./public/aura.js";
import { renderInvoice } from "./ui/invoice.js";

const page = (name) => `/__app-preview/page/${name}`;
export const PREVIEW_SCREENS = [
  ["overview", "Dashboard", page("overview")],
  ["marketing", "Homepage", "/"],
  ["pricing", "Pricing", "/pricing"],
  ["login", "Sign in", page("login")],
  ["signup", "Create account", page("signup")],
  ["forgot-password", "Forgot password", page("forgot-password")],
  ["account", "Account / password", page("account")],
  ["stores", "Your stores", page("stores")],
  ["new-store", "Create store", page("new-store")],
  ["wizard", "Setup wizard", "/__example-preview/wizard"],
  ["orders", "Orders", page("orders")],
  ["order", "Order details", page("order")],
  ["products", "Products", page("products")],
  ["product", "Edit product", page("product")],
  ["product-new", "Add product", page("product-new")],
  ["customers", "Customers", page("customers")],
  ["customer", "Customer details", page("customer")],
  ["settings", "Settings", page("settings")],
  ["invoices", "Invoices", page("invoices")],
  ["invoice", "Invoice document", page("invoice")],
  ["storefront", "Aura storefront", page("store-home")],
  ["collection", "Store collection", page("store-collection")],
  ["store-product", "Store product", page("store-product")],
  ["store-about", "Store about page", page("store-about")],
  ["store-contact", "Store contact page", page("store-contact")],
  ["store-policy", "Store policies", page("store-policy")],
  ["cart", "Shopping cart", page("store-cart")],
  ["checkout", "Checkout", page("store-checkout")],
  ["track", "Track an order", page("store-track")],
  ["concept", "Clothing design concept", "/__example-preview/premium-store"],
  ["terms", "Terms", "/terms"],
  ["privacy", "Privacy", "/privacy"],
  ["contact", "Contact", "/contact"],
];

export function previewShell(screen) {
  const selected = PREVIEW_SCREENS.find(([key]) => key === screen) || PREVIEW_SCREENS[0];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Application preview | LeBrands.Store</title><style>
    *{box-sizing:border-box}body{margin:0;font:13px system-ui;color:#38282b;background:#f6f0e6}
    header{padding:14px 20px;border-bottom:1px solid #dfd5d6;display:flex;gap:16px;align-items:center;justify-content:space-between}header strong{color:#6b1735}header p{margin:4px 0 0;color:#78686a;font-size:12px}header a{color:#6b1735}
    main{display:grid;grid-template-columns:195px 1fr;height:calc(100dvh - 73px)}nav{overflow:auto;padding:12px;border-right:1px solid #dfd5d6}nav a{display:block;padding:9px 12px;text-decoration:none;color:inherit;border-radius:5px}nav a:hover{background:#eee5e7}nav a[aria-current]{background:#6b1735;color:#fffdf4}iframe{border:0;width:100%;height:100%;background:white}a:focus-visible{outline:2px solid #6b1735;outline-offset:2px}
    @media(max-width:650px){header{padding:10px 14px}header p{max-width:280px}main{grid-template-columns:1fr;grid-template-rows:54px 1fr;height:calc(100dvh - 87px)}nav{display:flex;gap:4px;overflow:auto;white-space:nowrap;padding:8px;border-right:0;border-bottom:1px solid #dfd5d6}nav a{flex:none}}
    </style></head><body><header><div><strong>LeBrands.Store application preview</strong><p>Sample screens only. No live account, database writes, publishing or orders.</p></div><a href="${escapeHtml(selected[2])}" target="_blank" rel="noopener">Open screen</a></header><main><nav aria-label="Application screens">${PREVIEW_SCREENS.map(([key, label]) => `<a href="/__app-preview?screen=${key}" ${key === selected[0] ? 'aria-current="page"' : ""}>${label}</a>`).join("")}</nav><iframe src="${escapeHtml(selected[2])}" title="${escapeHtml(selected[1])} preview" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"></iframe></main></body></html>`;
}

export function renderAppSample(view, searchParams) {
  const data = exampleFixture();
  const user = { name: "Example owner", email: "owner@example.invalid", must_change_password: false };
  const accounts = { login: "login", signup: "signup", "forgot-password": "forgot-password", account: "account", stores: "dashboard", "new-store": "new-store" };
  let body;
  if (view === "invoice") {
    body = renderInvoice(exampleInvoice(data));
  } else if (view.startsWith("store-")) {
    const storefrontView = view.slice("store-".length);
    if (!["home", "collection", "product", "about", "contact", "policy", "cart", "checkout", "track"].includes(storefrontView)) return null;
    const product = data.products.find((p) => p.id === searchParams.get("product")) || data.products[0];
    const policy = ["privacy","terms","shipping","cancellation-refund","pricing"].includes(searchParams.get("policy")) ? searchParams.get("policy") : "privacy";
    body = exampleMedia(renderAura(data, { page:storefrontView, productId:product.id, policyKind:policy, preview:true, commerce:true, readOnly:true, storeKey:data.store.store_id }));
    body = body.replace(/href="([^"]*)"/g, (attribute, path) => {
      const mapped = path === "/" ? page("store-home") :
        path === "/collections/all" ? page("store-collection") :
        path.startsWith("/products/") ? `${page("store-product")}?product=${encodeURIComponent(path.slice(10))}` :
        path.startsWith("/policies/") ? `${page("store-policy")}?policy=${encodeURIComponent(path.slice(10))}` :
        ["/pages/about","/pages/contact"].includes(path) ? page(`store-${path.split("/").pop()}`) :
        ["/cart","/checkout","/track"].includes(path) ? page(`store-${path.slice(1)}`) : null;
      return mapped ? `href="${escapeHtml(mapped)}"` : attribute;
    });
  } else if (accounts[view]) {
    body = renderAccount(accounts[view], { user, stores: [{ ...data.store, role: "owner" }] });
  } else if (["overview", "orders", "order", "products", "product", "product-new", "customers", "customer", "settings", "invoices"].includes(view)) {
    data.filters = dateFilters(searchParams);
    const search = searchParams.get("search")?.toLowerCase() || "";
    data.filters.search = search;
    data.orders = data.orders.filter((order) =>
      (!search || `${order.order_number} ${order.customer_name} ${order.phone}`.toLowerCase().includes(search)) &&
      (!data.filters.status || order.status === data.filters.status) &&
      (!data.filters.from || order.created_at.slice(0, 10) >= data.filters.from) &&
      (!data.filters.to || order.created_at.slice(0, 10) <= data.filters.to));
    data.customers = data.customers.filter((customer) => !search || `${customer.name} ${customer.email} ${customer.phone}`.toLowerCase().includes(search));
    data.customer = { ...data.customers[0], orders: data.orders.slice(0, 1), addresses: [data.order.shipping_address] };
    data.invoices = [{ ...exampleInvoice(data), id: "example-invoice", order_number: data.order.order_number }];
    body = renderDashboard(view, data, user).replace('class="lb-app"', 'class="lb-app" data-preview="true"');
  } else return null;
  // Resolve operational links locally without changing their production renderers.
  const localLink = (path) => {
    if (path === "/logout") return "/__app-preview";
    if (path === "/") return view.startsWith("store-") ? page("store-home") : page("stores");
    if (path.startsWith(`https://${data.store.subdomain}.lebrands.store`)) return page("store-home");
    if (path === "/stores/new") return page("new-store");
    if (path === "/account") return page("account");
    if (["/login", "/signup", "/forgot-password"].includes(path)) return page(path.slice(1));
    const match = path.match(/^\/stores\/[^/]+(?:\/([^/?]+))?(?:\/([^/?]+))?/);
    if (!match) return path.replace("https://lebrands.store", "");
    const [, section = "overview", detail] = match;
    if (section === "setup") return "/__example-preview/wizard";
    if (section === "invoices" && detail) return page("invoice");
    if (section === "orders" && detail) return page("order");
    if (section === "products" && detail) return page(detail === "new" ? "product-new" : "product");
    if (section === "customers" && detail) return page("customer");
    return page(section);
  };
  body = body.replace(/\b(href|action)="([^"]*)"/g, (_, attr, path) => `${attr}="${escapeHtml(localLink(path))}"`)
    .replace(/<button([^>]*\bdata-(?:order-status|payment-collected|export|archive-product|stock-adjust|publish-store|unpublish-store)\b[^>]*)>/g, "<button disabled$1>")
    .replace(/<input([^>]*\btype="file"[^>]*)>/g, "<input disabled$1>")
    .replace(/<form\b([^>]*)>([\s\S]*?)<\/form>/g, (form, attrs, contents) =>
      /method="post"|data-(?:settings|product)-form/.test(attrs)
        ? `<form${attrs}>${contents.replace(/<button\b/g, "<button disabled")}</form>` : form);
  return body.replace(/<body\b[^>]*>/i, match => `${match}<p role="status" style="margin:0;padding:8px;text-align:center;font:12px system-ui;background:#f1e5ea;color:#6b1735">Read-only application preview. Fictional sample data. Nothing is saved.</p>`);
}
