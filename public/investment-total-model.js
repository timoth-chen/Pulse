(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PulseInvestmentTotals=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function included(data){const accounts=(data.accounts||[]).filter(a=>a.includeInOverview!==false).map(a=>({...a})),snapshots=[...(data.snapshots||[])],holdings=[...(data.holdings||[])];
 for(const r of data.otherInvestments||[]){if(!r.canInclude||!r.includeInOverview||!Number.isFinite(r.marketValueCAD)||accounts.some(a=>a.id===r.accountId))continue;
 const id=r.accountId||'other:'+r.id;accounts.push({id,name:r.name,person:r.person,type:'other',balance:r.marketValueCAD,balanceAsOf:r.valuationDate});holdings.push({id:'other:'+r.id,accountId:id,name:r.name,currentValue:r.marketValueCAD,costBasis:r.costBasisCAD??null,assetType:r.kind==='silver'?'Precious metals':'Defined benefit pension',sector:r.kind==='silver'?'Precious metals':'Pension',currency:'CAD'});
 for(const v of r.valuations||[])snapshots.push({kind:'account',accountId:id,date:v.date,valueCAD:v.valueCAD});if(r.valuationDate)snapshots.push({kind:'account',accountId:id,date:r.valuationDate,valueCAD:r.marketValueCAD});
 }
 const ids=new Set(accounts.map(a=>a.id));return {...data,accounts,holdings:holdings.filter(h=>ids.has(h.accountId)),snapshots:snapshots.filter(s=>ids.has(s.accountId)),summaries:(data.summaries||[]).filter(s=>ids.has(s.accountId)),rebuiltHistory:(data.rebuiltHistory||[]).filter(r=>ids.has(r.accountId))};}
 return {included};
});
