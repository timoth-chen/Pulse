const financialNav=document.querySelector('.financial-tool-nav');
const savingButton=document.createElement('button');savingButton.dataset.financialTool='saving';savingButton.textContent='Save for a purchase';savingButton.setAttribute('aria-selected','false');financialNav.append(savingButton);const panel=document.createElement('section');panel.id='financialTool-saving';panel.className='card financial-tool-panel hidden';panel.innerHTML='<h3>Save for something you want</h3><p class="muted">Calculate how much to set aside each month, then use the result to start a savings goal.</p><div class="financial-tool-grid"><form id="savingTargetForm"><label>Purchase price<input name="price" type="number" min="0" step=".01" placeholder="Passport holder, trip, or another goal" required/></label><label>Tax rate (%)<input name="tax" type="number" min="0" max="100" value="13" step=".01"/></label><label class="import-check"><input name="included" type="checkbox" checked/>Price already includes tax</label><label>Already saved<input name="saved" type="number" min="0" value="0" step=".01"/></label><label>Months to save<input name="months" type="number" min="1" max="120" value="3"/></label><a href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html" target="_blank" rel="noopener">CRA sales-tax rates ↗</a></form><div id="savingTargetResult" class="tool-results" aria-live="polite"></div></div>';$('view-tools').append(panel);$('savingTargetForm').oninput=()=>{const f=$('savingTargetForm').elements,price=Number(f.price.value),saved=Number(f.saved.value),months=Number(f.months.value),tax=Number(f.tax.value);if(!f.price.value||![price,saved,tax,months].every(Number.isFinite)||Math.min(price,saved,tax)<0||tax>100||months<1||months>120){$('savingTargetResult').textContent='Enter a price and a valid savings timeline.';return;}const total=price*(f.included.checked?1:1+tax/100),remaining=Math.max(0,total-saved);$('savingTargetResult').innerHTML=`<div class="tool-hero-result"><span>Save each month</span><strong>${money(remaining/months)}</strong></div>${toolRows([['Total purchase cost',money(total)],['Already saved',money(saved)],['Still needed',money(remaining)],['Each week (average)',money(remaining/(months*52/12))]])}<button type="button" class="primary" id="usePurchaseSavingsGoal">Use this as a savings goal</button>`;
 $('usePurchaseSavingsGoal').onclick=()=>{
   const dialog=payrollDialog('Track purchase savings');
   const area=dialog.querySelector('.payroll-dialog-body');
   area.innerHTML='<form><label>Goal name<input name="name" required maxlength="200"></label><p role="status"></p><button class="primary">Create goal</button></form>';
   const form=area.querySelector('form');
   form.elements.name.focus();
   form.onsubmit=async event=>{
    event.preventDefault();const button=form.querySelector('button');button.disabled=true;
    try{
     const [year,month,day]=localToday().split('-').map(Number);
     const date=new Date(Date.UTC(year,month-1+months,Math.min(day,new Date(Date.UTC(year,month+months,0)).getUTCDate())));
     await post('/api/buckets',{name:form.elements.name.value.trim(),person:activeOwnerName()||'Household / Joint',targetAmount:Number(total.toFixed(2)),currentAmount:Number(saved.toFixed(2)),monthlyContribution:Number((remaining/months).toFixed(2)),targetDate:date.toISOString().slice(0,10)});
     dialog.close();
     $('savingTargetResult').insertAdjacentHTML('beforeend','<p role="status">Goal added to Savings.</p>');
    }catch(error){form.querySelector('[role=status]').textContent=error.message;}
    finally{button.disabled=false;}
   };

 };};$('savingTargetForm').onsubmit=e=>e.preventDefault();$('savingTargetForm').oninput();

const previousFinancialToolRender=renderFinancialTools;renderFinancialTools=function(){previousFinancialToolRender();$('savingTargetForm').oninput();};

const financialToolsView=$('view-tools');
const inlineTools={
 forecast:{label:'Savings forecast',node:()=>$('view-forecast').querySelector('.card'),load:async()=>{renderForecast();await loadSavedScenarios();}}
};
const inlineToolHomes=new Map();
let activeFinancialTool='salary';
function restoreInlineTools(){
 for(const [node,home] of inlineToolHomes)home.after(node);
}
function addInlineTool(key,tool){
 const section=document.createElement('section');
 section.className='financial-tool-panel hidden';
 section.id='financialTool-'+key;
 financialToolsView.append(section);
 const button=key==='forecast'?$('openForecastTool'):document.createElement('button');
 button.type='button';
 button.dataset.financialTool=key;
 button.textContent=tool.label;
 if(!button.isConnected)financialNav.insertBefore(button,savingButton);
}
Object.entries(inlineTools).forEach(([key,tool])=>addInlineTool(key,tool));

