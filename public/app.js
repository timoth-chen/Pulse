const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(Number(n)||0);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* Chart palette: muted greys + one accent only. No rainbow, no bright colours.
   First (largest) slice gets the accent; the rest step down through greys. */
const COLORS=['#3e9df5','#ed7da8','#40af90','#ef5a6b','#e2b15b','#74b9e9','#de95be','#7893bb'];

/* Theme: two explicit buttons, pressed = theme actually on screen, instant switch.
   Never a single button showing the *next* theme, and never a shell-only fade. */
function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('hf-theme', t); } catch (e) {}
  const light = $('themeLight'), dark = $('themeDark');
  if (light && dark) {
    light.setAttribute('aria-pressed', t === 'light' ? 'true' : 'false');
    dark.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#151722' : '#f5f6fa');
}
$('themeLight').onclick = () => applyTheme('light');
$('themeDark').onclick = () => applyTheme('dark');
applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');
const dashboardToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto'}).format(new Date());
let range=(()=>{try{const saved=localStorage.getItem('pulse-dashboard-period');return ['day','week','month','quarter','year','custom'].includes(saved)?saved:'month';}catch{return 'month';}})(),anchor=dashboardToday(),accountsCache=[];

async function api(url, opts={}) {
  const original=url,version=ownerScopeVersion;
  const scoped=url.startsWith('/api/')&&!/^\/api\/(me|owners|profiles|preferences)(?:[/?]|$)/.test(url)&&((!opts.method||opts.method==='GET')||(url.startsWith('/api/funds-check')||/^\/api\/loans\/[^/]+\/preview$/.test(url)));
  if(scoped){const parsed=new URL(url,location.origin);if(parsed.searchParams.has('importOwner'))parsed.searchParams.set('scopeOwner',parsed.searchParams.get('importOwner')==='__everyone__'?'':parsed.searchParams.get('importOwner'));else if(selectedOwner)parsed.searchParams.set('scopeOwner',selectedOwner);url=parsed.pathname+parsed.search;}
  const r=await fetch(url,{headers:{'Content-Type':'application/json'},...opts});
  const d=await r.json().catch(()=>({}));
  if(scoped&&version!==ownerScopeVersion)return api(original,opts);
  if(!r.ok)throw new Error(d.error||(r.status===404&&!r.headers.get('content-type')?.includes('application/json')?'This feature needs the updated Pulse server. Restart Pulse and reload.':'Request failed ('+r.status+').'));
  return d;
}
const post=(u,b)=>api(u,{method:'POST',body:JSON.stringify(b||{})});
const put=(u,b)=>api(u,{method:'PUT',body:JSON.stringify(b||{})});
const del=u=>api(u,{method:'DELETE'});

// ---------- sign-in: profile picker with optional household password setup ----------
function showAuth(){
  document.body.classList.remove('signed-in'); $('authView').classList.remove('hidden'); $('appView').classList.add('hidden'); $('userBar').classList.add('hidden'); $('ownerSwitcher').classList.add('hidden');
  loadProfiles();
}
async function loadProfiles(){
  try {
    const d = await api('/api/profiles');
    const authStatus=await api('/api/auth/status');window.pulseSignInEnabled=authStatus.enabled;if(typeof renderSignInEntry==='function')renderSignInEntry(authStatus.enabled);
    const list = $('profileList');
    $('addProfileBox').classList.toggle('hidden',d.profiles.length>0);
    if(d.profiles.length===1&&!authStatus.enabled){const selected=await post('/api/profiles/select',{userId:d.profiles[0].id});const me=await api('/api/me');await showApp(selected.user,me.householdUsers);return;}
    if (!d.profiles.length) {
      list.innerHTML = '<p class="muted">No profiles yet — add the first one below.</p>';
      return;
    }
    list.innerHTML = d.profiles.map(p => {
      const initial = (p.name || '?').trim().charAt(0).toUpperCase();
      return `<button class="profile" data-profile="${p.id}" type="button"><span class="profile-avatar" aria-hidden="true">${esc(initial)}</span><span class="profile-name">${esc(p.name)}</span></button>`;
    }).join('');
    list.querySelectorAll('[data-profile]').forEach(b => b.onclick = () => window.pulseSignInEnabled?openProfilePassword(b,d.profiles.find(p=>p.id===b.dataset.profile)):signInWithProfileAnimation(b,d.profiles.find(p=>p.id===b.dataset.profile)));
  } catch (e) { $('authMsg').textContent = e.message; }
}
async function showApp(user, household){
  if(window.pulseInviteToken){showAuth();return;}
  document.body.classList.add('signed-in'); $('pageTitle').textContent = 'Overview'; $('authView').classList.add('hidden'); $('appView').classList.remove('hidden'); $('userBar').classList.remove('hidden');
  signedInUser=user;
  $('who').textContent = user.name;
  $('signedInInitial').textContent=user.name.trim().charAt(0).toUpperCase();
  $('ownerSwitcher').classList.remove('hidden');
  $('logoutBtn').classList.toggle('hidden',!household||household.length<2);
  $('settingsProfile').classList.toggle('hidden',!household||household.length<2);
  await initOwnerScope();
  await refreshAccounts();if(typeof resetPlanningEditors==='function')resetPlanningEditors();await openCurrentPath();loadCoverage();
}
$('addProfileBtn').onclick=async()=>{ try{
  const name = $('profileName').value.trim();
  if (!name) { $('authMsg').textContent = 'Enter a name first.'; return; }
  await post('/api/profiles', { name });
  $('profileName').value = '';
  $('authMsg').textContent = 'Profile added — tap it to sign in.';
  loadProfiles();
}catch(e){ $('authMsg').textContent=e.message; }};
$('logoutBtn').onclick=async()=>{ await post('/api/logout'); location.reload(); };

