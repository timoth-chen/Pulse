let cashCalendarData=null,cashCalendarRequest=0,cashCalendarScope=null;
const calendarMonth=$('cashCalendarMonth'),calendarStatus=$('cashCalendarStatus'),calendarDays=$('cashCalendarDays');
const calendarNavigation=document.createElement('div');
calendarNavigation.id='cashCalendarNavigation';
calendarNavigation.className='cash-calendar-navigation';
calendarNavigation.innerHTML='<button type="button" data-calendar-step="-1" aria-label="Previous month">‹</button><strong></strong><button type="button" data-calendar-step="1" aria-label="Next month">›</button><button type="button" data-calendar-today>Today</button>';
calendarDays.before(calendarNavigation);
calendarNavigation.onclick=event=>{
 const button=event.target.closest('button');
 if(!button)return;
 const month=new Date(calendarMonth.value+'-01T12:00:00Z');
 if(button.hasAttribute('data-calendar-today'))calendarMonth.value=localToday().slice(0,7);
 else{month.setUTCMonth(month.getUTCMonth()+Number(button.dataset.calendarStep));calendarMonth.value=month.toISOString().slice(0,7);}
 selectedCalendarDate='';
 loadCashCalendar();
};
const calendarGrid=document.createElement('div');
calendarGrid.className='cash-calendar-grid';
calendarDays.before(calendarGrid);
let selectedCalendarDate='';
const calendarEventAmount=event=>(event.direction==='in'?'+':event.direction==='out'?'−':'')+money(event.amount);
const calendarUnscheduled=$('cashCalendarUnscheduled');
function calendarCategoryChoices(categories,selected){
 const choices=[{name:'No category',value:'',group:'Optional'},...categories];
 if(selected&&!categories.some(category=>category.name===selected))choices.push({name:selected,group:'Previously selected'});
 return choices;
}
function calendarCategoryOptions(choices,selected){
 return choices.map(({name,value=name})=>`<option value="${esc(value)}" ${value===(selected||'')?'selected':''}>${esc(name)}</option>`).join('');
}
function renderCalendarEvent(event){
 const transfer=!!event.id,showCategory=transfer||!!event.category;
 const editable=(value,field)=>`<button type="button" class="text-action calendar-edit-cell" data-transfer-inline="${esc(event.id)}" data-edit-field="${field}" aria-label="Edit ${field} for ${esc(event.label)}">${esc(value)}</button>`;
 const route=event.fromPerson?`${esc(event.fromPerson)} → ${esc(event.toPerson)}`:'';
 const amount=calendarEventAmount(event);
 const details=[
  event.paymentAccount?(event.direction==='card'?'Card: ':'Paid from: ')+event.paymentAccount:'',
  event.paymentMethod==='chexy'?'Chexy':'',
  event.providerDueDate&&event.providerDueDate!==event.date?'Provider due '+txDateLabel(event.providerDueDate):'',
  event.statementCloseDate?'Statement closes '+txDateLabel(event.statementCloseDate):''
 ].filter(Boolean);
 return `<div class="calendar-event ${transfer?'calendar-transfer-row':showCategory?'calendar-categorized-row':''}" data-direction="${esc(event.direction||'')}">
  <div>${transfer?editable(event.label,'label'):'<strong>'+esc(event.label)+'</strong>'}
   <small>${[esc(event.kind),route].filter(Boolean).join(' · ')}</small>
   ${!transfer&&details.length?`<small class="calendar-event-detail">${details.map(esc).join(' · ')}</small>`:''}</div>
  ${showCategory?`<div class="calendar-row-category"><small>Category</small>${transfer?editable(event.category||'No category','category'):`<span>${esc(event.category)}</span>`}</div>`:''}
  <strong class="calendar-row-amount">${transfer?editable(amount,'amount'):esc(amount)}${event.estimated?'<small>Estimated</small>':''}</strong>
  ${transfer?`<div class="calendar-row-actions">
   ${event.date?`<button type="button" class="text-action" data-transfer-id="${esc(event.id)}" data-transfer-date="${esc(event.date)}" data-transfer-paid="${event.paid}">${event.paid?'Paid · undo':'Mark paid'}</button>`:'<button type="button" class="text-action" data-transfer-details="'+esc(event.id)+'">Set date</button>'}
   <button type="button" class="icon-button calendar-edit-details" data-transfer-details="${esc(event.id)}" aria-label="Edit transfer details" title="Edit transfer details">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4.5-1 12-12a2.8 2.8 0 0 0-4-4l-12 12L4 20Z"/></svg>
   </button></div>`:''}
 </div>`;
}
function renderCalendarGrid(month,days){
 const first=new Date(month+'-01T12:00:00Z'),length=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 calendarNavigation.querySelector('strong').textContent=new Intl.DateTimeFormat('en-CA',{month:'long',year:'numeric',timeZone:'UTC'}).format(first);
 calendarGrid.innerHTML=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=>`<span>${day}</span>`).join('')+
  '<span></span>'.repeat(first.getUTCDay())+
  Array.from({length},(_,i)=>{
   const date=month+'-'+String(i+1).padStart(2,'0'),events=days.get(date)||[];
   const preview=events.map(e=>e.label+' · '+(e.direction==='in'?'+':e.direction==='out'?'−':'')+money(e.amount)).join('\n');
   return `<button type="button" data-calendar-date="${date}" ${preview?`title="${esc(preview)}"`:""} aria-pressed="${date===selectedCalendarDate}" aria-label="${esc(txDateLabel(date))}, ${events.length} scheduled events"><span class="calendar-date-number" ${date===localToday()?'aria-current="date"':''}>${i+1}</span>
    <span class="calendar-event-chips">${events.slice(0,2).map(ev=>`<span data-direction="${esc(ev.direction)}"><span class="calendar-chip-name">${esc(ev.label)}</span><span class="calendar-chip-amount">${esc(calendarEventAmount(ev))}</span></span>`).join('')}${events.length>2?`<small>+${events.length-2}</small>`:''}</span></button>`;
  }).join('');
}
calendarGrid.onclick=event=>{
 const button=event.target.closest('[data-calendar-date]');
 if(!button)return;
 selectedCalendarDate=selectedCalendarDate===button.dataset.calendarDate?'':button.dataset.calendarDate;
 for(const day of calendarGrid.querySelectorAll('[data-calendar-date]'))day.setAttribute('aria-pressed',String(day.dataset.calendarDate===selectedCalendarDate));
 for(const section of calendarDays.querySelectorAll('[data-calendar-section]'))section.hidden=!!selectedCalendarDate&&section.dataset.calendarSection!==selectedCalendarDate;
 $('cashCalendarEmptyDate').hidden=!selectedCalendarDate||!!calendarDays.querySelector(`[data-calendar-section="${selectedCalendarDate}"]`);
};

