'use strict';
const bank=require('./canadian-business-days');
const add=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
function occurrences(b,from,to){
 const anchor=b.providerScheduleAnchorDate||b.providerDueDate;if(!anchor)return [];
 return require('./cash-plan').recurring(anchor,b.frequency||'monthly',from,add(to,40)).map(raw=>{
  let provider=raw;if(b.providerEndOfMonth){const d=new Date(raw+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1,0);provider=d.toISOString().slice(0,10);}
  if(b.providerDueDayRule==='next-business-day')provider=bank.next(provider);
  return {providerDueDate:provider,date:bank.shift(provider,-Number(b.chargeLeadBusinessDays??3))};
 }).filter(r=>r.date>=from&&r.date<=to);
}
function providerDate(b,charge){return occurrences(b,charge,charge).find(r=>r.date===charge)?.providerDueDate||'';}
module.exports={occurrences,providerDate};