// ---------- nav ----------
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=event=>{
  if(event&&(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey))return;
  if(event)event.preventDefault();
  document.querySelectorAll('[data-view]').forEach(x=>{x.classList.remove('active');x.removeAttribute('aria-current');}); b.classList.add('active');b.setAttribute('aria-current','page');
  const v=b.dataset.view;if(v==='transactions')document.querySelector('.transaction-statistics').open=true;recordPagePath(v);
  if(v==='transactions'&&!restoringPage&&typeof renderToolTabs==='function'){if(typeof clearTransactionInsight==='function')clearTransactionInsight();transactionToolTab='all';renderToolTabs();}
  $('pageTitle').textContent = v==='dashboard' ? 'Overview' : b.textContent.trim(); $('pageSubtitle').textContent = v==='dashboard' ? 'Accounts, spending and investments' : '';
  ['dashboard','funds','calendar','transactions','budgets','bills','accounts','investments','import','settings','payoff','account-detail','cashflow','reports','forecast','tools','payroll','goals'].forEach(x=>$('view-'+x).classList.toggle('hidden', x!==v));
  document.querySelector('.page-heading').classList.remove('hidden');
  $('downloadTxCsv').classList.toggle('hidden',v!=='transactions');
  $('addActivity').classList.toggle('hidden',['calendar','accounts','payoff','settings','import','cashflow','reports','forecast','tools','payroll','budgets','goals','bills','investments'].includes(v));
  if(typeof closeDetailContext==='function')closeDetailContext();
  if(['cashflow','reports','forecast','tools','payroll','budgets','goals','bills','investments'].includes(v))loadReportView(v);
  if(v==='goals')loadPlanningGoals();
  if(v==='payoff')loadPayoff();
  if(v==='dashboard') loadDashboard(); if(v==='funds'||v==='accounts') loadCoverage();
  if(v==='import'){if(typeof resetMainImportWizard==='function'&&!uploadCenterContext)resetMainImportWizard();loadBalanceImports();loadTransactionImports();loadImportOptions();}
  if(v==='transactions') loadTransactions(); if(v==='budgets') loadBudgets();
  if(v==='calendar')loadCashCalendar(); if(v==='bills') loadBills(); if(v==='accounts') loadAccountsLoans(); if(v==='investments') loadInvestments();
});
async function refreshAccounts(){ const d=await api('/api/accounts'); accountsCache=d.items.filter(a=>!a.archived);
  const opts='<option value="">— none —</option>'+accountsCache.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');
  ['blAccount','lAccount','aPayFrom','trFromAccount','trToAccount'].forEach(i=>{ if($(i)) $(i).innerHTML=opts; });
  const currentTxAccount=$('txAccount').value;
  $('txAccount').innerHTML='<option value="">No account</option>'+accountsCache.map(a=>`<option value="${esc(a.name)}">${esc(a.name)}</option>`).join('');
  if(accountsCache.some(a=>a.name===currentTxAccount))$('txAccount').value=currentTxAccount;
  const chq=accountsCache.filter(a=>a.type==='checking');
  $('fcAccount').innerHTML = chq.map(a=>`<option value="${a.id}">${esc(a.name)} — ${money(a.balance)}</option>`).join('') || '<option value="">Add a chequing account first</option>';
}

// ---------- charts ----------
function pie(el, items){
  const refunds=items.filter(i=>i.total<0);items=items.filter(i=>i.total>0);
  const total=items.reduce((s,i)=>s+i.total,0);
  if(!total){ el.innerHTML='<p class="muted">No spending in this period.</p>'; return ''; }
  let a0=-Math.PI/2, paths='';
  const legend=items.map((it,i)=>{ const a1=a0+(it.total/total)*Math.PI*2;
    const large=(a1-a0)>Math.PI?1:0, r=90, cx=100, cy=100;
    const x0=cx+r*Math.cos(a0), y0=cy+r*Math.sin(a0), x1=cx+r*Math.cos(a1), y1=cy+r*Math.sin(a1);
    const slice = items.length===1 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${it.color||COLORS[i%COLORS.length]}"/>`
      : `<path d="M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z" fill="${it.color||COLORS[i%COLORS.length]}"><title>${esc(it.label)} ${money(it.total)}</title></path>`;
    a0=a1; paths+=slice;
    return `<span class="legend"><i style="display:inline-block;width:12px;height:12px;background:${it.color||COLORS[i%COLORS.length]};border-radius:3px"></i> ${esc(it.label)} ${money(it.total)} (${Math.round(it.total/total*100)}%)</span>`; }).join(' ');
  el.innerHTML=`<svg viewBox="0 0 200 200" style="max-width:260px;display:block;margin:auto">${paths}</svg>`;
  return legend+refunds.map(i=>`<span class="legend">${esc(i.label)}: ${money(i.total)} (net refund)</span>`).join(' ');
}
function bars(el, items, suffix=''){
  const max=Math.max(1,...items.map(i=>i.total));
  el.innerHTML = items.length ? items.map(i=>`<div class="bar-row"><span>${esc(i.label)}</span><div class="bar"><i style="width:${Math.round(Math.abs(i.total)/max*100)}%;${i.color?'background:'+i.color:''}"></i></div><strong>${money(i.total)}${suffix}</strong></div>`).join('') : '<p class="muted">Nothing yet.</p>';
}
function sankey(el, s){
  const all=[...s.sources.map(x=>({...x,side:'in'})), ...(s.deficit>0?[{label:'From savings / deficit',total:s.deficit,side:'in'}]:[])];
  const total=s.total;
  if(!total){ el.innerHTML='<p class="muted">No income or spending in this period to draw yet.</p>'; return; }
  const H=Math.max(220, Math.max(all.length, s.destinations.length)*52), W=760, midX=330, midW=90, nodeW=14;
  const layout=(items,x)=>{ let y=10; const gap=14, usable=H-20-gap*(items.length-1); return items.map(it=>{ const h=Math.max(8, it.total/total*usable); const o={...it,x,y,h}; y+=h+gap; return o; }); };
  const left=layout(all,40), right=layout(s.destinations, W-180);
  let midY=10; const midH=H-20;
  let paths='';
  left.forEach((n,i)=>{ paths+=`<path d="M${n.x+nodeW},${n.y+n.h/2} C ${midX-60},${n.y+n.h/2} ${midX-60},${10+ (all.slice(0,i).reduce((a,b)=>a+b.h,0)) + n.h/2 + i*0} ${midX},${10+ all.slice(0,i).reduce((a,b)=>a+b.h+ (140/Math.max(1,all.length)),0) + n.h/2}" stroke="${COLORS[i%COLORS.length]}" stroke-width="${Math.max(2,n.h*0.7)}" fill="none" opacity="0.45"/>`; });
  // simpler, accurate ribbons: scale offsets inside the middle bar
  paths=''; let offL=10, offR=10;
  const ordered=[...left];
  ordered.forEach((n,i)=>{ const h=n.h; paths+=`<path d="M${n.x+nodeW},${n.y} C ${midX-70},${n.y} ${midX-70},${offL} ${midX},${offL} L${midX},${offL+h} C ${midX-70},${offL+h} ${midX-70},${n.y+h} ${n.x+nodeW},${n.y+h} Z" fill="${COLORS[i%COLORS.length]}" opacity="0.4"/>`; offL+=h+ (H-20-left.reduce((a,b)=>a+b.h,0))/Math.max(1,left.length-1||1)*0; });
  // right ribbons from middle to destinations, in category order using destination totals matched to left total scale
  let srcOff=10; right.forEach((n,i)=>{ const h=n.h; paths+=`<path d="M${midX+midW},${srcOff} C ${midX+midW+70},${srcOff} ${n.x-70},${n.y} ${n.x},${n.y} L${n.x},${n.y+h} C ${n.x-70},${n.y+h} ${midX+midW+70},${srcOff+h} ${midX+midW},${srcOff+h} Z" fill="${n.color||COLORS[(i+3)%COLORS.length]}" opacity="0.4"/>`; srcOff+=h; });
  const labels=[...left.map(n=>`<text x="${n.x-4}" y="${n.y+n.h/2+4}" text-anchor="end" font-size="12">${esc(n.label)} ${money(n.total)}</text><rect x="${n.x}" y="${n.y}" width="${nodeW}" height="${n.h}" fill="${COLORS[left.indexOf(n)%COLORS.length]}"/>`),
    ...right.map((n,i)=>`<rect x="${n.x}" y="${n.y}" width="${nodeW}" height="${n.h}" fill="${n.color||COLORS[(i+3)%COLORS.length]}"/><text x="${n.x+nodeW+6}" y="${n.y+n.h/2+4}" font-size="12">${esc(n.label)} ${money(n.total)}</text>`)].join('');
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:100%">${paths}<rect x="${midX}" y="10" width="${midW}" height="${midH}" fill="#17202a" opacity="0.85"/><text x="${midX+midW/2}" y="${H/2}" fill="#fff" text-anchor="middle" font-size="13">Household</text><text x="${midX+midW/2}" y="${H/2+18}" fill="#fff" text-anchor="middle" font-size="12">${money(total)}</text>${labels}</svg>`;
}

