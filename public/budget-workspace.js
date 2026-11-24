/* Parent caps contain subcategory allocations. Historical amounts are versioned. */
let budgetWorkspace=null,budgetRenderVersion=0,budgetShowEmpty=false;
const budgetLegacy=document.createElement('div');budgetLegacy.className='hidden';while($('view-budgets').firstChild)budgetLegacy.append($('view-budgets').firstChild);$('view-budgets').append(budgetLegacy);const budgetRoot=document.createElement('div');budgetRoot.className='budget-workspace';budgetRoot.innerHTML='<div class="budget-workspace-toolbar"><div class="row"><button id="budgetPrevious" class="icon-button" aria-label="Previous month">‹</button><div id="budgetMonthSlot"></div><button id="budgetNext" class="icon-button" aria-label="Next month">›</button><button id="budgetToday">This month</button></div><div class="row"><button id="budgetFillSources">Review sources</button><button id="budgetCategories">Manage categories</button><button id="budgetAddAllocation" class="primary">＋ Allocation</button></div></div><p id="budgetWorkspaceStatus" role="status"></p><div class="budget-workspace-grid"><div id="budgetWorkspaceTable"></div><aside id="budgetWorkspaceSummary" class="card"></aside></div><details id="budgetYearReview" class="card"><summary>Year review · planned versus actual</summary><div id="budgetYearTable"></div></details><button id="budgetShowEmpty" class="text-action">Show categories with no plan or activity</button><p class="muted">Projected money left is a monthly planning estimate, not your bank balance. Funds Check tests card due dates and daily cash. Missing imports can understate actual spending.</p>';$('view-budgets').prepend(budgetRoot);$('budgetMonthSlot').append($('budgetMonth'));$('budgetMonth').value=localToday().slice(0,7);
const budgetScope=()=>selectedOwner?'?scopeOwner='+encodeURIComponent(selectedOwner):'';
function budgetMonthShift(n){const d=new Date(($('budgetMonth').value||localToday().slice(0,7))+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);$('budgetMonth').value=d.toISOString().slice(0,7);loadBudgets();}
$('budgetPrevious').onclick=()=>budgetMonthShift(-1);$('budgetNext').onclick=()=>budgetMonthShift(1);$('budgetToday').onclick=()=>{$('budgetMonth').value=localToday().slice(0,7);loadBudgets();};$('budgetMonth').onchange=loadBudgets;
function budgetActualClass(actual,available,type='expense'){
 if(type==='income')return actual>0?'amount-pos':actual<0?'amount-neg':'';
 if(actual<0)return 'amount-pos';
 return available>0&&Math.round(actual*100)>Math.round(available*100)?'amount-neg':'';
}
function budgetProgress(actual,available,color,mode='expense'){const p=PulseBudgetProgress.describe(actual,available,mode);return `<span class="budget-progress-display"><span class="budget-progress" data-state="${p.state}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.fill}" aria-valuetext="${esc(p.label)}" title="${esc(p.label)}"><i style="width:${p.fill}%;--budget-progress-blend:${p.blend}%"></i><b class="budget-limit-marker" aria-hidden="true"></b></span><span class="budget-progress-percent" aria-hidden="true">${available>0?esc(p.display):'—'}</span></span>`;}
function budgetSections(families=budgetWorkspace.families){const sections=PulseBudgetExpenseSections.sections(combinedBudgetFamilies(families)),flex=sections.find(s=>s.kind==='Flexible');if(budgetWorkspace?.flexPoolSummary)Object.assign(flex,budgetWorkspace.flexPoolSummary);return sections;}
function budgetPoolFor(person){if(!person&&!activeOwnerName()&&budgetWorkspace.flexPoolSummary)return budgetWorkspace.flexPoolSummary;return budgetWorkspace.flexPools?.find(p=>!p.person)||budgetWorkspace.flexPools?.find(p=>p.person===person);}

