import {renderSectionInstance,SECTION_INSTANCE_CSS} from "./section-instances.js";
import {applyDesignContent} from "./ann-section-content.js";
import {applyRichDesignText} from "./ann-rich-text.js";
import {validSectionLayout} from "./section-layouts.js";
import {INSTANCE_ID} from "./section-instance-model.js";

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const previewId="slot-library-00000000000000000000000000000000-0";
const color=v=>/^#[a-f0-9]{3}(?:[a-f0-9]{3})?$/i.test(v||"")?v:null;
export function renderSectionLayoutPreview({data={},design={},page="home",instance,layout="original",productId,collectionId}={}){
  if(!instance||!validSectionLayout(instance.family,layout))return "";
  const item={version:1,...structuredClone(instance),id:INSTANCE_ID.test(instance.id||"")?instance.id:previewId};
  if(layout==="original")delete item.layout;else item.layout=layout;
  const source={...data,settings:{...data.settings,ann_design:design}};
  let body=renderSectionInstance(item,source,{page,productId,collectionId,designEdit:true});
  if(!body)body='<p class="preview-empty">Choose a product or collection to preview this layout.</p>';
  const core=["product","contact"].includes(page)?'<section data-preview-core="true" hidden></section>':"";
  body=applyRichDesignText(applyDesignContent(`<main>${core}${body}</main>`,design,page,false),design).replace(core||"\u0000","");
  const settings={...data.settings,...design.plan},palette={ivory:["#f6f0e6","#29241e"],stone:["#e9e8e4","#252723"],midnight:["#12151d","#eeeef2"]}[settings.color_preset]||["#ffffff","#202323"];
  const accent=color(settings.accent_color)||"#74213d",bg=color(settings.background_color)||palette[0],fg=color(settings.text_color)||palette[1];
  // A script-free preview of the same trusted renderer used by live sections.
  // The dialog iframe sandbox also prevents navigation and form submission.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; font-src 'self' https: http:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${esc(item.family)} layout preview</title><style>@font-face{font-family:"Instrument Sans";src:url(/assets/instrument-sans-latin.woff2) format("woff2");font-weight:400 700;font-display:swap}:root{--acc:${accent};--accent:${accent};--bg:${bg};--ink:${fg};color:${fg};background:${bg};font-family:"Instrument Sans",system-ui,sans-serif}*{box-sizing:border-box}html,body{margin:0;min-width:0}a,button,summary{pointer-events:none}main{overflow-wrap:anywhere}.preview-empty{padding:24px;font-size:14px}img,video{max-width:100%}${SECTION_INSTANCE_CSS}</style></head><body>${body}</body></html>`;
}
