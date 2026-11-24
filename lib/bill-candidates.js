'use strict';
const {recurringCandidates}=require('./planning');
const {matches}=require('./account-names');
const normalize=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function candidates(db,today){
 const categories=new Set(['Subscriptions','Phone','Internet & Streaming','Utilities','Insurance','Rent','Mortgage','Auto Payment','Student Loans','Loan Repayment','Financial Fees','Fitness','Child Care']);
 const providers=/\b(financ(?:e|ing)|affirm|klarna|cozey|trupanion|netflix|spotify|adobe|chatgpt|prime|landmark|membership|subscription)\b/i;
 const transactions=db.transactions.filter(t=>!t.pending&&!t.hidden&&t.date<=today&&(categories.has(t.category)||providers.test(t.displayName||t.merchant||''))).map(t=>{
  const account=db.accounts.find(a=>a.id===t.accountId||matches(a,t.account));
  return {...t,merchant:t.displayName||t.merchant,account:account?.name||t.account,person:t.person||account?.person||''};
 });
 const view={...db,transactions};
 return recurringCandidates(view,today).filter(c=>{
  const existing=db.bills.some(b=>b.payFromAccountId===c.accountId&&[b.name,b.matchMerchant,b.detectionKey?.split('|')[0]].some(name=>normalize(name)===normalize(c.name)));
  const loan=db.loans?.some(l=>Number(l.balance)>0&&normalize(l.name)===normalize(c.name));
  return !existing&&!loan;
 }).map(c=>{
  const until=new Date(today+'T12:00:00Z');until.setUTCFullYear(until.getUTCFullYear()+2);
  const next=require('./cash-plan').recurring(c.lastDate,c.frequency,today,until.toISOString().slice(0,10)).find(d=>d>c.lastDate);
  return {...c,proposedDueDate:next||c.nextDueDate,reason:c.variable?'Repeats on a regular schedule; amount varies':'Similar payments on a regular schedule'};
 });
}
module.exports={candidates};
