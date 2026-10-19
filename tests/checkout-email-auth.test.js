import test from "node:test";
import assert from "node:assert/strict";
import {createSkuCheckoutFixture} from "../src/sku-checkout-fixture-data.js";
import {startCheckoutEmail,completeCheckoutEmail,requireCheckoutEmail} from "../src/checkout/email-auth.js";
import {pincodeLocation} from "../src/checkout/pincode.js";
import {orderInput} from "../src/checkout/input.js";
import {handleCheckout} from "../src/checkout/routes.js";

const env={SESSION_SECRET:"synthetic-checkout-verification-secret-for-tests"};
const codeFrom=message=>message.text.match(/Your verification code: (\d{6})/)[1];
test("postal lookup maps the head office and state and fails explicitly",async()=>{
  const result=await pincodeLocation("629001",async()=>Response.json([{PostOffice:[
    {Name:"Other locality",Pincode:"629001",BranchType:"Sub Post Office",State:"Tamil Nadu"},
    {Name:"Nagercoil",Pincode:"629001",BranchType:"Head Post Office",State:"Tamil Nadu"}]}]));
  assert.equal(result.city,"Nagercoil");assert.equal(result.state,"33");
  await assert.rejects(pincodeLocation("111"),e=>e.status===400);
  await assert.rejects(pincodeLocation("999999",async()=>Response.json([{PostOffice:null}])),e=>e.status===404);
  await assert.rejects(pincodeLocation("629001",async()=>{throw new Error();}),e=>e.status===503);
});
test("checkout email verification uses the real schema, commits bad attempts and binds proof",async t=>{
  const f=await createSkuCheckoutFixture({offers:true}),{db,pg,id}=f;
  const messages=[],sendEmail=async(_env,message)=>{messages.push(message);return"test-email";};
  const store={store_id:id,name:"Fixture Store"};
  try{
    let challenge,proof;
    await t.test("send requires configured schema and applies cooldown; OTP is never stored",async()=>{
      challenge=await startCheckoutEmail(db,store,env,"buyer@example.invalid",{sendEmail});
      assert.match(messages[0].html,/checkout verification code/);
      assert.match(messages[0].html,/Email preferences/);
      const row=(await pg.query("SELECT * FROM checkout_email_challenges WHERE id=$1",[challenge.challenge_id])).rows[0];
      assert.notEqual(row.code_hash,codeFrom(messages[0]));
      assert.match(row.code_hash,/^[a-f0-9]{64}$/);
      assert.equal(row.delivered,true);
      await assert.rejects(startCheckoutEmail(db,store,env,"buyer@example.invalid",{sendEmail}),e=>e.status===429);
    });
    await t.test("wrong code consumes a try, correct code verifies once",async()=>{
      const code=codeFrom(messages[0]),wrong=code==="000000"?"000001":"000000";
      await assert.rejects(completeCheckoutEmail(db,id,env,{email:"buyer@example.invalid",challenge_id:challenge.challenge_id,code:wrong}),e=>e.status===400);
      assert.equal((await pg.query("SELECT attempts FROM checkout_email_challenges WHERE id=$1",[challenge.challenge_id])).rows[0].attempts,1);
      proof=await completeCheckoutEmail(db,id,env,{email:"buyer@example.invalid",challenge_id:challenge.challenge_id,code});
      assert.ok(await requireCheckoutEmail(env,id,"BUYER@example.invalid",proof.token));
      await assert.rejects(completeCheckoutEmail(db,id,env,{email:proof.email,challenge_id:challenge.challenge_id,code}),e=>e.status===400);
    });
    await t.test("proof cannot move stores/emails or be forged",async()=>{
      await assert.rejects(requireCheckoutEmail(env,"cccccccc-cccc-4ccc-8ccc-cccccccccccc",proof.email,proof.token),e=>e.status===403);
      await assert.rejects(requireCheckoutEmail(env,id,"other@example.invalid",proof.token),e=>e.status===403);
      await assert.rejects(requireCheckoutEmail(env,id,proof.email,proof.token+"f"),e=>e.status===403);
      await assert.rejects(requireCheckoutEmail(env,id,proof.email,""),e=>e.status===403);
    });
    await t.test("five bad tries lock the challenge, and expired codes fail",async()=>{
      const next=await startCheckoutEmail(db,store,env,"lock@example.invalid",{sendEmail}),code=codeFrom(messages.at(-1));
      for(let i=0;i<5;i++)await assert.rejects(completeCheckoutEmail(db,id,env,{email:"lock@example.invalid",challenge_id:next.challenge_id,code:code==="000000"?"000001":"000000"}));
      await assert.rejects(completeCheckoutEmail(db,id,env,{email:"lock@example.invalid",challenge_id:next.challenge_id,code}),e=>e.status===400);
      const expired=await startCheckoutEmail(db,store,env,"expired@example.invalid",{sendEmail});
      await pg.query("UPDATE checkout_email_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.challenge_id]);
      await assert.rejects(completeCheckoutEmail(db,id,env,{email:"expired@example.invalid",challenge_id:expired.challenge_id,code:codeFrom(messages.at(-1))}));
    });
    await t.test("order endpoint rejects unverified email and accepts a bound proof exactly once",async()=>{
      const variant=f.product.variants.find(v=>v.sku==="SKU-S-WHITE"),origin=`https://${f.data.store.subdomain}.lebrands.store`;
      const body={items:[{product_id:f.product.id,product_option_id:variant.id,quantity:1}],
        contact:{name:"Fixture Buyer",phone:"9000000000",email:proof.email},
        address:{line1:"1 Example street",line2:"",landmark:"",city:"Nagercoil",state:"33",pincode:"629001"},
        idempotency_key:crypto.randomUUID(),receipt_token:"a".repeat(64),turnstile_token:"synthetic"};
      const call=value=>handleCheckout(new Request(`${origin}/api/checkout/order`,{method:"POST",
        headers:{origin,"content-type":"application/json"},body:JSON.stringify(value)}),env,db,store,f.data,{verifyTurnstile:async()=>true});
      assert.throws(()=>orderInput({...body,contact:{...body.contact,email:""}}));
      assert.equal((await call(body)).status,403);
      const accepted=await call({...body,email_verification:proof.token});
      assert.equal(accepted.status,201,await accepted.clone().text());
      assert.equal((await call({...body,email_verification:proof.token})).status,200);
      assert.equal((await pg.query("SELECT count(*)::int n FROM orders")).rows[0].n,1);
    });
  }finally{await pg.close();}
});
