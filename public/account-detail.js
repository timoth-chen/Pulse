let activeAccountKey=null,accountDetailData=null,detailRequest=0,detailActiveTab='overview';
function closeDetailContext(){document.querySelector('.account-header-controls')?.remove();activeAccountKey=null;detailActiveTab='overview';hideAccountTooltip();}
async function openAccountDetail(key){
 document.querySelector('.account-header-controls')?.remove();
 recordAccountPath(key);activeAccountKey=key;detailActiveTab='overview';
 document.querySelectorAll('#appView > div[id^="view-"]').forEach(el=>el.classList.toggle('hidden',el.id!=='view-account-detail'));
 document.querySelector('.page-heading').classList.add('hidden');
 document.querySelectorAll('nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='accounts'));
 $('accountDetailContent').innerHTML='<p class="muted">Loading account…</p>';
 window.scrollTo({top:0,behavior:'instant'});await loadAccountDetail(key);
}
async function refreshOpenAccountDetail(){if(activeAccountKey&&!$('view-account-detail').classList.contains('hidden'))await loadAccountDetail(activeAccountKey);}
async function loadAccountDetail(key,period){
 const request=++detailRequest;
 const [kind,id]=key.split(':');period=period||$('detailPeriod')?.value||'6m';
 try{
  const d=await api(`/api/account-detail/${kind}/${id}?period=${encodeURIComponent(period)}`);if(request!==detailRequest||key!==activeAccountKey)return;
  accountDetailData=d;const options=await api('/api/transaction-options');if(request!==detailRequest)return;transactionCategories=options.categories;const a=d.record,debt=kind==='loan'||a.type==='credit',delta=d.history.length>1?Math.round((d.history.at(-1).value-d.history[0].value)*100)/100:null,percent=delta!==null&&d.history[0].value?Math.abs(delta/d.history[0].value*100):null,favorable=delta!==null&&(debt?delta<=0:delta>=0);
  $('accountDetailName').textContent=a.name;
  const date=d.lastRecordedAt?shortAccountDate(d.lastRecordedAt.slice(0,10)):'Not yet recorded';
  $('accountDetailContent').innerHTML=`<div class="card detail-balance"><div class="worth-heading"><div><div class="eyebrow">${debt?'AMOUNT OWED':'CURRENT BALANCE'}</div><strong class="wealth-number">${money(a.balance)}</strong><div class="detail-balance-change">${delta!==null?`<span class="${favorable?'delta-positive':'delta-negative'}">${delta>0?'↗ +':delta<0?'↘ −':''}${money(Math.abs(delta))}${percent!==null?' ('+percent.toFixed(1)+'%)':''}</span><span>${esc(({'1m':'1 month','3m':'3 months','6m':'6 months',ytd:'Year to date','1y':'1 year',all:'All time'})[period])} change</span>`:''}</div><p class="chart-caption">CAD · ${a.transactionBalanceAnchor?'Calculated from posted transactions':'Recorded '+esc(date)}</p></div><div class="chart-controls"><details class="filter-popover account-import-menu"><summary aria-label="Import into this account"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>Import</summary><div class="filter-fields"><button data-account-import="transactions">Import transactions</button><button data-account-import="balances">Import balance history</button>${a.type==='investment'?'<button data-account-import="investments">Import holdings / statement</button>':''}</div></details><button type="button" id="detailFilterButton" popovertarget="detailFilterPanel" aria-haspopup="dialog">Filters <span id="detailFilterCount"></span></button><button id="editDetailAccount">Edit ${kind==='loan'?'loan':'account'}</button><label class="sr-only" for="detailPeriod">Account chart period</label><select id="detailPeriod">${[['1m','1 month'],['3m','3 months'],['6m','6 months'],['ytd','Year to date'],['1y','1 year'],['all','All time']].map(([v,label])=>`<option value="${v}" ${period===v?'selected':''}>${label}</option>`).join('')}</select></div></div><div class="chart-tabs" role="tablist" aria-label="Account overview or history"><button id="detailOverviewTab" role="tab" aria-controls="detailOverviewPanel" aria-selected="true">Overview</button><button id="detailHistoryTab" role="tab" aria-controls="detailHistoryPanel" aria-selected="false">History</button></div><div id="detailOverviewPanel" role="tabpanel" aria-labelledby="detailOverviewTab"><div id="detailBalanceChart" class="account-chart-host"></div></div><div id="detailHistoryPanel" class="hidden history-panel" role="tabpanel" aria-labelledby="detailHistoryTab"></div>${a.type==='credit'?cardDetailsStrip(a):''}</div>${accountFilterPanel(d.transactions)}<div class="detail-columns"><div>${a.type==='investment'?`<section class="card"><div class="widget-head"><h3>Holdings</h3><button id="detailAddHolding">+ Add holding</button></div>${d.holdings.length?d.holdings.map(h=>`<div class="activity-row"><span class="details"><strong>${esc(h.name)}</strong><small>${esc(h.symbol||h.assetType||'Holding')}</small></span><strong>${money(h.currentValue)}</strong></div>`).join(''):'<div class="detail-empty"><strong>No holdings added yet</strong><p class="muted">The balance CSV contains account totals. Add individual holdings to see the investments inside this account.</p></div>'}</section>`:''}<section class="card account-transaction-card"><div class="widget-head"><h3>Transactions</h3><div class="account-activity-actions"><button id="detailAddTransaction">+ Add transaction</button></div></div><div id="detailTransactionTable" class="detail-transaction-scroll"></div><p id="detailTransactionMessage" class="chart-caption" role="status"></p></section></div><aside class="account-detail-aside"><section class="card account-filter-summary hidden" id="detailFilteredSummary"></section>${a.type==='credit'?cardPaymentSummary(a)+cardRewardsSummary(a):''}<section class="card"><h3>Summary</h3><dl class="account-metadata"><dt>Institution</dt><dd>${esc(a.institution||a.lender||'Not set')}</dd><dt>Type</dt><dd>${esc(accountTypeNames[a.type]||(kind==='loan'?'Loan':'Account'))}</dd><dt>Owner</dt><dd>${esc(accountOwnerLabel(a))}</dd><dt>Data source</dt><dd>Manual / CSV</dd>${d.uploads?.length?`<dt>Latest upload</dt><dd>${esc(d.uploads[0].filename)}<small>${esc(d.uploads[0].kind)} · ${esc(new Date(d.uploads[0].uploadedAt).toLocaleString('en-CA'))}${d.uploads[0].through?' · Records through '+esc(d.uploads[0].through):''}</small></dd>`:'<dt>Latest upload</dt><dd>No uploaded file for this account</dd>'}</dl><label class="overview-setting"><input id="detailOverviewToggle" type="checkbox" ${a.includeInOverview!==false?'checked':''}/>Include in overview charts</label><p class="chart-caption">Hiding affects the overview totals and charts. The account and its history stay available here.</p></section>${kind==='loan'?`<section class="card"><h3>Payoff plan</h3><p class="wealth-number">${a.maturityDate?shortAccountDate(a.maturityDate):d.payoff.monthsToPayoff?d.payoff.monthsToPayoff+' months':'—'}</p><p class="muted">${esc(a.maturityDate?'Contract maturity':d.payoff.payoffDate?'Estimated '+shortAccountDate(d.payoff.payoffDate):d.payoff.estimateReason)}</p><button id="detailPayoffPlan">Manage in Payoff</button></section>`:''}<section class="card"><h3>Notes</h3><label class="sr-only" for="detailNotes">Account notes</label><textarea id="detailNotes" placeholder="What would you like to remember about this account?">${esc(a.note||'')}</textarea><button id="saveDetailNotes">Save notes</button><p id="detailMsg" role="status"></p></section></aside></div>`;
  const controls=$('accountDetailContent').querySelector('.detail-balance .chart-controls');
  document.querySelector('.account-header-controls')?.remove();
  controls.classList.add('account-header-controls');
  $('ownerSwitcher').before(controls);
  document.querySelectorAll('[data-account-import]').forEach(b=>b.onclick=()=>openUploadCenter(b.dataset.accountImport,{account:a.name,owner:a.person||'',accountOnly:true}));
  if(typeof renderVehicleValuation==='function')renderVehicleValuation(a,key);
  bindAccountFilters();renderAccountTransactions();
  bindWelcomeOffer(a,key);
  bindRewardHistory(a,key);
  renderBalanceHistory(d.history,'detailHistoryPanel',debt?'Amount owed':'Balance');
  const setTab=history=>{detailActiveTab=history?'history':'overview';$('detailOverviewTab').setAttribute('aria-selected',String(!history));$('detailHistoryTab').setAttribute('aria-selected',String(history));$('detailOverviewPanel').classList.toggle('hidden',history);$('detailHistoryPanel').classList.toggle('hidden',!history);hideAccountTooltip();if(!history&&!$('detailBalanceChart').dataset.investmentEnhanced)renderNetWorthChart(d.history,'detailBalanceChart');};
  $('detailOverviewTab').onclick=()=>setTab(false);$('detailHistoryTab').onclick=()=>setTab(true);setTab(detailActiveTab==='history');
  $('detailPeriod').onchange=()=>loadAccountDetail(key,$('detailPeriod').value);
  document.querySelectorAll('[data-edit-card-payments]').forEach(b=>b.onclick=()=>{openAccountEditor(a);$('creditAccountOptions').open=true;$('aStatementClose').focus();});
  $('editDetailAccount').onclick=()=>kind==='loan'?openLoanEditor(a):openAccountEditor(a);
  $('detailOverviewToggle').onchange=async()=>{const box=$('detailOverviewToggle');box.disabled=true;try{await setOverviewVisibility(key,box.checked);loadDashboard();}catch(e){box.checked=!box.checked;$('detailMsg').textContent=e.message;}finally{box.disabled=false;}};
  $('saveDetailNotes').onclick=async()=>{try{await put(`/api/${kind==='loan'?'loans':'accounts'}/${id}`,{note:$('detailNotes').value});$('detailMsg').textContent='Notes saved.';}catch(e){$('detailMsg').textContent=e.message;}};
  $('detailAddTransaction').onclick=()=>{openNewTransaction({account:a.name,person:a.person||''});};
  if($('detailImportTransactions'))$('detailImportTransactions').onclick=()=>openUploadCenter('transactions',{account:a.name,owner:a.person||'',accountOnly:true});
  if($('detailAddHolding'))$('detailAddHolding').onclick=()=>{goView('investments');$('hAccount').value=a.name;$('hPerson').value=a.person||'';$('hName').focus();};
  if(a.type==='investment'&&typeof enhanceInvestmentDetail==='function')await enhanceInvestmentDetail(a,key,request);
  if($('detailPayoffPlan'))$('detailPayoffPlan').onclick=()=>{goView('payoff');openLoanEditor(a);};
 }catch(e){if(request===detailRequest)$('accountDetailContent').innerHTML=`<div class="card"><p>${esc(e.message)}</p></div>`;}
}
$('backToAccounts').onclick=()=>goView('accounts');
window.addEventListener('resize',()=>{if(activeAccountKey&&accountDetailData&&accountDetailData.record.type!=='investment'&&!$('view-account-detail').classList.contains('hidden')&&!$('detailOverviewPanel').classList.contains('hidden')&&!$('detailBalanceChart').dataset.investmentEnhanced)renderNetWorthChart(accountDetailData.history,'detailBalanceChart');});

function accountTransactionVisible(){return !!activeAccountKey&&!$('view-account-detail').classList.contains('hidden');}
function editableTransactionById(id){return accountTransactionVisible()?accountDetailData?.transactions.find(t=>t.id===id):transactionRows.find(t=>t.id===id);}
async function refreshTransactionAfterEdit(){
 const fields=['searchBox','fCategory','fPerson','fAccount','txSort','txMinAmount','txMaxAmount','txFrom','txTo','txReview','txStatus','savedTxView'];
 const snapshot=Object.fromEntries(fields.map(id=>[id,$(id).value]));
 const facets=typeof txFacets==='undefined'?null:structuredClone(txFacets),merchant=transactionMerchantFilter;
 const accountKey=accountTransactionVisible()?activeAccountKey:null;
 if(accountKey){await refreshAccounts();await refreshOpenAccountDetail();}else{await loadTransactions();loadDashboard();return;}
 if(!accountTransactionVisible()||activeAccountKey!==accountKey)return;
 // Rebuilding options and account panels must not reset the user's ledger workspace.
 for(const [id,value]of Object.entries(snapshot)){const el=$(id);if(el.tagName==='SELECT'&&value&&![...el.options].some(o=>o.value===value))el.add(new Option(value,value));el.value=value;}
 if(facets!==null)txFacets=facets;transactionMerchantFilter=merchant;
 if(typeof renderActiveTransactionFilters==='function')renderActiveTransactionFilters();
 loadDashboard();
}
const accountActivityFilters=new Map();
const defaultAccountFilters={search:'',category:'',merchant:'',owner:'',tag:'',min:'',max:'',from:'',to:'',sort:'newest'};
function accountFilterKey(){return JSON.stringify([activeAccountKey,selectedOwner]);}
function currentAccountFilters(){return accountActivityFilters.get(accountFilterKey())||defaultAccountFilters;}
function accountTransactionTags(t){return String(t.tags||'').split(/[,;]/).map(tag=>tag.trim()).filter(Boolean);}
function accountFilterPanel(transactions){
 const options=(items,label)=>`<option value="">${label}</option>`+[...new Set(items.filter(Boolean))].sort((a,b)=>a.localeCompare(b)).map(name=>`<option>${esc(name)}</option>`).join('');
 const splitValues=field=>transactions.flatMap(t=>t.splits?.length?t.splits.map(s=>s[field]||t[field]):[t[field]]);
 return `<div id="detailFilterPanel" class="account-filter-panel" role="dialog" aria-label="Account filters" popover>
 <form id="detailFilterForm">
 <div class="account-filter-heading"><button type="button" id="detailResetFilters">Reset</button><button type="submit" class="primary">Apply</button></div>
 <label>Search<input id="detailTransactionSearch" name="search" type="search" placeholder="Find a transaction…" autocomplete="off"></label>
 <div>Category<select id="detailTransactionCategory" name="category" aria-label="Category">${options([...transactionCategories.map(c=>c.name),...splitValues('category')],'All categories')}</select></div>
 <label>Merchant<select id="detailTransactionMerchant" name="merchant">${options(transactions.map(t=>t.displayName||t.merchant),'All merchants')}</select></label>
 <div class="account-filter-pair"><label>Owner<select name="owner">${options(splitValues('person'),'All owners')}</select></label>
 <label>Tag<select name="tag">${options(transactions.flatMap(accountTransactionTags),'All tags')}</select></label></div>
 <div class="account-filter-pair"><label>Min. amount<input name="min" type="number" min="0" step=".01" placeholder="Any"></label><label>Max. amount<input name="max" type="number" min="0" step=".01" placeholder="Any"></label></div>
 <div class="account-filter-pair"><label>From<input name="from" type="date"></label><label>To<input name="to" type="date"></label></div>
 <label>Sort<select id="detailTransactionSort" name="sort"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="amount">Largest amount</option></select></label>
 <p role="status"></p></form></div>`;
}
function bindAccountFilters(){
 const panel=$('detailFilterPanel'),button=$('detailFilterButton'),form=$('detailFilterForm');
 const refresh=()=>{
   const state=currentAccountFilters();
   for(const key of Object.keys(defaultAccountFilters)){const field=form.elements.namedItem(key);field.value=state[key];if(field.tagName==='SELECT'&&field.selectedIndex<0)field.selectedIndex=0;field.budgetSearch?.refresh();}
   const count=Object.keys(defaultAccountFilters).filter(key=>state[key]!==defaultAccountFilters[key]).length;
   $('detailFilterCount').textContent=count?String(count):'';
 };
 const position=()=>{
   const box=button.getBoundingClientRect(),edge=10,width=Math.min(320,innerWidth-edge*2),height=Math.min(panel.scrollHeight,innerHeight-edge*2);
   panel.style.width=width+'px';
   panel.style.left=Math.max(edge,Math.min(box.right-width,innerWidth-width-edge))+'px';
   panel.style.top=Math.max(edge,Math.min(box.bottom+6,innerHeight-height-edge))+'px';
 };
 let listeners;
 refresh();
 panel.addEventListener('beforetoggle',event=>{if(event.newState==='open')refresh();});
 panel.addEventListener('toggle',()=>{
   listeners?.abort();
   if(!panel.matches(':popover-open')){panel.querySelectorAll('.drawer-category-picker[open]').forEach(picker=>picker.open=false);return;}
   position();
   listeners=new AbortController();const options={signal:listeners.signal};
   window.addEventListener('resize',position,options);
   window.addEventListener('scroll',event=>{if(event.target instanceof Node&&panel.contains(event.target))return;position();},{...options,capture:true});
 });
 const apply=state=>{
   accountActivityFilters.set(accountFilterKey(),state);refresh();renderAccountTransactions();
   if(panel.matches(':popover-open'))panel.hidePopover();
 };
 $('detailResetFilters').onclick=()=>apply({...defaultAccountFilters});
 form.onsubmit=event=>{
   event.preventDefault();const data=Object.fromEntries(new FormData(form)),status=form.querySelector('[role=status]');
   if(data.from&&data.to&&data.from>data.to){status.textContent='Choose an end date after the start date.';return;}
   if(data.min&&data.max&&Number(data.min)>Number(data.max)){status.textContent='Maximum amount must be at least the minimum.';return;}
   status.textContent='';apply(data);
 };
}
function renderAccountTransactions(){const host=$('detailTransactionTable');if(!host||!accountDetailData)return;
 const {search,sort,category,merchant,owner,tag,min,max,from,to}=currentAccountFilters();
 const q=search.trim().toLowerCase(),a=accountDetailData.record,rows=accountDetailData.transactions.filter(t=>{
   const parts=t.splits?.length?t.splits:[t];
   return (!merchant||(t.displayName||t.merchant)===merchant)&&
     parts.some(part=>(!category||part.category===category)&&(!owner||(part.person||t.personResolved||t.person)===owner))&&
     (!tag||accountTransactionTags(t).includes(tag))&&(!from||t.date>=from)&&(!to||t.date<=to)&&
     (!min||Math.abs(t.amount)>=Number(min))&&(!max||Math.abs(t.amount)<=Number(max))&&
     [t.displayName||t.merchant,t.category,t.originalStatement,...parts.map(part=>part.category)].join(' ').toLowerCase().includes(q);
 }).sort((a,b)=>sort==='amount'?Math.abs(b.amount)-Math.abs(a.amount):sort==='oldest'?a.date.localeCompare(b.date):b.date.localeCompare(a.date));let lastDate='';const daily=new Map();for(const t of rows)daily.set(t.date,(daily.get(t.date)||0)+t.amount);host.innerHTML=rows.length?`<table class="transaction-table account-transactions"><thead><tr><th>Transaction</th><th>Category</th><th>Owner</th><th class="tx-money-heading">Amount</th><th></th></tr></thead><tbody>${rows.map(t=>{let heading='';if(sort!=='amount'&&lastDate!==t.date){lastDate=t.date;heading=`<tr class="transaction-day"><th colspan="5">${esc(txDateLabel(t.date))}<span class="day-total">${money(daily.get(t.date))}</span></th></tr>`;}return heading+`<tr class="transaction-row"><td class="tx-merchant"><div class="transaction-cell"><button data-inline-field="displayName" data-inline-id="${t.id}">${merchantIcon(t)}<span>${esc(t.displayName||t.merchant)}</span></button>${transactionAnnotations(t,'tags')}</div></td><td class="tx-category">${transactionRowCategories(t)}</td><td class="tx-owner"><button data-inline-field="person" data-inline-id="${t.id}" class="inline-cell-button" aria-label="Edit owner">${ownerAvatar(t.personResolved||t.person||a.person)}</button></td><td class="tx-money"><span class="transaction-amount-content">${transactionAnnotations(t,'note')}<button data-inline-field="amount" data-inline-id="${t.id}" class="inline-cell-button ${t.amount>0?'delta-positive':''}" aria-label="Edit amount">${t.amount>0?'+':''}${money(t.amount)}</button></span></td><td class="tx-open"><button data-account-transaction="${t.id}" aria-label="Open transaction details">›</button></td></tr>`;}).join('')}</tbody></table>`:'<div class="detail-empty">No matching transactions.</div>';host.querySelectorAll('[data-account-transaction]').forEach(button=>button.onclick=async()=>{const d=await api('/api/transactions/'+button.dataset.accountTransaction);openTransactionDetail(d.transaction);});const summary=$('detailFilteredSummary');
 const filtered=Object.keys(defaultAccountFilters).some(key=>key!=='sort'&&currentAccountFilters()[key]!==defaultAccountFilters[key]);
 summary.classList.toggle('hidden',!filtered);
 if(filtered){
   const posted=rows.filter(t=>!t.pending&&!t.hidden),out=posted.reduce((sum,t)=>sum+Math.max(0,-Math.round(t.amount*100)),0),incoming=posted.reduce((sum,t)=>sum+Math.max(0,Math.round(t.amount*100)),0);
   summary.innerHTML=`<h3>Filtered activity</h3><dl class="account-metadata"><dt>Transactions</dt><dd>${rows.length}</dd><dt>Money out</dt><dd>${money(out/100)}</dd><dt>Money in</dt><dd>${money(incoming/100)}</dd><dt>Net activity</dt><dd>${money((incoming-out)/100)}</dd></dl>`;
 }
 bindInlineTransactions();bindTransactionEntities();$('detailTransactionMessage').textContent=rows.length+' transactions · Click a name, category, owner or amount to edit.';}
// Explicit save/delete handlers refresh the account; closing without saving makes no request.

function cardLimitLabel(a){return a.creditLimitType==='none'?'No preset limit':a.creditLimitType==='fixed'&&Number(a.creditLimit)>0?money(a.creditLimit):'Not set';}
function cardDetailsStrip(a){let s=accountDetailData?.statement;const payment=accountsCache.find(v=>v.id===a.payFromAccountId);if(!s){
 const confirmedPayment=a.paymentDueDate&&Number(a.statementBalance)>0&&accountDetailData.transactions.find(t=>
   !t.pending&&t.category==='Credit Card Payment'&&(t.bankPostedDate||t.date)===a.paymentDueDate&&
   Math.round(t.amount*100)===Math.round(a.statementBalance*100));
 if(!confirmedPayment)return `<div class="card-key-dates"><span>Set your statement cycle to estimate payments.</span><button class="text-action" data-edit-card-payments>Set up card details</button></div>`;
 s={paymentDueDate:a.paymentDueDate,statementRemaining:0,unbilled:a.balance,
    paidAmount:a.statementBalance,paidDate:confirmedPayment.bankPostedDate||confirmedPayment.date};
}
 const start=s.statementCloseDate?new Date(s.statementCloseDate+'T12:00:00Z'):null;
 if(start)start.setUTCDate(start.getUTCDate()+1);
 const date=v=>v?esc(shortAccountDate(v)):'Not recorded';
 const range=(from,to)=>from&&to?`${date(from)} – ${date(to)}`:'Dates not recorded';
 const paid=s.statementRemaining<=0,asOf=s.asOf||localToday();
 const state=paid?'paid':s.paymentDueDate<=asOf?'due':'upcoming';
 const label=paid?(s.estimated?'No payment due':'Paid'):s.paymentDueDate<asOf?'Payment overdue':s.paymentDueDate===asOf?'Payment due today':'Payment due';
 return `<section class="account-cycle-dashboard" aria-label="Card payment cycles"><div class="cycle-dashboard-heading"><span>Pay from <strong>${esc(payment?.name||'Not set')}</strong></span><button class="text-action" data-edit-card-payments>Edit cycle</button></div><div class="cycle-dashboard-grid"><section class="cycle-dashboard-period" data-payment-state="${state}"><div class="cycle-dashboard-title"><h4>Last cycle</h4><span>${range(s.cycleStart,s.statementCloseDate)}</span></div><div class="cycle-payment-status"><span>${label}${paid?'':' · '+date(s.paymentDueDate)}</span><strong class="cycle-dashboard-amount">${money(s.statementRemaining)}</strong></div><span class="cycle-dashboard-caption">${s.estimated&&!paid?'Estimated statement amount':paid?'Statement settled':'Statement amount remaining'}</span><dl><dt>Statement issued</dt><dd>${date(s.statementIssueDate)}</dd>${s.paidAmount?`<dt>Paid ${date(s.paidDate)}</dt><dd>${money(s.paidAmount)}</dd>`: ''}</dl></section><section class="cycle-dashboard-period current-cycle"><div class="cycle-dashboard-title"><h4>Current cycle</h4><span>${range(start?.toISOString().slice(0,10),s.nextCloseDate)}</span></div><strong class="cycle-dashboard-amount">${money(s.unbilled)}</strong><span class="cycle-dashboard-caption">${s.paidAmount?'Current posted balance':'Estimated statement so far'}</span>${s.nextCycleRewards?`<small class="muted">${money(s.nextCycleRewards)} cashback applied to this cycle</small>`:''}<dl><dt>Cycle ends</dt><dd>${date(s.nextCloseDate)}</dd><dt>Statement issued</dt><dd>${date(s.nextStatementIssueDate)}</dd><dt>Payment due</dt><dd>${date(s.nextPaymentDueDate)}</dd></dl></section></div></section>`;}
function cardPaymentSummary(a){const fixed=a.creditLimitType==='fixed'&&Number(a.creditLimit)>0,used=Math.max(0,Number(a.balance)),percent=fixed?used/Number(a.creditLimit)*100:null;return `<section class="card card-payment-summary"><div class="widget-head"><h3>Credit details</h3><button class="text-action" data-edit-card-payments>Edit</button></div>${fixed?`<div class="card-utilization"><span>Credit used <strong>${Math.round(percent)}%</strong></span><progress max="100" value="${Math.min(100,percent)}" aria-label="Credit used"></progress></div>`:''}<dl class="account-metadata"><dt>Credit limit</dt><dd>${esc(cardLimitLabel(a))}</dd>${fixed?`<dt>${used>Number(a.creditLimit)?'Over limit':'Credit available'}</dt><dd>${money(Math.abs(Number(a.creditLimit)-used))}</dd>`:''}<dt>Minimum payment</dt><dd>${a.minimumPayment?money(a.minimumPayment):'Not set'}</dd></dl></section>`;}

const cardRewardsGuides=[
 {match:/\bamerican express cobalt\b/i,program:'Membership Rewards',
  perks:["Transfer to participating loyalty programs. Check each partner\u2019s transfer ratio.", "Amex Offers must be added to the card when the offer requires it. Travel and purchase coverage have separate eligibility rules."],
  tiers:[['5×','Food & groceries','Eligible Canadian purchases · $2,500 monthly spend cap'],['3×','Streaming','Eligible Canadian subscriptions'],['2×','Gas, transit & rideshare','Eligible Canadian purchases'],['1×','Other purchases'],['+1','Amex Travel Online','Eligible hotels and car rentals']],
  source:'https://www.americanexpress.com/ca/en/benefits/cobalt-card/'},
 {match:/\brogers red world elite mastercard\b/i,program:'Cash back',rogers:true,
  perks:["A $75 annual roaming credit starts Jan 12, 2027 for eligible roaming purchases.", "Check the certificate before booking. Trip cancellation, interruption and delay coverage ended Nov 18, 2026."],
  perkSource:"https://www.rogersbank.com/en/help_centre_answers/upcoming_account_changes/",
  tiers:[['5%','Select Rogers purchases','From Nov 18, 2026'],['3%','Eligible USD purchases'],['2%','Other eligible purchases','With qualifying Rogers service · otherwise 1.5%']],
  note:'After $61,000 in annual spending, the rate is 1.5%. The 1.5× redemption bonus ended Nov 18, 2026.',
  source:'https://www.rogersbank.com/en/rogers_red_worldelite_mastercard_details/'},
 {match:/\bscotia momentum visa infinite\b/i,program:'Cash back',
  perks:["Up to $1,000 of eligible mobile device coverage, subject to the certificate and deductible.", "Link the card for Shell savings. Visa Infinite also offers an eligible annual GigSky data plan."],
  perkSource:"https://www.scotiabank.com/momentuminfinite/",
  tiers:[['4%','Groceries & qualifying recurring bills'],['2%','Gas, EV charging, transit, rideshare & select delivery'],['1%','Other eligible purchases']],
  note:'Each bonus tier has a separate $25,000 annual spending limit. Since Oct 22, 2026, rent (MCC 6513) and tax (MCC 9311) no longer qualify for 4%. Redeem through Scotia from $25.',
  source:'https://www.scotiabank.com/ca/en/personal/credit-cards/visa/momentum-infinite-card/welcome-kit/terms-conditions-momentum-infinite.html'},
 {match:/\bwealthsimple visa infinite privilege\b/i,program:'Cash back',
  perks:["Six Visa Airport Companion lounge visits every 12 months after enrolment.", "No foreign transaction fee. Select airports offer priority services."],
  perkSource:"https://help.wealthsimple.com/hc/en-ca/articles/40719871760667-Compare-Visa-Infinite-and-Visa-Infinite-Privilege-credit-cards",
  tiers:[['2%','Eligible purchases','Unlimited']],
  note:'Redeem manually into an eligible Wealthsimple account.',
  source:'https://help.wealthsimple.com/hc/en-ca/articles/37750003281563-Earn-cash-back-with-your-credit-card'},
 {match:/\btd aeroplan visa infinite\b/i,program:'Aeroplan points',
  perks:["Link the card to Aeroplan for the first checked bag on eligible Air Canada itineraries, for up to nine travellers on the same reservation.", "Eligible NEXUS application fee credit of up to $100 CAD per cardholder every 48 months."],
  perkSource:"https://www.td.com/ca/en/personal-banking/products/credit-cards/aeroplan/aeroplan-visa-infinite-card/welcome-guide",
  tiers:[['1.5×','Groceries, gas, EV charging & Air Canada'],['1×','Other eligible purchases']],
  note:'First checked bag benefit on eligible Air Canada itineraries.',
  source:'https://www.td.com/ca/en/personal-banking/products/credit-cards/aeroplan/aeroplan-visa-infinite-card'},
 {match:/\brbc ion\+ visa\b/i,program:'Avion Rewards',
  perks:["Link your RBC card to a Petro-Points account for eligible fuel savings and extra points."],
  rates:'3× on eligible groceries, dining, delivery, transit, rideshare, gas, EV charging, streaming and gaming or digital subscriptions. 1× on other eligible purchases.',
  source:'https://www.rbcroyalbank.com/credit-cards/rbc-ion-plus-visa.html'},
 {match:/\bscotiabank passport visa infinite\b/i,program:'Scene+',
  perks:["Redeem Scene+ points through eligible partners or against eligible travel."],
  perkSource:"https://www.scotiabank.com/ca/en/personal/programs-services/sceneplus-rewards/earn-redeem.html",
  rates:'3× at participating grocers, 2× on other eligible groceries, dining, entertainment and daily transit, 1× on other eligible purchases.',
  source:'https://www.scotiabank.com/ca/en/personal/credit-cards/visa/passport-infinite-card/welcome-kit/scene-program.html'}
];

function cardRewardsSummary(account){
 const guide=cardRewardsGuides.find(entry=>[account.name,account.displayName,account.sourceName].some(name=>entry.match.test(name||'')));
 const importedCashback=cardCashbackMarkup(accountDetailData?.transactions||[]);
 if(!guide)return `<section class="card card-rewards-guide"><h3>Rewards</h3><details><summary>Additional perks</summary><p class="muted">Confirm the card product to see issuer perks.</p></details>${importedCashback}${rewardHistoryMarkup(account)}</section>`;
 const tiles=guide.tiers?.map(([rate,label,detail])=>`<div><strong>${esc(rate)}</strong><span>${esc(label)}</span>${detail?`<small>${esc(detail)}</small>`:''}</div>`).join('');
 const chexy=guide.rogers?`<div class="card-chexy-offer"><strong>Chexy · +1% cash back</strong><p>Nov 11, 2026 – May 10, 2027. Up to $10,000 in eligible posted payments for this card ($100 maximum bonus). Up to 3% total with eligible Rogers service, before Chexy’s 1.75% fee.</p><a href="https://chexy.co/rogers" target="_blank" rel="noopener noreferrer">Chexy offer terms ↗</a></div>`:'';
 const credits=(accountDetailData?.transactions||[]).filter(t=>!t.pending&&t.amount>0&&/\b(?:welcome|spend) bonus\b/i.test(t.displayName||t.merchant||''));
 const perks=`<details class="card-perks"><summary>Additional perks</summary><ul>${guide.perks.map(perk=>`<li>${esc(perk)}</li>`).join('')}</ul>
  <a href="${esc(guide.perkSource||guide.source)}" target="_blank" rel="noopener noreferrer">Issuer benefit details ↗</a></details>`;
 const offer=account.welcomeOffer||{terms:'',deadline:'',status:'unverified'};
 const states={'unverified':'Unverified','in-progress':'In progress','completed':'Completed','expired':'Expired'};
 const welcome=guide.tiers?`<div class="card-welcome-offer">
  <strong>Welcome offer</strong><p>${esc(states[offer.status])}${offer.deadline?' · Deadline '+esc(txDateLabel(offer.deadline)):''}</p>
  ${offer.terms?`<p>${esc(offer.terms)}</p>`:''}
  ${credits.map(t=>`<p>${esc(t.displayName||t.merchant)} · ${money(t.amount)} · ${esc(txDateLabel(t.date))}</p>`).join('')}
  <details><summary>Edit offer</summary><form id="cardWelcomeOfferForm">
   <label>Opening offer terms<textarea name="terms" maxlength="1500" placeholder="Reward, required spend and any separate milestones">${esc(offer.terms)}</textarea></label>
   <label>Deadline<input name="deadline" type="date" value="${esc(offer.deadline)}"></label>
   <label>Status<select name="status">${Object.entries(states).map(([value,label])=>`<option value="${value}" ${value===offer.status?'selected':''}>${label}</option>`).join('')}</select></label>
   <button>Save offer</button><small role="status"></small>
  </form></details></div>`:'';

 return `<section class="card card-rewards-guide"><h3>Rewards</h3><p>${esc(guide.program)}</p>${tiles?`<div class="card-reward-tiers">${tiles}</div>`:`<p>${esc(guide.rates)}</p>`}${guide.note?`<p>${esc(guide.note)}</p>`:''}<a href="${esc(guide.source)}" target="_blank" rel="noopener noreferrer">Issuer terms ↗</a>${importedCashback}${perks}${chexy}${welcome}${rewardHistoryMarkup(account,guide.program==='Cash back'?'cashback':'points')}</section>`;
}

function bindWelcomeOffer(account,key){
 const form=$('cardWelcomeOfferForm');
 if(!form)return;
 form.onsubmit=async event=>{
  event.preventDefault();
  const button=form.querySelector('button'),status=form.querySelector('[role=status]');
  button.disabled=true;
  try{
   const welcomeOffer=Object.fromEntries(new FormData(form));
   await put('/api/accounts/'+encodeURIComponent(account.id),{welcomeOffer});
   if(activeAccountKey===key)await loadAccountDetail(key,$('detailPeriod').value);
  }catch(error){status.textContent=error.message;}
  finally{button.disabled=false;}
 };
}

function rewardHistoryMarkup(account,unit='cashback'){
 const history=[...(account.rewardHistory||[])].sort((a,b)=>b.date.localeCompare(a.date)||a.unit.localeCompare(b.unit));
 const balance=r=>r.unit==='cashback'?money(r.amount):r.amount.toLocaleString('en-CA')+' points';
 const latest=['points','cashback'].map(kind=>history.find(r=>r.unit===kind)).filter(Boolean);
 return `<details class="card-reward-history"><summary>Rewards history${latest.length?' · '+latest.map(balance).join(' and '):''}</summary>
  <p class="muted">Record the available balance shown by the issuer. The same date and reward type updates that entry.</p>
  ${history.length?`<ul>${history.map(r=>`<li>${esc(txDateLabel(r.date))} · <strong>${esc(balance(r))}</strong></li>`).join('')}</ul>`:''}
  <form id="cardRewardHistoryForm">
   <label>As of<input name="date" type="date" value="${esc(localToday())}" required></label>
   <label>Reward type<select name="unit"><option value="cashback" ${unit==='cashback'?'selected':''}>Cash back (CAD)</option><option value="points" ${unit==='points'?'selected':''}>Points</option></select></label>
   <label>Available balance<input name="amount" type="number" inputmode="decimal" min="0" max="1000000000" step=".01" required></label>
   <button>Save balance</button><small role="status"></small>
  </form></details>`;
}

function bindRewardHistory(account,key){
 const form=$('cardRewardHistoryForm');
 if(!form)return;
 const amount=form.elements.amount,unit=form.elements.unit,updateStep=()=>amount.step=unit.value==='points'?'1':'.01';
 unit.onchange=updateStep;updateStep();
 form.onsubmit=async event=>{
  event.preventDefault();
  const button=form.querySelector('button'),status=form.querySelector('[role=status]');
  button.disabled=true;
  try{
   await post('/api/accounts/'+encodeURIComponent(account.id)+'/reward-history',Object.fromEntries(new FormData(form)));
   if(activeAccountKey===key){
    await loadAccountDetail(key,$('detailPeriod').value);
    $('cardRewardHistoryForm')?.closest('details').setAttribute('open','');
   }
  }catch(error){status.textContent=error.message;}
  finally{button.disabled=false;}
 };
}

function cardCashbackMarkup(transactions){
 const credits=transactions.filter(t=>!t.pending&&!t.hidden&&t.category==='Cashback');
 const cents=credits.reduce((total,t)=>total+Math.round(t.amount*100),0);
 const bonus=credits.filter(t=>t.amount>0&&/\b(?:welcome|spend) bonus\b/i.test(t.displayName||t.merchant||''))
  .reduce((total,t)=>total+Math.round(t.amount*100),0);
 return `<div class="card-imported-cashback"><strong>${money(cents/100)}</strong>
  <span>Cashback posted to this card</span>
  <small>${credits.length?`${credits.length} recorded entries${bonus?' · includes '+money(bonus/100)+' in bonus credits':''}`:'No cashback credits recorded on this card.'}</small></div>`;
}
