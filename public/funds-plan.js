let fundPlanOwner=null,fundPlanAccounts=[],fundCards=[];
const localToday=()=>new Date().toLocaleDateString('en-CA');
async function initFundPlan(){const data=await api('/api/accounts'),checking=data.items.filter(a=>a.type==='checking'&&!a.archived),previous=$('fcAccount').value,changed=fundPlanOwner!==selectedOwner;fundPlanAccounts=checking;fundCards=data.items.filter(a=>a.type==='credit'&&!a.archived);$('fcAccount').innerHTML=checking.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('')||'<option value="">No chequing accounts in this view</option>';$('fcBtn').disabled=!checking.length;$('fcMsg').textContent=checking.length?'':'No chequing account is assigned to this owner yet. Assign its owner in Accounts, or switch to Everyone.';if(checking.some(a=>a.id===previous))$('fcAccount').value=previous;if(changed||!$('fcStart').value){fundPlanOwner=selectedOwner;const today=localToday(),date=new Date(today+'T12:00:00Z');$('fcStart').value=today;$('fcEnd').value=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+3,0)).toISOString().slice(0,10);$('fcPurchaseDate').value=today;$('fcPaymentDate').value=$('fcEnd').value;$('fcIncomeAmount').value='';$('fcIncomeDate').value='';$('fcExtraFlows').innerHTML='';$('fcResults').innerHTML='';}if(changed||!$('fcOpening').value)fundAccountChanged();else renderFundCards();}
function fundAccountChanged(){renderFundCards();const a=fundPlanAccounts.find(a=>a.id===$('fcAccount').value);if(!a)return;$('fcOpening').value=a.balance;$('fcAsOf').value=a.balanceAsOf||$('fcStart').value;$('fcBalanceNote').textContent=a.balanceAsOf?'Bank snapshot dated '+txDateLabel(a.balanceAsOf)+'. Later recorded account activity is added up to the start date. Update the balance/date if you have a more current bank figure.':'The balance date is unknown. Verify the available balance and date before relying on the projection.';}
function extraFundFlow(incoming=false){const row=document.createElement('div');row.className='fund-extra-row';row.dataset.kind=incoming?'incoming':'custom';row.innerHTML='<input data-flow-label aria-label="Cash flow name" placeholder="Name · e.g. rent e-transfer"/><input data-flow-date type="date" aria-label="Cash flow date"/><input data-flow-amount type="number" step=".01" aria-label="Signed cash flow amount" placeholder="−500 or +200"/><select data-flow-frequency aria-label="Repeat"><option value="once">Once</option><option value="monthly">Monthly</option><option value="biweekly">Every two weeks</option><option value="weekly">Weekly</option></select><button class="icon-button" aria-label="Remove cash flow">×</button>';row.querySelector('button').onclick=()=>row.remove();if(incoming){row.querySelector('[data-flow-amount]').min='0.01';row.querySelector('[data-flow-amount]').placeholder='Amount coming in';}row.querySelector('[data-flow-date]').value=$('fcStart').value;$('fcExtraFlows').append(row);}
$('fcAccount').onchange=fundAccountChanged;$('fcAddExtra').onclick=()=>extraFundFlow();$('fcAddIncoming').onclick=()=>extraFundFlow(true);$('fcPayWith').onchange=()=>{$('fcCardLabel').classList.toggle('hidden',$('fcPayWith').value!=='credit');$('fcPaymentDateLabel').classList.add('hidden');};
$('fcUsePayroll').onclick=async()=>{try{const d=await api('/api/payroll'),r=d.records[0];if(!r)throw Error('Upload a pay statement first, or enter an expected net amount.');$('fcIncomeAmount').value=r.current.net;$('fcPayrollNote').textContent='Using '+money(r.current.net)+' from '+txDateLabel(r.payDate)+' ('+r.employer+'). Confirm this is still your expected pay and enter the next pay date; this statement is not a promise of future income.';}catch(error){$('fcPayrollNote').textContent=error.message;}};
let fundsChartSequence=0;
function fundsChart(d,compare=false,{compact=false,width=900}={}){
 const rows=d.timeline,baseline=compare?d.baseline.timeline:[];
 const values=[...rows,...baseline].map(row=>row.balance);
 const buffer=Math.max(0,Number(d.buffer)||0);
 const max=Math.max(1,buffer,...values),min=Math.min(0,d.minimum,...values);
 const plotHeight=compact?132:180;
 const left=compact?58:78,right=width-(compact?24:46);
 const x=index=>left+index/Math.max(1,rows.length-1)*(right-left);
 const y=amount=>20+(max-amount)/Math.max(1,max-min)*plotHeight;
 const step=Math.max(1,Math.ceil((rows.length-1)/(width<480?3:5)));
 const normal='var(--accent)',low='var(--close)',zero='var(--danger)';
 const palette=[{offset:0,color:normal}];
 const threshold=(amount,above,below)=>{
  const offset=(y(amount)-20)/plotHeight;
  palette.push({offset,color:above},{offset,color:below});
 };
 if(buffer>0)threshold(buffer,normal,low);
 threshold(0,buffer>0?low:normal,zero);
 palette.push({offset:1,color:zero});
 const gradientId='funds-balance-colors-'+ ++fundsChartSequence;
 const pointColor=balance=>balance<=0?zero:buffer>0&&balance<buffer?low:normal;
 const path=timeline=>timeline.map((row,index)=>index?`H${x(index)}V${y(row.balance)}`:`M${x(index)},${y(row.balance)}`).join(' ');
 const minimumIndex=Math.max(0,rows.findIndex(row=>row.date===d.minimumDate));
 const eventType=events=>events.reduce((sum,event)=>sum+Number(event.amount||0),0)>=0?'incoming':'outgoing';
 const isEstimated=event=>event.estimated||/estimate|expected|awaiting import/i.test(event.kind+' '+event.label);
 const allEventDays=rows.map((row,index)=>({row,index,events:(row.events||[]).filter(event=>!/everyday spending/i.test(event.label))})).filter(day=>day.events.length);
 const markerLimit=rows.length>120?Math.max(8,Math.floor(width/90)):rows.length>60?Math.max(10,Math.floor(width/70)):allEventDays.length;
 const major=new Set([...allEventDays].sort((a,b)=>Math.abs(b.events.reduce((n,e)=>n+Number(e.amount||0),0))-Math.abs(a.events.reduce((n,e)=>n+Number(e.amount||0),0))).slice(0,markerLimit).map(day=>day.index));
 const eventDays=allEventDays.filter(day=>major.has(day.index));
 return `<div class="funds-interactive-chart">
 <div class="funds-chart-legend">${compare?'<span class="funds-series-baseline">Baseline</span><span class="funds-series-scenario">After purchase</span>':'<span class="funds-series-baseline">Projected balance</span>'}<span class="funds-event-incoming">Incoming</span><span class="funds-event-outgoing">Outgoing</span><span class="funds-event-estimated">Outline = estimated</span></div>
 <div class="funds-chart-scroll"><svg viewBox="0 0 ${width} ${plotHeight+(compact?53:70)}" data-plot-left="${left}" data-plot-right="${right}" tabindex="0" role="slider" aria-label="Forecast date. Use arrow keys to move between days" aria-valuemin="1" aria-valuemax="${rows.length}">
  <defs><linearGradient id="${gradientId}" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="20" y2="${20+plotHeight}">${palette.map(({offset,color})=>`<stop offset="${offset}" stop-color="${color}"/>`).join('')}</linearGradient></defs>
  ${[max,(max+min)/2,min].map(value=>`<path d="M${left} ${y(value)}H${right}" class="funds-grid-line"/><text x="${left-8}" y="${y(value)+4}" text-anchor="end" class="flow-axis">${esc(money(value))}</text>`).join('')}
  <path d="M${left} ${y(0)}H${right}" class="funds-threshold funds-threshold-zero"/><text x="${right-4}" y="${y(0)-6}" text-anchor="end" class="funds-threshold-label">Zero balance</text>
  ${buffer>0?`<path d="M${left} ${y(buffer)}H${right}" class="funds-threshold funds-threshold-buffer"/><text x="${right-4}" y="${y(buffer)-6}" text-anchor="end" class="funds-threshold-label">Minimum buffer · ${esc(money(buffer))}</text>`:''}
  ${compare?`<path data-funds-baseline d="${path(baseline)}" class="funds-balance-path funds-balance-baseline"/>`:''}
  <path d="${path(rows)}" class="funds-balance-path ${compare?'funds-balance-purchase':'funds-balance-baseline'}"/>
  ${eventDays.map(({row,index,events})=>{const estimated=events.some(isEstimated),kind=eventType(events),label=events.find(event=>/payday|paycheque|rent/i.test(event.label))?.label;return `<g class="funds-event-marker is-${kind} ${estimated?'is-estimated':'is-confirmed'}" data-event-kind="${kind}"><circle cx="${x(index)}" cy="${y(row.balance)}" r="${compact?3.5:4.5}"/>${label&&width>=700?`<text x="${x(index)+6}" y="${y(row.balance)-8}" class="funds-event-label">${esc(label.replace(/Expected take-home pay.*/,'Payday'))}</text>`:''}<title>${esc(events.map(event=>event.label+' · '+(isEstimated(event)?'estimated':'confirmed')+' · '+money(event.amount)).join(', '))}</title></g>`;}).join('')}
  ${rows.map((row,index)=>`<circle data-funds-point cx="${x(index)}" cy="${y(row.balance)}" r="0" fill="${pointColor(row.balance)}"/>
    ${index===rows.length-1||index%step===0&&rows.length-1-index>step/2?`<text x="${x(index)}" y="${plotHeight+(compact?42:50)}" text-anchor="middle" class="flow-axis">${esc(row.date.slice(5))}</text>`:''}`).join('')}
  <g class="funds-minimum-marker"><circle cx="${x(minimumIndex)}" cy="${y(rows[minimumIndex].balance)}" r="${compact?5:7}"/><circle cx="${x(minimumIndex)}" cy="${y(rows[minimumIndex].balance)}" r="${compact?2:3}"/><title>Lowest projected balance · ${esc(txDateLabel(rows[minimumIndex].date))} · ${esc(money(rows[minimumIndex].balance))}</title></g>
  <line data-funds-marker y1="14" y2="${plotHeight+24}" stroke="var(--text-3)" stroke-dasharray="4 4"/>
  <circle data-funds-selected r="${compact?4:6}" fill="var(--accent)" stroke="var(--text-1)" stroke-width="2"/>
 </svg></div><div class="funds-point-details" role="tooltip" hidden></div></div>`;
}

