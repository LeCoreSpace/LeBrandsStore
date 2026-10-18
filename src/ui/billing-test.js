import {escapeHtml as esc} from "./layout.js";
const money=value=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(value)/100);
export function renderBillingTest(billing){
  const state=billing.testCheckout;
  if(!state?.available)return `<section class="pb-card"><h2>Test checkout</h2><p>Test checkout is not configured. Live payments remain unavailable.</p></section>`;
  const offers=(billing.catalogue||[]).filter(p=>["launch","grow","scale"].includes(p.code))
    .flatMap(p=>(p.prices||[]).filter(x=>x.price_kind==="fixed"&&x.currency==="INR"&&Number(x.amount_minor)>0)
      .map(x=>({...x,name:p.name,code:p.code})));
  const buttons=state.eligible?offers.map(x=>`<button type="button" class="pb-btn pb-btn-quiet"
    data-test-price="${esc(x.id)}" data-test-label="${esc(`${x.name}, ${x.billing_interval}`)}"
    data-test-amount="${esc(String(x.amount_minor))}">Test ${esc(x.name)} ${esc(x.billing_interval)} · ${esc(money(x.amount_minor))}</button>`).join("")
    :'<p class="pb-callout">Your Indian business documents must be approved before testing paid checkout. Accept Free in Ann first.</p>';
  const attempts=(state.attempts||[]).map(c=>`<li class="pb-test-attempt"><div><strong>${esc(c.plan)} · ${esc(c.billing_interval)}</strong>
    <p>${esc(money(c.total_minor))} · ${c.verified?"Test payment verified":esc(c.status)} · ${esc(c.id.slice(0,8))}</p></div>
    ${c.verified?"":`<div class="pb-actions"><button type="button" class="pb-btn pb-btn-quiet" data-test-check="${esc(c.id)}">Check test payment</button>
    ${c.provider_order_id&&Date.parse(c.expires_at)>Date.now()?`<button type="button" class="pb-btn pb-btn-quiet" data-test-resume="${esc(c.id)}">Resume test checkout</button>`:""}</div>`}</li>`).join("");
  return `<section class="pb-card" aria-labelledby="pb-test-title"><p class="pb-kicker">Razorpay sandbox</p><h2 id="pb-test-title">Try a paid-plan payment</h2>
    <p>No real money is charged. A verified test payment will not replace Free, change its dates, unlock paid benefits or approve your store.</p>
    <p class="pb-muted">The displayed amount is a simulated base price. Tax has not been assessed. This is not a tax quotation or invoice. One-time payment only, with no automatic renewal.</p>
    <div class="pb-actions">${buttons}</div><p data-test-message role="status" aria-live="polite"></p>
    ${attempts?`<h3>Recent test checkouts</h3><ul class="pb-test-attempts">${attempts}</ul>`:""}
    <dialog class="pb-checkout-dialog" data-test-dialog aria-labelledby="pb-test-dialog-title">
      <form method="dialog"><button class="pb-btn pb-btn-quiet" aria-label="Close test checkout" data-test-close>Close</button></form>
      <p class="pb-kicker">Test mode only</p><h2 id="pb-test-dialog-title">Review test payment</h2>
      <p data-test-summary></p><p>No real money will move. Your live subscription and store access will not change. Tax is not assessed in this sandbox.</p>
      <label class="pb-test-consent"><input type="checkbox" data-test-consent> I agree to simulate this one-time payment. It does not purchase live service or enable automatic renewal.</label>
      <p data-test-dialog-message role="alert"></p><button type="button" class="pb-btn" data-test-pay disabled>Open Razorpay test checkout</button>
    </dialog></section>`;
}
