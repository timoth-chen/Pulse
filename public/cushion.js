const cushionCard=document.createElement('section');cushionCard.className='card cushion-planner';cushionCard.innerHTML='<h3>Your emergency cushion</h3><p class="muted">Start with your bills and budget. Add any essentials they’re missing.</p><form id="cushionForm"><div class="formgrid"><label>Expense source<select name="source"><option value="planned">Bills & budget</option><option value="history">Reviewed transaction history</option></select></label><label>History<select name="lookback"><option value="3">3 completed months</option><option value="6" selected>6 completed months</option><option value="12">12 completed months</option></select></label><label>Cushion size<select name="targetMonths"><option value="3">3 months</option><option value="4">4 months</option><option value="5">5 months</option><option value="6">6 months</option></select></label><label>Income estimate employer<select name="employer"><option value="">Choose automatically</option></select></label><label>Already reserved for emergencies<input name="reserved" type="number" min="0" step=".01" value="0"/></label><label>Months to build it<input name="buildMonths" type="number" min="1" max="120" value="12"/></label><label>Missing essentials per month (optional)<input name="extraMonthly" type="number" min="0" step=".01" value="0"/></label></div><details id="cushionHistoryReview"><summary>Review essential expenses</summary><div class="cushion-review-grid"><section><h4>Choose completed months</h4><div id="cushionMonths"></div></section><section><h4>Essential expenses</h4><div id="cushionCategories"></div></section></div></details><div class="row"><button class="primary">Save & calculate</button><button type="button" id="cushionTest">Test in Funds Check</button><button type="button" id="cushionGoal">Track as a goal</button></div><p id="cushionStatus" role="status"></p></form><div id="cushionResults"></div><a href="https://www.canada.ca/en/financial-consumer-agency/services/savings-investments/setting-up-emergency-funds.html" target="_blank" rel="noopener">FCAC: building an emergency fund ↗</a>';$('view-goals').append(cushionCard);let cushionResponse=null,cushionVersion=0,cushionOwnerKey=null;
const cushionOptions=document.createElement('details');
cushionOptions.className='cushion-options';
cushionOptions.innerHTML='<summary>Calculation options</summary><div class="formgrid"></div>';
for(const name of ['source','lookback','employer','extraMonthly']){
 cushionOptions.lastElementChild.append($('cushionForm').elements[name].closest('label'));
}
$('cushionHistoryReview').before(cushionOptions);
const cushionEstimate=document.createElement('details');
cushionEstimate.className='cushion-estimate';
cushionEstimate.innerHTML='<summary>Review or adjust cushion estimate</summary>';
cushionCard.append(cushionEstimate);
while(cushionCard.children[1]!==cushionEstimate)cushionEstimate.append(cushionCard.children[1]);
const cushionEstimateHint=document.createElement('p');
cushionEstimateHint.className='muted';
cushionEstimate.before(cushionEstimateHint);
const cushionScope=()=>selectedOwner?'?scopeOwner='+encodeURIComponent(selectedOwner):'';
function renderCushion(d){const wasTracked=cushionResponse?.trackedGoal?.id===d.trackedGoal?.id;
 cushionResponse=d;
 if(!d.trackedGoal||!wasTracked)cushionEstimate.open=!d.trackedGoal;
 cushionEstimateHint.textContent=d.trackedGoal?'Record the money you set aside under Savings goals. Revisit the estimate if your essentials or savings timeline change.':'';
 const f=$('cushionForm').elements,p=d.plan,a=d.analysis;f.employer.innerHTML='<option value="">Choose automatically</option>'+(d.employers||[]).map(e=>`<option value="${esc(e)}">${esc(e)}</option>`).join('');for(const key of ['source','lookback','targetMonths','reserved','buildMonths','extraMonthly','employer'])if(p[key]!==undefined)f[key].value=p[key];$('cushionMonths').innerHTML=a.window.map(m=>`<label class="cushion-choice"><input type="checkbox" data-cushion-month="${m.month}" ${m.confirmed?'checked':''}/><span>${m.month} · ${m.count} transactions</span></label>`).join('');$('cushionCategories').innerHTML=a.categories.map(c=>`<label class="cushion-choice"><input type="checkbox" data-cushion-category="${esc(c.name)}" ${c.essential?'checked':''}/><span>${esc(c.icon)} ${esc(c.name)}${c.suggested?' · suggested':''}<small>${money(c.monthly)} / month</small></span></label>`).join('');f.reserved.closest('label').hidden=!!d.trackedGoal;$('cushionGoal').textContent=d.trackedGoal?'Update goal target':'Track as a goal';updateCushionSource();$('cushionHistoryReview').open=!a.ready;$('cushionGoal').disabled=$('cushionTest').disabled=!a.ready;$('cushionResults').innerHTML=!a.ready?'<p class="muted">'+(p.source==='history'?'Choose a completed month and essential expenses.':'Add any missing monthly essentials or select an expense below.')+'</p>':`<div class="report-totals">${[['Essentials / month',a.essentialMonthly],['3-month cushion',a.threeMonths],['6-month cushion',a.sixMonths],['Still to build',a.gap]].map(([k,v])=>`<div><strong>${money(v)}</strong><span>${k}</span></div>`).join('')}</div><p>To reach your ${a.targetMonths}-month cushion in ${a.buildMonths} months: <strong>${money(a.monthlyToTarget)} per month</strong>. You have about ${a.coverageMonths.toFixed(1)} months reserved.</p><p class="muted">${!a.incomeKnown?'Income needs review.':a.savingsFitsObserved?'Fits your observed monthly surplus.':'Above your observed monthly surplus.'}</p>${a.payrollWarning?`<p class="payroll-warning">${esc(a.payrollWarning)}</p>`:''}<details><summary>How this is calculated</summary><p>${esc(a.incomeSource)} · ${money(a.monthlyIncome)} income per month. ${money(a.afterObservedSpending)} left after observed spending.</p>${a.notes.map(n=>`<p class="muted">${esc(n)}</p>`).join('')}</details>`;}