function bindFundsChart(host,forecast,compare=false){
 const svg=host.querySelector('.funds-interactive-chart svg');
 const points=[...svg.querySelectorAll('[data-funds-point]')],rows=forecast.timeline;
 const plotLeft=Number(svg.dataset.plotLeft),plotWidth=Number(svg.dataset.plotRight)-plotLeft;
 const marker=svg.querySelector('[data-funds-marker]'),selected=svg.querySelector('[data-funds-selected]');
 const details=host.querySelector('.funds-point-details'),wrapper=details.parentElement;
 const scroller=svg.parentElement;
 let active=-1;
 function select(index){
  index=Math.max(0,Math.min(rows.length-1,index));
  if(index===active)return;
  active=index;
  const row=rows[index],date=txDateLabel(row.date),x=points[index].getAttribute('cx');
  marker.setAttribute('x1',x);marker.setAttribute('x2',x);
  selected.setAttribute('fill',points[index].getAttribute('fill'));
  selected.setAttribute('cx',x);selected.setAttribute('cy',points[index].getAttribute('cy'));
  svg.setAttribute('aria-valuenow',String(index+1));
  const dailyLow=Math.min(row.balance,index===0?(forecast.startingBalance??row.balance):rows[index-1].balance,...row.events.map(event=>event.balance??row.balance));
  const original=compare?forecast.baseline.timeline[index].balance:null;
  svg.setAttribute('aria-valuetext',date+', projected closing balance '+money(row.balance)+(compare?', without purchase '+money(original):''));
  details.innerHTML=`<div class="funds-point-heading"><strong>${esc(date)}</strong><span>${compare?'With purchase':'End of day'} <strong>${money(row.balance)}</strong></span></div>
   ${dailyLow<row.balance?`<p class="muted">Day’s low <strong>${money(dailyLow)}</strong></p>`:''}
   ${compare?`<p class="muted">Without purchase <strong>${money(original)}</strong></p>`:''}
   ${row.events.length?`<ul>${row.events.map(event=>`<li><span>${esc(event.label)}${event.estimated?' (estimate)':''}</span><strong>${event.amount>0?'+':''}${money(event.amount)}</strong></li>`).join('')}</ul>`:'<p class="muted">No scheduled cash movement.</p>'}`;
 }
 function positionTooltip(){
  if(details.hidden)return;
  const bounds=wrapper.getBoundingClientRect(),chart=scroller.getBoundingClientRect();
  const point=new DOMPoint(Number(selected.getAttribute('cx')),Number(selected.getAttribute('cy'))).matrixTransform(svg.getScreenCTM());
  if(point.x<chart.left||point.x>chart.right){details.hidden=true;return;}
  const width=details.offsetWidth,height=details.offsetHeight,gap=12;
  const left=point.x+gap+width<=chart.right?point.x+gap:point.x-gap-width;
  const top=point.y-height-gap>=chart.top?point.y-height-gap:point.y+gap;
  details.style.left=Math.max(0,Math.min(left-bounds.left,bounds.width-width))+'px';
  details.style.top=Math.max(chart.top-bounds.top,Math.min(top-bounds.top,chart.bottom-bounds.top-height))+'px';
 }
 function show(){
  details.hidden=false;
  positionTooltip();
 }
 function pick(event){
  const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());
  select(Math.round((point.x-plotLeft)/plotWidth*(rows.length-1)));
  show();
 }
 svg.onpointermove=event=>{if(event.pointerType==='mouse')pick(event);};
 svg.onpointerleave=event=>{if(event.pointerType==='mouse')details.hidden=true;};
 svg.onclick=pick;
 svg.onfocus=show;
 svg.onblur=()=>details.hidden=true;
 scroller.onscroll=positionTooltip;
 svg.onkeydown=event=>{
  if(event.key==='Escape'){details.hidden=true;return;}
  const index={ArrowLeft:active-1,ArrowDown:active-1,ArrowRight:active+1,ArrowUp:active+1,Home:0,End:rows.length-1}[event.key];
  if(index===undefined)return;
  event.preventDefault();select(index);
  const point=points[active].getBoundingClientRect(),chart=scroller.getBoundingClientRect();
  if(point.left<chart.left||point.right>chart.right)scroller.scrollLeft+=point.left-chart.left-chart.width/2;
  show();
 };
 select(Math.max(0,rows.findIndex(row=>row.date===forecast.minimumDate)));
}

