function openTaxDocuments(){
 const dialog=payrollDialog('Tax documents');
 const body=dialog.querySelector('.payroll-dialog-body');
 const thisYear=new Date().getFullYear();
 const owners=scopeOwners.filter(o=>!o.value.startsWith('__'));
 body.innerHTML=`<label>Tax year<input id="taxDocumentYear" type="number" min="2000" max="2099" step="1" value="${thisYear}" required></label>
 <div id="taxDocumentSummary" aria-live="polite"></div><div id="taxDocumentList"></div>
 <details class="tax-document-add"><summary>Add document</summary>
 <form id="taxDocumentForm">
  <div class="formgrid">
   <label>Person<select name="person">${owners.map(o=>`<option value="${esc(o.value)}" ${o.value===(activeOwnerName()||signedInUser.name)?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>
   <label>Document type<select name="type">${['Tax return','Notice of assessment','T4','T4A','T5','T3','T5008','RRSP contribution receipt','Tax slip','Receipt','Other'].map(type=>`<option>${type}</option>`).join('')}</select></label>
   <label>PDF<input type="file" name="document" accept=".pdf,application/pdf" required></label>
   <label>Return result<select name="outcome"><option value="">Leave blank</option><option value="refund">Refund</option><option value="owing">Balance owing</option><option value="even">Neither</option></select></label>
   <label hidden>Amount (CAD)<input name="amount" type="number" min=".01" max="1000000000" step=".01" inputmode="decimal"></label>
  </div>
  <button class="primary">Save document</button>
 </form></details><p role="status"></p>`;
 const year=body.querySelector('#taxDocumentYear'),summary=body.querySelector('#taxDocumentSummary');
 const list=body.querySelector('#taxDocumentList'),form=body.querySelector('form'),status=body.querySelector('[role=status]');
 const {type,outcome,amount}=form.elements;
 function updateAmount(){
  const canEnter=['Tax return','Notice of assessment'].includes(type.value);
  outcome.closest('label').hidden=!canEnter;
  if(!canEnter)outcome.value='';
  amount.required=['refund','owing'].includes(outcome.value);
  amount.closest('label').hidden=!amount.required;
 }
 type.onchange=outcome.onchange=updateAmount;
 updateAmount();

 async function load(){
  if(!year.reportValidity())return;
  const selected=year.value;
  try{
   const {items}=await api('/api/tax-documents?year='+encodeURIComponent(selected));
   if(year.value!==selected||!dialog.isConnected)return;
   const latest=new Map();
   const results=items.filter(item=>item.outcome);
   for(const item of results){
    const previous=latest.get(item.person);
    if(!previous||(item.type==='Notice of assessment'&&previous.type!=='Notice of assessment'))latest.set(item.person,item);
   }
   const label=item=>item.outcome==='even'?'Neither refund nor balance owing':
    (item.outcome==='refund'?'Refund ':'Balance owing ')+money(item.amount);
   const total=[...latest.values()].reduce((sum,item)=>sum+(item.outcome==='owing'?-1:1)*Math.round(item.amount*100),0);
   summary.innerHTML=latest.size?`<div class="tax-amount-summary"><h3>Recorded tax results</h3>
    ${[...latest.values()].map(item=>`<p><strong>${esc(item.person)}</strong> · ${esc(label(item))}</p>`).join('')}
    <p><strong>${total<0?'Net balance owing':total>0?'Net refund':'Net amount'} ${money(Math.abs(total)/100)}</strong></p>
    <small>Uses the latest recorded assessment per person when available, or the latest return.</small></div>`:'';
   list.innerHTML=items.length?items.map(item=>`<div class="tax-document-row"><div><strong>${esc(item.type)}</strong><small>${esc(item.person)} · ${esc(item.filename)}</small></div>
    <a href="/api/tax-documents/${encodeURIComponent(item.year)}/${encodeURIComponent(item.id)}">Download</a></div>`).join(''):'<p class="muted">No documents for this year.</p>';
  }catch(error){status.textContent=error.message;}
 }
 year.onchange=()=>{status.textContent='';load();};
 form.onsubmit=async event=>{
  event.preventDefault();
  if(!year.reportValidity())return;
  const button=form.querySelector('button'),file=form.elements.document.files[0];
  button.disabled=true;
  status.textContent='';
  try{
   if(!file||file.size>10*1024*1024)throw Error('Choose a PDF up to 10 MB.');
   const values=Object.fromEntries(new FormData(form));
   delete values.document;
   const selected=year.value;
   await post('/api/tax-documents',{...values,year:selected,filename:file.name,data:await uploadBase64(file)});
   form.reset();
   updateAmount();
   status.textContent='Document saved.';
   await load();
  }catch(error){status.textContent=error.message;}
  finally{button.disabled=false;}
 };
 load();
}

const taxDocumentsButton=document.createElement('button');
taxDocumentsButton.id='openTaxDocuments';
taxDocumentsButton.textContent='Tax documents';
taxDocumentsButton.onclick=openTaxDocuments;
$('reportHeaderControls').append(taxDocumentsButton);
