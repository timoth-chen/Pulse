'use strict';
const {financialSummary,flowKind}=require('./categories');
const cents=n=>Math.round(Number(n||0)*100),money=n=>Math.round(n)/100;
const transfer=t=>t.manualTransfer!==undefined?t.manualTransfer:!!t.isTransfer||/transfer|credit card payment|balance adjustment/i.test(t.category||'')||t.category?.toLowerCase()==='payment';
const portions=(transactions,settings=[])=>transactions.filter(t=>!t.pending&&!t.hidden).flatMap(t=>t.splits?.length?t.splits.map(s=>({...t,...s,splits:undefined})):t).filter(t=>flowKind(t,settings)!=='transfer');
function addMonth(month,n){const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,7);}
function validMonth(month){return /^\d{4}-(0[1-9]|1[0-2])$/.test(month||'');}
function budgetMonth(db,month){
 if(!validMonth(month))throw Error('Choose a valid month.');
 if(db.budgets.some(b=>b.targetType||b.planHistory)){const data=require('./budget-workspace').workspace(db,month),rows=[];for(const f of data.families.filter(f=>f.type==='expense')){for(const c of f.children.filter(c=>!c.unplanned))rows.push({...c,spent:c.actual,pct:c.available>0?Math.round(c.actual/c.available*100):c.actual?100:0});if(f.parent){rows.push({...f.parent,category:f.group,planned:f.planned,spent:f.actual,available:f.available,remaining:f.remaining,pct:f.available>0?Math.round(f.actual/f.available*100):0});for(const c of data.catalog.filter(c=>c.group===f.group&&c.type==='expense'&&!rows.some(r=>r.category===c.name&&r.person===f.person)))rows.push({...f.parent,category:c.name,parentCategory:f.group,planned:f.planned,spent:f.actual,available:f.available,remaining:f.remaining});}}return {month,rows,income:data.totals.actualIncome,spending:data.totals.actualExpenses,planned:data.totals.plannedExpenses,unbudgeted:data.totals.unplannedSpending};}
 const transactions=portions(db.transactions,db.categories),rows=[];
 const matchesBudget=(b,t)=>t.category===b.category&&(!b.person||String(t.person||db.accounts.find(a=>a.name===t.account)?.person||'').toLowerCase()===b.person.toLowerCase());
 for(const b of db.budgets){
  const start=b.startMonth||month;if(start>month)continue;
  const matches=t=>matchesBudget(b,t);
  const spend=m=>transactions.filter(t=>t.date.startsWith(m)&&flowKind(t,db.categories)==='expense'&&matches(t)).reduce((n,t)=>n-cents(t.amount),0);
  const limit=m=>cents(b.overrides?.[m]??b.monthlyLimit);
  let carry=0,guard=0;if(b.rollover)for(let m=start;m<month&&guard++<1200;m=addMonth(m,1))carry+=limit(m)-spend(m);
  const planned=limit(month),spent=spend(month),available=planned+carry;
  rows.push({...b,planned:money(planned),carry:money(carry),available:money(available),spent:money(spent),remaining:money(available-spent),pct:available>0?Math.round(spent/available*100):spent?100:0});
 }
 const summary=financialSummary(transactions.filter(t=>t.date.startsWith(month)),db.categories),income=cents(summary.income),spending=cents(summary.spending);
 return {month,rows,income:money(income),spending:money(spending),planned:money(rows.reduce((n,r)=>n+cents(r.planned),0)),unbudgeted:money(transactions.filter(t=>t.date.startsWith(month)&&flowKind(t,db.categories)==='expense'&&!rows.some(b=>matchesBudget(b,t))).reduce((n,t)=>n-cents(t.amount),0))};
}
function recurringCandidates(db,today){
 const groups=new Map();for(const t of db.transactions){if(t.pending||t.hidden||t.amount>=0||flowKind(t,db.categories)==='transfer')continue;const key=[t.merchant.trim().toLowerCase(),t.account,t.person||''].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
 const candidates=[];
 for(const [key,all]of groups){const txs=all.sort((a,b)=>a.date.localeCompare(b.date)),dates=[...new Set(txs.map(t=>t.date))];if(dates.length<3)continue;
 const gaps=dates.slice(1).map((d,i)=>(Date.parse(d)-Date.parse(dates[i]))/86400000).filter(n=>n>0).slice(-8).sort((a,b)=>a-b),median=gaps[Math.floor(gaps.length/2)];
 const bands=[['weekly',7,2],['biweekly',14,3],['monthly',30.44,6],['quarterly',91.3,12],['semiannual',182.6,18],['yearly',365.25,25]],band=bands.find(([,d,t])=>Math.abs(median-d)<=t);if(!band)continue;
 const consistency=gaps.filter(g=>Math.abs(g-band[1])<=band[2]).length/gaps.length;if(consistency<.65)continue;
 const last=txs.at(-1),lastDate=dates.at(-1),recent=txs.slice(-6).map(t=>Math.abs(t.amount)).sort((a,b)=>a-b),amount=recent[Math.floor(recent.length/2)];
 const next=new Date(lastDate+'T12:00:00Z');if(band[0]==='monthly'||band[0]==='quarterly'||band[0]==='semiannual'||band[0]==='yearly'){const day=next.getUTCDate();next.setUTCDate(1);next.setUTCMonth(next.getUTCMonth()+({monthly:1,quarterly:3,semiannual:6,yearly:12}[band[0]]));const end=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate();next.setUTCDate(Math.min(day,end));}else next.setUTCDate(next.getUTCDate()+band[1]);
 const stale=(Date.parse(today)-Date.parse(lastDate))/86400000>band[1]*2;
 if(db.bills.some(b=>b.detectionKey===key||b.name.toLowerCase()===last.merchant.toLowerCase()&&b.payFromAccountId===db.accounts.find(a=>a.name===last.account)?.id))continue;
 candidates.push({key,name:last.merchant,person:last.person||db.accounts.find(a=>a.name===last.account)?.person||'',account:last.account,accountId:db.accounts.find(a=>a.name===last.account)?.id||'',category:last.category,frequency:band[0],amount:Math.round(amount*100)/100,lastAmount:Math.abs(last.amount),previousAmount:txs.length>1?Math.abs(txs.at(-2).amount):null,lastDate,nextDueDate:next.toISOString().slice(0,10),occurrences:dates.length,consistency:Math.round(consistency*100),stale,variable:recent.at(-1)-recent[0]>Math.max(2,amount*.1)});
 }
 return candidates.sort((a,b)=>Number(a.stale)-Number(b.stale)||b.lastDate.localeCompare(a.lastDate));
}
function coverage(db){const transactions=db.transactions,monthly=new Map(),accounts=new Map();for(const t of transactions){const month=t.date.slice(0,7);monthly.set(month,(monthly.get(month)||0)+1);const a=accounts.get(t.account)||{account:t.account,count:0,first:t.date,last:t.date,pending:0};a.count++;a.first=t.date<a.first?t.date:a.first;a.last=t.date>a.last?t.date:a.last;a.pending+=t.pending?1:0;accounts.set(t.account,a);}return {count:transactions.length,pending:transactions.filter(t=>t.pending).length,unreviewed:transactions.filter(t=>!t.reviewed).length,uncategorized:transactions.filter(t=>t.category==='Uncategorized').length,first:transactions.reduce((d,t)=>!d||t.date<d?t.date:d,''),last:transactions.reduce((d,t)=>t.date>d?t.date:d,''),monthly:[...monthly].sort(([a],[b])=>a.localeCompare(b)).map(([month,count])=>({month,count})),accounts:[...accounts.values()].sort((a,b)=>a.account.localeCompare(b.account)),completeness:'Not verified. Missing transactions cannot be inferred from balance history.'};}
module.exports={budgetMonth,recurringCandidates,coverage,portions,validMonth,addMonth};
