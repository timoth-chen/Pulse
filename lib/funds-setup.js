'use strict';
const {validDate}=require('./payroll');
const {recurring}=require('./cash-plan');
const {add}=require('./card-cash-plan');
const frequencies=['once','weekly','biweekly','monthly','quarterly','yearly'];
const num=(v,label,max=1e9)=>{if(v===''||v===null||!Number.isFinite(Number(v))||Number(v)<0||Number(v)>max)throw Error('Enter a valid '+label+'.');return Number(v);};
function validate(input,db){const a=db.accounts.find(a=>a.id===input.accountId&&a.type==='checking');if(!a)throw Error('Select your chequing account.');const card=db.accounts.find(a=>a.id===input.cardId&&a.type==='credit'&&a.payFromAccountId===input.accountId);if(input.payWith==='credit'&&!card)throw Error('Select a card paid from this chequing account.');const out={accountId:a.id,cardId:input.cardId||'',payWith:input.payWith==='credit'?'credit':'checking',buffer:num(input.buffer??0,'cash buffer'),days:num(input.days??90,'forecast length',180),dailySpend:num(input.dailySpend??0,'daily spending'),dailyPayWith:input.dailyPayWith==='credit'?'credit':'checking',incomeSource:input.incomeSource==='payroll'?'payroll':input.incomeSource==='none'?'none':'manual',payrollOwner:input.payrollOwner||'',payrollEmployer:String(input.payrollEmployer||'').slice(0,160),incomeAmount:num(input.incomeAmount||0,'net pay'),incomeDate:input.incomeDate||'',incomeFrequency:input.incomeFrequency||'biweekly',extra:[],charges:[]};if(!Number.isInteger(out.days)||out.days<30)throw Error('Forecast must cover at least 30 days.');if(out.dailyPayWith==='credit'&&(out.payWith!=='credit'||!card))throw Error('Select your default credit card for everyday spending.');if(out.incomeSource==='payroll'&&!db.users.some(u=>u.name===out.payrollOwner))throw Error('Choose the profile for your payroll estimate.');if(out.incomeSource==='manual'&&out.incomeAmount&&(!validDate(out.incomeDate)||!frequencies.includes(out.incomeFrequency)))throw Error('Enter your payday and frequency.');for(const field of ['extra','charges']){if(!Array.isArray(input[field]||[])||(input[field]||[]).length>60)throw Error('Use at most 60 planned items.');out[field]=(input[field]||[]).map((r,i)=>{if(!validDate(r.date)||!frequencies.includes(r.frequency||'once')||!String(r.label||'').trim())throw Error('Give every planned item a name, date and frequency.');let amount=Number(r.amount);if(!Number.isFinite(amount)||Math.abs(amount)>1e9||!amount||r.kind==='incoming'&&amount<0||field==='charges'&&amount<0)throw Error('Enter a valid planned amount.');const row={id:String(r.id||field+':'+i),label:String(r.label).slice(0,120),date:r.date,frequency:r.frequency||'once',kind:r.kind==='incoming'?'incoming':'custom',amount};if(field==='charges'){if(!db.accounts.some(a=>a.id===r.cardId&&a.type==='credit'&&a.payFromAccountId===out.accountId))throw Error('Choose a card paid from this chequing account for each charge.');row.cardId=r.cardId;row.feePercent=num(r.feePercent||0,'processing fee',100);}return row;});}return out;}
const iso=d=>d.toISOString().slice(0,10),norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function matches(db,account,date,amount,label,start,incoming=false,used=new Set()){
 const wanted=norm(label);
 const candidates=db.transactions.filter(t=>{
  const posted=t.bankPostedDate||t.date;
  if(t.pending||used.has(t.id)||t.account!==account||Math.round(t.amount*100)!==Math.round(amount*100)||!(posted<=start&&Math.abs(Date.parse(posted)-Date.parse(date))<=172800000))return false;
  const description=[t.displayName,t.merchant,t.originalStatement,t.category].filter(Boolean);
  if(incoming&&label==='Pay')return !t.isTransfer&&!t.manualTransfer&&description.some(name=>/\b(payroll|paycheques?|paychecks?|salary|employer deposit)\b/i.test(name));
  return description.some(value=>{const name=norm(value);return name.length>=4&&wanted.length>=4&&(name.includes(wanted)||wanted.includes(name));});
 });
 if(candidates.length!==1)return false;
 used.add(candidates[0].id);
 return true;
}
function prepare(db,setup,date,viewer){let payrollPrediction=null;const incomeSource=setup.incomeSource||'manual';const account=db.accounts.find(a=>a.id===setup.accountId&&a.type==='checking');if(!account)throw Error('Your saved chequing account is missing. Update setup.');const endDate=new Date(date+'T12:00:00Z');endDate.setUTCDate(endDate.getUTCDate()+Number(setup.days||90));const end=iso(endDate),input={...setup,start:date,end,asOf:account.balanceAsOf||date,opening:account.balance,purchaseDate:date,cards:[],extra:[],plannedCharges:[]},confirmed=[],used=new Set();
 const dueCards=db.accounts.filter(a=>a.type==='credit'&&!a.archived&&a.payFromAccountId===account.id);for(const card of dueCards){const override={id:card.id};if(card.statementCloseDate&&card.paymentDueDate){let n=0;while(n<120&&add(card.statementCloseDate,n+1)<=date)n++;if(n===120&&add(card.statementCloseDate,n+1)<=date)throw Error('Update the statement dates for '+card.name+'.');if(n){override.statementCloseDate=add(card.statementCloseDate,n);if(card.statementIssueDate)override.statementIssueDate=add(card.statementIssueDate,n);override.paymentDueDate=add(card.paymentDueDate,n);override.statementBalance=null;override.cycleEstimated=true;}}input.cards.push(override);}
 if(incomeSource==='payroll'){payrollPrediction=require('./payroll-forecast').predict(db,setup.payrollOwner,setup.payrollEmployer,date,end);input.incomeAmount='';if(payrollPrediction.amount)setup={...setup,incomeAmount:payrollPrediction.amount,incomeDate:payrollPrediction.sourceDate,incomeFrequency:payrollPrediction.frequency};else setup={...setup,incomeAmount:0};}else if(incomeSource==='none'){input.incomeAmount='';setup={...setup,incomeAmount:0};}
 for(const row of [...(setup.extra||[]),...require('./cash-calendar').fundingEvents(db,account.id,date,end,viewer)])for(const on of recurring(row.date,row.frequency,date,end)){if(matches(db,account.name,on,row.amount,row.label,date,row.kind==='incoming',used)){confirmed.push({label:row.label,date:on,amount:row.amount});continue;}input.extra.push({...row,date:on,frequency:'once'});}
 if(setup.incomeAmount){input.incomeAmount='';const incomeFrom=account.balanceAsOf&&account.balanceAsOf<date?account.balanceAsOf:date;for(const on of recurring(setup.incomeDate,setup.incomeFrequency,incomeFrom,end)){if(matches(db,account.name,on,setup.incomeAmount,'Pay',date,true,used)){confirmed.push({label:'Paycheque',date:on,amount:setup.incomeAmount});continue;}const awaitingImport=on<date;input.extra.push({label:awaitingImport?'Expected take-home pay · awaiting import for '+on:'Expected take-home pay',kind:'incoming',date:awaitingImport?date:on,expectedDate:on,awaitingImport,amount:setup.incomeAmount,frequency:'once'});}}
 // Allocate partial deposits only to expectations with matching source evidence.
 const deposits=db.transactions.filter(t=>!t.pending&&!used.has(t.id)&&
  (t.accountId?t.accountId===account.id:require('./account-names').matches(account,t.account))&&t.amount>0)
  .map(transaction=>({transaction,remaining:Math.round(transaction.amount*100)}));
 for(const row of input.extra){
  const expectedDate=row.expectedDate||row.date;
  if(row.kind!=='incoming'||expectedDate>date)continue;
  for(const deposit of deposits){
   const transaction=deposit.transaction,posted=transaction.bankPostedDate||transaction.date;
   const source=norm(transaction.displayName||transaction.merchant||transaction.originalStatement);
   if(!deposit.remaining||source.length<6||!norm(row.label).includes(source)||
      !(posted<=date&&Math.abs(Date.parse(posted)-Date.parse(expectedDate))<=172800000))continue;
   const allocated=Math.min(Math.round(row.amount*100),deposit.remaining);
   if(!allocated)break;
   deposit.remaining-=allocated;
   row.amount=(Math.round(row.amount*100)-allocated)/100;
   confirmed.push({label:row.label,date:expectedDate,amount:allocated/100});
  }
 }
 input.extra=input.extra.filter(row=>row.amount!==0);
 for(const row of setup.charges||[]){const card=db.accounts.find(a=>a.id===row.cardId);if(!card)continue;const amount=Math.round(row.amount*(1+row.feePercent/100)*100)/100;for(const on of recurring(row.date,row.frequency,date,end)){if(matches(db,card.name,on,-amount,row.label,date,false,used)){confirmed.push({label:row.label,date:on,amount:-amount});continue;}input.plannedCharges.push({...row,date:on,amount});}}
 return {account,input,confirmed,payrollPrediction};}
module.exports={validate,prepare,matches};
