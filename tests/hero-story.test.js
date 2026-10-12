import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { renderHome } from "../src/ui/marketing.js";
import worker from "../src/index.js";

test("black hero explains current features and keeps all slides readable without JS", async () => {
  const html = renderHome().match(/<section class="m-hero"[\s\S]*?<\/section>/)[0];
  assert.equal((html.match(/data-hs-slide\b/g) || []).length, 6);
  assert.equal((html.match(/Sample UI, illustrative/g) || []).length, 4);
  assert.equal((html.match(/\bdata-hero-line\b/g) || []).length, 1);
  assert.doesNotMatch(html, /class="m-hero-(?:lede|summary|points|soon)"/);
  assert.equal((html.match(/data-hs-line="/g) || []).length, 6);
  assert.equal((html.match(/<span class="m-hs-tag">Integration setup, illustrative<\/span>/g) || []).length, 2);
  assert.match(html, /Razorpay/);
  assert.match(html, /logistics partners/i);
  assert.match(renderHome(), /src="\/img\/REPLACE-lebrands-hero-transparent\.png"/);
  assert.match(html, /First publication requires platform approval/);
  const css = await readFile("src/public/marketing.css", "utf8");
  assert.match(css, /section\.m-hero\s*\{[\s\S]*?background:\s*#09090a/);
  assert.match(css, /\.m-hs:not\(\.is-enhanced\) \.m-hs-slide\[hidden\]\s*\{\s*display: block/);
  assert.match(css, /\.m-hero\.is-paused \*, \.m-page-hidden \.m-hero \*[\s\S]*?animation-play-state: paused/);
  assert.match(html, /m-hs-chrome/);
  assert.match(html, /Sample data, illustrative/);
  assert.match(css, /transform-style:\s*preserve-3d/);
  assert.match(css, /m-hs-progress 6\.5s linear forwards/);
  assert.match(css, /m-hs-draw 1\.6s ease-out \.15s forwards/);
  assert.match(css, /m-hs-dot 3\.2s ease-in-out 1s infinite/);
  assert.match(css, /\.m-hero\.is-paused \*::before, \.m-hero\.is-paused \*::after \{ animation-play-state: paused/);
  const integrationSlides=[...html.matchAll(/<article\b[^>]*data-hs-slide\b[^>]*>[\s\S]*?<\/article>/g)]
    .map(([slide])=>slide).slice(4);
  for(const slide of integrationSlides) {
    assert.doesNotMatch(slide,/Coming soon|not enabled yet/i);
    assert.match(slide,/Contact us to discuss your setup/);
  }
});

test("each hero feature has a distinct gated flying entrance with a readable resting state", async () => {
  const css = await readFile("src/public/marketing.css", "utf8");
  assert.match(renderHome(), /class="m-hs-scene"/);
  assert.match(css, /\.m-section-active \.m-hs-scene \{ animation: m-scene-enter 1\.7s/);
  assert.match(css, /\.m-section-active \.m-hs-slide\.is-active \.m-hs-card \{ animation-duration: 1\.35s/);
  for(let i=1;i<=6;i++) {
    assert.ok(css.includes(`.m-section-active .m-hs-slides > .m-hs-slide:nth-child(${i}).is-active .m-hs-card { animation-name: m-fly-${i};`));
    const keyframes=css.match(new RegExp(`@keyframes m-fly-${i} \\{[\\s\\S]*?\\n\\}`))?.[0];
    assert.ok(keyframes, `Feature ${i} has a flight animation`);
    assert.match(keyframes,/rotate[XYZ]\(/);
    assert.match(keyframes,/100% \{ opacity: 1; transform: perspective\(900px\) translate3d\(0,0,0\)/);
  }
  assert.match(css,/\.m-hero\.is-paused \.m-hs-scene[\s\S]*?\{ animation: none !important; \}/);
  assert.match(css,/@media \(max-width: 600px\) \{ \.m-hs-scene \{ --d: \.36; --r: \.55;/);
});

test("hero slides advance, wrap, select and pause; autoplay respects visibility and motion preferences", async () => {
  const source = await readFile("src/public/marketing.js", "utf8");
  const functionSource = source.slice(source.indexOf("  function initializeHeroStory()"), source.indexOf("  function setNavTone()"));
  function node() {
    const classes = new Set();
    return { hidden:false, attrs:{}, events:{}, textContent:"", classList:{
      add(name){classes.add(name);},
      remove(name){classes.delete(name);},
      contains(name){return classes.has(name);},
      toggle(name,on){if(on)classes.add(name);else classes.delete(name);},
    },setAttribute(name,value){this.attrs[name]=value;},getAttribute(name){return this.attrs[name];},
    addEventListener(name,fn){this.events[name]=fn;} };
  }
  const slides = Array.from({length:6},node), tabs = Array.from({length:6},node);
  slides.forEach((slide,i)=>{
    slide.attrs["aria-label"]=`${i+1} of 6: Feature ${i+1}`;
    slide.attrs["data-hs-line"]=`Sentence ${i+1}`;
  });
  const toggle=node(), prev=node(), next=node(), live=node(), hero=node(), story=node();
  const line=node();
  hero.classList.add("m-section-active");
  story.closest=()=>hero;
  story.querySelectorAll=(selector)=>selector==="[data-hs-slide]" ? slides : tabs;
  story.querySelector=(selector)=>({"[data-hs-toggle]":toggle,"[data-hs-prev]":prev,"[data-hs-next]":next,"[data-hs-live]":live})[selector];
  const document={hidden:false,querySelector:(selector)=>selector==="[data-hero-line]" ? line : story}, motionPreference={matches:false};
  const context={document,motionPreference,motionDisabled:false};
  runInNewContext(`${functionSource}\ninitializeHeroStory();`,context);
  const active=()=>slides.findIndex((slide)=>!slide.hidden);
  const finish=()=>story.events.animationend({animationName:"m-hs-progress"});
  assert.equal(active(),0);
  assert.equal(line.textContent,"Sentence 1");
  finish();assert.equal(active(),1);
  assert.equal(line.textContent,"Sentence 2","The left-side sentence follows autoplay");
  assert.equal(live.textContent,"","Automatic slides must not repeatedly announce themselves");
  prev.events.click();assert.equal(active(),0);
  prev.events.click();assert.equal(active(),5);
  assert.equal(line.textContent,"Sentence 6","The left-side sentence follows manual selection");
  tabs[2].events.click();assert.equal(active(),2);
  assert.match(live.textContent,/Feature 3/);
  toggle.events.click();assert.equal(toggle.textContent,"Play");finish();assert.equal(active(),2);
  toggle.events.click();assert.equal(toggle.textContent,"Pause");finish();assert.equal(active(),3);
  document.hidden=true;finish();assert.equal(active(),3);document.hidden=false;
  hero.classList.toggle("m-section-active",false);finish();assert.equal(active(),3);
  hero.classList.add("m-section-active");motionPreference.matches=true;finish();assert.equal(active(),3);
  motionPreference.matches=false;context.motionDisabled=true;finish();assert.equal(active(),3);
  tabs[5].events.click();assert.equal(active(),5);
  next.events.click();assert.equal(active(),0,"Manual controls still work with motion disabled");
});

test("transparent hero logo exists and is served by the production asset allowlist", async () => {
  const path="/img/REPLACE-lebrands-hero-transparent.png";
  const bytes=await readFile(`src/public${path}`);
  assert.equal(bytes[25],6,"The PNG must retain its RGBA transparency channel");
  assert.ok(bytes.length<200000,"The header logo stays lightweight");
  let fetched="";
  const response=await worker.fetch(new Request(`https://lebrands.store${path}`),{
    ASSETS:{fetch(request){fetched=new URL(request.url).pathname;return new Response(bytes,{headers:{"content-type":"image/png"}});}}
  },{});
  assert.equal(response.status,200);
  assert.equal(fetched,path);
  assert.equal(response.headers.get("content-type"),"image/png");
});
