/* Saved cash-flow setup and a purchase-first interface. */
let fundsSavedSetup=null,fundsQuickScope=null,fundsQuickRun=0,fundsSetupRequest=null,fundsInputTimer;
const fundsScopeQuery=()=>selectedOwner?'?scopeOwner='+encodeURIComponent(selectedOwner):'';
const fundsHost=$('view-funds').querySelector('section.card'),fundsSettings=document.createElement('details');fundsSettings.id='fcSavedSetup';fundsSettings.innerHTML='<summary>Your cash-flow setup <span id="fcSetupStatus">Not saved yet</span><svg class="funds-setup-chevron" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="m5 7 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></summary>';
while(fundsHost.firstChild)fundsSettings.append(fundsHost.firstChild);fundsHost.append(fundsSettings);
fundsSettings.querySelector('h3').textContent='Set up once, update when things change';fundsSettings.querySelector('p.muted').textContent='Choose chequing, pay and a forecast window. Linked bills and card payments are included automatically. Add transfers only when you expect them.';
const quickHero=document.createElement('div');quickHero.className='funds-quick';quickHero.innerHTML='<div class="funds-quick-heading"><div><h3>Cash forecast</h3><p class="muted">Follow your projected balance through paydays, rent, bills, card payments and transfers, then compare a purchase.</p></div><button id="fcBaselineBtn" class="text-action">Refresh forecast</button></div><div class="funds-quick-controls"><label>Look ahead<select id="fcForecastDays" disabled></select></label><label>Purchase total · CAD<input id="fcQuickAmount" type="number" inputmode="decimal" min="0" step=".01" placeholder="e.g. 500.00"/></label><label>Purchase date<input id="fcQuickPurchaseDate" type="date" disabled/></label><label>Pay with<select id="fcPurchaseAccount" disabled></select></label></div><p id="fcQuickContext" class="muted"></p><p id="fcQuickStatus" role="status"></p><div id="fcQuickResults" aria-live="polite"></div>';
fundsHost.prepend(quickHero);
function setFundsButtonsDisabled(disabled){$('fcBaselineBtn').disabled=$('fcQuickAmount').disabled=$('fcQuickPurchaseDate').disabled=$('fcForecastDays').disabled=$('fcPurchaseAccount').disabled=disabled;}
setFundsButtonsDisabled(true);fundsSettings.querySelector('.funds-purchase h4').textContent='Default payment method';['fcPurchaseName','fcAmount','fcPurchaseDate','fcTaxRate'].forEach(id=>$(id).closest('label').classList.add('hidden'));$('fcIncludesTax').closest('label').classList.add('hidden');$('fcBtn').classList.add('hidden');$('fcEnd').closest('label').classList.add('hidden');$('fcStart').closest('label').classList.add('hidden');
const daysLabel=document.createElement('label');daysLabel.innerHTML='Look ahead<select id="fcQuickDays"><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option><option value="120">120 days</option><option value="180">180 days</option></select>';$('fcBuffer').closest('.formgrid').append(daysLabel);
const chargeBlock=document.createElement('section');chargeBlock.className='funds-planned-charges hidden';chargeBlock.innerHTML='<h4>Recurring card charges · rent, utilities, internet or Chexy</h4><p class="muted">Add only charges not already scheduled in Recurring or Loans. Enter the base amount and an optional processing fee. Your partner’s repayment belongs under incoming e-transfers; it does not reduce what the card issuer is owed.</p><div id="fcPlannedCharges"></div><button id="fcAddCharge" class="text-action" type="button">＋ Recurring card charge</button>';
$('fcExtraFlows').parentElement.after(chargeBlock);const saveRow=document.createElement('div');saveRow.className='funds-save-row';saveRow.innerHTML='<button id="fcSaveSetup" class="primary" type="button">Save cash-flow setup</button><p id="fcSaveStatus" role="status"></p>';fundsSettings.append(saveRow);
const paySources=document.createElement('div');paySources.className='formgrid';paySources.innerHTML='<label>Pay estimate<select id="fcPaySource"><option value="payroll">Predict from Payroll</option><option value="manual">Manual estimate</option><option value="none">No expected pay</option></select></label><label id="fcPayOwnerLabel">Payroll profile<select id="fcPayOwner"></select></label><label id="fcPayEmployerLabel">Employer<select id="fcPayEmployer"><option value="">Choose automatically</option></select></label>';const payNote=document.createElement('p');payNote.id='fcPayPrediction';payNote.className='muted';$('fcIncomeAmount').closest('.formgrid').before(paySources,payNote);const billSources=document.createElement('section');billSources.innerHTML='<h4>Recurring payments come from Bills</h4><p class="muted">Rent, utilities, internet and Chexy charges are managed in Bills. Funds Check automatically uses their amount, processing fee, date and payment account. Card charges are paid through the card’s statement cycle.</p><button id="fcOpenBills" class="text-action" type="button">Manage bills</button><div id="fcBillsPreview"></div>';chargeBlock.after(billSources);$('fcOpenBills').onclick=()=>goView('bills');
let fundsSourcesRequest=0;
async function refreshFundsSources(){const version=++fundsSourcesRequest;const manual=$('fcPaySource').value==='manual',payroll=$('fcPaySource').value==='payroll';for(const id of ['fcIncomeAmount','fcIncomeDate','fcIncomeFrequency'])$(id).closest('label').classList.toggle('hidden',!manual);$('fcUsePayroll').classList.add('hidden');$('fcPayrollNote').classList.add('hidden');$('fcPayOwnerLabel').classList.toggle('hidden',!payroll);$('fcPayEmployerLabel').classList.toggle('hidden',!payroll);try{const [profiles,bills]=await Promise.all([api('/api/profiles'),api('/api/bills')]);if(version!==fundsSourcesRequest)return;const owner=$('fcPayOwner').value||activeOwnerName()||signedInUser.name;$('fcPayOwner').innerHTML=profiles.profiles.map(u=>`<option value="${esc(u.name)}">${esc(u.name)}</option>`).join('');$('fcPayOwner').value=owner;$('fcBillsPreview').innerHTML=bills.items.map(b=>`<p>${esc(b.name)} · ${money(Number(b.amount||0)*(1+Number(b.processingFeePercent||0)/100))} · ${esc(b.frequency||'monthly')}${b.payFromAccountId?'':' · payment account needed'}</p>`).join('')||'<p class="muted">No bills saved yet.</p>';if(!payroll){$('fcPayPrediction').textContent=manual?'Manual pay estimate is used instead of Payroll.':'No paycheques will be forecast.';return;}const employer=$('fcPayEmployer').value;const d=await api('/api/funds-payroll-estimate?owner='+encodeURIComponent(owner)+'&date='+localToday()+'&employer='+encodeURIComponent(employer));if(version!==fundsSourcesRequest)return;if(d.employers){$('fcPayEmployer').innerHTML='<option value="">Choose an employer</option>'+d.employers.map(e=>`<option>${esc(e)}</option>`).join('');}else if(d.employer){$('fcPayEmployer').innerHTML=`<option value="">Choose automatically</option><option value="${esc(d.employer)}">${esc(d.employer)}</option>`;if(employer)$('fcPayEmployer').value=employer;}$('fcPayPrediction').textContent=d.amount?money(d.amount)+' take-home · '+d.frequency+' · next predicted payday '+txDateLabel(d.nextDate)+' · '+d.employer+'. '+(d.warning||'Automatically updates when you save a newer pay statement.'):d.warning;}catch(e){$('fcPayPrediction').textContent=e.message;}}
$('fcPaySource').onchange=refreshFundsSources;$('fcPayOwner').onchange=()=>{$('fcPayEmployer').value='';refreshFundsSources();};$('fcPayEmployer').onchange=refreshFundsSources;
function addPlannedCharge(value={}){const row=document.createElement('div');row.className='funds-charge-row';row.dataset.id=value.id||crypto.randomUUID();row.innerHTML=`<label>Charge<input data-charge="label" placeholder="e.g. Rent via Chexy"/></label><label>Card<select data-charge="cardId">${fundCards.filter(c=>c.payFromAccountId===$('fcAccount').value).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label><label>Base amount<input data-charge="amount" type="number" min="0" step=".01"/></label><label>Fee %<input data-charge="feePercent" type="number" min="0" max="100" step=".01" value="0"/></label><label>Next charge<input data-charge="date" type="date" value="${localToday()}"/></label><label>Repeat<select data-charge="frequency"><option value="monthly">Monthly</option><option value="biweekly">Every two weeks</option><option value="weekly">Weekly</option><option value="once">Once</option></select></label><button class="icon-button" type="button" aria-label="Remove planned charge">×</button>`;for(const [key,v]of Object.entries(value)){const field=row.querySelector('[data-charge="'+key+'"]');if(field)field.value=v;}row.querySelector('button').onclick=()=>{row.remove();dirtyFundsSetup();};$('fcPlannedCharges').append(row);}
$('fcAddCharge').onclick=()=>{addPlannedCharge();dirtyFundsSetup();};
function fundsSetupPayload(){return {accountId:$('fcAccount').value,cardId:$('fcCard').value,payWith:$('fcPayWith').value,buffer:$('fcBuffer').value||0,days:$('fcQuickDays').value,dailySpend:$('fcDailySpend').value,dailyPayWith:$('fcDailyPayWith').value,incomeSource:$('fcPaySource').value,payrollOwner:$('fcPayOwner').value,payrollEmployer:$('fcPayEmployer').value,incomeAmount:$('fcIncomeAmount').value,incomeDate:$('fcIncomeDate').value,incomeFrequency:$('fcIncomeFrequency').value,extra:[...$('fcExtraFlows').children].map((row,i)=>({id:row.dataset.id||'flow:'+i,label:row.querySelector('[data-flow-label]').value,date:row.querySelector('[data-flow-date]').value,amount:row.dataset.kind==='outgoing'?-Math.abs(Number(row.querySelector('[data-flow-amount]').value)):row.querySelector('[data-flow-amount]').value,frequency:row.querySelector('[data-flow-frequency]').value,kind:row.dataset.kind})),charges:[...$('fcPlannedCharges').children].map(row=>({id:row.dataset.id,...Object.fromEntries([...row.querySelectorAll('[data-charge]')].map(f=>[f.dataset.charge,f.value]))}))};}
function markFundsForecastStale(message='Updating forecast…'){
 const results=$('fcQuickResults');
 if(results.children.length){results.classList.add('is-stale');results.setAttribute('aria-busy','true');}
 $('fcQuickStatus').textContent=message;
}
function dirtyFundsSetup(){clearTimeout(fundsInputTimer);++fundsQuickRun;markFundsForecastStale('Forecast paused until these setup changes are saved.');$('fcSetupStatus').textContent='Unsaved changes';setFundsButtonsDisabled(true);$('fcSaveStatus').textContent='Save your changes to refresh the forecast.';}
fundsSettings.addEventListener('input',dirtyFundsSetup);fundsSettings.addEventListener('change',dirtyFundsSetup);
function updatePurchaseAccounts(){
 const select=$('fcPurchaseAccount'),setup=fundsSavedSetup;
 if(!setup){select.replaceChildren();return;}
 const checking=fundPlanAccounts.find(a=>a.id===setup.accountId);
 const cards=fundCards.filter(a=>a.payFromAccountId===setup.accountId);
 const wanted=select.value||(setup.payWith==='credit'?setup.cardId:setup.accountId);
 const accounts=[checking,...cards].filter(Boolean);
 select.replaceChildren(...accounts.map(a=>new Option(a.name,a.id)));
 select.value=accounts.some(a=>a.id===wanted)?wanted:checking?.id||'';
 const dashboard=$('dashboardFundsAccount');if(dashboard){const preferred=dashboard.value||wanted;dashboard.replaceChildren(...accounts.map(a=>new Option(a.name,a.id)));dashboard.value=accounts.some(a=>a.id===preferred)?preferred:checking?.id||'';}
}
function dashboardFundsDays(){const value=$('dashboardFundsDays').value;if(value!=='custom')return Number(value);const start=Date.parse($('dashboardFundsDate').value),end=Date.parse($('dashboardFundsEnd').value),days=Math.round((end-start)/86400000)+1;if(!Number.isInteger(days)||days<7||days>365)throw Error('Choose a custom forecast between 7 and 365 days.');return days;}
function hydrateDashboardFunds(){if(!$('dashboardFundsDate').value)$('dashboardFundsDate').value=localToday();let saved='';try{saved=localStorage.getItem('pulse-dashboard-funds-days')||'';}catch{}if(saved&&[...$('dashboardFundsDays').options].some(option=>option.value===saved))$('dashboardFundsDays').value=saved;const custom=$('dashboardFundsDays').value==='custom';$('dashboardFundsEndLabel').classList.toggle('hidden',!custom);if(custom&&!$('dashboardFundsEnd').value)$('dashboardFundsEnd').value=addDaysLocal($('dashboardFundsDate').value,29);const long=custom?dashboardFundsDays()>90:Number($('dashboardFundsDays').value)>90;$('dashboardForecastUncertainty').classList.toggle('hidden',!long);updatePurchaseAccounts();$('quickCheckBtn').disabled=$('dashboardFundsReset').disabled=!fundsSavedSetup;$('quickCheckMsg').textContent=fundsSavedSetup?'':'Complete Advanced setup before using the dashboard forecast.';}
function hydrateFundsSetup(s){
 updatePurchaseAccounts();
 if(s){
  const range=$('fcForecastDays'),preferred=range.value||String(s.days||90);
  range.replaceChildren(...[...new Set([7,14,30,60,90,120,180,Number(s.days||90)])].sort((a,b)=>a-b).map(days=>new Option(days+' days',days)));
  range.value=preferred;
  if(!$('fcQuickPurchaseDate').value)$('fcQuickPurchaseDate').value=localToday();
  hydrateDashboardFunds();
 }
 if(!s){hydrateDashboardFunds();fundsSettings.open=true;setFundsButtonsDisabled(true);$('fcQuickContext').textContent='Save a chequing account, forecast range and income assumption to start the baseline forecast.';$('fcQuickStatus').textContent='Forecast setup required';$('fcQuickResults').innerHTML='<section class="funds-setup-required"><h4>Complete the cash-flow setup</h4><p>Choose a chequing account and forecast period. Then choose Payroll, a manual pay estimate or no expected pay. Assign payment accounts to bills and credit cards so they can appear in the projection.</p></section>';return;}if(s.payrollOwner&&!Array.from($('fcPayOwner').options).some(o=>o.value===s.payrollOwner))$('fcPayOwner').add(new Option(s.payrollOwner,s.payrollOwner));if(s.payrollEmployer&&!Array.from($('fcPayEmployer').options).some(o=>o.value===s.payrollEmployer))$('fcPayEmployer').add(new Option(s.payrollEmployer,s.payrollEmployer));$('fcAccount').value=s.accountId;fundAccountChanged();for(const [id,key]of Object.entries({fcCard:'cardId',fcPayWith:'payWith',fcBuffer:'buffer',fcQuickDays:'days',fcDailySpend:'dailySpend',fcDailyPayWith:'dailyPayWith',fcIncomeAmount:'incomeAmount',fcIncomeDate:'incomeDate',fcIncomeFrequency:'incomeFrequency',fcPaySource:'incomeSource',fcPayOwner:'payrollOwner',fcPayEmployer:'payrollEmployer'}))$(id).value=s[key]??'';$('fcPayWith').onchange();if(!s.incomeSource)$('fcPaySource').value='payroll';if(!s.payrollOwner)$('fcPayOwner').value=activeOwnerName()||signedInUser.name;refreshFundsSources();$('fcExtraFlows').innerHTML='';for(const value of s.extra||[]){extraFundFlow(value.kind==='incoming');const row=$('fcExtraFlows').lastElementChild;row.dataset.id=value.id;for(const [attr,key]of [['label','label'],['date','date'],['amount','amount'],['frequency','frequency']])row.querySelector('[data-flow-'+attr+']').value=key==='amount'?Math.abs(value[key]):value[key];}$('fcPlannedCharges').innerHTML='';for(const value of s.charges||[])addPlannedCharge(value);setFundsButtonsDisabled(false);$('fcSetupStatus').textContent='Saved';$('fcSaveStatus').textContent='';fundsSettings.open=false;$('fcQuickContext').textContent=(fundCards.find(c=>c.id===s.cardId)?.name||'Chequing')+' · '+s.days+' days · latest imported balances and logged expenses. Price is the total in CAD, including tax and any currency conversion.';}
