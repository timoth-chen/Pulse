const billsPanel=$('view-bills').children[1],billDialog=document.createElement('dialog');billDialog.className='payroll-dialog bill-editor-dialog';billDialog.innerHTML='<div class="payroll-modal-heading"><h2 id="cleanBillTitle">Add bill</h2><button type="button" class="icon-button" aria-label="Close bill editor">×</button></div><div class="payroll-dialog-body"></div>';document.body.append(billDialog);billDialog.querySelector('button').onclick=()=>billDialog.close();billDialog.addEventListener('click',e=>{if(e.target===billDialog)billDialog.close();});const body=billDialog.querySelector('.payroll-dialog-body');body.append(billsPanel.querySelector('.formgrid'),$('billFormMsg'),$('addBillBtn'),$('cancelBillEdit'));
const toolbar=document.createElement('div');toolbar.className='bills-toolbar';toolbar.innerHTML='<label>Show<select id="billsView"><option value="upcoming">Next 30 days</option><option value="all">All bills & end dates</option><option value="paid">Paid this month</option><option value="inactive">Not upcoming</option></select></label><label>Group<select id="billsGroup"><option value="">Household & personal</option><option value="household">Household</option><option value="personal">Personal</option></select></label><label>Amount type<select id="billsAmountType"><option value="">Fixed & variable</option><option value="fixed">Fixed amounts</option><option value="variable">Variable estimates</option></select></label><label>Look ahead<select id="billsDays"><option value="30" selected>30 days</option><option value="60">60 days</option><option value="90">90 days</option></select></label><button id="cleanAddBill" class="primary">＋ Add bill</button>';billsPanel.querySelector('h3').after(toolbar);$('billsView').innerHTML='<option value="upcoming">Next 30 days</option><option value="all">All schedules</option>';$('billsDays').value='30';$('billsDays').closest('label').classList.add('hidden');let billAgendaData=null;
const oldEditBill=editBill;editBill=function(bill){$('cleanBillTitle').textContent=bill.id?'Edit bill':'Add bill';if(!billDialog.open)billDialog.showModal();oldEditBill(bill);$('billFormMsg').textContent='';};$('cleanAddBill').onclick=()=>{editBill({name:'',amount:'',kind:'fixed',frequency:'monthly',nextDueDate:'',person:activeOwnerName()||signedInUser.name,billGroup:'household',status:'active'});};const priorBillSave=$('addBillBtn').onclick;$('addBillBtn').onclick=async()=>{
 const invalid=[...billDialog.querySelectorAll('input,select,textarea')].find(field=>
   !field.checkValidity()&&!field.closest('[hidden],.hidden')&&!field.disabled);
 if(invalid){
   for(let host=invalid.parentElement;host&&host!==billDialog;host=host.parentElement){
     if(host.tagName==='DETAILS')host.open=true;
   }
   invalid.reportValidity();
   return;
 }
 await priorBillSave();if($('billFormMsg').textContent==='Bill saved.')billDialog.close();};const priorCancelBill=$('cancelBillEdit').onclick;$('cancelBillEdit').onclick=()=>{priorCancelBill();billDialog.close();};