async function refreshAfterCalendarTransfer(){
 await loadCashCalendar();
 await Promise.all([loadDashboardForecast(),refreshFundsForecast()]);
}
async function loadCashCalendar(){
 closeCalendarCell?.();
 const request=++cashCalendarRequest;
 exportCashCalendar.disabled=true;
 if(cashCalendarScope!==selectedOwner){cashCalendarScope=selectedOwner;cashCalendarData=null;calendarDays.replaceChildren();calendarGrid.replaceChildren();calendarUnscheduled.hidden=true;}
 if(!calendarMonth.value)calendarMonth.value=localToday().slice(0,7);
 try{
  const data=await api('/api/cash-calendar?month='+encodeURIComponent(calendarMonth.value)+'&today='+localToday());
  if(request!==cashCalendarRequest)return;
  cashCalendarData=data;
  exportCashCalendar.disabled=!data.events.length;
  calendarStatus.textContent='';
  calendarUnscheduled.hidden=!data.unscheduled?.length;
  calendarUnscheduled.querySelector('div').innerHTML=(data.unscheduled||[]).map(row=>renderCalendarEvent({
   ...row,fromPerson:row.fromPerson||row.contact,toPerson:row.toPerson||row.contact,
   kind:row.contact?'Outside e-transfer':'Household e-transfer'
  })).join('');
  const days=new Map();
  for(const event of data.events.sort((a,b)=>a.date.localeCompare(b.date)||a.label.localeCompare(b.label))){
   if(!days.has(event.date))days.set(event.date,[]);
   days.get(event.date).push(event);
  }
  renderCalendarGrid(calendarMonth.value,days);
  calendarDays.innerHTML=(days.size?[...days].map(([date,events])=>`<section class="calendar-day" data-calendar-section="${date}" ${selectedCalendarDate&&selectedCalendarDate!==date?'hidden':''}>
   <h3>${esc(txDateLabel(date))}</h3>${events.map(renderCalendarEvent).join('')}</section>`).join(''):'<p class="muted">No scheduled cash events for this month.</p>')+
   `<p id="cashCalendarEmptyDate" class="muted" ${selectedCalendarDate&&!days.has(selectedCalendarDate)?'':'hidden'}>Nothing scheduled for this date.</p>`;
 }catch(error){if(request===cashCalendarRequest)calendarStatus.textContent=error.message;}
}
calendarMonth.onchange=()=>{selectedCalendarDate='';loadCashCalendar();};
calendarDays.onclick=async event=>{
 const button=event.target.closest('[data-transfer-id]');
 if(!button)return;
 button.disabled=true;
 try{
  await put('/api/cash-calendar/transfers/'+encodeURIComponent(button.dataset.transferId)+'/occurrence',{
   date:button.dataset.transferDate,paid:button.dataset.transferPaid!=='true'
  });
  await refreshAfterCalendarTransfer();
 }catch(error){calendarStatus.textContent=error.message;button.disabled=false;}
};
$('addCalendarTransfer').onclick=()=>openCalendarTransfer();
$('view-calendar').addEventListener('click',event=>{
 const button=event.target.closest('[data-transfer-details],[data-transfer-inline]');
 if(!button)return;
 const id=button.dataset.transferDetails||button.dataset.transferInline;
 const row=[...(cashCalendarData?.transfers||[]),...(cashCalendarData?.unscheduled||[])].find(item=>item.id===id);
 if(!row)return;
 if(button.dataset.transferDetails)openCalendarTransfer(row,button.matches('.text-action'));
 else editCalendarRow(row,button);
});
let closeCalendarCell=null;
new MutationObserver(()=>{
 if($('view-calendar').classList.contains('hidden'))closeCalendarCell?.();
}).observe($('view-calendar'),{attributes:true,attributeFilter:['class']});
function editCalendarRow(transfer,trigger){
 closeCalendarCell?.();
 const field=trigger.dataset.editField;
 const category=field==='category',amount=field==='amount';
 const previous=transfer[field]??'';
 const control=document.createElement('input');
 control.className='calendar-cell-input';
 control.setAttribute('aria-label',trigger.getAttribute('aria-label'));
 control.value=amount?Number(previous).toFixed(2):previous;
 control.required=!category;
 control.maxLength=120;
 if(amount){
  control.type='number';
  control.step='.01';
  control.min='.01';
  control.inputMode='decimal';
 }
 let popup=null,saving=false,matches=[];
 const close=(restoreFocus=false)=>{
  control.onblur=null;
  if(popup)popup.onfocusout=null;
  popup?.remove();
  document.removeEventListener('pointerdown',outside);
  window.removeEventListener('scroll',position,true);
  window.removeEventListener('resize',position);
  control.replaceWith(trigger);
  closeCalendarCell=null;
  if(restoreFocus)trigger.focus();
 };
 const save=async value=>{
  if(saving)return;
  if(value===previous){close();return;}
  saving=true;
  control.disabled=true;
  calendarStatus.textContent='';
  try{
   await put('/api/cash-calendar/transfers/'+encodeURIComponent(transfer.id),{[field]:value});
   if(closeCalendarCell===close)close();
   await refreshAfterCalendarTransfer();
  }catch(error){
   saving=false;
   control.disabled=false;
   calendarStatus.textContent=error.message;
   if(control.isConnected)control.focus();
  }
 };
 const saveText=()=>{
  const value=amount?control.valueAsNumber:control.value.trim();
  if(!control.validity.valid||(!amount&&!value)){
   calendarStatus.textContent=amount?'Enter a valid amount.':'Enter a transfer name.';
   return;
  }
  save(value);
 };
 const outside=event=>{
  if(!saving&&event.target!==control&&!popup?.contains(event.target))close();
 };
 const position=()=>{
  if(!popup||!control.isConnected)return;
  const box=control.getBoundingClientRect(),width=Math.min(380,innerWidth-24);
  const below=innerHeight-box.bottom-12,above=box.top-12;
  const down=below>=220||below>=above;
  const height=Math.min(360,Math.max(100,down?below:above));
  Object.assign(popup.style,{width:width+'px',left:Math.min(Math.max(box.left,12),innerWidth-width-12)+'px',
   top:down?box.bottom+4+'px':'auto',bottom:down?'auto':innerHeight-box.top+4+'px',maxHeight:height+'px'});
 };
 trigger.replaceWith(control);
 closeCalendarCell=close;
 control.onkeydown=event=>{
  if(event.key==='Escape'){event.preventDefault();close(true);}
  else if(event.key==='Enter'){
   event.preventDefault();
   if(!category)saveText();
   else if(matches.length===1)save(matches[0].value??matches[0].name);
   else popup.querySelector('[role=option]')?.focus();
  }else if(category&&event.key==='ArrowDown'){
   event.preventDefault();popup.querySelector('[role=option]')?.focus();
  }
 };
 if(category){
  const choices=calendarCategoryChoices(cashCalendarData.categories,previous);
  popup=document.createElement('div');
  popup.className='inline-search-popover calendar-category-popover drawer-category-results';
  popup.id='calendarCategoryResults';
  popup.role='listbox';
  control.setAttribute('role','combobox');
  control.setAttribute('aria-expanded','true');
  control.setAttribute('aria-controls',popup.id);
  control.setAttribute('autocomplete','off');
  control.placeholder='Search categories…';
  document.body.append(popup);
  const render=query=>{
   matches=choices.filter(choice=>PulseCategorySearch.matches(choice,query));
   renderCategoryPickerOptions(popup,matches.map(choice=>({...choice,selected:(choice.value??choice.name)===previous})),'',save);
  };
  render('');
  control.oninput=()=>render(control.value);
  popup.onpointerdown=event=>{if(event.target.closest('[role=option]'))event.preventDefault();};
  popup.onkeydown=event=>{
   if(event.key==='Escape'){event.preventDefault();close(true);}
   if(['ArrowDown','ArrowUp'].includes(event.key)){
    event.preventDefault();
    const options=[...popup.querySelectorAll('[role=option]')];
    const index=options.indexOf(document.activeElement),step=event.key==='ArrowDown'?1:-1;
    options[(index+step+options.length)%options.length]?.focus();
   }
  };
  control.onblur=event=>{if(!popup.contains(event.relatedTarget)&&!saving)close();};
  popup.onfocusout=event=>{if(event.relatedTarget!==control&&!popup.contains(event.relatedTarget)&&!saving)close();};
  document.addEventListener('pointerdown',outside);
  window.addEventListener('scroll',position,true);
  window.addEventListener('resize',position);
 }else control.onblur=saveText;
 control.focus();
 control.select();
 position();
}
async function openCalendarTransfer(existing,setDate=false){
 if(!cashCalendarData)await loadCashCalendar();
 if(!cashCalendarData)return;
 const {people,accounts,contacts,categories,purposes=[]}=cashCalendarData;
 const dialog=payrollDialog(existing?'Edit transfer':'Add e-transfer'),body=dialog.querySelector('.payroll-dialog-body');
 const names=side=>[...new Set(contacts?.[side]||[])].filter(name=>!people.some(person=>person.toLowerCase()===name.toLowerCase())).map(name=>`<option value="${esc(name)}"></option>`).join('');
 const household=name=>people.find(person=>person.toLowerCase()===name.trim().toLowerCase())||'';
 const owner=activeOwnerName()||signedInUser.name;
 const today=localToday(),date=selectedCalendarDate||(calendarMonth.value===today.slice(0,7)?today:calendarMonth.value+'-01');
 body.innerHTML=`<form class="calendar-transfer-form"><div class="formgrid">
  <label>Transfer type<select name="transferType"><option value="household">Within household</option><option value="outside">Outside contact</option></select></label>
  <label>For what?<input name="label" list="calendarTransferPurposes" maxlength="120" placeholder="Search bills or merchants" required></label>
  <label>Amount (CAD)<input name="amount" type="number" min=".01" step=".01" inputmode="decimal" required></label>
 </div><fieldset><legend>Payment timing</legend>
  <label class="calendar-date-unknown"><input name="unscheduled" type="checkbox"> Payment date unknown</label>
  <div class="formgrid">
  <label>Due date<input name="date" type="date" value="${esc(existing?.date||date)}" required></label>
  <label>Repeat<select name="frequency"><option value="once">One time</option><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></label>
  <label hidden>End date (optional)<input name="endDate" type="date"></label>
  </div>
 </fieldset><fieldset><legend>People and accounts</legend>
  <div class="formgrid">
  <label>Paid by<select name="fromPerson">${people.map(name=>`<option>${esc(name)}</option>`).join('')}</select></label>
  <label>Paid to<select name="toPerson">${people.map(name=>`<option>${esc(name)}</option>`).join('')}</select></label>
  <label hidden>Direction<select name="outsideDirection"><option value="out">I’m sending money</option><option value="in">I’m expecting money</option></select></label>
  <label hidden>Contact name<input name="contact" list="calendarRecipients" maxlength="120" placeholder="Choose a previous contact or type a new name"></label>
  <label>Category<select name="calendarCategory"><option value="">No category</option>${categories.map(c=>`<option>${esc(c.name)}</option>`).join('')}</select></label>
  <label>Payer’s account<select name="fromAccountId"></select></label><label>Recipient’s account<select name="toAccountId"></select></label>
 </div></fieldset><datalist id="calendarTransferPurposes">${purposes.map(name=>`<option value="${esc(name)}"></option>`).join('')}</datalist><datalist id="calendarPayers">${names('from')}</datalist><datalist id="calendarRecipients">${names('to')}</datalist>
 ${existing?.date&&existing.frequency!=='once'?'<p class="muted">Changes apply to the recurring transfer series.</p>':''}
 <p class="muted">Choose an account to include that side in Funds Check, or choose Calendar only for a reminder.</p>
 <p role="status"></p><button class="primary">Schedule transfer</button></form>`;
 const form=body.querySelector('form'),fields=form.elements;
 const saveButton=form.querySelector('button.primary');
 fields.fromPerson.value=people.includes(owner)?owner:people[0];
 fields.toPerson.value=people.find(person=>person!==fields.fromPerson.value)||'';
 if(existing){
  fields.unscheduled.checked=!existing.date&&!setDate;
  fields.label.value=existing.label;
  fields.amount.value=Number(existing.amount).toFixed(2);
  fields.frequency.value=existing.frequency||'once';
  fields.endDate.value=existing.endDate||'';
  fields.transferType.value=existing.contact?'outside':'household';
  fields.outsideDirection.value=existing.fromPerson?'out':'in';
  fields.contact.value=existing.contact;
  if(existing.fromPerson)fields.fromPerson.value=existing.fromPerson;
  if(existing.toPerson)fields.toPerson.value=existing.toPerson;
 }
 const choices=calendarCategoryChoices(categories,existing?.category);
 fields.calendarCategory.innerHTML=calendarCategoryOptions(choices,existing?.category);
 bindDrawerCategoryPicker(fields.calendarCategory,()=>choices);
 function updateAccounts(){
  const outside=fields.transferType.value==='outside',incoming=fields.outsideDirection.value==='in';
  for(const name of ['fromPerson','toPerson'])fields[name].closest('label').hidden=outside;
  for(const name of ['outsideDirection','contact'])fields[name].closest('label').hidden=!outside;
  fields.contact.required=outside;
  fields.contact.setAttribute('list',incoming?'calendarPayers':'calendarRecipients');
  for(const side of ['from','to']){
   const select=fields[side+'AccountId'],current=select.value;
   const person=outside?(side===(incoming?'to':'from')?signedInUser.name:''):household(fields[side+'Person'].value);
   select.closest('label').hidden=!person;
   const options=accounts.filter(a=>a.owners.includes(person));
   select.disabled=!person;
   select.required=!!person;
   select.replaceChildren(new Option('Choose an account',''),...options.map(a=>new Option(a.name,a.id)),new Option('Calendar only','__calendar__'));
   const checking=options.filter(a=>a.type==='checking');
   select.value=select.dataset.person===person&&(current==='__calendar__'||options.some(a=>a.id===current))?current:checking.length===1?checking[0].id:options.length===1?options[0].id:options.length?'':'__calendar__';
   select.dataset.person=person;
  }
 }
 function updateDateFields(){
  const undated=fields.unscheduled.checked;
  fields.date.required=!undated;
  for(const name of ['date','frequency']){
   fields[name].disabled=undated;
   fields[name].closest('label').hidden=undated;
  }
  fields.endDate.disabled=undated||fields.frequency.value==='once';
  fields.endDate.closest('label').hidden=fields.endDate.disabled;
  fields.date.closest('.formgrid').hidden=undated;
  fields.endDate.min=fields.date.value;
  saveButton.textContent=undated?'Save without date':existing?.date?'Save changes':'Schedule transfer';
 }
 fields.unscheduled.onchange=fields.frequency.onchange=fields.date.onchange=updateDateFields;
 updateDateFields();
 fields.fromPerson.onchange=fields.toPerson.onchange=fields.transferType.onchange=fields.outsideDirection.onchange=updateAccounts;
 updateAccounts();
 if(existing)for(const key of ['fromAccountId','toAccountId']){
  const value=existing[key]||'__calendar__';
  if([...fields[key].options].some(option=>option.value===value))fields[key].value=value;
 }
 form.onsubmit=async event=>{
  event.preventDefault();
  const button=saveButton,status=form.querySelector('[role=status]');
  button.disabled=true;
  try{
   const values=Object.fromEntries(new FormData(form)),outside=values.transferType==='outside',incoming=values.outsideDirection==='in';
   const fromPerson=outside?(incoming?'':signedInUser.name):household(values.fromPerson);
   const toPerson=outside?(incoming?signedInUser.name:''):household(values.toPerson);
   const account=key=>values[key]==='__calendar__'?'':values[key]||'';
   const payload={
    label:values.label,amount:values.amount,date:values.date||null,frequency:values.frequency||'once',endDate:values.endDate||null,category:values.calendarCategory,
    fromPerson,toPerson,contact:outside?values.contact:'',
    fromAccountId:account('fromAccountId'),toAccountId:account('toAccountId')
   };
   if(existing)await put('/api/cash-calendar/transfers/'+encodeURIComponent(existing.id),payload);
   else await post('/api/cash-calendar/transfers',payload);
   if(payload.date){calendarMonth.value=payload.date.slice(0,7);selectedCalendarDate=payload.date;}
   dialog.close();await refreshAfterCalendarTransfer();
  }catch(error){status.textContent=error.message;button.disabled=false;}
 };
};

