'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{candidates}=require('../lib/bill-candidates');
const db=()=>({accounts:[{id:'a',name:'Visa',nameAliases:['Old Visa'],person:'Timothy'}],bills:[],loans:[],categories:[],transactions:[]});
const history=(merchant,category,account='Visa')=>['2026-08-05','2026-09-05','2026-10-05'].map(date=>({date,merchant,category,account,amount:-20}));
test('bill candidates exclude regular restaurant and grocery visits, retain subscription evidence and do not save bills',()=>{
 const d=db();d.transactions=[...history('Netflix','Subscriptions'),...history('Cafe','Coffee Shops'),...history('Supermarket','Groceries')];const before=JSON.stringify(d),r=candidates(d,'2026-11-16');assert.deepEqual(r.map(c=>c.name),['Netflix']);assert.equal(r[0].proposedDueDate,'2026-12-05');assert.equal(JSON.stringify(d),before);
});
test('aliases and normalized display names group a bill on its canonical account and suppress tracked schedules',()=>{
 const d=db();d.transactions=history('NETFLIX REF','Subscriptions','Old Visa').map(t=>({...t,displayName:'Netflix'}));let r=candidates(d,'2026-11-16');assert.equal(r[0].accountId,'a');assert.equal(r[0].person,'Timothy');d.bills=[{id:'b',name:'Netflix',payFromAccountId:'a'}];assert.equal(candidates(d,'2026-11-16').length,0);
});
test('six-month patterns are detected without treating card repayments as subscriptions',()=>{
 const d=db();d.transactions=['2025-10-05','2026-04-05','2026-10-05'].map(date=>({date,merchant:'Insurance',account:'Visa',category:'Insurance',amount:-600}));d.transactions.push(...history('Credit card payment','Credit Card Payment'));const r=candidates(d,'2026-11-16');assert.equal(r.length,1);assert.equal(r[0].frequency,'semiannual');assert.equal(r[0].proposedDueDate,'2027-04-05');
});