loadBills=async function(){try{$('billsView').options[0].textContent='Next '+$('billsDays').value+' days';await refreshAccounts();const [agenda,all]=await Promise.all([api('/api/bills-agenda?date='+localToday()+'&days='+$('billsDays').value),api('/api/bills')]);billAgendaData={...agenda,bills:all.items.map(b=>({...b,lastChargeAccount:agenda.lastChargeAccounts?.[b.id]}))};const ownerValue=$('blPerson').value||activeOwnerName()||signedInUser.name,ownerSelect=document.createElement('select');ownerSelect.id='blPerson';ownerSelect.innerHTML=scopeOwners.filter(o=>o.value&&!o.value.startsWith('__')).map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')+'<option value="Household / Joint">Joint household</option>';$('blPerson').replaceWith(ownerSelect);ownerSelect.value=ownerValue;renderBillsAgenda();}catch(e){$('billList').textContent=e.message;}};
function renderBillsAgenda(){if(!billAgendaData)return;const d=billAgendaData,view=$('billsView').value,group=$('billsGroup').value,rows=(view==='paid'?d.paid.map(p=>({...p,type:'paid',kind:d.bills.find(b=>b.id===p.billId)?.kind||'fixed',group:d.bills.find(b=>b.id===p.billId)?.billGroup||'personal'})):view==='all'?d.bills.map(b=>({...b,type:'bill',date:b.nextDueDate,amount:Number(b.amount||0)*(1+Number(b.processingFeePercent||0)/100),group:b.billGroup||'personal',accountId:b.payFromAccountId,endDate:b.endDate||'',status:b.status||'active'})):view==='inactive'?d.inactive.map(b=>({...b,type:'bill',date:b.endDate||b.nextDueDate,amount:Number(b.amount||0)*(1+Number(b.processingFeePercent||0)/100),status:b.status&&b.status!=='active'?b.status:b.state||'not in this window',group:b.billGroup||'personal'})):d.upcoming).filter(r=>(!group||r.group===group)&&(!$('billsAmountType').value||(r.kind||'fixed')===$('billsAmountType').value));const accepts=r=>(!group||r.group===group)&&(!$('billsAmountType').value||(r.kind||'fixed')===$('billsAmountType').value),coming=d.upcoming.filter(r=>r.status==='upcoming'&&accepts(r)),cards=coming.filter(r=>r.type==='credit-card'),charges=coming.filter(r=>r.type!=='credit-card');
 const funding=Object.fromEntries(d.accounts.map(account=>[account.id,account]));
 const charged=charges.filter(row=>funding[row.accountId]?.type==='credit');
 const direct=charges.filter(row=>['checking','cash','savings'].includes(funding[row.accountId]?.type)||row.type==='bill'&&d.bills.some(b=>b.id===row.id&&b.frequency==='one-time'&&!row.accountId));
 const unassigned=charges.filter(row=>!charged.includes(row)&&!direct.includes(row));
 const tally=rows=>rows.reduce((sum,row)=>sum+Math.round(row.amount*100),0)/100;
 $('billsSummary').innerHTML=`<div class="bills-window-heading"><h3>Upcoming</h3><span class="muted">${esc(txDateLabel(d.date))} – ${esc(txDateLabel(d.end))}</span></div>
 <div class="bills-window-totals">
 <div><span>Cash needed</span><strong>${money(tally([...direct,...cards]))}</strong><small>${money(tally(direct))} direct · ${money(tally(cards))} card payments</small></div>
 <div><span>New charges to cards</span><strong>${money(tally(charged))}</strong><small>Paid through your card statement</small></div>
 ${unassigned.length?`<div><span>Payment account not set</span><strong>${money(tally(unassigned))}</strong></div>`:''}</div>
`;
 const section=(title,items,options={})=>{const content=items.length?items.map(r=>renderBillAgendaRow(r,d,r.type==='paid'?'paid':view)).join(''):'<p class="muted">Nothing scheduled.</p>';return options.collapse?`<details class="bill-agenda-section" ${options.open?'open':''}><summary>${title} <span>${items.length}</span></summary>${content}</details>`:`<section class="bill-agenda-section"><h3>${title} <span>${items.length}</span></h3>${content}</section>`;};
 const paid=d.paid.map(p=>({...p,type:'paid',kind:d.bills.find(b=>b.id===p.billId)?.kind||'fixed',group:d.bills.find(b=>b.id===p.billId)?.billGroup||'personal'})).filter(accepts),overdue=(d.needsConfirmation||d.upcoming.filter(r=>r.status==='overdue')).filter(accepts);
 const undated=d.bills.filter(b=>b.frequency==='one-time'&&!b.nextDueDate&&(!b.status||b.status==='active')).map(b=>({...b,type:'bill',group:b.billGroup||'personal',accountId:b.payFromAccountId})).filter(accepts);
 const other=d.inactive.filter(b=>!undated.some(row=>row.id===b.id)).map(b=>({...b,type:'bill',date:b.nextDueDate,amount:Number(b.amount||0)*(1+Number(b.processingFeePercent||0)/100),group:b.billGroup||'personal',status:b.status&&b.status!=='active'?b.status:b.state})).filter(accepts);
 $('billList').innerHTML=view==='paid'?section('Recorded payments',paid):(view==='all'?section('All schedules',rows.filter(r=>!undated.some(b=>b.id===r.id))):section('Cash payments',direct)+section('Credit card payments',cards)+section('Charges to credit cards',charged)+(unassigned.length?section('Payment account not set',unassigned):''))+(undated.length?section('No due date',undated):'')+(overdue.length?section('Needs confirmation',overdue):'')+(view==='all'?'':section('Later, paused & ended',other,{collapse:true}))+(d.unscheduledCards?.length?`<details class="bill-agenda-section"><summary>Card due dates needed <span>${d.unscheduledCards.length}</span></summary>${d.unscheduledCards.map(c=>`<div class="bill-unscheduled"><span>${esc(c.name)}</span><button class="text-action" data-bill-card="${esc(c.id)}">Set up dates</button></div>`).join('')}</details>`:'');
 if(view==='upcoming'&&d.sharedTransfers?.length){
  $('billList').insertAdjacentHTML('beforeend',`<section class="bill-agenda-section"><div class="widget-head"><h3>Scheduled e-transfers</h3><button type="button" id="openBillsCalendar">View calendar</button></div>
   ${d.sharedTransfers.map(row=>`<div class="calendar-event"><div><strong>${esc(row.label)}</strong><small>${esc(txDateLabel(row.date))} · ${esc(row.fromPerson)} → ${esc(row.toPerson)}</small></div><strong>${money(row.amount)}</strong></div>`).join('')}</section>`);
  $('openBillsCalendar').onclick=()=>goView('calendar');
 }
 bindBillRowEditors();
 $('billList').querySelectorAll('[data-bill-card]').forEach(b=>b.onclick=()=>{goView('accounts');openAccountDetail('account:'+b.dataset.billCard);});
 $('billList').querySelectorAll('[data-bill-edit]').forEach(b=>b.onclick=()=>{const bill=d.bills.find(r=>r.id===b.dataset.billEdit);if(bill)editBill(bill);});$('billList').querySelectorAll('[data-bill-paid]').forEach(b=>b.onclick=async()=>{const bill=d.bills.find(r=>r.id===b.dataset.billPaid);if(bill.kind==='variable'){const modal=payrollDialog('Record variable bill payment'),area=modal.querySelector('.payroll-dialog-body');area.innerHTML=`<p>${esc(bill.name)}</p><label>Actual amount paid<input id="variableBillPaid" type="number" min="0" step=".01" value="${Number(bill.amount||0)*(1+Number(bill.processingFeePercent||0)/100)}"/></label><p class="muted">Includes any processing fee. Records payment status only; log or import the transaction separately.</p><button class="primary">Confirm paid</button><p role="status"></p>`;area.querySelector('button').onclick=async()=>{try{await post('/api/bills/'+bill.id+'/pay',{amount:Number(area.querySelector('input').value),date:localToday(),dueDate:b.dataset.billDue});modal.close();loadBills();}catch(e){area.querySelector('[role=status]').textContent=e.message;}};}else{await post('/api/bills/'+b.dataset.billPaid+'/pay',{date:localToday(),dueDate:b.dataset.billDue});loadBills();}});$('billList').querySelectorAll('[data-bill-loan]').forEach(b=>b.onclick=()=>openAccountDetail('loan:'+b.dataset.billLoan));}
$('billsView').onchange=$('billsGroup').onchange=$('billsAmountType').onchange=renderBillsAgenda;$('billsDays').onchange=loadBills;

const billsDiscovery=$('view-bills').firstElementChild;billsDiscovery.remove();

const billAdvanced=document.createElement('details');billAdvanced.className='bill-advanced';billAdvanced.innerHTML='<summary>Processing fee, dates & status</summary><div class="formgrid"></div>';for(const id of ['blFee','blStatus','blStart'])billAdvanced.querySelector('.formgrid').append($(id).closest('label'));$('billFormMsg').before(billAdvanced);const priorOpenBill=editBill;editBill=function(bill){billAdvanced.open=!!(bill.startDate||bill.endDate||bill.status&&bill.status!=='active');priorOpenBill(bill);};

const billMatcherLabel=document.createElement('label');billMatcherLabel.innerHTML='Merchant / statement match<input id="blMatchMerchant" placeholder="Defaults to bill name" maxlength="200"/><small>Use the recognizable merchant text on the charged account.</small>';billAdvanced.querySelector('.formgrid').append(billMatcherLabel);const billProviderLabel=document.createElement('label');billProviderLabel.innerHTML='Next provider due date · optional<input id="blProviderDue" type="date"/><small>For Chexy: when the landlord or bill provider should receive payment.</small>';billAdvanced.querySelector('.formgrid').append(billProviderLabel);$('blDue').closest('label').firstChild.textContent='Next charge / withdrawal date';$('blEnd').closest('label').firstChild.textContent='Last charge date · optional';$('blAccount').closest('label').firstChild.textContent='Payment account · optional for forecasting';billAdvanced.querySelector('.formgrid').append($('blAccount').closest('label'));
const billDelete=document.createElement('button');billDelete.type='button';billDelete.className='text-action danger';billDelete.textContent='Delete bill';const deleteBox=document.createElement('div');deleteBox.className='bill-delete-confirm hidden';body.append(billDelete,deleteBox);
function confirmBillDelete(bill){deleteBox.innerHTML='<p>Delete this recurring bill? Existing transactions and payment history stay unchanged.</p><div class="dialog-actions"><button type="button" data-cancel-delete>Keep bill</button><button type="button" class="danger" data-confirm-delete>Delete bill</button></div><p role="status"></p>';deleteBox.classList.remove('hidden');deleteBox.querySelector('[data-cancel-delete]').onclick=()=>deleteBox.classList.add('hidden');deleteBox.querySelector('[data-confirm-delete]').onclick=async e=>{e.target.disabled=true;try{await del('/api/bills/'+bill.id);billDialog.close();loadBills();loadCoverage();}catch(error){deleteBox.querySelector('[role=status]').textContent=error.message;e.target.disabled=false;}};}
const finalEditBill=editBill;editBill=function(bill){if(!bill)return;finalEditBill(bill);$('blMatchMerchant').value=bill.matchMerchant||bill.detectionKey?.split('|')[0]||bill.name||'';billDelete.classList.toggle('hidden',!bill.id);deleteBox.classList.add('hidden');billDelete.onclick=()=>confirmBillDelete(bill);};
const finalRenderBills=renderBillsAgenda;renderBillsAgenda=function(){finalRenderBills();$('billList').querySelectorAll('[data-bill-delete]').forEach(b=>b.onclick=()=>{const bill=billAgendaData.bills.find(x=>x.id===b.dataset.billDelete);editBill(bill);confirmBillDelete(bill);});$('billList').querySelectorAll('[data-bill-transaction]').forEach(b=>b.onclick=async()=>{const d=await api('/api/transactions/'+b.dataset.billTransaction);goView('transactions');openTransactionDetail(d.transaction);});};

function renderBillAgendaRow(r,d,view){
 const bill=d.bills.find(b=>b.id===(r.billId||r.id)),account=d.accounts.find(a=>a.id===(r.accountId||(r.type==='paid'?'':bill?.payFromAccountId))),paid=r.type==='paid',loan=r.type==='loan',card=r.type==='credit-card',on=r.date||r.nextDueDate;
 const editable=bill&&!paid&&!loan&&!card&&bill.status!=='cancelled';
 const date=on?new Date(on+'T12:00:00Z'):null,month=date?date.toLocaleDateString('en-CA',{month:'short',timeZone:'UTC'}):'—',day=date?date.getUTCDate():'',weekday=date?date.toLocaleDateString('en-CA',{weekday:'short',timeZone:'UTC'}):'';
 const state=r.manualConfirmation?'Marked paid · no transaction match':r.status==='unconfirmed'?'No transaction match':paid?'Paid':r.status==='overdue'?'Confirm payment':r.kind==='variable'||r.estimate?'Estimated':r.status&&!['upcoming','active'].includes(r.status)?r.status:'';
 const fundingLabel=!card&&account?(account.type==='credit'?'Charges to ':'Paid from ')+account.name:!card&&bill?.lastChargeAccount?'Last charged to '+bill.lastChargeAccount:'';
 const subtitle=card?'Cash payment to card':r.paymentMethod==='chexy'?'Chexy · due '+new Date((r.providerDueDate||on)+'T12:00:00Z').toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'UTC'}):loan?'Loan payment':bill?.frequency?({monthly:'Monthly',annually:'Yearly',yearly:'Yearly','one-time':'One-time',weekly:'Weekly',biweekly:'Every two weeks',semiannual:'Every six months'}[bill.frequency]||bill.frequency):weekday;
 let actions='';if(card)actions=`<button class="text-action" data-bill-card="${esc(r.id)}">View account</button>`;else if(loan)actions=`<button class="text-action" data-bill-loan="${esc(r.id)}">View loan</button>`;else if(paid){if(bill)actions+=`<button class="text-action" data-bill-edit="${esc(bill.id)}">Edit bill</button>`;if(r.transactionId)actions+=`<button class="text-action" data-bill-transaction="${esc(r.transactionId)}">View transaction</button>`;}else actions=`<button class="text-action" data-bill-edit="${esc(r.id)}">Edit bill</button>${(!on&&bill?.status!=='cancelled'&&bill?.status!=='paused'||view==='upcoming'&&on)?`<button class="text-action" data-bill-paid="${esc(r.id)}" data-bill-due="${esc(on)}">Mark paid</button>`:''}<button class="text-action danger" data-bill-delete="${esc(r.id)}">Delete bill</button>`;
 return `<article class="bill-agenda-row ${paid?'bill-is-paid':''} ${editable?'bill-row-editable':''}"><time class="bill-agenda-date" datetime="${esc(on||'')}"><span>${esc(month)}</span><strong>${paid?'✓':day}</strong></time><div class="bill-agenda-identity"><strong>${esc(r.name)}</strong><small>${esc(subtitle)}${state?' · '+esc(state):''}${!on?' · No due date':''}</small>${editable?billAccountPicker(bill,d.accounts):fundingLabel?`<small class="bill-funding-label">${esc(fundingLabel)}</small>`:''}${bill?.processingFeePercent&&(!paid||Number.isFinite(r.baseAmount))?`<small class="bill-charge-split">Provider ${money(r.baseAmount??bill.amount)} <span>+ fee ${money(r.processingFee??Math.round(Number(bill.amount)*Number(bill.processingFeePercent))/100)}</span></small>`:''}${r.statement?`<small class="bill-statement-date">Statement${r.statement.expected?' expected':' issued'} ${esc(txDateLabel(r.statement.date))}${r.statement.needsReview?' · Review amount before charge':r.statement.reviewed?' · Reviewed':''}</small>`:''}</div><div class="bill-provider-date"><span>${r.paymentMethod==='chexy'?'Provider receives':'Payment date'}</span><strong>${on?esc(txDateLabel(r.providerDueDate||on)):'No due date'}</strong></div><strong class="bill-agenda-amount">${money(r.amount)}</strong><details class="bill-row-details"><summary aria-label="Details for ${esc(r.name)}" title="Bill details">${true?'<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>':'…'}</summary><div class="bill-row-expanded">${editable?billInlineFields(bill):''}${bill?.processingFeePercent?`<p>Base ${money(bill.amount)} + ${money(Math.round(Number(bill.amount)*Number(bill.processingFeePercent))/100)} Chexy fee</p>`:''}${r.endDate?`<p>Last payment ${esc(txDateLabel(r.endDate))}</p>`:''}${account?`<p>${esc(account.name)}</p>`:''}${r.note?`<p>${esc(r.note)}</p>`:''}<div class="row">${actions}</div></div></details></article>`;
}