async function showFinancialTool(key){
 activeFinancialTool=key;
 restoreInlineTools();
 const panel=$('financialTool-'+key);
 for(const button of financialNav.querySelectorAll('[data-financial-tool]'))button.setAttribute('aria-selected',String(button.dataset.financialTool===key));
 for(const section of financialToolsView.querySelectorAll(':scope>.financial-tool-panel'))section.classList.toggle('hidden',section!==panel);
 renderFinancialTools();
 const tool=inlineTools[key];
 if(!tool){if(key==='room')await loadRegisteredHistory();return;}
 const node=tool.node();
 if(!inlineToolHomes.has(node)){
  const home=document.createComment('Tool panel home');
  node.before(home);inlineToolHomes.set(node,home);
 }
 panel.append(node);
 try{await tool.load();}
 catch(error){
  let status=panel.querySelector('.inline-tool-status');
  if(!status){status=document.createElement('p');status.className='inline-tool-status';status.setAttribute('role','status');panel.prepend(status);}
  status.textContent=error.message;
 }
}
for(const button of financialNav.querySelectorAll('[data-financial-tool]')){
 button.onclick=()=>showFinancialTool(button.dataset.financialTool);
}
new MutationObserver(()=>{
 if(financialToolsView.classList.contains('hidden'))restoreInlineTools();
 else showFinancialTool(activeFinancialTool);
}).observe(financialToolsView,{attributes:true,attributeFilter:['class']});

const forecastStartAccount=document.createElement('label');
forecastStartAccount.innerHTML='Starting balance source<select id="forecastAccountSource"><option value="">Enter manually</option></select>';
$('forecastStart').closest('label').before(forecastStartAccount);
function applyForecastAccount(){
 const selection=$('forecastAccountSource').selectedOptions[0];
 if(selection?.dataset.balance!==undefined)$('forecastStart').value=selection.dataset.balance;
 renderForecast();
}
$('forecastAccountSource').onchange=applyForecastAccount;
$('forecastStart').addEventListener('input',()=>{$('forecastAccountSource').value='';});
$('savedScenario').addEventListener('change',()=>{$('forecastAccountSource').value='';});
async function loadForecastInputs(){
 const {items}=await api('/api/accounts');
 const select=$('forecastAccountSource'),previous=select.value;
 const options=items.filter(a=>!a.archived&&['checking','savings','investment','cash'].includes(a.type)&&Number(a.balance)>=0).map(a=>{
  const option=new Option(a.name,a.id);option.dataset.balance=a.balance;return option;
 });
 select.replaceChildren(new Option('Enter manually',''),...options);
 if(options.some(option=>option.value===previous)){
  select.value=previous;applyForecastAccount();
 }
}
$('view-forecast').querySelector('h3').textContent='How could my savings grow?';
$('view-forecast').querySelector('p.muted').textContent='Choose a starting account or enter an amount. Then set a monthly contribution, growth assumption, and number of years.';
const loadForecastTool=inlineTools.forecast.load;
inlineTools.forecast.load=async()=>{await Promise.all([loadForecastTool(),loadForecastInputs()]);};

const toolHelp={
 salary:'Use this to compare a salary change. Adjust the annual gross or deductions and choose how often you want to view take-home pay.',
 cpp:'Use this to estimate when payroll deductions reach their yearly limits. Review pensionable earnings and other fields against your latest pay stub.',
 room:'Enter the opening room you verified, then add this year’s contributions and any applicable withdrawals or transfers.',
 saving:'Enter the purchase total, how much you’ve set aside, and the number of months you have to save.',
 forecast:'Use this for a multi-year savings scenario. It projects contributions and assumed growth.'
};
const toolInstructions=document.createElement('p');
toolInstructions.className='muted financial-tool-instructions';
$('toolsOwnerNote').after(toolInstructions);
function updateFinancialToolInstructions(){
 toolInstructions.textContent=toolHelp[activeFinancialTool]||'';
}

