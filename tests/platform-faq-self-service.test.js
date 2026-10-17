import test from "node:test";
import assert from "node:assert/strict";
import {PLATFORM_FAQ} from "../src/ui/platform-seo.js";

test("platform FAQ explains dashboard self-service for payments, delivery and custom domains",()=>{
  const faq=new Map(PLATFORM_FAQ);
  for(const question of ["How do payments work?","How do I set up delivery?","Can I use my own domain?"]){
    const answer=faq.get(question);
    assert.match(answer,/through your dashboard/);
    assert.doesNotMatch(answer,/contact us|not enabled|coming soon|instant/i);
  }
  assert.match(faq.get("How do payments work?"),/brand’s own Razorpay account/);
  assert.match(faq.get("How do I set up delivery?"),/Shiprocket account/);
  assert.match(faq.get("How do I set up delivery?"),/manually/);
  assert.match(faq.get("Can I use my own domain?"),/DNS setup and domain verification/);
});

test("setup FAQ describes guided setup without claiming platform approval is required",()=>{
  const answer=new Map(PLATFORM_FAQ).get("How long does setup take?");
  assert.doesNotMatch(answer,/platform approval/i);
  assert.match(answer,/required setup checks/);
  assert.match(answer,/publish when you are ready/);
});
