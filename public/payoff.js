let payoffLoans=[],editingLoanId=null,payoffRequest=0;
async function loadPayoff(){
 const request=++payoffRequest;
 try{
  await refreshAccounts();const data=await api('/api/loans-overview');if(request!==payoffRequest)return;payoffLoans=data.loans.filter(l=>Number(l.balance)>0);data.loans=payoffLoans;data.totalOwed=payoffLoans.reduce((n,l)=>n+Number(l.balance),0);data.totalMonthlyPayments=payoffLoans.reduce((n,l)=>n+Number(l.monthlyPayment||0),0);
  $('payoffSummary').innerHTML=`<div class="card stat"><span>Total loan balances</span><strong>${money(data.totalOwed)}</strong></div><div class="card stat"><span>Scheduled monthly payments</span><strong>${money(data.totalMonthlyPayments)}</strong></div>${data.loans.some(l=>!l.monthlyPayment||l.apr==null)?`<div class="card stat"><span>Missing payment or APR</span><strong>${data.loans.filter(l=>!l.monthlyPayment||l.apr==null).length}</strong></div>`:''}`;
  $('loanList').innerHTML=data.loans.length?data.loans.map(l=>`<article class="card payoff-card"><div class="widget-head"><div><h3>${esc(l.name)}</h3><small class="muted">${esc(l.person||'Owner not set')}${l.lender?' · '+esc(l.lender):''}</small></div><button data-edit-loan="${l.id}">Edit plan</button></div><div class="payoff-balance-row">${loanProgressRing(l)}<div class="loan-progress-totals"><div><span>Starting amount</span><strong>${Number(l.originalAmount)>0?money(l.originalAmount):'Not recorded'}</strong></div><div><span>Principal paid down</span><strong>${Number(l.originalAmount)>0?money(Math.max(0,Number(l.originalAmount)-Number(l.balance))):'—'}</strong></div><div><span>Balance left</span><strong>${money(l.balance)}</strong></div></div></div><dl class="payoff-facts">${l.balanceAsOf?`<div><dt>Balance as of</dt><dd>${shortAccountDate(l.balanceAsOf)}</dd></div>`:''}${l.startDate||l.repaymentStartDate?`<div><dt>${l.repaymentStartDate?'Repayment started':'Loan started'}</dt><dd>${shortAccountDate(l.repaymentStartDate||l.startDate)}</dd></div>`:''}<div><dt>Monthly payment</dt><dd>${l.monthlyPayment?money(l.monthlyPayment):'Not set'}</dd></div><div><dt>${l.paymentsRemainingBasis==='contract'?'Scheduled payments left':'Estimated payments left'}</dt><dd>${l.paymentsRemaining??'Not enough information'}</dd></div><div><dt>Next provider payment</dt><dd>${l.nextDueDate?shortAccountDate(l.nextDueDate):'Not set'}</dd></div><div><dt>APR</dt><dd>${l.apr!==null&&l.apr!==undefined?esc(l.apr)+'%':'Not set'}</dd></div><div><dt>${l.maturityDate?'Contract maturity':'Estimated payoff'}</dt><dd>${l.maturityDate?shortAccountDate(l.maturityDate):l.payoffDate?shortAccountDate(l.payoffDate):esc(l.estimateReason)}</dd></div><div><dt>Pay from</dt><dd>${esc(accountsCache.find(a=>a.id===l.payFromAccountId)?.name||'Not set')}</dd></div></dl>${loanPaymentHistory(l)}<details class="loan-calculator"><summary>Compare a different payment</summary><div class="formgrid"><label>I pay per month<input data-preview-payment="${l.id}" type="number" min="0.01" step="0.01" value="${l.monthlyPayment||''}" placeholder="e.g. 400"/></label><label>APR %<input data-preview-apr="${l.id}" type="number" min="0" step="0.01" value="${l.apr??''}" placeholder="Enter APR"/></label></div><div data-loan-preview="${l.id}" role="status"><p class="muted">Enter a payment and APR to see the time remaining.</p></div></details><button class="ghost" data-loan-details="${l.id}">Balance history →</button></article>`).join(''):'<div class="card"><h3>No loans in this view</h3><p class="muted">Add a loan or choose another owner to see their payoff plans.</p></div>';
  bindLoanCalculators();
  document.querySelectorAll('[data-edit-loan]').forEach(b=>b.onclick=()=>openLoanEditor(payoffLoans.find(l=>l.id===b.dataset.editLoan)));
  document.querySelectorAll('[data-loan-details]').forEach(b=>b.onclick=()=>openAccountDetail('loan:'+b.dataset.loanDetails));
 }catch(e){$('payoffMsg').textContent=e.message;}
}
function openLoanEditor(loan){
 editingLoanId=loan?.id||null;$('loanForm').reset();$('loanFormMsg').textContent='';$('loanDeleteConfirm').classList.add('hidden');
 $('loanDialogTitle').textContent=loan?'Edit payoff plan':'Add a loan';$('deleteLoanBtn').classList.toggle('hidden',!loan);
 for(const [id,key] of Object.entries({lName:'name',lLender:'lender',lOriginal:'originalAmount',lBalance:'balance',lApr:'apr',lPayment:'monthlyPayment',lDue:'nextDueDate',lAccount:'payFromAccountId',lPerson:'person'}))$(id).value=loan?.[key]??(id==='lPerson'?activeOwnerName():'');
 $('loanDialog').showModal();
}
$('newLoanBtn').onclick=()=>openLoanEditor();$('closeLoanDialog').onclick=()=>$('loanDialog').close();
$('loanForm').onsubmit=async e=>{
 e.preventDefault();const button=$('addLoanBtn');button.disabled=true;
 try{
  const values={name:$('lName').value.trim(),lender:$('lLender').value.trim(),balance:Number($('lBalance').value),nextDueDate:$('lDue').value,payFromAccountId:$('lAccount').value,person:$('lPerson').value.trim()};
  for(const [field,id] of [['originalAmount','lOriginal'],['apr','lApr'],['monthlyPayment','lPayment']])values[field]=$(id).value===''?null:Number($(id).value);
  if(editingLoanId)await put('/api/loans/'+editingLoanId,values);else await post('/api/loans',values);
  $('loanDialog').close();await refreshOwnerChoices();await loadPayoff();await refreshOpenAccountDetail();loadDashboard();
 }catch(e){$('loanFormMsg').textContent=e.message;}finally{button.disabled=false;}
};
$('deleteLoanBtn').onclick=()=>$('loanDeleteConfirm').classList.remove('hidden');$('cancelDeleteLoan').onclick=()=>$('loanDeleteConfirm').classList.add('hidden');
$('confirmDeleteLoan').onclick=async()=>{const button=$('confirmDeleteLoan');button.disabled=true;try{await del('/api/loans/'+editingLoanId);$('loanDialog').close();if(activeAccountKey==='loan:'+editingLoanId)goView('payoff');await loadPayoff();loadDashboard();}catch(e){$('loanFormMsg').textContent=e.message;}finally{button.disabled=false;}};

