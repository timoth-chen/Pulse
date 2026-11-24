const test=require('node:test'),assert=require('node:assert/strict'),ledger=require('../lib/account-ledger');
const fixture=()=>({accounts:[{id:'c',name:'Card',type:'credit',balance:100,balanceAsOf:'2026-11-01'}],transactions:[{id:'old',account:'Card',amount:-100,date:'2026-11-01'},{id:'buy',account:'Card',amount:-50,date:'2026-11-02'},{id:'pay',account:'Card',amount:30,date:'2026-11-03',isTransfer:true},{id:'refund',account:'Card',amount:5,date:'2026-11-04'},{account:'Card',amount:-9,date:'2026-11-05',pending:true}]});
test('balances count purchases, payments and refunds once after dated baseline',()=>{const db=fixture();ledger.sync(db,'2026-11-12');assert.equal(db.accounts[0].balance,115);ledger.sync(db,'2026-11-12');assert.equal(db.accounts[0].balance,115);db.transactions.find(t=>t.id==='buy').merchant='Renamed';ledger.sync(db,'2026-11-12');assert.equal(db.accounts[0].balance,115);db.transactions=db.transactions.filter(t=>t.id!=='buy');ledger.sync(db,'2026-11-12');assert.equal(db.accounts[0].balance,65);});
test('fresh authoritative balance excludes covered activity; credits may become overpayments',()=>{const db=fixture();ledger.sync(db,'2026-11-12');Object.assign(db.accounts[0],{balance:20,balanceAsOf:'2026-11-03'});ledger.sync(db,'2026-11-12');assert.equal(db.accounts[0].balance,15);db.transactions.push({account:'Card',date:'2026-11-06',amount:30});ledger.sync(db,'2026-11-12');assert.equal(db.accounts[0].balance,-15);});
test('cash has opposite sign, undated accounts are not guessed, explicit rebuild supports history',()=>{const db=fixture();db.accounts[0].type='checking';ledger.sync(db,'2026-11-12');assert.equal(db.accounts[0].balance,85);delete db.accounts[0].balanceAsOf;delete db.accounts[0].transactionBalanceAnchor;ledger.sync(db,'2026-11-12');assert.equal(db.accounts[0].balance,85);db.accounts[0].type='credit';ledger.rebuild(db,'c',{openingBalance:0,before:'2026-10-31'});assert.equal(db.accounts[0].balance,115);});

test('daily history rises with purchases and falls with payments/refunds; all account charts reconcile',()=>{const db=fixture();db.balanceHistory=[{key:'account:c',at:'2026-11-01T00:00:00Z',balanceCents:10000,group:'credit',person:'',deleted:false},{key:'account:c',at:'2026-11-12T00:00:00Z',balanceCents:11500,group:'credit',person:'',deleted:false}];db.loans=[];ledger.sync(db,'2026-11-12');const original=structuredClone(db.balanceHistory),points=ledger.history(db,'2026-11-12');assert.deepEqual(points.map(h=>h.balanceCents),[10000,15000,12000,11500]);assert.deepEqual(db.balanceHistory,original);const chart=require('../lib/account-overview').overview(db,{account:'account:c',period:'all',today:'2026-11-12'});assert.equal(chart.history.at(-1).value,-115);assert.equal(chart.netWorth,-115);assert.equal(chart.breakdown.at(-1).totalLiabilities,115);ledger.recordHistory(db,'2026-11-12');const count=db.balanceHistory.length;ledger.recordHistory(db,'2026-11-12');assert.equal(db.balanceHistory.length,count);assert.equal(db.balanceHistory.filter(h=>h.source!=='transaction-ledger').length,2);});
test('explicit rebuild overrides stale zero history while other accounts retain their observations',()=>{const db=fixture();db.loans=[];db.accounts[0].transactionBalanceAnchor={balanceCents:0,asOf:'2026-10-31',computedCents:0,source:'confirmed-transaction-rebuild'};db.balanceHistory=[{key:'account:c',at:'2026-10-01T00:00:00Z',balanceCents:0},{key:'account:other',at:'2026-10-01T00:00:00Z',balanceCents:40000,group:'cash'}];const h=ledger.history(db,'2026-11-12');assert.equal(h.filter(h=>h.key==='account:c')[0].at.slice(0,10),'2026-10-31');assert.equal(h.find(h=>h.key==='account:other').balanceCents,40000);});

