'use strict';
// User-supplied schedules count the charge and payment days in the four-day window.
module.exports=function(db){let changed=false;const bank=require('./canadian-business-days'),model=require('./bill-charge-dates');for(const b of db.bills||[]){if(b.paymentMethod!=='chexy'||b.chargeTimingVersion===2)continue;const old={...b,chargeLeadBusinessDays:Number(b.chargeLeadBusinessDays??4)},oldNext=b.nextDueDate;
 for(const p of db.billPayments||[]){if(p.billId!==b.id)continue;const provider=p.providerDueDate||model.providerDate(old,p.dueDate);if(!provider)continue;p.providerDueDate=provider;p.previousScheduledChargeDate||=p.dueDate;p.dueDate=bank.shift(provider,-3);if(p.source==='transaction-match')p.id='bill-match:'+b.id+':'+p.dueDate;}
 b.chargeLeadBusinessDays=3;b.chargeTimingVersion=2;b.nextDueDate=bank.shift(b.providerDueDate,-3);if(b.startDate===oldNext)b.startDate=b.nextDueDate;const anchor=b.providerScheduleAnchorDate||b.providerDueDate;b.scheduleAnchorDate=bank.shift(anchor,-3);changed=true;
 }return changed;};