function budgetRow(row,f,parent=false){const label=parent?f.group:row.category,color=f.color,actual=parent?f.actual:row.actual||0,planned=parent?f.planned:row.planned||0,available=parent?f.available:row.available??planned,remaining=f.type==='income'?(parent?f.remaining:row.remaining??Math.max(0,available-actual)):available-actual,kind=parent?(f.parent?.group||(f.kind==='Mixed'?'Flexible':f.kind)):(row.group||f.parent?.group||'Flexible'),pooled=f.type==='expense'&&kind==='Flexible'&&!!budgetPoolFor(f.person)&&planned===0,info=budgetWorkspace.catalog.find(c=>c.name===label),key=encodeURIComponent(JSON.stringify({category:label,planSection:f.planSection,targetType:parent?'parent':'category',budgetType:f.type,person:f.person,amount:planned,group:kind,rollover:parent?f.parent?.rollover:row.rollover,ids:parent?f.parent?.ids||[]:row.ids||[],sharedCap:row.sharedCap}));if(isBudgetRowHidden({category:label,person:f.person,budgetType:f.type,group:kind}))return '';return `<div class="budget-table-row ${parent?'parent':'child'}${row.unplanned&&actual?' budget-transaction-only':''}"><div class="budget-label"><button class="budget-category-link" data-budget-transactions="${key}" title="View ${esc(label)} transactions for ${esc($('budgetMonth').value)}">${!parent?esc(categoryPickerIcon(info||{name:label}))+' ':''}${esc(label)}</button>${row.estimated?'<span class="budget-auto-mark" title="'+esc(row.estimateLabel||'Calculated from scheduled bills or payroll')+'">'+(row.source==='bill-schedule'?'Bill':row.source==='payroll'?'Payroll':'Estimate')+'</span>':''}${!parent?budgetShareButtons(label,f.person,kind):''}</div><div>${pooled?'':budgetProgress(actual,available,color,f.type)}</div><span class="budget-plan-kind">${esc(kind)}</span><div class="budget-planned-cell"><button class="budget-planned-value" data-budget-inline="${key}" aria-label="Edit ${esc(label)} planned amount">${pooled?'—':money(planned)}</button></div><strong class="${budgetActualClass(actual,pooled?0:available,f.type)}">${money(actual)}</strong><span title="${kind==='Fixed'&&remaining>0&&actual>0?money(remaining)+' under plan after repayments and refunds':''}" class="${pooled?'muted':!parent&&row.unplanned&&f.parent?'muted':remaining<0?'budget-over amount-neg':remaining>0?'budget-left amount-pos':'budget-left'}">${pooled?'From pool':!parent&&row.unplanned&&f.parent?'Uses parent budget':money(remaining)}</span><button class="icon-button budget-row-menu" data-budget-actions="${key}" aria-label="Actions for ${esc(label)}">⋯</button></div>`;}
const collapsedBudgetFamilies=new Set();
function renderBudgetWorkspace(d){budgetWorkspace=d;const month=$('budgetMonth').value;const families=combinedBudgetFamilies(d.families);if(budgetShowEmpty)for(const c of d.catalog.filter(c=>c.type!=='transfer'))if(!families.some(f=>f.group===c.group&&f.type===c.type&&f.person===(activeOwnerName()||'')))families.push({group:c.group,type:c.type,person:activeOwnerName()||'',color:c.color,children:[],actual:0,planned:0,available:0,kind:'Flexible',unallocated:0});const familyHtml=f=>{const children=f.children||[],active=children.filter(c=>c.planned||c.actual||!c.unplanned).sort((a,b)=>budgetKindRank(a.group)-budgetKindRank(b.group)||a.category.localeCompare(b.category)),empty=f.hideEmpty?[]:d.catalog.filter(c=>c.group===f.group&&c.type===f.type&&!active.some(r=>r.category===c.name)&&!f.allCategories?.includes(c.name));return `<details class="budget-family" data-collapse-key="${encodeURIComponent(JSON.stringify([selectedOwner,f.key]))}" ${(f.planned||f.actual)&&!collapsedBudgetFamilies.has(JSON.stringify([selectedOwner,f.key]))?'open':''}><summary><span><span class="budget-family-chevron" aria-hidden="true">›</span><button class="budget-group-link" data-budget-transactions="${encodeURIComponent(JSON.stringify({category:f.group,targetType:'parent',person:f.person,budgetType:f.type,...(f.planSection?{categories:f.children.map(c=>c.category),planSection:f.planSection}:{})}))}">${esc(f.group)}</button>${f.person?' · '+esc(f.person):''}</span><span>${f.planSection==='Flexible'&&budgetPoolFor(f.person)&&!f.capMeta?'':money(f.planned)+' planned · '}<span class="${budgetActualClass(f.actual,f.planSection==='Flexible'&&budgetPoolFor(f.person)&&!f.capMeta?0:f.available,f.type)}">${money(f.actual)} ${f.type==='income'?'received':'spent'}</span></span></summary>${f.capMeta?budgetSectionCap(f.capMeta):''}${f.parent?budgetRow(f.parent,f,true):''}${active.map(c=>budgetRow(c,f)).join('')}${f.parent?`<div class="budget-unallocated">${money(f.unallocated)} allocated to other ${esc(f.group.toLowerCase())} · ${money(f.unallocated-children.filter(c=>c.unplanned).reduce((n,c)=>n+Number(c.actual||0),0))} remaining in that pool</div>`:''}${empty.length?`<details class="budget-empty-children"><summary>Set a specific limit for another subcategory (${empty.length})</summary>${empty.map(c=>budgetRow({category:c.name,planned:0,actual:0,group:f.planSection||f.parent?.group||'Flexible'},f)).join('')}</details>`:''}</details>`;};const heading='<div class="budget-table-row heading"><span>Category</span><span>Progress</span><span>Plan type</span><span>Planned</span><span>Spent</span><span>Left to spend</span><span></span></div>';
 $('budgetWorkspaceTable').innerHTML=`<section class="budget-section" data-budget-type="income"><h3>Income</h3>${renderBudgetRowRestore('income')}${heading.replace('Left to spend','Still expected').replace('Spent','Received')}${sortBudgetFamilies(families.filter(f=>f.type==='income'),d.order).map(familyHtml).join('')||'<p class="muted">No income plan or recorded income yet.</p>'}${renderBudgetSubtotal('income',d)}</section><section class="budget-section" data-budget-type="expense"><h3>Expenses</h3>${heading}${budgetSections(families).map(section=>renderExpensePlanSection(section,d.order,familyHtml)).join('')}${renderBudgetSubtotal('expense',d)}</section>`;bindExpensePlanSections();const t=d.totals;$('budgetWorkspaceSummary').innerHTML=`<div class="budget-left-hero ${t.projectedLeft<0?'negative':''}"><strong>${money(t.projectedLeft)}</strong><span>${d.past?'Recorded money left':'Projected budget remainder'}</span></div><details class="budget-summary-detail" ${innerWidth>1250?'open':''}><summary>Income, spending & remaining</summary><div class="budget-summary-numbers">${[['Planned income',t.plannedIncome],['Allocated expenses',t.plannedExpenses],['Left to allocate',t.leftToAllocate],['Actual income',t.actualIncome],['Actual spending',t.actualExpenses],['Actual left',t.actualLeft],['Spending outside allocations',t.unplannedSpending]].map(([k,v])=>`<div><span>${k}</span><strong>${money(v)}</strong></div>`).join('')}</div>${Object.entries(d.groups).map(([g,r])=>`<div class="budget-group-summary"><strong>${g}</strong>${budgetProgress(r.actual,r.available??r.planned,g==='Fixed'?'#599de5':g==='Flexible'?'#d67fa5':'#ac8bd2')}<small>${money(r.actual)} actual / ${money(r.planned)} planned</small></div>`).join('')}<p class="muted">Spent includes repayments and refunds. Left to spend = planned − spent. Click an amount to edit the plan.</p></details>`;
 $('budgetWorkspaceTable').querySelectorAll('[data-budget-planned]').forEach(input=>input.onchange=async()=>{try{await post('/api/budget-workspace/allocate'+budgetScope(),{...JSON.parse(decodeURIComponent(input.dataset.budgetPlanned)),amount:input.value,month,apply:'month'});await loadBudgets();}catch(e){$('budgetWorkspaceStatus').textContent=e.message;input.classList.add('invalid');}});$('budgetWorkspaceTable').querySelectorAll('[data-budget-kind]').forEach(select=>select.onchange=async()=>{try{await post('/api/budget-workspace/allocate'+budgetScope(),{...JSON.parse(decodeURIComponent(select.dataset.budgetKind)),group:select.value,month,apply:'month'});loadBudgets();}catch(e){$('budgetWorkspaceStatus').textContent=e.message;}});$('budgetWorkspaceTable').querySelectorAll('[data-budget-edit]').forEach(b=>b.onclick=()=>editBudgetAllocation(JSON.parse(decodeURIComponent(b.dataset.budgetEdit))));$('budgetWorkspaceTable').querySelectorAll('[data-budget-shared-bill]').forEach(b=>b.onclick=async()=>{try{const d=await api('/api/budget-workspace/shared-bills/'+encodeURIComponent(b.dataset.budgetSharedBill));editBill(d.bill);billBudgetPanel.open=true;}catch(e){$('budgetWorkspaceStatus').textContent=e.message;}});$('budgetWorkspaceTable').querySelectorAll('[data-budget-transactions]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();openBudgetTransactions(JSON.parse(decodeURIComponent(b.dataset.budgetTransactions)));});$('budgetFillSources').disabled=month<localToday().slice(0,7);if($('budgetYearReview').open)loadBudgetYear();}
loadBudgets=async function(){const v=++budgetRenderVersion;try{const d=await api('/api/budget-workspace?month='+$('budgetMonth').value+'&date='+localToday());if(v!==budgetRenderVersion)return;$('budgetWorkspaceStatus').textContent=d.flexPoolSummary?.overAllocated?'Flexible category allocations exceed the overall allowance. Adjust the allowance or the category limits.':d.families.some(f=>f.overAllocated)?'Some merged category plans exceed their parent caps. Review those allocations.':'';renderBudgetWorkspace(d);}catch(e){$('budgetWorkspaceStatus').textContent=e.message;}};
$('budgetMonth').onchange=loadBudgets;$('budgetShowEmpty').onclick=()=>{budgetShowEmpty=!budgetShowEmpty;$('budgetShowEmpty').textContent=budgetShowEmpty?'Hide empty categories':'Show categories with no plan or activity';renderBudgetWorkspace(budgetWorkspace);};
function editBudgetAllocation(row={}){const dialog=payrollDialog(row.category?(row.targetType==='pool'?'Flexible allowance':row.category+' budget')+(row.person?' · '+row.person:''):'Add allocation'),body=dialog.querySelector('.payroll-dialog-body'),month=$('budgetMonth').value;body.innerHTML=`<form class="budget-allocation-form"><label>Allocation level<select name="targetType"><option value="parent">Parent category total</option><option value="category">Specific subcategory</option><option value="pool">Overall Flexible allowance</option></select></label><label>Category<select name="category"></select></label><label>Owner<select name="person"><option value="">Everyone · budget limit</option><option value="Household / Joint">Joint account spending</option>${scopeOwners.filter(o=>o.value&&!o.value.startsWith('__')).map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select></label><label>Planning group<select name="group">${['Fixed','Flexible','Non-monthly'].map(g=>`<option>${g}</option>`).join('')}</select></label><label>Allocated amount<input name="amount" type="number" min="0" step=".01" required value="${row.amount||0}"/></label><label>Apply change<select name="apply"><option value="month">Only ${month}</option><option value="future">From ${month} onward</option></select></label><label class="import-check"><input name="rollover" type="checkbox" ${row.rollover?'checked':''}/>Carry unused amounts and overspending forward</label><p class="muted">Category limits sit inside the Flexible allowance or their group allowance. Unallocated flexible spending uses the remaining pool.</p><div class="row"><button class="primary">Save allocation</button>${row.ids?.length?'<button type="button" class="danger" id="removeBudgetAllocation">Remove allocation</button>':''}</div><p role="status"></p></form>`;const form=body.querySelector('form'),refresh=()=>{const categories=form.elements.targetType.value==='pool'?[{name:'Flexible',type:'expense'}]:form.elements.targetType.value==='parent'?[...new Map(budgetWorkspace.catalog.filter(c=>c.type!=='transfer').map(c=>[c.type+'\0'+c.group,{name:c.group,type:c.type}])).values()]:budgetWorkspace.catalog.filter(c=>c.type!=='transfer');form.elements.group.closest('label').classList.toggle('hidden',form.elements.targetType.value==='pool');form.elements.category.closest('label').classList.toggle('hidden',form.elements.targetType.value==='pool');if(form.elements.targetType.value==='pool')form.elements.group.value='Flexible';form.elements.category.innerHTML=categories.map(c=>`<option value="${esc(c.name)}" data-type="${c.type}">${esc(c.name)} · ${c.type}</option>`).join('');if(row.category&&Array.from(form.elements.category.options).some(o=>o.value===row.category))form.elements.category.value=row.category;form.elements.category.budgetSearch?.refresh();};form.elements.targetType.value=row.targetType||'parent';form.elements.targetType.closest('label').classList.toggle('hidden',row.targetType==='pool');if(row.targetType==='pool')form.elements.amount.closest('label').firstChild.textContent='Total monthly Flexible allowance';refresh();bindBudgetCategorySearch(form.elements.category);form.elements.targetType.onchange=refresh;form.elements.person.value=row.person??(activeOwnerName()==='Joint'?'Household / Joint':activeOwnerName()||'');form.elements.apply.value=row.ids?.length?'month':'future';form.elements.group.value=row.group||'Flexible';const related=(budgetWorkspace.sharedBills||[]).filter(b=>b.category===row.category);
if(related.length){
 const links=document.createElement('details');links.innerHTML='<summary>Recurring bills</summary>';
 for(const bill of related){
   const edit=document.createElement('button');edit.type='button';edit.className='text-action';edit.textContent=bill.name;
   edit.onclick=async()=>{try{const {bill:record}=await api('/api/budget-workspace/shared-bills/'+encodeURIComponent(bill.id));dialog.close();editBill(record);}catch(error){form.querySelector('[role=status]').textContent=error.message;}};
   links.append(edit);
 }
 form.querySelector('.row').before(links);
}
form.onsubmit=async e=>{e.preventDefault();try{const value=Object.fromEntries(new FormData(form));await post('/api/budget-workspace/allocate'+budgetScope(),{...value,ids:row.ids||[],month,budgetType:form.elements.category.selectedOptions[0].dataset.type,rollover:form.elements.rollover.checked});dialog.close();loadBudgets();}catch(error){form.querySelector('[role=status]').textContent=error.message;}};if(body.querySelector('#removeBudgetAllocation'))body.querySelector('#removeBudgetAllocation').onclick=()=>{const status=form.querySelector('[role=status]');status.innerHTML='Remove from this month onward? Earlier plans and all transactions remain. <button type="button" class="danger">Confirm removal</button>';status.querySelector('button').onclick=async()=>{try{await post('/api/budget-workspace/remove'+budgetScope(),{ids:row.ids,month,confirm:true});dialog.close();loadBudgets();}catch(e){status.textContent=e.message;}};};}
$('budgetAddAllocation').onclick=()=>addBudgetInline($('budgetWorkspaceTable'));
async function loadBudgetYear(){try{const d=await api('/api/budget-workspace/history?year='+$('budgetMonth').value.slice(0,4));$('budgetYearTable').innerHTML='<div class="payroll-table-scroll"><table><thead><tr><th>Month</th><th>Planned income</th><th>Actual income</th><th>Allocated</th><th>Actual spending</th><th>Actual left</th></tr></thead><tbody>'+d.months.map(m=>`<tr><td><button class="text-action" data-budget-history="${m.month}">${m.month}</button></td><td>${money(m.plannedIncome)}</td><td>${money(m.actualIncome)}</td><td>${money(m.plannedExpenses)}</td><td>${money(m.actualExpenses)}</td><td>${money(m.actualLeft)}${!m.transactions?' · no imported activity':''}</td></tr>`).join('')+'</tbody></table></div>';$('budgetYearTable').querySelectorAll('[data-budget-history]').forEach(b=>b.onclick=()=>{$('budgetMonth').value=b.dataset.budgetHistory;loadBudgets();});}catch(e){$('budgetYearTable').textContent=e.message;}}
$('budgetYearReview').ontoggle=()=>{if($('budgetYearReview').open)loadBudgetYear();};
$('budgetFillSources').onclick=()=>{const dialog=payrollDialog('Review automatic planning sources'),body=dialog.querySelector('.payroll-dialog-body');async function preview(employer=''){body.textContent='Loading estimates…';try{const d=await api('/api/budget-workspace/sources?month='+$('budgetMonth').value+'&date='+localToday()+(employer?'&employer='+encodeURIComponent(employer):''));body.innerHTML=`<p>Bills and payroll already populate automatically. Saving this review creates manual overrides for ${esc(d.month)} only. Parent caps must have room for their subcategory limits.</p>${d.employers.length>1?`<label>Payroll employer<select id="budgetSourceEmployer"><option value="">Choose an employer</option>${d.employers.map(e=>`<option value="${esc(e)}" ${e===d.employer?'selected':''}>${esc(e)}</option>`).join('')}</select></label>`:''}${d.payrollWarning?`<p class="payroll-warning">${esc(d.payrollWarning)}</p>`:''}${d.items.map((r,i)=>`<label class="budget-source-choice"><input type="checkbox" data-budget-source="${i}" checked/><span>${esc(r.category)} · ${esc(r.person)} · ${money(r.amount)}<small>${r.reasons.map(esc).join('; ')}</small></span></label>`).join('')||'<p>No estimates available. Add Bills or save Payroll statements first.</p>'}<button class="primary">Use selected estimates</button><p role="status"></p>`;if(body.querySelector('#budgetSourceEmployer'))body.querySelector('#budgetSourceEmployer').onchange=e=>preview(e.target.value);body.querySelector('button').onclick=async()=>{try{await post('/api/budget-workspace/sources'+budgetScope(),{month:d.month,items:[...body.querySelectorAll('[data-budget-source]:checked')].map(c=>d.items[Number(c.dataset.budgetSource)])});dialog.close();loadBudgets();}catch(e){body.querySelector('[role=status]').textContent=e.message;}};}catch(e){body.textContent=e.message;}}preview();};
$('budgetCategories').onclick=()=>{const dialog=payrollDialog('Manage budget categories'),body=dialog.querySelector('.payroll-dialog-body');dialog.classList.add('budget-category-dialog');renderBudgetCategories(body);};
async function renderBudgetCategories(body){try{const d=await api('/api/categories');transactionCategories=d.categories;const groups=[...new Set(d.categories.map(c=>c.group))];body.innerHTML=`<p class="muted">Move subcategories by changing their parent. Parent colours are shared by their subcategories. Deleting a used subcategory requires a replacement; its transactions remain.</p><button id="budgetNewCategory" class="primary">＋ Subcategory</button>${groups.map(g=>`<section class="budget-category-family"><div class="row"><strong>${esc(g)}</strong><input type="color" value="${d.categories.find(c=>c.group===g).color}" data-budget-parent-color="${esc(g)}" aria-label="${esc(g)} colour"/><button class="text-action" data-budget-parent-rename="${esc(g)}">Rename / merge</button><button class="text-action" data-budget-parent-delete="${esc(g)}">Remove parent</button></div>${d.categories.filter(c=>c.group===g).map(c=>`<div class="budget-category-edit-row"><span>${esc(c.icon)} ${esc(c.name)}</span><div class="row"><button class="text-action" data-budget-category-edit="${esc(c.name)}">Edit / move</button><button class="text-action danger" data-budget-category-delete="${esc(c.name)}">Delete</button></div></div>`).join('')}</section>`).join('')}<p role="status"></p>`;const edit=(c={})=>{const modal=payrollDialog(c.name?'Edit subcategory':'New subcategory'),area=modal.querySelector('.payroll-dialog-body');area.innerHTML=`<form class="budget-allocation-form"><label>Name<input name="name" value="${esc(c.name||'')}" required maxlength="100"/></label><label>Parent<input name="group" list="budgetParentNames" value="${esc(c.group||'')}" required maxlength="100"/></label><datalist id="budgetParentNames">${groups.map(g=>`<option value="${esc(g)}"></option>`).join('')}</datalist><label>Symbol<input name="icon" value="${esc(c.icon||'◇')}"/></label><label>Type<select name="type">${['expense','income','transfer'].map(t=>`<option ${c.type===t?'selected':''}>${t}</option>`).join('')}</select></label><button class="primary">Save subcategory</button><p role="status"></p></form>`;area.querySelector('form').onsubmit=async e=>{e.preventDefault();try{await put('/api/categories',{...Object.fromEntries(new FormData(e.target)),...(c.name?{originalName:c.name}:{create:true})});modal.close();await renderBudgetCategories(body);loadBudgets();}catch(error){area.querySelector('[role=status]').textContent=error.message;}};};body.querySelector('#budgetNewCategory').onclick=()=>edit();body.querySelectorAll('[data-budget-category-edit]').forEach(b=>b.onclick=()=>edit(d.categories.find(c=>c.name===b.dataset.budgetCategoryEdit)));body.querySelectorAll('[data-budget-category-delete]').forEach(b=>b.onclick=()=>confirmCategoryDeletion(b.dataset.budgetCategoryDelete,async()=>{await renderBudgetCategories(body);loadBudgets();},body.querySelector('[role=status]')));body.querySelectorAll('[data-budget-parent-color]').forEach(i=>i.onchange=async()=>{try{await put('/api/category-groups/color',{group:i.dataset.budgetParentColor,color:i.value});await renderBudgetCategories(body);loadBudgets();}catch(e){body.querySelector('[role=status]').textContent=e.message;}});
 const parentDialog=(from,removing)=>{const modal=payrollDialog(removing?'Remove parent category':'Rename or merge parent'),area=modal.querySelector('.payroll-dialog-body');area.innerHTML=`<form class="budget-allocation-form"><p>${removing?'All subcategories must move to another parent. Their records and names remain.':'Renaming to an existing parent merges the families. Parent allocations move with them; review any combined caps.'}</p><label>${removing?'Move subcategories to':'Parent name'}<input name="to" list="budgetMoveParents" required maxlength="100"/></label><datalist id="budgetMoveParents">${groups.filter(g=>g!==from).map(g=>`<option>${esc(g)}</option>`).join('')}</datalist><button class="primary">Confirm ${removing?'move & removal':'parent change'}</button><p role="status"></p></form>`;area.querySelector('form').onsubmit=async e=>{e.preventDefault();try{const to=e.target.elements.to.value;if(removing&&!groups.includes(to))throw Error('Choose an existing replacement parent.');await post('/api/category-groups/move',{from,to,confirm:true});modal.close();await renderBudgetCategories(body);loadBudgets();}catch(error){area.querySelector('[role=status]').textContent=error.message;}};};body.querySelectorAll('[data-budget-parent-rename]').forEach(b=>b.onclick=()=>parentDialog(b.dataset.budgetParentRename,false));body.querySelectorAll('[data-budget-parent-delete]').forEach(b=>b.onclick=()=>parentDialog(b.dataset.budgetParentDelete,true));}catch(e){body.textContent=e.message;}}
if(!$('view-budgets').classList.contains('hidden')&&signedInUser)loadBudgets();
matchMedia('(max-width:700px)').addEventListener('change',e=>{const details=document.querySelector('#budgetWorkspaceSummary .budget-summary-detail');if(details)details.open=!e.matches;});

const budgetPlanHelp=document.createElement('p');budgetPlanHelp.className='chart-caption budget-plan-help';budgetPlanHelp.textContent='Bills and paydays update automatically. Flexible amounts are allowances; rollover is optional. Use profiles for individual or combined views.';budgetRoot.querySelector('.budget-workspace-toolbar').after(budgetPlanHelp);

function budgetKindRank(kind){return ({Fixed:0,Mixed:1,Flexible:2,'Non-monthly':3})[kind]??2;}
function sortBudgetFamilies(families,order=budgetWorkspace?.order||[]){return [...families].sort((a,b)=>budgetKindRank(a.parent?.group||a.kind)-budgetKindRank(b.parent?.group||b.kind)||(order.includes(a.key)?order.indexOf(a.key):order.includes(a.originalKey)?order.indexOf(a.originalKey):10000)-(order.includes(b.key)?order.indexOf(b.key):order.includes(b.originalKey)?order.indexOf(b.originalKey):10000)||a.group.localeCompare(b.group)||a.person.localeCompare(b.person));}
async function openBudgetTransactions(row){const month=$('budgetMonth').value,modal=payrollDialog(row.category+' · '+month),body=modal.querySelector('.payroll-dialog-body');modal.classList.add('budget-transactions-dialog');body.textContent='Loading transactions…';try{const params=new URLSearchParams({month,category:row.category,level:row.targetType,person:row.person||'',planSection:row.planSection||''}),data=await api('/api/budget-workspace/transactions?'+params+(Array.isArray(row.categories)?'&categories='+encodeURIComponent(JSON.stringify(row.categories)):''));if(!modal.open)return;body.innerHTML=`<p class="chart-caption">${data.rows.length} transaction${data.rows.length===1?'':'s'} · ${esc(row.person||'Everyone')} · ${esc(month)}. Actual amounts follow recorded transaction allocations.</p>${data.rows.length?`<div class="table-scroll"><table><thead><tr><th>Date</th><th>Transaction</th><th>Account</th><th>Amount</th></tr></thead><tbody>${data.rows.map(t=>`<tr><td class="budget-tx-date" title="${esc(txDateLabel(t.date))}">${esc(new Date(t.date+'T12:00:00Z').toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'UTC'}))}</td><td><button class="text-action" data-budget-open-transaction="${esc(t.id)}">${esc(t.merchant||'Transaction')}</button>${t.budgetRepayment?'<span class="budget-tx-category">Paid by repayment</span>':''}${t.category!==row.category?`<span class="budget-tx-category">${esc(t.category)}</span>`:''}</td><td>${esc(t.account||'')}</td><td class="budget-tx-amount ${t.amount>0?'amount-pos':t.amount<0?'amount-neg':''}">${t.amount>0?'+':''}${money(t.amount)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">No recorded transactions for this category and month.</p>'}`;body.querySelectorAll('[data-budget-open-transaction]').forEach(b=>b.onclick=async()=>{try{const d=await api('/api/transactions/'+encodeURIComponent(b.dataset.budgetOpenTransaction));modal.close();goView('transactions');openTransactionDetail(d.transaction);}catch(e){b.title=e.message;}});}catch(e){body.textContent=e.message;}}
const budgetReorderButton=document.createElement('button');budgetReorderButton.textContent='Reorder';budgetReorderButton.id='budgetReorder';$('budgetCategories').before(budgetReorderButton);
budgetReorderButton.onclick=()=>{const modal=payrollDialog('Reorder budget groups'),body=modal.querySelector('.payroll-dialog-body');let rows=[...sortBudgetFamilies(budgetWorkspace.families.filter(f=>f.type==='income')),...PulseBudgetExpenseSections.sections(budgetWorkspace.families).flatMap(section=>sortBudgetFamilies(section.families))];const render=()=>{body.innerHTML='<p class="chart-caption">Fixed, flexible and non-monthly sections stay in that order. Move groups within each plan type. Saved for this profile and owner view.</p>'+rows.map((r,i)=>`<div class="budget-order-row"><span><strong>${esc(r.group)}</strong><small>${esc(r.person||'Everyone')} · ${esc(r.parent?.group||r.kind)}</small></span><button class="icon-button" data-budget-order-up="${i}" aria-label="Move ${esc(r.group)} up" ${i===0||rows[i-1].type!==r.type||budgetKindRank(rows[i-1].parent?.group||rows[i-1].kind)!==budgetKindRank(r.parent?.group||r.kind)?'disabled':''}>↑</button><button class="icon-button" data-budget-order-down="${i}" aria-label="Move ${esc(r.group)} down" ${i===rows.length-1||rows[i+1].type!==r.type||budgetKindRank(rows[i+1].parent?.group||rows[i+1].kind)!==budgetKindRank(r.parent?.group||r.kind)?'disabled':''}>↓</button></div>`).join('')+'<button class="primary" data-budget-save-order>Save order</button><p role="status"></p>';for(const direction of ['up','down'])body.querySelectorAll('[data-budget-order-'+direction+']').forEach(b=>b.onclick=()=>{const i=Number(b.dataset[direction==='up'?'budgetOrderUp':'budgetOrderDown']),j=i+(direction==='up'?-1:1);[rows[i],rows[j]]=[rows[j],rows[i]];render();});body.querySelector('[data-budget-save-order]').onclick=async()=>{try{await put('/api/budget-workspace/order'+budgetScope(),{order:rows.map(r=>r.key)});modal.close();await loadBudgets();}catch(e){body.querySelector('[role=status]').textContent=e.message;}};};render();};

document.addEventListener('pulse-bill-saved',()=>{if(!$('view-budgets').classList.contains('hidden'))loadBudgets();});

function budgetSectionCap(cap){const key=encodeURIComponent(JSON.stringify({category:cap.group,targetType:'parent',budgetType:cap.type,person:cap.person,amount:cap.total,group:cap.parent.group,rollover:cap.parent.rollover,ids:cap.parent.ids||[]}));return `<div class="budget-section-cap">${esc(cap.group)} group allowance <button class="text-action" data-budget-edit="${key}">${money(cap.total)}</button><small>Includes limits across plan types.</small></div>`;}
function budgetExpenseSectionKey(){return 'pulse-budget-sections:'+(signedInUser?.id||'local')+':'+(selectedOwner||'everyone');}
function expenseSectionOpen(kind){try{const saved=JSON.parse(localStorage.getItem(budgetExpenseSectionKey())||'{}');if(typeof saved[kind]==='boolean')return saved[kind];}catch{}return false;}
function renderExpensePlanSection(section,order,familyHtml){return `<details class="budget-expense-plan" data-expense-plan="${section.kind}" ${expenseSectionOpen(section.kind)?'open':''}><summary class="budget-table-row expense-type-summary"><span class="expense-type-name">${section.kind}</span><div>${budgetProgress(section.actual,section.available,section.kind==='Fixed'?'#599de5':section.kind==='Flexible'?'#51aa8f':'#ac8bd2')}</div><span class="expense-type-spacer" aria-hidden="true"></span><strong data-label="Planned">${section.kind==='Flexible'?`<button class="budget-planned-value" data-edit-flex-pool aria-label="Edit overall Flexible allowance" title="Set the total Flexible allowance">${money(section.planned)}</button>`:money(section.planned)}</strong><strong data-label="Spent" class="${budgetActualClass(section.actual,section.available)}">${money(section.actual)}</strong><strong data-label="Left" class="${section.remaining>0?'amount-pos':section.remaining<0?'amount-neg':''}">${money(section.remaining)}</strong><span class="expense-section-controls"><span class="expense-section-chevron" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m9 5 7 7-7 7"/></svg></span><button type="button" class="icon-button budget-section-actions" data-section-actions aria-label="${esc(section.kind)} section actions">⋯</button></span></summary><div class="expense-type-content">${section.kind==='Flexible'?renderFlexiblePool():''}${sortBudgetFamilies(section.families,order).map(familyHtml).join('')||'<p class="muted">No allocations or spending in this section.</p>'}</div></details>`;}
function bindExpensePlanSections(){
 document.querySelectorAll('[data-budget-restore]').forEach(button=>button.onclick=()=>restoreBudgetRows('income'));
 document.querySelectorAll('[data-section-actions]').forEach(button=>button.onclick=event=>{
   event.preventDefault();event.stopPropagation();
   const section=button.closest('[data-expense-plan]');
   const menu=document.createElement('div');menu.className='budget-row-actions';
   const add=document.createElement('button');add.type='button';add.textContent='Add category or subcategory';menu.append(add);
   const kind=section.dataset.expensePlan;
   if(hiddenBudgetRows().some(row=>row.budgetType==='expense'&&row.group===kind)){
     const restore=document.createElement('button');restore.type='button';restore.textContent='Restore deleted rows';
     restore.onclick=()=>{menu.remove();restoreBudgetRows('expense',kind);};menu.append(restore);
   }
   openBudgetActionMenu(button,menu);
   add.onclick=()=>{
     menu.remove();section.open=true;
     addBudgetInline(section.querySelector('.expense-type-content'),section.dataset.expensePlan);
   };
 });
 document.querySelectorAll('[data-budget-actions]').forEach(button=>button.onclick=()=>showBudgetRowActions(button));
 document.querySelectorAll('[data-budget-inline]').forEach(button=>button.onclick=()=>{
   const row=JSON.parse(decodeURIComponent(button.dataset.budgetInline));
   if(row.sharedCap)return editBudgetInline(button,sharedCapEditRow(row));
   const entries=!selectedOwner&&row.targetType==='category'?budgetWorkspace.families.flatMap(f=>
     f.children.filter(c=>c.category===row.category&&c.group===row.group&&(!c.unplanned||c.actual))
       .map(c=>({...row,person:f.person,amount:c.planned,ids:c.ids||[]}))):[];
   const owners=entries.filter((entry,i)=>entries.findIndex(e=>e.person===entry.person)===i);
   if(owners.length===1&&owners[0].ids.length)return editBudgetInline(button,owners[0]);
   editBudgetInline(button,row,owners.length>1?owners:null);
 });
 document.querySelectorAll('.budget-family>summary').forEach(summary=>{
   const family=summary.parentElement,key=decodeURIComponent(family.dataset.collapseKey);
   family.addEventListener('toggle',()=>{if(family.open)collapsedBudgetFamilies.delete(key);else collapsedBudgetFamilies.add(key);});
   summary.querySelector('.budget-family-chevron')?.setAttribute('title','Expand or collapse subcategories');
 });
document.querySelectorAll('[data-inline-bill-share]').forEach(button=>button.onclick=()=>editBillShareInline(button));
document.querySelectorAll('[data-edit-flex-pool]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();editFlexibleInline(b);});document.querySelectorAll('[data-expense-plan]').forEach(node=>node.addEventListener('toggle',()=>{const state=Object.fromEntries([...document.querySelectorAll('[data-expense-plan]')].map(n=>[n.dataset.expensePlan,n.open]));try{localStorage.setItem(budgetExpenseSectionKey(),JSON.stringify(state));}catch{}}));}

function renderFlexiblePool(){const p=budgetWorkspace.flexPoolSummary;if(!p)return '';const reserved=Math.max(0,p.available-p.allocated),poolSpent=p.unallocatedSpent,left=reserved-poolSpent;return `<div class="budget-flex-pool-line"><strong>Unallocated pool</strong><span>${money(reserved)} planned</span><span class="${poolSpent>0?'amount-neg':poolSpent<0?'amount-pos':''}">${money(poolSpent)} spent</span><strong class="${left>0?'amount-pos':left<0?'amount-neg':''}">${money(left)} left</strong></div>`;}
function renderBudgetSubtotal(type,d){const income=type==='income',planned=income?d.totals.plannedIncome:d.totals.plannedExpenses,actual=income?d.totals.actualIncome:d.totals.actualExpenses,available=income?d.families.filter(f=>f.type==='income').reduce((n,f)=>n+f.available,0):budgetSections(d.families).reduce((n,s)=>n+s.available,0),left=income?d.families.filter(f=>f.type==='income').reduce((n,f)=>n+f.remaining,0):available-actual;return `<div class="budget-table-row budget-subtotal"><strong class="budget-subtotal-name">Total ${income?'income':'expenses'}</strong><div>${budgetProgress(actual,available,null,type)}</div><span class="budget-plan-kind" aria-hidden="true"></span><strong data-label="Planned">${money(planned)}</strong><strong data-label="${income?'Received':'Spent'}" class="${budgetActualClass(actual,available,type)}">${money(actual)}</strong><strong data-label="${income?'Expected':'Left'}" class="${left>0?'amount-pos':left<0?'amount-neg':''}">${money(left)}</strong><span aria-hidden="true"></span></div>`;}

function bindBudgetCategorySearch(select){
 if(select.budgetSearch)return;select.classList.add('sr-only');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
 const box=document.createElement('details');box.className='drawer-category-picker budget-category-picker';box.innerHTML='<summary><span></span><span aria-hidden="true">⌄</span></summary><div class="drawer-picker-menu"><input type="search" placeholder="Search categories…" aria-label="Search categories" autocomplete="off"><div role="listbox" class="drawer-category-results"></div></div>';select.before(box);
 const search=box.querySelector('input'),results=box.querySelector('[role=listbox]'),summary=box.querySelector('summary');
 const menu=box.querySelector('.drawer-picker-menu');
 const accountOverlay=select.id==='detailTransactionCategory'&&typeof menu.showPopover==='function';
 if(accountOverlay)bindAccountCategoryOverlay(box,summary,menu);
 const render=()=>{
   summary.firstElementChild.textContent=select.selectedOptions[0]?.textContent||'Choose category';
   const entries=[...select.options].map(option=>{
     const catalog=select.categoryCatalog||budgetWorkspace?.catalog||[];
     const category=catalog.find(c=>c.name===option.textContent||c.name===option.value)
       ||(typeof transactionCategories!=='undefined'?transactionCategories.find(c=>c.name===option.value):null);
     const parent=option.dataset.targetType==='parent';
     return {name:category?.name||option.textContent,value:option.value,
       group:option.dataset.group||option.parentElement.label||category?.group||(option.value?'Categories':'Filters'),
       label:parent?option.textContent+' · category total':category?.name||option.textContent.replace(/ · (expense|income)$/,''),
       parent:parent||!option.value,icon:category?.icon,selected:option.selected};
   });
   renderCategoryPickerOptions(results,entries,search.value,value=>{
     select.value=value;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));
     box.open=false;render();summary.focus();
   });
 };
 summary.addEventListener('click',event=>{if(select.disabled){event.preventDefault();return;}if(!box.open)search.value='';});box.addEventListener('toggle',()=>{if(box.open){if(select.disabled){box.open=false;return;}render();if(!accountOverlay)positionDrawerPickerMenu(box,menu);search.focus({preventScroll:true});}});search.oninput=render;search.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();box.open=false;summary.focus();}if(e.key==='ArrowDown'){e.preventDefault();results.querySelector('button')?.focus();}if(e.key==='Enter'){e.preventDefault();const options=results.querySelectorAll('button');if(options.length===1)options[0].click();else options[0]?.focus();}};results.onkeydown=e=>{const buttons=[...results.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();buttons[(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}};select.budgetSearch={refresh:render};
 select.addEventListener('change',render);
 new MutationObserver(render).observe(select,{childList:true,subtree:true});
 render();
}
function bindAccountCategoryOverlay(box,summary,menu){
 menu.setAttribute('popover','manual');
 menu.classList.add('account-category-popover');
 const panel=box.closest('.account-filter-panel');
 let listeners;
 const position=()=>{
   const rect=summary.getBoundingClientRect(),gap=6,edge=10;
   const width=Math.min(rect.width,innerWidth-edge*2);
   const below=innerHeight-rect.bottom-gap-edge,above=rect.top-gap-edge;
   const opensAbove=below<300&&above>below;
   menu.style.width=width+'px';
   menu.style.maxHeight=Math.max(0,Math.min(340,opensAbove?above:below))+'px';
   menu.style.left=Math.max(edge,Math.min(rect.left,innerWidth-width-edge))+'px';
   menu.style.top=(opensAbove?Math.max(edge,rect.top-gap-menu.offsetHeight):rect.bottom+gap)+'px';
 };
 const close=()=>{
   listeners?.abort();
   if(menu.matches(':popover-open'))menu.hidePopover();
 };
 panel.addEventListener('beforetoggle',event=>{
   if(event.newState==='closed'){box.open=false;close();}
 });
 box.addEventListener('toggle',()=>{
   close();
   if(!box.open||!panel.matches(':popover-open'))return;
   menu.showPopover({source:summary});
   position();
   listeners=new AbortController();
   const options={signal:listeners.signal};
   window.addEventListener('resize',position,options);
   window.addEventListener('scroll',event=>{
     if(!(event.target instanceof Node)||!menu.contains(event.target))position();
   },{...options,capture:true});
   menu.addEventListener('keydown',event=>{
     if(event.key!=='Escape')return;
     event.preventDefault();
     event.stopPropagation();
     box.open=false;
     summary.focus();
   },options);
 });
}
// Everyone combines household categories; individual views retain recorded ownership.
function combinedBudgetFamilies(families){if(activeOwnerName())return families;const map=new Map(),other=[];for(const f of families){if(f.parent){other.push(f);continue;}const key=f.type+'\0'+f.group;if(!map.has(key))map.set(key,{...f,key:'combined\0'+key,person:'',children:[],actual:0,planned:0,available:0,carry:0,remaining:0,unallocated:0});const out=map.get(key);for(const field of ['actual','planned','available','carry','remaining','unallocated'])out[field]=Math.round((out[field]+Number(f[field]||0))*100)/100;for(const c of f.children){let child=out.children.find(r=>r.category===c.category&&r.group===c.group);if(!child){child={...c,person:'',ids:[],planned:0,actual:0,available:0,carry:0,remaining:0};out.children.push(child);}for(const field of ['actual','planned','available','carry','remaining'])child[field]=Math.round((child[field]+Number(c[field]||0))*100)/100;child.ids.push(...(c.ids||[]));child.unplanned=child.unplanned&&c.unplanned;}}return [...map.values(),...other];}

async function openBudgetRepayments(billId){const dialog=payrollDialog('Shared repayments'),body=dialog.querySelector('.payroll-dialog-body');body.textContent='Loading…';try{const data=await api('/api/budget-workspace/repayments/'+encodeURIComponent(billId));body.innerHTML='<p>Choose who sent each repayment for '+esc(data.bill.name)+'. This updates each person’s budget contribution.</p>'+data.rows.map(r=>`<label>${esc(r.date)} · ${esc(r.merchant)} · ${money(r.amount)}<select data-repayment-transaction="${esc(r.id)}" data-split-index="${r.splitIndex??''}"><option value="">Not a shared repayment</option>${data.people.filter(p=>p!==r.person).map(p=>`<option ${r.paidBy===p?'selected':''}>${esc(p)}</option>`).join('')}</select></label>`).join('')+(data.rows.length?'':'<p class="muted">No incoming transactions in this category.</p>')+'<p role="status"></p>';body.querySelectorAll('select').forEach(select=>select.onchange=async()=>{try{select.disabled=true;await post('/api/budget-workspace/repayment',{billId,transactionId:select.dataset.repaymentTransaction,splitIndex:select.dataset.splitIndex===''?null:Number(select.dataset.splitIndex),person:select.value});await loadBudgets();body.querySelector('[role=status]').textContent='Saved';}catch(e){body.querySelector('[role=status]').textContent=e.message;}finally{select.disabled=false;}});}catch(e){body.textContent=e.message;}}

function sharedCapEditRow(row){
 const cap=row.sharedCap;
 return cap?{...row,person:cap.person,amount:cap.amount,rollover:cap.rollover,ids:[cap.id],householdAmount:true}:row;
}

function editBudgetInline(button,row,owners){
 const form=document.createElement('form');
 form.className='budget-inline-form';
 const entries=owners||[row];
 entries.forEach((entry,index)=>{
   const label=document.createElement('label');
   if(owners){label.title=entry.person||'Household';label.dataset.ownerInitial=(entry.person||'Household').slice(0,1);}
   const input=document.createElement('input');
   Object.assign(input,{type:'number',min:'0',step:'.01',required:true,value:String(entry.amount??0),name:'amount'+index});
   input.setAttribute('aria-label',entry.householdAmount?'Total household planned amount':(entry.person?entry.person+' ':'')+'planned amount');input.title=input.getAttribute('aria-label');
   label.append(input);form.append(label);
 });
 mountBudgetAutosave(button,form,async()=>{
   const month=$('budgetMonth').value;
   const allocations=entries.flatMap((entry,i)=>{
     const amount=Number(form.elements['amount'+i].value);
     return amount===Number(entry.amount??0)?[]:[{...entry,amount,month,apply:'month'}];
   });
   if(!allocations.length)return false;
   await post('/api/budget-workspace/allocate-inline'+budgetScope(),{allocations});
   return true;
 });
}

function editFlexibleInline(button){
 const person=selectedOwner==='__joint__'?'Household / Joint':activeOwnerName()||'';
 const entry=person=>{
   const pool=budgetWorkspace.flexPools?.find(p=>p.person===person);
   return {person,category:'Flexible',targetType:'pool',budgetType:'expense',group:'Flexible',
     amount:pool?.planned??0,ids:pool?.ids||[]};
 };
 const combined=budgetWorkspace.flexPools?.some(p=>!p.person);
 const people=scopeOwners.filter(o=>o.value&&!o.value.startsWith('__')).map(o=>entry(o.value));
 editBudgetInline(button,entry(person),!selectedOwner&&!combined&&people.length?people:null);
}

function budgetBillsForRow(category,person,kind){
 return (budgetWorkspace.sharedBills||[]).filter(bill=>{
   if(bill.category!==category)return false;
   const fixedOverride=bill.group==='Flexible'&&budgetWorkspace.families.some(family=>
     (!person||family.person===person||!family.person)&&
     family.children.some(child=>child.category===category&&child.group==='Fixed'&&(child.ids?.length||child.sharedCap)));
   return kind===(fixedOverride?'Fixed':bill.group);
 });
}

function budgetShareButtons(category,person,kind){
 return budgetBillsForRow(category,person,kind).filter(bill=>bill.shared)
   .map(b=>{
     const shares=Object.entries(b.shares);
     const rates=person&&b.shares[person]!=null?b.shares[person]+'%':shares.map(([,percent])=>percent+'%').join(' / ');
     const card=budgetWorkspace.cardShares?.[b.id];
     const cardText=card?'Your share '+money(card.own)+(card.unreimbursed?' · '+money(card.unreimbursed)+' awaiting repayment':''):'';
     const description=b.name+' · '+shares.map(([name,percent])=>name+' '+percent+'%').join(', ')+(cardText?' · '+cardText:'');
     return `<button type="button" class="budget-share-rate" data-inline-bill-share="${esc(b.id)}" title="${esc(description)}" aria-label="Edit split for ${esc(b.name)}: ${esc(rates)}">${esc(rates)}</button>`;
   }).join('');
}

function editBillShareInline(button){
 const bill=budgetWorkspace.sharedBills.find(b=>b.id===button.dataset.inlineBillShare);
 if(!bill)return;
 const form=document.createElement('form');
 form.className='budget-inline-form budget-inline-share';
 const people=[...new Set([...Object.keys(bill.shares),...scopeOwners.filter(o=>o.value&&!o.value.startsWith('__')).map(o=>o.value)])];
 for(const person of people){
   const label=document.createElement('label');
   label.textContent=person+' %';
   const input=document.createElement('input');
   Object.assign(input,{type:'number',min:0,max:100,step:'.01',required:true,name:person,value:String(bill.shares[person]??0)});
   label.append(input);form.append(label);
 }
 const original=people.map(person=>Number(bill.shares[person]??0));
 mountBudgetAutosave(button,form,async()=>{
   const values=people.map(person=>Number(form.elements.namedItem(person).value));
   if(values.every((value,i)=>value===original[i]))return false;
   if(Math.round(values.reduce((sum,value)=>sum+value,0)*100)!==10000)throw Error('Shares must total 100%.');
   await put('/api/bills/'+encodeURIComponent(bill.id),{budgetShares:Object.fromEntries(people.map((person,i)=>[person,values[i]]))});
   return true;
 });
 if(people.length===2)for(const [index,input] of [...form.querySelectorAll('input')].entries()){
   input.oninput=()=>{
     if(input.value!==''&&input.validity.valid)form.elements.namedItem(people[1-index]).value=String(Math.round((100-Number(input.value))*100)/100);
   };
 }
}

function mountBudgetAutosave(button,form,save){
 const status=document.createElement('span');status.setAttribute('role','status');form.append(status);
 let closed=false,saving=false;
 const restore=focus=>{closed=true;form.replaceWith(button);if(focus)button.focus();};
 const commit=async(focus=false)=>{
   if(closed||saving)return;
   if(!form.checkValidity()){status.textContent='Enter a valid amount.';return;}
   saving=true;status.textContent='';
   try{if(await save()){closed=true;await loadBudgets();}else restore(focus);}
   catch(error){status.textContent=error.message;}
   finally{saving=false;}
 };
 form.onclick=e=>e.stopPropagation();
 form.addEventListener('focusout',e=>{if(!form.contains(e.relatedTarget))void commit();});
 form.onkeydown=e=>{if(e.key==='Escape'&&!saving){e.preventDefault();e.stopPropagation();restore(true);}};
 form.onsubmit=e=>{e.preventDefault();void commit(true);};
 button.replaceWith(form);form.querySelector('input').select();
}

function showBudgetRowActions(button){
 document.querySelector('.budget-row-actions')?.remove();
 const row=JSON.parse(decodeURIComponent(button.dataset.budgetActions));
 const menu=document.createElement('div');menu.className='budget-row-actions';
 const add=(label,run)=>{
   const action=document.createElement('button');action.type='button';action.textContent=label;
   action.onclick=()=>{menu.remove();run();};menu.append(action);return action;
 };
 add('Set budget limit or rollover',()=>editBudgetAllocation(sharedCapEditRow(row)));
 const bills=budgetBillsForRow(row.category,row.person,row.group);
 for(const bill of bills){
   const suffix=bills.length>1?' · '+bill.name:'';
   const people=scopeOwners.filter(owner=>owner.value&&!owner.value.startsWith('__'));
   const label=document.createElement('label');
   label.className='budget-share-switch';
   label.textContent='Share bill'+suffix;
   const toggle=document.createElement('input');
   toggle.type='checkbox';toggle.setAttribute('role','switch');toggle.checked=bill.shared;
   toggle.disabled=people.length<2;
   label.append(toggle);menu.append(label);
   toggle.onchange=async()=>{
     toggle.disabled=true;
     const cents=Math.floor(10000/people.length),remainder=10000-cents*people.length;
     const budgetShares=toggle.checked
       ?Object.fromEntries(people.map((owner,index)=>[owner.value,(cents+(index<remainder?1:0))/100]))
       :{};
     try{
       await put('/api/bills/'+encodeURIComponent(bill.id),{budgetShares});
       menu.remove();await loadBudgets();
     }catch(error){
       toggle.checked=bill.shared;toggle.disabled=false;
       $('budgetWorkspaceStatus').textContent=error.message;
     }
   };
   if(bill.shared)add('Manage recorded repayments'+suffix,()=>openBudgetRepayments(bill.id));
   add('Edit bill'+suffix,async()=>{
     try{
       const {bill:record}=await api('/api/budget-workspace/shared-bills/'+encodeURIComponent(bill.id));
       editBill(record);
     }catch(error){$('budgetWorkspaceStatus').textContent=error.message;}
   });
 }
 add('Delete row',()=>{
   saveHiddenBudgetRows([...hiddenBudgetRows(),{category:row.category,person:row.person,budgetType:row.budgetType,group:row.group}]);
   renderBudgetWorkspace(budgetWorkspace);
   $('budgetWorkspaceStatus').textContent='Row deleted from view. Amounts still count in totals.';
 }).classList.add('amount-neg');
 if(row.ids?.length||row.sharedCap&&(!selectedOwner||row.sharedCap.person===activeOwnerName()))add('Remove allocation',()=>confirmBudgetAllocationRemoval(sharedCapEditRow(row))).classList.add('amount-neg');
 openBudgetActionMenu(button,menu);
}

function confirmBudgetAllocationRemoval(row){
 const month=$('budgetMonth').value;
 const dialog=payrollDialog('Remove allocation');
 const body=dialog.querySelector('.payroll-dialog-body');
 body.innerHTML=`<p>Remove the ${esc(row.category)} budget limit from ${esc(month)} onward?</p>
 <div class="row"><button type="button" class="danger">Remove allocation</button><button type="button">Cancel</button></div><p role="status"></p>`;
 const [remove,cancel]=body.querySelectorAll('button');
 cancel.onclick=()=>dialog.close();
 remove.onclick=async()=>{
   remove.disabled=true;
   try{
     await post('/api/budget-workspace/remove'+budgetScope(),{ids:row.ids,month,confirm:true});
     dialog.close();await loadBudgets();
   }catch(error){body.querySelector('[role=status]').textContent=error.message;remove.disabled=false;}
 };
}

function budgetHiddenRowsKey(){
 return 'pulse-budget-hidden:'+JSON.stringify([signedInUser?.id,selectedOwner,$('budgetMonth').value]);
}
function hiddenBudgetRows(){
 try{return JSON.parse(localStorage.getItem(budgetHiddenRowsKey())||'[]');}catch{return [];}
}
function saveHiddenBudgetRows(rows){localStorage.setItem(budgetHiddenRowsKey(),JSON.stringify(rows));}
function isBudgetRowHidden(row){
 return hiddenBudgetRows().some(saved=>saved.category===row.category&&saved.person===row.person&&saved.budgetType===row.budgetType&&saved.group===row.group);
}
function renderBudgetRowRestore(type){
 return hiddenBudgetRows().some(row=>row.budgetType===type)?'<button type="button" class="text-action" data-budget-restore>Restore deleted rows</button>':'';
}
function restoreBudgetRows(type,group){
 saveHiddenBudgetRows(hiddenBudgetRows().filter(row=>row.budgetType!==type||(group&&row.group!==group)));
 renderBudgetWorkspace(budgetWorkspace);
}

let activeBudgetActionMenu;
function openBudgetActionMenu(button,menu){
 activeBudgetActionMenu?.();
 document.body.append(menu);
 const anchor=button.getBoundingClientRect(),bounds=menu.getBoundingClientRect();
 const above=anchor.bottom+bounds.height+8>innerHeight;
 const position=()=>{
   const current=button.getBoundingClientRect();
   menu.style.left=Math.max(8,current.right-bounds.width)+'px';
   menu.style.top=(above?current.top-bounds.height-4:current.bottom+4)+'px';
 };
 position();
 const handlers=new AbortController();
 const options={capture:true,signal:handlers.signal};
 const close=()=>{menu.remove();handlers.abort();activeBudgetActionMenu=null;};
 activeBudgetActionMenu=close;
 menu.firstElementChild.focus({preventScroll:true});
 document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))close();},options);
 window.addEventListener('scroll',position,options);
 window.addEventListener('resize',close,{signal:handlers.signal});
 menu.onkeydown=e=>{if(e.key==='Escape'){close();button.focus({preventScroll:true});}};
}

