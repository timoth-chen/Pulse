async function openExpenseCapture(){
 const dialog=payrollDialog('Log expense');
 dialog.classList.add('expense-capture-dialog');
 const body=dialog.querySelector('.payroll-dialog-body');
 body.textContent='Loading payment accounts…';
 try{
   const [{items},{categories}]=await Promise.all([api('/api/accounts'),api('/api/transaction-options')]);
   if(!dialog.isConnected)return;
   const accounts=items.filter(a=>!a.archived&&['credit','checking','cash','savings','other'].includes(a.type));
   const person=activeOwnerName()||signedInUser.name;
   const today=localToday(),memoryKey='pulse-expense-account:'+person;
   let lastAccount='';
   try{lastAccount=localStorage.getItem(memoryKey)||'';}catch{}
   body.innerHTML=`<form class="quick-expense-form">
     <label>Amount (CAD)<input name="amount" type="number" min=".01" step=".01" inputmode="decimal" placeholder="0.00" required></label>
     <label>What was it for?<input name="merchant" required maxlength="200" placeholder="e.g. Coffee or groceries"></label>
     <label>Paid with<select name="account" required><option value="">Choose a card or account</option>${accounts.map(a=>`<option value="${esc(a.name)}" ${a.name===lastAccount?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>
     <label>Category <span class="muted">· optional</span><select name="category"><option value="Uncategorized">Uncategorized</option>${categories.filter(c=>c.type==='expense'&&c.name!=='Uncategorized').map(c=>`<option>${esc(c.name)}</option>`).join('')}</select></label>
     <label>Receipt <span class="muted">· optional</span><input name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment"></label>
     <details><summary>Purchase date · ${esc(txDateLabel(today))}</summary><label>Purchase date<input name="date" type="date" value="${today}" required></label></details>
     <p role="status" class="expense-capture-status"></p>
     <div class="dialog-actions"><button type="button" id="captureOtherType">Full transaction form</button><button class="primary">Save expense</button></div>
   </form>`;
   const form=body.querySelector('form');
   form.elements.amount.focus();
   form.elements.date.onchange=()=>{
     const date=form.elements.date.value;
     form.querySelector('summary').textContent=date?'Purchase date · '+txDateLabel(date):'Purchase date';
   };
   body.querySelector('#captureOtherType').onclick=()=>{
     dialog.close();
     goView('transactions');
     openNewTransaction();
   };
   form.onsubmit=async event=>{
     event.preventDefault();
     const button=form.querySelector('.primary'),status=form.querySelector('[role=status]');
     const {amount,merchant,account,date,category}=Object.fromEntries(new FormData(form));
     button.disabled=true;
     status.textContent='';
     let result;
     try{
       const payload={amount:Number(amount),merchant,account,date,person,category};
       const file=form.elements.receipt.files[0];
       if(file){
         if(file.size>5*1024*1024)throw Error('Choose a receipt up to 5 MB.');
         payload.receipt={name:file.name,data:await uploadBase64(file)};
       }
       result=await post('/api/expenses',payload);
     }catch(error){
       status.textContent=error.message;
       button.disabled=false;
       return;
     }
     try{localStorage.setItem(memoryKey,account);}catch{}
     dialog.close();
     const toast=document.createElement('div');
     toast.className='capture-toast';
     toast.setAttribute('role','status');
     toast.textContent='Expense saved · '+money(Math.abs(result.transaction.amount));
     document.body.append(toast);
     setTimeout(()=>toast.remove(),5000);
     const refreshes=[loadDashboard(),loadTransactions()];
     if(!$('view-budgets').classList.contains('hidden'))refreshes.push(loadBudgets());
     await Promise.allSettled(refreshes);
   };
 }catch(error){body.textContent=error.message;}
}
const quickExpense=document.createElement('button');
quickExpense.id='quickExpense';
quickExpense.className='quick-expense';
quickExpense.innerHTML='<span aria-hidden="true">＋</span><span>Expense</span>';
quickExpense.setAttribute('aria-label','Log an expense');
document.body.append(quickExpense);
quickExpense.onclick=openExpenseCapture;
$('addActivity').onclick=openExpenseCapture;
