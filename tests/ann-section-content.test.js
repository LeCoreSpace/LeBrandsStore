import test from "node:test";
import assert from "node:assert/strict";
import { applyDesignContent } from "../src/public/ann-section-content.js";
import { validateDesignRequest } from "../src/store/ann-design.js";
import { designPreviewData,renderStylePreview } from "../src/public/style-preview.js";
import { STYLE_IDS,styleSettings } from "../src/public/aura-styles.js";
const store="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",media="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const base=()=>({version:1,style:"architectural",catalogue_mode:"sample",plan:{style_preset:"architectural",section_options:{home:["lookbook","craft"]}},copy:{},media:{},sections:{}});
const html='<main><section class="ar-hero"><h1 data-design-copy="title">Headline</h1><p>A lovely introduction</p><img src="/assets/img/sample.webp" alt="Sample"></section><section class="sc-extra" data-section-type="craft"><h2>Craft</h2><p>Details</p></section></main>';
test("section text and media are individually selectable without altering unedited content",()=>{
  const d=base(),out=applyDesignContent(html,d,"home",true);
  assert.match(out,/data-design-section="slot-ar-hero-0"/);
  assert.match(out,/data-design-copy="section.home.slot-ar-hero-0.text0"/);
  assert.match(out,/data-design-image="section.home.slot-ar-hero-0.image0"/);
  assert.match(out,/data-design-video-slot="section.home.slot-ar-hero-0.video0"/);
  assert.match(out,/data-design-copy="title">Headline/);
  assert.match(out,/data-design-copy="section.home.slot-craft-0.text0">Craft/);
  assert.equal(applyDesignContent(out,d,"home",true),out,"Second render must not duplicate annotations");
});
test("section copy and media overrides render in saved/browser/live output without raw HTML",()=>{
  const d=base();
  d.copy["section.home.slot-craft-0.text1"]="Made with care & precision";
  d.media["section.home.slot-ar-hero-0.image0"]={url:`https://media.lebrands.store/stores/${store}/${media}.webp`,media_id:media,alt:"Changed photo"};
  const out=applyDesignContent(html,d);
  assert.match(out,/Made with care &amp; precision/);
  assert.match(out,/alt="Changed photo"/);
  assert.doesNotMatch(out,/data-design-section=/);
  assert.match(out,/Headline/);
});
test("owned video overrides section photo and resetting it restores the photo",()=>{
  const d=base(),key="section.home.slot-ar-hero-0.video0";
  d.media[key]={url:`https://media.lebrands.store/stores/${store}/${media}.mp4`,media_id:media};
  assert.match(applyDesignContent(html,d,"home",true),/<video[^>]+data-design-video="section.home.slot-ar-hero-0.video0"/);
  assert.match(applyDesignContent(html,d),/<video[^>]+controls playsinline/);
  delete d.media[key];
  assert.doesNotMatch(applyDesignContent(html,d),/<video/);
  assert.match(applyDesignContent(html,d),/sample.webp/);
});
test("saved section edits keep bounded validation and reject arbitrary HTML/media paths",()=>{
  const request={confirm:true,expected_draft:"a".repeat(64),
    copy:{"section.home.slot-craft-0.text0":"Our craft"},
    media:{"section.home.slot-lookbook-0.video0":media}};
  assert.equal(validateDesignRequest(request),request);
  for(const copy of [
    {"section.home.slot-craft-0.text0":"<script>alert(1)</script>"},
    {"section.home.slot-craft-0.text60":"Too many fields"},
    {"section.checkout.slot-craft-0.text0":"Unsafe page"},
    {"__proto__.polluted":"x"},
    {"section.home.slot-craft-0.text0":"x".repeat(2001)},
  ])assert.throws(()=>validateDesignRequest({...request,copy}));
  assert.throws(()=>validateDesignRequest({...request,media:{"section.home.slot-craft-0.video0":"https://example.com/movie.mp4"}}));
});
test("all eight styles expose visible editable optional sections and do not mutate source",()=>{
  for(const style of STYLE_IDS){
    const source={store:{store_id:store,name:"Example Studio"},settings:{brand_name:"Example Studio"},products:[],collections:[],layouts:{}};
    const d={...base(),style,plan:{...base().plan,style_preset:style}},before=structuredClone(source);
    const out=renderStylePreview(designPreviewData(source,d),styleSettings(style),{page:"home",designEdit:true});
    assert.match(out,/data-design-section="slot-lookbook-0"/,style);
    assert.match(out,/data-design-copy="section.home.slot-lookbook-0.text0"/,style);
    assert.match(out,/data-design-image="section.home.slot-lookbook-0.image0"/,style);
    assert.match(out,/opacity:1!important/,"Editing must not wait for reveal observers to show sections");
    assert.deepEqual(source,before);
  }
});
