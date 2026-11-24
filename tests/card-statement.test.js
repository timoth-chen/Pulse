const test=require('node:test'),assert=require('node:assert/strict'),{estimate,add}=require('../lib/card-statement');
const make=()=>({accounts:[],transactions:[{id:'buy',account:'Card',date:'2026-11-05',amount:-1000},{id:'new',account:'Card',date:'2026-11-11',amount:-200},{id:'pay',account:'Card',date:'2026-11-12',amount:300}]});
const card=()=>({id:'card',name:'Card',type:'credit',balance:900,balanceAsOf:'2026-11-12',statementCloseDate:'2026-11-10',paymentDueDate:'2026-12-01',transactionBalanceAnchor:{asOf:'2026-11-01',through:'2026-11-12',computedCents:90000}});
test('automatic estimate allocates old statement payments before unbilled charges',()=>{const d=estimate(make(),card(),'2026-11-12');assert.equal(d.statementRemaining,700);assert.equal(d.unbilled,200);assert.equal(d.mode,'estimated');assert.equal(d.cycleStart,'2026-10-11');assert.equal(d.nextCloseDate,'2026-12-10');assert.equal(d.nextPaymentDueDate,'2027-01-01');});
test('posted dates move a purchase into the next cycle and pending rows do not count',()=>{const db=make();db.transactions[0].bankPostedDate='2026-11-11';db.transactions.push({account:'Card',date:'2026-11-11',amount:-900,pending:true});const d=estimate(db,card(),'2026-11-12');assert.equal(d.statementRemaining,0);assert.equal(d.unbilled,900);assert.equal(d.usesPostedDates,true);});
test('manual unpaid override decreases with later credits and expires on the next cycle',()=>{const c={...card(),statementBalance:800,statementBalanceAsOf:'2026-11-11'};assert.equal(estimate(make(),c,'2026-11-12').statementRemaining,500);assert.equal(estimate(make(),c,'2026-12-12').mode,'estimated');assert.equal(estimate(make(),c,'2026-12-12').statementCloseDate,'2026-12-10');});
test('insufficient history reserves full debt; month-end anchors recover after February',()=>{const c=card();delete c.transactionBalanceAnchor;assert.equal(estimate(make(),c,'2026-11-12').mode,'conservative');assert.equal(estimate(make(),c,'2026-11-12').statementRemaining,900);assert.equal(add('2026-01-31',1),'2026-02-28');assert.equal(add('2026-01-31',2),'2026-03-31');});
test('refunds reduce estimated statement due; overpayments never produce a negative due amount',()=>{const db=make(),c=card();db.transactions.push({account:'Card',date:'2026-11-12',amount:50});c.balance=850;c.transactionBalanceAnchor.computedCents=85000;assert.equal(estimate(db,c,'2026-11-12').statementRemaining,650);c.balance=-25;c.transactionBalanceAnchor.computedCents=-2500;assert.equal(estimate(db,c,'2026-11-12').statementRemaining,0);});

test('bank imports retain separate purchase and posted dates for statement allocation',()=>{const {canonicalBankCsv}=require('../lib/bank-csv'),{stageCsv}=require('../lib/transaction-workflow');const csv=canonicalBankCsv('Transaction Date,Posted Date,Description,Amount,Account\n2026-11-10,2026-11-12,Store,-20,Card');const s=stageCsv(csv.csvText,'posted.csv',[],[]);assert.equal(s.rows[0].transaction.date,'2026-11-10');assert.equal(s.rows[0].transaction.bankPostedDate,'2026-11-12');assert.equal(s.rows[0].error,'');});

test('Nov 14 cycle end, Nov 15 issue and Dec 5 due stay paired before and after closing',()=>{const c={...card(),statementCloseDate:'2026-11-14',statementIssueDate:'2026-11-15',paymentDueDate:'2026-12-05'};const open=estimate(make(),c,'2026-11-12');assert.equal(open.nextCloseDate,'2026-11-14');assert.equal(open.nextStatementIssueDate,'2026-11-15');assert.equal(open.nextPaymentDueDate,'2026-12-05');const issued=estimate(make(),c,'2026-11-15');assert.equal(issued.statementCloseDate,'2026-11-14');assert.equal(issued.statementIssueDate,'2026-11-15');assert.equal(issued.paymentDueDate,'2026-12-05');assert.equal(issued.nextStatementIssueDate,'2026-12-15');assert.equal(issued.nextPaymentDueDate,'2027-01-05');});
test('Wealthsimple weekend due dates move to Monday without moving the monthly anchor',()=>{
 const c={...card(),name:'Wealthsimple Visa',statementCloseDate:'2026-11-14',paymentDueDate:'2026-12-05'};
 const r=estimate(make(),c,'2026-11-16');assert.equal(r.nominalPaymentDueDate,'2026-12-05');assert.equal(r.paymentDueDate,'2026-12-07');assert.equal(r.nextPaymentDueDate,'2027-01-05');assert.equal(c.paymentDueDate,'2026-12-05');
 const sunday=require('../lib/card-due-date').effective(c,'2026-12-06');assert.equal(sunday,'2026-12-07');
 assert.equal(require('../lib/card-due-date').effective({...c,name:'Other card'},'2026-12-05'),'2026-12-05');
});

test('Rogers cashback after close applies to the next cycle while a posted payment settles the statement',()=>{
 const c={...card(),name:'Rogers Red World Elite Mastercard',balance:1155.06,balanceAsOf:'2026-11-17',statementCloseDate:'2026-11-05',statementBalance:703.05,statementBalanceAsOf:'2026-11-05',paymentDueDate:'2026-11-26',transactionBalanceAnchor:{asOf:'2026-11-17',through:'2026-11-17',computedCents:115506}};
 const db={transactions:[{account:c.name,date:'2026-11-09',amount:-527.59},{account:c.name,date:'2026-11-09',amount:75.58,category:'Cashback'}]};
 const before=estimate(db,c,'2026-11-17');
 assert.equal(before.statementRemaining,703.05);
 assert.equal(before.unbilled,452.01);
 db.transactions.push({account:c.name,date:'2026-11-26',amount:703.05,category:'Credit Card Payment'});
 const after=estimate(db,c,'2026-11-26');
 assert.equal(after.statementRemaining,0);
 assert.equal(after.unbilled,452.01);
});
