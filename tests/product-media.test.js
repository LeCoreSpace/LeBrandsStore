import test from "node:test";
import assert from "node:assert/strict";
import {MEDIA_LIMITS,validateFile,validateDimensions,layoutImage,outputSize,encodeWebp} from "../src/public/product-media-processing.js";
import {productVideo,SECTION_RENDERERS} from "../src/public/aura-sections.js";
import {productPatch} from "../src/store/input.js";
import {validateProduct} from "../src/public/validation.js";
import {SECURITY_HEADERS} from "../src/auth/security.js";
import {renderAura} from "../src/public/aura.js";
import {STYLE_IDS} from "../src/public/aura-styles.js";

const STORE="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",IMAGE="11111111-1111-4111-8111-111111111111",VIDEO="22222222-2222-4222-8222-222222222222";
test("image and video limits are explicit and unsupported/empty/oversized uploads are rejected",()=>{
  for(const type of [...MEDIA_LIMITS.imageTypes,...MEDIA_LIMITS.videoTypes]){
    assert.equal(validateFile({type,size:100,name:"sample"}).ok,true);
    assert.equal(validateFile({type,size:0,name:"empty"}).ok,false);
    assert.equal(validateFile({type,size:MEDIA_LIMITS.maxBytes+1,name:"large"}).ok,false);
  }
  assert.equal(validateFile({type:"image/svg+xml",size:100,name:"active.svg"}).ok,false);
  assert.ok(validateDimensions(20001,500));assert.ok(validateDimensions(10000,10000));
  assert.equal(validateDimensions(1200,1500),"");
});
test("4:5 cropping clamps pan, preserves all pixels in fit, and never upscales the source",()=>{
  const fit={fit:true,zoom:1,ox:400,oy:400};
  assert.deepEqual({...layoutImage(1000,500,320,400,fit)},{
    scale:.32,dw:320,dh:160,ox:0,oy:0,x:0,y:120,mx:0,my:0});
  for(const [w,h] of [[1000,500],[1000,2000],[499,777],[1200,1500],[4000,3000]]){
    for(const state of [fit,{fit:false,zoom:1,ox:1e6,oy:-1e6},{fit:false,zoom:4,ox:0,oy:0}]){
      const l=layoutImage(w,h,320,400,state),out=outputSize(w,h,320,400,state);
      assert.equal(out.w*5,out.h*4);assert.ok(out.w<=1200&&out.h<=1500);
      assert.ok(out.w/320*l.scale<=1,"source pixels cannot be enlarged");
      if(!state.fit){assert.ok(l.x<=0&&l.y<=0);assert.ok(l.x+l.dw>=320&&l.y+l.dh>=400);}
    }
  }
  assert.throws(()=>outputSize(1,1,320,400,{fit:false,zoom:4}),/too small/);
});
test("image encoding reports real WebP support and does not pretend a PNG is WebP",async()=>{
  const canvas={toBlob:fn=>fn(new Blob(["webp"],{type:"image/webp"}))};
  assert.equal((await encodeWebp(canvas)).webp,true);
  const png={toBlob:fn=>fn(new Blob(["png"],{type:"image/png"}))};
  assert.equal((await encodeWebp(png)).webp,false);
});
test("storefront product videos have real playback controls and cannot use arbitrary URLs",()=>{
  const media={id:VIDEO,type:"video",url:`https://media.lebrands.store/stores/${STORE}/${VIDEO}.webm`,alt:'Product <clip> "label"'};
  const html=productVideo(media);
  assert.match(html,/<video[^>]+controls playsinline preload="metadata"/);
  assert.match(html,/type="video\/webm"/);assert.match(html,/&lt;clip&gt;/);
  assert.doesNotMatch(html,/<img|data-gallery-image/);
  for(const url of ["javascript:alert(1)","https://example.com/clip.webm","https://media.lebrands.store/private/video.webm"])
    assert.equal(productVideo({...media,url}),"");
  assert.equal(productVideo({...media,type:"image"}),"");
  const product={id:IMAGE,title:"Serum",images:[{id:IMAGE,url:`https://media.lebrands.store/stores/${STORE}/${IMAGE}.webp`},media]};
  const rendered=SECTION_RENDERERS["product-details"]({}, {product,options:{commerce:false},renderDescription:v=>v,products:[]});
  assert.match(rendered,/<img[^>]+data-gallery-image="0"/);assert.match(rendered,/<video/);
});
test("the existing ID-based tenant boundary remains unchanged and video cannot be a cover",()=>{
  const images=[{id:IMAGE,alt:"Cover"},{id:VIDEO,alt:"Clip"}];
  assert.deepEqual(productPatch({images}).images,images);
  assert.throws(()=>productPatch({images:[{id:IMAGE,url:"https://evil.example/image"}]}),/uploaded/);
  assert.throws(()=>productPatch({images:Array(9).fill(images[0])}),/8/);
  assert.match(validateProduct({images:[{id:VIDEO,type:"video"}]}).images,/cover/);
  assert.match(SECURITY_HEADERS["content-security-policy"],/media-src 'self' blob: https:\/\/media.lebrands.store/);
  assert.match(SECURITY_HEADERS["content-security-policy"],/connect-src 'self';/);
});
test("every saved Ann design renders a real product video without turning it into an image",()=>{
  const p={id:IMAGE,slug:"serum",status:"active",title:"Serum",description:"Product details.",price_paise:10000,collection_ids:[],images:[
    {id:IMAGE,type:"image",url:`https://media.lebrands.store/stores/${STORE}/${IMAGE}.webp`},
    {id:VIDEO,type:"video",url:`https://media.lebrands.store/stores/${STORE}/${VIDEO}.webm`,alt:"Serum video"},
  ]};
  for(const style of STYLE_IDS){
    const html=renderAura({store:{name:"Example",subdomain:"example"},settings:{ann_design:{version:1,style,copy:{},media:{}}},
      products:[p],collections:[],policies:[]},{page:"product",productId:IMAGE});
    assert.match(html,/<video[^>]+controls/,style);
    assert.doesNotMatch(html,/<img[^>]+src="[^"]+\.webm"/,style);
  }
});
