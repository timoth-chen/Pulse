// Move the existing controls, preserving their state and event handlers.
const pageHeaderLeft=document.createElement('div');pageHeaderLeft.className='header-page-local';
const pageHeaderRight=document.createElement('div');pageHeaderRight.className='header-page-tools hidden';
compactHeaderContext.append(pageHeaderLeft);compactTopbar.insertBefore(pageHeaderRight,$('ownerSwitcher'));
const pageHeaderEntries=[];
function headerControl(view,selector,side='left'){
 const node=document.querySelector(selector);if(!node)return;
 const home=document.createComment('Page control home');node.before(home);
 pageHeaderEntries.push({view,node,home,target:side==='left'?pageHeaderLeft:pageHeaderRight});
}
headerControl('cashflow','#cashflowPeriod');
headerControl('dashboard','.dashboard-period');
for(const [selectId,groupId] of [['dashboardRangePreset','dashboardReportingPresets'],['dashboardFundsDays','dashboardForecastPresets']]){
 const select=$(selectId),group=$(groupId);
 const sync=()=>{for(const button of group.children)button.setAttribute('aria-pressed',String(button.dataset.value===select.value));};
 for(const option of select.options){
  const button=document.createElement('button');
  button.type='button';
  button.dataset.value=option.value;
  button.textContent=option.textContent.replace(/^Next (\d+) days$/,'$1 days');
  button.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event('change'));};
  group.append(button);
 }
 select.addEventListener('change',sync);
 select.closest('details').addEventListener('toggle',sync);
 sync();
}
headerControl('cashflow','.cashflow-toolbar>.filter-popover','right');
headerControl('budgets','.budget-workspace-toolbar>.row:first-child');
headerControl('budgets','.budget-workspace-toolbar>.row:last-child','right');
headerControl('reports','.report-mode-tabs');
headerControl('reports','#reportPeriod');
headerControl('reports','#reportDatePanel');
headerControl('reports','#reportHeaderControls','right');
headerControl('payroll','.payroll-toolbar>.toolbar-actions:first-child');
headerControl('payroll','.payroll-toolbar>.toolbar-actions:last-child','right');
headerControl('investments','.investment-toolbar','right');
headerControl('tools','.financial-tool-nav');
headerControl('payoff','#newLoanBtn','right');
const goalEditor=$('savingsGoalEditor');
const addGoalNav=document.createElement('button');
addGoalNav.id='openSavingsGoalEditor';
addGoalNav.type='button';
addGoalNav.className='primary';
addGoalNav.textContent='Add goal';
addGoalNav.setAttribute('aria-controls',goalEditor.id);
addGoalNav.setAttribute('aria-expanded','false');
goalEditor.before(addGoalNav);
goalEditor.parentElement.querySelector('h3').after(goalEditor);
goalEditor.querySelector('summary').classList.add('sr-only');
goalEditor.addEventListener('toggle',()=>addGoalNav.setAttribute('aria-expanded',String(goalEditor.open)));
addGoalNav.onclick=()=>{
 if(goalEditor.open&&!$('addBucketBtn').dataset.editId){goalEditor.open=false;return;}
 delete $('addBucketBtn').dataset.editId;
 $('addBucketBtn').textContent='Create goal';
 for(const id of ['bkName','bkTarget','bkCurrent','bkDate','bkMonthly'])$(id).value='';
 $('bkPerson').value=activeOwnerName()||'';
 $('goalMsg').textContent='';
 goalEditor.open=true;
 $('bkName').focus();
};
headerControl('goals','#openSavingsGoalEditor','right');

const billsHeaderToolbar=document.querySelector('.bills-toolbar');
if(billsHeaderToolbar){
 const labels=[...billsHeaderToolbar.querySelectorAll(':scope>label')];
 if(labels.length){labels[0].id='billsHeaderView';headerControl('bills','#billsHeaderView');}
 const filters=billsHeaderToolbar.querySelector(':scope>.filter-popover');if(filters){filters.id='billsHeaderFilters';headerControl('bills','#billsHeaderFilters','right');}headerControl('bills','#cleanAddBill','right');
}
function updatePageHeaderControls(){
 const signed=document.body.classList.contains('signed-in');
 for(const entry of pageHeaderEntries){
  const active=signed&&$('view-'+entry.view)&&!$('view-'+entry.view).classList.contains('hidden');
  if(active){if(entry.node.parentNode!==entry.target)entry.target.append(entry.node);}
  else if(entry.node.parentNode===entry.target){entry.node.querySelectorAll('details[open]').forEach(d=>d.open=false);if(entry.node.matches('details'))entry.node.open=false;entry.home.after(entry.node);}
 }
 pageHeaderLeft.classList.toggle('hidden',!pageHeaderLeft.children.length);
 pageHeaderRight.classList.toggle('hidden',!pageHeaderRight.children.length);
}
const pageHeaderObserver=new MutationObserver(updatePageHeaderControls);
for(const view of document.querySelectorAll('[id^="view-"]'))pageHeaderObserver.observe(view,{attributes:true,attributeFilter:['class']});
pageHeaderObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
updatePageHeaderControls();

