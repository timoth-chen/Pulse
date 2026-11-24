// Put page context and its existing controls in the shared header; keep their handlers.
const compactPageHeading=document.querySelector('.page-heading');
const compactPageActions=compactPageHeading.querySelector('.page-actions');
const compactHeaderContext=document.createElement('div');compactHeaderContext.className='header-page-context';
const compactTopbar=document.querySelector('body>header>.topbar');
compactTopbar.querySelector('.brand').after(compactHeaderContext);
compactHeaderContext.append(compactPageHeading);
compactTopbar.insertBefore(compactPageActions,$('ownerSwitcher'));
const compactTransactionTabs=document.querySelector('#view-transactions>.workspace-tabs');
const compactTabsHome=document.createComment('Transaction tool tabs return here outside Transactions');
compactTransactionTabs.before(compactTabsHome);
$('addActivity').textContent='Add';$('addActivity').setAttribute('aria-label','Add transaction');$('addActivity').title='Add transaction';
$('downloadTxCsv').innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5"/></svg><span>Export</span>';
$('downloadTxCsv').setAttribute('aria-label','Export transactions as CSV');$('downloadTxCsv').title='Export transactions as CSV';
function updateCompactShell(){
 const signed=document.body.classList.contains('signed-in'),transactions=signed&&!$('view-transactions').classList.contains('hidden');
 compactHeaderContext.classList.toggle('compact-header-hidden',!signed);
 compactPageActions.classList.toggle('compact-header-hidden',!signed||compactPageHeading.classList.contains('hidden'));
 if(transactions&&compactTransactionTabs.parentNode!==compactHeaderContext)compactHeaderContext.append(compactTransactionTabs);
 else if(!transactions&&compactTransactionTabs.parentNode===compactHeaderContext)compactTabsHome.after(compactTransactionTabs);
}
new MutationObserver(updateCompactShell).observe(document.body,{attributes:true,attributeFilter:['class']});
new MutationObserver(updateCompactShell).observe($('view-transactions'),{attributes:true,attributeFilter:['class']});
new MutationObserver(updateCompactShell).observe(compactPageHeading,{attributes:true,attributeFilter:['class']});
updateCompactShell();