function loanProgressRing(loan){
 const progress=loan.pctPaid,known=progress!==null;
 return `<svg class="loan-progress-ring" viewBox="0 0 120 120" role="img" aria-label="${known?progress+' percent paid down':'Original principal not set'}"><circle cx="60" cy="60" r="48" class="loan-ring-track"/>${known?`<circle cx="60" cy="60" r="48" pathLength="100" stroke-dasharray="${progress} ${100-progress}" transform="rotate(-90 60 60)" class="loan-ring-value"/>`:''}<text x="60" y="60" text-anchor="middle" class="loan-ring-number">${known?progress+'%':'—'}</text><text x="60" y="80" text-anchor="middle" class="loan-ring-caption">${known?'principal paid':'progress'}</text></svg>`;
}
function bindLoanCalculators(){
 document.querySelectorAll('[data-preview-payment]').forEach(input=>{
  const id=input.dataset.previewPayment,apr=document.querySelector(`[data-preview-apr="${id}"]`),output=document.querySelector(`[data-loan-preview="${id}"]`);let version=0,timer;
  const preview=async()=>{const request=++version;if(!input.value||apr.value===''){output.innerHTML='<p class="muted">Enter a payment and APR to see the time remaining.</p>';return;}
   try{const result=await post(`/api/loans/${id}/preview`,{monthlyPayment:Number(input.value),apr:Number(apr.value)});if(request!==version)return;
    output.innerHTML=`<div class="loan-preview-result"><strong>${result.months===0?'No balance due':result.months+' month'+(result.months===1?'':'s')+' remaining'}</strong><p>Estimated payoff: ${shortAccountDate(result.payoffDate)}</p><div class="loan-preview-cost"><span>Interest <b>${money(result.totalInterest)}</b></span><span>Total payments <b>${money(result.totalPaid)}</b></span></div><p class="chart-caption">Fixed monthly payments and APR; excludes fees and future rate changes.</p><button data-use-payment="${id}">Use this payment</button></div>`;
    output.querySelector('[data-use-payment]').onclick=async()=>{try{await put('/api/loans/'+id,{monthlyPayment:result.monthlyPayment,apr:result.apr});await loadPayoff();loadCoverage();}catch(e){output.textContent=e.message;}};
   }catch(e){if(request===version)output.innerHTML=`<p class="muted">${esc(e.message)}</p>`;}
  };
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(preview,160);};input.oninput=schedule;apr.oninput=schedule;
  const details=input.closest('details');details.ontoggle=()=>{if(details.open)preview();};
 });
}

