import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { renderHome } from "../src/ui/marketing.js";

test("black hero explains current features and keeps all slides readable without JS", async () => {
  const html = renderHome().match(/<section class="m-hero"[\s\S]*?<\/section>/)[0];
  assert.equal((html.match(/data-hs-slide\b/g) || []).length, 4);
  assert.equal((html.match(/Sample UI, illustrative/g) || []).length, 4);
  assert.match(html, /run the catalogue, cash on delivery orders, customers and GST invoices from one place/);
  assert.match(html, /Coming soon[\s\S]*Razorpay online payments and logistics integrations/);
  assert.match(html, /First publication requires platform approval/);
  const css = await readFile("src/public/marketing.css", "utf8");
  assert.match(css, /section\.m-hero\s*\{[\s\S]*?background:\s*#09090a/);
  assert.match(css, /\.m-hs:not\(\.is-enhanced\) \.m-hs-slide\[hidden\]\s*\{\s*display: block/);
  assert.match(css, /\.m-hero\.is-paused \*, \.m-page-hidden \.m-hero \*[\s\S]*?animation-play-state: paused/);
});

test("hero slides advance, wrap, select and pause; autoplay respects visibility and motion preferences", async () => {
  const source = await readFile("src/public/marketing.js", "utf8");
  const functionSource = source.slice(source.indexOf("  function initializeHeroStory()"), source.indexOf("  function setNavTone()"));
  function node() {
    const classes = new Set();
    return { hidden:false, attrs:{}, events:{}, textContent:"", classList:{
      add(name){classes.add(name);},
      contains(name){return classes.has(name);},
      toggle(name,on){if(on)classes.add(name);else classes.delete(name);},
    },setAttribute(name,value){this.attrs[name]=value;},getAttribute(name){return this.attrs[name];},
    addEventListener(name,fn){this.events[name]=fn;} };
  }
  const slides = Array.from({length:4},node), tabs = Array.from({length:4},node);
  slides.forEach((slide,i)=>slide.attrs["aria-label"]=`${i+1} of 4: Feature ${i+1}`);
  const toggle=node(), prev=node(), next=node(), live=node(), hero=node(), story=node();
  hero.classList.add("m-section-active");
  story.closest=()=>hero;
  story.querySelectorAll=(selector)=>selector==="[data-hs-slide]" ? slides : tabs;
  story.querySelector=(selector)=>({"[data-hs-toggle]":toggle,"[data-hs-prev]":prev,"[data-hs-next]":next,"[data-hs-live]":live})[selector];
  const document={hidden:false,querySelector:()=>story}, motionPreference={matches:false};
  const context={document,motionPreference,motionDisabled:false};
  runInNewContext(`${functionSource}\ninitializeHeroStory();`,context);
  const active=()=>slides.findIndex((slide)=>!slide.hidden);
  const finish=()=>story.events.animationend({animationName:"m-hs-progress"});
  assert.equal(active(),0);
  finish();assert.equal(active(),1);
  assert.equal(live.textContent,"","Automatic slides must not repeatedly announce themselves");
  prev.events.click();assert.equal(active(),0);
  prev.events.click();assert.equal(active(),3);
  tabs[2].events.click();assert.equal(active(),2);
  assert.match(live.textContent,/Feature 3/);
  toggle.events.click();assert.equal(toggle.textContent,"Play");finish();assert.equal(active(),2);
  toggle.events.click();assert.equal(toggle.textContent,"Pause");finish();assert.equal(active(),3);
  document.hidden=true;finish();assert.equal(active(),3);document.hidden=false;
  hero.classList.toggle("m-section-active",false);finish();assert.equal(active(),3);
  hero.classList.add("m-section-active");motionPreference.matches=true;finish();assert.equal(active(),3);
  motionPreference.matches=false;context.motionDisabled=true;finish();assert.equal(active(),3);
  next.events.click();assert.equal(active(),0,"Manual controls still work with motion disabled");
});
