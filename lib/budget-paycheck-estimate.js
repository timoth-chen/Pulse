'use strict';
// A planning estimate only: never creates income transactions or saved allocations.
const {expand,categoryInfo}=require('./categories');
function estimatePlans(db,month,today){
 if(month<today.slice(0,7))return [];
 const cutoff=today.slice(0,7),periods=[];
 for(let n=1;n<=3;n++){const d=new Date(cutoff+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-n);periods.push(d.toISOString().slice(0,7));}
 const payrollPlans=require('./payroll-forecast').monthlyPlans(db,month,today);
 const byOwner=new Map();
 for(const t of expand((db.transactions||[]).filter(t=>!t.pending&&!t.hidden))){
  if(t.category!=='Paychecks'||Number(t.amount)<=0||!periods.includes(t.date.slice(0,7)))continue;
  const owner=t.person||(db.accounts||[]).find(a=>a.name===t.account)?.person||'';
  if(!byOwner.has(owner))byOwner.set(owner,new Map());const totals=byOwner.get(owner),key=t.date.slice(0,7);
  totals.set(key,(totals.get(key)||0)+Math.round(t.amount*100));
 }
 const active=b=>(!b.startMonth||b.startMonth<=month)&&(!b.endMonth||b.endMonth>=month);
 const forecasts=new Map();for(const plan of payrollPlans){const previous=forecasts.get(plan.person)||{amount:0,paydays:[]};previous.amount=Math.round((previous.amount+plan.amount)*100)/100;previous.paydays.push(...plan.paydays);forecasts.set(plan.person,previous);if(!byOwner.has(plan.person))byOwner.set(plan.person,new Map());}
 return [...byOwner].flatMap(([person,totals])=>{
  if(totals.size<2&&!forecasts.has(person))return [];
  const manual=(db.budgets||[]).some(b=>active(b)&&(!b.person||b.person===person)&&(b.targetType==='parent'?(b.budgetType==='income'&&b.category===categoryInfo('Paychecks',db.categories).group):b.category==='Paychecks'));
  if(manual)return [];
  const schedule=forecasts.get(person),amount=schedule?schedule.amount:Math.round([...totals.values()].reduce((a,b)=>a+b,0)/totals.size)/100;
  return [{id:'estimated-paychecks:'+person,category:'Paychecks',targetType:'category',budgetType:'income',person,monthlyLimit:amount,startMonth:month,endMonth:month,group:'Flexible',source:schedule?'payroll-schedule':'paycheck-average',estimated:true,estimateMonths:totals.size,estimateLabel:schedule?'Pay schedule · latest verified pay':''}];
 });
}
module.exports={estimatePlans};
