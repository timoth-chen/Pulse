const test=require('node:test');const assert=require('node:assert/strict');const {loanPlan}=require('../lib/loan-plan');
test('unknown APR is not treated as zero interest',()=>{const p=loanPlan({balance:1000,monthlyPayment:100},'2026-11-05');assert.equal(p.monthsToPayoff,null);assert.match(p.estimateReason,/APR/);assert.equal(p.pctPaid,null);});
test('explicit zero APR and known payments produce a payoff estimate',()=>{const p=loanPlan({balance:1000,originalAmount:2000,monthlyPayment:100,apr:0},'2026-11-05');assert.equal(p.monthsToPayoff,10);assert.equal(p.payoffDate,'2027-09-05');assert.equal(p.pctPaid,50);});
test('payments below monthly interest do not produce a fake payoff date',()=>{const p=loanPlan({balance:10000,monthlyPayment:10,apr:12});assert.equal(p.payoffDate,null);assert.match(p.estimateReason,/interest/);});
const {loanScenario}=require('../lib/loan-plan');
test('payment preview calculates months, final partial payment and total interest without mutating the plan',()=>{
 const loan={balance:1000,monthlyPayment:10,apr:12},before={...loan};
 const p=loanScenario(loan,400,0,'2026-11-05');assert.equal(p.months,3);assert.equal(p.payoffDate,'2027-02-05');assert.equal(p.totalPaid,1000);assert.equal(p.totalInterest,0);assert.deepEqual(loan,before);
 const interest=loanScenario(loan,400,12,'2026-11-05');assert.equal(interest.months,3);assert.equal(interest.totalInterest,18.26);assert.equal(interest.totalPaid,1018.26);
});
test('payment preview rejects missing APR, invalid payments and non-amortizing plans',()=>{
 for(const [payment,apr] of [[0,0],[-1,0],[100,null],[100,''],[100,-1],[10,12]])assert.throws(()=>loanScenario({balance:1000},payment,apr));
});
test('reported contract maturity remains distinct from calculated payoff estimates',()=>{
 const r=loanPlan({balance:11561.52,originalAmount:42994.58,monthlyPayment:656.33,apr:3.16,maturityDate:'2028-04-18',startDate:'2022-04-18',balanceAsOf:'2026-11-16'},'2026-11-16');assert.equal(r.maturityDate,'2028-04-18');assert.equal(r.balanceAsOf,'2026-11-16');assert.equal(r.startDate,'2022-04-18');assert.equal(r.pctPaid,73.1);assert.notEqual(r.payoffDate,r.maturityDate);
});
test('remaining payments distinguish the contractual schedule from the amortization estimate',()=>{
 const car=loanPlan({balance:11561.52,originalAmount:42994.58,monthlyPayment:656.33,apr:3.16,nextDueDate:'2026-11-18',maturityDate:'2028-04-18'},'2026-11-17');assert.equal(car.paymentsRemaining,18);assert.equal(car.paymentsRemainingBasis,'contract');assert.equal(car.monthsToPayoff,19);
 const student=loanPlan({balance:43504.87,originalAmount:51853.15,monthlyPayment:298.01,apr:0},'2026-11-17');assert.equal(student.paymentsRemaining,146);assert.equal(student.paymentsRemainingBasis,'estimate');
});
test('a monthly payoff uses the next scheduled installment and retains an established month-end schedule',()=>{
 const r=loanPlan({balance:43504.87,monthlyPayment:298.01,apr:0,nextDueDate:'2026-11-30',paymentEndOfMonth:true},'2026-11-17');assert.equal(r.paymentsRemaining,146);assert.equal(r.payoffDate,'2038-12-31');
});
test('lifetime interest estimate is prominent data with explicit assumptions, not invented confirmed history',()=>{const {interestPaid}=require('../lib/loan-plan');const p=interestPaid({originalAmount:42994.58,balance:11561.52,balanceAsOf:'2026-11-16',startDate:'2022-04-18',monthlyPayment:656.33,apr:3.16},'2026-11-17');assert.equal(p.amount,4008.76);assert.equal(p.estimated,true);assert.match(p.basis,/54 full monthly payments/);assert.equal(interestPaid({apr:0}).amount,0);assert.equal(interestPaid({apr:3.16}).amount,null);});