// At app-sized widths, secondary actions live in one menu instead of wrapping the header.
const headerActionsMenu=document.createElement('details');headerActionsMenu.className='header-actions-menu hidden';headerActionsMenu.innerHTML='<summary aria-label="Page actions" title="Page actions"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg></summary><div class="header-actions-content"></div>';compactTopbar.insertBefore(headerActionsMenu,$('ownerSwitcher'));
function updateHeaderActionsLayout(){
 if(pageHeaderRight.parentNode!==compactTopbar)compactTopbar.insertBefore(pageHeaderRight,headerActionsMenu);
 headerActionsMenu.classList.add('hidden');
 if(!pageHeaderRight.children.length){headerActionsMenu.open=false;return;}
 compactTopbar.classList.add('measuring-page-actions');
 const compact=compactTopbar.scrollWidth>compactTopbar.clientWidth+1;
 compactTopbar.classList.remove('measuring-page-actions');
 if(compact||window.matchMedia('(max-width: 1200px)').matches){
  headerActionsMenu.classList.remove('hidden');
  headerActionsMenu.querySelector('.header-actions-content').append(pageHeaderRight);
 }else headerActionsMenu.open=false;
}
const updatePageHeaderBeforeOverflow=updatePageHeaderControls;updatePageHeaderControls=function(){updatePageHeaderBeforeOverflow();updateHeaderActionsLayout();};
window.addEventListener('resize',updateHeaderActionsLayout);new MutationObserver(updateHeaderActionsLayout).observe(pageHeaderRight,{childList:true});document.addEventListener('pointerdown',e=>{if(headerActionsMenu.open&&!headerActionsMenu.contains(e.target))headerActionsMenu.open=false;});document.addEventListener('keydown',e=>{if(e.key==='Escape')headerActionsMenu.open=false;});updateHeaderActionsLayout();

function applyFilterIcons(root){
 const candidates=[...(root.matches?.('button,summary')?[root]:[]),...root.querySelectorAll('button,summary')];
 for(const control of candidates){
  if(control.classList.contains('funnel-control')||!/^\s*[^a-zA-Z]*Filters?\s*\d*\s*$/i.test(control.textContent))continue;
  control.classList.add('funnel-control');
  for(const icon of control.querySelectorAll('svg'))icon.remove();
  for(const node of control.childNodes){
   if(node.nodeType===Node.TEXT_NODE)node.textContent=node.textContent.replace(/^\s*[^a-zA-Z]+(?=Filters?)/i,'');
  }
  control.insertAdjacentHTML('afterbegin','<svg class="funnel-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 5h17l-6.4 7.5v5.7l-4.2 2v-7.7z"/></svg>');
 }
}
applyFilterIcons(document);
new MutationObserver(records=>{
 for(const record of records)for(const node of record.addedNodes)if(node instanceof Element)applyFilterIcons(node);
}).observe(document.body,{childList:true,subtree:true});

const dashboardCalendarShortcut=document.createElement('button');
dashboardCalendarShortcut.id='dashboardCalendarShortcut';
dashboardCalendarShortcut.textContent='Calendar';
dashboardCalendarShortcut.onclick=()=>goView('calendar');
$('view-dashboard').prepend(dashboardCalendarShortcut);
headerControl('dashboard','#dashboardCalendarShortcut','right');
const calendarOverviewShortcut=document.createElement('button');
calendarOverviewShortcut.id='calendarOverviewShortcut';
calendarOverviewShortcut.textContent='Dashboard';
calendarOverviewShortcut.onclick=()=>goView('dashboard');
$('view-calendar').prepend(calendarOverviewShortcut);
headerControl('calendar','#cashCalendarNavigation');
headerControl('calendar','#calendarOverviewShortcut','right');
headerControl('calendar','#addCalendarTransfer','right');
headerControl('calendar','#exportCashCalendar','right');
updatePageHeaderControls();