$('fcBtn').onclick=async()=>{const button=$('fcBtn');button.disabled=true;try{if($('fcPayWith').value==='credit'&&!$('fcCard').value)throw Error('Assign a credit card’s payment account, then select that card.');const d=await post('/api/funds-check',{accountId:$('fcAccount').value,opening:$('fcOpening').value,asOf:$('fcAsOf').value,start:$('fcStart').value,end:$('fcEnd').value,buffer:$('fcBuffer').value,amount:$('fcAmount').value||0,purchaseName:$('fcPurchaseName').value,purchaseDate:$('fcPurchaseDate').value,payWith:$('fcPayWith').value,paymentDate:$('fcPaymentDate').value,cardId:$('fcPayWith').value==='credit'?$('fcCard').value:'',cards:readFundCards(),dailyPayWith:$('fcDailyPayWith').value,priceIncludesTax:$('fcIncludesTax').checked,taxRate:$('fcTaxRate').value,incomeAmount:$('fcIncomeAmount').value,incomeDate:$('fcIncomeDate').value,incomeFrequency:$('fcIncomeFrequency').value,dailySpend:$('fcDailySpend').value,extra:[...$('fcExtraFlows').children].map(row=>({label:row.querySelector('[data-flow-label]').value,date:row.querySelector('[data-flow-date]').value,amount:row.querySelector('[data-flow-amount]').value,frequency:row.querySelector('[data-flow-frequency]').value,kind:row.dataset.kind}))});if(!d.complete)$('fcCardSetup').open=true;$('fcMsg').textContent=!d.complete?'Finish the card setup below before relying on this result.':d.canAfford?'The entered plan stays above your cash buffer.':'This plan does not leave enough cash for the buffer and included card payments. Check the dates and amounts below.';$('fcResults').innerHTML=`<div class="report-totals">${[['Purchase including tax',d.purchaseTotal],['Cash at forecast end',d.endBalance],['Lowest cash during the period',d.minimum],['After buffer and later card payments',d.spendableAtEnd]].map(([label,value])=>`<div><strong>${money(value)}</strong><span>${label}</span></div>`).join('')}</div><p class="muted">Without this purchase, end-of-period cash would be ${money(d.baseline.endBalance)}. Lowest balance with the purchase: ${esc(txDateLabel(d.minimumDate))}. Same-day payments are tested before deposits; the graph shows end-of-day balances. Starting balance after recorded activity: ${money(d.startingBalance)}.</p>${d.reservedForLater?`<p class="payroll-warning">${money(d.reservedForLater)} is reserved for card statements payable after this forecast ends; it has not left chequing yet.</p>`:''}${d.unscheduledCards.length?`<p class="payroll-warning">Card setup needed: ${d.unscheduledCards.map(c=>esc(c.name)+' — '+esc(c.reason)).join('; ')}. These cards are missing from the projected payments.</p>`:''}${d.unassignedBills?'<p class="payroll-warning">Some recurring bills have no payment account. Assign them in Recurring or add their cash flows here.</p>':''}${d.purchasePaymentDate?`<p>Proposed purchase is payable on <strong>${esc(txDateLabel(d.purchasePaymentDate))}</strong>.</p>`:''}${d.cardPayments.filter(c=>c.estimated||c.pastDue).map(c=>`<p class="payroll-warning">${esc(c.name)}: ${c.pastDue?'unpaid past-due statement is reserved immediately.': 'statement amount unknown; full current balance reserved for the next due date.'}</p>`).join('')}${fundsChart(d)}<details open><summary>Included cash flows</summary><div class="payroll-table-scroll"><table><thead><tr><th>Date</th><th>Cash flow</th><th>Amount</th></tr></thead><tbody>${d.events.map(e=>`<tr><td>${esc(txDateLabel(e.date))}</td><td>${esc(e.label)} <small>${esc(e.kind)}</small></td><td>${money(e.amount)}${e.parts?`<details><summary>Statement details</summary>${e.parts.map(part=>`<p>${esc(part.label)} · ${money(part.amount)}</p>`).join('')}</details>`:''}</td></tr>`).join('')}</tbody></table></div></details><p class="muted">Based on recorded data and your estimates. Dates repeat monthly from your entered anchors; verify each actual statement. Interest, late fees, holiday shifts and missing transactions can change the result. Expected transfers and pay are estimates, not money already received. No financial records were changed. <a href="https://www.canada.ca/en/financial-consumer-agency/services/credit-cards/pay-off-credit-card.html" target="_blank" rel="noopener">FCAC: paying your credit card</a>.</p>`;bindFundsChart($('fcResults'),d);}catch(error){$('fcMsg').textContent=error.message;}finally{button.disabled=false;}};
const originalFundCoverage=loadCoverage;loadCoverage=async function(){await originalFundCoverage();if(!$('view-funds').classList.contains('hidden'))await initFundPlan();};

