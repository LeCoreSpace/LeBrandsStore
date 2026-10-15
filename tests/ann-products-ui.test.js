import test from "node:test";
import assert from "node:assert/strict";
import {attachAnnProducts} from "../src/public/ann-products-ui.js";
const one="dddddddd-dddd-4ddd-8ddd-dddddddddddd",two="cccccccc-cccc-4ccc-8ccc-cccccccccccc",photo="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const product=id=>({id,title:"Cotton shirt",description:"Thoughtful cotton clothing for daily wear.",price_paise:129909,compare_at_paise:null,
  sku:"ORIGINAL",tags:[],stock:7,hsn_code:"6205",gst_rate:12,images:[{id:photo,alt:"Cotton",url:"/sample.webp"}],errors:{}});
function harness(readOnly=false){
  const before=globalThis.document,events=new Map(),requests=[];
  globalThis.document={querySelector:()=>({contains:()=>true}),addEventListener:(name,fn)=>{
    const list=events.get(name)||[];list.push(fn);events.set(name,list);
  }};
  let data={products:[product(one),product(two)],image_media:[]};
  const ui=attachAnnProducts({api:"/sample/api",readOnly,onDraw:()=>{},
    submit:async(section,body,onOk)=>{requests.push(body);onOk();}});
  ui.receive(data);ui.render(data);
  const emit=(type,dataset,extra={})=>{
    const target={dataset,tagName:"INPUT",type:"text",value:"",...extra};
    for(const fn of events.get(type)||[])fn({target,preventDefault(){}});
  };
  const field=(id,key,value)=>emit("input",{pdF:key,id},{value});
  const ack=id=>emit("change",{pdAck:"1",id},{type:"checkbox",checked:true});
  const click=(id,action)=>{const target={tagName:"BUTTON",dataset:{pd:action,id},closest(){return this;}};
    for(const fn of events.get("click")||[])fn({target,preventDefault(){}});
  };
  return{ui,requests,field,ack,click,emit,get data(){return data;},set data(v){data=v;},
    close(){globalThis.document=before;}};
}
test("Ann product form sends only confirmed changed fields, exact paise, and never rewrites legacy GST or stock",()=>{
  const h=harness();
  try{
    h.field(one,"price","1299.10");h.click(one,"save");assert.equal(h.requests.length,0);
    h.ack(one);h.field(one,"sku","");h.click(one,"save");assert.equal(h.requests.length,0);
    h.ack(one);h.click(one,"save");
    assert.deepEqual(h.requests[0].product.patch,{price_paise:129910,sku:""});
    assert.ok(!("gst_rate" in h.requests[0].product.patch));assert.ok(!("stock" in h.requests[0].product.patch));
    h.ui.receive(h.data,{reset:true});h.field(one,"gst","28");h.ack(one);h.click(one,"save");
    assert.equal(h.requests.length,1);
    h.ui.receive(h.data,{reset:true});h.field(one,"price","1e3");h.ack(one);h.click(one,"save");
    assert.equal(h.requests.length,1);
    assert.match(h.ui.render(h.data),/legacy GST rate of 12/);
  }finally{h.close();}
});
test("Ann product sibling refresh preserves typed edits but adopts untouched prices and shared-photo descriptions",()=>{
  const h=harness();
  try{
    h.field(two,"title","My edited second product");
    h.data={...h.data,products:h.data.products.map(p=>p.id===two?{...p,price_paise:300000,images:[{...p.images[0],alt:"Updated shared description"}]}:p)};
    h.ui.receive(h.data);h.ack(two);h.click(two,"save");
    assert.deepEqual(h.requests[0].product.patch,{title:"My edited second product"});
    assert.match(h.ui.render(h.data),/3000.00/);assert.match(h.ui.render(h.data),/Updated shared description/);
  }finally{h.close();}
});
test("Ann readonly blocks product changes, and an unchanged zero-price draft can still save other corrections",()=>{
  const ro=harness(true);
  try{ro.field(one,"title","Not allowed");ro.ack(one);ro.click(one,"save");assert.equal(ro.requests.length,0);}finally{ro.close();}
  const h=harness();
  try{
    h.data={...h.data,products:[{...product(one),price_paise:0,gst_rate:null}]};h.ui.receive(h.data,{reset:true});
    h.field(one,"hsn","6109");h.field(one,"gst","0");h.ack(one);h.click(one,"save");
    assert.deepEqual(h.requests[0].product.patch,{hsn_code:"6109",gst_rate:0});
  }finally{h.close();}
});
test("Ann photo upload retains selected files and unsaved edits, and requires a later product confirmation",async()=>{
  const h=harness(),before=globalThis.fetch;
  try{
    const file=new File(["sample"],"sample.webp",{type:"image/webp"});
    h.emit("change",{pdFile:"1",id:one},{type:"file",files:[file]});
    assert.equal(h.ui.hasUnsavedChanges(),true);
    h.field(one,"description","Unsaved merchant description that must stay.");
    globalThis.fetch=async(url,options)=>{
      assert.equal(url,"/sample/api/media");assert.equal(options.body.get("type"),"image");
      assert.equal(options.body.get("file").name,"sample.webp");assert.equal(options.headers,undefined);
      return new Response(JSON.stringify({media:{id:"ffffffff-ffff-4fff-8fff-ffffffffffff",url:"/new.webp",alt:"New photo"}}),{status:200});
    };
    h.click(one,"upload");await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.ui.isUploading(),false);assert.equal(h.requests.length,0);
    assert.match(h.ui.render(h.data),/Unsaved merchant description/);assert.match(h.ui.render(h.data),/Photo uploaded/);
    h.click(one,"save");assert.equal(h.requests.length,0);
    h.ack(one);h.click(one,"save");
    assert.equal(h.requests[0].product.patch.images.length,2);
    assert.equal(h.requests[0].product.patch.description,"Unsaved merchant description that must stay.");
  }finally{globalThis.fetch=before;h.close();}
});
