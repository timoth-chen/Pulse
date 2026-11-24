'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{validate,prepare}=require('../lib/funds-setup'),{project}=require('../lib/cash-plan');
const db=()=>({accounts:[{id:'a',name:'Chequing',type:'checking',balance:2000,balanceAsOf:'2026-11-08'},{id:'cc',name:'Visa',type:'credit',balance:1000,balanceAsOf:'2026-11-08',statementCloseDate:'2026-10-31',paymentDueDate:'2026-11-20',statementBalance:500,payFromAccountId:'a'}],transactions:[],bills:[],loans:[],billPayments:[]});
const setup=()=>({accountId:'a',cardId:'cc',payWith:'credit',buffer:100,days:90,dailySpend:0,incomeAmount:2400,incomeDate:'2026-11-13',incomeFrequency:'biweekly',extra:[{label:'Rent from partner',date:'2026-11-15',amount:900,kind:'incoming',frequency:'monthly'},{label:'Japan trip transfer',date:'2026-11-11',amount:-2300,frequency:'once'}],charges:[{cardId:'cc',label:'Rent via Chexy',date:'2026-11-10',amount:1800,feePercent:1.75,frequency:'monthly'}]});
test('saved setup rolls pay and transfers forward, charges Chexy plus fee to the card and warns before payday',()=>{const d=db(),s=validate(setup(),d),before=JSON.stringify(d),p=prepare(d,s,'2026-11-08'),r=project(d,p.account,{...p.input,amount:500});assert.equal(r.purchasePaymentDate,'2026-12-20');assert.ok(r.events.some(e=>e.label==='Japan trip transfer'&&e.amount===-2300));assert.equal(r.events.filter(e=>e.label==='Expected take-home pay').length,7);assert.ok(r.events.find(e=>e.kind==='Card payment'&&e.date==='2026-12-20').parts.some(p=>p.label==='Rent via Chexy'&&p.amount===1831.5));assert.ok(r.firstNegative);assert.equal(r.firstNegative.date,'2026-11-11');assert.equal(JSON.stringify(d),before);});
test('already received pay is in cash once, same-size expectations cannot consume the same actual row twice',()=>{const d=db();d.accounts[0].balanceAsOf='2026-11-07';d.transactions=[{id:'pay',account:'Chequing',date:'2026-11-08',merchant:'Employer Deposit',amount:2400}];const s=validate({...setup(),incomeDate:'2026-11-08',extra:[{label:'Partner repayment',date:'2026-11-08',amount:2400,kind:'incoming'}],charges:[]},d),p=prepare(d,s,'2026-11-08'),r=project(d,p.account,{...p.input,amount:0});assert.equal(p.confirmed.length,1);assert.equal(r.startingBalance,4400);assert.equal(p.input.extra.filter(e=>e.date==='2026-11-08').length,1);});
test('pay after the last balance remains estimated until a matching import verifies it',()=>{const d=db();d.accounts[0].balanceAsOf='2026-11-13';const s=validate({...setup(),incomeDate:'2026-11-06',extra:[],charges:[]},d);let p=prepare(d,s,'2026-11-23'),r=project(d,p.account,{...p.input,amount:0}),pending=p.input.extra.find(e=>e.awaitingImport);assert.equal(pending.expectedDate,'2026-11-20');assert.equal(pending.date,'2026-11-23');assert.match(pending.label,/awaiting import/);assert.equal(r.recordedCash,2000);assert.equal(r.estimatedIncome,2400);assert.equal(r.startingBalance,4400);assert.equal(r.timeline[0].balance,3900);d.transactions=[{id:'pay',account:'Chequing',date:'2026-11-20',merchant:'Employer Deposit',amount:2400}];p=prepare(d,s,'2026-11-23');r=project(d,p.account,{...p.input,amount:0});assert.equal(p.input.extra.some(e=>e.awaitingImport),false);assert.equal(p.confirmed.some(e=>e.label==='Paycheque'&&e.date==='2026-11-20'),true);assert.equal(r.startingBalance,4400);assert.equal(r.timeline[0].balance,3900);});
test('same-day recorded Chexy charge is not charged again; unrelated equal spending stays separate',()=>{const d=db();d.transactions=[{id:'rent',account:'Visa',date:'2026-11-08',merchant:'Rent via Chexy',amount:-1831.5}];const s=validate({...setup(),charges:[{cardId:'cc',label:'Rent via Chexy',date:'2026-11-08',amount:1800,feePercent:1.75,frequency:'once'}]},d);let p=prepare(d,s,'2026-11-08');assert.equal(p.input.plannedCharges.length,0);d.transactions[0].merchant='Other purchase';p=prepare(d,s,'2026-11-08');assert.equal(p.input.plannedCharges.length,1);});
test('old one-time transfers expire, anchors roll to latest statement conservatively, fresh CSV balances win',()=>{const d=db(),s=validate(setup(),d);d.accounts[1].balance=2200;d.accounts[1].balanceAsOf='2026-12-04';const p=prepare(d,s,'2026-12-05');assert.ok(!p.input.extra.some(e=>e.label==='Japan trip transfer'));assert.equal(p.input.cards[0].statementCloseDate,'2026-11-30');assert.equal(p.input.cards[0].statementBalance,null);const r=project(d,p.account,{...p.input,amount:0});assert.equal(r.cardPayments[0].balance,2200);assert.equal(r.cardPayments[0].estimated,true);});
test('rolling a card cycle also rolls its statement issue date',()=>{const d=db(),s=validate(setup(),d),card=d.accounts[1];card.statementCloseDate='2026-10-20';card.statementIssueDate='2026-11-03';card.paymentDueDate='2026-11-12';const p=prepare(d,s,'2026-11-23');assert.deepEqual(p.input.cards[0],{id:'cc',statementCloseDate:'2026-11-20',statementIssueDate:'2026-12-03',paymentDueDate:'2026-12-12',statementBalance:null,cycleEstimated:true});assert.doesNotThrow(()=>project(d,p.account,{...p.input,amount:0}));});
test('a loan payment before expected pay reports the first negative date and cause',()=>{const d=db();d.loans=[{id:'loan',name:'Car payment',balance:5000,monthlyPayment:2500,nextDueDate:'2026-11-10',payFromAccountId:'a'}];const s=validate({...setup(),extra:[],charges:[]},d),p=prepare(d,s,'2026-11-08'),r=project(d,p.account,{...p.input,amount:0});assert.equal(r.firstNegative.date,'2026-11-10');assert.equal(r.firstNegative.label,'Car payment');assert.equal(r.firstNegative.balance,-500);assert.equal(r.canAfford,false);});
test('invalid setup, fees and foreign cards are rejected',()=>{const d=db();assert.throws(()=>validate({...setup(),days:5},d),/30/);assert.throws(()=>validate({...setup(),charges:[{...setup().charges[0],feePercent:101}]},d),/fee/);assert.throws(()=>validate({...setup(),cardId:'foreign'},d),/Select a card/);});
test('combined and partial partner deposits do not count both the receipt and the entire expected repayment',()=>{const d=db();d.accounts[0].balanceAsOf='2026-11-07';d.transactions=[{id:'combined',account:'Chequing',date:'2026-11-08',merchant:'Partner e-transfer',amount:950}];const s=validate({...setup(),incomeAmount:0,extra:[{label:'Partner e-transfer rent half',date:'2026-11-08',amount:900,kind:'incoming'},{label:'Partner e-transfer utilities half',date:'2026-11-08',amount:100,kind:'incoming'}],charges:[]},d);let p=prepare(d,s,'2026-11-08');assert.equal(p.input.extra.reduce((n,r)=>n+r.amount,0),50);assert.equal(project(d,p.account,{...p.input,amount:0}).startingBalance,2950);d.transactions[0].amount=1000;p=prepare(d,s,'2026-11-08');assert.equal(p.input.extra.length,0);});