function renderDashboardSpending(groups,month){
 const palette=['#58b8a1','#729fe8','#df9467','#cc78a5','#a392e3','#d8b459','#55b0ce','#a8bd68','#ef8482','#8ca9bd'];
 const items=groups.map((group,i)=>({...group,color:palette[i%palette.length]}));
 const chart=$('pieChart'),legend=$('pieLegend'),total=items.reduce((sum,i)=>sum+Math.max(0,i.total),0);
 const open=group=>openTransactionEntity('category-group',group.label,'',false,{from:month.start,to:month.end});
 $('spendingMixMonth').textContent=new Intl.DateTimeFormat('en-CA',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month.start+'T12:00:00Z'));
 pie(chart,items);
 const visible=items.filter(group=>group.total>0);
 chart.querySelectorAll('svg > path,svg > circle').forEach((slice,i)=>{
  const group=visible[i];
  if(!group)return;
  slice.setAttribute('tabindex','0');
  slice.setAttribute('role','button');
  slice.setAttribute('aria-label',group.label+' '+money(group.total));
  slice.onclick=()=>open(group);
  slice.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open(group);}};
 });
 legend.innerHTML=items.map((group,i)=>`<button type="button" data-dashboard-group="${i}" class="dashboard-spend-link">
  <i style="background:${group.color}"></i><span>${esc(group.label)}</span><strong>${money(group.total)}</strong>
  <small>${group.total<0?'Net refund':total?Math.round(group.total/total*100)+'%':''}</small>
 </button>`).join('');
 for(const button of $('view-dashboard').querySelectorAll('[data-dashboard-group]'))button.onclick=()=>open(items[Number(button.dataset.dashboardGroup)]);
}

let dashboardTrendRows=[];
function renderDashboardTrend(rows){
 dashboardTrendRows=rows;
 const host=$('dTrend'),width=Math.max(240,host.clientWidth),height=176,left=48,right=12,top=12,base=147;
 const max=Math.max(1,...rows.flatMap(r=>[r.income,r.spending]));
 const step=(width-left-right)/Math.max(1,rows.length),bar=Math.min(13,step*.26);
 const y=value=>base-Math.max(0,value)/max*(base-top);
 const ticks=[0,max/2,max],latest=rows.at(-1),net=latest?latest.income-latest.spending:0;
 const axis=amount=>amount>=1000?'$'+(amount/1000).toLocaleString('en-CA',{maximumFractionDigits:1})+'k':'$'+Math.round(amount);
 host.innerHTML=`${latest?`<div class="dashboard-trend-summary">
   <div><small>Income</small><strong>${money(latest.income)}</strong></div>
   <div><small>Spending</small><strong>${money(latest.spending)}</strong></div>
   <div data-net="${net<0?'negative':'positive'}"><small>${net<0?'Spent more than earned':'Income left after spending'}</small><strong>${money(Math.abs(net))}</strong></div>
  </div>`:''}<div class="dashboard-trend-legend"><span>Income</span><span>Spending</span><small>${latest?esc(latest.label):''} highlighted</small></div>
  <div class="dashboard-trend-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Income and spending by selected period">
   ${ticks.map(amount=>`<line x1="${left}" x2="${width-right}" y1="${y(amount)}" y2="${y(amount)}" stroke="var(--border)"/><text x="4" y="${y(amount)+4}" class="flow-axis">${axis(amount)}</text>`).join('')}
   ${rows.map((row,i)=>{
    const x=left+(i+.5)*step,showLabel=i===0||i===rows.length-1||i%Math.ceil(rows.length/(width<480?3:5))===0&&i<rows.length-2;
    return `<g tabindex="0" aria-label="${esc(row.label)}: income ${money(row.income)}, spending ${money(row.spending)}">
     <rect x="${x-step/2}" y="${top}" width="${step}" height="${base-top}" fill="${i===rows.length-1?'var(--accent-soft)':'transparent'}"/>
     <rect x="${x-bar-1}" y="${y(row.income)}" width="${bar}" height="${base-y(row.income)}" rx="1.5" fill="#58b8a1"/>
     <rect x="${x+1}" y="${y(row.spending)}" width="${bar}" height="${base-y(row.spending)}" rx="1.5" fill="#df9467"/>
     <title>${esc(row.label)} · Income ${money(row.income)} · Spending ${money(row.spending)}</title>
     ${showLabel?`<text x="${x}" y="167" text-anchor="middle" class="flow-axis">${esc(row.label.length===10?row.label.slice(5):row.label)}</text>`:''}
    </g>`;
   }).join('')}
  </svg></div>`;
}

