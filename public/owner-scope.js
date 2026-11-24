/* One viewing filter for the whole household; profile authentication is independent. */
let selectedOwner='',ownerScopeVersion=0,scopeOwners=[],signedInUser=null,defaultOwnerView='me';
const activeOwnerName=()=>selectedOwner==='__joint__'?'Joint':selectedOwner==='__unassigned__'?'':selectedOwner;
const ownerScopeLabel=()=>scopeOwners.find(o=>o.value===selectedOwner)?.label||'Everyone';
const everyoneIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="6" r="2.5"/><circle cx="4.5" cy="8" r="2"/><circle cx="19.5" cy="8" r="2"/><path d="M7 22v-5a5 5 0 0 1 10 0v5M1 20v-4a3.5 3.5 0 0 1 5-3M23 20v-4a3.5 3.5 0 0 0-5-3"/></svg>';
async function initOwnerScope(){
 const previous=activeOwnerName();++ownerScopeVersion;
 const [d,preferences]=await Promise.all([api('/api/owners'),api('/api/preferences')]);scopeOwners=d.items.filter(o=>o.value!=='__unassigned__');
 if(typeof applyPersonalLayout==='function')applyPersonalLayout(preferences.layout);
 defaultOwnerView=preferences.defaultView;selectedOwner=defaultOwnerView==='everyone'?'':signedInUser?.name||'';
 $('defaultEveryone').checked=defaultOwnerView==='everyone';
 if(selectedOwner&&!scopeOwners.some(o=>o.value===selectedOwner)){selectedOwner='';try{localStorage.removeItem('pulse-owner');}catch{}}
 renderOwnerSwitcher();
 for(const id of ['txPerson','blPerson','lPerson','hPerson','aPerson','bPerson','bkPerson'])if($(id)&&(!$(id).value||$(id).value===previous))$(id).value=activeOwnerName();
}
function renderOwnerSwitcher(){
 $('ownerSwitcher').innerHTML=`<button type="button" data-owner="" aria-label="View everyone" title="Everyone" aria-pressed="${!selectedOwner}">${everyoneIcon}<span class="owner-label">Everyone</span></button>`+scopeOwners.map(o=>`<button type="button" data-owner="${esc(o.value)}" aria-label="View ${esc(o.label)}" title="${esc(o.label)}" aria-pressed="${selectedOwner===o.value}"><span class="owner-initial" aria-hidden="true">${esc(o.label.charAt(0).toUpperCase())}</span><span class="owner-label">${esc(o.label)}</span></button>`).join('');
 $('ownerSwitcher').querySelectorAll('[data-owner]').forEach(b=>b.onclick=()=>setOwnerScope(b.dataset.owner));
 $('scopeStatus').textContent=selectedOwner?`Viewing ${ownerScopeLabel()} across Pulse`:'Viewing everyone across Pulse';
 $('scopeStatus').dataset.owner=selectedOwner;
 $('scopedExport').href='/api/export'+(selectedOwner?'?scopeOwner='+encodeURIComponent(selectedOwner):'');
 $('settingsExport').href=$('scopedExport').href;
}
async function setOwnerScope(owner){
 if(owner===selectedOwner)return;
 const version=++ownerScopeVersion,previous=activeOwnerName();selectedOwner=owner;accountsCache=[];

 if(typeof resetPlanningEditors==='function')resetPlanningEditors();
 renderOwnerSwitcher();$('appView').classList.add('scope-loading');$('appView').setAttribute('aria-busy','true');
 $('splitCard').classList.add('hidden');splitTx=null;
 for(const id of ['fPerson','fAccount','fCategory','accountsSpecific','reportAccount','reportCategory'])if($(id))$(id).value='';
 for(const id of ['txPerson','blPerson','lPerson','hPerson','aPerson','bPerson','bkPerson'])if($(id)&&(!$(id).value||$(id).value===previous))$(id).value=activeOwnerName();
 try{
  await refreshAccounts();
  if(!$('view-account-detail').classList.contains('hidden'))goView('accounts');
  if(typeof renderToolTabs==='function'&&transactionToolTab!=='all')renderToolTabs();
  const view=document.querySelector('nav [data-view].active')?.dataset.view||'dashboard';
  if(['cashflow','reports','forecast','tools','payroll'].includes(view))await loadReportView(view);
  await Promise.all([loadDashboard(),loadCoverage(),reloadScopeView(view)]);
 }catch(e){$('scopeStatus').textContent=`Could not load ${ownerScopeLabel()}: ${e.message}`;}
 finally{if(version===ownerScopeVersion){$('appView').classList.remove('scope-loading');$('appView').setAttribute('aria-busy','false');}}
}
function reloadScopeView(view){
 return ({dashboard:()=>Promise.resolve(),funds:()=>Promise.resolve(),calendar:()=>loadCashCalendar(),accounts:loadAccountsLoans,transactions:loadTransactions,budgets:loadBudgets,goals:loadPlanningGoals,bills:loadBills,investments:loadInvestments,import:loadBalanceImports,payoff:loadPayoff,import:()=>Promise.all([loadBalanceImports(),loadTransactionImports(),loadImportOptions()]),settings:()=>Promise.resolve()}[view]||(()=>Promise.resolve()))();
}

document.getElementById('defaultEveryone').onchange=async()=>{
 const toggle=$('defaultEveryone'),previous=defaultOwnerView;toggle.disabled=true;
 try{const saved=await put('/api/preferences',{defaultView:toggle.checked?'everyone':'me'});defaultOwnerView=saved.defaultView;await setOwnerScope(defaultOwnerView==='everyone'?'':signedInUser.name);$('preferenceMsg').textContent='Default view saved for your profile.';}
 catch(e){toggle.checked=previous==='everyone';$('preferenceMsg').textContent=e.message;}finally{toggle.disabled=false;}
};

async function refreshOwnerChoices(){
 const [owners,me]=await Promise.all([api('/api/owners'),api('/api/me')]);scopeOwners=owners.items.filter(o=>o.value!=='__unassigned__');
 $('logoutBtn').classList.toggle('hidden',me.householdUsers.length<2);$('settingsProfile').classList.toggle('hidden',me.householdUsers.length<2);renderOwnerSwitcher();
}