const oldInitFunds=initFundPlan;
initFundPlan=async function(){
 await oldInitFunds();
 const key=signedInUser?.id+':'+selectedOwner;
 if(key===fundsQuickScope){await fundsSetupRequest;updatePurchaseAccounts();return;}
 fundsQuickScope=key;
 fundsSavedSetup=null;
 clearTimeout(fundsInputTimer);
 setFundsButtonsDisabled(true);
 ++fundsQuickRun;
 $('fcQuickResults').innerHTML='';
 $('fcQuickAmount').value='';
 $('fcQuickPurchaseDate').value=localToday();
 $('fcForecastDays').replaceChildren();
 $('fcPurchaseAccount').replaceChildren();
 $('fcExtraFlows').innerHTML='';
 $('fcPlannedCharges').innerHTML='';
 const request=api('/api/funds-setup').then(({setup})=>{
  if(key!==fundsQuickScope)return;
  fundsSavedSetup=setup;
  hydrateFundsSetup(setup);
  refreshFundsSources();
 }).catch(error=>{
  if(key===fundsQuickScope){fundsQuickScope=null;$('fcQuickStatus').textContent=error.message;}
 }).finally(()=>{if(fundsSetupRequest===request)fundsSetupRequest=null;});
 fundsSetupRequest=request;
 return request;
};

