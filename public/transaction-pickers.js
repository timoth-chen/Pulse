function positionDrawerPickerMenu(anchor,menu,preferAbove=false){
 const r=anchor.getBoundingClientRect(),dialog=anchor.closest('dialog'),bounds=dialog?.getBoundingClientRect()||{top:0,bottom:innerHeight};
 const below=Math.min(innerHeight,bounds.bottom)-r.bottom-12,above=r.top-Math.max(0,bounds.top)-12,up=(preferAbove&&above>160)||(below<340&&above>below);
 menu.style.top=up?'auto':'calc(100% + 8px)';menu.style.bottom=up?'calc(100% + 8px)':'auto';menu.style.maxHeight=Math.max(120,Math.min(340,up?above:below))+'px';
}
// A shared result list for budget and transaction category controls.
const categoryIconIdeas={
 'Financial Fees':'💳','Interest':'💸','Other Income':'💰','Lottery':'🎰',
 'Furniture & Housewares':'🪑','Utilities':'⚡','Uncategorized':'❓',
 'Biking':'🚲','Insurance':'☂️','Government & Legal':'⚖️','General Shopping':'🛍️',
 'Financial & Legal Services':'🏦','Cash & ATM':'🏧','Work Expenses':'💼',
 'Personal Development':'🎒','Projects & Tools':'🧰','Postage & Shipping':'📦',
 'Clothing & Accessories':'👕'
};
function categoryPickerIcon(category){
 const icon=category?.icon;
 return (!icon||['◇','％','%','↗'].includes(icon))?(categoryIconIdeas[category?.name]||icon||'◇'):icon;
}
function renderCategoryPickerOptions(results,entries,query,choose){
 const groups=new Map();
 for(const entry of entries){
   if(!PulseCategorySearch.matches(entry,query))continue;
   const group=entry.group||'Categories';
   if(!groups.has(group))groups.set(group,[]);
   groups.get(group).push(entry);
 }
 results.replaceChildren();
 for(const [group,items] of groups){
   const heading=document.createElement('div');heading.className='drawer-picker-group';heading.textContent=group;results.append(heading);
   for(const item of items){
     const option=document.createElement('button');option.type='button';option.role='option';
     option.setAttribute('aria-selected',String(item.selected));
     if(!item.parent){const icon=document.createElement('span');icon.className='picker-category-icon';icon.setAttribute('aria-hidden','true');icon.textContent=categoryPickerIcon(item);option.append(icon);}
     option.append(document.createTextNode(item.label||item.name));
     option.onclick=()=>choose(item.value??item.name);
     results.append(option);
   }
 }
 if(!groups.size)results.textContent='No matching categories';
}
// Drawer controls use the same surfaces and explicit choices as the rest of Pulse.
function bindDrawerCategoryPicker(select,entries=null){
 if(!select||select.dataset.categoryPicker)return select?.categoryPicker;
 select.dataset.categoryPicker='true';select.classList.add('sr-only');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
 const categoryEntries=entries||(()=>transactionCategories);
 const box=document.createElement('details');box.className='drawer-category-picker';
 box.innerHTML='<summary><span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></summary><div class="drawer-picker-menu"><input type="search" class="drawer-category-search" placeholder="Search categories…" aria-label="Search transaction category" autocomplete="off"/><div class="drawer-category-results" role="listbox" aria-label="Categories"></div></div>';
 select.before(box);const summary=box.querySelector('summary'),search=box.querySelector('input'),results=box.querySelector('[role=listbox]');
 const choose=value=>{if(select.disabled)return;if(![...select.options].some(o=>o.value===value))select.add(new Option(value,value));select.value=value;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));box.open=false;render();summary.focus();};
 const render=()=>{summary.querySelector('span').textContent=select.selectedOptions[0]?.textContent?.replace(/^[^\p{L}\p{N}]+/u,'')||select.value||'Choose category';summary.setAttribute('aria-disabled',String(select.disabled));summary.setAttribute('aria-haspopup','listbox');summary.setAttribute('aria-expanded',String(box.open));renderCategoryPickerOptions(results,categoryEntries().map(c=>({...c,selected:(c.value??c.name)===select.value})),search.value,choose);};
 summary.onclick=e=>{if(select.disabled){e.preventDefault();return;}};
 box.addEventListener('toggle',()=>{if(box.open){if(select.disabled){box.open=false;return;}search.value='';render();positionDrawerPickerMenu(box,box.querySelector('.drawer-picker-menu'));search.focus();}});
 search.oninput=render;search.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();box.open=false;summary.focus();}else if(e.key==='ArrowDown'){e.preventDefault();results.querySelector('button')?.focus();}else if(e.key==='Enter'){e.preventDefault();const matches=categoryEntries().filter(c=>PulseCategorySearch.matches(c,search.value)),exact=matches.find(c=>c.name.toLowerCase()===search.value.trim().toLowerCase());if(exact||matches.length===1)choose((exact||matches[0]).value??(exact||matches[0]).name);else results.querySelector('button')?.focus();}};
 results.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){const buttons=[...results.querySelectorAll('button')],index=buttons.indexOf(document.activeElement),next=(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();e.preventDefault();}};
 select.categoryPicker={refresh:render,element:box,customEntries:!!entries};render();return select.categoryPicker;
}
function refreshDrawerCategoryPickers(){document.querySelectorAll('select[data-category-picker]').forEach(select=>{const value=select.value;if(!select.categoryPicker?.customEntries){select.innerHTML=categoryOptions(value);select.value=value;}select.categoryPicker?.refresh();});}
document.addEventListener('pointerdown',event=>{document.querySelectorAll('.drawer-category-picker[open]').forEach(d=>{if(!d.contains(event.target))d.open=false;});});
function bindTransactionTagPicker(input,available=[]){
 if(input.tagPicker){input.tagPicker.setOptions(available);return input.tagPicker;}
 input.removeAttribute('list');input.classList.add('sr-only');input.tabIndex=-1;input.setAttribute('aria-hidden','true');
 const box=document.createElement('div');box.className='transaction-tag-picker';box.innerHTML='<div class="transaction-tag-chips"></div><input type="search" class="transaction-tag-search" placeholder="Search or add a tag" aria-label="Search or add transaction tags" autocomplete="off"/><div class="transaction-tag-options" role="listbox" aria-label="Tag suggestions" hidden></div><span class="sr-only" role="status" aria-live="polite"></span>';input.after(box);
 const search=box.querySelector('input'),chips=box.querySelector('.transaction-tag-chips'),options=box.querySelector('[role=listbox]'),status=box.querySelector('[role=status]');
 let catalog=available,selected=String(input.value||'').split(/[,;]/).map(x=>x.trim()).filter(Boolean);
 const words=value=>value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const matching=value=>{
   const query=words(value);
   if(!query)return catalog;
   const tokens=query.split(' ');
   return catalog.filter(tag=>tokens.every(token=>words(tag).includes(token)));
 };
 const resolve=value=>{
   const exact=catalog.find(tag=>words(tag)===words(value));
   const matches=matching(value);
   return exact||((matches.length===1)?matches[0]:null);
 };

 const sync=()=>{input.value=selected.join(', ');input.dispatchEvent(new Event('input',{bubbles:true}));render();};
 const add=value=>{value=value.trim();if(!value||value.length>100)return;if(!selected.some(t=>t.toLowerCase()===value.toLowerCase()))selected.push(value);search.value='';sync();status.textContent='Tag added';search.focus();};
 const render=()=>{chips.innerHTML=selected.map((tag,i)=>`<button type="button" data-remove-tag="${i}" aria-label="Remove ${esc(tag)} tag"><span>${esc(tag)}</span><span aria-hidden="true">×</span></button>`).join('');chips.querySelectorAll('button').forEach(b=>b.onclick=()=>{selected.splice(Number(b.dataset.removeTag),1);sync();search.focus();});const q=search.value.trim().toLowerCase(),matches=matching(q).filter(t=>!selected.includes(t));options.innerHTML=matches.map(tag=>`<button type="button" role="option" data-tag-value="${esc(tag)}">${esc(tag)}</button>`).join('');options.querySelectorAll('[data-tag-value]').forEach(b=>b.onclick=()=>add(b.dataset.tagValue));if(q&&!matching(q).length&&!selected.some(t=>words(t)===words(q))){const b=document.createElement('button');b.type='button';b.textContent='Add “'+search.value.trim()+'”';b.onclick=()=>add(search.value);options.append(b);}if(!options.children.length)options.innerHTML='<p class="muted">Type a new tag name</p>';};
 search.onfocus=()=>{options.hidden=false;render();positionDrawerPickerMenu(box,options,true);};search.oninput=()=>{options.hidden=false;render();positionDrawerPickerMenu(box,options,true);};
 search.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();options.hidden=true;}else if(e.key==='Enter'){e.preventDefault();const q=search.value.trim(),known=resolve(q);if(q&&known)add(known);else if(q&&!matching(q).length)add(q);else options.querySelector('button')?.focus();}else if(e.key==='ArrowDown'){e.preventDefault();options.querySelector('button')?.focus();}};
 // Touch browsers may blur search with a null relatedTarget before dispatching the option click.
 options.addEventListener('pointerdown',event=>{if(event.target.closest('button'))event.preventDefault();});
 box.addEventListener('focusout',event=>{if(event.relatedTarget&&!box.contains(event.relatedTarget))options.hidden=true;});
 input.tagPicker={element:box,setOptions:values=>{catalog=values;render();},commitDraft:()=>{
   const value=search.value.trim();
   if(!value)return;
   const known=resolve(value);
   if(known){add(known);return;}
   if(matching(value).length)throw Error('Choose one of the matching tags before saving.');
   if(value.length>100)throw Error('Use a tag name with 100 characters or fewer.');
   add(value);
 }};render();return input.tagPicker;
}

document.addEventListener('pointerdown',event=>{
 document.querySelectorAll('.transaction-tag-picker').forEach(picker=>{
   if(!picker.contains(event.target))picker.querySelector('.transaction-tag-options').hidden=true;
 });
},true);
