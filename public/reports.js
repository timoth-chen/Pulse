let reportMode='cashflow',reportRevision=0,reportData=null;
async function loadReportView(view){if(view==='cashflow'){loadCashFlow();return;}if(view==='forecast'){renderForecast();return;}if(view==='tools'){renderFinancialTools();return;}if(view==='payroll')return loadPayroll();return loadReports();}
function reportParams(){return new URLSearchParams({from:$('reportFrom').value,to:$('reportTo').value,account:$('reportAccount').value,category:$('reportCategory').value,period:$('reportPeriod').value,grouping:$('reportGroup').value});}
function reportDatesLabel(){return $('reportFrom').value||$('reportTo').value?`${$('reportFrom').value?txDateLabel($('reportFrom').value):'Beginning'} – ${$('reportTo').value?txDateLabel($('reportTo').value):'Latest'}`:'All time';}
async function loadReports(){const revision=++reportRevision;try{$('reportMsg').textContent='';const data=await api('/api/reports?'+reportParams());if(revision!==reportRevision)return;reportData=data;for(const [id,list,label] of [['reportAccount',data.accounts.map(a=>a.name),'accounts'],['reportCategory',data.categories,'categories']]){const value=$(id).value;$(id).innerHTML=`<option value="">All ${label}</option>`+list.map(name=>`<option>${esc(name)}</option>`).join('');if(value&&!list.includes(value))$(id).add(new Option(value,value));$(id).value=value;}
 const s=data.summary;$('reportTotals').innerHTML=[['Total income',money(s.income),'income'],['Total expenses',money(s.spending),'spending'],['Net cash flow',money(s.net),'net'],['Savings rate',s.savingsRate===null?'—':s.savingsRate+'%','rate']].map(([label,value,kind])=>`<div><strong class="report-${kind}">${value}</strong><span>${label}</span></div>`).join('');$('reportRangeLabel').textContent=reportDatesLabel();$('reportStats').innerHTML=[['Range',reportDatesLabel()],['Total income',money(s.income)],['Total spending',money(s.spending)],['Net cash flow',money(s.net)],['Savings rate',s.savingsRate===null?'—':s.savingsRate+'%'],['Transactions',s.count.toLocaleString()]].map(([label,value])=>`<div><span>${label}</span><strong>${esc(value)}</strong></div>`).join('');$('reportComparison').innerHTML='';renderReportChart(data);renderReportBreakdown(data);renderReportFilters();document.querySelectorAll('[data-report-mode]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.reportMode===reportMode)));}catch(error){if(revision===reportRevision)$('reportMsg').textContent=error.message;}}
function renderReportFilters(){const fields=[['reportAccount','Account'],['reportCategory','Category']],selected=fields.filter(([id])=>$(id).value);$('reportFilterCount').textContent=selected.length||'';$('reportActiveFilters').innerHTML=selected.map(([id,label])=>`<button class="filter-chip" data-clear-report="${id}">${label}: ${esc($(id).value)} ×</button>`).join('');document.querySelectorAll('[data-clear-report]').forEach(b=>b.onclick=()=>{$(b.dataset.clearReport).value='';loadReports();});}
function renderReportTrend(d){const rows=d.timeline;if(!rows.length)return '<p class="flow-empty">No transactions match this report.</p>';const w=Math.max(950,rows.length*30),h=290,pad=58,values=rows.flatMap(r=>reportMode==='income'?[r.income]:reportMode==='spending'?[-r.spending]:[r.income,-r.spending,r.net]),top=Math.max(1,...values),bottom=Math.min(-1,...values),y=v=>22+(top-v)/(top-bottom)*210,step=(w-pad-20)/rows.length,x=i=>pad+(i+.5)*step,zero=y(0),labelStep=Math.max(1,Math.ceil(rows.length/12));const bar=(value,i,color)=>`<rect x="${x(i)-step*.34}" y="${Math.min(zero,y(value))}" width="${step*.68}" height="${Math.abs(zero-y(value))}" fill="${color}" opacity=".75"/>`;
 return `<div class="flow-chart-legend"><span class="flow-income-key">● Income</span><span class="flow-spending-key">● Spending</span>${reportMode==='cashflow'?'<span>— Net cash flow</span>':''}</div><div class="report-trend-scroll"><svg viewBox="0 0 ${w} ${h}" style="min-width:${w}px" class="report-trend" role="img" aria-label="Report ${reportMode} by ${d.period}">${[top,(top+bottom)/2,0,bottom].filter((v,i,a)=>a.indexOf(v)===i).map(v=>`<path d="M${pad} ${y(v)}H${w-20}" class="flow-grid"/><text x="0" y="${y(v)+4}" class="flow-axis">${Math.abs(v)>=1000?'$'+(v/1000).toFixed(0)+'k':money(v)}</text>`).join('')}${rows.map((r,i)=>`<g ${r.count?`tabindex="0" role="button" data-report-period="${esc(r.key)}"`:''}>${reportMode!=='spending'?bar(r.income,i,'#51aa8f'):''}${reportMode!=='income'?bar(-r.spending,i,'#d77b8b'):''}${i%labelStep===0||i===rows.length-1&&i%labelStep>=Math.ceil(labelStep*.75)?`<text x="${x(i)}" y="260" text-anchor="middle" class="flow-axis">${esc(d.period==='monthly'?new Date(r.key+'-15T12:00:00Z').toLocaleDateString('en-CA',{month:'short',year:'2-digit',timeZone:'UTC'}):r.key)}</text>`:''}<title>${esc(flowLabel(r.key))} · Income ${money(r.income)} · Spending ${money(r.spending)} · Net ${money(r.net)}</title></g>`).join('')}${reportMode==='cashflow'?`<path d="${rows.map((r,i)=>`${i?'L':'M'}${x(i)},${y(r.net)}`).join(' ')}" class="flow-net-line"/>`:''}</svg></div>`;}
function renderReportHierarchy(d){const m=ReportSankey.build(d);if(!m)return '<p class="flow-empty">No transactions match this report.</p>';const {x,height,width,total}=m;return `<p class="muted">${money(total)} flowing · category → group → cash flow → group → category. Small categories are combined within their parent group.</p><div class="report-hierarchy-scroll"><svg viewBox="0 0 ${width} ${height}" class="report-hierarchy" role="img" aria-label="Income and spending by category and parent group">${m.links.map(l=>`<path ${chartDetailAttrs(l.detailNode,false)} d="${PulseSankey.ribbon(x[l.from]+10,l.y1,x[l.to],l.y2,l.h)}" fill="${l.color||'#8fa0d2'}" class="sankey-ribbon"/>`).join('')}${m.layers.map((layer,i)=>layer.map(n=>`<g ${chartDetailAttrs(n)}><rect x="${x[i]}" y="${n.y}" width="10" height="${n.h}" fill="${n.color||'#8fa0d2'}"/><text x="${i===4?x[i]+22:x[i]-14}" y="${n.cy-3}" text-anchor="${i===4?'start':'end'}" class="flow-node-label">${esc(n.label.length>25?n.label.slice(0,24)+'…':n.label)}</text><text x="${i===4?x[i]+22:x[i]-14}" y="${n.cy+13}" text-anchor="${i===4?'start':'end'}" class="flow-node-value">${money(n.cents/100)} (${(n.cents/(total*100)*100).toFixed(1)}%)</text><title>${esc(n.label)}: ${money(n.cents/100)}${n.members?' · '+n.members.map(c=>c.label+': '+money(c.cents/100)).join('; '):''}</title></g>`).join('')).join('')}</svg></div>`;}
function renderReportChart(d){const visual=$('reportVisual').value;$('reportPeriod').hidden=visual!=='trend';if(visual==='trend')$('reportChart').innerHTML=renderReportTrend(d);else if(visual==='sankey'){let chart=d;if(reportMode==='income')chart={...d,expense:d.summary.income>=0?[{label:'Reported income',synthetic:true,group:'Income',total:d.summary.income,color:'#51aa8f'}]:[]};else if(reportMode==='spending')chart={...d,income:d.summary.spending>=0?[{label:'Net spending',synthetic:true,group:'Spending',total:d.summary.spending,color:'#d77b8b'}]:[]};$('reportChart').innerHTML=d.grouping==='both'?renderReportHierarchy(chart):renderFlowSankey(chart);}else $('reportChart').innerHTML=reportBreakdownMarkup(d);const filters={from:d.from,to:d.to,account:$('reportAccount').value,category:$('reportCategory').value};
 bindChartDetails($('reportChart'),filters);
 $('reportChart').querySelectorAll('[data-report-period]').forEach(el=>{
   bindChartActivation(el,()=>{
     const range=chartBucketRange(el.dataset.reportPeriod);
     openChartDetail(flowLabel(el.dataset.reportPeriod),{...filters,from:laterChartDate(range.from,filters.from),to:earlierChartDate(range.to,filters.to),kind:reportMode==='cashflow'?'':reportMode==='spending'?'expense':'income'},[]);
   });
 });
 bindReportDrills();
}

function reportBreakdownMarkup(d){return [['Income',d.income,'income'],['Expenses',d.expense,'spending']].filter(([,rows,type])=>reportMode==='cashflow'||reportMode===type).map(([label,rows,type])=>{const sum=rows.reduce((n,r)=>n+r.total,0),max=Math.max(1,...rows.map(r=>Math.abs(r.total))),color=type==='income'?'#51aa8f':'#d77b8b';return `<section class="report-breakdown-section"><h4>${label}</h4>${rows.length?rows.map(r=>`<button class="flow-category-row" data-report-label="${esc(r.label)}" data-report-kind="${type==='income'?'income':'expense'}"><span class="flow-category-fill" style="width:${Math.abs(r.total)/max*100}%;background:${color}"></span><span>${esc(r.icon||'')} ${d.grouping==='both'?`<small>${esc(r.group)} / </small>`:''}${esc(r.label)}</span><strong>${money(r.total)} <small>${sum>0?'('+Math.round(r.total/sum*1000)/10+'%)':''}</small></strong></button>`).join(''):'<p class="flow-empty">No matching '+label.toLowerCase()+'.</p>'}</section>`;}).join('');}
function renderReportBreakdown(d){$('reportBreakdown').innerHTML=reportBreakdownMarkup(d);bindReportDrills();}
function bindReportDrills(){
 document.querySelectorAll('[data-report-label]').forEach(button=>button.onclick=()=>{
   const filters=Object.fromEntries(reportParams());
   const grouping=filters.grouping==='both'?'category':filters.grouping;
   openChartDetail(button.dataset.reportLabel,filters,[{label:button.dataset.reportLabel,grouping,kind:button.dataset.reportKind}]);
 });
}
function chartBucketRange(key){
 if(!key)return {from:'',to:''};
 const year=Number(key.slice(0,4)),quarter=key.includes('-Q');
 const month=quarter?(Number(key.at(-1))-1)*3:key.length===4?0:Number(key.slice(5))-1;
 const months=quarter?3:key.length===4?12:1;
 return {from:new Date(Date.UTC(year,month,1)).toISOString().slice(0,10),to:new Date(Date.UTC(year,month+months,0)).toISOString().slice(0,10)};
}
function laterChartDate(a,b){return a>b?a:b;}
function earlierChartDate(a,b){return !a?b:!b?a:a<b?a:b;}
function chartDetailAttrs(node,keyboard=true){
 if(!node)return '';
 const entries=entry=>entry.detail?[entry.detail]:(entry.members||entry.children||[]).flatMap(entries);
 const selectors=entries(node);
 const summary=['Net savings','From existing funds','Cash flow','Reported income','Net spending'].includes(node.label)&&!node.detail&&!selectors.length;
 if(!selectors.length&&!summary)return '';
 const data=encodeURIComponent(JSON.stringify({label:node.label,selectors,summary}));
 return `data-chart-detail="${data}" ${keyboard?'tabindex="0" role="button"':''}`;
}
function bindChartActivation(element,run){
 element.onclick=run;
 element.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();run();}};
}
function bindChartDetails(target,filters){
 target.querySelectorAll('[data-chart-detail]').forEach(element=>{
   const detail=JSON.parse(decodeURIComponent(element.dataset.chartDetail));
   bindChartActivation(element,()=>openChartDetail(detail.label,filters,detail.selectors,detail.summary));
 });
}
async function openChartDetail(label,filters,selectors,summary=false){
 const dialog=payrollDialog(label),body=dialog.querySelector('.payroll-dialog-body');
 dialog.classList.add('budget-transactions-dialog');
 body.textContent='Loading…';
 try{
   const params=new URLSearchParams({...filters,detail:JSON.stringify(selectors)});
   const result=await api('/api/reports?'+params);
   if(!dialog.open)return;
   const range=filters.from||filters.to?[filters.from?txDateLabel(filters.from):'Beginning',filters.to?txDateLabel(filters.to):'Latest'].join(' – '):'All time';
   const explanation=label==='Net savings'?'Income remaining after expenses for this period.':label==='From existing funds'?'Spending above income for this period.':'All activity behind this total.';
   body.innerHTML=`<p class="chart-caption">${esc(range)} · ${result.count} entries${result.count>result.rows.length?' · showing latest '+result.rows.length:''}</p>
     ${summary?`<p>${explanation}</p>`:''}
     ${result.rows.length?`<div class="table-scroll"><table><thead><tr><th>Date</th><th>Transaction</th><th>Account</th><th>Amount</th></tr></thead><tbody>${result.rows.map(row=>`<tr><td>${esc(txDateLabel(row.date))}</td><td>${esc(row.merchant||row.category)} <span class="muted">${esc(row.category)}</span></td><td>${esc(row.account||'')}</td><td class="budget-tx-amount ${row.amount>0?'amount-pos':'amount-neg'}">${money(row.amount)}</td></tr>`).join('')}</tbody></table></div>`:'<p>No posted transactions match this selection.</p>'}`;
 }catch(error){if(dialog.open)body.textContent=error.message;}
}
function reportSetPreset(){
 const preset=$('reportPreset').value,today=localToday(),now=new Date(today+'T12:00:00'),year=now.getFullYear(),month=now.getMonth();
 const fmt=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
 if(preset==='all'){$('reportFrom').value='';$('reportTo').value='';}
 else if(preset!=='custom'){
   const start=preset==='month'?new Date(year,month,1):preset==='previous'?new Date(year,month-1,1):preset==='ytd'?new Date(year,0,1):new Date(year,month-11,1);
   $('reportFrom').value=fmt(start);
   $('reportTo').value=preset==='previous'?fmt(new Date(year,month,0)):today;
 }
 loadReports();
}
const reportDateControl=$('reportDatePanel');
$('reportRangeLabel').remove();
reportDateControl.querySelector('summary').innerHTML='<span id="reportRangeLabel">All time</span>';
reportDateControl.querySelector('summary').setAttribute('aria-label','Report date range');
function positionReportDates(){
 if(!reportDateControl.open)return;
 const trigger=reportDateControl.querySelector('summary').getBoundingClientRect();
 const fields=reportDateControl.querySelector('.report-popover-fields');
 const width=Math.min(340,innerWidth-24);
 fields.style.width=width+'px';
 fields.style.left=Math.max(12,Math.min(trigger.left,innerWidth-width-12))+'px';
 fields.style.top=trigger.bottom+8+'px';
 fields.style.right='auto';
}
reportDateControl.addEventListener('toggle',positionReportDates);
window.addEventListener('resize',positionReportDates);
$('reportPreset').add(new Option('This month','month'),1);
$('reportPreset').add(new Option('Last month','previous'),2);

$('reportPreset').onchange=reportSetPreset;['reportFrom','reportTo'].forEach(id=>$(id).onchange=()=>{$('reportPreset').value='custom';loadReports();});['reportAccount','reportCategory','reportPeriod','reportGroup','reportVisual'].forEach(id=>$(id).onchange=loadReports);$('clearReportDates').onclick=()=>{$('reportPreset').value='all';reportSetPreset();};$('clearReportFilters').onclick=()=>{$('reportAccount').value='';$('reportCategory').value='';loadReports();};document.querySelectorAll('[data-report-mode]').forEach(b=>b.onclick=()=>{reportMode=b.dataset.reportMode;loadReports();});
$('downloadReportCsv').onclick=()=>{if(!reportData)return;const csv=rowsToCsv([['Type','Group','Category / name','Amount'],...(reportMode!=='spending'?reportData.income.map(r=>['Income',r.group,r.label,r.total]):[]),...(reportMode!=='income'?reportData.expense.map(r=>['Expense',r.group,r.label,r.total]):[])]);downloadBlob('pulse-report.csv',csv,'text/csv');};
function rowsToCsv(rows){return rows.map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')).join('\r\n');}
$('downloadReport').onclick=async()=>{try{const svg=$('reportChart').querySelector('svg');if(!svg)throw Error('Choose Trend bars or Sankey to export a chart.');const clone=svg.cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.querySelectorAll('*').forEach((el,i)=>{const source=svg.querySelectorAll('*')[i],style=getComputedStyle(source);for(const key of ['fill','stroke','stroke-width','opacity','font-family','font-size','font-weight'])el.style.setProperty(key,style.getPropertyValue(key));});const fontStyle=document.createElementNS('http://www.w3.org/2000/svg','style');const fontFaces=await Promise.all([400,600].map(async weight=>{const response=await fetch('/fonts/ibm-plex-sans-latin-'+weight+'-normal.woff2');if(!response.ok)throw Error('Could not load export font.');const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return '@font-face{font-family:"IBM Plex Sans";font-weight:'+weight+';src:url(data:font/woff2;base64,'+btoa(binary)+') format("woff2");}';}));fontStyle.textContent=fontFaces.join('');clone.prepend(fontStyle);const box=svg.viewBox.baseVal,canvas=document.createElement('canvas');canvas.width=Math.ceil(box.width*2);canvas.height=Math.ceil(box.height*2);const ctx=canvas.getContext('2d');ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--surface-elevated');ctx.fillRect(0,0,canvas.width,canvas.height);const image=new Image(),url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'}));try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});ctx.drawImage(image,0,0,canvas.width,canvas.height);const link=document.createElement('a');link.download='pulse-report.png';link.href=canvas.toDataURL('image/png');link.click();}finally{URL.revokeObjectURL(url);}}catch(error){$('reportMsg').textContent=error.message||'Could not export chart.';}};
function renderForecast(){const start=Number($('forecastStart').value),monthly=Number($('forecastMonthly').value),rate=Number($('forecastRate').value),years=Number($('forecastYears').value);if(![start,monthly,rate,years].every(Number.isFinite)||start<0||monthly<0||rate<0||rate>50){$('forecastChart').textContent='Enter nonnegative amounts and growth between 0 and 50%.';return;}let value=start;const points=[start];for(let m=1;m<=years*12;m++){value=value*(1+rate/1200)+monthly;if(m%12===0)points.push(value);}const max=Math.max(1,...points),path=points.map((v,i)=>`${i?'L':'M'}${20+i/years*760},${220-v/max*190}`).join(' ');$('forecastChart').innerHTML=`<h3>${money(value)} after ${years} years</h3><p class="muted">Contributions ${money(start+monthly*12*years)} · Scenario growth ${money(value-start-monthly*12*years)}. Contributions added at the end of each month.</p><svg class="scenario-chart" viewBox="0 0 800 250" role="img" aria-label="Savings scenario over ${years} years"><path d="${path}" fill="none" stroke="#74b9e9" stroke-width="3"/>${points.map((v,i)=>`<circle cx="${20+i/years*760}" cy="${220-v/max*190}" r="4" fill="#ed7da8"><title>Year ${i}: ${money(v)}</title></circle>`).join('')}</svg>`;}
['forecastStart','forecastMonthly','forecastRate','forecastYears'].forEach(id=>$(id).oninput=renderForecast);
async function loadSavedReports(){const d=await api('/api/report-views');const previous=$('savedReport').value;$('savedReport').innerHTML='<option value="">Saved reports</option>'+d.items.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('');$('savedReport').value=previous;$('savedReport').onchange=()=>{const saved=d.items.find(r=>r.id===$('savedReport').value);if(!saved)return;const c=saved.config;for(const [id,key]of Object.entries({reportFrom:'from',reportTo:'to',reportPeriod:'period',reportGroup:'grouping',reportVisual:'visual',reportPreset:'preset'}))if(c[key]!==undefined)$(id).value=c[key];for(const [id,key]of [['reportAccount','account'],['reportCategory','category']]){if(c[key]&&!Array.from($(id).options).some(o=>o.value===c[key]))$(id).add(new Option(c[key],c[key]));$(id).value=c[key]||'';}reportMode=['income','spending'].includes(c.mode)?c.mode:'cashflow';loadReports();};}
$('saveReportView').onclick=()=>{const dialog=document.createElement('dialog');dialog.innerHTML='<form><h3>Save report</h3><label>Name<input name="name" required maxlength="80" placeholder="e.g. Monthly spending"/></label><p role="status"></p><div class="dialog-actions"><button type="button">Cancel</button><button class="primary">Save</button></div></form>';document.body.append(dialog);dialog.querySelector('[type=button]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();try{await post('/api/report-views',{name:e.target.elements.name.value,config:{...Object.fromEntries(reportParams()),mode:reportMode,visual:$('reportVisual').value,preset:$('reportPreset').value}});await loadSavedReports();dialog.close();}catch(error){dialog.querySelector('[role=status]').textContent=error.message;}};dialog.showModal();};
const reportControls=$('reportHeaderControls');ownerSwitcher.before(reportControls);reportControls.classList.add('report-header-tools');function updateReportHeader(){const active=document.body.classList.contains('signed-in')&&!$('view-reports').classList.contains('hidden');reportControls.classList.toggle('hidden',!active);if(!active){$('reportDatePanel').open=false;$('reportFilterPanel').open=false;}else loadSavedReports().catch(error=>$('reportMsg').textContent=error.message);}new MutationObserver(updateReportHeader).observe($('view-reports'),{attributes:true,attributeFilter:['class']});new MutationObserver(updateReportHeader).observe(document.body,{attributes:true,attributeFilter:['class']});updateReportHeader();
