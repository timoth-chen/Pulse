'use strict';
// Derive balances from a reported baseline and uniquely matched, posted bill payments.
const cents=n=>Math.round(Number(n)*100),valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'');
function sync(db,today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto'}).format(new Date())){
 const before=JSON.stringify([db.loans,db.balanceHistory]);
 for(const l of db.loans||[]){
  if(!valid(l.balanceAsOf)||!Number.isFinite(Number(l.balance))||l.apr===null||l.apr===undefined||!Number.isFinite(Number(l.apr)))continue;
  let a=l.paymentBalanceAnchor;
  if(!a||cents(l.balance)!==a.computedCents||l.balanceAsOf!==a.computedAsOf||(l.balanceImportId||'')!==a.importId){a=l.paymentBalanceAnchor={balanceCents:cents(l.balance),asOf:l.balanceAsOf,computedCents:cents(l.balance),computedAsOf:l.balanceAsOf,importId:l.balanceImportId||'',nextDueDate:l.nextDueDate};}
  const candidates=[];
  for(const p of db.billPayments||[]){
   const b=(db.bills||[]).find(b=>b.id===p.billId&&b.linkedLoanId===l.id),t=(db.transactions||[]).find(t=>t.id===p.transactionId);
   if(!b||!t||t.pending||t.hidden||!(t.amount<0)||t.date>today||b.person&&b.person!==l.person)continue;
   const date=b.paymentMethod==='chexy'?p.providerDueDate||require('./bill-charge-dates').providerDate(b,p.dueDate):p.dueDate;
   if(!valid(date)||date<=a.asOf||date>today)continue;
   const amount=cents(b.amount);if(!(amount>0)||Math.abs(cents(-t.amount)-cents(require('./bill-cost')(b)))>1)continue;
   candidates.push({date,transactionId:t.id,amount,fee:Math.max(0,cents(-t.amount)-amount)});
  }
  // Never apply ambiguous matches or reuse one charge for more than one installment.
  const rows=candidates.filter(p=>candidates.filter(q=>q.date===p.date||q.transactionId===p.transactionId).length===1).sort((a,b)=>a.date.localeCompare(b.date));
  let balance=a.balanceCents;const payments=[];
  for(const p of rows){if(balance<=0)break;const interest=Math.round(balance*Number(l.apr)/1200),paid=Math.min(p.amount,balance+interest),principal=paid-interest;if(principal<=0)continue;balance-=principal;payments.push({...p,amount:paid/100,fee:p.fee/100,interest:interest/100,principal:principal/100,balance:balance/100,estimated:Number(l.apr)>0});}
  l.balance=balance/100;l.balanceAsOf=payments.at(-1)?.date||a.asOf;a.computedCents=balance;a.computedAsOf=l.balanceAsOf;l.detectedPayments=payments;
  l.nextDueDate=a.nextDueDate;
  if(payments.length&&a.nextDueDate){const from=payments.at(-1).date,until=new Date(from+'T12:00:00Z');until.setUTCMonth(until.getUTCMonth()+2);const dueDates=require('./cash-plan').recurring(a.nextDueDate,'monthly',a.nextDueDate,until.toISOString().slice(0,10)),paidInstallment=dueDates.find(d=>d.slice(0,7)===from.slice(0,7))||from;l.nextDueDate=dueDates.find(d=>d>paidInstallment)||a.nextDueDate;if(l.paymentEndOfMonth){const d=new Date(l.nextDueDate+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1,0);l.nextDueDate=d.toISOString().slice(0,10);}}
  db.balanceHistory=(db.balanceHistory||[]).filter(h=>!(h.key==='loan:'+l.id&&h.source==='loan-payment-ledger'));
  for(const p of payments)db.balanceHistory.push({id:'loan-payment:'+l.id+':'+p.date,key:'loan:'+l.id,at:p.date+'T23:59:59.999Z',balanceCents:cents(p.balance),person:l.person||'',group:'loans',deleted:false,source:'loan-payment-ledger'});
 }
 return before!==JSON.stringify([db.loans,db.balanceHistory]);
}
module.exports={sync};