function addBudgetInline(host,section){
 const existing=host.querySelector('.budget-quick-add');
 if(existing){existing.querySelector('summary').focus();return;}
 const form=document.createElement('form');form.className='budget-quick-add';
 form.innerHTML='<select name="category" required aria-label="Category or subcategory"><option value="">Category or subcategory</option></select><input name="amount" type="number" inputmode="decimal" min="0" step=".01" required placeholder="Planned" aria-label="Planned amount"><button type="submit">Add</button><button type="button" aria-label="Cancel allocation">×</button><span role="status"></span>';
 const select=form.elements.category,choices=[];
 const catalog=budgetWorkspace.catalog.filter(c=>section?c.type==='expense':c.type!=='transfer');
 for(const group of new Set(catalog.map(c=>c.group))){
   const categories=catalog.filter(c=>c.group===group);
   for(const entry of [{name:group,targetType:'parent',type:categories[0].type},...categories.map(c=>({name:c.name,targetType:'category',type:c.type}))]){
     const option=new Option(entry.name,entry.name);
     option.dataset.group=group;option.dataset.targetType=entry.targetType;
     // Parent and child sometimes have the same name.
     if(choices.some(c=>c.name===entry.name)){option.value=entry.name+' (subcategory)';}
     choices.push(entry);option.dataset.index=String(choices.length-1);select.add(option);
   }
 }
 host.prepend(form);
 bindBudgetCategorySearch(select);
 form.querySelector('summary').click();
 form.querySelector('[aria-label="Cancel allocation"]').onclick=()=>form.remove();
 select.onchange=()=>requestAnimationFrame(()=>form.elements.amount.focus());
 form.onsubmit=async e=>{
   e.preventDefault();
   const entry=choices[Number(select.selectedOptions[0]?.dataset.index)];
   if(!entry)return;
   try{
     await post('/api/budget-workspace/allocate'+budgetScope(),{month:$('budgetMonth').value,apply:'month',category:entry.name,targetType:entry.targetType,budgetType:entry.type,person:selectedOwner==='__joint__'?'Household / Joint':activeOwnerName()||'',group:section||'Flexible',amount:Number(form.elements.amount.value)});
     await loadBudgets();
   }catch(error){form.querySelector('[role=status]').textContent=error.message;}
 };
}