async function loadCushion(){const key=signedInUser?.id+':'+selectedOwner;if(key!==cushionOwnerKey){cushionOwnerKey=key;$('cushionForm').reset();$('cushionMonths').innerHTML='';$('cushionCategories').innerHTML='';$('cushionResults').innerHTML='';$('cushionGoal').disabled=$('cushionTest').disabled=true;}const v=++cushionVersion;try{const [d,payroll]=await Promise.all([api('/api/cushion?date='+localToday()),api('/api/payroll?scopeOwner='+encodeURIComponent(selectedOwner||signedInUser.name))]);if(v===cushionVersion)renderCushion({...d,employers:payroll.employers});}catch(e){$('cushionStatus').textContent=e.message;}}
function updateCushionSource(){
 const fields=$('cushionForm').elements,history=fields.source.value==='history';
 $('cushionMonths').closest('section').hidden=!history;
 fields.lookback.closest('label').hidden=!history;
 $('cushionHistoryReview').classList.toggle('planned-cushion',!history);
}
$('cushionForm').elements.source.onchange=updateCushionSource;
const previousLoadGoals=loadPlanningGoals;loadPlanningGoals=async function(){await Promise.all([previousLoadGoals(),loadCushion()]);};
async function saveCushionPlan(){
 const form=$('cushionForm');
 const body={...Object.fromEntries(new FormData(form)),
   essentialCategories:[...form.querySelectorAll('[data-cushion-category]:checked')].map(c=>c.dataset.cushionCategory),
   confirmedMonths:[...form.querySelectorAll('[data-cushion-month]:checked')].map(c=>c.dataset.cushionMonth)};
 await put('/api/cushion'+cushionScope(),body);
}
$('cushionForm').onsubmit=async e=>{e.preventDefault();try{await saveCushionPlan();await loadCushion();
 const ready=cushionResponse?.analysis?.ready;
 $('cushionStatus').textContent=ready?'Cushion calculated.':'Add a missing monthly essential or review the expense source.';
 $('cushionHistoryReview').open=!ready;
 if(!ready)$('cushionHistoryReview').querySelector('summary').focus();}catch(e){$('cushionStatus').textContent=e.message;}};
$('cushionGoal').onclick=async()=>{
 const button=$('cushionGoal'),status=$('cushionStatus');
 button.disabled=true;
 status.textContent='Saving goal…';
 try{
  await saveCushionPlan();
  const {goal}=await post('/api/cushion/goal'+cushionScope(),{date:localToday()});
  await Promise.all([previousLoadGoals(),loadCushion()]);
  cushionEstimate.open=false;
  status.textContent='Emergency cushion saved to Savings goals.';
  const tile=document.getElementById('goal-'+goal.id);
  if(tile){tile.focus({preventScroll:true});tile.scrollIntoView({block:'nearest'});}
 }catch(error){status.textContent=error.message;}
 finally{button.disabled=false;}
};

$('cushionForm').addEventListener('input',()=>{$('cushionGoal').disabled=$('cushionTest').disabled=true;$('cushionResults').innerHTML='<p class="muted">Inputs changed. Save & calculate to refresh the target.</p>';});

$('cushionTest').onclick=async()=>{try{await saveCushionPlan();const d=await post('/api/cushion/savings-check'+cushionScope(),{date:localToday()});$('cushionStatus').textContent=!d.complete?'Some cash-flow details are missing. Review Funds Check before relying on this savings amount.':d.firstNegative?'Saving '+money(d.monthly)+' / month would take chequing below zero on '+txDateLabel(d.firstNegative.date)+'. Extend the timeline or adjust the plan.':d.canAfford?'The current forecast supports '+money(d.monthly)+' / month from '+txDateLabel(d.firstDate)+' through '+txDateLabel(d.end)+'. Lowest cash would be '+money(d.minimum)+'. This is an estimate, not an automatic transfer.':'This savings amount leaves too little for the cash buffer or reserved card payments. Extend the timeline or adjust the plan.';}catch(e){$('cushionStatus').textContent=e.message;}};
