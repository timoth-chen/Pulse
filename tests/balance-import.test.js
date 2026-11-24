const test=require('node:test');const assert=require('node:assert/strict');const {emptyDb}=require('../lib/storage');const {stageBalances,importBalances}=require('../lib/balance-import');const {overview,captureBalances}=require('../lib/account-overview');
const csv='Date,Balance,Account\n2026-10-01,100.25,Savings\n2026-10-01,-20.10,Visa\n2026-11-05,200.25,Savings\n2026-11-05,-10.10,Visa\n';
function ready(db,text=csv){const preview=stageBalances(db,text,'balances.csv');return {preview,options:{currencyBasis:'CAD',reviewed:true,mapping:preview.mapping,acknowledgeStale:true}};}
test('review staging does not create accounts; importing normalizes debts and preserves history',()=>{
 const db=emptyDb();const {preview,options}=ready(db);assert.equal(db.accounts.length,0);assert.equal(db.balanceHistory.length,0);
 const result=importBalances(db,preview.id,options);assert.equal(result.accountsCreated,2);assert.equal(db.accounts.find(a=>a.type==='credit').balance,10.10);assert.equal(db.transactions.length,0);
 const d=overview(db,{today:'2026-11-05'});assert.equal(d.netWorth,190.15);assert.equal(d.breakdown[0].totalLiabilities,20.10);assert.equal(d.history[0].value,80.15);
 assert.equal(stageBalances(db,csv,'again.csv').id,preview.id);assert.deepEqual(importBalances(db,preview.id,options),result);assert.equal(db.balanceHistory.length,4);
});
test('currency and older balances require explicit decisions and do not mutate data',()=>{
 const db=emptyDb();const {preview,options}=ready(db,'Date,Balance,Account\n2026-01-01,50,Cash\n2026-11-05,100,Savings\n');
 const before=structuredClone(db);assert.throws(()=>importBalances(db,preview.id,{...options,currencyBasis:''}),/CAD/);assert.throws(()=>importBalances(db,preview.id,{...options,acknowledgeStale:false}),/older/);assert.deepEqual(db,before);
});
test('invalid and conflicting source rows fail before staging',()=>{
 for(const text of ['Date,Balance,Account\n2026-02-30,1,Cash','Date,Balance,Account\n2026-11-05,NaN,Cash','Date,Balance,Account\n2026-11-05,1,Cash\n2026-11-05,2,Cash']){const db=emptyDb();assert.throws(()=>stageBalances(db,text,'bad.csv'));assert.equal(db.balanceImports.length,0);}
});
test('existing newer balances win; account IDs and transactions remain intact',()=>{
 const db=emptyDb();db.accounts.push({id:'existing',name:'Savings',type:'savings',person:'Owner',balance:900});captureBalances(db,'2026-11-05T15:00:00Z');
 const {preview,options}=ready(db);importBalances(db,preview.id,options);assert.equal(db.accounts.find(a=>a.id==='existing').balance,900);assert.ok(db.balanceHistory.some(h=>h.key==='account:existing'&&h.at.startsWith('2026-10-01')));assert.equal(db.accounts.filter(a=>a.name==='Savings').length,1);
});
test('history-only closed accounts preserve the past but contribute zero to current totals',()=>{
 const db=emptyDb();const {preview,options}=ready(db,'Date,Balance,Account\n2026-06-09,15000,Cashback\n2026-11-05,100,Savings\n');options.mapping[0].historyOnly=true;options.acknowledgeStale=false;
 importBalances(db,preview.id,options);const d=overview(db,{today:'2026-11-05',days:365});assert.equal(d.netWorth,100);assert.equal(d.count,1);assert.equal(d.history[0].value,15000);assert.ok(db.accounts.find(a=>a.name==='Cashback').archived);
});

test('unassigned balance drafts remain discoverable from a named owner view without leaking other owner mappings',()=>{const db=emptyDb();const {preview}=ready(db);const {listBalanceImports}=require('../lib/balance-import');const personal=listBalanceImports(db,'Timothy');assert.equal(personal.length,1);assert.equal(personal[0].requiresHouseholdReview,true);assert.equal(personal[0].totalAccounts,2);assert.equal(personal[0].totalRows,4);assert.deepEqual(personal[0].mapping,[]);assert.equal(db.accounts.length,0);assert.equal(listBalanceImports(db,'')[0].mapping.length,2);assert.equal(db.balanceImports[0].id,preview.id);});
test('completed balance imports remain filtered by the assigned owner',()=>{const db=emptyDb(),{preview,options}=ready(db);options.mapping=options.mapping.map(m=>({...m,owner:'Timothy'}));importBalances(db,preview.id,options);const {listBalanceImports}=require('../lib/balance-import');assert.equal(listBalanceImports(db,'Rebekah').length,0);assert.equal(listBalanceImports(db,'Timothy')[0].result.snapshotsAdded,4);assert.equal(listBalanceImports(db,'Timothy')[0].requiresHouseholdReview,undefined);});
