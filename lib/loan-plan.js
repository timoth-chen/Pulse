'use strict';
function loanPlan(loan,today=new Date().toISOString().slice(0,10)){
 const balance=Number(loan.balance)||0,original=Number(loan.originalAmount)||0,payment=Number(loan.monthlyPayment)||0;
 const hasApr=loan.apr!==null&&loan.apr!==undefined&&loan.apr!==''&&Number.isFinite(Number(loan.apr));
 const apr=hasApr?Number(loan.apr):null,rate=(apr||0)/1200;
 let months=null,payoffDate=null,reason='';
 if(balance<=0)reason='No balance due';
 else if(!payment)reason='Add a monthly payment';
 else if(!hasApr)reason='Add the APR to estimate payoff';
 else if(rate>0&&payment<=balance*rate)reason='Payment does not cover estimated monthly interest';
 else{
  months=rate>0?Math.ceil(-Math.log(1-rate*balance/payment)/Math.log(1+rate)):Math.ceil(balance/payment);
  if(!Number.isFinite(months)||months>1200){months=null;reason='Payoff is more than 100 years away at this payment';}
  else{const anchored=!!loan.nextDueDate,date=new Date((loan.nextDueDate||today)+'T12:00:00Z');const day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+months-(anchored?1:0));const end=new Date(date);end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);date.setUTCDate(loan.paymentEndOfMonth?end.getUTCDate():Math.min(day,end.getUTCDate()));payoffDate=date.toISOString().slice(0,10);}
 }
 const contractPayments=balance>0&&loan.maturityDate&&loan.nextDueDate?require('./cash-plan').recurring(loan.nextDueDate,'monthly',loan.nextDueDate,loan.maturityDate).length:0;const paymentsRemaining=balance<=0?0:contractPayments||months;
 let interestProjection=null;try{if(hasApr&&payment>0)interestProjection=loanScenario(loan,payment,apr,today);}catch{}
 const lifetimeInterest=interestPaid(loan,today);
 return {...loan,lifetimeInterest,interestProjection,paymentsRemaining,paymentsRemainingBasis:contractPayments?'contract':'estimate',paid:Math.round((original-balance)*100)/100,pctPaid:original>0?Math.max(0,Math.min(100,Math.round((original-balance)/original*1000)/10)):null,monthsToPayoff:months,payoffDate,estimateReason:reason};
}
module.exports={loanPlan};

// Read-only monthly amortization scenario, rounded to cents at each payment.
function loanScenario(loan,payment,apr,today=new Date().toISOString().slice(0,10)){
 if(!Number.isFinite(Number(payment))||Number(payment)<=0)throw new Error('Enter a positive monthly payment.');
 if(apr===null||apr===undefined||apr===''||!Number.isFinite(Number(apr))||Number(apr)<0)throw new Error('Enter the APR, including 0 for an interest-free loan.');
 const initial=Math.round((Number(loan.balance)||0)*100),monthly=Math.round(Number(payment)*100),rate=Number(apr)/1200;
 if(initial<0)throw new Error('A payoff projection needs a nonnegative loan balance.');
 let balance=initial,interestTotal=0,paidTotal=0,months=0;const schedule=[];
 while(balance>0&&months<1200){
  const interest=Math.round(balance*rate);
  if(monthly<=interest)throw new Error('This payment does not cover the estimated monthly interest.');
  const paid=Math.min(monthly,balance+interest);balance=balance+interest-paid;interestTotal+=interest;paidTotal+=paid;months++;
  const on=new Date((loan.nextDueDate||today)+'T12:00:00Z'),dom=on.getUTCDate();on.setUTCDate(1);on.setUTCMonth(on.getUTCMonth()+months-(loan.nextDueDate?1:0));const last=new Date(on);last.setUTCMonth(last.getUTCMonth()+1,0);on.setUTCDate(loan.paymentEndOfMonth?last.getUTCDate():Math.min(dom,last.getUTCDate()));schedule.push({date:on.toISOString().slice(0,10),amount:paid/100,interest:interest/100,principal:(paid-interest)/100,balance:balance/100});
 }
 if(balance>0)throw new Error('Payoff exceeds 100 years at this payment.');
 const date=new Date(today+'T12:00:00Z'),day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+months);const end=new Date(date);end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);date.setUTCDate(Math.min(day,end.getUTCDate()));
 return {months,schedule,payoffDate:schedule.at(-1)?.date||date.toISOString().slice(0,10),monthlyPayment:monthly/100,apr:Number(apr),principal:initial/100,totalInterest:interestTotal/100,totalPaid:paidTotal/100};
}
module.exports.loanScenario=loanScenario;

// Reconcile scheduled payments against principal paid down; never label missing history as actual.
function interestPaid(l,today){
 if(Number(l.apr)===0)return {amount:0,estimated:false,basis:'Interest-free loan'};
 if(Number.isFinite(l.interestPaidToBaseline)){return {amount:Math.round((l.interestPaidToBaseline+(l.detectedPayments||[]).reduce((n,p)=>n+p.interest,0))*100)/100,estimated:(l.detectedPayments||[]).some(p=>p.estimated),basis:'Lender interest total plus tracked payments'};}
 const a=l.paymentBalanceAnchor,asOf=a?.asOf||l.balanceAsOf,start=l.repaymentStartDate||l.startDate;
 if(!start||!asOf||!l.originalAmount||!l.monthlyPayment||Number(l.apr)<0||l.apr==null)return {amount:null,estimated:false,basis:'Needs lender payment history'};
 const first=new Date(start+'T12:00:00Z'),dom=first.getUTCDate();first.setUTCDate(1);first.setUTCMonth(first.getUTCMonth()+1);const last=new Date(first);last.setUTCMonth(last.getUTCMonth()+1,0);first.setUTCDate(Math.min(dom,last.getUTCDate()));
 const count=require('./cash-plan').recurring(first.toISOString().slice(0,10),'monthly',first.toISOString().slice(0,10),asOf).length;
 const principal=Number(l.originalAmount)-(a?a.balanceCents/100:Number(l.balance)),interest=count*Number(l.monthlyPayment)-principal;
 return {amount:interest>=0?Math.round((interest+(l.detectedPayments||[]).reduce((n,p)=>n+p.interest,0))*100)/100:null,estimated:true,basis:'Assumes '+count+' full monthly payments before the reported balance, first payment one month after loan start, unchanged payment, no missed or extra payments. Excludes processing fees.'};
}
module.exports.interestPaid=interestPaid;
