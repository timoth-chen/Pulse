const transactionReviewButton=document.createElement('button');
transactionReviewButton.id='showReviewTransactions';transactionReviewButton.textContent='Needs review';transactionReviewButton.setAttribute('aria-pressed','false');
document.querySelector('.list-controls-actions').prepend(transactionReviewButton);
transactionReviewButton.onclick=()=>{$('txReview').value=$('txReview').value==='needs-review'?'':'needs-review';loadTransactions();};
// Every effective filter has a visible chip and a route back to the full ledger.
const renderFiltersBeforeCleanup=renderActiveTransactionFilters;
renderActiveTransactionFilters=function(){
 renderFiltersBeforeCleanup();
 transactionReviewButton.setAttribute('aria-pressed',String($('txReview').value==='needs-review'));
 const host=$('activeTxFilters');
 const chip=(label,clear)=>{const button=document.createElement('button');button.className='filter-chip';button.textContent=label+' ×';button.onclick=()=>{clear();loadTransactions();};host.append(button);};
 if(transactionMerchantFilter&&!$('searchBox').value)chip('Merchant: '+transactionMerchantFilter,()=>{clearTransactionInsight();if(!restoringPage)history.replaceState({},'','/transactions');});
 if(transactionChartRange)chip('Period: '+transactionChartRange.from+' – '+transactionChartRange.to,()=>{transactionChartRange=null;});
 const count=host.querySelectorAll('.filter-chip').length;
 $('txFilterCount').textContent=count?String(count):'';
 if(count&&!$('clearAllTxFilters')){const button=document.createElement('button');button.id='clearAllTxFilters';button.className='text-action';button.textContent='Clear all';button.onclick=()=>$('resetTxFilters').click();host.append(button);}
};
