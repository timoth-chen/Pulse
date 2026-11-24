'use strict';
const {validDate}=require('./payroll');
const {ownerMatches,recordOwners}=require('./owner-scope');
const {recurring}=require('./cash-plan');
const cashTypes=['checking','savings','cash'];
const canSeeTransfer=(row,viewer)=>!row.contact||viewer===(row.fromPerson||row.toPerson);
const visible=(row,owner,viewer)=>canSeeTransfer(row,viewer)&&(!owner||ownerMatches(row.fromPerson,owner)||ownerMatches(row.toPerson,owner));
function occurrences(db,from,to,owner='',viewer=''){
 return (db.scheduledTransfers||[]).filter(row=>row.date&&visible(row,owner,viewer)).flatMap(row=>
  recurring(row.date,row.frequency,from,row.endDate&&row.endDate<to?row.endDate:to).map(date=>({row,date,paid:(row.paidDates||[]).includes(date)})));
}
function fundingEvents(db,accountId,from,to,viewer){
 return occurrences(db,from,to,'',viewer).filter(({row,paid})=>!paid&&(row.fromAccountId===accountId||row.toAccountId===accountId))
  .map(({row,date})=>({id:row.id+':'+date,date,frequency:'once',label:row.label,kind:row.toAccountId===accountId?'incoming':'custom',amount:(row.toAccountId===accountId?1:-1)*row.amount}));
}
function install(app,{requireAuth,getDb,readDb,saveDb,id}){
 const route='/api/cash-calendar';
 app.get(route,requireAuth,(req,res)=>{
  const {month,today}=req.query,owner=String(req.query.scopeOwner||'');
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||'')||!validDate(today))return res.status(400).json({error:'Choose a valid month and date.'});
  const from=month+'-01',end=new Date(from+'T12:00:00Z');end.setUTCMonth(end.getUTCMonth()+1,0);
  const to=end.toISOString().slice(0,10),start=today>from?today:from,db=getDb(),view=readDb(req);
  const accounts=db.accounts.filter(a=>!a.archived&&cashTypes.includes(a.type)).map(a=>({id:a.id,name:a.name,type:a.type,owners:recordOwners(a,db)}));
  const events=occurrences(db,from,to,owner,req.user.name).map(({row,date,paid})=>({
   id:row.id,date,paid,label:row.label,category:row.category||'',amount:row.amount,kind:row.contact?'Outside e-transfer':'Household e-transfer',
   direction:(owner||row.contact&&req.user.name)===row.fromPerson?'out':(owner||row.contact&&req.user.name)===row.toPerson?'in':'shared',fromPerson:row.fromPerson||row.contact,toPerson:row.toPerson||row.contact
  }));
  if(start<=to){
   const days=1+Math.round((Date.parse(to)-Date.parse(start))/86400000);
   const bills=require('./bill-schedule').agenda(view,start,days).upcoming;
   for(const bill of bills){
    if(bill.date<from||bill.date>to)continue;
    const account=view.accounts.find(a=>a.id===bill.accountId);
    const card=bill.type==='bill'&&account?.type==='credit';
    const source=bill.type==='bill'?view.bills.find(row=>row.id===bill.id):null;
    events.push({
     date:bill.date,label:bill.name,amount:bill.amount,direction:card?'card':'out',
     kind:card?'Charge to card':bill.type==='credit-card'?'Card payment':bill.type==='loan'?'Loan payment':'Bill',
     paymentAccount:account?.name,category:source?.category,estimated:!!bill.estimate,
     paymentMethod:bill.paymentMethod,providerDueDate:bill.providerDueDate,
     statementCloseDate:bill.statementCloseDate
    });
   }
   for(const pay of require('./payroll-forecast').schedules(view,today,to,owner)){
    for(const date of pay.dates||[])if(date>=from)events.push({date,label:pay.employer+' · '+pay.owner,amount:pay.amount,direction:'in',kind:'Estimated pay'});
   }
  }
  const contacts={from:new Set(),to:new Set()},purposes=new Map();
  const addPurpose=value=>{
   const name=String(value||'').trim(),key=name.toLowerCase();
   if(name&&name.length<=120&&!purposes.has(key))purposes.set(key,name);
  };
  for(const bill of view.bills||[])addPurpose(bill.name);
  for(const row of (db.scheduledTransfers||[]).filter(row=>visible(row,owner,req.user.name)))if(row.contact)contacts[row.fromPerson?'to':'from'].add(row.contact);
  for(const t of [...view.transactions].sort((a,b)=>b.date.localeCompare(a.date))){
   const name=String(t.displayName||t.merchant||'').trim();
   const generic=/^(e[- ]?transfer|interac|transfer|cash received|payment)(\s|$)/i.test(name);
   if(!t.hidden&&!t.isTransfer&&!generic)addPurpose(name);
   if(!t.pending&&!t.hidden&&name&&name.length<=120&&!generic&&
     /interac|e[- ]?transfer/i.test([t.originalStatement,t.originalName,t.notes,t.transactionType].join(' '))&&t.amount)contacts[t.amount>0?'from':'to'].add(name);
  }
  const unscheduled=(db.scheduledTransfers||[]).filter(row=>!row.date&&visible(row,owner,req.user.name));
  const transfers=(db.scheduledTransfers||[]).filter(row=>events.some(event=>event.id===row.id));
  res.json({events,unscheduled,transfers,purposes:[...purposes.values()],accounts,people:db.users.map(user=>user.name),contacts:{from:[...contacts.from].slice(0,25),to:[...contacts.to].slice(0,25)},
   categories:require('./categories').categoryCatalog(db).filter(c=>['expense','income'].includes(c.type))});
 });
 function saveTransfer(req,res){
  const db=getDb();
  const existing=req.params.id?db.scheduledTransfers.find(row=>row.id===req.params.id&&canSeeTransfer(row,req.user.name)):null;
  if(req.params.id&&!existing)return res.status(404).json({error:'This transfer is unavailable.'});
  const input={...existing,...req.body};
  const {date,fromPerson,toPerson,fromAccountId='',toAccountId='',frequency='once',endDate=null}=input;
  if(endDate&&(!validDate(endDate)||!validDate(date)||endDate<date||frequency==='once')){
   return res.status(400).json({error:'Choose an end date on or after the first payment date for a repeating transfer.'});
  }
  if(endDate&&existing?.paidDates?.some(paid=>paid>endDate)){
   return res.status(400).json({error:'The end date must include all recorded payments.'});
  }
  if(existing?.paidDates?.length&&(date!==existing.date||frequency!==existing.frequency)){
   return res.status(400).json({error:'Undo recorded payments before changing the transfer schedule.'});
  }
  const label=String(input.label||'').trim(),amount=Number(input.amount);
  const contact=String(input.contact||'').trim();
  const category=String(input.category||'').trim();
  if(category&&category!==existing?.category&&!require('./categories').categoryCatalog(db).some(c=>c.name===category&&['expense','income'].includes(c.type)))return res.status(400).json({error:'Choose an existing category.'});
  const external=!fromPerson||!toPerson;
  const validSide=(person,accountId)=>!person?external&&!accountId:db.users.some(u=>u.name===person)&&(!accountId||db.accounts.some(a=>a.id===accountId&&!a.archived&&cashTypes.includes(a.type)&&ownerMatches(recordOwners(a,db),person)));
  if(!label||label.length>120||(date!==null&&!validDate(date))||(date===null&&frequency!=='once')||!Number.isFinite(amount)||amount<=0||amount>1e9||(!fromPerson&&!toPerson)||fromPerson===toPerson||(external&&(!contact||contact.length>120||(fromPerson||toPerson)!==req.user.name))||
   (fromAccountId&&fromAccountId===toAccountId)||!['once','weekly','biweekly','monthly','quarterly','yearly'].includes(frequency)||
   !validSide(fromPerson,fromAccountId)||!validSide(toPerson,toAccountId))return res.status(400).json({error:'Enter an amount and different payer and recipient. Payment accounts must belong to the person on that side.'});
  const row={id:existing?.id||id(),label,category,date,fromPerson,toPerson,contact:external?contact:'',fromAccountId,toAccountId,frequency,endDate:endDate||null,amount:Math.round(amount*100)/100,paidDates:existing?.paidDates||[]};
  if(!row.amount)return res.status(400).json({error:'Enter at least one cent.'});
  if(existing)Object.assign(existing,row);else db.scheduledTransfers.push(row);
  saveDb();res.json({item:row});
 }
 app.post(route+'/transfers',requireAuth,saveTransfer);
 app.put(route+'/transfers/:id',requireAuth,saveTransfer);
 app.put(route+'/transfers/:id/occurrence',requireAuth,(req,res)=>{
  const db=getDb(),row=db.scheduledTransfers.find(item=>item.id===req.params.id),{date,paid}=req.body;
  if(!row?.date||!canSeeTransfer(row,req.user.name)||typeof paid!=='boolean'||!validDate(date)||(row.endDate&&date>row.endDate)||!recurring(row.date,row.frequency,date,date).length)return res.status(400).json({error:'Choose a valid transfer occurrence.'});
  const dates=new Set(row.paidDates||[]);
  if(paid)dates.add(date);else dates.delete(date);
  row.paidDates=[...dates].sort();saveDb();res.json({item:row});
 });
}
module.exports={install,fundingEvents,occurrences,canSeeTransfer};