// ---------- dashboard ----------
new ResizeObserver(()=>{
 const host=$('dTrend'),width=host.clientWidth,chart=host.querySelector('svg');
 if(width&&chart&&chart.viewBox.baseVal.width!==Math.max(240,width))renderDashboardTrend(dashboardTrendRows);
}).observe($('dTrend'));

function dashboardQuery(){const custom=range==='custom'?`&from=${encodeURIComponent($('dashboardFrom').value)}&to=${encodeURIComponent($('dashboardTo').value)}`:'';return `/api/dashboard?range=${range}&date=${anchor}${custom}`;}
function selectDashboardRange(next){range=next;try{localStorage.setItem('pulse-dashboard-period',range);}catch{}document.querySelectorAll('.rangeBtn').forEach(x=>x.classList.toggle('active',x.dataset.range===range));$('customPeriodFields').classList.toggle('hidden',range!=='custom');}
document.querySelectorAll('.rangeBtn').forEach(b=>b.onclick=()=>{selectDashboardRange(b.dataset.range);if(range!=='custom')loadDashboard();});
async function moveDashboardPeriod(direction){if(range==='custom'){const from=$('dashboardFrom').value,to=$('dashboardTo').value,days=Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;if(!Number.isFinite(days)||days<1)return;const shift=direction*days;$('dashboardFrom').value=new Date(Date.parse(from)+shift*86400000).toISOString().slice(0,10);$('dashboardTo').value=new Date(Date.parse(to)+shift*86400000).toISOString().slice(0,10);return loadDashboard();}const d=await api(dashboardQuery());anchor=direction<0?d.prevAnchor:d.nextAnchor;return loadDashboard();}
$('prevBtn').onclick=()=>moveDashboardPeriod(-1);$('nextBtn').onclick=()=>moveDashboardPeriod(1);
$('currentPeriodBtn').onclick=()=>{anchor=dashboardToday();if(range==='custom'){const end=anchor,start=new Date(Date.parse(end)-29*86400000).toISOString().slice(0,10);$('dashboardFrom').value=start;$('dashboardTo').value=end;}loadDashboard();};
$('applyDashboardPeriod').onclick=loadDashboard;
{const end=dashboardToday(),start=new Date(Date.parse(end)-29*86400000).toISOString().slice(0,10);$('dashboardFrom').value=start;$('dashboardTo').value=end;selectDashboardRange(range);}
async function loadDashboard(){
  const d=await api(dashboardQuery());
  if(range!=='custom')anchor=d.period.start;
  $('periodLabel').textContent=d.period.label;
  let statementNotice=$('homeBillStatementNotice');if(!statementNotice){statementNotice=document.createElement('div');statementNotice.id='homeBillStatementNotice';statementNotice.className='card bill-statement-notice';$('view-dashboard').prepend(statementNotice);}statementNotice.classList.toggle('hidden',!d.statementReviews?.length);statementNotice.innerHTML=d.statementReviews?.length?`<span><strong>${d.statementReviews.length} bill statement${d.statementReviews.length===1?'':'s'} to check</strong><small>${d.statementReviews.map(r=>esc(r.name)).join(', ')} · review amounts before Chexy charges</small></span><button id="openStatementReviewBills">Review bills</button>`:'';if($('openStatementReviewBills'))$('openStatementReviewBills').onclick=()=>goView('bills');
  $('dIncome').textContent=money(d.income); $('dSpending').textContent=money(d.spending); $('dNet').textContent=money(d.net);
  $('dSavings').textContent=d.income? d.savingsRate+'%':'—';
  $('dMeta').textContent=`${d.count} transaction(s) in period · ${d.transfersExcluded} transfer/card-payment row(s) excluded from totals.`;
  $('dTransfers').innerHTML = (d.transfersMoved? `Transfers moved in this period (not income/spending): <strong>${money(d.transfersMoved)}</strong>. `:'') +
    (d.partnerBalances && d.partnerBalances.length ? d.partnerBalances.map(p=>`<strong>${esc(p.debtor)}</strong> owes <strong>${esc(p.creditor)}</strong> ${money(p.amount)} between you two.`).join(' ') : '');
  $('emptyState').classList.toggle('hidden', d.count>0 || accountsCache.length>0);
  renderDashboardSpending(d.spendingGroups||[],d.spendingMonth||d.period);
  sankey($('sankey'), d.sankey);
  const persons={}; d.incomeByPerson.forEach(p=>persons[p.label]={label:p.label,total:0,inc:p.total}); d.spendingByPerson.forEach(p=>{ persons[p.label]=persons[p.label]||{label:p.label,total:0,inc:0}; persons[p.label].total=p.total; });
  $('dPersons').innerHTML=Object.values(persons).length? Object.values(persons).map(p=>`<div class="bar-row"><span>${esc(p.label)}</span><span>Spent ${money(p.total)}</span><strong>Income ${money(p.inc||0)}</strong></div>`).join('') : '<p class="muted">Nothing yet.</p>';
  bars($('dAccounts'), d.byAccount);
  renderDashboardTrend(d.trend);
  await loadHomeWidgets();
  $('dBudgets').innerHTML = budgetHtml(d.budgets, d.budgetMonth);
  $('dLargest').innerHTML = d.largest.length? d.largest.map(t=>`<div class="bar-row"><span>${t.date}</span><span>${esc(t.merchant)} · ${esc(t.category)}</span><strong class="amount-neg">${money(t.amount)}</strong></div>`).join('') : '<p class="muted">No expenses in period.</p>';
}
function budgetHtml(list, month){
  if(!list.length) return '<p class="muted">No budgets yet — add them under Budgets & Buckets.</p>';
  return `<p class="muted">Month: ${esc(month||'')}</p>`+list.map(b=>{const limit=Number(b.monthlyLimit||0),spent=Number(b.spent||0),remaining=limit-spent,progress=PulseBudgetProgress.describe(spent,limit);return `<div class="item"><div class="row"><strong>${esc(b.category)}</strong><span class="${limit>0&&remaining<0?'bad':limit>0?'ok':'muted'}">${limit>0?(remaining<0?'Over by '+money(-remaining):money(remaining)+' left'):'No allocation set'}</span><span class="muted">${money(spent)}${limit>0?' of '+money(limit):' spent'}</span></div>${limit>0?`<div class="budget-progress" data-state="${progress.state}" aria-label="${esc(progress.label)}"><i style="width:${progress.fill}%;--budget-blend:${progress.blend}%"></i></div>`:''}</div>`;}).join('');
}
$('sampleBtn').onclick=async()=>{ await post('/api/sample-data'); await refreshAccounts(); loadDashboard(); loadCoverage(); };
$('clearSampleBtn').onclick=async()=>{ await del('/api/sample-data'); await refreshAccounts(); loadDashboard(); loadCoverage(); };

