const {test}=require('node:test'),assert=require('node:assert/strict');
const {classify}=require('../lib/budget-bill-classification');const {view}=require('../lib/budget-shares');const {workspace}=require('../lib/budget-workspace');const {sections}=require('../public/budget-expense-sections');
const fixture=()=>({users:[{name:'Timothy'},{name:'Rebekah'}],accounts:[],transfers:[],categories:[],budgets:[],loans:[],bills:[{id:'couch',name:'Cozey couch financing',category:'Furniture & Housewares',person:'Timothy',amount:314.52,kind:'fixed',frequency:'monthly',nextDueDate:'2026-11-05',startDate:'2026-11-01'}],transactions:[{id:'c',date:'2026-11-05',merchant:'Cozey couch financing',category:'Furniture & Housewares',person:'Timothy',amount:-314.52},{id:'a',date:'2026-11-01',merchant:'Ishai',category:'Furniture & Housewares',person:'Timothy',amount:-260}]});
test('bill payment is Fixed while one-off spending in the same category is Flexible',()=>{const d=fixture(),before=JSON.stringify(d),r=workspace(view(d,''),'2026-11','2026-11-17'),s=sections(r.families);assert.equal(s.find(x=>x.kind==='Fixed').actual,314.52);assert.equal(s.find(x=>x.kind==='Flexible').actual,260);assert.equal(r.totals.actualExpenses,574.52);assert.equal(JSON.stringify(d),before);});
test('household category allocation does not pull a one-off purchase into its fixed bill',()=>{const d=fixture();d.budgets=[{id:'x',category:'Furniture & Housewares',person:'',group:'Fixed',monthlyLimit:314.52,startMonth:'2026-11'}];const r=workspace(view(d,''),'2026-11','2026-11-17'),s=sections(r.families);assert.equal(s.find(x=>x.kind==='Fixed').planned,314.52);assert.equal(s.find(x=>x.kind==='Fixed').actual,314.52);assert.equal(s.find(x=>x.kind==='Flexible').actual,260);});
test('paused subscription stops future planning and ambiguous matches stay Flexible',()=>{const d=fixture();d.bills[0].status='paused';assert.equal(workspace(view(d,''),'2026-12','2026-11-17').totals.plannedExpenses,0);delete d.bills[0].status;d.bills.push({...d.bills[0],id:'duplicate'});assert.equal(classify(d).transactions[0].budgetPlanGroup,'Flexible');});
test('shared plans divide 50/50 while actuals retain the recorded payer and combined total',()=>{const d=fixture();d.bills[0].budgetShares={Timothy:50,Rebekah:50};for(const person of ['Timothy','Rebekah'])assert.equal(workspace(view(d,person),'2026-11','2026-11-17').totals.plannedExpenses,157.26);assert.equal(workspace(view(d,''),'2026-11','2026-11-17').totals.actualExpenses,574.52);assert.equal(workspace(view(d,'Timothy'),'2026-11','2026-11-17').totals.actualExpenses,574.52);assert.equal(workspace(view(d,'Rebekah'),'2026-11','2026-11-17').totals.actualExpenses,0);});
test('overpayment stays with the sender while the cardholder covers their share and household cost counts once',()=>{const d=fixture();d.bills=[{id:'rent',name:'Rent',category:'Rent',person:'Timothy',amount:2800,frequency:'monthly',nextDueDate:'2026-11-09',budgetShares:{Timothy:50,Rebekah:50},budgetRepayments:[{transactionId:'repay',person:'Rebekah'}]}];d.transactions=[{id:'charge',date:'2026-11-09',merchant:'Rent',category:'Rent',person:'Timothy',amount:-2800},{id:'repay',date:'2026-11-13',merchant:'Qifan Luo',category:'Rent',person:'Timothy',amount:1500}];const before=JSON.stringify(d);for(const [owner,expected] of [['',2800],['Timothy',1400],['Rebekah',1500]])assert.equal(workspace(view(d,owner),'2026-11','2026-11-17').totals.actualExpenses,expected);assert.equal(JSON.stringify(d),before);});
test('moving an allocation to household closes the old personal allocation instead of duplicating it',()=>{const d=fixture();d.bills=[];d.budgets=[{id:'old',category:'Furniture & Housewares',person:'Timothy',group:'Flexible',monthlyLimit:100,startMonth:'2026-10'}];require('../lib/budget-workspace').upsert(d,{ids:['old'],month:'2026-11',apply:'future',category:'Furniture & Housewares',person:'',group:'Flexible',amount:100},()=> 'new');assert.equal(d.budgets.find(b=>b.id==='old').endMonth,'2026-10');assert.equal(workspace(d,'2026-11','2026-11-17').totals.plannedExpenses,100);assert.equal(workspace(d,'2026-10','2026-11-17').totals.plannedExpenses,100);});
test('a one-month owner move preserves the original personal budget in subsequent months',()=>{const d=fixture();d.bills=[];d.budgets=[{id:'old',category:'Pets',person:'Timothy',group:'Flexible',monthlyLimit:100,startMonth:'2026-10'}];require('../lib/budget-workspace').upsert(d,{ids:['old'],month:'2026-11',apply:'month',category:'Pets',person:'',group:'Flexible',amount:100},()=> 'new');for(const month of ['2026-10','2026-11','2026-12'])assert.equal(workspace(d,month,'2026-11-17').totals.plannedExpenses,100);assert.equal(workspace(d,'2026-12','2026-11-17').families.find(f=>f.planned).person,'Timothy');});