function fundsToolVisible(){
 const panel=$('financialTool-funds');
 return !$('view-funds').classList.contains('hidden')||
  !!panel&&!panel.classList.contains('hidden')&&!$('view-tools').classList.contains('hidden');
}
function refreshFundsForecast(){
 if(!fundsToolVisible()||!fundsSavedSetup||$('fcSetupStatus').textContent==='Unsaved changes')return;
 return runFundsQuickCheck(!(Number($('fcQuickAmount').value)>0));
}
const loadCoverageBeforeFundsForecast=loadCoverage;
loadCoverage=async function(){
 await loadCoverageBeforeFundsForecast();
 if(fundsToolVisible()||!$('view-dashboard').classList.contains('hidden'))await initFundPlan();
 await refreshFundsForecast();
 if(!$('view-dashboard').classList.contains('hidden'))await runDashboardFundsCheck(true);
};
$('fcSaveSetup').onclick=async()=>{const button=$('fcSaveSetup');button.disabled=true;try{const d=await put('/api/funds-setup'+fundsScopeQuery(),fundsSetupPayload());fundsSavedSetup=d.setup;hydrateFundsSetup(d.setup);await refreshFundsForecast();}catch(e){$('fcSaveStatus').textContent=e.message;}finally{button.disabled=false;}};
const forecastEventEstimated=event=>!!event.estimated||/estimate|expected|awaiting/i.test(`${event.kind||''} ${event.label||''}`);
async function runFundsQuickCheck(baseline=false){clearTimeout(fundsInputTimer);const run=++fundsQuickRun,scope=fundsScopeQuery();markFundsForecastStale();try{if(!baseline&&$('fcQuickAmount').value==='')throw Error('Enter the total purchase price in CAD.');const d=await post('/api/funds-setup/check'+scope,{amount:baseline?0:$('fcQuickAmount').value,date:$('fcQuickPurchaseDate').value||localToday(),days:Number($('fcForecastDays').value),...(baseline?{}:{purchaseAccountId:$('fcPurchaseAccount').value})});if(run!==fundsQuickRun||scope!==fundsScopeQuery())return;if(!Array.isArray(d.timeline)||!d.timeline.length)throw Error('The forecast returned no dated balances. Check the chequing balance date and forecast period.');const existing=d.baseline.firstAtOrBelowZero,warning=d.firstAtOrBelowZero;
 const belowBuffer=d.buffer>0&&!d.canAfford&&d.complete;
 const heading=existing?'Your current plan reaches zero or below':warning?'This purchase would take chequing to zero or below':!d.complete?'Some forecast details need attention':!belowBuffer?(baseline?'Chequing is projected to cover upcoming payments':'The forecast stays above zero with this purchase'):'The forecast leaves less than your cash buffer';
 const tone=!d.complete&&!warning&&!existing?'review':Math.min(d.minimum,d.baseline.minimum)<0?'short':belowBuffer?'uncertain':'covered';
 const zeroText=(label,event)=>event?`<p>${label} · ${esc(txDateLabel(event.date))} · ${money(event.balance)} after ${esc(event.label)}</p>`:'';
 $('fcQuickStatus').textContent='';$('fcQuickResults').classList.remove('is-stale');$('fcQuickResults').removeAttribute('aria-busy');$('fcQuickResults').innerHTML=`<section class="funds-verdict ${tone}"><h4>${heading}</h4>${zeroText('Current plan',existing)}${!baseline&&warning?zeroText('With purchase',warning):''}${!warning&&!existing?`<p>${d.complete?`Lowest projected cash: ${money(d.minimum)} on ${esc(txDateLabel(d.minimumDate))}.`:'Review the setup and warnings below before relying on the projection.'}</p>`:''}</section><section class="funds-forecast-panel" aria-label="Projected chequing balance"><div class="funds-forecast-heading"><div><span class="eyebrow">Projected chequing balance</span><h4>${esc(txDateLabel(d.timeline[0].date))}–${esc(txDateLabel(d.timeline[d.timeline.length-1].date))}</h4></div><p>Lowest <strong>${money(d.minimum)}</strong> on <strong>${esc(txDateLabel(d.minimumDate))}</strong></p></div>${fundsChart(d,!baseline)}</section><div class="report-totals">${[[baseline?'Lowest chequing balance':'Lowest with purchase',d.minimum],['Cash at forecast end',d.endBalance],baseline?['Cash buffer',d.buffer]:['Lowest without purchase',d.baseline.minimum],['Reserved after forecast',d.reservedForLater]].map(([label,value])=>`<div><strong>${money(value)}</strong><span>${label}</span></div>`).join('')}</div>${d.payrollPrediction?.amount?`<p class="muted">Estimated pay: ${money(d.payrollPrediction.amount)} · ${esc(d.payrollPrediction.frequency)} · ${esc(d.payrollPrediction.employer)} · based on ${esc(txDateLabel(d.payrollPrediction.sourceDate))}.</p>`:''}${d.purchasePaymentDate?`<p>This purchase is included in the card payment on <strong>${esc(txDateLabel(d.purchasePaymentDate))}</strong>.</p>`:''}${(d.dataWarnings||[]).map(w=>`<p class="payroll-warning">${esc(w)}</p>`).join('')}${d.balanceDate?`<p class="muted">Chequing balance includes recorded activity through ${esc(txDateLabel(d.includedThrough||d.balanceDate))}.</p>`:''}${d.unscheduledCards.map(c=>`<p class="payroll-warning">${esc(c.name)}: ${esc(c.reason)}</p>`).join('')}${d.cardPayments.some(c=>c.estimated)?'<p class="muted">Some statement amounts are estimated: the full current card balance is reserved conservatively. Update actual statements in card settings.</p>':''}${d.unassignedBills?'<p class="payroll-warning">Some recurring bills have no payment account and are not included. Assign them or include them in your saved plan.</p>':''}${d.confirmedForecasts.length?`<p class="muted">Recorded-deposit overlaps removed conservatively: ${d.confirmedForecasts.map(r=>esc(r.label)+' ('+esc(txDateLabel(r.date))+')').join(', ')}.</p>`:''}<details><summary>Cash timeline</summary><div class="payroll-table-scroll"><table><thead><tr><th>Date</th><th>Payment or deposit</th><th>Status</th><th>Amount</th></tr></thead><tbody>${d.events.map(e=>{const estimated=forecastEventEstimated(e);return `<tr><td>${esc(txDateLabel(e.date))}</td><td>${esc(e.label)}${e.kind==='Card payment'&&e.parts?.length?`<details><summary>Statement breakdown</summary>${e.parts.map(part=>`<div>${esc(part.label)} · ${money(part.amount)}</div>`).join('')}</details>`:''}</td><td><span class="fund-flow-status ${estimated?'is-estimated':'is-confirmed'}">${estimated?'Estimated':'Confirmed'}</span></td><td>${money(e.amount)}</td></tr>`;}).join('')}</tbody></table></div></details><p class="muted">Expected pay and transfers are estimates. Statements may shift; interest and late fees are not calculated. Same-day withdrawals are tested before deposits. Purchases are not recorded by this check.</p>`;bindFundsChart($('fcQuickResults'),d,!baseline);}catch(e){if(run===fundsQuickRun){$('fcQuickStatus').textContent=e.message;$('fcQuickResults').classList.add('is-stale');}}finally{if(run===fundsQuickRun){$('fcQuickResults').removeAttribute('aria-busy');setFundsButtonsDisabled(!fundsSavedSetup);}}
}
$('fcBaselineBtn').onclick=refreshFundsForecast;
$('fcForecastDays').onchange=refreshFundsForecast;
$('fcQuickPurchaseDate').onchange=()=>{if(Number($('fcQuickAmount').value)>0)refreshFundsForecast();};
$('fcPurchaseAccount').onchange=()=>{if(Number($('fcQuickAmount').value)>0)refreshFundsForecast();};
$('fcQuickAmount').oninput=()=>{
 clearTimeout(fundsInputTimer);
 ++fundsQuickRun;
 if(!$('fcQuickAmount').validity.valid){
  $('fcQuickStatus').textContent='Enter a nonnegative amount in dollars and cents.';
  return;
 }
 fundsInputTimer=setTimeout(refreshFundsForecast,320);
};
let dashboardFundsRun=0;
async function runDashboardFundsCheck(baseline=false){const run=++dashboardFundsRun,host=$('dashboardFundsResults'),message=$('quickCheckMsg');if(!fundsSavedSetup){message.textContent='Complete Advanced setup before using the dashboard forecast.';return;}const amount=Number($('quickAmount').value);if(!baseline&&(!Number.isFinite(amount)||amount<=0)){message.textContent='Enter a purchase amount greater than zero.';return;}message.textContent='Updating forecast…';host.setAttribute('aria-busy','true');try{const days=dashboardFundsDays(),d=await post('/api/funds-setup/check'+fundsScopeQuery(),{amount:baseline?0:amount,date:$('dashboardFundsDate').value||localToday(),days,...(baseline?{}:{purchaseAccountId:$('dashboardFundsAccount').value})});if(run!==dashboardFundsRun)return;const warning=d.firstAtOrBelowZero,belowBuffer=d.buffer>0&&!d.canAfford&&d.complete,tone=warning?'short':belowBuffer?'uncertain':d.complete?'covered':'review',heading=warning?'This purchase takes cash to zero or below':belowBuffer?'This purchase leaves less than your buffer':d.complete?(baseline?'Current cash plan':'This purchase stays above your buffer'):'Review incomplete forecast details';message.textContent='';host.innerHTML=`<section class="funds-verdict ${tone}"><h4>${heading}</h4><p>${warning?esc(txDateLabel(warning.date))+' · '+money(warning.balance)+' after '+esc(warning.label):'Lowest intraday balance '+money(d.minimum)+' on '+esc(txDateLabel(d.minimumDate))}</p></section><section class="funds-forecast-panel"><div class="funds-forecast-heading"><div><span class="eyebrow">${days}-day forecast</span><h4>${esc(txDateLabel(d.timeline[0].date))}–${esc(txDateLabel(d.timeline.at(-1).date))}</h4></div><p>Ends <strong>${money(d.endBalance)}</strong></p></div>${fundsChart(d,!baseline,{compact:true,width:900})}</section><div class="dashboard-funds-metrics"><div><strong>${money(d.minimum)}</strong><span>Lowest intraday balance</span></div><div><strong>${money(d.endBalance)}</strong><span>Ending balance</span></div>${baseline?'':`<div><strong>${money(d.baseline.minimum)}</strong><span>Baseline intraday low</span></div>`}</div>${(d.dataWarnings||[]).map(w=>`<p class="payroll-warning">${esc(w)}</p>`).join('')}${d.unscheduledCards.map(c=>`<p class="payroll-warning">${esc(c.name)}: ${esc(c.reason)}</p>`).join('')}`;bindFundsChart(host,d,!baseline);}catch(error){if(run===dashboardFundsRun)message.textContent=error.message;}finally{if(run===dashboardFundsRun)host.removeAttribute('aria-busy');}}
$('quickCheckBtn').onclick=()=>runDashboardFundsCheck(false);
$('quickAmount').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();runDashboardFundsCheck(false);}};
$('dashboardFundsReset').onclick=()=>{$('quickAmount').value='';$('dashboardFundsDate').value=localToday();runDashboardFundsCheck(true);};
$('dashboardFundsAdvanced').onclick=()=>goView('funds');
$('dashboardFundsDays').onchange=()=>{const custom=$('dashboardFundsDays').value==='custom';$('dashboardFundsEndLabel').classList.toggle('hidden',!custom);$('dashboardForecastUncertainty').classList.toggle('hidden',!custom&&Number($('dashboardFundsDays').value)<=90);try{localStorage.setItem('pulse-dashboard-funds-days',$('dashboardFundsDays').value);}catch{}if(!custom)runDashboardFundsCheck(!(Number($('quickAmount').value)>0));};
$('dashboardFundsEnd').onchange=()=>runDashboardFundsCheck(!(Number($('quickAmount').value)>0));

