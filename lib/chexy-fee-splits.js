'use strict';
const cents=n=>Math.round(Number(n)*100);
function preview(db){const out=[];for(const t of db.transactions||[]){if(!(t.amount<0)||t.pending||t.hidden||t.splits?.length||t.manualTransfer||t.transferLinkId||t.repaymentOriginal||t.sharedClaimId||(db.reimbursements||[]).some(r=>r.transactionId===t.id)||!/chexy/i.test([t.merchant,t.displayName,t.originalName,t.originalStatement].join(' ')))continue;
 const account=(db.accounts||[]).find(a=>a.id===t.accountId||require('./account-names').matches(a,t.account)),owner=t.person||account?.person||'';
 const matches=(db.bills||[]).filter(b=>b.paymentMethod==='chexy'&&Number(b.processingFeePercent)>0&&b.person===owner&&b.category===t.category&&Math.abs(cents(require('./bill-cost')(b))+cents(t.amount))<=1);
 if(matches.length!==1)continue;const b=matches[0],base=cents(b.amount),fee=-cents(t.amount)-base;if(!(base>0&&fee>0))continue;
 out.push({transactionId:t.id,billId:b.id,splits:[{category:b.category,person:owner,amount:-base/100,note:'Provider amount'},{category:'Financial Fees',person:owner,amount:-fee/100,note:'Chexy processing fee'}]});
 }return out;}
function apply(db,{id,actor='Pulse'}){const rows=preview(db);db.transactionEvents||=[];for(const row of rows){const t=db.transactions.find(t=>t.id===row.transactionId),before=structuredClone(t);t.splits=row.splits;db.transactionEvents.push({id:id(),transactionId:t.id,kind:'chexy-fee-split',actor,at:new Date().toISOString(),before,after:structuredClone(t)});}return rows;}
module.exports={preview,apply};
