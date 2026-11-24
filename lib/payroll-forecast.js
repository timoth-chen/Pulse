'use strict';
const {recurring}=require('./cash-plan');
function predict(db,owner,employer,date,end){const records=(db.payrollRecords||[]).filter(r=>r.person===owner&&(!employer||r.employer===employer)&&r.payDate<=date&&Number(r.current?.net)>0).sort((a,b)=>b.payDate.localeCompare(a.payDate)||String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')));if(!records.length)return {warning:'No saved pay statement for '+owner+'. Upload one in Payroll or use a manual pay estimate.'};const employers=[...new Set(records.map(r=>r.employer))];if(!employer&&employers.length>1)return {warning:'Choose an employer for your payroll estimate.',employers};const latest=records[0],history=records.filter(r=>r.employer===latest.employer);let frequency=({52:'weekly',26:'biweekly',12:'monthly'})[latest.frequency];if(!frequency&&history.length>=3){const gaps=[0,1].map(i=>(Date.parse(history[i].payDate)-Date.parse(history[i+1].payDate))/86400000);if(gaps.every(n=>n===14))frequency='biweekly';else if(gaps.every(n=>n===7))frequency='weekly';}if(!frequency)return {warning:'Pay frequency needs review in Payroll; select weekly, biweekly or monthly, or use a manual estimate.'};const dates=recurring(latest.payDate,frequency,date,end).filter(d=>d>latest.payDate),age=Math.floor((Date.parse(date)-Date.parse(latest.payDate))/86400000);return {owner,employer:latest.employer,recordId:latest.id,sourceDate:latest.payDate,amount:latest.current.net,hourlyRate:latest.hourlyRate??null,regularHours:latest.regularHours??null,frequency,dates,nextDate:dates[0]||'',nonBusinessDates:dates.filter(d=>!require('./canadian-business-days').isBusinessDay(d)),basis:'Latest verified net pay',warning:age>45?'Latest statement is '+age+' days old. Pay is estimated from that statement; upload a recent one if your pay changed.':''};}
function schedules(db,date,end,owner='',employer=''){
 const pairs=[...new Map((db.payrollRecords||[]).filter(r=>(!owner||r.person===owner)&&(!employer||r.employer===employer)&&r.payDate<=date).map(r=>[[r.person,r.employer].join('\0'),[r.person,r.employer]])).values()];
 return pairs.map(([person,company])=>predict(db,person,company,date,end));
}
function monthlyPlans(db,month,today){
 const from=month+'-01',d=new Date(from+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);const end=d.toISOString().slice(0,10);
 const result=[];
 for(const p of schedules(db,today,end)){
  if(!p.amount)continue;const latest=(db.payrollRecords||[]).find(r=>r.id===p.recordId),anchor=latest.payDate;
  let back=anchor;const step=p.frequency==='weekly'?7:14;
  if(p.frequency!=='monthly')while(back>from){const x=new Date(back+'T12:00:00Z');x.setUTCDate(x.getUTCDate()-step);back=x.toISOString().slice(0,10);}else{const x=new Date(from+'T12:00:00Z');x.setUTCDate(Math.min(Number(anchor.slice(8)),d.getUTCDate()));back=x.toISOString().slice(0,10);}
  const paydays=recurring(back,p.frequency,from,end);
  const amount=paydays.reduce((n,date)=>{const known=(db.payrollRecords||[]).find(r=>r.person===p.owner&&r.employer===p.employer&&r.payDate===date);return n+Math.round((known?.current.net??p.amount)*100);},0)/100;
  result.push({person:p.owner,employer:p.employer,amount,paydays,sourceDate:p.sourceDate});
 }
 return result;
}
module.exports={predict,schedules,monthlyPlans};
