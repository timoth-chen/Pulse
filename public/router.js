const pagePaths={dashboard:'/dashboard',accounts:'/accounts',transactions:'/transactions',cashflow:'/cash-flow',reports:'/reports',payroll:'/payroll',tools:'/tools',forecast:'/forecast',funds:'/funds-check',calendar:'/calendar',budgets:'/budget',goals:'/savings',bills:'/recurring',payoff:'/payoff',investments:'/investments',import:'/import',settings:'/settings'};
let restoringPage=false,pageRouteVersion=0;
function recordPagePath(view,replace=false){if(restoringPage||!pagePaths[view])return;const path=pagePaths[view];if(location.pathname!==path)history[replace?'replaceState':'pushState']({},'',path);}
function recordAccountPath(key){if(restoringPage)return;const [kind,id]=key.split(':');const path=kind==='loan'?'/accounts/loans/'+encodeURIComponent(id):'/accounts/'+encodeURIComponent(id);if(location.pathname!==path)history.pushState({},'',path);}
function recordTransactionTab(tab){if(restoringPage||$('view-transactions').classList.contains('hidden'))return;const suffix={all:'',receipt:'/receipts',retail:'/retail-orders',rules:'/rules',categories:'/categories',shared:'/shared',transfers:'/transfers'}[tab];const path='/transactions'+(suffix||'');if(location.pathname!==path)history.pushState({},'',path);}
async function openCurrentPath(){
 const version=++pageRouteVersion;if(document.readyState!=='complete')await new Promise(resolve=>window.addEventListener('load',resolve,{once:true}));if(version!==pageRouteVersion)return;
 restoringPage=true;
 try{
  if($('transactionDialog').open)$('transactionDialog').close();
  const path=location.pathname.replace(/\/$/,'')||'/';
  if(path==='/goals')history.replaceState({},'','/savings');
  const page=path==='/goals'?'goals':Object.keys(pagePaths).find(k=>pagePaths[k]===path);
  if(page){if(page==='transactions')clearTransactionInsight();goView(page);if(page==='transactions'){transactionToolTab='all';renderToolTabs();await loadTransactions();}return;}
  const account=path.match(/^\/accounts\/(?:loans\/)?([^/]+)$/);
  if(account){goView('accounts');await openAccountDetail((path.startsWith('/accounts/loans/')?'loan:':'account:')+decodeURIComponent(account[1]));return;}
  const entity=path.match(/^\/transactions\/(categories|groups|merchants)\/(.+)$/);if(entity){await openTransactionEntity(entity[1]==='groups'?'category-group':entity[1]==='categories'?'category':'merchant',decodeURIComponent(entity[2]),'',true,entity[1]==='groups'?Object.fromEntries(new URLSearchParams(location.search)):null);return;}
  const transaction=path.match(/^\/transactions\/([^/]+)$/);
  if(transaction){goView('transactions');const tab={receipts:'receipt','retail-orders':'retail',rules:'rules',categories:'categories',shared:'shared',transfers:'transfers'}[transaction[1]];if(tab){transactionToolTab=tab;renderToolTabs();}else{transactionToolTab='all';renderToolTabs();try{const d=await api('/api/transactions/'+encodeURIComponent(decodeURIComponent(transaction[1])));openTransactionDetail(d.transaction);}catch(e){$('transactionMsg').textContent=e.message;}}return;}
  goView('dashboard');history.replaceState({},'','/dashboard');
 }finally{if(version===pageRouteVersion)restoringPage=false;}
}
window.addEventListener('popstate',()=>{if(document.body.classList.contains('signed-in'))openCurrentPath();});
document.addEventListener('DOMContentLoaded',()=>{
 document.querySelectorAll('nav [data-view]').forEach(el=>el.setAttribute('data-path',pagePaths[el.dataset.view]||''));
 let transactionReturnPath='/transactions';
 const original=openTransactionDetail;openTransactionDetail=function(t){if(!$('transactionDialog').open)transactionReturnPath=location.pathname;original(t);if(!restoringPage){const path='/transactions/'+encodeURIComponent(t.id);if(location.pathname!==path)history.pushState({},'',path);}};
 $('transactionDialog').addEventListener('close',()=>{if(!restoringPage&&/^\/transactions\/[^/]+$/.test(location.pathname)&&!['receipts','retail-orders','rules','categories','shared','transfers'].includes(location.pathname.split('/').at(-1)))history.replaceState({},'',/^\/transactions\/[^/]+$/.test(transactionReturnPath)&&!['receipts','retail-orders','rules','categories','shared','transfers'].includes(transactionReturnPath.split('/').at(-1))?'/transactions':transactionReturnPath);});
});