const billFilters=document.createElement('details');billFilters.className='filter-popover';billFilters.innerHTML='<summary><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>Filters</summary><div class="filter-fields"></div>';for(const id of ['billsGroup','billsAmountType','billsDays'])billFilters.querySelector('.filter-fields').append($(id).closest('label'));$('cleanAddBill').before(billFilters);

// Keep setup tools below the rolling agenda.
billsPanel.querySelector('h3').classList.add('hidden');

// The fee is part of the scheduled bill total, with the base kept separately.
$('blAmount').closest('label').firstChild.textContent='Base amount';
const billFeeLabel=$('blFee').closest('label');billFeeLabel.firstChild.textContent='Processing fee %';$('blAmount').closest('label').after(billFeeLabel);
const billTotalPreview=document.createElement('p');billTotalPreview.className='bill-total-preview';$('billFormMsg').before(billTotalPreview);
function updateBillTotalPreview(){const base=Number($('blAmount').value||0),fee=Math.round(base*Number($('blFee').value||0))/100;billTotalPreview.textContent='Total charge '+money(base+fee)+(fee?' · includes '+money(fee)+' fee':'');}
$('blAmount').addEventListener('input',updateBillTotalPreview);$('blFee').addEventListener('input',updateBillTotalPreview);
const openBillWithTotal=editBill;editBill=function(bill){openBillWithTotal(bill);updateBillTotalPreview();};

