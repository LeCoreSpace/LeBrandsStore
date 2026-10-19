import test from "node:test";
import assert from "node:assert/strict";
import { renderAura, storefrontIcon } from "../src/public/aura.js";
import { STYLE_IDS } from "../src/public/aura-styles.js";
import { productHref } from "../src/public/commerce-options.js";
import { serveStorefront } from "../src/store/live.js";
import {serveStoreIcon} from "../src/store/favicon.js";
import {mergeAvailability} from "../src/store/availability.js";

const id = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const logo = `https://media.lebrands.store/stores/${id}/33333333-3333-4333-8333-333333333333.webp`;
const fixture = style => ({
  store: { store_id: id, subdomain: "example", name: "Example Store", status: "live" },
  settings: {
    brand_name: "Example Store", subdomain: "example", logo_url: logo,
    ann_design: { version: 1, style, copy: {}, media: {} },
  },
  products: [{ id: productId, slug: "my-unique-womens-top", title: "My unique womens top",
    description: "A cotton top.", status: "active", price_paise: 129900, stock: 3, images: [] }],
  policies: [], collections: [],
});
const db = data => ({ withStore: async (_, fn) => fn(async (parts) => {
  const query = parts.join("?");
  return query.includes("SELECT p.snapshot") ? [{ snapshot: data }] : [{ enabled: false }];
}) });

test("availability changes never replace published metadata or expose unpublished variants",()=>{
  const products=[{id:productId,title:"Published title",price_paise:10000,stock:9,
    variants:[{id:"old",sku:"PUBLISHED",price_paise:12000,values:["S"],stock:9},
      {id:"removed",sku:"REMOVED",values:["M"],stock:4}]}];
  const before=JSON.stringify(products);
  const updated=mergeAvailability(products,[{id:productId,stock:102,sku_stock:JSON.stringify([
    {id:"old",stock:2,price_paise:999},{id:"unpublished",stock:100},
  ])}]);
  assert.equal(updated[0].stock,2);
  assert.equal(updated[0].variants.length,2);
  assert.equal(updated[0].variants[0].price_paise,12000);
  assert.equal(updated[0].variants[1].stock,0);
  assert.equal(updated[0].title,"Published title");
  assert.equal(JSON.stringify(products),before);
  assert.equal(mergeAvailability(products,[])[0].stock,0);
  assert.equal(mergeAvailability([{id:productId,stock:0}],[{id:productId,stock:null,sku_stock:[]}])[0].stock,null);
});

