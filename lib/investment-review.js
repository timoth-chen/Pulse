'use strict';
// Activity is evidence, not proof that an export covers the account's lifetime.
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
function classify(a){
 if(a.flowClassification)return a.flowClassification;
 const t=String(a.activityType||'').replace(/[ _-]/g,'').toLowerCase(),sub=String(a.subType||'').toUpperCase();
 if(t==='moneymovement'&&sub==='EFT')return 'external';
 if(['returnofcapital','noncashdistribution','legacycorporateaction','administrativepayment'].includes(t))return 'investment';
 if(/^(buy|sell|trade|dividend|distribution|interest|fee|tax|withholdingtax|optionexpiry|reinvestment)$/.test(t))return 'investment';
 if(/^(deposit|withdrawal|cashdeposit|cashwithdrawal|contribution)$/.test(t))return 'external';
 return 'review';
}
function review(account,activities){
 const rows=activities.filter(a=>a.accountId===account.id).sort((a,b)=>a.date.localeCompare(b.date)).map(a=>({...a,flowClassification:classify(a)}));
 const usable=r=>r.currency==='CAD'&&typeof r.netCashAmount==='number'&&Number.isFinite(r.netCashAmount)&&!['SecurityTransfer','LegacyCorporateAction','NonCashDistribution','OptionExpiry'].includes(r.activityType)&&!/Adjusted Cost Base Entry Only/i.test(r.merchant||r.raw?.description||'');
 const external=rows.filter(r=>r.flowClassification==='external'&&usable(r)),unresolved=rows.filter(r=>r.flowClassification==='review'||r.netCashAmount!==null&&!usable(r)&&!['ReturnOfCapital','NonCashDistribution','LegacyCorporateAction','OptionExpiry'].includes(r.activityType));
 return {accountId:account.id,rows,firstDate:rows[0]?.date||null,lastDate:rows.at(-1)?.date||null,deposits:round(external.reduce((n,r)=>n+Math.max(0,r.netCashAmount),0)),withdrawals:round(-external.reduce((n,r)=>n+Math.min(0,r.netCashAmount),0)),netContributions:round(external.reduce((n,r)=>n+r.netCashAmount,0)),unresolved:unresolved.length,coverage:'Imported period only',cashMovement:round(rows.filter(usable).reduce((n,r)=>n+r.netCashAmount,0))};
}
function reconstruct(activities){
 const rows=[...activities].sort((a,b)=>a.date.localeCompare(b.date)||String(a.raw?.effective_time||'').localeCompare(String(b.raw?.effective_time||''))),positions=new Map(),cashByDay=new Map();let cash=0,minCash=0,unsupported=0;const adjustments=[];
 for(const a of rows){const raw=a.raw||{},type=a.activityType,description=raw.description||a.merchant||'',nonCash=['SecurityTransfer','LegacyCorporateAction','OptionExpiry','NonCashDistribution'].includes(type)||/Adjusted Cost Base Entry Only/i.test(description);
 if(!nonCash&&a.netCashAmount!==null){if(a.currency==='CAD'&&Number.isFinite(a.netCashAmount)){cash+=a.netCashAmount;minCash=Math.min(minCash,cash);cashByDay.set(a.date,{date:a.date,valueCAD:round(cash),source:'Cumulative CAD cash movement · assumes zero opening cash'});}else unsupported++;}
 if(['Trade','SecurityTransfer','LegacyCorporateAction','OptionExpiry'].includes(type)){const symbol=String(raw.symbol||'').trim(),quantity=Number(raw.quantity);if(!symbol||raw.quantity===''||!Number.isFinite(quantity)){unsupported++;continue;}let position=positions.get(symbol);if(!position){position={symbol,quantity:0,minimum:0};positions.set(symbol,position);}position.quantity+=quantity;position.minimum=Math.min(position.minimum,position.quantity);if(type!=='Trade')adjustments.push({date:a.date,type,symbol,quantity});}
 }
 return {cashMovementCAD:round(cash),minimumCashMovementCAD:round(minCash),cashHistory:[...cashByDay.values()],positions:[...positions.values()].map(p=>({...p,quantity:Math.round(p.quantity*1e8)/1e8})).filter(p=>Math.abs(p.quantity)>.0000001),negativePositionHistory:[...positions.values()].filter(p=>p.minimum<-.00005).map(p=>p.symbol),adjustments,unsupported,assumption:'Starts with zero cash and no holdings; reconcile against the latest statement before using these as balances.'};
}
function accountSummary(account,holdings,activities){const positions=holdings.filter(h=>h.accountId===account.id),priced=positions.filter(h=>Number.isFinite(h.currentValue)),cash=account.investmentCash||null;return {accountId:account.id,holdingsCAD:round(priced.reduce((n,h)=>n+h.currentValue,0)),unpriced:positions.length-priced.length,cash,valuationMode:account.investmentValuationMode||'reported',review:review(account,activities),reconstruction:reconstruct(activities.filter(a=>a.accountId===account.id))};}
function updateValuation(db,account,id){
 if(account.investmentValuationMode!=='holdings')return;
 const positions=db.holdings.filter(h=>h.accountId===account.id),cash=account.investmentCash;
 if(!cash||positions.some(h=>!Number.isFinite(h.currentValue))){if(account.investmentActivityBaseline){account.investmentReconciliationStatus='Holdings and cash updated. Account valuation needs current prices.';return;}throw Error('Record cash and price every holding before using holdings + cash.');}
 const date=[cash.date,...positions.map(h=>[h.priceDate||'',h.asOf||''].sort().at(-1))].sort().at(-1),valueCAD=round(cash.valueCAD+positions.reduce((n,h)=>n+h.currentValue,0));
 if(account.balanceAsOf&&date<account.balanceAsOf)return;
 account.balance=valueCAD;account.balanceAsOf=date;if(account.investmentReconciliationStatus==='Holdings and cash updated. Account valuation needs current prices.')account.investmentReconciliationStatus=null;
 let snapshot=db.investmentSnapshots.find(s=>s.kind==='account'&&s.accountId===account.id&&s.date===date&&s.source==='Holdings + recorded cash');
 if(!snapshot){snapshot={id:id(),kind:'account',accountId:account.id,date,source:'Holdings + recorded cash'};db.investmentSnapshots.push(snapshot);}snapshot.valueCAD=valueCAD;
}
module.exports={classify,review,reconstruct,accountSummary,updateValuation};
