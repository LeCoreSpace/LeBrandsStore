// Imported only by the Node development adapter, never by the production Worker.
// Memory-only UI/commerce fixture. No database, real credentials or provider calls.
import{renderMarketingIntegrations}from"./ui/marketing-integrations.js";
import{documentPage}from"./ui/dashboard.js";
import{renderAura}from"./public/aura.js";
import{injectMarketing}from"./marketing/storefront.js";
import{MARKETING_DEFAULTS,validateMarketing,purchasePayload}from"./marketing/rules.js";
import{quoteCart,DEFAULT_CHECKOUT_SETTINGS}from"./public/commerce-rules.js";
const ID="f0000000-0000-4000-8000-000000000001",PRODUCT="f0000000-0000-4000-8000-000000000002";
const base=`/api/stores/${ID}/marketing-integrations`;
const store={store_id:ID,subdomain:"marketing-demo",name:"Marketing demo",status:"live"};
const product={id:PRODUCT,title:"Demo cotton tote",price_paise:11800,gst_rate:18,hsn_code:"4202",status:"active",track_inventory:false,images:[],description:"An isolated preview product. No real orders or payments."};
const data={store,settings:{name:store.name,gstin:"33ABCDE1234F1Z7"},products:[product],collections:[],policies:[]};
let settings={...MARKETING_DEFAULTS},revision="",hint="",consent=null,paid=false,fired=false,eventId=crypto.randomUUID();
const result=()=>({settings,revision,meta_token_hint:hint,can_edit:true,storefront_url:"/__marketing-preview/product"});
function order(){return{store_id:ID,order_number:"DEMO-1001",tracking_event_id:eventId,total_paise:11800,tax_paise:1800,shipping_paise:0,payment_method:"online",status:paid?"paid":"pending_payment",payment_status:paid?"captured":"pending",
  items:[{product_id:PRODUCT,title:product.title,quantity:1,total_paise:11800,tax_paise:1800}]}};
async function body(req){let text="";for await(const chunk of req){text+=chunk;if(text.length>20000)throw Error("Request too large.");}return text?JSON.parse(text):{};}
export async function marketingPreview(req,res){
  const url=new URL(req.url||"/","http://localhost");
  const active=String(req.headers.cookie||"").includes("lb-marketing-fixture=1");
  const own=url.pathname.startsWith("/__marketing-preview/");
  const shopper=active&&(["/api/cart/validate","/api/marketing/consent","/api/marketing/purchase","/api/marketing/purchase-ack","/cart","/checkout"].includes(url.pathname)||url.pathname.startsWith("/checkout/complete/"));
  if(!own&&!(active&&(url.pathname===base||url.pathname===`${base}/test-meta`))&&!shopper)return false;
  res.setHeader("cache-control","no-store");res.setHeader("x-robots-tag","noindex, nofollow");
  res.setHeader("set-cookie","lb-marketing-fixture=1; Path=/; Secure; HttpOnly; SameSite=Strict");
  const send=(value,status=200)=>{res.statusCode=status;res.setHeader("content-type","application/json");res.end(JSON.stringify(value));return true;};
  try{
    if(url.pathname===base){
      if(req.method==="POST"){
        const input=await body(req);
        if(input.expected_revision!==revision)return send({error:"These settings changed in another tab. Your edits have not been saved."},409);
        settings=validateMarketing(input.settings);
        if(input.remove_meta_capi_token)hint="";else if(input.meta_capi_token)hint=input.meta_capi_token.slice(-4);
        revision=String(Date.now());
      }return send(result());
    }
    if(url.pathname===`${base}/test-meta`)return send({message:"Preview test completed. No event was sent to Meta."});
    if(url.pathname==="/__marketing-preview/reset"){
      settings={...MARKETING_DEFAULTS,meta_enabled:true,meta_pixel_id:"123456789012345",google_enabled:true,ga4_measurement_id:"G-DEMO123456",google_ads_id:"AW-123456789",google_label_purchase:"DemoPurchase",google_label_add_to_cart:"DemoCart",google_label_begin_checkout:"DemoCheckout"};
      revision="fixture-1";hint="";consent=null;paid=false;fired=false;eventId=crypto.randomUUID();return send({ok:true});
    }
    if(url.pathname==="/__marketing-preview/order-state"){
      const input=await body(req);paid=input.paid===true;fired=false;eventId=crypto.randomUUID();
      return send({url:`/checkout/complete/${eventId}`,event_id:eventId});
    }
    if(url.pathname==="/api/marketing/consent"){const input=await body(req);consent={analytics:input.analytics===true,ads:input.ads===true};return send(consent);}
    if(url.pathname==="/api/cart/validate"){
      const input=await body(req);return send(quoteCart([product],[product],input.items,{...DEFAULT_CHECKOUT_SETTINGS,store_state:"33"},input.state));
    }
    if(url.pathname==="/api/marketing/purchase-ack"){const input=await body(req);if(input.event_id===eventId)fired=true;return send({ok:true});}
    if(url.pathname==="/api/marketing/purchase"){
      if(!paid||fired)return send(null);
      const o=order();return send(purchasePayload(o,o.items));
    }
    let html;
    if(url.pathname==="/__marketing-preview/settings"){
      html=documentPage("marketing",{store,role:"owner",marketing:{...result(),can_edit:url.searchParams.get("role")!=="viewer"}},{id:PRODUCT,name:"Demo owner"},renderMarketingIntegrations({store,marketing:{...result(),can_edit:url.searchParams.get("role")!=="viewer"}}));
    }else{
      const page=url.pathname==="/checkout"?"checkout":url.pathname==="/cart"?"cart":url.pathname.startsWith("/checkout/complete/")?"confirmation":"product";
      html=renderAura({...data,...(page==="confirmation"?{order:order()}:{}),checkout:{...DEFAULT_CHECKOUT_SETTINGS,store_state:"33"}},
        {page,productId:PRODUCT,commerce:true,...(page==="confirmation"?{order:order()}: {})});
      html=injectMarketing(html,settings,{storeId:ID,revision,consent,product:page==="product"?{item_id:PRODUCT,item_name:product.title,quantity:1,price:118}:null});
    }
    // Even an accidental click on this test fixture cannot send vendor traffic.
    // The browser tester may bypass CSP ONLY after intercepting/stubbing ALL vendors.
    res.setHeader("content-security-policy","default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-src 'none'");
    res.setHeader("content-type","text/html; charset=utf-8");res.end(html);return true;
  }catch(error){return send({error:error.status?error.message:"The isolated fixture could not render.",fields:error.fields},error.status||500);}
}
