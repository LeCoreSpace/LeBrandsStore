// Pure chart projections. Never infer profit, fill unknown costs, or sum
// whole-order amounts from the order-line register.
export const TREND_STYLES = ["line","area","columns","grouped","stacked","calendar"];
export const TREND_METRICS = {
  net_merchandise_paise:"Net merchandise",booked_order_value_paise:"Booked order value",
  gross_merchandise_paise:"Gross merchandise",discounts_paise:"Discounts",
  reversals_paise:"Reversals (status estimate)",orders:"Accepted orders",
  all_orders:"All orders",units:"Units sold",aov_paise:"Average order value"
};
export const PRODUCT_METRICS = {
  item_value_paise:"Item value before order discounts",units:"Units sold",
  orders:"Orders",coverage_percent:"Cost coverage (%)",estimated_margin_paise:"Estimated product margin",
  known_units:"Known cost units",comparable_units:"Comparable units",
  comparable_revenue_paise:"Comparable revenue",captured_cost_paise:"Captured cost"
};
export function numeric(value) {
  if(value===null||value===undefined||value==="")return null;
  const n=Number(value);
  return Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER?n:null;
}
const integer=value=>{const n=numeric(value);return Number.isSafeInteger(n)?n:null;};
function point(label,value,key=label){return{label:String(label??""),value,key:String(key??"")};}
function values(rows,key,labelKey="date"){
  return rows.map((r,i)=>point(labelKey==="title"?`${r.title||"Product"}${r.variant_label||r.sku?` · ${r.variant_label||r.sku}`:""}`:r[labelKey]||r.sku||`Row ${i+1}`,key.endsWith("_paise")?integer(r[key]):numeric(r[key]),r.product_option_id||r.order_item_id||i));
}
function mix(rows,key){
  const unique=new Map();
  for(const row of rows)if(row.order_id&&!unique.has(row.order_id))unique.set(row.order_id,row);
  const counts=new Map();
  for(const row of unique.values()){
    const name=String(row[key]||"Not recorded").replace(/_/g," ");
    counts.set(name,(counts.get(name)||0)+1);
  }
  const parts=[...counts].sort((a,b)=>b[1]-a[1]);
  if(parts.length>5)parts.splice(4,parts.length-4,["Other",parts.slice(4).reduce((n,p)=>n+p[1],0)]);
  return parts.map(([label,value])=>point(label,value));
}
export function analyticsChartModel(a={},options={}){
  const daily=Array.isArray(a.daily)?a.daily:[],rows=Array.isArray(a.table?.rows)?a.table.rows:[];
  const summary=a.summary||{},costs=a.costs||{};
  const metric=Object.hasOwn(TREND_METRICS,options.metric)?options.metric:"net_merchandise_paise";
  const style=TREND_STYLES.includes(options.style)?options.style:"line";
  const ranking=Object.hasOwn(PRODUCT_METRICS,options.ranking)?options.ranking:"item_value_paise";
  const full="Whole selected period";
  const offset=Number(a.table?.offset||0),total=Number(a.table?.total||0);
  const page=`Current report page: ${rows.length?offset+1:0}–${offset+rows.length} of ${total} rows. Not a whole-store breakdown.`;
  const trend={id:"trend",title:TREND_METRICS[metric],scope:full,kind:style,money:metric.endsWith("_paise"),series:[{name:TREND_METRICS[metric],points:values(daily,metric)}]};
  if(metric==="aov_paise"&&!["grouped","stacked"].includes(style)){
    trend.scope+=". Booked value per accepted order; days without accepted orders have no average.";
    trend.series[0].points=daily.map(r=>{
      const orders=integer(r.orders),booked=integer(r.booked_order_value_paise);
      return point(r.date,orders>0&&booked!==null?Math.round(booked/orders):null);
    });
  }
  if(style==="grouped"||style==="stacked"){
    const keys=style==="grouped"?["net_merchandise_paise","booked_order_value_paise"]:["net_merchandise_paise","discounts_paise","reversals_paise"];
    trend.title=style==="grouped"?"Net merchandise and booked value":"Merchandise composition";
    trend.money=true;trend.series=keys.map(k=>({name:TREND_METRICS[k],points:values(daily,k)}));
    if(style==="stacked")trend.scope+= ". Reversals are a status estimate, not gateway refunds.";
  }
  const charts=[trend,{
    id:"volume",title:"Accepted orders and units",scope:full,kind:"grouped",money:false,
    series:["orders","units"].map(k=>({name:TREND_METRICS[k],points:values(daily,k)}))
  }];
  const bridgeKeys=["gross_merchandise_paise","discounts_paise","reversals_paise","net_merchandise_paise"];
  const bridge=bridgeKeys.map(k=>integer(summary[k]));
  let running=bridge[0];
  const bridgePoints=bridge.map((v,i)=>{
    const start=i===0||i===3?0:running;
    const end=i===0||i===3?v:running===null||v===null?null:running-v;
    if(i<3)running=end;
    return{...point(["Gross","Discounts","Reversals","Net"][i],v),start,end,total:i===0||i===3};
  });
  charts.push({id:"bridge",title:"Merchandise waterfall",scope:`${full}. Gross less discounts and status-estimated reversals. Includes tax.`,kind:"waterfall",money:true,series:[{name:"Merchandise",points:bridge.every(v=>v!==null)?bridgePoints:[]}]});
  const known=integer(costs.known_units),totalUnits=integer(costs.total_units);
  charts.push({id:"coverage",title:"Captured cost coverage",scope:`${full}. Uncovered units are not treated as zero-cost units.`,kind:"donut",money:false,
    series:[{name:"Units",points:known!==null&&totalUnits!==null&&known>=0&&totalUnits>=known?[point("Known captured cost",known),point("Not covered",totalUnits-known)]:[]}]});
  charts.push({id:"margin",title:"Comparable product economics",scope:`${full}. Comparable subset only; estimated product margin is not net profit. Unknown values are omitted, not zero.`,kind:"bars",money:true,
    series:[{name:"Comparable amounts",points:[
      point("Comparable revenue",integer(costs.comparable_revenue_paise)),point("Captured cost",integer(costs.captured_cost_paise)),point("Estimated margin",integer(costs.estimated_margin_paise))
    ]}]});
  if(a.filters?.report==="products"){
    const ranked=values(rows,ranking,"title").filter(p=>p.value!==null).sort((a,b)=>b.value-a.value).slice(0,12);
    charts.push({id:"products",title:PRODUCT_METRICS[ranking],scope:`${page} Up to 12 known-value rows shown, ranked within this page.`,kind:"bars",money:ranking.endsWith("_paise"),series:[{name:PRODUCT_METRICS[ranking],points:ranked}]});
    charts.push({id:"relationship",title:"Product units and item value",scope:`${page} One point per product/SKU row, not net revenue.`,kind:"scatter",money:true,
      series:[{name:"Products",points:rows.map((r,i)=>({...point(`${r.title||"Product"}${r.sku?` · ${r.sku}`:""}`,integer(r.item_value_paise),i),x:integer(r.units)})).filter(p=>p.value!==null&&p.x!==null)}]});
  }
  if(a.filters?.report==="orders"){
    for(const[key,title]of[["status","Order status mix"],["payment_method","Payment method mix"]]){
      charts.push({id:key,title,scope:`${page} Unique order IDs visible on this page; repeated order lines count once.`,kind:"donut",money:false,series:[{name:"Orders",points:mix(rows,key)}]});
    }
  }
  return charts;
}
