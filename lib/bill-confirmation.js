'use strict';
function transactionConfirmed(db,p,today){return !!p.transactionId&&(db.transactions||[]).some(t=>t.id===p.transactionId&&!t.pending&&!t.hidden&&Number(t.amount)<0&&t.date<=today);}
function needsConfirmation(db,today){const schedule=require('./bill-schedule'),out=[],seen=new Set();
 const add=r=>{const key=r.billId+':'+(r.dueDate||r.date);if(!seen.has(key)){seen.add(key);out.push(r);}};
 for(const p of db.billPayments||[]){if((p.dueDate||p.date)>=today||transactionConfirmed(db,p,today))continue;const b=(db.bills||[]).find(b=>b.id===p.billId);add({...p,id:p.billId,billId:p.billId,type:'paid',date:p.dueDate||p.date,kind:b?.kind||'fixed',group:b?.billGroup||'personal',status:'unconfirmed',manualConfirmation:true});}
 for(const b of db.bills||[]){if(['paused','cancelled'].includes(b.status))continue;const from=b.startDate||b.scheduleAnchorDate||b.nextDueDate;if(!from||from>=today)continue;for(const on of schedule.dates({...b,nextDueDate:from},from,today)){if(on>=today||!schedule.active(b,on))continue;const payments=(db.billPayments||[]).filter(p=>p.billId===b.id&&p.dueDate===on);if(payments.some(p=>transactionConfirmed(db,p,today)))continue;add({id:b.id,billId:b.id,type:'bill',name:b.name,date:on,dueDate:on,amount:require('./bill-cost')(b),baseAmount:Number(b.amount),processingFee:Math.round(Number(b.amount)*Number(b.processingFeePercent||0))/100,kind:b.kind||'fixed',group:b.billGroup||'personal',accountId:b.payFromAccountId||'',paymentMethod:b.paymentMethod||'',providerDueDate:b.paymentMethod==='chexy'?require('./bill-charge-dates').providerDate(b,on):'',status:'unconfirmed'});}}
 return out.sort((a,b)=>a.date.localeCompare(b.date)||String(a.name).localeCompare(String(b.name)));
}
module.exports={transactionConfirmed,needsConfirmation};
