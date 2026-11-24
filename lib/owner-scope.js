'use strict';
const ownerKey = value => {
  const key=String(value||'').trim().toLowerCase();
  if(!key||key==='__unassigned__'||key==='unassigned')return '__unassigned__';
  if(['joint','household','household / joint','__joint__'].includes(key))return '__joint__';
  return key;
};
const ownerMatches=(person,selected)=>!selected||(Array.isArray(person)?(ownerKey(selected)==='__joint__'?(person.length>1||person.some(p=>ownerKey(p)==='__joint__')):person.some(p=>ownerKey(p)===ownerKey(selected))):ownerKey(person)===ownerKey(selected));
function recordOwners(record,db){if(record.owners?.length)return record.owners;if(record.person?.trim())return [record.person];const account=db.accounts.find(a=>a.id===(record.accountId||record.payFromAccountId)||a.name===record.account);return account?.owners?.length?account.owners:[account?.person||''];}
function recordOwner(record,db){
  if(record.person?.trim())return record.person;
  const account=db.accounts.find(a=>a.id===(record.accountId||record.payFromAccountId)||a.name===record.account);
  return account?.person||'';
}
function scopedDb(db,selected){
  if(!selected)return db;
  const match=row=>ownerMatches(recordOwners(row,db),selected);
  const transactions=db.transactions.flatMap(t=>{
    if(t.splits?.length){
      const splits=t.splits.filter(p=>match({...t,...p}));if(!splits.length){const claim=(db.reimbursements||[]).find(c=>c.transactionId===t.id&&ownerMatches(c.creditor,selected));return claim?[{...t,splits:undefined,bankAmount:t.amount,person:selected,scopePartial:true,scopeReimbursement:true}]:[];}
      return [{...t,bankAmount:t.amount,person:recordOwner({...t,...splits[0]},db),amount:Math.round(splits.reduce((s,p)=>s+p.amount,0)*100)/100,splits,scopePartial:splits.length!==t.splits.length}];
    }
    return match(t)?[{...t,person:recordOwners(t,db).length>1&&ownerKey(selected)!=='__joint__'?selected:recordOwner(t,db)}]:[];
  });
  const transfers=db.transfers.filter(t=>t.kind==='account'
    ?[t.fromAccountId,t.toAccountId].some(id=>db.accounts.some(a=>a.id===id&&match(a)))
    :ownerMatches(t.fromPerson,selected)||ownerMatches(t.toPerson,selected));
  const scoped={...db,transactions,transfers};
  for(const key of ['accounts','loans','holdings','bills','budgets','buckets','scenarios','investmentActivities','otherInvestments','payrollRecords'])scoped[key]=(db[key]||[]).filter(match);
  const transactionIds=new Set(transactions.map(t=>t.id));scoped.transactionAttachments=(db.transactionAttachments||[]).filter(a=>transactionIds.has(a.transactionId));
  const goalIds=new Set(scoped.buckets.map(g=>g.id));scoped.goalEvents=(db.goalEvents||[]).filter(e=>goalIds.has(e.goalId));
  scoped.reimbursements=(db.reimbursements||[]).filter(c=>ownerMatches(c.creditor,selected)||ownerMatches(c.debtor,selected));const claimIds=new Set(scoped.reimbursements.map(c=>c.id));scoped.repaymentAllocations=(db.repaymentAllocations||[]).filter(a=>claimIds.has(a.claimId));scoped.transferLinks=(db.transferLinks||[]).filter(l=>[l.fromAccountId,l.toAccountId].some(id=>scoped.accounts.some(a=>a.id===id)));
  scoped.billPayments=(db.billPayments||[]).filter(match);
  scoped.balanceHistory=(db.balanceHistory||[]).filter(h=>ownerMatches(h.owners?.length?h.owners:h.person,selected));
  scoped.balanceImports=(db.balanceImports||[]).map(i=>({...i,mapping:i.mapping.filter(m=>ownerMatches(m.owner,selected))})).filter(i=>i.mapping.length);
  const importIds=new Set(scoped.balanceImports.map(i=>i.id));
  scoped.balanceImportRows=(db.balanceImportRows||[]).filter(r=>importIds.has(r.importId)&&scoped.balanceImports.some(i=>i.id===r.importId&&i.mapping.some(m=>m.name===r.accountName)));
  return scoped;
}
function ownerOptions(db){
  const names=new Map();let unassigned=false,joint=false;
  const consider=name=>{const key=ownerKey(name);if(key==='__joint__')joint=true;else if(key==='__unassigned__')unassigned=true;else if(!names.has(key))names.set(key,{value:String(name).trim(),label:String(name).trim()});};
  for(const u of db.users||[])if(u.name)consider(u.name);
  for(const key of ['accounts','loans','holdings','bills','budgets','buckets','transactions'])for(const row of db[key]||[]){for(const name of recordOwners(row,db))consider(name);if(row.owners?.length>1)joint=true;for(const p of row.splits||[])consider(recordOwner({...row,...p},db));}
  const result=[...names.values()].sort((a,b)=>a.label.localeCompare(b.label));
  if(joint)result.push({value:'__joint__',label:'Joint'});

  return result;
}
module.exports={ownerKey,ownerMatches,recordOwner,recordOwners,scopedDb,ownerOptions};
