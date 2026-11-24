const test = require('node:test');
const assert = require('node:assert/strict');
const { captureBalances, overview } = require('../lib/account-overview');
const fixture = () => ({accounts:[
  {id:'cash',name:'Joint chequing',type:'checking',person:'Joint',balance:1000.10},
  {id:'tfsa',name:'TFSA',type:'investment',person:'Timothy',balance:5000},
  {id:'visa',name:'Visa',type:'credit',person:'Timothy',balance:200.25}
],loans:[{id:'car',name:'Car',person:'Joint',balance:300}],holdings:[{currentValue:5000}]});
test('net worth includes accounts and loans once, with cents intact',()=>{
 const db=fixture();captureBalances(db,'2026-11-01T12:00:00Z');const d=overview(db,{today:'2026-11-01'});
 assert.equal(d.totalAssets,6000.10);assert.equal(d.totalLiabilities,500.25);assert.equal(d.netWorth,5499.85);
 assert.equal(d.history.length,1);assert.equal(d.history[0].value,d.netWorth);assert.equal(d.change,null);
 assert.equal(d.groups.find(g=>g.id==='investments').total,5000);
});
test('snapshots record changes, do not manufacture old observations, and survive deletion',()=>{
 const db=fixture();assert.equal(captureBalances(db,'2026-11-01T12:00:00Z'),true);
 assert.equal(captureBalances(db,'2026-11-02T12:00:00Z'),false);
 db.accounts[0].balance=1200.11;captureBalances(db,'2026-11-03T12:00:00Z');
 let d=overview(db,{today:'2026-11-04'});assert.equal(d.history[0].date,'2026-11-01');assert.equal(d.change,200.01);assert.equal(d.history.at(-1).value,d.netWorth);
 db.accounts=db.accounts.filter(a=>a.id!=='visa');captureBalances(db,'2026-11-05T12:00:00Z');
 d=overview(db,{today:'2026-11-05'});assert.equal(d.history[0].value,5499.85);assert.equal(d.history.at(-1).value,d.netWorth);assert.equal(d.totalLiabilities,300);
});
test('owner and type filters apply to history and current totals',()=>{
 const db=fixture();captureBalances(db,'2026-11-01T12:00:00Z');
 const d=overview(db,{owner:'Timothy',group:'credit',today:'2026-11-02'});
 assert.equal(d.netWorth,-200.25);assert.equal(d.count,1);assert.equal(d.history[0].value,-200.25);
});
test('credit refunds and overdrawn cash classify on the correct side',()=>{
 const db=fixture();db.accounts[0].balance=-10;db.accounts[2].balance=-20;captureBalances(db,'2026-11-01T00:00:00Z');
 const d=overview(db,{today:'2026-11-01'});assert.equal(d.totalAssets,5020);assert.equal(d.totalLiabilities,310);assert.equal(d.netWorth,4710);
});
test('date window uses the last known balance at its boundary',()=>{
 const db=fixture();captureBalances(db,'2026-09-01T00:00:00Z');db.accounts[0].balance=900;captureBalances(db,'2026-11-04T00:00:00Z');
 const d=overview(db,{days:30,today:'2026-11-05'});assert.equal(d.history[0].date,'2026-10-06');assert.equal(d.change,-100.10);
});
test('same-day changes keep the latest actual balance',()=>{
 const db=fixture();captureBalances(db,'2026-11-05T10:00:00Z');db.accounts[0].balance=1200;captureBalances(db,'2026-11-05T11:00:00Z');
 const d=overview(db,{today:'2026-11-05'});assert.equal(d.history.length,1);assert.equal(d.history[0].value,d.netWorth);
});
test('monthly breakdown carries known balances, closes each month, and reconciles with net worth',()=>{
 const db=fixture();captureBalances(db,'2026-08-10T12:00:00Z');
 db.accounts[1].balance=5500;captureBalances(db,'2026-10-12T12:00:00Z');
 db.accounts[2].balance=100;captureBalances(db,'2026-11-03T12:00:00Z');
 const d=overview(db,{days:365,today:'2026-11-05'});
 assert.deepEqual(d.breakdown.map(p=>p.month),['2026-08','2026-09','2026-10','2026-11']);
 assert.equal(d.breakdown[0].totalAssets,d.breakdown[1].totalAssets);
 assert.equal(d.breakdown[2].assets.find(g=>g.id==='investments').total,5500);
 assert.equal(d.breakdown.at(-1).date,'2026-11-05');
 for(const p of d.breakdown){assert.equal(Math.round((p.totalAssets-p.totalLiabilities)*100),Math.round(p.value*100));}
 assert.equal(d.breakdown.at(-1).value,d.netWorth);
});
test('monthly breakdown retains deleted accounts historically and honors ownership changes',()=>{
 const db=fixture();captureBalances(db,'2026-09-01T12:00:00Z');
 db.accounts[1].person='Joint';captureBalances(db,'2026-10-01T12:00:00Z');
 db.accounts=db.accounts.filter(a=>a.id!=='visa');captureBalances(db,'2026-11-01T12:00:00Z');
 const d=overview(db,{days:365,today:'2026-11-05',owner:'Timothy'});
 assert.equal(d.breakdown[0].totalAssets,5000);assert.equal(d.breakdown[1].totalAssets,0);
 assert.equal(d.breakdown[0].totalLiabilities,200.25);assert.equal(d.breakdown.at(-1).totalLiabilities,0);
});
test('empty data yields no historical bars',()=>{
 const db={accounts:[],loans:[]};captureBalances(db,'2026-11-05T12:00:00Z');
 assert.deepEqual(overview(db,{today:'2026-11-05'}).breakdown,[]);
});
test('calendar periods include six months, YTD, one year, and all time',()=>{
 const db=fixture();captureBalances(db,'2024-01-01T00:00:00Z');db.accounts[0].balance=1500;captureBalances(db,'2026-11-05T00:00:00Z');
 for(const [period,start] of [['6m','2026-05-05'],['ytd','2026-01-01'],['1y','2025-11-05'],['all','2024-01-01']])assert.equal(overview(db,{period,today:'2026-11-05'}).history[0].date,start);
 assert.equal(overview(db,{period:'1m',today:'2026-03-31'}).periodStart,'2026-02-28');
});
test('quarterly/yearly breakdowns use closing balances and compute changes',()=>{
 const db=fixture();captureBalances(db,'2026-01-01T00:00:00Z');db.accounts[0].balance=1200;captureBalances(db,'2026-04-01T00:00:00Z');db.accounts[1].balance=6000;captureBalances(db,'2026-10-01T00:00:00Z');
 const d=overview(db,{period:'all',frequency:'quarterly',today:'2026-11-05'});assert.deepEqual(d.breakdown.map(p=>p.periodKey),['2026-Q1','2026-Q2','2026-Q3','2026-Q4']);assert.equal(d.breakdown.at(-1).assetChanges.investments,1000);assert.equal(d.breakdown[0].change,null);assert.equal(overview(db,{period:'all',frequency:'yearly',today:'2026-11-05'}).breakdown.length,1);
});
test('account and absolute-amount filters apply to totals and history together',()=>{
 const db=fixture();captureBalances(db,'2026-01-01T00:00:00Z');
 let d=overview(db,{account:'account:visa',period:'all',today:'2026-11-05'});assert.equal(d.netWorth,-200.25);assert.equal(d.history[0].value,-200.25);
 d=overview(db,{minAmount:'2000',period:'all',today:'2026-11-05'});assert.equal(d.netWorth,5000);assert.equal(d.history[0].value,5000);
 assert.equal(overview(db,{maxAmount:'500',owner:'timothy',today:'2026-11-05'}).count,1);
});
test('hidden accounts remain in the account list but leave the overview and its history',()=>{
 const db=fixture();captureBalances(db,'2026-01-01T00:00:00Z');db.accounts[1].includeInOverview=false;
 const d=overview(db,{period:'all',today:'2026-11-05'});assert.equal(d.count,4);assert.equal(d.hiddenCount,1);assert.equal(d.netWorth,499.85);assert.equal(d.history[0].value,499.85);
 const detail=overview(db,{account:'account:tfsa',period:'all',today:'2026-11-05'});assert.equal(detail.netWorth,5000);assert.equal(detail.history[0].value,5000);
});
test('shared membership scopes current balances and saved history without duplicating Everyone totals',()=>{const {overview,captureBalances}=require('../lib/account-overview');const db={accounts:[{id:'joint',name:'Shared',type:'checking',person:'Household / Joint',owners:['Timothy','Rebekah'],balance:500}],loans:[],balanceHistory:[]};captureBalances(db,'2026-11-06T12:00:00Z');for(const owner of ['Timothy','Rebekah','']){const d=overview(db,{owner,today:'2026-11-06',period:'all'});assert.equal(d.netWorth,500);assert.equal(d.history.at(-1).value,500);}assert.equal(captureBalances(db,'2026-11-06T13:00:00Z'),false);});

test('the all-account graph includes a live capture made after UTC midnight on the Toronto date',()=>{
 const db=fixture();
 captureBalances(db,'2026-11-17T18:00:00.000Z');
 db.accounts[0].balance+=50;
 captureBalances(db,'2026-11-18T02:59:19.663Z');
 const data=overview(db,{today:'2026-11-17'});
 assert.equal(data.history.at(-1).date,'2026-11-17');
 assert.equal(data.history.at(-1).value,data.netWorth);
});