const billMethodLabel=document.createElement('label');billMethodLabel.innerHTML='Payment method<select id="blPaymentMethod"><option value="direct">Direct / e-transfer</option><option value="chexy">Chexy · 4 business days, counted inclusively</option></select>';$('blDue').closest('label').before(billMethodLabel);
$('blProviderDue').closest('label').firstChild.textContent='Provider payment date';billMethodLabel.after($('blProviderDue').closest('label'));
function updateBillPaymentMethod(){const chexy=$('blPaymentMethod').value==='chexy';$('blDue').readOnly=chexy;if($('blProviderEndMonth'))$('blProviderEndMonth').closest('label').classList.toggle('hidden',!chexy);$('blProviderDue').closest('label').classList.toggle('hidden',!chexy);if(chexy&&$('blProviderDue').value)previewBillChargeDate();}
let billDatePreviewRevision=0;
async function previewBillChargeDate(){const revision=++billDatePreviewRevision;try{const d=await api('/api/bill-charge-date?provider='+encodeURIComponent($('blProviderDue').value));if(revision===billDatePreviewRevision&&$('blPaymentMethod').value==='chexy')$('blDue').value=d.chargeDate;}catch(error){$('billFormMsg').textContent=error.message;}}
$('blPaymentMethod').onchange=updateBillPaymentMethod;$('blProviderDue').onchange=updateBillPaymentMethod;
const editBillWithMethod=editBill;editBill=function(bill){editBillWithMethod(bill);$('blPaymentMethod').value=bill.paymentMethod||'direct';updateBillPaymentMethod();};