// ---------- coverage / funds check ----------
async function loadCoverage(){
  const d=await api('/api/coverage'); await refreshAccounts();
  const html = d.checkingCoverage.length ? d.checkingCoverage.map(c=>`<div class="item"><strong>${esc(c.account.name)}</strong> — balance ${money(c.account.balance)}<br/>
    Due in next ${c.days} days: ${money(c.totalObligations)} · <span class="${c.enough?'ok':'bad'}">${c.enough?'Enough in chequing ✓':'NOT enough — short '+money(c.shortfall)}</span><br/>
    <strong>Safe to spend: ${money(c.safeToSpend)}</strong>
    ${c.obligations.length? '<br/>'+c.obligations.map(o=>`<span class="pill">${esc(o.date)} · ${esc(o.kind)} · ${esc(o.name)} · ${money(o.amount)}</span> `).join(''):''}</div>`).join('')
    : '<p class="muted">Add a chequing account (Accounts) with its current balance, and assign bills/loans to pay from it — then this tells you if you have enough.</p>';
  $('coverageCards').innerHTML=html;
  const owe = d.whoIOwe.length ? d.whoIOwe.map(w=>`<div class="bar-row"><span>${esc(w.kind)}</span><span>${esc(w.what)} — ${esc(w.who)}</span><strong>${money(w.amount)}</strong></div>`).join('')+`<p><strong>Total owed: ${money(d.totalOwed)}</strong></p>` : '<p class="muted">No loans, credit balances or overdue bills recorded.</p>';
  $('whoIOwe').innerHTML=owe; const w2=$('whoIOwe2'); if(w2) w2.innerHTML=owe;
}
async function doFundsCheck(amountInput, accountSel, msgEl){
  const amount=Number($(amountInput).value);
  if(!$(accountSel).value){ $(msgEl).textContent='Add a chequing account first (Accounts tab).'; return; }
  try{ const d=await post('/api/funds-check',{accountId:$(accountSel).value, amount});
    $(msgEl).textContent=(d.canAfford?'✅ ':'⚠️ ')+d.message; $(msgEl).className='msg big '+(d.canAfford?'ok':'bad');
  }catch(e){ $(msgEl).textContent=e.message; }
}
$('fcBtn').onclick=()=>doFundsCheck('fcAmount','fcAccount','fcMsg');

// ---------- transactions ----------
$('txDate').value=new Date().toISOString().slice(0,10);
async function fillTxFilters(d){
 for(const [id,values,label] of [['fCategory',d.categories,'All categories'],['fPerson',d.persons,'All people'],['fAccount',d.accounts,'All accounts']]){
  const current=$(id).value;const available=current&&!values.includes(current)?[current,...values]:values;$(id).innerHTML=`<option value="">${label}</option>`+available.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');$(id).value=current;
 }
}
async function loadTransactions(){transactionOffset=0;return loadTransactionWorkspace();}

// ---------- split editor ----------
let splitTx=null;
function splitRow(cat='',person='',amt=''){
  const div=document.createElement('div'); div.className='formgrid split-row';
  div.innerHTML=`<label>Category<input class="sp-cat" value="${esc(cat)}" placeholder="Groceries"/></label>
    <label>Person<input class="sp-person" value="${esc(person)}" placeholder="Timothy"/></label>
    <label>Part amount<input class="sp-amt" type="number" step="0.01" value="${amt}" placeholder="120"/></label>
    <label>Note<input class="sp-note" placeholder="Optional"/></label>`;
  div.querySelector('.sp-amt').oninput=updateSplitRemaining;
  return div;
}
function updateSplitRemaining(){
  if(!splitTx) return;
  const sum=[...document.querySelectorAll('.sp-amt')].reduce((s,i)=>s+(Number(i.value)||0),0);
  const left=Math.round((Math.abs(splitTx.amount)-sum)*100)/100;
  $('splitRemaining').textContent=`Parts so far: ${money(sum)} of ${money(Math.abs(splitTx.amount))} — ${left===0?'perfect, adds up exactly ✓': left>0? money(left)+' still to assign' : money(-left)+' too much'}`;
}
function openSplit(tx){
  if(!tx) return; splitTx=tx;
  $('splitCard').classList.remove('hidden');
  $('splitInfo').innerHTML=`<strong>${esc(tx.date)} · ${esc(tx.merchant)} · ${money(tx.amount)}</strong> (${esc(tx.category)} · ${esc(tx.personResolved)})`;
  $('splitRows').innerHTML='';
  const parts=(tx.splits&&tx.splits.length)? tx.splits : [{category:tx.category,person:tx.personResolved,amount:''},{category:'',person:'',amount:''}];
  parts.forEach(p=>$('splitRows').appendChild(splitRow(p.category,p.person, p.amount===''? '' : Math.abs(p.amount))));
  updateSplitRemaining();
  $('splitCard').scrollIntoView({behavior:'smooth'});
}
$('splitAddRow').onclick=()=>{ $('splitRows').appendChild(splitRow()); };
$('splitCancel').onclick=()=>{ $('splitCard').classList.add('hidden'); splitTx=null; };
$('splitClear').onclick=async()=>{ if(!splitTx) return; await put('/api/transactions/'+splitTx.id+'/splits',{splits:[]}); $('splitCard').classList.add('hidden'); loadTransactions(); loadDashboard(); };
$('splitSave').onclick=async()=>{
  if(!splitTx) return;
  const sign=splitTx.amount<0?-1:1;
  const splits=[...document.querySelectorAll('.split-row')].map(r=>({category:r.querySelector('.sp-cat').value, person:r.querySelector('.sp-person').value, amount:sign*(Number(r.querySelector('.sp-amt').value)||0), note:r.querySelector('.sp-note').value}));
  try{ await put('/api/transactions/'+splitTx.id+'/splits',{splits}); $('splitCard').classList.add('hidden'); loadTransactions(); loadDashboard(); }
  catch(e){ $('splitRemaining').textContent=e.message; }
};