const autoToolInputs=new Map();
let toolSourceScope=null,toolSourceRequest=0;
function toolInputKey(form,field){return form.id+':'+field.name;}
for(const id of ['salaryToolForm','cppToolForm']){
 const form=$(id);
 for(const event of ['input','change'])form.addEventListener(event,evt=>{
  if(!evt.target.name)return;
  const scope=(signedInUser?.id||'')+':'+selectedOwner;
  if(!autoToolInputs.has(scope))autoToolInputs.set(scope,new Set());
  autoToolInputs.get(scope).add(toolInputKey(form,evt.target));
 });
}
async function loadPayrollToolInputs(){
 const scope=(signedInUser?.id||'')+':'+selectedOwner;
 if(scope===toolSourceScope)return;
 toolSourceScope=scope;
 document.querySelectorAll('.financial-tool-input-source').forEach(note=>note.remove());
 const revision=++toolSourceRequest,owner=activeOwnerName()||signedInUser?.name;
 if(!owner)return;
 try{
  const [payroll,next]=await Promise.all([
   api('/api/payroll?year=2026'),
   api('/api/funds-payroll-estimate?owner='+encodeURIComponent(owner)+'&date='+localToday())
  ]);
  if(revision!==toolSourceRequest||scope!==(signedInUser?.id||'')+':'+selectedOwner)return;
  const row=payroll.records.find(r=>r.id===next.recordId);
  if(!row)return;
  const frequency=({weekly:52,biweekly:26,monthly:12})[next.frequency];
  const overrides=autoToolInputs.get(scope)||new Set();
  const pensionable=row.ytd.pensionableEarnings??row.ytd.gross;
  const cpp2=row.ytd.cpp2??(Number.isFinite(pensionable)&&pensionable<FinancialTools.rates.ympe&&row.ytd.cpp<FinancialTools.rates.cppCap?0:null);
  function supply(form,values,qualification=''){
   for(const [name,value] of Object.entries(values))if(value!=null&&!overrides.has(form.id+':'+name))form.elements[name].value=value;
   form.querySelector('.financial-tool-input-source')?.remove();
   const note=document.createElement('p');
   note.className='muted financial-tool-input-source';
   note.textContent='Prefilled from '+row.employer+' payroll · '+txDateLabel(row.payDate)+'. '+qualification+'Edit any value to override.';
   form.prepend(note);
  }
  supply($('salaryToolForm'),{gross:frequency?Math.round(row.current.gross*frequency*100)/100:null});
  supply($('cppToolForm'),{gross:row.current.gross,frequency,nextDate:next.nextDate?.startsWith('2026')?next.nextDate:null,
   earnings:pensionable??'',cpp:row.ytd.cpp,cpp2:cpp2??'',ei:row.ytd.ei},
   (row.ytd.pensionableEarnings==null&&pensionable!=null?'Year-to-date gross is used as a pensionable earnings estimate. ':'')+
   (row.ytd.cpp2==null&&cpp2===0?'CPP2 is estimated at $0 because earnings are below its threshold. ':''));
  updateFinancialTools();
 }catch{if(revision===toolSourceRequest)toolSourceScope=null;}
}
const renderToolsWithInstructions=renderFinancialTools;
let mountedToolOwner=null;
const forecastDrafts=new Map(),forecastFields=['forecastStart','forecastMonthly','forecastRate','forecastYears','scenarioName'];
const forecastDefaults=Object.fromEntries(forecastFields.map(id=>[id,$(id).value]));
renderFinancialTools=function(){
 renderToolsWithInstructions();
 updateFinancialToolInstructions();
 loadPayrollToolInputs();
 const scope=(signedInUser?.id||'')+':'+selectedOwner;
 if(scope!==mountedToolOwner){
  if(mountedToolOwner!==null)forecastDrafts.set(mountedToolOwner,{...Object.fromEntries(forecastFields.map(id=>[id,$(id).value])),account:$('forecastAccountSource').value});
  const draft=forecastDrafts.get(scope);
  for(const id of forecastFields)$(id).value=(draft||forecastDefaults)[id];
  $('forecastAccountSource').replaceChildren(new Option('Enter manually',''),...(draft?.account?[new Option('Loading account…',draft.account)]:[]));
  $('forecastAccountSource').value=draft?.account||'';
  mountedToolOwner=scope;
  if(activeFinancialTool==='room'&&!financialToolsView.classList.contains('hidden'))loadRegisteredHistory();
  if(!financialToolsView.classList.contains('hidden')&&inlineTools[activeFinancialTool]){
   const tool=inlineTools[activeFinancialTool];
   if($('financialTool-'+activeFinancialTool).querySelector('.card')){
    tool.load().catch(()=>{});
   }
  }
 }
};