test('linking one incoming split preserves the other allocations and the bank transaction',()=>{
 const d=fixture();
 d.bills[0].budgetRepayments=[{transactionId:'repay',splitIndex:0,amount:157.35,person:'Rebekah'}];
 d.transactions.push({id:'repay',date:'2026-10-28',person:'Timothy',amount:219.50,splits:[
   {category:'Furniture & Housewares',amount:157.35,person:'Timothy'},
   {category:'Internet & Streaming',amount:62.15,person:'Timothy'}
 ]});
 const original=JSON.stringify(d.transactions);
 const {apply}=require('../lib/budget-repayments');
 assert.deepEqual(apply(d).transactions.filter(t=>t.id==='repay').map(t=>t.amount),[62.15]);
 assert.deepEqual(apply(d,'Rebekah').transactions.filter(t=>t.id==='repay').map(t=>[t.person,t.amount]),
   [['Timothy',157.35],['Rebekah',-157.35],['Timothy',62.15]]);
 assert.equal(JSON.stringify(d.transactions),original);
});

test('a fixed utilities cap covers matched variable bills and leaves one-off utilities purchases flexible',()=>{
 const d=fixture();
 d.bills=[{id:'utility',name:'Carma',kind:'variable',category:'Utilities',amount:110,person:'Timothy',frequency:'monthly',nextDueDate:'2026-11-20'}];
 d.budgets=[{id:'limit',category:'Utilities',person:'Timothy',group:'Fixed',monthlyLimit:120,startMonth:'2026-11'}];
 d.transactions=[
   {id:'carma',merchant:'Carma',date:'2026-11-20',category:'Utilities',amount:-107,person:'Timothy'},
   {id:'one-off',merchant:'Meter supplies',date:'2026-11-10',category:'Utilities',amount:-10,person:'Timothy'}
 ];
 d.billPayments=[{transactionId:'carma',billId:'utility',source:'transaction-match'}];
 const result=sections(workspace(view(d,'Timothy'),'2026-11','2026-11-17').families);
 assert.equal(result.find(section=>section.kind==='Fixed').planned,120);
 assert.equal(result.find(section=>section.kind==='Fixed').actual,107);
 assert.equal(result.find(section=>section.kind==='Flexible').actual,10);
});

test('one fixed limit for shared variable utilities splits the planned cap and linked actual once',()=>{
 const db=fixture();
 db.bills=[{id:'utility',name:'Carma',kind:'variable',category:'Utilities',amount:110,person:'Timothy',frequency:'monthly',nextDueDate:'2026-11-20',budgetShares:{Timothy:50,Rebekah:50},budgetRepayments:[{transactionId:'payment',person:'Rebekah'}]}];
 db.budgets=[{id:'limit',category:'Utilities',person:'Timothy',group:'Fixed',monthlyLimit:120,startMonth:'2026-11'}];
 db.transactions=[
   {id:'carma',merchant:'Carma',date:'2026-11-20',category:'Utilities',amount:-110,person:'Timothy'},
   {id:'payment',merchant:'Rebekah',date:'2026-11-21',category:'Utilities',amount:55,person:'Timothy'}
 ];
 db.billPayments=[{transactionId:'carma',billId:'utility',source:'transaction-match'}];
 for(const [person,planned,actual] of [['Timothy',60,55],['Rebekah',60,55],['',120,110]]){
   const result=sections(workspace(view(db,person),'2026-11','2026-11-17').families);
   const fixed=result.find(section=>section.kind==='Fixed');
   assert.equal(fixed.planned,planned);
   assert.equal(fixed.actual,actual);
 }
 assert.equal(db.budgets[0].monthlyLimit,120);
});
