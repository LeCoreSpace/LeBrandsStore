import {commerceError} from "../public/commerce-rules.js";

const xml=v=>String(v??"").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));
const encoder=new TextEncoder(),MAX_BYTES=24*1024*1024;
const decimal=n=>{
  if(n==null)return null;
  if(!Number.isSafeInteger(n))throw commerceError("An export amount is not exact. Narrow the reporting period.",undefined,409);
  return{amount:`${n<0?"-":""}${Math.floor(Math.abs(n)/100)}.${String(Math.abs(n)%100).padStart(2,"0")}`,precise:Math.abs(n)<=999999999999999};
};
const fields={
  sales:[["date","Date"],["orders","Accepted orders"],["all_orders","All orders"],["units","Accepted units"],
    ["gross_merchandise_paise","Gross merchandise"],["discounts_paise","Order discounts"],["reversals_paise","Status-based reversals"],
    ["net_merchandise_paise","Net booked merchandise, tax included"],["booked_order_value_paise","Booked order value, tax and shipping included"]],
  orders:[["order_number","Order number"],["created_at","Ordered at (ISO timestamp)"],["status","Status"],["payment_method","Payment method"],
    ["eligible","Included in booked sales"],["title","Saved product title"],["sku","Saved SKU"],["variant_label","Saved variants"],
    ["quantity","Units"],["unit_price_paise","Unit selling price"],["line_total_paise","Line value before order discounts"],
    ["taxable_paise","Stored taxable line value"],["order_discount_paise","Whole-order discount (do not sum across lines)"],
    ["order_total_paise","Whole-order total (do not sum across lines)"],["unit_cost_paise","Captured unit cost"],
    ["cost_status","Cost evidence"],["estimated_margin_paise","Estimated margin on comparable line"],
    ["order_id","Order ID"],["order_item_id","Order line ID"],["product_id","Product ID"],["product_option_id","SKU ID"]],
  products:[["title","Latest saved product title"],["sku","Latest saved SKU"],["variant_label","Latest saved variants"],["units","Accepted units"],
    ["orders","Accepted orders containing this product/SKU"],["item_value_paise","Item value before order discounts"],
    ["known_units","Units with captured costs"],["comparable_units","Margin-comparable units"],["coverage_percent","Cost coverage percent"],
    ["comparable_revenue_paise","Comparable taxable item value"],["captured_cost_paise","Cost of comparable units"],
    ["estimated_margin_paise","Estimated margin on comparable units"],["product_id","Product ID"],["product_option_id","SKU ID"]],
};
export function reportMatrix(analytics,store={}){
  const f=analytics.filters,columns=fields[f.report];
  if(!columns)throw commerceError("Choose a valid export report.",undefined,400);
  const meta=["Store","Store ID","Report","From","To","Reporting timezone","Currency","Generated at","Definitions version"];
  return[
    [...meta,...columns.map(([key,title])=>title+(key.endsWith("_paise")?` (${f.currency})`:""))],
    ...analytics.table.rows.map(row=>[store.name||"",store.store_id||"",f.report,f.from,f.to,f.timezone,f.currency,analytics.generated_at,"commerce-v1",
      ...columns.map(([key])=>key.endsWith("_paise")?decimal(row[key]):row[key]??null)]),
  ];
}
function csvCell(value){
  if(value&&typeof value==="object"&&"amount"in value)return `"${value.amount}"`;
  let string=value==null?"":String(value);
  if(typeof value==="string"&&/^[\s\u0000-\u001f]*[=+\-@＝＋－＠]/.test(string))string="'"+string;
  return `"${string.replace(/"/g,'""')}"`;
}
const CRC_TABLE=Uint32Array.from({length:256},(_,n)=>{
  for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;
  return n>>>0;
});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=CRC_TABLE[(crc^byte)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
function concat(arrays){
  const length=arrays.reduce((n,b)=>n+b.length,0);
  if(length>MAX_BYTES)throw commerceError("This export is too large. Narrow the date range.",undefined,409);
  const result=new Uint8Array(length);let offset=0;for(const b of arrays){result.set(b,offset);offset+=b.length;}return result;
}
// ZIP STORE (no compression): portable in Workers, bounded CPU and no Node APIs.
function zip(files){
  const locals=[],central=[];let offset=0;
  for(const[path,text]of Object.entries(files)){
    const name=encoder.encode(path),bytes=encoder.encode(text),crc=crc32(bytes);
    const local=new Uint8Array(30+name.length),l=new DataView(local.buffer);
    l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);
    l.setUint16(12,33,true);l.setUint32(14,crc,true);l.setUint32(18,bytes.length,true);l.setUint32(22,bytes.length,true);
    l.setUint16(26,name.length,true);local.set(name,30);locals.push(local,bytes);
    const entry=new Uint8Array(46+name.length),c=new DataView(entry.buffer);
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);
    c.setUint16(14,33,true);c.setUint32(16,crc,true);c.setUint32(20,bytes.length,true);c.setUint32(24,bytes.length,true);
    c.setUint16(28,name.length,true);c.setUint32(42,offset,true);entry.set(name,46);central.push(entry);offset+=local.length+bytes.length;
    if(offset>MAX_BYTES)throw commerceError("This export is too large. Narrow the date range.",undefined,409);
  }
  const directory=concat(central),end=new Uint8Array(22),e=new DataView(end.buffer);
  e.setUint32(0,0x06054b50,true);e.setUint16(8,central.length,true);e.setUint16(10,central.length,true);
  e.setUint32(12,directory.length,true);e.setUint32(16,offset,true);
  return concat([...locals,directory,end]);
}
const columnName=index=>{let result="";for(let n=index+1;n;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result;};
function worksheet(rows){
  const content=rows.map((row,i)=>`<row r="${i+1}">${row.map((v,j)=>{
    const r=`${columnName(j)}${i+1}`;
    if(v==null)return`<c r="${r}"/>`;
    if(v&&typeof v==="object"&&"amount"in v)
      return v.precise?`<c r="${r}" s="1"><v>${v.amount}</v></c>`:`<c r="${r}" t="inlineStr"><is><t>${xml(v.amount)}</t></is></c>`;
    if(typeof v==="number")return`<c r="${r}"><v>${v}</v></c>`;
    if(typeof v==="boolean")return`<c r="${r}" t="b"><v>${v?1:0}</v></c>`;
    return`<c r="${r}" t="inlineStr"${i===0?' s="2"':""}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  }).join("")}</row>`).join("");
  return`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${content}</sheetData><autoFilter ref="A1:${columnName(rows[0].length-1)}${rows.length}"/></worksheet>`;
}
export function xlsxWorkbook(report,summary){
  const ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  return zip({
    "[Content_Types].xml":`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels":`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml":`<?xml version="1.0"?><workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/><sheet name="Summary and definitions" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels":`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml":`<?xml version="1.0"?><styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    "xl/worksheets/sheet1.xml":worksheet(report),"xl/worksheets/sheet2.xml":worksheet(summary),
  });
}
export function analyticsExport(analytics,format,store={}){
  const slug=String(store.subdomain||"store").replace(/[^a-z0-9-]/gi,"").slice(0,63)||"store";
  const f=analytics.filters,filename=`lebrands-${slug}-${f.report}-${f.from}-${f.to}-${f.currency}.${format}`;
  const matrix=reportMatrix(analytics,store);
  if(format==="csv"){
    const body="\ufeff"+matrix.map(row=>row.map(csvCell).join(",")).join("\r\n")+"\r\n";
    if(encoder.encode(body).length>MAX_BYTES)throw commerceError("This export is too large. Narrow the date range.",undefined,409);
    return{body,type:"text/csv; charset=utf-8",filename};
  }
  if(format!=="xlsx")throw commerceError("Choose CSV or Excel format.",undefined,400);
  const summary=[["Field","Value"],["Store",store.name||""],["Store ID",store.store_id||""],["Report",f.report],["From",f.from],["To",f.to],["Timezone",f.timezone],["Currency",f.currency],
    ["Generated at",analytics.generated_at],["Definitions version","commerce-v1"],["Exported rows",analytics.table.rows.length],
    ["Booked value","Accepted order totals, including tax and shipping. Not cash collected or recognised revenue."],
    ["Merchandise waterfall","Tax included; order creation-date cohort. Returned/refunded order statuses reverse full merchandise value, not actual refund transactions."],
    ["Product item value","Before unallocated order discounts; product order counts must not be added to obtain store orders."],
    ["Order register","Contains all statuses. Whole-order total and discount repeat on each line; do not sum those repeated columns."],
    ["Estimated margin","Known same-currency captured cost plus reconciled ex-tax line values, with no unallocated order discount. Comparable subset only; not net profit."],
    ["Unknown costs","Blank is unknown, never zero. Historical costs are never inferred from current catalogue costs."],
    ["Precision","Amounts exceeding Excel numeric precision are stored as text to preserve exact decimal values."],
    ...Object.entries(analytics.summary||{}).map(([key,value])=>[key,key.endsWith("_paise")?decimal(value):value]),
    ...Object.entries(analytics.costs||{}).map(([key,value])=>["costs."+key,key.endsWith("_paise")?decimal(value):value]),
  ];
  return{body:xlsxWorkbook(matrix,summary),type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",filename};
}