test("all saved themes use the shared live product structure and merchant favicon", () => {
  for (const style of STYLE_IDS) {
    const data = fixture(style);
    const product = renderAura(data, { page: "product", productId, commerce: true });
    assert.match(product, /cm-product/, style);
    assert.match(product, /cm-buy/, style);
    assert.match(product, new RegExp(`data-add-product="${productId}"`), style);
    for (const page of ["product", "cart", "checkout","track","confirmation"]) {
      const html = renderAura(data, { page, productId, commerce: true });
      assert.ok(html.includes(`<link rel="icon" href="${storefrontIcon(data.settings).iconHref}" sizes="any">`), `${style}/${page}`);
      assert.match(html, /commerce-signature\.css/, `${style}/${page}`);
      assert.ok(html.includes('class="cm"')&&html.includes(`data-style="${style}"`), `${style}/${page} must use the shared commerce shell`);
      assert.match(html, /<header class="sc-hd aura-header">/,style);
      assert.match(html, /<footer class="sc-ft">/,style);
      assert.doesNotMatch(html, /<header class="cm-hd">|<body class="sc /,style);
      assert.ok(html.includes('<body class="cm"'),style);
      for(const hook of ["data-menu-open","data-search-open","data-cart-open","data-cart-count",'id="au-menu"','id="au-search-sc"'])assert.ok(html.includes(hook),`${style}/${page} ${hook}`);
      if(page==="checkout"){
        assert.match(html,/id="checkout-form"/,style);
        assert.match(html,/data-commerce-config/,style);
        assert.equal((html.match(/<main\b/g)||[]).length,1,style);
      }
    }
    const collection = renderAura(data, { page: "collection", commerce: true });
    assert.match(collection, /href="\/products\/my-unique-womens-top"/, style);
    assert.doesNotMatch(collection, new RegExp(`href="/products/${productId}"`), style);
  }
});

test("read-only saved product previews load the shared skin without enabling shopping",()=>{
  const html=renderAura(fixture(STYLE_IDS[0]),{page:"product",productId,preview:true,readOnly:true,commerce:false});
  assert.match(html,/commerce-signature\.css/);assert.match(html,/cm-product/);
  assert.doesNotMatch(html,/data-add-product=/);
});

test("browser icons resize public merchant media to PNG with safe fallback",async()=>{
  const transformed=[];
  const bytes=new Uint8Array([137,80,78,71,13,10,26,10]);
  const env={
    MEDIA:{get:async()=>({body:new Response(bytes).body,size:bytes.length,httpEtag:'"fixture"',customMetadata:{},writeHttpMetadata(){}})},
    IMAGES:{input:()=>({transform:options=>{transformed.push(options);return{output:async options=>{
      assert.equal(options.format,"image/png");return{image:()=>bytes};
    }};}})},
  };
  for(const [path,size] of [["favicon.png",64],["apple-touch-icon.png",180]]){
    const response=await serveStoreIcon(new Request(`https://example.lebrands.store/${path}`),env,fixture(STYLE_IDS[0]).settings,id);
    assert.equal(response.headers.get("content-type"),"image/png");
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
    assert.deepEqual(transformed.at(-1),{width:size,height:size,fit:"contain"});
  }
  env.IMAGES={input(){throw Error("Synthetic resize outage");}};
  const fallback=await serveStoreIcon(new Request("https://example.lebrands.store/favicon.png"),env,fixture(STYLE_IDS[0]).settings,id);
  assert.match(fallback.headers.get("content-type"),/svg/);
  assert.equal(fallback.headers.get("x-favicon-fallback"),"resize_unavailable");
  assert.match(await fallback.text(),/EX/);
});

test("public links use saved slugs, remain stable after title edits and reject unsafe slugs", () => {
  const product = fixture(STYLE_IDS[0]).products[0];
  assert.equal(productHref(product), "/products/my-unique-womens-top");
  assert.equal(productHref({ ...product, title: "Renamed product" }), productHref(product));
  assert.equal(productHref({ ...product, slug: '"><script>' }), `/products/${productId}`);
  assert.equal(productHref({ id: productId }), `/products/${productId}`);
});


test("legacy product IDs redirect to the published slug and preserve attribution queries", async () => {
  const data = fixture(STYLE_IDS[0]), database = db(data);
  const response = await serveStorefront(new Request(`https://example.lebrands.store/products/${productId}?utm_source=mall`), database, data.store);
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "/products/my-unique-womens-top?utm_source=mall");
  const canonical = await serveStorefront(new Request("https://example.lebrands.store/products/my-unique-womens-top"), database, data.store);
  assert.equal(canonical.status, 200);
  assert.match(await canonical.text(), /My unique womens top/);
  const missing = await serveStorefront(new Request("https://example.lebrands.store/products/not-a-product"), database, data.store);
  assert.equal(missing.status, 404);
});

test("merchant favicon routes use only approved logo hosts, with a safe monogram fallback", async () => {
  const data = fixture(STYLE_IDS[0]);
  assert.equal(storefrontIcon({ann_design:{media:{logo:{url:logo}}}}).href,logo);
  let response = await serveStorefront(new Request("https://example.lebrands.store/favicon.ico"), db(data), data.store);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), logo);
  data.settings.logo_url = "https://attacker.invalid/logo.svg";
  data.settings.brand_name = '<script>alert("x")</script>';
  response = await serveStorefront(new Request("https://example.lebrands.store/favicon.svg"), db(data), data.store);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /image\/svg/);
  const svg = await response.text();
  assert.doesNotMatch(svg, /<script|attacker\.invalid/);
  assert.match(svg, /&lt;S/);
  assert.match(storefrontIcon(data.settings).href, /^\/favicon.svg\?v=/);
  const head = await serveStorefront(new Request("https://example.lebrands.store/favicon.svg", { method: "HEAD" }), db(data), data.store);
  assert.equal(await head.text(), "");
});
