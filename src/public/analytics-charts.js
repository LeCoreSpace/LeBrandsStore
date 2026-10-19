import {analyticsChartModel,TREND_STYLES,TREND_METRICS,PRODUCT_METRICS} from "./analytics-chart-model.js";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const colours=["#6b1735","#a8617c","#d3aabb","#33756c","#9b6a31"];
const W=680,H=270,L=90,R=24,T=20,B=48,PW=W-L-R,PH=H-T-B;
const fmt=(v,money,currency,compact=false)=>v===null?"Unknown":new Intl.NumberFormat("en-IN",money?{style:"currency",currency,maximumFractionDigits:compact?1:2,...(compact?{notation:"compact"}:{})}:{maximumFractionDigits:compact?1:2,...(compact?{notation:"compact"}:{})}).format(money?v/100:v);
const text=(x,y,s,extra="")=>`<text x="${x}" y="${y}" ${extra}>${esc(s)}</text>`;
function domain(numbers){return[Math.min(0,...numbers),Math.max(1,...numbers)];}
function labelDate(s){return /^\d{4}-\d\d-\d\d$/.test(s)?s.slice(5):s;}
function axes(chart,currency,min,max){
  return [0,.5,1].map(n=>{
    if(!chart.money&&!Number.isInteger(min+(max-min)*n))return"";
    const y=T+PH*(1-n);
    return `<line class="lba-chart-guide" x1="${L}" y1="${y}" x2="${W-R}" y2="${y}"/>${text(L-10,y+4,fmt(min+(max-min)*n,chart.money,currency,true),'text-anchor="end"')}`;
  }).join("");
}
function cartesian(chart,currency){
  const series=chart.series,n=series[0]?.points.length||0;
  const points=series.flatMap(s=>s.points),nums=points.map(p=>p.value).filter(v=>v!==null);
  if(!n||!nums.length)return"";
  const stacked=chart.kind==="stacked",bars=["columns","grouped","stacked"].includes(chart.kind);
  const sums=Array.from({length:n},(_,i)=>series.reduce((s,row)=>s+(row.points[i]?.value??0),0));
  const[min,max]=domain(stacked?sums:nums),y=v=>T+(max-v)/(max-min)*PH;
  const step=PW/n,x=i=>L+step*(i+.5);
  let out=axes(chart,currency,min,max);
  if(bars){
    const bases=Array(n).fill(0);
    series.forEach((s,si)=>{
      s.points.forEach((p,i)=>{
        if(p.value===null)return;
        const width=stacked?step*.72:step*.72/series.length;
        const start=stacked?bases[i]:0,end=start+p.value;
        const left=stacked?x(i)-width/2:x(i)-step*.36+width*si;
        out+=`<rect x="${left}" y="${Math.min(y(start),y(end))}" width="${Math.max(.3,width)}" height="${Math.abs(y(end)-y(start))}" fill="${colours[si%colours.length]}"><title>${esc(`${p.label} · ${s.name}: ${fmt(p.value,chart.money,currency)}`)}</title></rect>`;
        if(stacked)bases[i]=end;
      });
    });
  }else{
    const s=series[0];let segment=[];
    const draw=()=>{
      if(!segment.length)return;
      const path=segment.map(([xx,yy],i)=>`${i?"L":"M"}${xx},${yy}`).join(" ");
      if(chart.kind==="area")out+=`<path d="${path} L${segment.at(-1)[0]},${y(0)} L${segment[0][0]},${y(0)} Z" fill="#ead7df"/>`;
      out+=`<path d="${path}" fill="none" stroke="${colours[0]}" stroke-width="2.5"/>`;
      segment=[];
    };
    s.points.forEach((p,i)=>{if(p.value===null){draw();return;}segment.push([x(i),y(p.value)]);});draw();
    s.points.forEach((p,i)=>{
      if(p.value===null)return;
      out+=`<circle cx="${x(i)}" cy="${y(p.value)}" r="${n>90?2:3.5}" fill="${colours[0]}"><title>${esc(`${p.label}: ${fmt(p.value,chart.money,currency)}`)}</title></circle>`;
    });
  }
  [...new Set([0,Math.floor((n-1)/2),n-1])].forEach(i=>{out+=text(x(i),H-18,labelDate(series[0].points[i].label),'text-anchor="middle"');});
  return out;
}
function horizontal(chart,currency){
  const points=chart.series[0].points.filter(p=>p.value!==null);
  if(!points.length)return"";
  const[min,max]=domain(points.map(p=>p.value)),left=230,width=W-left-118,x=v=>left+(v-min)/(max-min)*width;
  return points.map((p,i)=>{
    const y=18+i*36;
    const short=p.label.length>26?p.label.slice(0,25)+"…":p.label;
    return `${text(10,y+16,short)}<rect x="${Math.min(x(0),x(p.value))}" y="${y}" width="${Math.abs(x(p.value)-x(0))}" height="23" fill="${p.value<0?"#b34e34":colours[0]}"><title>${esc(`${p.label}: ${fmt(p.value,chart.money,currency)}`)}</title></rect>${text(W-12,y+16,fmt(p.value,chart.money,currency),'text-anchor="end"')}`;
  }).join("");
}
function donut(chart,currency){
  const points=chart.series[0].points.filter(p=>p.value!==null&&p.value>0),total=points.reduce((n,p)=>n+p.value,0);
  if(!total)return"";
  let at=0;const circumference=2*Math.PI*78;
  return points.map((p,i)=>{
    const fraction=p.value/total;
    const result=`<circle cx="145" cy="130" r="78" fill="none" stroke="${colours[i%colours.length]}" stroke-width="30" stroke-dasharray="${circumference*fraction} ${circumference*(1-fraction)}" stroke-dashoffset="${-at*circumference}" transform="rotate(-90 145 130)"><title>${esc(`${p.label}: ${p.value} (${(fraction*100).toFixed(1)}%)`)}</title></circle><rect x="278" y="${33+i*39}" width="10" height="10" fill="${colours[i%colours.length]}"/>${text(299,43+i*39,`${p.label}: ${fmt(p.value,false,currency)} (${(fraction*100).toFixed(1)}%)`)}`;
    at+=fraction;return result;
  }).join("");
}
function waterfall(chart,currency){
  const points=chart.series[0].points;if(!points.length)return"";
  const[min,max]=domain(points.flatMap(p=>[p.start,p.end])),y=v=>T+(max-v)/(max-min)*PH,step=PW/points.length;
  return axes(chart,currency,min,max)+points.map((p,i)=>{
    const x=L+i*step+step*.18,top=Math.min(y(p.start),y(p.end)),height=Math.abs(y(p.end)-y(p.start));
    return `<rect x="${x}" y="${top}" width="${step*.64}" height="${height}" fill="${p.total?colours[0]:"#b34e34"}"><title>${esc(`${p.label}: ${fmt(p.value,true,currency)}`)}</title></rect>${text(x+step*.32,Math.max(14,top-7),fmt(p.value,true,currency,true),'text-anchor="middle"')}${text(x+step*.32,H-18,p.label,'text-anchor="middle"')}`;
  }).join("");
}
function calendarLayout(points){
  const dated=points.filter(p=>/^\d{4}-\d\d-\d\d$/.test(p.label)&&Number.isFinite(Date.parse(`${p.label}T00:00:00Z`)));
  if(!dated.length)return{dated,start:0,bands:1};
  const times=dated.map(p=>Date.parse(`${p.label}T00:00:00Z`)),first=Math.min(...times),day=86400000;
  const start=first-((new Date(first).getUTCDay()+6)%7)*day;
  return{dated,start,bands:Math.floor((Math.max(...times)-start)/(28*7*day))+1};
}
function calendar(chart,currency){
  const{dated,start,bands}=calendarLayout(chart.series[0].points),day=86400000;
  if(!dated.length)return"";
  const extent=Math.max(1,...dated.map(p=>Math.abs(p.value??0))),cell=18,cols=28;
  // Split long date ranges into 28-week bands rather than shrinking every cell.
  return Array.from({length:bands},(_,band)=>["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((label,i)=>text(10,54+band*178+i*cell,label)).join("")).join("")+dated.map(p=>{
    const date=new Date(`${p.label}T00:00:00Z`).getTime(),days=Math.round((date-start)/day),week=Math.floor(days/7);
    const x=90+(week%cols)*cell,y=42+Math.floor(week/cols)*178+(days%7)*cell;
    return `<rect x="${x}" y="${y}" width="15" height="15" rx="2" fill="${p.value===null?"#fff":p.value===0?"#eee7eb":p.value<0?"#b34e34":colours[0]}" fill-opacity="${p.value===null||p.value===0?1:.2+.8*Math.abs(p.value)/extent}" stroke="${p.value===null?"#aaa":"none"}"><title>${esc(`${p.label}: ${fmt(p.value,chart.money,currency)}`)}</title></rect>${days%7===0&&week%4===0?text(x,y-10,p.label.slice(5),'font-size="10"'): ""}`;
  }).join("");
}
function scatter(chart,currency){
  const points=chart.series[0].points;if(!points.length)return"";
  const[min,max]=domain(points.map(p=>p.value)),xmax=Math.max(1,...points.map(p=>p.x)),x=v=>L+v/xmax*PW,y=v=>T+(max-v)/(max-min)*PH;
  return axes(chart,currency,min,max)+points.map(p=>`<circle cx="${x(p.x)}" cy="${y(p.value)}" r="5" fill="${colours[0]}" fill-opacity=".7"><title>${esc(`${p.label}: ${p.x} units, ${fmt(p.value,true,currency)} item value`)}</title></circle>`).join("")+[0,.5,1].filter(n=>Number.isInteger(xmax*n)).map(n=>text(x(xmax*n),H-20,fmt(xmax*n,false,currency),'text-anchor="middle"')).join("")+text(W/2,H-3,"Units sold",'text-anchor="middle"');
}
function figure(chart,currency){
  const renderers={bars:horizontal,donut,waterfall,calendar,scatter};
  const points=chart.series[0]?.points||[];
  const known=chart.series.flatMap(s=>s.points).filter(p=>p.value!==null);
  const height=chart.kind==="bars"?Math.max(120,points.filter(p=>p.value!==null).length*36+28):chart.kind==="calendar"?Math.max(220,calendarLayout(points).bands*178+35):H;
  const picture=(renderers[chart.kind]||cartesian)(chart,currency);
  const zero=known.length&&known.every(p=>p.value===0);
  const legend=chart.series.length>1?`<div class="lba-chart-legend">${chart.series.map((s,i)=>`<span><i style="background:${colours[i%colours.length]}"></i>${esc(s.name)}</span>`).join("")}</div>`:chart.kind==="calendar"?'<p class="lba-chart-legend">Pale cells are zero; darker cells show larger values. Red marks negative values. Outlined cells have unknown values.</p>':"";
  return `<figure class="lba-chart" aria-labelledby="an-chart-${chart.id}"><figcaption><h3 id="an-chart-${chart.id}">${esc(chart.title)}</h3><p>${esc(chart.scope)}</p></figcaption>${picture?`<div class="lba-chart-plot" tabindex="0" role="region" aria-label="${esc(chart.title)} chart; scroll horizontally on small screens"><svg viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(chart.title)}"><title>${esc(chart.title)}</title><desc>${esc(chart.scope)} Exact values are available in the chart data and report tables.</desc>${picture}</svg></div>${legend}`:`<p class="lb-muted">${known.length?"No non-zero values to chart for this selection.":"No known values to chart for this selection."}</p>`}${zero&&picture?'<p class="lb-muted">All known values in this selection are zero.</p>':""}
    <details class="lba-chart-data"><summary>Chart data</summary><div class="lba-chart-data-scroll"><table><caption class="lb-sr-only">${esc(chart.title)} values</caption><thead><tr><th scope="col">Label</th><th scope="col">Series</th><th scope="col">Value</th></tr></thead><tbody>${chart.series.flatMap(s=>s.points.map(p=>`<tr><th scope="row">${esc(p.label)}</th><td>${esc(s.name)}</td><td>${chart.kind==="scatter"?`${esc(p.x)} units · `:""}${esc(fmt(p.value,chart.money,currency))}</td></tr>`)).join("")}</tbody></table></div></details></figure>`;
}
function select(key,label,items,value){
  return `<label>${esc(label)}<select data-an-chart-control="${key}">${items.map(([v,l])=>`<option value="${esc(v)}"${v===value?" selected":""}>${esc(l)}</option>`).join("")}</select></label>`;
}
export function renderAnalyticsCharts(a,options={},currency="INR"){
  const models=analyticsChartModel(a,options),trend=models[0];
  const styleLabels={line:"Line",area:"Area",columns:"Columns",grouped:"Grouped columns",stacked:"Stacked columns",calendar:"Calendar heatmap"};
  const controls=select("style","Trend view",TREND_STYLES.map(v=>[v,styleLabels[v]]),trend.kind)+(!["stacked","grouped"].includes(trend.kind)?select("metric","Trend metric",Object.entries(TREND_METRICS),Object.hasOwn(TREND_METRICS,options.metric)?options.metric:"net_merchandise_paise"):"")+(a.filters?.report==="products"?select("ranking","Product ranking",Object.entries(PRODUCT_METRICS),Object.hasOwn(PRODUCT_METRICS,options.ranking)?options.ranking:"item_value_paise"):"");
  return `<section class="lba-charts" aria-label="Analytics charts"><div class="lba-chart-heading"><div><h2>Visual insights</h2><p class="lb-muted">Charts and tables use the same reporting definitions. Change the view to explore the data.</p><a class="inline-link" href="#an-report">View report table</a></div><div class="lba-chart-controls">${controls}</div></div><div class="lba-chart-grid">${models.map(c=>figure(c,currency)).join("")}</div></section>`;
}
