'use strict';
const crypto=require('node:crypto');
const {feeSplit,alreadySeparated}=require('./splits');
const {parseCsv}=require('./csv');
const uid=()=>crypto.randomUUID();
const editable=['merchant','category','person','notes','tags'];
function validateRule(input){
 const r={id:input.id||uid(),name:String(input.name||'').trim(),enabled:input.enabled!==false,match:input.match||{},set:input.set||{},...(input.split?{split:input.split}:{})};
 if(!r.name||r.name.length>120)throw Error('Give the rule a name (120 characters or fewer).');
 if(!Object.keys(r.match).length||Object.keys(r.match).some(k=>!['merchant','merchantName','account','category','minAmount','maxAmount','person','amount'].includes(k)))throw Error('Choose at least one supported rule condition.');
 for(const [k,v] of Object.entries(r.match)){
  if(k==='amount'){if(!v||typeof v!=='object'||!['any','debit','credit'].includes(v.direction)||!['equals','greater','less','between','atLeast','atMost'].includes(v.operator)||v.value===''||!Number.isFinite(Number(v.value))||Number(v.value)<0||v.operator==='between'&&(v.upper===''||!Number.isFinite(Number(v.upper))||Number(v.upper)<Number(v.value)))throw Error('Choose a valid amount condition.');continue;}
  if(v&&typeof v==='object'){if(!['equals','contains','startsWith','endsWith','notEquals'].includes(v.operator)||typeof v.value!=='string'||!v.value.trim()||['minAmount','maxAmount'].includes(k))throw Error('Choose a supported text matching option.');continue;}
  if(['minAmount','maxAmount'].includes(k)){if(v===''||!Number.isFinite(Number(v))||Number(v)<0)throw Error('Amount conditions must be positive numbers.');r.match[k]=Number(v);}else if(typeof v!=='string'||!v.trim())throw Error('Rule conditions cannot be empty.');
 }
 if(r.match.minAmount>r.match.maxAmount)throw Error('Minimum amount exceeds maximum.');
 if(!Object.keys(r.set).length||Object.keys(r.set).some(k=>![...editable,'reviewed','hidden','goalId'].includes(k)))throw Error('Choose a supported rule action.');
 for(const [k,v] of Object.entries(r.set))if(['reviewed','hidden'].includes(k)?typeof v!=='boolean':typeof v!=='string'||v.length>4000)throw Error('Invalid rule action.');
 if(r.split){feeSplit({amount:-100,person:''},r.split);if(Object.keys(r.split).some(k=>!['multiplier','baseCategory','feeCategory'].includes(k)))throw Error('Invalid split rule.');}
 return r;
}
function matches(tx,rule){return rule.enabled!==false&&Object.entries(rule.match).every(([k,v])=>{
 if(k==='amount'){if(v.direction==='debit'&&tx.amount>=0||v.direction==='credit'&&tx.amount<=0)return false;const n=Math.round(Math.abs(tx.amount)*100),a=Math.round(Number(v.value)*100),b=Math.round(Number(v.upper)*100);return v.operator==='equals'?n===a:v.operator==='greater'?n>a:v.operator==='less'?n<a:v.operator==='atLeast'?n>=a:v.operator==='atMost'?n<=a:n>=a&&n<=b;}
 const actual=String(k==='merchant'?tx.originalStatement||tx.merchant:k==='merchantName'?tx.displayName||tx.merchant:tx[k]||'').toLowerCase();
 if(v&&typeof v==='object'){const wanted=v.value.toLowerCase();return v.operator==='equals'?actual===wanted:v.operator==='notEquals'?actual!==wanted:v.operator==='contains'?actual.includes(wanted):v.operator==='startsWith'?actual.startsWith(wanted):actual.endsWith(wanted);}
 return k==='minAmount'?Math.abs(tx.amount)>=v:k==='maxAmount'?Math.abs(tx.amount)<=v:k==='merchant'?actual.includes(v.toLowerCase()):actual===v.toLowerCase();
 });}
