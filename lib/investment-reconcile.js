'use strict';
const crypto=require('node:crypto'),values=require('./investment-values'),{validDate}=require('./payroll');
const quantity=n=>Math.round(n*1e8)/1e8,hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const activityKey=a=>String(a.providerKey||a.id||'');
const activityHash=a=>hash([a.date,a.activityType,a.subType,a.currency,a.netCashAmount,a.raw||{}]);
function state(db,a){return hash({cash:a.investmentCash||null,holdings:db.holdings.filter(h=>h.accountId===a.id).map(h=>[h.id,h.symbol,h.currency,h.mode,h.shares]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))});}
function preview(db,accountId,{mode,openingCash=0,positions={}}={}){
 const a=db.accounts.find(a=>a.id===accountId&&a.type==='investment');if(!a)throw Error('Investment account not found.');
 const baseline=a.investmentActivityBaseline,incremental=(mode|| (baseline?'incremental':'rebuild'))==='incremental';
 const all=(db.investmentActivities||[]).filter(r=>r.accountId===accountId).sort((a,b)=>a.date.localeCompare(b.date)||String(a.raw?.effective_time||'').localeCompare(String(b.raw?.effective_time||''))||activityKey(a).localeCompare(activityKey(b))),old=db.holdings.filter(h=>h.accountId===accountId),errors=[],warnings=[];
 if(!all.length)errors.push('Import investment activity for this account first.');
 if(incremental&&!baseline)errors.push('Confirm a reconstructed starting point first.');
 if(incremental&&baseline&&baseline.stateHash!==state(db,a))errors.push('Holdings or cash were edited after the last activity update. Rebuild and review the starting point again.');
 const keys=new Set();for(const r of all){if(!activityKey(r)||keys.has(activityKey(r)))errors.push('Activity identities are missing or repeated. Review the import before applying.');keys.add(activityKey(r));if(!validDate(r.date))errors.push('An activity has an invalid date.');}
 const applied=incremental?baseline?.applied||{}:{};
 for(const [key,digest] of Object.entries(applied)){const r=all.find(r=>activityKey(r)===key);if(!r||activityHash(r)!==digest)errors.push('Previously applied history changed. Rebuild and review all activity before continuing.');}
 const pending=all.filter(r=>!Object.hasOwn(applied,activityKey(r)));
 if(incremental&&baseline&&pending.some(r=>r.date<baseline.throughDate))errors.push('Earlier activity arrived after the starting point was confirmed. Rebuild from the complete history.');
 const cashStart=incremental?Number(a.investmentCash?.valueCAD):Number(openingCash);
 if(!Number.isFinite(cashStart)||cashStart<0||String(openingCash).trim()==='')errors.push('Enter a valid opening cash balance in CAD.');
 const quantities=new Map(),metadata=new Map();if(incremental)for(const h of old){if(h.mode!=='shares'||!h.symbol||!Number.isFinite(h.shares))errors.push('Activity updates require share-based holdings. Review snapshot holdings separately.');if(quantities.has(h.symbol))errors.push('The same symbol has multiple positions. Reconcile them before applying activity.');quantities.set(h.symbol,h.shares);}
 let cash=Number.isFinite(cashStart)?cashStart:0;
 const nonCashTypes=['SecurityTransfer','LegacyCorporateAction','OptionExpiry','NonCashDistribution'],cashTypes=['MoneyMovement','Deposit','Withdrawal','CashDeposit','CashWithdrawal','Contribution','Trade','Buy','Sell','Dividend','Distribution','Interest','Fee','Tax','WithholdingTax','AdministrativePayment','ReturnOfCapital'];
 for(const r of pending){const raw=r.raw||{},type=r.activityType,nonCash=nonCashTypes.includes(type)||/Adjusted Cost Base Entry Only/i.test(raw.description||r.merchant||'');
  if(!nonCash){if(!cashTypes.includes(type)){errors.push('Unsupported activity: '+type+'. Check it before updating balances.');continue;}if(r.currency!=='CAD'||!Number.isFinite(r.netCashAmount)){errors.push('A cash activity is missing a CAD amount. USD cash needs a separate verified conversion.');continue;}cash+=r.netCashAmount;if(cash<-.011)warnings.push('The running cash history temporarily goes below zero. Check settlement timing and missing opening cash against your statement.');}
  if(['Trade','Buy','Sell',...nonCashTypes.filter(t=>t!=='NonCashDistribution')].includes(type)){
   const symbol=String(raw.symbol||'').trim(),q=Number(raw.quantity);if(!symbol||raw.quantity===undefined||raw.quantity===''||!Number.isFinite(q)){errors.push('A share activity has no valid symbol or signed quantity.');continue;}
   if((r.subType==='SELL'&&q>0)||(r.subType==='BUY'&&q<0)){errors.push('A trade quantity does not match its buy/sell direction.');continue;}
   const next=quantity((quantities.get(symbol)||0)+q);quantities.set(symbol,next);if(next<-.00005)errors.push(symbol+' becomes negative. Opening shares, a transfer, or a corporate action may be missing.');
   metadata.set(symbol,{name:raw.name||symbol});
  }
 }
 if(cash<-.011)errors.push('Cash would become negative. Opening cash or part of the activity history may be missing.');
 const afterPositions=[...quantities].filter(([,q])=>q>.0000001).sort(([a],[b])=>a.localeCompare(b)).map(([symbol,shares])=>{const existing=old.filter(h=>h.symbol===symbol);if(existing.length>1)errors.push('Multiple holdings use '+symbol+'. Review them before applying.');const before=existing[0],settings=positions[symbol]||{},currency=settings.currency||before?.currency||'CAD',exchange=settings.exchange||before?.exchange||(currency==='CAD'?'TSX':'NASDAQ');if(!['CAD','USD'].includes(currency)||!['TSX','NASDAQ','NYSE'].includes(exchange))errors.push('Choose a supported quote currency and exchange for '+symbol+'.');if(!/^[A-Z0-9.^:_-]{1,40}$/.test(symbol))errors.push('The open position '+symbol+' needs a holdings snapshot; this quote symbol is not supported.');return {symbol,shares,beforeShares:before?.shares??0,currency,exchange,name:settings.name||before?.name||metadata.get(symbol)?.name||symbol,existingId:before?.id||null};});
 const date=all.at(-1)?.date||null;if(date&&a.investmentCash?.date>date)errors.push('Recorded cash is newer than this activity history. Import through that date before replacing it.');
 if(all.some(r=>r.activityType==='SecurityTransfer'))warnings.push('In-kind transfers affect shares, not cash. Confirm their destinations before treating them as contributions or withdrawals.');
 if(!incremental)warnings.push('This replaces the account’s current quantities using the imported history and opening cash. Confirm that no opening holdings are missing.');
 if(afterPositions.some(p=>p.existingId&&p.beforeShares!==p.shares))warnings.push('Changed quantities need cost-basis review. Entered purchase cost and average cost are cleared for those positions; contributions are not a substitute for purchase cost.');
 if(afterPositions.some(p=>!p.existingId))warnings.push('Confirm quote currency and exchange for new holdings. A trade’s CAD cash amount does not prove the stock is quoted in CAD. Prices are not inferred from old trades.');
 const result={accountId,mode:incremental?'incremental':'rebuild',openingCash:cashStart,throughDate:date,activityCount:all.length,newActivityCount:pending.length,beforeCash:a.investmentCash||null,afterCash:values.round(Math.max(0,cash)),positions:afterPositions,funding:require('./investment-review').review(a,all),removed:old.filter(h=>!afterPositions.some(p=>p.existingId===h.id)).map(h=>({id:h.id,symbol:h.symbol||h.name,shares:h.shares})),errors:[...new Set(errors)],warnings:[...new Set(warnings)],unchanged:incremental&&!pending.length};
 result.token=hash([result,state(db,a),all.map(r=>[activityKey(r),activityHash(r)])]);return result;
}
function apply(db,accountId,input,{id,actor='User'}={}){
 const plan=preview(db,accountId,input);if(input.token!==plan.token)throw Error('This preview changed. Review the latest before/after comparison.');if(plan.errors.length)throw Error(plan.errors.join(' '));if(input.confirmed!==true)throw Error('Confirm the quantities, cash and completeness against your source.');if(plan.unchanged)return {plan,applied:0};
 // Prepare everything on a copy; validation errors must leave the financial state untouched.
 const draft=structuredClone(db),account=draft.accounts.find(a=>a.id===accountId),old=draft.holdings.filter(h=>h.accountId===accountId),next=[];
 for(const p of plan.positions){const prior=old.find(h=>h.id===p.existingId),sameQuote=prior&&prior.currency===p.currency&&prior.exchange===p.exchange;
 const h=values.position({accountId,name:p.name,symbol:p.symbol,shares:p.shares,currency:p.currency,exchange:p.exchange,asOf:plan.throughDate,person:account.owners?.length>1?'Household / Joint':account.owners?.[0]||account.person||'',broker:account.institution||prior?.broker||'',lastPrice:sameQuote?prior.lastPrice??'':'',fxRate:p.currency==='CAD'?1:sameQuote?prior.fxRate??'':'',assetType:prior?.assetType||'ETF',autoQuote:prior?prior.autoQuote!==false:true,costBasis:prior&&prior.shares===p.shares?prior.costBasis??'':'',averageCost:prior&&prior.shares===p.shares?prior.averageCost??'':'',purchaseFx:prior&&prior.shares===p.shares?prior.purchaseFx??'':'',providerSymbol:sameQuote?prior.providerSymbol:undefined},draft,prior||{});
 h.id=prior?.id||id();if(sameQuote){h.priceDate=prior.priceDate||prior.asOf;h.fxDate=prior.fxDate;h.valuationSource=prior.valuationSource;}h.activityUpdatedAt=new Date().toISOString();next.push(h);
 }
 draft.holdings=draft.holdings.filter(h=>h.accountId!==accountId).concat(next);draft.investmentSnapshots||=[];
 for(const h of next)if(Number.isFinite(h.currentValue)){let snapshot=draft.investmentSnapshots.find(s=>s.holdingId===h.id&&s.date===plan.throughDate);if(!snapshot){snapshot={id:id(),holdingId:h.id,accountId,date:plan.throughDate};draft.investmentSnapshots.push(snapshot);}Object.assign(snapshot,{valueCAD:h.currentValue,shares:h.shares,price:h.lastPrice,priceDate:h.priceDate,currency:h.currency,source:'Activity reconciliation · last recorded quote'});}
 account.investmentCash={valueCAD:plan.afterCash,date:plan.throughDate,source:'Confirmed activity reconstruction'};
 const all=draft.investmentActivities.filter(a=>a.accountId===accountId);account.investmentActivityBaseline={throughDate:plan.throughDate,applied:Object.fromEntries(all.map(a=>[activityKey(a),activityHash(a)])),autoUpdate:input.autoUpdate!==false,openingCash:plan.mode==='rebuild'?plan.openingCash:account.investmentActivityBaseline?.openingCash||0,confirmedAt:new Date().toISOString(),confirmedBy:actor,stateHash:''};
 account.investmentActivityBaseline.stateHash=state(draft,account);account.investmentReconciliationStatus=null;
 if(typeof input.useHoldingsValue==='boolean')account.investmentValuationMode=input.useHoldingsValue?'holdings':'reported';
 if(account.investmentValuationMode==='holdings'){if(next.every(h=>Number.isFinite(h.currentValue))){require('./investment-review').updateValuation(draft,account,id);}else account.investmentReconciliationStatus='Holdings and cash updated. Account valuation needs current prices.';}
 db.holdings=draft.holdings;db.investmentSnapshots=draft.investmentSnapshots;Object.assign(db.accounts.find(a=>a.id===accountId),account);return {plan,applied:plan.newActivityCount};
}
function applyNew(db,accountIds,{id,actor}={}){const results=[];for(const accountId of new Set(accountIds)){const a=db.accounts.find(a=>a.id===accountId);if(!a?.investmentActivityBaseline?.autoUpdate)continue;try{const p=preview(db,accountId);if(p.unchanged)continue;if(p.positions.some(h=>!h.existingId))throw Error('New holding found. Review its quote currency and exchange before updating balances.');const result=apply(db,accountId,{mode:'incremental',token:p.token,confirmed:true,autoUpdate:true},{id,actor});results.push({accountId,applied:result.applied});}catch(e){a.investmentReconciliationStatus='Activity imported; balance update needs review: '+e.message;results.push({accountId,needsReview:true,message:e.message});}}return results;}
module.exports={preview,apply,applyNew,state};
