/* Account workspace. Manual balances are recorded by the server, not inferred from expenses. */
let accountsOverviewData, accountEditorId = null, summaryInPercent = false, accountRequest = 0;
const accountTypeNames = { checking:'Chequing', savings:'Savings', cash:'Cash', investment:'Investment', credit:'Credit card', other:'Other asset', loan:'Loan' };
const accountGroupColors={cash:'#2eae82',investments:'#3e9df5',other:'#e2b15b',credit:'#f05b6c',loans:'#ce3d55'};
const financialSeriesColor=(id,side)=>side==='liabilities'?(id==='loans'?'#ce3d55':'#f05b6c'):(id==='credit'||id==='loans'?'#2eae82':accountGroupColors[id]);
async function loadAccountsOverview() {
  const request = ++accountRequest;
  const params = new URLSearchParams({ period:$('accountsRange').value,frequency:$('accountsFrequency').value,group:$('accountsGroup').value,account:$('accountsSpecific').value,minAmount:$('accountsMinAmount').value,maxAmount:$('accountsMaxAmount').value,q:$('accountsSearch').value });
  try {
    const data = await api('/api/accounts-overview?' + params);
    if (request !== accountRequest) return;
    accountsOverviewData = data;
    const selected=$('accountsSpecific').value;
    $('accountsSpecific').innerHTML='<option value="">All accounts</option>'+data.accountOptions.map(a=>`<option value="${esc(a.value)}">${esc(a.label)}</option>`).join('');
    $('accountsSpecific').value=selected;
    $('accountsNetWorth').textContent = money(data.netWorth);
    $('accountsChange').textContent = data.change === null ? 'Your first balance snapshot. A clearer picture starts here.' : `${data.change>=0?'+':'−'}${money(Math.abs(data.change))}${data.changePercent!==null?` (${data.changePercent>0?'+':''}${data.changePercent}%)`:''} since ${shortAccountDate(data.history[0].date)}`;
    $('accountFilterCount').textContent=[params.get('account'),params.get('group'),params.get('minAmount'),params.get('maxAmount')].filter(Boolean).length||'';
    renderBalanceHistory(data.history,'accountsHistoryPanel');
    renderAccountsChart();
    renderAccountGroups(); renderAccountsSummary();
    $('accountsMsg').textContent = '';
  } catch(e) { if(request === accountRequest) $('accountsMsg').textContent = e.message; }
}
function shortAccountDate(date) { return new Date(date+'T12:00:00Z').toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}); }
function renderNetWorthChart(points,hostId='accountsChart') {
  const host=$(hostId);
  if(!points.length){host.innerHTML='<div class="account-chart-empty"><p>No visible balances for these filters.</p></div>';return;}
  const W=Math.max(290,Math.min(1200,host.clientWidth||1000)),H=230,L=65,R=24,T=22,B=38;
  const min=Math.min(...points.map(p=>p.value)),max=Math.max(...points.map(p=>p.value));
  const padding=Math.max((max-min)*.2,Math.abs(max)*.025,10),bottom=min-padding,top=max+padding;
  const first=Date.parse(points[0].date),last=Date.parse(points.at(-1).date);
  const x=p=>points.length===1?(L+W-R)/2:L+(Date.parse(p.date)-first)/Math.max(1,last-first)*(W-L-R);
  const y=v=>H-B-(v-bottom)/(top-bottom)*(H-T-B);
  const path=points.map((p,i)=>`${i?'L':'M'} ${x(p)} ${y(p.value)}`).join(' ');
  const grid=Array.from({length:4},(_,i)=>{const v=bottom+(top-bottom)*i/3;return `<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/><text x="${L-12}" y="${y(v)+4}" text-anchor="end">${esc(new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',notation:'compact',maximumFractionDigits:1}).format(v))}</text>`;}).join('');
  const labels=points.length===1?[points[0]]:[points[0],points[Math.floor((points.length-1)/2)],points.at(-1)];
  const fillId=hostId+'-fill';
  host.innerHTML=`<svg class="networth-chart" role="group" aria-label="${points[0].accountLabel?'Account balance':'Net worth'} line chart" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="${fillId}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#3e9df5" stop-opacity=".25"/><stop offset="1" stop-color="#3e9df5" stop-opacity=".02"/></linearGradient></defs>${grid}${points.length>1?`<path d="${path} V ${H-B} H ${x(points[0])} Z" fill="url(#${fillId})" opacity="${hostId==='detailBalanceChart'?1:.15}"/><path d="${path}" class="chart-line"/>`:''}${points.map((p,i)=>`<circle data-performance-point="${i}" tabindex="${i===points.length-1?0:-1}" role="button" aria-label="${esc(shortAccountDate(p.date))}: ${money(p.value)}. Show details." cx="${x(p)}" cy="${y(p.value)}" r="${points.length===1?5:2}" class="chart-point"/>`).join('')}${[...new Map(labels.map(p=>[p.date,p])).values()].map(p=>`<text x="${x(p)}" y="${H-9}" text-anchor="middle">${esc(new Date(p.date+'T12:00:00Z').toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'UTC'}))}</text>`).join('')}</svg>`;
  attachLineInspector(host.querySelector('svg'),points,x,y,T,H-B,false);
}
function attachLineInspector(svg,points,x,y,top,bottom,isBreakdown){
 const ns='http://www.w3.org/2000/svg',cursor=document.createElementNS(ns,'g');cursor.classList.add('chart-cursor','hidden');cursor.setAttribute('aria-hidden','true');
 const guide=document.createElementNS(ns,'line');guide.classList.add('graph-cursor-guide');guide.setAttribute('y1',top);guide.setAttribute('y2',bottom);
 const dot=document.createElementNS(ns,'circle');dot.classList.add('graph-cursor-dot');dot.setAttribute('r','5');cursor.append(guide,dot);svg.append(cursor);
 const show=(i,event,target=svg)=>{const px=x(points[i],i);cursor.classList.remove('hidden');cursor.dataset.index=i;guide.setAttribute('x1',px);guide.setAttribute('x2',px);dot.setAttribute('cx',px);dot.setAttribute('cy',y(points[i].value));showAccountTooltip(points[i],points[i-1],event,target,isBreakdown);};
 svg.onpointermove=e=>{const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const local=p.matrixTransform(svg.getScreenCTM().inverse());let nearest=0;for(let i=1;i<points.length;i++)if(Math.abs(x(points[i],i)-local.x)<Math.abs(x(points[nearest],nearest)-local.x))nearest=i;show(nearest,e);};
 svg.onclick=svg.onpointermove;svg.onpointerleave=hideAccountTooltip;
 const nodes=[...svg.querySelectorAll('[data-performance-point],[data-breakdown-month]')];
 nodes.forEach((node,i)=>{
  const originalClick=node.onclick,originalKey=node.onkeydown;
  node.setAttribute('tabindex',i===nodes.length-1?'0':'-1');
  node.onfocus=e=>show(i,e,node);node.onblur=hideAccountTooltip;
  node.onclick=e=>{if(originalClick)originalClick(e);show(i,e,node);};
  node.onkeydown=e=>{
   if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const next=Math.max(0,Math.min(nodes.length-1,i+(e.key==='ArrowLeft'?-1:1)));node.setAttribute('tabindex','-1');nodes[next].setAttribute('tabindex','0');nodes[next].focus();}
   else if(e.key==='Escape')hideAccountTooltip();
   else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(originalKey)originalKey(e);show(i,e,node);}
  };
 });
}
function renderBalanceHistory(points,hostId,label='Net worth'){
 const detailed=label==='Net worth';
 $(hostId).innerHTML=points.length?`<div class="history-table-wrap"><table><thead><tr><th>Date</th>${detailed?'<th>Assets</th><th>Liabilities</th>':''}<th>${esc(label)}</th></tr></thead><tbody>${[...points].reverse().map(p=>`<tr><td>${esc(shortAccountDate(p.date))}</td>${detailed?`<td>${money(p.totalAssets)}</td><td class="money-liability">${money(p.totalLiabilities)}</td>`:''}<td>${money(p.value)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">No history for this selection.</p>';
}

function accountSparkline(history) {
  // A sparkline needs observations on at least two dates.
  const points=[...new Map(history.map(h=>[h.date,h])).values()];
  if(points.length<2)return '<span class="sparkline-placeholder">Building history</span>';
  const lo=Math.min(...points.map(p=>p.balance)),hi=Math.max(...points.map(p=>p.balance));
  const path=points.map((p,i)=>`${i?'L':'M'} ${3+i/(points.length-1)*94} ${27-(p.balance-lo)/Math.max(1,hi-lo)*22}`).join(' ');
  return `<svg class="account-sparkline" viewBox="0 0 100 32" role="img" aria-label="Recorded balance trend"><path d="${path}"/></svg>`;
}
function renderAccountGroups() {
  if(!accountsOverviewData)return;
  const q=$('accountsSearch').value.trim().toLowerCase(),sort=$('accountsSort').value;
  const groups=accountsOverviewData.groups.map(g=>({...g,items:g.items.filter(a=>`${a.name} ${a.person||''} ${a.institution||''}`.toLowerCase().includes(q)).sort((a,b)=>sort==='balance'?Math.abs(b.balance)-Math.abs(a.balance):sort==='balance-asc'?Math.abs(a.balance)-Math.abs(b.balance):sort==='institution'?(a.institution||'').localeCompare(b.institution||''):sort==='name-desc'?b.name.localeCompare(a.name):a.name.localeCompare(b.name))})).filter(g=>g.items.length);
  $('accountList').innerHTML=groups.map(g=>`<details class="card account-group" open><summary><span>${esc(g.label)} <small>${g.items.length}</small></span><strong>${money(g.items.reduce((sum,a)=>sum+Math.round(a.balance*100),0)/100)}</strong></summary><div>${g.items.map(a=>`<div class="account-row ${a.includeInOverview===false?'overview-excluded':''}"><button class="account-open" data-open-account="${a.key}"><span class="institution-mark" aria-hidden="true">${esc((a.institution||a.name).trim().charAt(0).toUpperCase())}</span><span class="account-row-info"><strong>${esc(a.name)}</strong><small class="account-row-meta"><span>${esc(a.institution||accountTypeNames[a.type]||'Account')}</span>${accountOwnerBadges(a)}${a.includeInOverview===false?'<span>Hidden from overview</span>':''}</small></span><span class="account-row-trend">${accountSparkline(a.history)}</span><span class="account-row-money"><strong>${money(a.balance)}</strong><small>${a.type==='credit'||a.kind==='loan'?'Amount owed':'Balance'}</small></span><span aria-hidden="true">›</span></button><button class="visibility-toggle" role="switch" aria-checked="${a.includeInOverview!==false}" data-overview-key="${a.key}" aria-label="Include ${esc(a.name)} in overview" title="${a.includeInOverview===false?'Show in overview':'Hide from overview'}">${overviewEye(a.includeInOverview!==false)}</button></div>`).join('')}</div></details>`).join('');
  $('accountsEmpty').classList.toggle('hidden',groups.length>0);
  document.querySelectorAll('[data-open-account]').forEach(b=>b.onclick=()=>openAccountDetail(b.dataset.openAccount));
  document.querySelectorAll('[data-overview-key]').forEach(b=>b.onclick=async()=>{
    b.disabled=true;
    try{await setOverviewVisibility(b.dataset.overviewKey,b.getAttribute('aria-checked')!=='true');await loadAccountsOverview();loadDashboard();}
    catch(e){$('accountsMsg').textContent=e.message;}finally{b.disabled=false;}
  });
}
function overviewEye(shown){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${shown?'':'<path d="m3 3 18 18"/>'}</svg>`;}
async function setOverviewVisibility(key,include){const [kind,id]=key.split(':');await put('/api/'+(kind==='loan'?'loans':'accounts')+'/'+id,{includeInOverview:include});}

function renderAccountsSummary() {
  const d=accountsOverviewData;if(!d)return;
  const display=(value,total)=>summaryInPercent?`${total?(value/total*100).toFixed(1):'0.0'}%`:money(value);
  const section=(label,total,list)=>`<section class="summary-section"><div class="summary-heading"><strong>${label}</strong><strong>${money(total)}</strong></div><div class="summary-stack" aria-hidden="true">${list.map(g=>`<span style="flex:${g.total};background:${financialSeriesColor(g.id,label==='Liabilities'?'liabilities':'assets')}"></span>`).join('')}</div>${list.map(g=>`<div class="summary-breakdown" data-financial-group="${g.id}" data-financial-side="${label==='Liabilities'?'liabilities':'assets'}"><span><i style="background:${financialSeriesColor(g.id,label==='Liabilities'?'liabilities':'assets')}"></i>${esc(g.label)}</span><strong>${display(g.total,total)}</strong></div>`).join('')||'<p class="muted">Nothing recorded yet.</p>'}</section>`;
  $('accountsSummary').innerHTML=section('Assets',d.totalAssets,d.assets)+section('Liabilities',d.totalLiabilities,d.liabilities)+`<div class="summary-heading summary-net"><strong>Net worth</strong><strong>${money(d.netWorth)}</strong></div>`;
  $('summaryTotals').setAttribute('aria-pressed',String(!summaryInPercent));$('summaryPercent').setAttribute('aria-pressed',String(summaryInPercent));
}
function openAccountEditor(a) {
  accountEditorId=a?.id||null;$('accountForm').reset();$('accountFormMsg').textContent='';$('accountDeleteConfirm').classList.add('hidden');
  $('accountDialogTitle').textContent=a?'Edit account':'Add an account';$('deleteAccountBtn').classList.toggle('hidden',!a);
  const fields={aName:'name',aType:'type',aInst:'institution',aBalance:'balance',aMin:'minimumPayment',aPayFrom:'payFromAccountId',aBalanceDate:'balanceAsOf',aStatementClose:'statementCloseDate',aStatementIssue:'statementIssueDate',aPaymentDue:'paymentDueDate',aStatementBalance:'statementBalance',aLimitType:'creditLimitType',aLimitAmount:'creditLimit'};
  for(const [id,key] of Object.entries(fields)) $(id).value=a?.[key]??(id==='aType'?'checking':id==='aPerson'?activeOwnerName():'');
  $('aLimitType').value=a?.creditLimitType||(a?.creditLimit>0?'fixed':'unknown');updateCardLimitField();$('aSourceName').value=a?.sourceName||a?.nameHistory?.[0]?.from||a?.nameAliases?.[0]||a?.name||'';renderAccountOwners(a);updateCreditFields();$('creditAccountOptions').open=!!(a?.payFromAccountId||a?.statementCloseDate||a?.paymentDueDate);
  $('accountDialog').showModal();
}
$('accountForm').onsubmit=async e=>{
  e.preventDefault();const button=$('addAccountBtn');button.disabled=true;
  try {
    const values={displayName:$('aName').value.trim(),name:$('aName').value.trim(),type:$('aType').value,owners:[...document.querySelectorAll('[data-account-owner]:checked')].map(c=>c.value),institution:$('aInst').value.trim(),balance:Number($('aBalance').value),balanceAsOf:$('aBalanceDate').value,...($('aType').value==='credit'?{creditLimitType:$('aLimitType').value,creditLimit:$('aLimitType').value==='fixed'?Number($('aLimitAmount').value):null,minimumPayment:Number($('aMin').value||0),payFromAccountId:$('aPayFrom').value,balanceAsOf:$('aBalanceDate').value,statementCloseDate:$('aStatementClose').value,statementIssueDate:$('aStatementIssue').value,paymentDueDate:$('aPaymentDue').value,statementBalanceAsOf:$('aStatementBalance').value===''?'':($('aStatementBalance').value===String(accountsCache.find(a=>a.id===accountEditorId)?.statementBalance??'')?accountsCache.find(a=>a.id===accountEditorId)?.statementBalanceAsOf||localToday():localToday()),statementBalance:$('aStatementBalance').value===''?null:Number($('aStatementBalance').value)}:{minimumPayment:0,payFromAccountId:''})};
    if(accountEditorId)await put('/api/accounts/'+accountEditorId,values);else await post('/api/accounts',values);
    $('accountDialog').close();await refreshOwnerChoices();await refreshAccounts();if(activeAccountKey==='account:'+accountEditorId&&!accountsCache.some(a=>a.id===accountEditorId))goView('accounts');await loadAccountsLoans();await refreshOpenAccountDetail();loadDashboard();
  }catch(e){$('accountFormMsg').textContent=e.message;}finally{button.disabled=false;}
};
$('closeAccount').onclick=()=>$('accountDialog').close();$('newAccountBtn').onclick=()=>openAccountEditor();
$('deleteAccountBtn').onclick=()=>$('accountDeleteConfirm').classList.remove('hidden');
$('cancelDeleteAccount').onclick=()=>$('accountDeleteConfirm').classList.add('hidden');
$('confirmDeleteAccount').onclick=async()=>{
  const button=$('confirmDeleteAccount');button.disabled=true;
  try{await del('/api/accounts/'+accountEditorId);$('accountDialog').close();await refreshOwnerChoices();await refreshAccounts();if(activeAccountKey==='account:'+accountEditorId&&!accountsCache.some(a=>a.id===accountEditorId))goView('accounts');await loadAccountsLoans();loadDashboard();}
  catch(e){$('accountFormMsg').textContent=e.message;}finally{button.disabled=false;}
};
['accountsSpecific','accountsGroup','accountsRange','accountsFrequency','accountsMinAmount','accountsMaxAmount'].forEach(id=>$(id).onchange=loadAccountsOverview);
let accountSearchTimer;$('accountsSearch').oninput=()=>{clearTimeout(accountSearchTimer);accountSearchTimer=setTimeout(loadAccountsOverview,180);};$('accountsSort').onchange=renderAccountGroups;
$('summaryTotals').onclick=()=>{summaryInPercent=false;renderAccountsSummary();};$('summaryPercent').onclick=()=>{summaryInPercent=true;renderAccountsSummary();};
$('downloadAccounts').onclick=()=>{
  if(!accountsOverviewData)return;
  // Prefix spreadsheet formula markers in text columns; quoting alone doesn't neutralize formulas.
  const text=v=>{v=String(v??'');if(/^[\s]*[=+@-]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';};
  const rows=[['Name','Type','Institution','Owner','Balance (CAD)','Balance recorded at'].map(text).join(',')];
  for(const g of accountsOverviewData.groups)for(const a of g.items)rows.push([text(a.name),text(accountTypeNames[a.type]),text(a.institution),text(accountOwnerLabel(a)),a.balance.toFixed(2),text(a.balanceRecordedAt)].join(','));
  const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='pulse-accounts.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};

let accountChartResize;
window.addEventListener('resize',()=>{
  cancelAnimationFrame(accountChartResize);
  accountChartResize=requestAnimationFrame(()=>{if(accountsOverviewData&&!$('view-accounts').classList.contains('hidden'))renderAccountsChart();});
});

function accountChartControlIcon(mode){
 const head='<svg viewBox="0 0 40 24" aria-hidden="true" focusable="false">';
 if(mode==='breakdown')return head+[8,12,16,20].map((h,i)=>`<rect x="${2+i*9}" y="${21-h}" width="7" height="${h-7}" fill="#22a4c4"/><rect x="${2+i*9}" y="14" width="7" height="4" fill="#2eae82"/><rect x="${2+i*9}" y="19" width="7" height="3" fill="#f05b6c"/>`).join('')+'</svg>';
 if(mode==='allocation')return head+'<circle cx="20" cy="12" r="9" fill="none" stroke="#3e9df5" stroke-width="5"/><path d="M20 3a9 9 0 0 1 9 9" fill="none" stroke="#2eae82" stroke-width="5"/><path d="M29 12a9 9 0 0 1-9 9" fill="none" stroke="#f05b6c" stroke-width="5"/></svg>';
 return head+'<path d="M2 21V18L10 15L17 16L25 9L31 7L38 2V21Z" fill="#22a4c4" fill-opacity=".55"/><path d="M2 18L10 15L17 16L25 9L31 7L38 2" fill="none" stroke="#22a4c4" stroke-width="1.5"/></svg>';
}
function renderAccountsChart() {
  $('accountsChartModeIcon').innerHTML=accountChartControlIcon($('accountsChartMode').value);
  const d=accountsOverviewData;if(!d)return;
  const ratio=d.totalAssets>0?`${(d.totalLiabilities/d.totalAssets*100).toFixed(1)}%`:'—';
  $('accountsChartMetrics').innerHTML=`<div><span>Assets</span><strong>${money(d.totalAssets)}</strong></div><div><span>Debts</span><strong>${money(d.totalLiabilities)}</strong></div><div><span>Debt / assets</span><strong>${ratio}</strong></div>`;
  hideAccountTooltip();
  const mode=$('accountsChartMode').value;
  $('accountsFrequency').classList.toggle('hidden',mode!=='breakdown');
  $('accountsRange').disabled=mode==='allocation';
  $('accountsChartHelp').textContent=mode==='breakdown'?'Assets above zero · liabilities below zero. Hover or tap for details.':mode==='allocation'?'Select an account type to filter your accounts.':'Hover or tap the line for details.';
  if(mode==='breakdown')renderBreakdownChart(d.breakdown||[]);
  else if(mode==='allocation')renderAccountAllocation(d);
  else renderNetWorthChart(d.history);
}
$('accountsChartMode').onchange=renderAccountsChart;
function chartGroupLegend(groups) {
  return groups.map(g=>`<button class="chart-key" data-chart-group="${g.id}"><i style="background:${accountGroupColors[g.id]}"></i>${esc(g.label)}</button>`).join('');
}
function bindChartGroupFilters() {
  document.querySelectorAll('[data-chart-group]').forEach(b=>b.onclick=()=>{$('accountsGroup').value=b.dataset.chartGroup;loadAccountsOverview();});
}
function renderBreakdownChart(points) {
  if(!points.length){renderNetWorthChart([]);return;}
  const L=65,R=26,T=24,B=42,H=280;
  const W=Math.max(290,$('accountsChart').clientWidth,points.length*68+L+R);
  const highest=Math.max(1,...points.map(p=>p.totalAssets)),lowest=-Math.max(0,...points.map(p=>p.totalLiabilities));
  const top=highest*1.12,bottom=lowest<0?lowest-(highest-lowest)*.08:0;
  const y=value=>H-B-(value-bottom)/(top-bottom)*(H-T-B);
  const step=(W-L-R)/points.length,barWidth=Math.min(50,step*.55),x=i=>L+step*(i+.5);
  const groupMap=new Map(points.flatMap(p=>[...p.assets,...p.liabilities]).map(g=>[g.id,g]));
  const grid=Array.from({length:4},(_,i)=>bottom+(top-bottom)*i/3).filter(v=>Math.abs(y(v)-y(0))>18).map(v=>`<line class="chart-grid" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-12}" y="${y(v)+4}" text-anchor="end">${esc(new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',notation:'compact',maximumFractionDigits:1}).format(v))}</text>`).join('');
  const bars=points.map((p,i)=>{
    let positive=0,negative=0;
    const assets=p.assets.map(g=>{const lower=positive;positive+=g.total;return `<rect data-breakdown-segment="asset" x="${x(i)-barWidth/2}" y="${y(positive)}" width="${barWidth}" height="${y(lower)-y(positive)}" fill="${financialSeriesColor(g.id,'assets')}"><title>${esc(g.label)}: ${money(g.total)}</title></rect>`;}).join('');
    const debts=p.liabilities.map(g=>{const upper=negative;negative-=g.total;return `<rect data-breakdown-segment="debt" x="${x(i)-barWidth/2}" y="${y(upper)}" width="${barWidth}" height="${y(negative)-y(upper)}" fill="${financialSeriesColor(g.id,'liabilities')}"><title>${esc(g.label)} owed: ${money(g.total)}</title></rect>`;}).join('');
    const month=breakdownLabel(p,true);
    return `<g class="breakdown-month" tabindex="0" role="button" data-breakdown-month="${i}" aria-label="${esc(month)}: assets ${money(p.totalAssets)}, debts ${money(p.totalLiabilities)}, net worth ${money(p.value)}. Show details.">${assets}${debts}<rect class="month-hit" x="${x(i)-step/2+2}" y="${T}" width="${step-4}" height="${H-T-B}" fill="transparent"/><text x="${x(i)}" y="${H-13}" text-anchor="middle">${esc(month)}</text></g>`;
  }).join('');
  const line=points.map((p,i)=>`${i?'L':'M'} ${x(i)} ${y(p.value)}`).join(' ');
  $('accountsChart').innerHTML=`<div class="chart-legend">${chartGroupLegend([...groupMap.values()])}<span class="networth-key">— Net worth</span></div><div class="chart-scroll" tabindex="0" role="region" aria-label="Monthly asset and debt breakdown chart"><svg class="networth-chart breakdown-chart" style="width:${W}px" viewBox="0 0 ${W} ${H}" role="group" aria-label="Assets above zero, debts below zero, and net worth by month">${grid}<line class="chart-zero" x1="${L}" x2="${W-R}" y1="${y(0)}" y2="${y(0)}"/><text x="${L-12}" y="${y(0)+4}" text-anchor="end">$0</text>${bars}<path class="chart-line breakdown-net-line" d="${line}" pointer-events="none"/>${points.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.value)}" r="3.5" class="chart-point" pointer-events="none"/>`).join('')}</svg></div><div id="breakdownDetails" class="breakdown-details" role="status" aria-live="polite"></div>`;
  function select(index){
    const p=points[index];
    document.querySelectorAll('[data-breakdown-month]').forEach(g=>g.setAttribute('aria-pressed',String(Number(g.dataset.breakdownMonth)===index)));
    $('breakdownDetails').innerHTML=`<strong>${esc(breakdownLabel(p))} · as of ${esc(shortAccountDate(p.date))}</strong><div class="breakdown-detail-values"><span>Assets <b>${money(p.totalAssets)}</b></span><span>Debts <b>${money(p.totalLiabilities)}</b></span><span>Net worth <b>${money(p.value)}</b></span></div><div class="breakdown-group-values">${p.assets.map(g=>`<span>${esc(g.label)}: ${money(g.total)}</span>`).join('')}${p.liabilities.map(g=>`<span>${esc(g.label)} owed: ${money(g.total)}</span>`).join('')}</div>`;
  }
  document.querySelectorAll('[data-breakdown-month]').forEach(g=>{g.onclick=()=>select(Number(g.dataset.breakdownMonth));g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(Number(g.dataset.breakdownMonth));}};});
  select(points.length-1);bindChartGroupFilters();
  attachLineInspector($('accountsChart').querySelector('svg'),points,(_p,i)=>x(i),y,T,H-B,true);
  const scroll=$('accountsChart').querySelector('.chart-scroll');
  if(scroll.scrollWidth>scroll.clientWidth){scroll.scrollLeft=scroll.scrollWidth;$('accountsChartHelp').textContent+=' Swipe or scroll sideways for earlier months.';}
}
function renderAccountAllocation(d) {
  const panel=(title,total,groups)=>{
    let offset=0;
    const rings=groups.map(g=>{const percent=g.total/total*100;const circle=`<circle cx="120" cy="120" r="90" pathLength="100" fill="none" stroke="${financialSeriesColor(g.id,title==='Debts'?'liabilities':'assets')}" stroke-width="23" stroke-dasharray="${percent} ${100-percent}" stroke-dashoffset="${-offset}" transform="rotate(-90 120 120)"><title>${esc(g.label)}: ${money(g.total)} (${percent.toFixed(1)}%)</title></circle>`;offset+=percent;return circle;}).join('');
    return `<section class="allocation-panel"><h3>${title}</h3><svg viewBox="0 0 240 240" role="img" aria-label="${title}: ${money(total)} by account type"><circle cx="120" cy="120" r="90" class="allocation-track"/>${rings}<text x="120" y="114" text-anchor="middle" class="allocation-caption">${title}</text><text x="120" y="143" text-anchor="middle" class="allocation-total">${esc(money(total))}</text></svg><div>${groups.map(g=>`<button class="allocation-row" data-chart-group="${g.id}"><span><i style="background:${financialSeriesColor(g.id,title==='Debts'?'liabilities':'assets')}"></i>${esc(g.label)}</span><span><strong>${money(g.total)}</strong><small>${(g.total/total*100).toFixed(1)}%</small></span></button>`).join('')||`<p class="muted">No ${title.toLowerCase()} recorded for these filters.</p>`}</div></section>`;
  };
  $('accountsChart').innerHTML=`<div class="allocation-grid">${panel('Assets',d.totalAssets,d.assets)}${panel('Debts',d.totalLiabilities,d.liabilities)}</div>`;bindChartGroupFilters();
}

function breakdownLabel(point,short=false){
 const frequency=accountsOverviewData?.frequency||'monthly';
 if(frequency==='yearly')return point.periodKey||point.month.slice(0,4);
 if(frequency==='quarterly')return (point.periodKey||'').replace('-',' ');
 return new Date(point.month+'-15T12:00:00Z').toLocaleDateString('en-CA',{month:short?'short':'long',year:short?'2-digit':'numeric',timeZone:'UTC'});
}
function hideAccountTooltip(){const tip=document.getElementById('accountTooltip');if(tip)tip.classList.add('hidden');document.querySelectorAll('.chart-cursor').forEach(c=>c.classList.add('hidden'));}
function showAccountTooltip(point,previous,event,target,isBreakdown){
 let tip=document.getElementById('accountTooltip');
 if(!tip){tip=document.createElement('div');tip.id='accountTooltip';tip.className='account-tooltip';tip.setAttribute('role','tooltip');document.body.appendChild(tip);}
 const net=point.value,change=previous?Math.round((net-previous.value)*100)/100:null;
 const delta=value=>value===null?'':`<small class="${(point.accountLabel==='Amount owed'?value>0:value<0)?'delta-negative':'delta-positive'}">${value>0?'+':value<0?'−':''}${money(Math.abs(value))}</small>`;
 const rows=(side,label)=>point[side].map(g=>{const before=previous?.[side]?.find(v=>v.id===g.id)?.total||0;const change=previous?Math.round((g.total-before)*100)/100:null;return `<div class="tooltip-row"><span><i style="background:${financialSeriesColor(g.id,side)}"></i>${esc(g.label)}${label?' <small>owed</small>':''}</span><span><b>${money(g.total)}</b>${delta(change)}</span></div>`;}).join('');
 tip.innerHTML=`<strong>${esc(isBreakdown?breakdownLabel(point):shortAccountDate(point.date))}</strong>${point.accountLabel?'':rows('assets',false)+rows('liabilities',true)}<div class="tooltip-row tooltip-net"><strong>${esc(point.accountLabel||'Net worth')}</strong><span><b>${money(net)}</b>${change===0?'':delta(change)}</span></div><div class="tooltip-caption">${previous?(change===0?'No change since previous ': 'Change vs. previous ')+(isBreakdown?'period':'balance point'):'First recorded balance in this view'}</div>`;
 tip.classList.remove('hidden');
 const box=target.getBoundingClientRect(),width=Math.min(290,innerWidth-24);
 tip.style.width=width+'px';
 const px=event?.clientX||box.left+box.width/2,py=event?.clientY||box.top;
 tip.style.left=Math.max(12,Math.min(px+14,innerWidth-width-12))+'px';
 tip.style.top=Math.max(12,Math.min(py-tip.offsetHeight-12,innerHeight-tip.offsetHeight-12))+'px';
}
window.addEventListener('scroll',hideAccountTooltip,true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideAccountTooltip();});

$('resetAccountFilters').onclick=()=>{for(const id of ['accountsSearch','accountsSpecific','accountsGroup','accountsMinAmount','accountsMaxAmount'])$(id).value='';$('accountsSort').value='balance';loadAccountsOverview();};

function setAccountsChartTab(history){
 $('accountsOverviewTab').setAttribute('aria-selected',String(!history));$('accountsHistoryTab').setAttribute('aria-selected',String(history));
 $('accountsPlotPanel').classList.toggle('hidden',history);$('accountsHistoryPanel').classList.toggle('hidden',!history);$('accountsChartControls').classList.toggle('hidden',history);hideAccountTooltip();
 if(!history&&accountsOverviewData)renderAccountsChart();
}
$('accountsOverviewTab').onclick=()=>setAccountsChartTab(false);$('accountsHistoryTab').onclick=()=>setAccountsChartTab(true);

function accountOwnerBadges(account){
 const owners=account.owners?.length?account.owners:[account.person].filter(Boolean);
 const profiles=[...new Set(owners.map(name=>/^qifan(?: luo)?$/i.test(name.trim())?'Rebekah':name))];
 return profiles.map(name=>`<span class="account-owner-badge" data-profile="${esc(name.toLowerCase())}"><span class="account-owner-circle" aria-hidden="true">${esc(name.charAt(0).toUpperCase())}</span>${esc(name)}</span>`).join('');
}
function accountOwnerLabel(a){return a.owners?.length?a.owners.join(', '):a.person||'Owner not set';}
function renderAccountOwners(a){
 const names=scopeOwners.filter(o=>!o.value.startsWith('__')).map(o=>o.value),selected=a?.owners?.length?a.owners:(a?.person&&names.includes(a.person)?[a.person]:a?.person==='Household / Joint'?names:a?[]:names.includes(activeOwnerName())?[activeOwnerName()]:[]);
 $('accountOwnerOptions').innerHTML=names.map(name=>`<label><input type="checkbox" data-account-owner value="${esc(name)}" ${selected.includes(name)?'checked':''}/><span>${esc(name)}</span></label>`).join('')||'<p>No named owners yet.</p>';
 const update=()=>{const owners=[...document.querySelectorAll('[data-account-owner]:checked')].map(c=>c.value);$('accountOwnerCaption').textContent=owners.length?owners.join(', '):'Choose owners';};document.querySelectorAll('[data-account-owner]').forEach(c=>c.onchange=update);update();$('accountOwnerPicker').open=false;
}
function updateCreditFields(){const credit=$('aType').value==='credit';document.querySelectorAll('[data-credit-field]').forEach(el=>el.classList.toggle('hidden',!credit));$('aMin').disabled=!credit;$('aPayFrom').disabled=!credit;
 const selected=$('aPayFrom').value;$('aPayFrom').innerHTML='<option value="">Not set</option>'+accountsCache.filter(a=>['checking','savings','cash'].includes(a.type)&&a.id!==accountEditorId).map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');$('aPayFrom').value=selected;
 $('accountBalanceLabel').firstChild.textContent=credit?'Amount owed':'Balance';updateCardLimitField();
}
$('aType').onchange=updateCreditFields;

$('accountsChartModeIcon').innerHTML=accountChartControlIcon($('accountsChartMode').value);

$('aName').addEventListener('input',()=>{if(!accountEditorId)$('aSourceName').value=$('aName').value;});
const creditAccountOptions=document.createElement('details');creditAccountOptions.id='creditAccountOptions';creditAccountOptions.dataset.creditField='';creditAccountOptions.innerHTML='<summary>Statement & payment details</summary><div class="formgrid"></div>';const creditGrid=creditAccountOptions.querySelector('.formgrid');for(const id of ['aLimitType','aLimitAmount','aMin','aPayFrom','aStatementClose','aStatementIssue','aPaymentDue','aStatementBalance'])creditGrid.append($(id).closest('label'));creditAccountOptions.append(document.querySelector('#accountForm p[data-credit-field]'));$('accountFormMsg').before(creditAccountOptions);

function updateCardLimitField(){const fixed=$('aType').value==='credit'&&$('aLimitType').value==='fixed';$('aLimitAmountLabel').classList.toggle('hidden',!fixed);$('aLimitAmount').required=fixed;$('aLimitAmount').disabled=!fixed;}
$('aLimitType').onchange=updateCardLimitField;
