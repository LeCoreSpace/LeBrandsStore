let checkoutScript;
async function loadCheckout(){
  if(window.Razorpay)return;
  checkoutScript ||=new Promise((resolve,reject)=>{
    const s=document.createElement("script");s.src="https://checkout.razorpay.com/v1/checkout.js";s.async=true;
    const timer=setTimeout(()=>{s.remove();checkoutScript=null;reject(Error("Razorpay took too long to load. Please try again."));},15000);
    s.onload=()=>{clearTimeout(timer);resolve();};
    s.onerror=()=>{clearTimeout(timer);s.remove();checkoutScript=null;reject(Error("Razorpay could not load. Your plan is unchanged."));};
    document.head.append(s);
  });
  await checkoutScript;
  if(!window.Razorpay)throw Error("Razorpay is unavailable. Please try again.");
}
export function attachTestCheckout(cfg){
  const dialog=document.querySelector("[data-test-dialog]");
  if(!dialog||!cfg.endpoint)return;
  const one=s=>document.querySelector(`[data-test-${s}]`),say=t=>{one("message").textContent=t;};
  let busy=false,selected,checkout,opener;
  const amount=n=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(n/100);
  const setBusy=v=>{
    busy=v;document.querySelectorAll("[data-test-price],[data-test-check],[data-test-resume],[data-test-close]").forEach(b=>b.disabled=v);
    one("pay").disabled=v||!one("consent").checked;dialog.setAttribute("aria-busy",String(v));
  };
  async function post(action,input){
    const response=await fetch(`${cfg.endpoint}/${action}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input),signal:AbortSignal.timeout(30000)});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||"The test checkout could not be completed.");
    return result;
  }
  function error(e){const text=e.name==="TimeoutError"?"The response timed out. Check test payment before retrying.":e.message;one("dialog-message").textContent=text;say(text);}
  async function openProvider(c){
    if(c.verified){say(c.message);location.reload();return;}
    await loadCheckout();
    const instance=new window.Razorpay({
      key:c.key,order_id:c.order_id,amount:c.amount,currency:c.currency,
      name:"LeBrands.Store",description:"Platform subscription test only",
      modal:{ondismiss:()=>say("Test checkout closed. No plan was changed. Resume it or check its payment below.")},
      handler:async result=>{
        setBusy(true);
        try{
          // Only pass the exact response contract, not arbitrary SDK metadata.
          await post("confirm",{checkout_id:c.id,razorpay_order_id:result.razorpay_order_id,
            razorpay_payment_id:result.razorpay_payment_id,razorpay_signature:result.razorpay_signature});
          say("Test payment verified. Refreshing payment history.");location.reload();
        }catch(e){error(e);}finally{setBusy(false);}
      }
    });
    instance.on("payment.failed",()=>say("The test payment failed. No plan was changed. Retry in Razorpay or check its status here."));
    dialog.close();instance.open();
  }
  one("consent").addEventListener("change",()=>{one("pay").disabled=busy||!one("consent").checked;});
  dialog.addEventListener("cancel",e=>{if(busy)e.preventDefault();});
  dialog.addEventListener("close",()=>opener?.focus());
  document.addEventListener("click",async e=>{
    const button=e.target.closest?.("[data-test-price],[data-test-check],[data-test-resume]");
    if(!button||busy)return;
    if(button.hasAttribute("data-test-price")){
      opener=button;
      // Keep the request key when retrying the same selection, including timeout.
      if(selected?.price_id!==button.dataset.testPrice){
        selected={price_id:button.dataset.testPrice,idempotency_key:crypto.randomUUID(),terms_version:"paid-test-v1",accepted:true};checkout=null;
      }
      one("summary").textContent=`${button.dataset.testLabel}: ${amount(Number(button.dataset.testAmount))}, simulated total.`;
      one("consent").checked=false;one("pay").disabled=true;one("dialog-message").textContent="";dialog.showModal();return;
    }
    setBusy(true);say("Checking the test checkout...");
    try{
      const id=button.dataset.testCheck||button.dataset.testResume;
      if(button.hasAttribute("data-test-check")){await post("reconcile",{checkout_id:id});location.reload();}
      else{
        // Resume is a separate server read/verification operation. Never creates
        // another order, even when the original browser lost its local state.
        const c=await post("resume",{checkout_id:id});await openProvider(c);
      }
    }catch(e){error(e);}finally{setBusy(false);}
  });
  one("pay").addEventListener("click",async()=>{
    if(busy||!selected||!one("consent").checked)return;
    setBusy(true);one("dialog-message").textContent="Preparing test checkout...";
    try{
      checkout ||=await post("checkout",selected);
      await openProvider(checkout);
    }catch(e){error(e);}finally{setBusy(false);}
  });
}
