import {commerceError} from "../public/commerce-rules.js";

export const REPORTS=["sales","orders","products"];
export const EXPORT_LIMIT=10000;
const invalid=message=>commerceError(message,undefined,400);
function isoDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||"")||Number(value.slice(0,4))<1900)throw invalid("Choose a valid date from 1900 onward.");
  const date=new Date(value+"T00:00:00Z");
  if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==value)throw invalid("Choose a valid date.");
  return value;
}
export function analyticsFilters(params,currency="INR",now=new Date()){
  const read=k=>params instanceof URLSearchParams?params.get(k):params?.[k];
  const timezone=read("timezone")||"Asia/Kolkata";
  let parts;try{
    parts=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  }catch{throw invalid("Choose a supported reporting timezone.");}
  const today=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  const day=`${today.year}-${today.month}-${today.day}`,year=Number(today.year),month=Number(today.month);
  let preset=read("preset")||((read("from")||read("to"))?"custom":"this_month"),from,to=day;
  if(preset==="this_month")from=`${today.year}-${today.month}-01`;
  else if(preset==="this_quarter")from=`${year}-${String(Math.floor((month-1)/3)*3+1).padStart(2,"0")}-01`;
  else if(preset==="financial_year")from=`${month<4?year-1:year}-04-01`;
  else if(preset==="last_30_days")from=new Date(Date.parse(day+"T00:00:00Z")-29*86400000).toISOString().slice(0,10);
  else if(preset==="custom"){from=isoDate(read("from"));to=isoDate(read("to"));}
  else throw invalid("Choose a valid report period.");
  const days=(Date.parse(to)-Date.parse(from))/86400000+1;
  if(days<1||days>366)throw invalid("Choose an inclusive date range of 1 to 366 days.");
  const ccy=read("currency")||currency,report=read("report")||"sales";
  if(!/^[A-Z]{3}$/.test(ccy))throw invalid("Choose a three-letter uppercase currency.");
  if(!REPORTS.includes(report))throw invalid("Choose a valid analytics report.");
  const integer=(key,fallback,min,max)=>{
    const value=read(key);if(value==null||value==="")return fallback;
    if(!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<min||Number(value)>max)
      throw invalid("Use valid report pagination.");
    return Number(value);
  };
  return{preset,from,to,timezone,currency:ccy,report,limit:integer("limit",50,1,100),offset:integer("offset",0,0,1000000)};
}
export async function analyticsEnabled(tx){
  const[row]=await tx`SELECT to_regprocedure('public.commerce_analytics_read(uuid,text,date,date,text,text,text,integer,integer)') IS NOT NULL AS enabled`;
  return row?.enabled===true;
}
function safeReport(value,key=""){
  if(value==null)return;
  if(typeof value==="number"&&(!Number.isFinite(value)||(key.endsWith("_paise")&&!Number.isSafeInteger(value))))
    throw commerceError("This report exceeds supported exact amounts. Choose a narrower period.",undefined,409);
  if(typeof value==="object")for(const[k,v]of Object.entries(value))safeReport(v,k);
}
export async function readAnalytics(tx,id,tokenHash,filters,{exporting=false}={}){
  if(!await analyticsEnabled(tx))return{available:false,filters};
  const limit=exporting?EXPORT_LIMIT:filters.limit,offset=exporting?0:filters.offset;
  let row;
  try{
    [row]=await tx`SELECT public.commerce_analytics_read(${id},${tokenHash},${filters.from}::date,${filters.to}::date,
      ${filters.timezone},${filters.currency},${filters.report},${limit},${offset})::text AS result`;
  }catch(error){
    if(error.code==="42501")throw commerceError("Only owners and admins can view analytics.",undefined,403);
    if(error.code==="22023")throw invalid("Use a valid report period, timezone and pagination.");
    throw error;
  }
  const report=typeof row?.result==="string"?JSON.parse(row.result):row?.result;
  if(!report?.available)throw commerceError("The report could not be read.",undefined,503);
  safeReport(report);
  if(exporting&&report.table.total>EXPORT_LIMIT)
    throw commerceError(`This report has more than ${EXPORT_LIMIT.toLocaleString("en-US")} rows. Narrow the date range before exporting.`,undefined,409);
  return{...report,filters:{...filters,limit,offset}};
}