const billEndMonthLabel=document.createElement('label');billEndMonthLabel.className='bill-month-end';billEndMonthLabel.innerHTML='<input id="blProviderEndMonth" type="checkbox"/> Last day of each month';$('blProviderDue').closest('label').after(billEndMonthLabel);
const editBillWithMonthEnd=editBill;editBill=function(bill){editBillWithMonthEnd(bill);$('blProviderEndMonth').checked=!!bill.providerEndOfMonth;};

const billNoteLabel=document.createElement('label');billNoteLabel.innerHTML='Note · optional<textarea id="blNote" rows="2"></textarea>';billAdvanced.querySelector('.formgrid').append(billNoteLabel);
const editBillWithNote=editBill;editBill=function(bill){editBillWithNote(bill);$('blNote').value=bill.note||'';};

// Date fields communicate whether the user or the payment schedule controls them.
const billDateHelp=document.createElement('small');billDateHelp.id='billChargeDateHelp';$('blDue').closest('label').append(billDateHelp);$('blDue').setAttribute('aria-describedby',billDateHelp.id);
const billDateState=()=>{
 const chexy=$('blPaymentMethod').value==='chexy',due=$('blDue'),provider=$('blProviderDue');
 due.disabled=chexy;
 due.readOnly=chexy;
 due.closest('label').classList.toggle('bill-calculated-field',chexy);
 provider.required=chexy;
 billDateHelp.textContent=chexy?'Calculated from the provider date.':'';
};
const updateBillMethodBeforeFieldState=updateBillPaymentMethod;updateBillPaymentMethod=function(){++billDatePreviewRevision;updateBillMethodBeforeFieldState();billDateState();};$('blPaymentMethod').onchange=updateBillPaymentMethod;$('blProviderDue').onchange=updateBillPaymentMethod;
const editBillWithFieldState=editBill;editBill=function(bill){editBillWithFieldState(bill);billDateState();};
$('billList').addEventListener('click',e=>{if(e.target.closest('[data-bill-edit],[data-bill-delete],[data-bill-paid],[data-bill-card],[data-bill-transaction],[data-bill-loan]'))e.target.closest('.bill-row-details')?.removeAttribute('open');});
document.addEventListener('pointerdown',e=>{document.querySelectorAll('.bill-row-details[open]').forEach(menu=>{if(!menu.contains(e.target))menu.open=false;});});
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.bill-row-details[open]').forEach(menu=>menu.open=false);});
$('billList').addEventListener('toggle',e=>{if(e.target.matches('.bill-row-details[open]'))document.querySelectorAll('.bill-row-details[open]').forEach(menu=>{if(menu!==e.target)menu.open=false;});},true);