test('an unrelated deposit does not cancel expected salary',()=>{
 const data=db();
 data.accounts[0].balanceAsOf='2026-11-13';
 data.transactions.push({id:'refund',account:'Chequing',date:'2026-11-20',merchant:'Store refund',amount:2400});
 const saved=validate({...setup(),incomeDate:'2026-11-06',extra:[],charges:[]},data);
 const {input,confirmed}=prepare(data,saved,'2026-11-21');
 assert.equal(confirmed.length,0);
 assert.equal(input.extra.find(row=>row.awaitingImport).amount,2400);
});

test('Funds Check applies an imported partial statement payment exactly once',()=>{
 const data=db();
 const card=data.accounts.find(account=>account.type==='credit');
 card.balance=2000;
 card.statementBalance=1000;
 card.statementBalanceAsOf='2026-10-31';
 data.transactions.push({
  id:'partial',account:card.name,date:'2026-11-06',amount:200,category:'Credit Card Payment'
 });
 const saved=validate({...setup(),extra:[],charges:[]},data);
 const {account,input}=prepare(data,saved,'2026-11-08');
 const result=project(data,account,{...input,amount:0});
 assert.equal(result.cardPayments[0].statementRemaining,800);
});

test('prior payday contributes to opening cash before a same-day card payment',()=>{
 const data=db();
 data.accounts[0].balance=909.22;
 data.accounts[0].balanceAsOf='2026-11-13';
 const saved=validate({...setup(),incomeDate:'2026-11-06',extra:[],charges:[]},data);
 const before=JSON.stringify(data);
 const {account,input}=prepare(data,saved,'2026-11-23');
 const result=project(data,account,{...input,amount:0});
 assert.equal(result.recordedCash,909.22);
 assert.equal(result.estimatedIncome,2400);
 assert.equal(result.startingBalance,3309.22);
 assert.equal(result.minimum,2809.22);
 assert.equal(result.timeline[0].balance,2809.22);
 assert.equal(input.extra.find(row=>row.awaitingImport).expectedDate,'2026-11-20');
 assert.equal(JSON.stringify(data),before);
});

test('a newer balance snapshot does not add the prior scheduled salary again',()=>{
 const data=db();
 data.accounts[0].balance=3309.22;
 data.accounts[0].balanceAsOf='2026-11-21';
 const saved=validate({...setup(),incomeDate:'2026-11-06',extra:[],charges:[]},data);
 const {account,input}=prepare(data,saved,'2026-11-23');
 const result=project(data,account,{...input,amount:0});
 assert.equal(input.extra.some(row=>row.awaitingImport),false);
 assert.equal(result.startingBalance,3309.22);
});

test('a payday after today cannot be treated as available opening cash for a later simulation',()=>{
 const data=db();
 data.accounts[0].balance=409.22;
 data.accounts[0].balanceAsOf='2026-11-13';
 const saved=validate({...setup(),incomeDate:'2026-11-06',extra:[],charges:[]},data);
 const {account,input}=prepare(data,saved,'2026-11-24');
 const result=project(data,account,{...input,estimateAsOf:'2026-11-19',amount:0});
 assert.equal(result.startingBalance,409.22);
 assert.equal(result.estimatedIncome,0);
});