const nativeCategoryControls='select[name="category"],select[name="replacement"],#feeBaseCategory,#reportCategory,#fCategory,#detailTransactionCategory';
const categoryValueFields='#blCategory,#bulkTxCategory,#txCategory,#goalCategory,#bCategory,input[name="splitBase"],input[name="splitFee"]';

function bindCategoryValueField(field){
 if(field.categoryValuePicker)return;
 const select=document.createElement('select');
 select.setAttribute('aria-label','Category');
 field.before(select);
 field.classList.add('sr-only');field.tabIndex=-1;field.setAttribute('aria-hidden','true');
 bindBudgetCategorySearch(select);
 const picker=select.previousElementSibling,summary=picker.querySelector('summary');
 const refresh=(catalog=[])=>{
   const current=field.value;
   if(catalog.length)select.categoryCatalog=catalog;
   select.replaceChildren(new Option(current||'Choose category',current));
   for(const category of catalog)if(category.name!==current)select.add(new Option(category.name,category.name));
   select.value=current;select.budgetSearch.refresh();
 };
 field.categoryValuePicker={refresh};
 select.onchange=()=>{
   field.value=select.value;field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
 };
 field.addEventListener('change',()=>refresh());
 summary.addEventListener('click',async()=>{
   if(picker.open)return;
   refresh();
   try{
     const data=await api('/api/categories');
     if(picker.open)refresh(data.categories);
   }catch{ /* Keep the current selection available. */ }
 });
 refresh();
}
function enhanceNativeCategoryControls(root){
 if(root.nodeType!==Node.ELEMENT_NODE)return;
 if(root.matches(nativeCategoryControls))bindBudgetCategorySearch(root);
 if(root.matches(categoryValueFields))bindCategoryValueField(root);
 root.querySelectorAll(nativeCategoryControls).forEach(bindBudgetCategorySearch);
 root.querySelectorAll(categoryValueFields).forEach(bindCategoryValueField);
}
enhanceNativeCategoryControls(document.body);
new MutationObserver(records=>{
 for(const record of records){
   if(record.type==='attributes'&&record.target.open){
     record.target.querySelectorAll(categoryValueFields).forEach(field=>field.categoryValuePicker?.refresh());
   }
   for(const node of record.addedNodes)enhanceNativeCategoryControls(node);
 }
}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