test('chart backfills posted card activity from a statement that reconciles to the newer balance',()=>{
 const {history}=require('../lib/account-ledger');
 const card={id:'card',name:'Rogers',type:'credit',balance:1155.06,statementBalance:703.05,statementCloseDate:'2026-11-05',statementBalanceAsOf:'2026-11-05',transactionBalanceAnchor:{asOf:'2026-11-17',balanceCents:115506}};
 const db={accounts:[card],balanceHistory:[],transactions:[
   {account:'Rogers',date:'2026-11-06',bankPostedDate:'2026-11-09',amount:-527.59},
   {account:'Rogers',date:'2026-11-06',bankPostedDate:'2026-11-09',amount:75.58},
   {account:'Rogers',date:'2026-11-08',amount:-100,pending:true}
 ]};
 const points=()=>history(db,'2026-11-17').map(point=>[point.at.slice(0,10),point.balanceCents]);
 require('node:assert/strict').deepEqual(points(),[['2026-11-05',70305],['2026-11-09',115506],['2026-11-17',115506]]);
 card.transactionBalanceAnchor.balanceCents=115507;
 require('node:assert/strict').deepEqual(points(),[['2026-11-17',115507]]);
});

test('a repeated snapshot can be replaced by posting movements that reconcile to both endpoints',()=>{
 const {history}=require('../lib/account-ledger'),assert=require('node:assert/strict');
 const card={id:'card',name:'Card',type:'credit',statementBalance:80,statementCloseDate:'2026-11-05',statementBalanceAsOf:'2026-11-05',transactionBalanceAnchor:{asOf:'2026-11-17',balanceCents:9000}};
 const db={accounts:[card],balanceHistory:['2026-08-30','2026-09-30','2026-10-30'].map(day=>({key:'account:card',at:day+'T00:00:00Z',balanceCents:10000,source:'balance-csv'})),transactions:[
   {account:'Card',date:'2026-09-12',amount:-40},{account:'Card',date:'2026-10-10',amount:60},{account:'Card',date:'2026-11-08',amount:-10}
 ]};
 const points=history(db,'2026-11-17').map(point=>[point.at.slice(0,10),point.balanceCents]);
 assert.deepEqual(points,[['2026-08-30',10000],['2026-09-12',14000],['2026-10-10',8000],['2026-11-05',8000],['2026-11-08',9000],['2026-11-17',9000]]);
});

test('a reconciled snapshot run replaces historical credit from a stale ledger anchor',()=>{
 const {history}=require('../lib/account-ledger'),assert=require('node:assert/strict');
 const account={id:'card',name:'Scotia',type:'credit',transactionBalanceAnchor:{asOf:'2026-11-17',balanceCents:16151}};
 const point=(day,balanceCents,source)=>({key:'account:card',at:day+'T00:00:00Z',balanceCents,source});
 const db={accounts:[account],balanceHistory:[
   point('2026-09-23',119908,'balance-csv'),point('2026-11-10',119908,'balance-csv'),point('2026-11-12',-306435,'transaction-ledger')
 ],transactions:[
   {account:account.name,date:'2026-10-01',amount:-3225.86},{account:account.name,date:'2026-11-12',amount:4263.43}
 ]};
 assert.deepEqual(history(db,'2026-11-17').map(p=>[p.at.slice(0,10),p.balanceCents]),[
   ['2026-09-23',119908],['2026-10-01',442494],['2026-11-12',16151],['2026-11-17',16151]
 ]);
});
