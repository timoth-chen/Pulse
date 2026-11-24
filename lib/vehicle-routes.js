'use strict';
const model=require('./vehicle-values');
module.exports=(app,{requireAuth,getDb,readDb,saveDb,id,fetchImpl=fetch,key=()=>process.env.MARKETCHECK_API_KEY,cardogKey=()=>process.env.CARDOG_API_KEY,startScheduler=true})=>{
 const pending=new Set(),account=req=>{const a=readDb(req).accounts.find(a=>a.id===req.params.id&&a.type==='other');if(!a)throw Error('Choose a vehicle account in Other assets in this owner view.');return getDb().accounts.find(r=>r.id===a.id);};
 const route=(method,url,fn)=>app[method](url,requireAuth,async(req,res)=>{try{await fn(req,res);}catch(e){res.status(400).json({error:e.message});}}),publicData=a=>({profile:a.vehicle?.profile||null,estimates:a.vehicle?.estimates||[],lastAppliedEstimateId:a.vehicle?.lastAppliedEstimateId||null,schedule:a.vehicle?.schedule||{},providers:{marketcheck:!!key(),cardog:!!cardogKey()},configured:a.vehicle?.profile?.provider==='cardog'?!!cardogKey():!!key()});
 route('get','/api/accounts/:id/vehicle',(req,res)=>res.json(publicData(account(req))));
 route('put','/api/accounts/:id/vehicle',(req,res)=>{const a=account(req),p=model.profile(req.body);if(req.body.monthly===true&&req.body.consent!==true)throw Error('Confirm provider data sharing for monthly checks.');a.vehicle={...a.vehicle,profile:p};if(req.body.monthly!==undefined){if(req.body.monthly===true&&req.body.consent!==true)throw Error('Confirm provider data sharing for monthly checks.');a.vehicle.schedule={...a.vehicle.schedule,enabled:req.body.monthly===true,autoApply:req.body.autoApply===true,nextCheckDate:a.vehicle.schedule?.nextCheckDate||nextMonth(new Date())};}saveDb();res.json(publicData(a));});
 route('post','/api/accounts/:id/vehicle/estimate',async(req,res)=>{if(req.body.consent!==true)throw Error('Confirm sending required vehicle details to your selected provider.');let a=account(req);if(!a.vehicle?.profile)throw Error('Save the VIN, odometer and postal code first.');const fingerprint=model.signature(a.vehicle.profile),cached=a.vehicle.estimates?.find(q=>q.profileSignature===fingerprint&&Date.now()-Date.parse(q.retrievedAt)<86400000);if(cached)return res.json({quote:cached,cached:true});if(pending.has(a.id))throw Error('A valuation request is already running.');const accountId=a.id;pending.add(accountId);try{const quote=await model.estimate(a.vehicle.profile,{key:key(),cardogKey:cardogKey(),fetchImpl});a=account(req);if(model.signature(a.vehicle.profile)!==fingerprint)throw Error('Vehicle details changed during lookup. Request an estimate again.');quote.id=id();a.vehicle.estimates=[quote,...(a.vehicle.estimates||[])].slice(0,60);saveDb();res.json({quote,cached:false});}finally{pending.delete(accountId);}});
 route('post','/api/accounts/:id/vehicle/apply',(req,res)=>{const a=account(req),quote=a.vehicle?.estimates?.find(q=>q.id===req.body.estimateId);model.apply(a,quote);saveDb();res.json({balance:a.balance,balanceAsOf:a.balanceAsOf});});
 const nextMonth=now=>{const date=new Date(now);date.setUTCMonth(date.getUTCMonth()+1,1);return date.toISOString().slice(0,7)+'-01';};
 const runMonthly=async(now=new Date())=>{
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),month=today.slice(0,7);
  for(const a of [...getDb().accounts]){
   const v=a.vehicle,s=v?.schedule;if(a.type!=='other'||!v?.profile||!s?.enabled||!s.nextCheckDate||s.nextCheckDate>today||s.lastAttemptMonth===month||pending.has(a.id))continue;
   if(!(v.profile.provider==='cardog'?cardogKey():key()))continue;
   pending.add(a.id);s.lastAttemptMonth=month;s.lastAttemptAt=now.toISOString();s.nextCheckDate=nextMonth(now);s.lastError=null;
   try{saveDb();const fingerprint=model.signature(v.profile);let q=v.estimates?.find(q=>q.profileSignature===fingerprint&&now-Date.parse(q.retrievedAt)>=0&&now-Date.parse(q.retrievedAt)<86400000);
    if(!q)q={...await model.estimate(v.profile,{key:key(),cardogKey:cardogKey(),fetchImpl,now}),id:id()};
    if(!getDb().accounts.includes(a)||!s.enabled||model.signature(v.profile)!==fingerprint)continue;
    if(!v.estimates?.some(e=>e.id===q.id))v.estimates=[q,...(v.estimates||[])].slice(0,60);
    s.lastSuccessDate=today;if(s.autoApply)model.apply(a,q);
   }catch(e){s.lastError=e.message;}finally{pending.delete(a.id);saveDb();}
  }
 };
 if(startScheduler){const timer=setInterval(()=>runMonthly().catch(console.error),3600000);timer.unref();const initial=setTimeout(()=>runMonthly().catch(console.error),1000);initial.unref();}
 return {runMonthly};
};