// ---------- transfers ----------
$('trDate').value=new Date().toISOString().slice(0,10);
async function loadTransfers(){
  await refreshAccounts();
  // refreshAccounts resets the selects; restore nothing selected by default
  const d=await api('/api/transfers');
  $('partnerBalance').innerHTML=d.partnerBalances.length? d.partnerBalances.map(p=>`<p class="item">Between you two: <strong>${esc(p.debtor)}</strong> owes <strong>${esc(p.creditor)}</strong> <strong>${money(p.amount)}</strong></p>`).join('') : '<p class="muted">Between you two: all settled up — nobody owes anybody right now.</p>';
  $('transferList').innerHTML=d.items.length? d.items.map(t=>`<div class="item"><div class="row"><span>${esc(t.date)}</span><strong>${money(t.amount)}</strong>
    <span class="pill">${t.kind==='account'?'Account transfer':t.kind==='lend'?'Lent / covered':'Payback'}</span>
    <span>${t.kind==='account'? `${esc(t.fromAccountName)} → ${esc(t.toAccountName)}` : `${esc(t.fromPerson)} → ${esc(t.toPerson)}`}</span>
    <span class="muted">${esc(t.note||'')}</span><button class="danger" data-deltransfer="${t.id}">Delete</button></div></div>`).join('') : '<p class="muted">No transfers recorded yet.</p>';
  document.querySelectorAll('[data-deltransfer]').forEach(b=>b.onclick=async()=>{ await del('/api/transfers/'+b.dataset.deltransfer); loadTransfers(); loadAccountsLoans(); loadCoverage(); loadDashboard(); });
}
$('addTransferBtn').onclick=async()=>{
  try{ await post('/api/transfers',{date:$('trDate').value, amount:Number($('trAmount').value), kind:$('trKind').value,
    fromAccountId:$('trFromAccount').value, toAccountId:$('trToAccount').value,
    fromPerson:$('trFromPerson').value, toPerson:$('trToPerson').value, note:$('trNote').value, updateBalances:$('trUpdateBalances').checked});
    $('trMsg').textContent='Recorded — totals unchanged, it’s a transfer, not spending.'; loadTransfers(); loadAccountsLoans(); loadCoverage(); loadDashboard();
  }catch(e){ $('trMsg').textContent=e.message; }
};
['searchBox'].forEach(i=>$(i).oninput=loadTransactions);
['fCategory','fPerson','fAccount','txSort','txMinAmount','txMaxAmount'].forEach(i=>$(i).onchange=loadTransactions);
$('addTxBtn').onclick=async()=>{ try{ await post('/api/transactions',{date:$('txDate').value,merchant:$('txMerchant').value,category:$('txCategory').value,person:$('txPerson').value||activeOwnerName(),amount:$('txAmount').value,account:$('txAccount').value,notes:$('txNotes').value});
  $('txMsg').textContent='Added.';$('newTxDialog').close(); await refreshAccounts(); loadTransactions(); loadDashboard(); }catch(e){ $('txMsg').textContent=e.message; }};

// ---------- budgets & buckets ----------
async function loadBudgets(){
  const d=await api(`/api/dashboard?range=month&date=${new Date().toISOString().slice(0,10)}`);
  $('budgetList').innerHTML=budgetHtml(d.budgets, d.budgetMonth) + d.budgets.map(b=>`<button class="danger" data-delbudget="${b.id}">Delete ${esc(b.category)} budget</button> `).join('');
  document.querySelectorAll('[data-delbudget]').forEach(x=>x.onclick=async()=>{ await del('/api/budgets/'+x.dataset.delbudget); loadBudgets(); });
  const bk=await api('/api/buckets');
  $('bucketList').innerHTML=bk.items.length? bk.items.map(b=>{ const pct=b.targetAmount>0?Math.round(b.currentAmount/b.targetAmount*100):0;
    return `<div class="item"><div class="row"><strong>${esc(b.name)}</strong><span>${money(b.currentAmount)} of ${money(b.targetAmount)} (${pct}%) · ${money((b.targetAmount||0)-(b.currentAmount||0))} to go</span>
    <span><input type="number" step="0.01" value="${b.currentAmount}" data-bucketamt="${b.id}" style="width:110px"/> <button data-spendgoal="${b.id}">Spend from goal</button> <button data-delbucket="${b.id}" class="danger">Delete</button></span></div>
    <div class="progress"><i class="${pct>=100?'done':''}" style="width:${Math.min(100,pct)}%"></i></div></div>`; }).join('') : '<p class="muted">No buckets yet.</p>';
  bindGoalButtons(bk.items);
  document.querySelectorAll('[data-bucketamt]').forEach(inp=>inp.onchange=async()=>{ await put('/api/buckets/'+inp.dataset.bucketamt,{currentAmount:Number(inp.value)}); loadBudgets(); });
  document.querySelectorAll('[data-delbucket]').forEach(x=>x.onclick=async()=>{ await del('/api/buckets/'+x.dataset.delbucket); loadBudgets(); });
}
$('addBudgetBtn').onclick=async()=>{ await post('/api/budgets',{person:$('bPerson').value||activeOwnerName(),category:$('bCategory').value,monthlyLimit:Number($('bLimit').value)}); loadBudgets(); loadDashboard(); };
$('addBucketBtn').onclick=async()=>{ await post('/api/buckets',{person:$('bkPerson').value||activeOwnerName(),name:$('bkName').value,targetAmount:Number($('bkTarget').value),currentAmount:Number($('bkCurrent').value)}); loadBudgets(); };