function applyRules(tx,rules,{skipSplit=false}={}){const out={...tx},matched=[];for(const r of rules)if(matches(out,r)&&!(r.split&&(skipSplit||/finance fee/i.test(out.merchant)))){const previousTags=out.tags;Object.assign(out,r.set);if(r.set.tags!==undefined)out.tags=[...new Set([previousTags,r.set.tags].flatMap(v=>String(v||'').split(/[,;]/).map(s=>s.trim()).filter(Boolean)))].join(', ');if(r.set.reviewed===false)out.reviewRequired=true;if(r.set.merchant!==undefined)out.displayName=r.set.merchant;if(r.split&&!skipSplit&&!out.splits?.length&&!/finance fee/i.test(out.merchant))out.splits=feeSplit(out,r.split);matched.push(r.id);}return {transaction:out,matched};}
function stageCsv(csvText,filename,existing,rules,options={}){
 if(typeof csvText!=='string'||csvText.length>8000000)throw Error('Choose a CSV smaller than 8 MB.');
 csvText=require('./import-splits').normalizeCsv(csvText);const rows=parseCsv(csvText);if(rows.length<2||rows.length>50001)throw Error('Choose a CSV with 1–50,000 transactions.');
 const headers=rows.shift().map(x=>x.trim().toLowerCase());
 const get=(r,...names)=>{for(const n of names){const i=headers.indexOf(n.toLowerCase());if(i>=0)return String(r[i]||'').trim();}return '';};
 if(!headers.includes('amount')||!headers.some(h=>['date','transaction date'].includes(h)))throw Error('CSV needs Date and Amount columns.');
 const seen=new Set(existing.map(t=>t.dedupeKey));
 const staged=rows.map((r,i)=>{
  const tx={date:get(r,'Date','Transaction Date').slice(0,10),bankPostedDate:get(r,'Bank Posted Date','Posted Date','Posting Date').slice(0,10)||undefined,merchant:get(r,'Merchant','Description','Name')||'Unknown',category:get(r,'Category')||'Uncategorized',account:get(r,'Account','Account Name')||options.account||'',person:get(r,'Person','Owner','Household Member')||options.owner||'',notes:get(r,'Notes','Memo'),tags:get(r,'Tags','Tag','Labels'),originalStatement:get(r,'Original Statement'),monarchId:get(r,'Id'),mcc:get(r,'MCC','Merchant Category Code'),sourceHasPending:headers.includes('pending'),pending:get(r,'Pending').toLowerCase()==='true',reviewed:['true','reviewed'].includes(get(r,'Reviewed').toLowerCase()),reviewedAt:get(r,'Reviewed At'),reviewedBy:get(r,'Reviewed By'),amount:get(r,'Amount')===''?null:Number(get(r,'Amount').replace(/[$,]/g,''))};
  const sourceAccount=tx.account;tx.account=options.accountAliases?.[sourceAccount.trim().toLowerCase()]||sourceAccount;if(tx.account!==sourceAccount)tx.sourceAccount=sourceAccount;
  tx.category=require('./category-settings').canonicalCategory({categories:options.categories||[]},tx.category);tx.displayName=tx.merchant;tx.originalName=tx.originalStatement||tx.merchant;tx.reviewRequired=get(r,'Reviewed').toLowerCase()==='needs review';tx.sourceOwner=tx.person;
  if(options.ownerMap&&Object.hasOwn(options.ownerMap,tx.person))tx.person=options.ownerMap[tx.person];
  const excluded=(options.excludeAccounts||[]).includes(tx.account);
  const error=tx.bankPostedDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(tx.bankPostedDate)||!Number.isFinite(Date.parse(tx.bankPostedDate))||new Date(tx.bankPostedDate).toISOString().slice(0,10)!==tx.bankPostedDate)?'Invalid posted date':!/^\d{4}-\d{2}-\d{2}$/.test(tx.date)||!Number.isFinite(Date.parse(tx.date))||new Date(tx.date).toISOString().slice(0,10)!==tx.date||!get(r,'Amount')||!Number.isFinite(tx.amount)?'Invalid date or amount':'';
  tx.dedupeKey=crypto.createHash('sha256').update(tx.monarchId?'monarch:'+tx.monarchId:[tx.date,tx.merchant,tx.amount,tx.sourceAccount||tx.account,tx.category,tx.originalStatement].join('|')).digest('hex');
  const duplicate=seen.has(tx.dedupeKey);seen.add(tx.dedupeKey);const result=applyRules(tx,rules);
  const sourceHeaders=options.sourceColumns||headers,present=(...keys)=>keys.some(k=>sourceHeaders.includes(k));const pulseId=get(r,'Pulse Transaction ID','Pulse ID','pulse_transaction_id');
  return {pulseId,pulseSplits:get(r,'Pulse Split Allocations'),pulsePartial:get(r,'Pulse Row Scope')==='partial',pulseOriginalSupplied:present('original statement'),pulseFields:[...(present('merchant','description','name','payee','transaction description')?['merchant']:[]),...(present('category')?['category']:[]),...(present('tags','tag','labels')?['tags']:[]),...(present('notes','memo')?['notes']:[])],id:uid(),line:i+2,original:tx,transaction:result.transaction,matchedRules:result.matched,include:!error&&!duplicate&&!excluded,error,duplicate,excluded,proposals:[]};
 });
 const raw=staged.map(r=>r.original);for(const row of staged){if(row.error)continue;row.alreadySeparated=alreadySeparated(row.original,raw);const result=applyRules(row.original,rules,{skipSplit:row.alreadySeparated});row.transaction=result.transaction;row.matchedRules=result.matched;}
 return {id:uid(),filename:String(filename||'transactions.csv').slice(0,200),status:'staged',createdAt:new Date().toISOString(),rows:staged};
}
function propose(stage,proposals){
 if(stage.status!=='staged')throw Error('This import is already committed.');
 if(!Array.isArray(proposals)||proposals.length>50000)throw Error('Expected a proposals array.');
 const updates=proposals.map(p=>{const row=stage.rows.find(r=>r.id===p.rowId);if(!row)throw Error('Unknown row identifier.');const changes=p.changes||{};
 if(!Object.keys(changes).length||Object.keys(changes).some(k=>![...editable,'mcc','include'].includes(k)))throw Error('Proposals may change labels, owner, notes, tags or inclusion only.');
 for(const [k,v] of Object.entries(changes))if(k==='include'?typeof v!=='boolean':typeof v!=='string'||v.length>4000)throw Error('Invalid proposal value.');
 return {row,proposal:{id:uid(),changes,before:Object.fromEntries(Object.keys(changes).map(k=>[k,row.transaction[k]??null])),reason:String(p.reason||'').slice(0,1000),status:'pending'}};});
 for(const {row,proposal} of updates)row.proposals.push(proposal);
}
function importOptions(db){
 const names=(db.users||[]).map(u=>u.name),ownerMap={};
 // Only an unambiguous full name matching an existing profile's first name is shortened.
 return {ownerMap,resolveOwner:source=>{if(names.includes(source))return source;const matches=names.filter(n=>source.toLowerCase().startsWith(n.toLowerCase()+' '));return matches.length===1?matches[0]:source;}};
}
function prepareCsv(db,csvText,filename,options={}){
 options={...options,accountAliases:Object.fromEntries((db.accounts||[]).flatMap(a=>[a.name,...(a.nameAliases||[])].map(name=>[name.trim().toLowerCase(),a.name]))),categories:db.categories||[],excludeAccounts:[...new Set([...(db.importPreferences?.excludeAccounts||[]),...(options.excludeAccounts||[])])]};
 const stage=stageCsv(csvText,filename,db.transactions,db.transactionRules||[],options),mapping=importOptions(db),history=new Map(),amountIndex=new Map(),statementIndex=new Map(),pairIndex=new Map();
 const norm=v=>String(v||'').trim().toLowerCase(),amountKey=t=>JSON.stringify([t.account,t.date,Math.round(t.amount*100)]),statementKey=t=>JSON.stringify([t.account,t.date,norm(t.originalStatement),t.person||'']);
 const add=(map,key,value)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(value);};
 for(const t of db.transactions){if(t.category!=='Uncategorized'&&!t.splits?.length)for(const key of new Set([norm(t.originalStatement),norm(t.merchant)].filter(Boolean)))add(history,key,t);add(amountIndex,amountKey(t),t);if(t.originalStatement)add(statementIndex,statementKey(t),t);}
 for(const fee of db.transactions)if(/finance fee/i.test(fee.merchant)&&/chexy/i.test(fee.originalStatement||''))for(const base of statementIndex.get(statementKey(fee))||[])if(base.id!==fee.id&&!/finance fee/i.test(base.merchant)&&Math.sign(base.amount)===Math.sign(fee.amount)&&Math.abs(Math.round(Math.abs(base.amount)*.0175*100)-Math.round(Math.abs(fee.amount)*100))<=1)add(pairIndex,amountKey({...base,amount:base.amount+fee.amount}),{ids:[base.id,fee.id],statement:base.originalStatement});
 for(const row of stage.rows){
  if(row.error||row.pulseId)continue;
  if(row.transaction.category==='Uncategorized'&&!row.matchedRules.length){const known=history.get(norm(row.transaction.originalStatement||row.transaction.merchant))||[],cats=[...new Set(known.map(t=>t.category))],merchants=[...new Set(known.map(t=>t.merchant))];if(cats.length===1){row.transaction.category=cats[0];if(merchants.length===1)row.transaction.merchant=merchants[0];row.transaction.displayName=row.transaction.merchant;row.recognized=true;}}
  const name=mapping.resolveOwner(row.original.person);if(name!==row.original.person&&row.transaction.person===row.original.person){row.transaction.person=name;row.ownerMapping={from:row.original.person,to:name};}
  if((!row.transaction.monarchId||row.transaction.monarchId.startsWith('bank:'))&&!row.duplicate){
   row.possibleMatches=(amountIndex.get(amountKey(row.transaction))||[]).filter(t=>norm(t.merchant)===norm(row.transaction.merchant)||t.originalStatement&&norm(t.originalStatement)===norm(row.transaction.originalStatement)).slice(0,5).map(t=>t.id);
   const pair=(pairIndex.get(amountKey(row.transaction))||[]).find(p=>norm(p.statement)===norm(row.original.originalStatement||row.original.merchant));if(pair){row.possibleMatches.push(...pair.ids);row.matchReason='Existing Chexy base + fee already equals this gross amount';}
   row.possibleMatches=[...new Set(row.possibleMatches)];if(row.possibleMatches.length)row.include=false;
  }
 }
 require('./import-updates').annotate(db,stage,options.visibleTransactions||db.transactions);return stage;
}

function reconcilePosted(db,stage){
 let updated=0;for(const row of stage.rows){if(row.pulseId||row.error||row.excluded||!row.transaction.sourceHasPending||row.transaction.pending!==false)continue;const tx=db.transactions.find(t=>t.dedupeKey===row.transaction.dedupeKey);if(tx?.pending===true){tx.pending=false;updated++;}}
 return updated;
}
module.exports={reconcilePosted,prepareCsv,validateRule,matches,applyRules,stageCsv,propose};
