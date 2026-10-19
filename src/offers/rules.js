import {commerceError,inclusiveTax,deliveryCharge} from "../public/commerce-rules.js";
import {UUID} from "../public/validation.js";

export function offerCode(value=""){
  if(typeof value!=="string")throw commerceError("Enter a valid offer code.");
  const code=value.trim().toUpperCase();
  if(code&&!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(code))throw commerceError("Use a code with 3–32 letters, numbers or hyphens.");
  return code;
}
export function offerInput(body){
  const fail=()=>{throw commerceError("Check the offer name, value, dates, limits and selected targets.");};
  if(!body||Array.isArray(body))fail();
  const out={};
  if(body.id!=null){
    if(!UUID.test(body.id)||!Number.isSafeInteger(body.expected_revision)||body.expected_revision<1)fail();
    out.id=body.id;out.expected_revision=body.expected_revision;
  }
  if(typeof body.title!=="string"||!body.title.trim()||body.title.trim().length>120)fail();
  out.title=body.title.trim();
  for(const [key,allowed] of Object.entries({method:["automatic","code"],scope:["order","product","collection"],
    kind:["percentage","fixed"],status:["draft","active","paused"]})){
    if(!allowed.includes(body[key]))fail();out[key]=body[key];
  }
  for(const [key,min,max,fallback] of [
    ["value",1,body.kind==="percentage"?10000:10000000000,undefined],
    ["min_spend_paise",0,10000000000,0],["min_quantity",1,10000,1],
    ["max_discount_paise",1,10000000000,null],["usage_limit",1,2147483647,null],
  ]){
    const value=body[key]??fallback;
    if(value!==null&&(!Number.isSafeInteger(value)||value<min||value>max))fail();
    out[key]=value;
  }
  for(const key of ["starts_at","ends_at"]){
    const v=body[key];
    if(v!=null&&(typeof v!=="string"||!Number.isFinite(Date.parse(v))||!/(Z|[+-]\d\d:\d\d)$/.test(v)))fail();
    out[key]=v==null?null:new Date(v).toISOString();
  }
  if(out.starts_at&&out.ends_at&&out.ends_at<=out.starts_at)fail();
  out.code=out.method==="code"?offerCode(body.code):null;
  if(out.method==="code"&&!out.code)fail();
  if(!Array.isArray(body.target_ids)||body.target_ids.length>500||body.target_ids.some(id=>!UUID.test(id)))fail();
  out.target_ids=[...new Set(body.target_ids.map(id=>id.toLowerCase()))];
  if(out.scope==="order")out.target_ids=[];
  else if(!out.target_ids.length)fail();
  return out;
}
export function offerStatus(offer,now=Date.now()){
  if(offer.status!=="active")return offer.status;
  if(offer.starts_at&&Date.parse(offer.starts_at)>now)return "scheduled";
  if(offer.ends_at&&Date.parse(offer.ends_at)<=now)return "expired";
  return "active";
}
const lineKey=line=>`${line.product_id}:${line.product_option_id||""}`;
// Integer largest-remainder allocation. Stable tie breaks are independent of cart order.
export function allocateDiscount(lines,amount){
  const gross=lines.reduce((sum,l)=>sum+l.line_total_paise,0);
  if(!Number.isSafeInteger(amount)||amount<0||amount>gross)throw commerceError("Invalid discount allocation.");
  if(!gross)return [];
  const base=lines.map(line=>{
    const n=BigInt(amount)*BigInt(line.line_total_paise),d=BigInt(gross);
    return{key:lineKey(line),amount:Number(n/d),remainder:n%d};
  });
  let remaining=amount-base.reduce((sum,l)=>sum+l.amount,0);
  const sorted=[...base].sort((a,b)=>a.remainder===b.remainder?a.key.localeCompare(b.key):a.remainder>b.remainder?-1:1);
  for(let i=0;i<remaining;i++)sorted[i].amount++;
  return base;
}
export function applyBestOffer(quote,candidates,snapshot,{code="",state="",now=Date.now()}={}){
  if(code){
    const entered=candidates.find(o=>o.method==="code"&&o.code===code);
    const reject=message=>{throw commerceError(message,{code:message});};
    if(!entered)reject("This code is not active at this store. Check the spelling or try another code.");
    const status=offerStatus(entered,now);
    if(status==="scheduled")reject("This offer has not started yet.");
    if(status==="expired")reject("This offer has expired.");
    if(status!=="active")reject("This offer is not active.");
    if(entered.usage_limit!=null&&Number(entered.used_count)>=Number(entered.usage_limit))
      reject("This offer has reached its usage limit.");
  }
  let winner=null,allocations=[],bestTotal=quote.total_paise;
  for(const offer of candidates){
    if(offerStatus(offer,now)!=="active"||!["percentage","fixed"].includes(offer.kind)||
      (offer.currency&&offer.currency!==snapshot.store?.currency&&snapshot.store?.currency)||
      (offer.usage_limit!=null&&Number(offer.used_count)>=Number(offer.usage_limit)))continue;
    if(offer.method==="code"&&(!code||offer.code!==code))continue;
    const ids=new Set(offer.target_ids||[]);
    const eligible=quote.items.filter(line=>{
      if(offer.scope==="order")return true;
      if(offer.scope==="product")return ids.has(line.product_id);
      // Membership is copied from the publication, never an unfinished draft edit.
      return (snapshot.collections||[]).some(c=>ids.has(c.id)&&
        (c.product_ids||[]).includes(line.product_id));
    });
    const gross=eligible.reduce((sum,l)=>sum+l.line_total_paise,0);
    const qty=eligible.reduce((sum,l)=>sum+l.quantity,0);
    if(!gross||gross<Number(offer.min_spend_paise)||qty<Number(offer.min_quantity))continue;
    let saving=offer.kind==="percentage"?Number(BigInt(gross)*BigInt(offer.value)/10000n):Number(offer.value);
    saving=Math.min(gross,saving,Number(offer.max_discount_paise??gross));
    if(!saving)continue;
    const payable=quote.subtotal_paise-saving+deliveryCharge(quote.subtotal_paise-saving,quote.settings);
    if(payable<bestTotal||(winner&&payable===bestTotal&&offer.id<winner.id)){
      bestTotal=payable;
      winner={...offer,amount_paise:saving};allocations=allocateDiscount(eligible,saving);
    }
  }
  if(code&&!candidates.some(o=>o.method==="code"&&o.code===code&&offerStatus(o,now)==="active"))
    throw commerceError("This offer code is unavailable or has expired.",{code:"Check the code."});
  if(code&&!winner)throw commerceError("Your bag does not meet this offer’s conditions.",{code:"Check eligible items, minimum spend and usage limits."});
  const discount=winner?.amount_paise||0;
  const amounts=new Map(allocations.map(a=>[a.key,a.amount]));
  const items=quote.items.map(line=>{
    const amount=amounts.get(lineKey(line))||0;
    if(!amount)return{...line,discount_paise:0};
    return{...line,discount_paise:amount,
      // Keep line_total_paise gross for order history/analytics; allocated tax
      // is calculated on net consideration, and saved separately.
      ...inclusiveTax(line.line_total_paise-amount,line.gst_rate,quote.settings.store_state===state)};
  });
  const delivery=deliveryCharge(quote.subtotal_paise-discount,quote.settings);
  return{...quote,items,discount_paise:discount,delivery_paise:delivery,
    total_paise:quote.subtotal_paise-discount+delivery,tax_paise:items.reduce((s,l)=>s+l.tax_paise,0),
    cod_available:quote.settings.cod_enabled&&!!quote.settings.store_state&&!!items.length&&
      quote.subtotal_paise-discount+delivery<=quote.settings.cod_max_paise,
    offer:winner?{id:winner.id,title:winner.title,code:winner.method==="code"?winner.code:null,
      kind:winner.kind,value:Number(winner.value),revision:winner.revision,scope:winner.scope,
      amount_paise:discount}:null,offers_available:true,
    ...(code&&winner?.method==="automatic"?{offer_notice:"A better automatic offer was applied instead."}:{})};
}