const previousExtraFundFlow=extraFundFlow;extraFundFlow=function(incoming=false){previousExtraFundFlow(incoming);const row=$('fcExtraFlows').lastElementChild;if(!incoming){row.dataset.kind='outgoing';row.querySelector('[data-flow-amount]').min='.01';row.querySelector('[data-flow-amount]').placeholder='Amount to send';}row.querySelector('button').onclick=()=>{row.remove();dirtyFundsSetup();};dirtyFundsSetup();};
$('fcAddIncoming').onclick=()=>extraFundFlow(true);$('fcAddExtra').textContent='＋ Planned transfer out';$('fcAddExtra').onclick=()=>extraFundFlow(false);
$('accountDialog').addEventListener('close',()=>{if(fundsToolVisible()){refreshFundsForecast();}});

const previousRenderFundCards=renderFundCards;
let fundCardStatusRevision=0;
renderFundCards=function(){
 previousRenderFundCards();
 const host=$('fcCards'),accountId=$('fcAccount').value,revision=++fundCardStatusRevision;
 host.querySelectorAll('.fund-card-setup .formgrid,.fund-card-setup small').forEach(element=>element.hidden=true);
 if(!accountId)return;
 for(const row of host.querySelectorAll('.fund-card-setup')){
  const label=document.createElement('p');label.className='fund-cycle-note';label.textContent='Checking statement…';row.append(label);
 }
 api('/api/funds-card-status?accountId='+encodeURIComponent(accountId)+'&date='+localToday()).then(({items})=>{
  if(revision!==fundCardStatusRevision)return;
  for(const {id,cycle} of items){
   const row=[...host.querySelectorAll('[data-fund-card]')].find(el=>el.dataset.fundCard===id),label=row?.querySelector('.fund-cycle-note');
   if(!label)continue;
   label.textContent=!cycle?'Statement dates needed':cycle.mode==='conservative'
    ?money(cycle.statementRemaining)+' reserved from current balance · statement amount unconfirmed'
    :cycle.statementRemaining>0
     ?money(cycle.statementRemaining)+(cycle.estimated?' estimated':' remaining')+' · due '+txDateLabel(cycle.paymentDueDate)
     :'$0 remaining on the last statement';
   if(cycle&&cycle.unbilled>0)label.textContent+=' · '+money(cycle.unbilled)+' unbilled';
  }
 }).catch(error=>{
  if(revision===fundCardStatusRevision)host.querySelectorAll('.fund-cycle-note').forEach(label=>label.textContent=error.message);
 });
};
$('fcCardSetup').querySelector('summary').textContent='Cards paid from this account';
$('fcCardSetup').querySelector('p.muted').textContent='Current statement status. Scheduled card charges only enter the cash forecast when the card payment is due.';
const fundAdvanced=document.createElement('details');
fundAdvanced.className='fund-advanced';
fundAdvanced.innerHTML='<summary>Purchase defaults and everyday spending</summary>';
fundAdvanced.append(fundsSettings.querySelector('.funds-purchase'));
for(const id of ['fcDailySpend','fcDailyPayWith'])fundAdvanced.append($(id).closest('label'));
$('fcCardSetup').after(fundAdvanced);

$('fcOpening').readOnly=true;$('fcAsOf').readOnly=true;const editCash=document.createElement('button');editCash.type='button';editCash.className='text-action';editCash.textContent='Update chequing balance or owner';editCash.onclick=()=>openAccountEditor(fundPlanAccounts.find(a=>a.id===$('fcAccount').value));$('fcBalanceNote').after(editCash);
if(!$('view-funds').classList.contains('hidden')&&signedInUser)initFundPlan().then(refreshFundsForecast).catch(e=>$('fcQuickStatus').textContent=e.message);

const previousUsePayrollForFunds=$('fcUsePayroll').onclick;$('fcUsePayroll').onclick=async()=>{await previousUsePayrollForFunds();dirtyFundsSetup();};