const registeredForm=$('roomToolForm');
let registeredData=null,registeredScope=null,registeredRequest=0;
const registeredOverrides=new Map();
const registeredOwner=()=>activeOwnerName()||signedInUser?.name;
const registeredScopeKey=()=>signedInUser?.id+':'+selectedOwner;
const registeredNote=document.createElement('p');
registeredNote.className='muted';
registeredForm.prepend(registeredNote);
function renderRegisteredHistory(){
 const {type,contributed,withdrawn,lifetimeBefore}=registeredForm.elements;
 const kind=type.value.toUpperCase(),owner=registeredOwner();
 if(!registeredData||registeredScope!==registeredScopeKey()||!owner)return;
 const accountIds=new Set(registeredData.accounts.filter(account=>
  (account.person===owner||account.owners?.includes(owner))&&
  new RegExp('\\b'+kind+'\\b|_'+kind+'(?:\\b|_)','i').test(account.name)).map(a=>a.id));
 const imported=registeredData.activities.filter(row=>accountIds.has(row.accountId)&&row.date<='2026-12-31');
 const movements=imported.filter(row=>{
  if(row.currency!=='CAD'||!Number.isFinite(row.netCashAmount)||!row.netCashAmount)return false;
  if(row.flowClassification)return row.flowClassification==='external';
  return /^(Deposit|Withdrawal|CashDeposit|CashWithdrawal|Contribution)$/i.test(row.activityType)||
   row.activityType==='MoneyMovement'&&row.subType==='EFT';
 });
 const ambiguous=new Set();
 for(const row of movements)for(const other of movements){
  const days=Math.abs(Date.parse(row.date)-Date.parse(other.date))/86400000;
  if(row.accountId!==other.accountId&&Math.sign(row.netCashAmount)!==Math.sign(other.netCashAmount)&&days<=2){
   ambiguous.add(row);ambiguous.add(other);
  }
 }
 const current=movements.filter(row=>row.date.startsWith('2026'));
 const sum=(list,sign)=>list.filter(row=>!ambiguous.has(row)&&Math.sign(row.netCashAmount)===sign)
  .reduce((total,row)=>total+Math.abs(Math.round(row.netCashAmount*100)),0)/100;
 const assumedDeposits=sum(current,1),assumedWithdrawals=sum(current,-1);
 const prior=sum(movements.filter(row=>row.date<'2026-01-01'),1);
 const key=registeredScope+'|'+kind,overrides=registeredOverrides.get(key)||{};
 for(const [field,value] of [[contributed,assumedDeposits],[withdrawn,assumedWithdrawals],[lifetimeBefore,prior]]){
  field.value=overrides[field.name]??(imported.length?value:0);
 }
 registeredForm.elements.opening.value=overrides.opening??'';
 registeredForm.elements.rrspTransfers.value=overrides.rrspTransfers??0;
 const review=current.filter(row=>ambiguous.has(row));
 const reviewAmount=sign=>review.filter(row=>Math.sign(row.netCashAmount)===sign).reduce((total,row)=>total+Math.abs(Math.round(row.netCashAmount*100)),0)/100;
 const evidence=imported.length
  ?'Imported history suggests '+money(assumedDeposits)+' in 2026 deposits'+(kind==='TFSA'?' and '+money(assumedWithdrawals)+' in withdrawals':' and '+money(prior)+' in deposits before 2026')+'.'
  :'No imported investment activity found for this account type.';
 registeredNote.textContent=evidence+(review.length?' Review excluded possible transfers: '+money(reviewAmount(1))+' in and '+money(reviewAmount(-1))+' out.':'')+' Enter verified opening room to calculate the estimate. You can edit the imported amounts.';
 updateFinancialTools();
}
for(const event of ['input','change'])registeredForm.addEventListener(event,evt=>{
 const name=evt.target.name;
 if(!name)return;
 if(name==='type'){renderRegisteredHistory();return;}
 const key=registeredScopeKey()+'|'+registeredForm.elements.type.value.toUpperCase();
 registeredOverrides.set(key,{...registeredOverrides.get(key),[name]:evt.target.value});
});
async function loadRegisteredHistory(){
 const scope=registeredScopeKey(),revision=++registeredRequest;
 try{
  const data=await api('/api/investments/portfolio');
  if(revision!==registeredRequest||scope!==registeredScopeKey())return;
  registeredData=data;
  registeredScope=scope;
  renderRegisteredHistory();
 }catch(error){registeredNote.textContent=error.message;}
}
