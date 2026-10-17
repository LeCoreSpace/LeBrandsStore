import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ANN_HINDI,annConversationText,readAnnLanguage,attachAnnLanguage} from "../src/public/ann-language.js";

test("the Hindi asset is served without removing existing starter dependencies",()=>{
  const assets=readFileSync("src/index.js","utf8").split("\n").find(line=>line.includes("const starterAsset ="));
  for(const asset of ["ann-language.js","aura-starters.js","aura-starter-data.js","aura-starter-assets.js","ann-menu-model.js"])assert.ok(assets.includes(`"${asset}"`),asset);
});
test("every static Ann question has a Hindi translation, including the invoice lock warning",()=>{
  const source=readFileSync("src/public/ann-builder.js","utf8");
  const definition=source.slice(source.indexOf("function def("),source.indexOf("function productHints("));
  const questions=[...definition.matchAll(/\bq: "([^"]+)"/g),...definition.matchAll(/\bsel\("[^"]+", "([^"]+)"/g),...definition.matchAll(/\btxt\("[^"]+", "[^"]+", "([^"]+)"/g)].map(m=>m[1]);
  assert.ok(questions.length>=14);
  for(const question of questions)assert.match(annConversationText(question,"hi"),/[\u0900-\u097f]/,question);
  const warning=readFileSync("src/public/ann-onboarding-ui.js","utf8").match(/export const GST_COPY = "([^"]+)"/)[1];
  assert.match(annConversationText(warning,"hi"),/कभी बदला नहीं/);
  for(const [english,hindi] of Object.entries(ANN_HINDI)){
    assert.equal(annConversationText(english,"en"),english);
    assert.match(hindi,/[\u0900-\u097f]/);
    assert.doesNotMatch(hindi,/[✨—]/);
  }
});
test("dynamic Ann questions preserve merchant names exactly and do not translate arbitrary records",()=>{
  const brand='Stone & <Studio> தமிழ்',collection="Wedding collection",product="Serum 30ml";
  assert.ok(annConversationText(`Add a logo for ${brand}. No logo yet? We'll use your brand name.`,"hi").includes(brand));
  assert.ok(annConversationText(`What goes in ${collection}? Pick up to five products, or type your own.`,"hi").includes(collection));
  assert.ok(annConversationText(`What should "${product}" be called?`,"hi").includes(product));
  assert.match(annConversationText("Lovely! Which type of Fashion do you sell?","hi"),/Fashion/);
  for(const value of ["33ABLCS0390L1Z2","012345","0, K.P Road, Nagercoil 629003","constructor","toString","Unmapped service error"])assert.equal(annConversationText(value,"hi"),value);
  assert.equal(annConversationText("Working on it...","ta"),"Working on it...");
  assert.equal(annConversationText("  Working on it...\n","hi"),"  थोड़ा इंतज़ार करें...\n");
});
test("language preferences validate values and tolerate blocked storage",()=>{
  const storage={getItem:()=>"hi"};
  assert.equal(readAnnLanguage(storage,"key"),"hi");
  assert.equal(readAnnLanguage(storage,"key","en"),"en");
  assert.equal(readAnnLanguage({getItem:()=>"xx"},"key"),"en");
  assert.equal(readAnnLanguage({getItem(){throw Error("Blocked");}},"key"),"en");
});
test("switching is reversible, preserves user records, and translates new messages without redraw or API calls",()=>{
  const sentence=Object.keys(ANN_HINDI)[0],stored=new Map(),events=new Map();
  let disconnected=false;
  const paragraph=(text,{user=false,protectedValue=false}={})=>{
    const node={nodeType:3,textContent:text};
    return {node,childNodes:[node],closest:selector=>selector===".ann-msg"?{classList:{contains:()=>user}}:protectedValue?{}:null};
  };
  const question=paragraph(sentence),reply=paragraph(sentence,{user:true}),legal=paragraph("0, K.P Road",{protectedValue:true});
  const paragraphs=[question,reply,legal],input={value:"Unsent brand name"};
  const view={localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},location:{href:"https://example.invalid/build?launch=1"},
    history:{state:null,replaceState(_state,_title,url){view.location.href=String(url);}},
    MutationObserver:class{observe(){}disconnect(){disconnected=true;}}};
  const root={ownerDocument:{defaultView:view},dataset:{},querySelectorAll:()=>paragraphs};
  const select={value:"en",addEventListener:(k,fn)=>events.set(k,fn),removeEventListener:k=>events.delete(k)};
  const controller=attachAnnLanguage({root,select,storageKey:"store-key"});
  select.value="hi";events.get("change")();
  assert.equal(question.node.textContent,ANN_HINDI[sentence]);
  assert.equal(reply.node.textContent,sentence);
  assert.equal(legal.node.textContent,"0, K.P Road");
  assert.equal(input.value,"Unsent brand name");
  assert.equal(stored.get("store-key"),"hi");
  assert.match(view.location.href,/launch=1/);
  assert.match(view.location.href,/ann_lang=hi/);
  paragraphs.push(paragraph("Working on it..."));controller.refresh();
  assert.equal(paragraphs.at(-1).node.textContent,"थोड़ा इंतज़ार करें...");
  select.value="en";events.get("change")();
  assert.equal(question.node.textContent,sentence);
  assert.equal(paragraphs.at(-1).node.textContent,"Working on it...");
  controller.destroy();assert.equal(disconnected,true);
});
