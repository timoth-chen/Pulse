'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),bank=require('../lib/canadian-business-days'),{dates,agenda}=require('../lib/bill-schedule');
const bill=()=>({id:'rent',name:'Rent',amount:2800,processingFeePercent:1.75,paymentMethod:'chexy',providerDueDate:'2026-12-15',providerScheduleAnchorDate:'2026-12-15',nextDueDate:'2026-12-10',frequency:'monthly'});
test('all four supplied Chexy schedules count charge and provider days inclusively',()=>{
 const model=require('../lib/bill-charge-dates');for(const [charge,provider] of [['2026-11-19','2026-11-24'],['2026-12-08','2026-12-11'],['2026-11-26','2026-12-01'],['2026-12-10','2026-12-15']]){const r=model.occurrences({...bill(),providerDueDate:provider,providerScheduleAnchorDate:provider},charge,charge);assert.equal(r[0].providerDueDate,provider);assert.equal(r[0].date,charge);}assert.equal(bank.isBusinessDay('2027-12-28'),false);
});
test('provider date remains anchored when charge day changes each month',()=>{
 const b=bill();assert.deepEqual(dates(b,'2026-12-01','2027-02-28'),['2026-12-10','2027-01-12','2027-02-10']);
 const d={bills:[b],accounts:[],loans:[],transactions:[],billPayments:[]},r=agenda(d,'2026-12-01');assert.equal(r.upcoming[0].providerDueDate,'2026-12-15');assert.equal(r.upcoming[0].amount,2849);
});
test('last-day loan payments stay at month end, including February',()=>{
 const b={...bill(),providerScheduleAnchorDate:'2026-11-30',providerDueDate:'2026-11-30',providerEndOfMonth:true,nextDueDate:'2026-11-24'};
 const r=require('../lib/bill-charge-dates').occurrences(b,'2026-11-01','2027-03-01');assert.deepEqual(r.map(x=>x.providerDueDate),['2026-11-30','2026-12-31','2027-01-31','2027-02-28']);
});
test('a linked Chexy loan template prevents a second automatic loan payment in the agenda',()=>{
 const d={bills:[{...bill(),linkedLoanId:'loan'}],loans:[{id:'loan',name:'Loan',balance:1000,monthlyPayment:100,nextDueDate:'2026-12-15'}],accounts:[],transactions:[],billPayments:[]};assert.equal(agenda(d,'2026-12-01').upcoming.filter(r=>r.type==='loan').length,0);
});
test('a Chexy template that starts later in the window still replaces the corresponding loan payment',()=>{
 const b={...bill(),id:'student',amount:298.01,providerDueDate:'2026-11-30',providerScheduleAnchorDate:'2026-11-30',nextDueDate:'2026-11-24',startDate:'2026-11-24',linkedLoanId:'loan'};
 const d={bills:[b],loans:[{id:'loan',name:'Student loan',balance:43504.87,monthlyPayment:298.01,nextDueDate:'2026-11-30'}],accounts:[],transactions:[],billPayments:[]};
 const r=agenda(d,'2026-11-16');assert.equal(r.upcoming.filter(r=>r.type==='loan').length,0);assert.equal(r.upcoming.filter(r=>r.id==='student').length,1);
});
test('timing migration preserves actual payment dates and provider dates without duplicate deductions',()=>{const b={...bill(),chargeLeadBusinessDays:4,nextDueDate:'2026-12-09',startDate:'2026-12-09'},p={id:'bill-match:rent:2026-12-09',billId:'rent',date:'2026-12-09',dueDate:'2026-12-09',amount:2849,source:'transaction-match'};const db={bills:[b],billPayments:[p]};const migrate=require('../lib/chexy-timing-migration');assert.equal(migrate(db),true);assert.equal(b.nextDueDate,'2026-12-10');assert.equal(b.startDate,'2026-12-10');assert.equal(p.date,'2026-12-09');assert.equal(p.dueDate,'2026-12-10');assert.equal(p.providerDueDate,'2026-12-15');assert.equal(migrate(db),false);});
test('statement expectations trigger a review after issue day and reset each cycle',()=>{const {forCharge}=require('../lib/bill-statements'),b={kind:'variable',statementDate:'2026-10-30',frequency:'monthly'};assert.equal(forCharge(b,'2026-12-16','2026-11-17').needsReview,false);let r=forCharge(b,'2026-12-16','2026-12-01');assert.equal(r.date,'2026-11-30');assert.equal(r.needsReview,true);b.amountReviewedStatementDate='2026-11-30';assert.equal(forCharge(b,'2026-12-16','2026-12-01').needsReview,false);assert.equal(forCharge(b,'2027-01-16','2027-01-01').needsReview,true);assert.equal(forCharge({...b,statementDate:''},'2027-01-16','2027-01-01'),null);});
