 'use strict';
const names=require('./account-names');
const cents=v=>Math.round(Number(v)*100),validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'');
function sync(db,today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())){let changed=0;for(const a of db.accounts||[]){if(!['credit','checking','savings','cash'].includes(a.type)||!Number.isFinite(Number(a.balance)))continue;let anchor=a.transactionBalanceAnchor;
 // An explicit balance edit or a new balance export establishes a fresh end-of-day baseline.
 if(!anchor||cents(a.balance)!==anchor.computedCents||a.balanceAsOf!==anchor.reportedAsOf||(a.balanceImportId||'')!==anchor.balanceImportId){if(!validDate(a.balanceAsOf))continue;anchor=a.transactionBalanceAnchor={balanceCents:cents(a.balance),asOf:a.balanceAsOf,reportedAsOf:a.balanceAsOf,balanceImportId:a.balanceImportId||'',computedCents:cents(a.balance)};}
 const rows=(db.transactions||[]).filter(t=>(t.accountId===a.id||names.matches(a,t.account))&&!t.pending&&validDate(t.bankPostedDate||t.date)&&(t.bankPostedDate||t.date)>anchor.asOf&&(t.bankPostedDate||t.date)<=today&&Number.isFinite(t.amount));const delta=rows.reduce((sum,t)=>sum+cents(t.amount),0),next=anchor.balanceCents+(a.type==='credit'?-delta:delta);if(cents(a.balance)!==next){a.balance=next/100;changed++;}anchor.computedCents=next;anchor.through=rows.reduce((date,t)=>(t.bankPostedDate||t.date)>date?(t.bankPostedDate||t.date):date,anchor.asOf);anchor.transactionCount=rows.length;
 }return changed;}
function rebuild(db,accountId,{openingBalance=0,before}={}){const a=db.accounts.find(a=>a.id===accountId);if(!a||!validDate(before)||!Number.isFinite(openingBalance))throw Error('Choose an account, opening balance and baseline date.');a.transactionBalanceAnchor={balanceCents:cents(openingBalance),asOf:before,reportedAsOf:a.balanceAsOf,balanceImportId:a.balanceImportId||'',computedCents:cents(a.balance),source:'confirmed-transaction-rebuild'};return sync(db);}
function history(db,today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())){
 let result=[...(db.balanceHistory||[])];
 for(const a of db.accounts||[]){
  const anchor=a.transactionBalanceAnchor;
  if(!anchor||!validDate(anchor.asOf)||!['credit','checking','savings','cash'].includes(a.type))continue;
  const key='account:'+a.id;
  const transactions=(db.transactions||[]).filter(t=>
    (t.accountId===a.id||names.matches(a,t.account))&&!t.pending&&
    validDate(t.bankPostedDate||t.date)&&Number.isFinite(t.amount));
  const date=t=>t.bankPostedDate||t.date;
  let start=anchor.asOf,value=anchor.balanceCents,source='transaction-ledger';
  const statement=a.statementBalance,statementDate=a.statementBalanceAsOf;
  // Backfill a chart only when the statement and its posted activity reconcile exactly to the saved anchor.
  if(a.type==='credit'&&anchor.source!=='confirmed-transaction-rebuild'&&
      statement!==null&&statement!==undefined&&statement!==''&&Number.isFinite(Number(statement))&&
      validDate(statementDate)&&statementDate===a.statementCloseDate&&statementDate<start){
    const reconciled=cents(statement)-transactions.filter(t=>date(t)>statementDate&&date(t)<=start)
      .reduce((sum,t)=>sum+cents(t.amount),0);
    if(reconciled===anchor.balanceCents){
      start=statementDate;value=cents(statement);source='statement-ledger';
      const snapshots=result.filter(point=>point.key===key&&!point.deleted&&point.source!=='transaction-ledger'&&
        point.at.slice(0,10)<statementDate).sort((left,right)=>right.at.localeCompare(left.at));
      if(snapshots.length){
        const lastBalance=snapshots[0].balanceCents;
        // Repeated exports can hold a stale balance. Reuse only the earliest point in that run
        // when its subsequent posted activity also reconciles to the statement.
        let first=snapshots[0];
        for(const point of snapshots){if(point.balanceCents!==lastBalance)break;first=point;}
        const firstDay=first.at.slice(0,10);
        const activity=transactions.filter(t=>date(t)>firstDay&&date(t)<=statementDate);
        if(activity.length&&lastBalance-activity.reduce((sum,t)=>sum+cents(t.amount),0)===value){
          start=firstDay;value=lastBalance;
        }
      }
    }
  }
  if(source==='transaction-ledger'&&anchor.source!=='confirmed-transaction-rebuild'){
    const original=result.filter(point=>point.key===key&&!point.deleted&&point.source!=='transaction-ledger'&&
      point.at.slice(0,10)<start).sort((left,right)=>right.at.localeCompare(left.at));
    // When imports repeated a stale snapshot, rebuild only if the original run and latest balance agree.
    if(original.length){
      const last=original[0];
      let first=last;
      for(const point of original){if(point.balanceCents!==last.balanceCents)break;first=point;}
      const firstDay=first.at.slice(0,10);
      const activity=transactions.filter(t=>date(t)>firstDay&&date(t)<=start);
      const movement=activity.reduce((sum,t)=>sum+cents(t.amount),0)*(a.type==='credit'?-1:1);
      if(activity.length&&last.balanceCents+movement===value){
        start=firstDay;value=last.balanceCents;source='snapshot-ledger';
      }
    }
  }
  result=result.filter(h=>h.key!==key||(h.at.slice(0,10)<start&&anchor.source!=='confirmed-transaction-rebuild'));
  const days=new Map();
  if(source!=='transaction-ledger'&&anchor.asOf<=today)days.set(anchor.asOf,0);
  if(source==='statement-ledger'&&statementDate>start&&statementDate<=today)days.set(statementDate,0);
  for(const t of transactions){
    const posted=date(t);
    if(posted<=start||posted>today)continue;
    days.set(posted,(days.get(posted)||0)+cents(t.amount));
  }
  const point=day=>({id:'ledger:'+a.id+':'+day,key,at:day+'T23:59:59.999Z',balanceCents:value,person:a.person||'',owners:a.owners,group:a.type==='credit'?'credit':'cash',deleted:false,source,baselineDate:start});
  if(start<=today)result.push(point(start));
  for(const [day,delta] of [...days].sort(([a],[b])=>a.localeCompare(b))){
    value+=a.type==='credit'?-delta:delta;
    result.push(point(day));
  }
 }
 return result.sort((a,b)=>a.at.localeCompare(b.at));}
function recordHistory(db,today){const derived=history(db,today).filter(h=>h.source==='transaction-ledger'),ids=new Set(derived.map(h=>h.id));db.balanceHistory=(db.balanceHistory||[]).filter(h=>h.source!=='transaction-ledger'||!ids.has(h.id));const currentKeys=new Map((db.accounts||[]).filter(a=>a.transactionBalanceAnchor).map(a=>['account:'+a.id,a.transactionBalanceAnchor.asOf]));db.balanceHistory=db.balanceHistory.filter(h=>h.source!=='transaction-ledger'||!currentKeys.has(h.key)||h.at.slice(0,10)<currentKeys.get(h.key));db.balanceHistory.push(...derived);db.balanceHistory.sort((a,b)=>a.at.localeCompare(b.at));}
module.exports={sync,rebuild,history,recordHistory};
