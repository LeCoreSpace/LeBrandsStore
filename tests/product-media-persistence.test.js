import test from "node:test";
import assert from "node:assert/strict";
import {setupBusinessReviewFixture,REVIEW_FIXTURE_STORE as STORE} from "../src/business-review-preview-fixture.js";
import {saveProduct,loadDraft,insertMedia} from "../src/store/repository.js";

test("product images and videos persist in order, with tenant and cover guards",async()=>{
  const f=await setupBusinessReviewFixture();
  const product="eeeeeeee-1111-4111-8111-111111111111";
  let image,video,other;
  try{
    await f.pg.query(`INSERT INTO public.products(id,store_id,title,slug,description,sku,price_paise,hsn_code,gst_rate)
      VALUES($1,$2,'Product media test','product-media-test','A complete description for the product media test.','MEDIA-TEST',10000,'33049900',18)`,[product,STORE]);
    await f.db.withMemberStore(STORE,f.ownerToken,async tx=>{
      image=await insertMedia(tx,STORE,`stores/${STORE}/11111111-1111-4111-8111-111111111111.webp`,"image",100,{contentType:"image/webp",width:1200,height:1500},"Cover");
      video=await insertMedia(tx,STORE,`stores/${STORE}/22222222-2222-4222-8222-222222222222.webm`,"video",200,{contentType:"video/webm",width:null,height:null},"Clip");
      other=await insertMedia(tx,STORE,`stores/${STORE}/33333333-3333-4333-8333-333333333333.webp`,"image",100,{contentType:"image/webp",width:800,height:1000},"Second image");
    });
    const images=[{id:image.id,alt:"Cover"},{id:video.id,alt:"Clip"},{id:other.id,alt:"Other"}];
    await f.db.withMemberStore(STORE,f.ownerToken,tx=>saveProduct(tx,STORE,product,{images},{tokenHash:f.ownerToken}));
    const saved=await f.db.withMemberStore(STORE,f.ownerToken,tx=>loadDraft(tx,STORE));
    const record=saved.products.find(p=>p.id===product);
    assert.deepEqual(record.images.map(m=>m.id),images.map(m=>m.id));
    assert.equal(record.images[1].type,"video");assert.match(record.images[1].url,/\.webm$/);
    assert.equal(record.images[0].width,1200);assert.equal(record.images[0].height,1500);
    await assert.rejects(f.db.withMemberStore(STORE,f.ownerToken,tx=>saveProduct(tx,STORE,product,{
      images:[images[1],images[0]]},{tokenHash:f.ownerToken})),/first product media/);
    await assert.rejects(f.db.withMemberStore(STORE,f.ownerToken,tx=>saveProduct(tx,STORE,product,{
      images:[{id:"ffffffff-ffff-4fff-8fff-ffffffffffff",alt:"Unknown"}]},{tokenHash:f.ownerToken})),/uploaded to this store/);
    const after=await f.db.withMemberStore(STORE,f.ownerToken,tx=>loadDraft(tx,STORE));
    assert.deepEqual(after.products.find(p=>p.id===product).images.map(m=>m.id),images.map(m=>m.id),
      "rejected changes must not delete existing product media");
    await f.db.withMemberStore(STORE,f.ownerToken,tx=>saveProduct(tx,STORE,product,{
      images:[images[2],images[0]]},{tokenHash:f.ownerToken}));
    const reordered=await f.db.withMemberStore(STORE,f.ownerToken,tx=>loadDraft(tx,STORE));
    assert.deepEqual(reordered.products.find(p=>p.id===product).images.map(m=>m.id),[other.id,image.id]);
  }finally{await f.pg.close();}
});
