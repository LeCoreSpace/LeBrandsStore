// Checkout-scoped email identity and postal assistance. No merchant sign-in.
export function initializeCheckoutContact({api,apiRoot="",storageKey,security,onUpdate,onStateChange}){
  const form=document.querySelector("#checkout-form");
  if(!form)return null;
  const email=form.elements.email,code=form.elements.email_code,pin=form.elements.pincode;
  const status=form.querySelector("[data-email-status]"),fields=form.querySelector("[data-email-code-fields]");
  const send=form.querySelector("[data-email-send]"),confirm=form.querySelector("[data-email-verify]");
  const key=`${storageKey}:email-verification`;
  let saved=null,pending=false,expiryTimer,pinTimer,pinSequence=0,lastPin="";
  try{saved=JSON.parse(sessionStorage.getItem(key)||"null");}catch{}
  if(saved?.expires_at<=Date.now()){saved=null;try{sessionStorage.removeItem(key);}catch{}}
  const address=()=>email.value.trim().toLowerCase();
  if(saved?.email&&!email.value)email.value=saved.email;
  const verified=()=>!!saved?.token&&saved.email===address()&&saved.expires_at>Date.now();
  const persist=()=>{try{saved?sessionStorage.setItem(key,JSON.stringify(saved)):sessionStorage.removeItem(key);}catch{}};
  function sync(message){
    clearTimeout(expiryTimer);
    const same=saved?.email===address(),ok=verified();
    fields.hidden=!same||!saved?.challenge_id||ok;
    send.disabled=pending||ok;
    send.textContent=ok?"Email verified":same&&saved?.challenge_id?"Resend code":"Send code";
    confirm.disabled=pending||ok;
    if(message)status.textContent=message;
    else if(ok)status.textContent="Email verified. Order updates will be sent here.";
    else if(same&&saved?.challenge_id)status.textContent="Enter the six-digit code sent to your email. Check spam too.";
    else status.textContent="Verify your email to receive your order confirmation.";
    if(saved?.expires_at>Date.now())expiryTimer=setTimeout(()=>{
      saved=null;persist();sync("Verification expired. Please request a new code.");
    },saved.expires_at-Date.now()+50);
    onUpdate();
  }
  email.addEventListener("input",()=>{
    if(saved?.email!==address()){saved=null;persist();code.value="";}
    sync();
  });
  send.addEventListener("click",async()=>{
    if(pending)return;
    if(!email.checkValidity()||!address()){email.reportValidity();return;}
    const requestedEmail=address();pending=true;sync("Verifying your connection…");
    try{
      const token=security.token()||await security.ready?.();
      if(!token){sync("We could not verify this connection. Please try again shortly.");security.focus();return;}
      if(address()!==requestedEmail){sync("Email changed. Send a code to the new address.");return;}
      sync("Sending your code…");
      const result=await api("/api/checkout/email/start",{email:requestedEmail,turnstile_token:token});
      // Do not attach a response to an email edited during the request.
      if(address()!==requestedEmail){sync("Email changed. Send a code to the new address.");return;}
      saved={email:requestedEmail,challenge_id:result.challenge_id,expires_at:Date.now()+result.expires_in*1000};
      persist();code.value="";sync("Code sent. Enter it below to verify your email.");code.focus();
    }catch(error){sync(error.message);}
    finally{pending=false;security.reset();sync(status.textContent);}
  });
  confirm.addEventListener("click",async()=>{
    if(pending)return;
    if(!saved?.challenge_id||saved.email!==address()){sync("Send a verification code first.");return;}
    if(!/^\d{6}$/.test(code.value.trim())){sync("Enter the six-digit code from your email.");code.focus();return;}
    const requestedEmail=address();pending=true;sync("Verifying email…");
    try{
      const result=await api("/api/checkout/email/verify",{email:requestedEmail,challenge_id:saved.challenge_id,code:code.value.trim()});
      if(address()!==requestedEmail){sync("Email changed. Send a code to the new address.");return;}
      saved=result;persist();code.value="";sync("Email verified. Your order confirmation will be sent here.");
    }catch(error){sync(error.message);}
    finally{pending=false;sync(status.textContent);}
  });
  code.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();confirm.click();}});
  const pinFeedback=form.querySelector("[data-pincode-status]");
  function postalStatus(message,state="idle"){
    pinFeedback.textContent=message;
    pinFeedback.dataset.state=state;
  }
  async function lookup(){
    const value=pin.value.trim(),sequence=++pinSequence;
    if(!/^[1-9]\d{5}$/.test(value)||value===lastPin)return;
    postalStatus("Finding your city and state…","loading");
    try{
      const response=await fetch(`${apiRoot}/api/checkout/pincode?code=${encodeURIComponent(value)}`,{credentials:"same-origin",headers:{Accept:"application/json"}});
      const result=await response.json();
      if(sequence!==pinSequence||pin.value.trim()!==value)return;
      if(!response.ok)throw new Error(result.error||"Enter your city and state manually.");
      form.elements.city.value=result.city;
      form.elements.state.value=result.state;lastPin=value;
      postalStatus("City and state filled from your PIN. Check and adjust the locality if needed.","success");
      onStateChange();
    }catch(error){
      if(sequence===pinSequence&&pin.value.trim()===value)postalStatus(error.message||"PIN lookup is unavailable. Enter city and state manually.","error");
    }
  }
  pin.addEventListener("input",()=>{clearTimeout(pinTimer);++pinSequence;postalStatus("");pinTimer=setTimeout(lookup,450);});
  pin.addEventListener("change",lookup);
  // Browser autofill may complete after the script has loaded.
  pinTimer=setTimeout(lookup,700);
  sync();
  return{verified,token:()=>verified()?saved.token:"",sync};
}