async function loadDashboardForecast(){
 if($('view-dashboard').classList.contains('hidden')||!signedInUser)return;
 const host=$('quickCoverage');
 try{
  const {setup}=await api('/api/funds-setup');
  if(!setup){host.innerHTML='<p class="muted">Open Funds Check to set up your cash forecast.</p>';return;}
  host.replaceChildren();
  if(typeof runDashboardFundsCheck==='function')await runDashboardFundsCheck(!(Number($('quickAmount').value)>0));
 }catch(error){$('quickCheckMsg').textContent=error.message;}
}
const beforeCalendarDashboard=loadDashboard;
loadDashboard=async function(){await beforeCalendarDashboard();await loadDashboardForecast();};
const beforeCalendarCoverage=loadCoverage;
loadCoverage=async function(){await beforeCalendarCoverage();await loadDashboardForecast();};

const exportCashCalendar=$('exportCashCalendar');
const calendarText=value=>String(value).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/[;,]/g,'\\$&');
function foldCalendarLine(line){
 const encoder=new TextEncoder();
 let result='',bytes=0;
 for(const character of line){
  const size=encoder.encode(character).length;
  if(bytes+size>75){result+='\r\n ';bytes=1;}
  result+=character;
  bytes+=size;
 }
 return result;
}
exportCashCalendar.onclick=()=>{
 if(!cashCalendarData?.events.length)return;
 const stamp=new Date().toISOString().replace(/[-:]|\.\d{3}/g,'');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Pulse//Cash Calendar//EN','CALSCALE:GREGORIAN'];
 for(const [index,event] of cashCalendarData.events.entries()){
  const date=event.date.replace(/-/g,'');
  lines.push('BEGIN:VEVENT',
   `UID:${calendarMonth.value}-${index}-${stamp}@pulse-calendar`,
   'DTSTAMP:'+stamp,'DTSTART;VALUE=DATE:'+date,
   'SUMMARY:'+calendarText(event.label),
   'DESCRIPTION:'+calendarText(event.kind),
   'END:VEVENT');
 }
 lines.push('END:VCALENDAR','');
 const url=URL.createObjectURL(new Blob([lines.map(foldCalendarLine).join('\r\n')],{type:'text/calendar;charset=utf-8'}));
 const link=document.createElement('a');
 link.href=url;
 link.download=`pulse-calendar-${calendarMonth.value}.ics`;
 document.body.append(link);
 link.click();
 link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
};
