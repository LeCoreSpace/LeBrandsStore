// Merchant navigation belongs to the saved design, never a shared style preset.
export const MAX_MENU_ITEMS=12;
export const MAX_MENU_CHILDREN=8;
const plain=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const esc=v=>String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function validateMenuUrl(value){
  if(typeof value!=="string"||value.length>500)fail("Use a menu destination within 500 characters.");
  const url=value.trim();
  if(!url||/[\u0000-\u0020\u007f\\<>"`]/.test(url))fail("Use a valid menu destination without spaces or markup.");
  let decoded;try{decoded=decodeURIComponent(url);}catch{fail("Check the menu destination's encoding.");}
  if(/[\u0000-\u001f\u007f\\]/.test(decoded))fail("Use a safe menu destination.");
  if(url.startsWith("/")&&!decoded.startsWith("//"))return url;
  if(/^#[a-z0-9][a-z0-9_-]*$/i.test(url))return url;
  if(/^mailto:[^@\s?]+@[^@\s?]+\.[^@\s?]+$/i.test(url))return url;
  if(/^tel:\+?[0-9][0-9()-]{4,24}$/i.test(url))return url;
  try{
    const parsed=new URL(url);
    if(parsed.protocol==="https:"&&parsed.hostname&&!parsed.username&&!parsed.password)return parsed.href;
  }catch{}
  fail("Choose a store page, an HTTPS address, an email address or a phone link.");
}
export function validateDesignMenus(value){
  if(!plain(value)||Object.keys(value).some(k=>!["header","footer"].includes(k)))fail("Use the header and footer menu editor.");
  let count=0;
  const item=(v,child=false)=>{
    if(!plain(v)||Object.keys(v).some(k=>!(child?["label","url"]:["label","url","children"]).includes(k)))fail("Use supported menu link fields.");
    if(typeof v.label!=="string"||![...v.label.trim()].length||[...v.label.trim()].length>60||/[<>\u0000-\u001f\u007f]/.test(v.label))fail("Give each menu link a plain-text name within 60 characters.");
    if(++count>60)fail("Use at most 60 links across your menus.");
    const result={label:v.label.trim(),url:validateMenuUrl(v.url)};
    if(!child&&v.children!==undefined){
      if(!Array.isArray(v.children)||v.children.length>MAX_MENU_CHILDREN)fail("Use at most eight child links in a group.");
      if(v.children.length)result.children=v.children.map(c=>item(c,true));
    }
    return result;
  };
  const result={};
  for(const name of ["header","footer"]){
    if(!Array.isArray(value[name])||value[name].length>MAX_MENU_ITEMS)fail("Use at most 12 top-level links in each menu.");
    result[name]=value[name].map(v=>item(v));
  }
  return result;
}
export function defaultDesignMenus(source={}){
  const header=[{label:"Home",url:"/"},{label:"Shop",url:"/collections/all"},{label:"About",url:"/pages/about"},{label:"Contact",url:"/pages/contact"}];
  const policies=(source.policies||[]).filter(p=>/^[a-z0-9-]+$/.test(p.kind||"")).slice(0,8)
    .map(p=>({label:String(p.title||p.kind).slice(0,60),url:`/policies/${p.kind}`}));
  return {header,footer:[...structuredClone(header),...policies]};
}
export function designMenus(design,source={}){
  return design?.menus==null?defaultDesignMenus(source):validateDesignMenus(design.menus);
}
export function renderDesignMenu(items,{numbered=false,footer=false}={}){
  return items.map((item,index)=>{
    const link=`<a href="${esc(item.url)}">${numbered?`<span>${String(index+1).padStart(2,"0")}</span>`:""}${esc(item.label)}</a>`;
    if(!item.children?.length)return link;
    const children=item.children.map(child=>`<a href="${esc(child.url)}">${esc(child.label)}</a>`).join("");
    return footer?`<div class="ann-menu-footer-group">${link}<div class="ann-menu-footer-children">${children}</div></div>`
      :`<span class="ann-menu-group">${link}<details><summary aria-label="Open ${esc(item.label)} links"><span aria-hidden="true"></span></summary><div class="ann-menu-children">${children}</div></details></span>`;
  }).join("");
}
export const DESIGN_MENU_CSS=`
.ann-menu-group{display:inline-flex;align-items:center;gap:2px;position:relative}
.ann-menu-group>details{position:static}.ann-menu-group summary{display:flex;align-items:center;justify-content:center;width:32px;height:36px;cursor:pointer;list-style:none}
.ann-menu-group summary::-webkit-details-marker{display:none}.ann-menu-group summary span{width:6px;height:6px;border:solid currentColor;border-width:0 1.5px 1.5px 0;transform:rotate(45deg)}
.ann-menu-group details[open] summary span{transform:rotate(225deg)}
.ann-menu-children{position:absolute;z-index:80;top:100%;left:0;min-width:180px;max-width:min(300px,80vw);padding:6px;border:1px solid #ddd;border-radius:8px;background:#fff;color:#222;box-shadow:0 8px 24px #0002}
.ann-menu-children a{display:block!important;padding:10px 12px!important;color:#222!important;font-size:14px!important;line-height:1.4!important;white-space:normal;text-decoration:none!important}
.ann-menu-children a:hover{background:#f3f1f2}.ann-menu-group summary:focus-visible,.ann-menu-children a:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.ann-menu-footer-group{display:flex;flex-direction:column;gap:8px}.ann-menu-footer-children{display:flex;flex-direction:column;gap:8px;padding-left:12px;font-size:.9em}
.sc-menu .ann-menu-group,.au-menu .ann-menu-group{display:flex;flex-wrap:wrap;justify-content:space-between}
.sc-menu .ann-menu-group>details,.au-menu .ann-menu-group>details{position:static}.sc-menu .ann-menu-children,.au-menu .ann-menu-children{position:static;box-shadow:none;margin:4px 0 8px;width:100%}
`;