function loanPaymentHistory(l){
 const rows=l.detectedPayments||[],interest=rows.reduce((n,p)=>n+p.interest,0),future=l.interestProjection?.totalInterest;
 return `<section class="loan-payment-history"><div class="loan-lifetime-interest"><span>${l.lifetimeInterest?.estimated?'Estimated interest paid since start':'Total interest paid since start'}</span><strong>${l.lifetimeInterest?.amount==null?'Not verified':money(l.lifetimeInterest.amount)}</strong><small>${esc(l.lifetimeInterest?.basis||'Lender history needed')}</small></div><p class="chart-caption">Updates from posted payments matched to your linked bill${l.paymentBalanceAnchor?' · baseline '+shortAccountDate(l.paymentBalanceAnchor.asOf):''}. Chexy fees do not reduce the loan.</p>${Number(l.apr)>0?`<div class="loan-preview-cost"><span>Interest since baseline <b>${money(interest)}</b></span><span>Estimated interest remaining <b>${future==null?'—':money(future)}</b></span></div><p class="chart-caption">Interest uses a monthly APR estimate. Interest paid before the baseline needs lender records.</p>`:'<p class="chart-caption">Interest-free: the full provider payment reduces principal.</p>'}<details><summary>Payment history${rows.length?' · '+rows.length:''}</summary>${rows.length?`<div class="table-scroll"><table><thead><tr><th>Provider date</th><th>Payment</th><th>Principal</th><th>Interest${Number(l.apr)>0?' (est.)':''}</th><th>Balance</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${shortAccountDate(p.date)}</td><td>${money(p.amount)}</td><td>${money(p.principal)}</td><td>${money(p.interest)}</td><td>${money(p.balance)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">No matched provider payments after the reported balance yet.</p>'}</details>${Number(l.apr)>0&&l.interestProjection?.schedule?.length?`<details><summary>Estimated interest over time</summary><div class="table-scroll"><table><thead><tr><th>Payment date</th><th>Principal</th><th>Interest</th><th>Balance</th></tr></thead><tbody>${l.interestProjection.schedule.map(p=>`<tr><td>${shortAccountDate(p.date)}</td><td>${money(p.principal)}</td><td>${money(p.interest)}</td><td>${money(p.balance)}</td></tr>`).join('')}</tbody></table></div></details>`:''}</section>`;
}
