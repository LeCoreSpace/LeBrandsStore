import test from "node:test";
import assert from "node:assert/strict";
import {analyticsChartModel,TREND_STYLES} from "../src/public/analytics-chart-model.js";
import {renderAnalyticsCharts} from "../src/public/analytics-charts.js";

function fixture(report="sales"){
  return {
    available:true,filters:{report,currency:"INR"},
    daily:[
      {date:"2026-10-01",orders:1,all_orders:2,units:2,gross_merchandise_paise:10000,discounts_paise:1000,reversals_paise:0,net_merchandise_paise:9000,booked_order_value_paise:9500},
      {date:"2026-10-02",orders:0,all_orders:1,units:0,gross_merchandise_paise:5000,discounts_paise:0,reversals_paise:5000,net_merchandise_paise:0,booked_order_value_paise:0}
    ],
    summary:{gross_merchandise_paise:15000,discounts_paise:1000,reversals_paise:5000,net_merchandise_paise:9000},
    costs:{known_units:1,total_units:2,comparable_revenue_paise:4000,captured_cost_paise:5000,estimated_margin_paise:-1000},
    table:{offset:50,total:105,rows:[
      {order_id:"one",status:"paid",payment_method:"razorpay",title:"<unsafe>",sku:"A",units:3,orders:1,item_value_paise:3000,estimated_margin_paise:null,coverage_percent:0},
      {order_id:"one",status:"paid",payment_method:"razorpay",title:"Second",sku:"B",units:2,orders:1,item_value_paise:2000,estimated_margin_paise:0,coverage_percent:100},
      {order_id:"two",status:"confirmed_cod",payment_method:"cod",title:"Third",units:1,orders:1,item_value_paise:1000,estimated_margin_paise:-500,coverage_percent:50}
    ]}
  };
}
test("whole-period charts use daily data, not the current report page",()=>{
  const charts=analyticsChartModel(fixture(),{metric:"booked_order_value_paise"});
  assert.deepEqual(charts[0].series[0].points.map(p=>p.value),[9500,0]);
  assert.equal(charts[0].scope,"Whole selected period");
  const waterfall=charts.find(c=>c.id==="bridge").series[0].points;
  assert.deepEqual(waterfall.map(p=>[p.start,p.end]),[[0,15000],[15000,14000],[14000,9000],[0,9000]]);
  assert.deepEqual(charts.find(c=>c.id==="coverage").series[0].points.map(p=>p.value),[1,1]);
  assert.equal(charts.find(c=>c.id==="margin").series[0].points[2].value,-1000);
});
test("null captured margins stay unknown; known zero remains a chartable zero",()=>{
  const data=fixture("products");
  const model=analyticsChartModel(data,{ranking:"estimated_margin_paise"});
  const ranking=model.find(c=>c.id==="products");
  assert.deepEqual(ranking.series[0].points.map(p=>p.value),[0,-500]);
  data.costs.estimated_margin_paise=null;
  assert.equal(analyticsChartModel(data).find(c=>c.id==="margin").series[0].points[2].value,null);
  assert.match(ranking.scope,/Current report page: 51–53 of 105/);
  assert.match(ranking.scope,/Not a whole-store/);
  assert.equal(model.find(c=>c.id==="relationship").series[0].points.length,3);
});
test("order mixes deduplicate order IDs and never sum repeated whole-order totals",()=>{
  const models=analyticsChartModel(fixture("orders"));
  for(const id of["status","payment_method"]){
    const chart=models.find(c=>c.id===id);
    assert.equal(chart.series[0].points.reduce((n,p)=>n+p.value,0),2);
    assert.match(chart.scope,/repeated order lines count once/);
  }
});
test("all supported chart types render SVG and accessible exact-value tables",()=>{
  for(const style of TREND_STYLES){
    const html=renderAnalyticsCharts(fixture(),{style},"INR");
    assert.match(html,/role="img"/);
    assert.match(html,/Chart data/);
    assert.match(html,/data-an-chart-control="style"/);
    assert.doesNotMatch(html,/NaN|Infinity|undefined/);
    assert.match(html,/not net profit/);
  }
  const products=renderAnalyticsCharts(fixture("products"),{},"USD");
  assert.match(products,/Product units and item value/);
  assert.match(products,/&lt;unsafe&gt;/);
  assert.doesNotMatch(products,/<unsafe>/);
  assert.match(products,/data-an-chart-control="ranking"/);
  assert.match(renderAnalyticsCharts(fixture("orders")),/Payment method mix/);
});
test("zero, empty, unknown and malformed chart values do not fabricate data",()=>{
  const data=fixture();data.daily=[];data.summary={};data.costs={};
  let html=renderAnalyticsCharts(data,{});
  assert.match(html,/No known values/);
  assert.doesNotMatch(html,/NaN|Infinity|undefined/);
  data.costs={known_units:0,total_units:0};
  assert.match(renderAnalyticsCharts(data,{}),/No non-zero values/);
  data.daily=[{date:"2026-10-01",net_merchandise_paise:null},{date:"2026-10-02",net_merchandise_paise:"bad"},{date:"2026-10-03",net_merchandise_paise:Number.MAX_SAFE_INTEGER+1}];
  assert.deepEqual(analyticsChartModel(data)[0].series[0].points.map(p=>p.value),[null,null,null]);
  html=renderAnalyticsCharts(data,{style:"<script>",metric:"__proto__"});
  assert.doesNotMatch(html,/<script>|NaN|Infinity|undefined/);
});
test("long calendar ranges allocate an extra band for a partial starting week",()=>{
  const data=fixture();
  data.daily=Array.from({length:196},(_,i)=>({
    date:new Date(Date.UTC(2026,9,1+i)).toISOString().slice(0,10),net_merchandise_paise:i
  }));
  const html=renderAnalyticsCharts(data,{style:"calendar"});
  assert.match(html,/viewBox="0 0 680 391"/);
  assert.doesNotMatch(html,/NaN|Infinity/);
});
test("count charts avoid fractional unit ticks and link directly to the report table",()=>{
  const html=renderAnalyticsCharts(fixture(),{metric:"orders"});
  assert.match(html,/href="#an-report"/);
  assert.doesNotMatch(html.split("</figure>")[0],/>0\.5<\/text>/);
});
test("daily AOV is derived per accepted order and is unknown on zero-order days",()=>{
  const model=analyticsChartModel(fixture(),{metric:"aov_paise"});
  assert.deepEqual(model[0].series[0].points.map(p=>p.value),[9500,null]);
  assert.match(model[0].scope,/without accepted orders/);
});
