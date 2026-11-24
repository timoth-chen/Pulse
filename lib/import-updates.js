 'use strict';
const fields=['merchant','category','tags','notes','mcc'];const splitModel=require('./import-splits');
const snapshot=t=>JSON.stringify(Object.fromEntries(['date','amount','account','person','originalStatement','originalName','displayName','merchant','category','tags','notes','mcc','mccSource','mccEvidence','splits','transferLinkId','repaymentOriginal','sharedClaimId','manualTransfer'].map(k=>[k,t[k]??null])));
function annotate(db,stage,visible=db.transactions){
 const counts=new Map();for(const row of stage.rows)if(row.pulseId)counts.set(row.pulseId,(counts.get(row.pulseId)||0)+1);
 const permitted=new Map(visible.filter(t=>!t.scopePartial).map(t=>[t.id,t]));
 for(const row of stage.rows){if(!row.pulseId)continue;
  row.isExistingUpdate=true;row.duplicate=false;row.include=false;row.matchedRules=[];row.recognized=true;
  const t=db.transactions.find(t=>t.id===row.pulseId);let error=counts.get(row.pulseId)>1?'Repeated Pulse transaction ID in this file.':!t||!permitted.has(t.id)?'Pulse transaction ID not found in this owner view.':row.pulsePartial?'This is a partial transaction export. Export the complete transaction in Everyone.':row.error;
  if(!error&&(row.original.date!==t.date||Math.round(row.original.amount*100)!==Math.round(t.amount*100)||row.original.account!==t.account))error='Date, amount or account differs from the saved transaction. These fields are protected.';
  if(!error&&row.pulseOriginalSupplied&&row.original.originalStatement!==(t.originalStatement||''))error='Original statement differs from the saved transaction. Keep the original statement unchanged.';
  if(error){row.error=error;row.pulseBlocked=true;continue;}
  const changes={};for(const key of fields){if(!row.pulseFields.includes(key))continue;const incoming=String(row.original[key]??'');if(incoming!==String(t[key==='merchant'?'displayName':key]||t[key]||''))changes[key]=incoming;}
  if(row.pulseSplits){try{const splits=splitModel.validate(db,t,JSON.parse(row.pulseSplits));if(splitModel.comparable(splits,t)!==splitModel.comparable(t.splits,t))changes.splits=splits;}catch(e){row.error=e instanceof SyntaxError?'Unreadable split allocations.':e.message;row.pulseBlocked=true;continue;}}
  if(changes.category!==undefined&&(t.splits?.length||t.transferLinkId||t.repaymentOriginal||t.sharedClaimId)&&!changes.splits){row.error='This transaction has splits or linked payments. Edit its category in transaction details.';row.pulseBlocked=true;continue;}
  row.update={transactionId:t.id,baseline:snapshot(t),before:{...Object.fromEntries(fields.map(k=>[k,k==='merchant'?t.displayName||t.merchant||'':t[k]||''])),splits:t.splits||[]},changes};
  row.transaction={...t};row.error='';row.include=!row.excluded&&Object.keys(changes).length>0;
  if(row.include)row.proposals.push({id:require('node:crypto').randomUUID(),changes,reason:'Changes to an existing transaction from the uploaded CSV. Original financial details stay unchanged.',status:'pending'});
 }
 return stage;
}
function plan(db,stage,visible=db.transactions){const allowed=new Set(visible.filter(t=>!t.scopePartial).map(t=>t.id)),result=[];
 for(const row of stage.rows){if(!row.isExistingUpdate||!row.include)continue;if(row.error||row.pulseBlocked||!row.update)throw Error('Exclude invalid Pulse-ID rows before saving.');const t=db.transactions.find(t=>t.id===row.update.transactionId);if(!t||!allowed.has(t.id)||snapshot(t)!==row.update.baseline)throw Error('An existing transaction changed after this preview. Prepare a fresh review before saving.');
  for(const k of ['date','amount','account','person','originalStatement','originalName'])if(JSON.stringify(row.transaction[k]??null)!==JSON.stringify(t[k]??null))throw Error('Existing transaction dates, amounts, accounts, owners and original statements are protected.');
  const changes={},before={};for(const k of fields){const from=k==='merchant'?t.displayName||t.merchant||'':t[k]||'',to=String(k==='merchant'?row.transaction.displayName||row.transaction.merchant||'':row.transaction[k]??'');if(to!==String(from)){changes[k]=to;before[k]=from;}}
  if(splitModel.comparable(row.transaction.splits,t)!==splitModel.comparable(t.splits,t)){changes.splits=splitModel.validate(db,t,row.transaction.splits);before.splits=t.splits||[];}
  if(changes.category!==undefined&&(t.splits?.length||t.transferLinkId||t.repaymentOriginal||t.sharedClaimId)&&!changes.splits)throw Error('Edit split or linked transaction categories in transaction details.');
  if(Object.keys(changes).length)result.push({transaction:t,changes,before});
 }return result;
}
function apply(db,updates,{id,actor,importId,at,isTransferTx}){db.transactionEvents||=[];for(const u of updates){Object.assign(u.transaction,u.changes);if(u.changes.mcc!==undefined){u.transaction.mccSource='suggested';u.transaction.mccEvidence='Accepted import suggestion';}if(u.changes.merchant!==undefined)u.transaction.displayName=u.changes.merchant;if(u.changes.category!==undefined||u.changes.splits!==undefined)u.transaction.isTransfer=isTransferTx({...u.transaction,isTransfer:false});db.transactionEvents.push({id:id(),transactionId:u.transaction.id,kind:'import-update',actor,at,importId,before:u.before,after:u.changes});}return updates.length;}
function decide(stage,decision){if(stage.status!=='staged'||!['accept','reject'].includes(decision))throw Error('Choose accept or reject for a staged import.');let count=0;for(const row of stage.rows){if(!row.update||row.error)continue;for(const p of row.proposals){if(p.status!=='pending')continue;if(Object.keys(p.changes).some(k=>![...fields,'splits'].includes(k)))throw Error('Review unsupported changes individually.');}}for(const row of stage.rows){if(!row.update||row.error)continue;for(const p of row.proposals){if(p.status!=='pending')continue;if(decision==='accept'){Object.assign(row.transaction,p.changes);if(p.changes.merchant!==undefined)row.transaction.displayName=p.changes.merchant;}p.status=decision==='accept'?'accepted':'rejected';count++;}}return count;}
module.exports={annotate,plan,apply,decide};