const billStatementLabel=document.createElement('label');billStatementLabel.innerHTML='Statement issue date<input id="blStatementDate" type="date"/><small>Enter a known statement date. Future dates follow the bill frequency and remind you to check the amount before Chexy charges. This does not change the payment date.</small>';billAdvanced.querySelector('.formgrid').append(billStatementLabel);
const editBillWithStatement=editBill;
editBill=function(bill){editBillWithStatement(bill);$('blStatementDate').value=bill.statementDate||'';};
const renderBillsWithStatementReview=renderBillsAgenda;renderBillsAgenda=function(){renderBillsWithStatementReview();const due=billAgendaData?.upcoming.filter(r=>r.status==='upcoming'&&r.statement?.needsReview&&(!$('billsGroup').value||r.group===$('billsGroup').value)&&(!$('billsAmountType').value||r.kind===$('billsAmountType').value))||[];if(due.length){const section=document.createElement('section');section.className='bill-statement-review';section.innerHTML='<h3>Check statement amounts</h3><p class="chart-caption">Update the amount in Chexy first, then save the same amount here. Pulse does not change Chexy.</p>'+due.map(r=>`<div><span><strong>${esc(r.name)}</strong><small>Statement ${esc(txDateLabel(r.statement.date))} · charge ${esc(txDateLabel(r.date))}</small></span><button data-review-statement="${esc(r.id)}">Review amount</button><button class="text-action" data-confirm-statement="${esc(r.id)}" data-statement="${esc(r.statement.date)}">Amount checked</button></div>`).join('');$('billsSummary').append(section);section.querySelectorAll('[data-review-statement]').forEach(b=>b.onclick=()=>editBill(billAgendaData.bills.find(r=>r.id===b.dataset.reviewStatement)));section.querySelectorAll('[data-confirm-statement]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await put('/api/bills/'+b.dataset.confirmStatement,{amountReviewedStatementDate:b.dataset.statement});await loadBills();}catch(e){b.textContent=e.message;b.disabled=false;}});}};

const billBudgetPanel=document.createElement('details');billBudgetPanel.className='bill-budget-shares';billBudgetPanel.innerHTML='<summary>Budget ownership & shares</summary><p class="chart-caption">Splits the budget only. The full payment still leaves the payer’s account; transaction allocations stay as recorded.</p><label class="import-check"><input id="blShareBudget" type="checkbox"/> Share this bill’s budget</label><div id="blBudgetShareFields"></div><label>Processing fee paid by<select id="blBudgetFeePerson"></select></label><p id="blBudgetSharesTotal" class="chart-caption"></p><button type="button" id="blBudgetRepayments">Manage recorded repayments</button>';$('billFormMsg').before(billBudgetPanel);
function readBillBudgetShares(){if(!$('blShareBudget').checked)return {};return Object.fromEntries([...document.querySelectorAll('[data-bill-budget-share]')].map(i=>[i.dataset.billBudgetShare,Number(i.value)]));}
function updateBillBudgetShareTotal(){const shares=readBillBudgetShares();$('blBudgetFeePerson').closest('label').hidden=!(Number($('blFee').value)>0);$('blBudgetShareFields').classList.toggle('hidden',!$('blShareBudget').checked);$('blBudgetSharesTotal').textContent=$('blShareBudget').checked?'Total '+Object.values(shares).reduce((n,v)=>n+v,0).toFixed(2)+'% · must equal 100%':'';}
$('blShareBudget').onchange=updateBillBudgetShareTotal;
$('blFee').addEventListener('input',updateBillBudgetShareTotal);
const editBillWithBudgetShares=editBill;editBill=function(bill){editBillWithBudgetShares(bill);const people=scopeOwners.filter(o=>o.value&&!o.value.startsWith('__')&&!['Household / Joint','Joint'].includes(o.value));$('blShareBudget').checked=!!Object.keys(bill.budgetShares||{}).length;$('blBudgetShareFields').innerHTML=people.map(p=>`<label>${esc(p.label)} · %<input type="number" min="0" max="100" step=".01" data-bill-budget-share="${esc(p.value)}" value="${bill.budgetShares?.[p.value]??(people.length===2?50:0)}"/></label>`).join('');$('blBudgetFeePerson').innerHTML='<option value="">Same percentages as bill</option>'+people.map(p=>`<option value="${esc(p.value)}">${esc(p.label)} · pays all fees</option>`).join('');$('blBudgetFeePerson').value=bill.budgetFeePerson||'';billBudgetPanel.open=$('blShareBudget').checked;$('blBudgetRepayments').hidden=!bill.id||!$('blShareBudget').checked;$('blBudgetRepayments').onclick=()=>openBudgetRepayments(bill.id);$('blBudgetShareFields').querySelectorAll('input').forEach(i=>i.oninput=updateBillBudgetShareTotal);updateBillBudgetShareTotal();};

function billPaymentAccounts(accounts){return accounts.filter(a=>!a.archived&&['credit','checking','savings','cash'].includes(a.type));}

let billAccountPickerId=0;
function billAccountPicker(bill,accounts){
 const current=bill.payFromAccountId||'';
 const eligible=billPaymentAccounts(accounts);
 const account=accounts.find(a=>a.id===current);
 const picker='bill-account-'+billAccountPickerId++;
 const option=(label,id)=>`<button type="button" data-funding-option="${esc(id)}" aria-pressed="${id===current}">${esc(label)}</button>`;
 return `<button type="button" class="bill-account-link" popovertarget="${picker}" aria-label="Change payment account for ${esc(bill.name)}">${esc(account?.name||'Set payment account')} <span aria-hidden="true">▾</span></button>
 <div id="${picker}" class="bill-account-popover" popover aria-label="Payment account for ${esc(bill.name)}" data-bill-account="${esc(bill.id)}">${option('No account', '')}${eligible.map(a=>option(a.name,a.id)).join('')}</div>
 ${!current&&bill.lastChargeAccount?`<small>Last charged to ${esc(bill.lastChargeAccount)}</small>`:''}<small role="status" class="bill-inline-status"></small>`;

}

function billInlineFields(bill){
 return `<form class="bill-inline-fields" data-inline-bill="${esc(bill.id)}">
 <label>Bill name<input name="name" maxlength="200" required value="${esc(bill.name)}"></label>
 <label>Base amount<input name="amount" type="number" inputmode="decimal" min="0" step=".01" required value="${esc(bill.amount)}"></label>
 ${bill.paymentMethod==='chexy'
  ?`<label>Provider payment date<input name="providerDueDate" type="date" required value="${esc(bill.providerDueDate||'')}"></label>`
  :`<label>Next due date<input name="nextDueDate" type="date" ${bill.frequency==='one-time'?'':'required'} value="${esc(bill.nextDueDate||'')}"></label>`}
 <button class="primary">Save row</button><small role="status"></small>
 </form>`;
}

function bindBillRowEditors(){
 async function save(id,changes,status,control){
   control.disabled=true;
   status.textContent='Saving…';
   try{
     await put('/api/bills/'+encodeURIComponent(id),changes);
     await loadBills();
     document.dispatchEvent(new CustomEvent('pulse-bill-saved'));
     loadCoverage();
     return true;
   }catch(error){
     status.textContent=error.message;
     return false;
   }finally{control.disabled=false;}
 }
 $('billList').querySelectorAll('[data-bill-account]').forEach(panel=>{
   const trigger=panel.previousElementSibling;
   panel.addEventListener('beforetoggle',event=>{
     if(event.newState!=='open')return;
     const rect=trigger.getBoundingClientRect(),width=Math.min(300,innerWidth-20),spaceBelow=innerHeight-rect.bottom-10;
     const above=spaceBelow<190&&rect.top>spaceBelow;
     panel.style.width=width+'px';
     panel.style.left=Math.max(10,Math.min(rect.left,innerWidth-width-10))+'px';
     panel.style.top=above?'auto':rect.bottom+4+'px';
     panel.style.bottom=above?innerHeight-rect.top+4+'px':'auto';
     panel.style.maxHeight=Math.max(80,Math.min(320,above?rect.top-10:spaceBelow))+'px';
   });
   panel.onclick=event=>{
     const option=event.target.closest('[data-funding-option]');
     if(!option)return;
     panel.hidePopover();
     if(option.getAttribute('aria-pressed')==='true')return;
     const status=trigger.closest('.bill-agenda-identity').querySelector('.bill-inline-status');
     save(panel.dataset.billAccount,{payFromAccountId:option.dataset.fundingOption},status,trigger);
   };
 });
 $('billList').querySelectorAll('[data-inline-bill]').forEach(form=>{
   form.onsubmit=event=>{
     event.preventDefault();
     const changes=Object.fromEntries(new FormData(form));
     changes.amount=Number(changes.amount);
     save(form.dataset.inlineBill,changes,form.querySelector('[role=status]'),form.querySelector('button'));
   };
 });
}

for(const id of ['blNote','blMatchMerchant','blFee'])$(id).dataset.clearable='';
const billMainFields=body.querySelector('.formgrid');
const billAdvancedFields=billAdvanced.querySelector('.formgrid');
billAdvanced.querySelector('summary').textContent='More options';
for(const id of ['blCategory','blGroup','blPerson','blKind','blFee','blProviderEndMonth']){
 billAdvancedFields.prepend($(id).closest('label'));
}
for(const id of ['blName','blAmount','blFreq','blAccount','blPaymentMethod','blProviderDue','blDue']){
 billMainFields.append($(id).closest('label'));
}
$('blName').required=true;
$('blAmount').required=true;
$('blAmount').min='0';
$('blFreq').closest('label').firstChild.textContent='Repeat';
$('blFreq').querySelector('[value="one-time"],option:last-child').textContent='One time';
$('blFreq').querySelector('option:last-child').value='one-time';

function updateBillDateRequirement(){
 const oneTime=$('blFreq').value==='one-time',chexy=$('blPaymentMethod').value==='chexy';
 $('blDue').required=!oneTime&&!chexy;
 $('blDue').closest('label').firstChild.textContent=chexy?'Charge date (calculated)':oneTime?'Due date (optional)':'Next due date';
 $('blProviderDue').closest('label').firstChild.textContent='Provider payment date';
 $('blProviderEndMonth').closest('label').classList.toggle('hidden',!chexy||!['monthly','quarterly','semiannual','yearly'].includes($('blFreq').value));
 for(const id of ['blStart','blEnd','blStatementDate'])$(id).closest('label').classList.toggle('hidden',oneTime);
 billTotalPreview.hidden=!(Number($('blFee').value)>0);
}
for(const id of ['blFreq','blProviderDue','blPaymentMethod'])$(id).addEventListener('change',updateBillDateRequirement);
$('blFee').addEventListener('input',updateBillDateRequirement);
const editBillWithDateRequirement=editBill;
editBill=function(bill){
 const account=$('blAccount'),current=bill?.payFromAccountId;
 const eligible=new Set(billPaymentAccounts(accountsCache).map(a=>a.id));
 for(const option of account.options)option.hidden=Boolean(option.value&&option.value!==current&&!eligible.has(option.value));
 editBillWithDateRequirement(bill);
 $('addBillBtn').textContent=bill.id?'Save bill':'Add bill';
 billAdvanced.open=false;
 updateBillDateRequirement();
};