// ---------- bills ----------
async function loadBills(){
  await refreshAccounts();
  const d=await api('/api/bills-overview');
  $('billsSummary').innerHTML=`<div class="cards"><div class="card stat"><span>Fixed / month</span><strong>${money(d.fixedMonthly)}</strong></div>
    <div class="card stat"><span>Variable / month (typical)</span><strong>${money(d.variableMonthly)}</strong></div>
    <div class="card stat"><span>All bills / month</span><strong>${money(d.totalMonthly)}</strong></div>
    <div class="card stat"><span>Due in next 30 days</span><strong>${money(d.next30DaysTotal)}</strong></div></div>`;
  $('billList').innerHTML=d.bills.length? d.bills.map(b=>`<div class="item"><div class="row"><strong>${esc(b.name)}</strong>
    <span class="pill">${b.kind==='variable'?'Variable':'Fixed'}</span><span>${esc(b.category||'')}</span>
    <span>${money(Number(b.amount||0)*(1+Number(b.processingFeePercent||0)/100))}${b.processingFeePercent?` (includes ${esc(b.processingFeePercent)}% fee)`:''}${b.kind==='variable'&&b.lastAmount?` (last actual ${money(b.lastAmount)})`:''}</span>
    <span class="${b.overdue?'bad':''}">Due ${esc(b.nextDueDate||'—')}${b.overdue?' — OVERDUE':` (in ${b.dueInDays} days)`} · ${esc(b.frequency||'monthly')}${b.autopay?' · autopay':''}</span>
    <span><button data-paybill="${b.id}">Mark paid</button> <button class="danger" data-delbill="${b.id}">Delete</button></span></div></div>`).join('') : '<p class="muted">No bills yet — add rent, utilities, internet, subscriptions…</p>';
  document.querySelectorAll('[data-paybill]').forEach(x=>x.onclick=async()=>{ await post('/api/bills/'+x.dataset.paybill+'/pay',{}); loadBills(); loadCoverage(); });
  document.querySelectorAll('[data-delbill]').forEach(x=>x.onclick=async()=>{ await del('/api/bills/'+x.dataset.delbill); loadBills(); loadCoverage(); });
}
$('addBillBtn').onclick=async()=>{ await post('/api/bills',{name:$('blName').value,kind:$('blKind').value,category:$('blCategory').value,amount:Number($('blAmount').value),nextDueDate:$('blDue').value,frequency:$('blFreq').value,payFromAccountId:$('blAccount').value,person:$('blPerson').value}); loadBills(); loadCoverage(); };

// ---------- accounts & loans ----------
async function loadAccountsLoans(){
  await refreshAccounts();await loadAccountsOverview();
  if(typeof refreshOpenAccountDetail==='function')await refreshOpenAccountDetail();
}

// ---------- investments ----------
async function loadInvestments(){
  const d=await api('/api/investments-overview');
  $('invSummary').innerHTML=`<div class="cards"><div class="card stat"><span>Investment accounts</span><strong>${money(d.investmentAccountsTotal)}</strong></div>
    <div class="card stat"><span>Tracked holdings</span><strong>${money(d.totalValue)}</strong></div>
    <div class="card stat"><span>You put in</span><strong>${d.costKnown?money(d.totalCost):'Not provided'}</strong></div>
    <div class="card stat"><span>Gain / loss</span><strong class="${d.gain>=0?'ok':'bad'}">${d.costKnown?money(d.gain):'Not available'}${d.gainPct!==null?' ('+d.gainPct+'%)':''}</strong></div></div>
    <h4>By account</h4><div>${d.byAccount.map(a=>`<div class="bar-row"><span>${esc(a.label)}</span><span></span><strong>${money(a.total)}</strong></div>`).join('')||'<p class="muted">No holdings yet.</p>'}</div>`;
  $('invPie').innerHTML='<h4>Allocation by type</h4>'+ (d.byType.length? '<div id="invPieChart"></div><div id="invPieLegend"></div>':'<p class="muted">Add holdings to see allocation.</p>');
  if(d.byType.length) $('invPieLegend').innerHTML=pie($('invPieChart'), d.byType);
  $('holdingList').innerHTML=d.holdings.map(h=>`<div class="item"><div class="row"><strong>${esc(h.name)} ${h.symbol?'('+esc(h.symbol)+')':''}</strong><span class="pill">${esc(h.assetType||'')}</span><span>${esc(h.account||'')}</span><span>${esc(h.person||'')}</span><span>${money(h.currentValue)}</span><span class="muted">cost ${money(h.costBasis||0)}</span><button class="danger" data-delhold="${h.id}">Delete</button></div></div>`).join('');
  document.querySelectorAll('[data-delhold]').forEach(x=>x.onclick=async()=>{ await del('/api/holdings/'+x.dataset.delhold); loadInvestments(); });
}
$('addHoldingBtn').onclick=async()=>{ await post('/api/holdings',{name:$('hName').value,symbol:$('hSymbol').value,assetType:$('hType').value,account:$('hAccount').value,person:$('hPerson').value,currentValue:Number($('hValue').value),costBasis:Number($('hCost').value)}); loadInvestments(); };

// ---------- import ----------

if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(registration=>registration.update()).catch(()=>{});
(async()=>{ try{ const me=await api('/api/me'); showApp(me.user, me.householdUsers); }catch{ showAuth(); } })();