function readFundCards(){return [...document.querySelectorAll('#fcCards [data-fund-card]')].map(el=>({id:el.dataset.fundCard,...Object.fromEntries([...el.querySelectorAll('[data-card-field]')].map(field=>[field.dataset.cardField,field.value]))}));}
function renderFundCards(){const previous=$('fcCard').value,cards=fundCards.filter(c=>c.payFromAccountId===$('fcAccount').value);$('fcCard').innerHTML=cards.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')||'<option value="">Assign a card’s payment account first</option>';if(cards.some(c=>c.id===previous))$('fcCard').value=previous;$('fcCards').innerHTML=cards.map(c=>`<section class="fund-card-setup" data-fund-card="${esc(c.id)}"><div class="row"><strong>${esc(c.name)}</strong><button type="button" class="text-action" data-edit-fund-card="${esc(c.id)}">Edit card settings</button></div><div class="formgrid">${[['balance','Current total owed','number',c.balance],['balanceAsOf','Balance as of','date',c.balanceAsOf],['statementBalance','Statement amount still unpaid','number',c.statementBalance],['statementCloseDate','Latest statement closing date','date',c.statementCloseDate],['paymentDueDate','That statement’s due date','date',c.paymentDueDate]].map(([key,label,type,value])=>`<label>${label}<input data-card-field="${key}" type="${type}" ${type==='number'?'step=".01"':''} value="${esc(value??'')}"/></label>`).join('')}</div><small>Blank unpaid statement amount reserves the full balance. Balances already include charges through the balance date; only later logged card activity is added.</small></section>`).join('')+fundCards.filter(c=>!c.payFromAccountId).map(c=>`<p class="payroll-warning">${esc(c.name)} has no payment account. <button type="button" class="text-action" data-edit-fund-card="${esc(c.id)}">Assign payment account</button></p>`).join('');$('fcCards').querySelectorAll('[data-edit-fund-card]').forEach(button=>button.onclick=()=>openAccountEditor(fundCards.find(c=>c.id===button.dataset.editFundCard)));}
$('accountDialog').addEventListener('close',()=>{if(!$('view-funds').classList.contains('hidden')){$('fcResults').innerHTML='';initFundPlan().then(()=>$('fcMsg').textContent='Card settings refreshed. Check this purchase again.').catch(e=>$('fcMsg').textContent=e.message);}});

$('view-funds').addEventListener('input',()=>{if($('fcResults').innerHTML){$('fcResults').innerHTML='';$('fcMsg').textContent='Inputs changed. Check this purchase again to refresh the projection.';}});
