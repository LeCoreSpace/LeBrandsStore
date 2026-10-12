import test from "node:test";
import assert from "node:assert/strict";
import {validateUpload,serveMedia} from "../src/store/media.js";
const box=(name,data)=>{const b=new Uint8Array(8+data.length);new DataView(b.buffer).setUint32(0,b.length);b.set(new TextEncoder().encode(name),4);b.set(data,8);return b};
test("hero video uploads validate container, reject HTML and enforce limits",()=>{
 const parts=[box("ftyp",new Uint8Array([105,115,111,109,0,0,0,0,105,115,111,50])),box("moov",new Uint8Array(0)),box("mdat",new Uint8Array(4))];
 const data=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){data.set(p,offset);offset+=p.length}
 assert.equal(validateUpload(data,"video").contentType,"video/mp4");
 assert.throws(()=>validateUpload(new TextEncoder().encode("<html><script></script></html>"),"video"));
 assert.throws(()=>validateUpload(new Uint8Array(10*1024*1024+1),"video"));
 assert.throws(()=>validateUpload(data.slice(0,-2),"video"));
});
test("video range delivery returns correct length, type and partial status",async()=>{
 const key="stores/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.mp4";
 const response=await serveMedia(new Request(`https://media.lebrands.store/${key}`,{headers:{range:"bytes=0-9"}}),{MEDIA:{get:async(k,options)=>{
   assert.equal(k,key);assert.equal(options.range.get("range"),"bytes=0-9");
   return{size:100,httpEtag:'"test"',range:{offset:0,length:10},body:new Uint8Array(10),writeHttpMetadata(){}};
 }}});
 assert.equal(response.status,206);assert.equal(response.headers.get("content-type"),"video/mp4");
 assert.equal(response.headers.get("content-length"),"10");assert.equal(response.headers.get("content-range"),"bytes 0-9/100");
});
