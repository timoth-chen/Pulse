 'use strict';
module.exports=async(p,{key,fetchImpl,now,signature})=>{
 if(!key)throw Error('Add a Cardog API key on the server.');
 const ref='squish:'+p.vin.slice(0,8)+p.vin[9];let response;
 try{response=await fetchImpl('https://api.cardog.app/v2/quotes?refs='+encodeURIComponent(ref),{headers:{'x-api-key':key,'Cardog-Version':'2026-10-26',Accept:'application/json'},signal:AbortSignal.timeout(20000)});}catch{throw Error('Cardog could not be reached. Your recorded balance was kept.');}
 if(!response.ok)throw Error('Cardog quote unavailable (status '+response.status+'). Check your key or free allowance.');
 let data;try{data=await response.json();}catch{throw Error('Cardog returned an unreadable quote.');}
 const q=(data.response||data).quotes?.find(q=>q.ref===ref),asOf=new Date(q?.asOf);
 if(!q||q.grain!=='squish'||!Number.isInteger(q.liveCount)||q.liveCount<5||!Number.isFinite(q.priceMedian)||q.priceMedian<=0||q.priceMedian>10000000||!Number.isFinite(asOf.getTime())||asOf>now||now-asOf>30*86400000||q.currency&&q.currency!=='CAD')throw Error('No recent CAD quote with enough comparable listings. Your recorded balance was kept.');
 return {valueCAD:Math.round(q.priceMedian*100)/100,currency:'CAD',source:'Cardog',basis:'Comparable asking-price median · not mileage adjusted',sampleCount:q.liveCount,priceP25:q.priceP25,priceP75:q.priceP75,date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(asOf),retrievedAt:now.toISOString(),profileSignature:signature(p),odometerKm:p.odometerKm};
};
