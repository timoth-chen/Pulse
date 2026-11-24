'use strict';
const {expand,flowKind,categoryInfo}=require('./categories');
const {periodKey}=require('./cash-flow');
function report(db,q={}){
 const period=q.period||'monthly',grouping=q.grouping||'category';if(!['monthly','quarterly','yearly'].includes(period)||!['category','group','merchant','account','both'].includes(grouping))throw Error('Choose a valid report grouping.');
 const from=String(q.from||''),to=String(q.to||'');for(const date of [from,to])if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw Error('Choose valid report dates.');if(from&&to&&from>to)throw Error('From must be before To.');
 const eligible=expand(db.transactions.filter(t=>!t.pending&&!t.hidden)).filter(t=>flowKind(t,db.categories)!=='transfer');
 const rows=eligible.filter(t=>(!from||t.date>=from)&&(!to||t.date<=to)&&(!q.account||t.account===q.account)&&(!q.category||t.category===q.category));
 if(q.detail!==undefined){
   const selectors=JSON.parse(q.detail);
   const valid=new Set(['category','group','merchant','account']);
   if(!Array.isArray(selectors)||selectors.length>400||selectors.some(item=>
     !item||!valid.has(item.grouping)||typeof item.label!=='string'||!['income','expense'].includes(item.kind)))throw Error('Choose valid chart details.');
   const matching=rows.filter(t=>{
     if(q.kind&&flowKind(t,db.categories)!==q.kind)return false;
     if(!selectors.length)return true;
     const info=categoryInfo(t.category,db.categories),kind=flowKind(t,db.categories);
     return selectors.some(item=>item.kind===kind&&item.label===(
       item.grouping==='group'?info.group:item.grouping==='merchant'?(t.displayName||t.merchant):
       item.grouping==='account'?(t.account||'No account'):t.category));
   }).sort((a,b)=>b.date.localeCompare(a.date));
   return {count:matching.length,net:matching.reduce((sum,t)=>sum+Math.round(t.amount*100),0)/100,
     rows:matching.slice(0,150).map(t=>({date:t.date,merchant:t.displayName||t.merchant,category:t.category,account:t.account,amount:t.amount}))};
 }
 const timeline=new Map(),income=new Map(),expense=new Map();let incomeCents=0,spendingCents=0;
 for(const t of rows){const kind=flowKind(t,db.categories),amount=Math.round(t.amount*100),key=periodKey(t.date,period),point=timeline.get(key)||{key,incomeCents:0,spendingCents:0,count:0};if(kind==='income'){incomeCents+=amount;point.incomeCents+=amount;}else{spendingCents-=amount;point.spendingCents-=amount;}point.count++;timeline.set(key,point);
 const c=categoryInfo(t.category,db.categories),label=grouping==='group'?c.group:grouping==='merchant'?(t.displayName||t.merchant):grouping==='account'?t.account||'No account':t.category,map=kind==='income'?income:expense,node=map.get(label)||{label,group:c.group,color:c.color,icon:grouping==='category'||grouping==='both'?c.icon:'',cents:0};node.cents+=kind==='income'?amount:-amount;map.set(label,node);}
 if(rows.length){const dates=rows.map(t=>t.date).sort();let date=(from||dates[0]).slice(0,7)+'-01',last=to||dates.at(-1);for(let i=0;date<=last&&i<2400;i++){const key=periodKey(date,period);if(!timeline.has(key))timeline.set(key,{key,incomeCents:0,spendingCents:0,count:0});const next=new Date(date+'T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);date=next.toISOString().slice(0,10);}}
 const list=map=>[...map.values()].map(({cents,...r})=>({...r,total:cents/100})).filter(r=>r.total!==0).sort((a,b)=>b.total-a.total);
 return {period,grouping,from,to,summary:{income:incomeCents/100,spending:spendingCents/100,net:(incomeCents-spendingCents)/100,savingsRate:incomeCents>0?Math.round((incomeCents-spendingCents)/incomeCents*1000)/10:null,count:new Set(rows.map(t=>t.id)).size},timeline:[...timeline.values()].sort((a,b)=>a.key.localeCompare(b.key)).map(p=>({key:p.key,income:p.incomeCents/100,spending:p.spendingCents/100,net:(p.incomeCents-p.spendingCents)/100,count:p.count})),income:list(income),expense:list(expense),accounts:[...new Set([...db.accounts.map(a=>a.name),...eligible.map(t=>t.account).filter(Boolean)])].sort().map(name=>({name,id:db.accounts.find(a=>a.name===name)?.id||''})),categories:[...new Set(eligible.map(t=>t.category))].sort(),categoryGroups:Object.fromEntries([...new Set(eligible.map(t=>categoryInfo(t.category,db.categories).group))].map(group=>[group,[...new Set(eligible.filter(t=>categoryInfo(t.category,db.categories).group===group).map(t=>t.category))]])),range:rows.length?{first:rows.map(t=>t.date).sort()[0],last:rows.map(t=>t.date).sort().at(-1)}:null};
}
module.exports={report};
