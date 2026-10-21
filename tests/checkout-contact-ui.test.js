import test from "node:test";
import assert from "node:assert/strict";
import {initializeCheckoutContact} from "../src/public/checkout-contact.js";
function harness(t){
  t.mock.timers.enable({apis:["setTimeout"]});
  const field=(value="")=>({value,textContent:"",dataset:{},listeners:{},addEventListener(event,fn){this.listeners[event]=fn;},checkValidity:()=>true,reportValidity(){},focus(){}});
  const elements={email:field("shopper@example.invalid"),email_code:field(),pincode:field(),city:field(),state:field()};
  const slots=Object.fromEntries(["email-status","email-code-fields","email-send","email-verify","pincode-status"].map(n=>[`[data-${n}]`,field()]));
  const form={elements,querySelector:selector=>slots[selector]};
  for(const [name,value] of Object.entries({document:{querySelector:()=>form},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}}})){
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,name);
    Object.defineProperty(globalThis,name,{configurable:true,value});
    t.after(()=>descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name]);
  }
  let complete;
  const calls=[],security={token:()=>"",ready:()=>new Promise(resolve=>{complete=resolve;}),focus(){},reset(){}};
  initializeCheckoutContact({storageKey:"isolated",security,onUpdate(){},onStateChange(){},
    api:async(path,body)=>{calls.push({path,body});return{challenge_id:"isolated-challenge",expires_in:300};}});
  return{elements,send:slots["[data-email-send]"],status:slots["[data-email-status]"],calls,complete:token=>complete(token)};
}
test("Send code waits for background security once, blocks duplicate clicks, then sends automatically",async t=>{
  const h=harness(t),request=h.send.listeners.click();
  assert.equal(h.send.disabled,true);assert.match(h.status.textContent,/Verifying your connection/);
  await h.send.listeners.click();assert.equal(h.calls.length,0);
  h.complete("isolated-security-token");await request;
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].body.turnstile_token,"isolated-security-token");
  assert.match(h.status.textContent,/Code sent/);
});
test("editing email while background security runs never sends to the old or new email",async t=>{
  const h=harness(t),request=h.send.listeners.click();
  h.elements.email.value="changed@example.invalid";h.elements.email.listeners.input();
  h.complete("isolated-security-token");await request;
  assert.equal(h.calls.length,0);assert.equal(h.send.disabled,false);
});
test("failed background security does not send a code or ask shoppers to configure anything",async t=>{
  const h=harness(t),request=h.send.listeners.click();h.complete("");await request;
  assert.equal(h.calls.length,0);assert.equal(h.send.disabled,false);
  assert.match(h.status.textContent,/try again shortly/);assert.doesNotMatch(h.status.textContent,/Cloudflare|configure|Complete the security/);
});
