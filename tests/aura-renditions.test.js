import test from "node:test";
import assert from "node:assert/strict";
import {validateLayoutMedia} from "../src/public/aura-layout.js";
import {renderAura} from "../src/public/aura.js";
import {exampleFixture,EXAMPLE_STORE_ID} from "../src/local-example-fixture.js";
import {defaultPageLayouts} from "../src/public/aura-layout.js";
const url=width=>`https://media.lebrands.store/stores/${EXAMPLE_STORE_ID}/00000000-0000-4000-8000-${String(width).padStart(12,"0")}.webp`;
test("image renditions validate known dimensions, ownership and aspect ratio",()=>{
 const image={url:url(1600),alt:"Actual product photograph",width:1600,height:2000,sources:[{url:url(640),width:640,height:800},{url:url(1024),width:1024,height:1280}]};
 assert.deepEqual(validateLayoutMedia(image,"image",{storeId:EXAMPLE_STORE_ID}),image);
 for(const source of [
  {url:url(640),width:640,height:400},
  {url:url(1600),width:1600,height:2000},
  {url:url(640).replace(EXAMPLE_STORE_ID,"22222222-2222-4222-8222-222222222222"),width:640,height:800},
  {url:url(640),width:640,height:800,script:"bad"}
 ])assert.throws(()=>validateLayoutMedia({...image,sources:[source]},"image",{storeId:EXAMPLE_STORE_ID}));
 assert.throws(()=>validateLayoutMedia({...image,sources:[image.sources[0],image.sources[0]]},"image",{storeId:EXAMPLE_STORE_ID}));
});
test("Aura emits real multi-source srcset, never different widths for identical URLs",()=>{
 const data=exampleFixture();data.layouts=defaultPageLayouts(data);
 data.layouts.home.find(s=>s.type==="hero").settings.image={url:url(1600),alt:"Actual photo",width:1600,height:2000,sources:[{url:url(640),width:640,height:800},{url:url(1024),width:1024,height:1280}]};
 const html=renderAura(data,{page:"home"});
 assert.ok(html.includes(`${url(640)} 640w, ${url(1024)} 1024w, ${url(1600)} 1600w`));
 assert.ok(html.includes('width="1600" height="2000"'));
});