// A consistent, local SVG icon family for the sidebar.
const navPaths={calendar:'M4 5h16v15H4ZM4 9h16M8 3v4m8-4v4',payroll:'M6 3h12v18l-3-2-3 2-3-2-3 2ZM9 7h6M9 11h6m-6 4h3',tools:'M4 3h16v18H4ZM7 6h10v4H7ZM7 14h2m4 0h4M7 18h2m4 0h4',goals:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 10v4',cashflow:'M4 20V9h4v11m4 0V4h4v16m4 0v-7',reports:'M12 3a9 9 0 1 0 9 9h-9ZM15 3v6h6',forecast:'M3 19 9 12l4 3 8-11',dashboard:'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',funds:'M3 5h18v14H3ZM3 10h18',transactions:'M4 7h16M16 3l4 4-4 4M20 17H4m4-4-4 4 4 4',budgets:'M4 20V10h4v10m4 0V4h4v16m4 0v-7',bills:'M5 4h14v17l-4-2-3 2-3-2-4 2ZM8 8h8m-8 4h6',accounts:'M3 9h18L12 3ZM5 10v8m7-8v8m7-8v8M3 21h18',investments:'M3 18 9 12l4 3 8-11m-6 0h6v6',payoff:'M4 19h16M6 15l4-4 4 2 5-8m-5 0h5v5',import:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',settings:'M9.5 3h5l.6 2.3 1.8 1 2.3-.6 2.5 4.3-1.7 1.7v2l1.7 1.7-2.5 4.3-2.3-.6-1.8 1-.6 2.3h-5l-.6-2.3-1.8-1-2.3.6-2.5-4.3L4 13.7v-2L2.3 10l2.5-4.3 2.3.6 1.8-1L9.5 3ZM12 8.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8'};
document.querySelectorAll('nav [data-view]').forEach(b=>b.insertAdjacentHTML('afterbegin',`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${navPaths[b.dataset.view]}"/></svg>`));
function goView(view){ document.querySelector(`nav [data-view="${view}"]`).click(); window.scrollTo({top:0,behavior:'instant'}); }
$('addActivity').onclick=()=>{goView('transactions');openNewTransaction();};
$('recapGoals').onclick=()=>goView('goals');
$('settingsProfile').onclick=()=>$('logoutBtn').click();
async function loadHomeWidgets(){
  try {
    const [tx,bills,goals,holdings,loans]=await Promise.all([api('/api/transactions'),api('/api/bills-agenda?days=30&date='+localToday()),api('/api/buckets'),api('/api/holdings'),api('/api/loans')]);
    const netWorth=accountsCache.filter(a=>a.includeInOverview!==false).reduce((n,a)=>n+(a.type==='credit'?-1:1)*(Number(a.balance)||0),0)-loans.items.filter(l=>l.includeInOverview!==false).reduce((n,l)=>n+(Number(l.balance)||0),0);
    const invested=accountsCache.filter(a=>a.type==='investment'&&a.includeInOverview!==false).reduce((n,a)=>n+(Number(a.balance)||0),0);
    const trackedHoldings=holdings.items.reduce((n,h)=>n+(Number(h.currentValue)||0),0);
    const cost=holdings.items.reduce((n,h)=>n+(Number(h.costBasis)||0),0);
    const row=(name,detail,value)=>`<div class="activity-row"><span class="activity-icon" aria-hidden="true">${esc(name.charAt(0).toUpperCase())}</span><div class="details"><strong>${esc(name)}</strong><small>${esc(detail)}</small></div><strong>${esc(value)}</strong></div>`;
    $('homeWidgets').innerHTML=`<div class="card wealth-summary"><div><span class="eyebrow">Net worth</span><div class="wealth-number">${money(netWorth)}</div><small>Account balances less credit balances and loans</small></div><button id="wealthAccounts">View accounts →</button></div><div class="card"><div class="widget-head"><h3>Your investments</h3><button id="wealthInvestments">View holdings →</button></div><div class="wealth-number">${money(invested)}</div><p class="muted">${holdings.items.length&&holdings.items.every(h=>h.costBasis!==null&&h.costBasis!==undefined&&h.costBasis!=='')?`Tracked holdings: ${trackedHoldings-cost>=0?'+':'−'}${money(Math.abs(trackedHoldings-cost))} vs. cost basis`:'Account balances · Enter holdings and cost basis to track gains'}</p></div><div class="card"><div class="widget-head"><h3>Recent activity</h3><button id="allActivity">View all →</button></div>${tx.transactions.slice(0,4).map(t=>row(t.merchant,`${t.category} · ${t.date}`,`${t.amount>0?'+':'−'}${money(Math.abs(t.amount))}`)).join('')||'<p class="muted">Your story starts with your first transaction.</p>'}</div><div class="card"><div class="widget-head"><h3>Coming up <small class="muted">· 30 days</small></h3><button id="allBills">Manage bills →</button></div>${bills.upcoming.filter(b=>b.status==='upcoming').slice(0,8).map(b=>row(b.name,txDateLabel(b.date)+(b.type==='credit-card'?' · Card payment':b.paymentMethod==='chexy'?' · Chexy':''),money(b.amount))).join('')||'<p class="muted">Add your bills for a clearer view of what’s next.</p>'}</div><div class="card goals-home"><div class="widget-head"><h3>Your savings</h3><button id="allGoals">View savings →</button></div><div class="goal-grid">${goals.items.map(g=>`<div class="goal-preview"><h4>${esc(g.name)}</h4><div class="goal-value">${money(g.currentAmount)} <small>of ${money(g.targetAmount)}</small></div><div class="progress"><i style="width:${Math.max(0,Math.min(100,g.targetAmount?g.currentAmount/g.targetAmount*100:0))}%"></i></div><button data-spendgoal="${g.id}">Spend from goal →</button></div>`).join('')||'<p class="muted">Build your emergency cushion in Savings. Other goals are optional.</p>'}</div></div>`;
    $('wealthAccounts').onclick=()=>goView('accounts');$('wealthInvestments').onclick=()=>goView('investments');
    $('allActivity').onclick=()=>goView('transactions');$('allBills').onclick=()=>goView('bills');$('allGoals').onclick=()=>goView('goals');bindGoalButtons(goals.items);if(typeof applyDashboardLayout==='function')applyDashboardLayout();
  } catch(e){ $('homeWidgets').textContent=e.message; }
}
let spendingGoal;
function bindGoalButtons(goals){ document.querySelectorAll('[data-spendgoal]').forEach(b=>b.onclick=()=>{
  spendingGoal=goals.find(g=>g.id===b.dataset.spendgoal);if(!spendingGoal)return;
  $('goalSpendForm').reset();$('goalSpendName').textContent=`${spendingGoal.name} · ${money(spendingGoal.currentAmount)} available`;
  $('goalDate').value=new Date().toLocaleDateString('en-CA');$('goalSpendMsg').textContent='';
  $('goalAccount').innerHTML='<option value="">Choose an account</option>'+accountsCache.map(a=>`<option value="${a.id}">${esc(a.name)}${a.type==='credit'?' · Credit card':''}</option>`).join('');
  $('goalDialog').showModal();
}); }
$('closeGoal').onclick=()=>$('goalDialog').close();
$('goalSpendForm').onsubmit=async e=>{e.preventDefault();$('goalSubmit').disabled=true;
  try {await post(`/api/buckets/${spendingGoal.id}/spend`,{person:activeOwnerName(),amount:Number($('goalAmount').value),accountId:$('goalAccount').value,merchant:$('goalMerchant').value,date:$('goalDate').value,category:$('goalCategory').value});$('goalDialog').close();await Promise.all([loadPlanningGoals(),loadDashboard()]);}
  catch(err){$('goalSpendMsg').textContent=err.message;}finally{$('goalSubmit').disabled=false;}
};
