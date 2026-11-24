// Give editable date fields a shared clear control, including fields in dialogs added later.
const clearableFieldSelector='input[type="date"],input[type="month"],input[data-clearable],textarea[data-clearable]';
function addFieldClearControl(input){
 if(input.parentElement?.classList.contains('clearable-field')||!input.closest('label')||
    input.closest('label').classList.contains('sr-only'))return;
 const wrapper=document.createElement('span'),button=document.createElement('button');
 wrapper.className='clearable-field';
 button.type='button';
 button.className='clear-field-button';
 button.textContent='×';
 const label=input.closest('label');
 const name=input.getAttribute('aria-label')||[...label.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim())?.textContent.trim()||'field';
 button.setAttribute('aria-label','Clear '+name);
 button.onclick=()=>{
  if(input.required||input.disabled||input.readOnly)return;
  input.value='';
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
  input.focus();
 };
 input.before(wrapper);
 wrapper.append(input,button);
}
for(const input of document.querySelectorAll(clearableFieldSelector))addFieldClearControl(input);
new MutationObserver(records=>{
 for(const record of records)for(const node of record.addedNodes){
  if(!(node instanceof Element))continue;
  if(node.matches(clearableFieldSelector))addFieldClearControl(node);
  for(const input of node.querySelectorAll(clearableFieldSelector))addFieldClearControl(input);
 }
}).observe(document.body,{childList:true,subtree:true});

// Cent-precision numeric fields keep empty values and show two decimal places after entry.
document.addEventListener('focusout',event=>{
 const input=event.target;
 if(!input.matches?.('input[type="number"][step=".01"],input[type="number"][step="0.01"]')||
    !input.value||!input.validity.valid||!Number.isFinite(input.valueAsNumber))return;
 input.value=input.valueAsNumber.toFixed(2);
});
