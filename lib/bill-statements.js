'use strict';
const {recurring}=require('./cash-plan');
function forCharge(b,charge,today){if(!b.statementDate||!charge)return null;const issued=recurring(b.statementDate,b.frequency||'monthly',b.statementDate,charge).at(-1);if(!issued)return null;return {date:issued,chargeDate:charge,reviewed:b.amountReviewedStatementDate===issued,needsReview:b.kind==='variable'&&issued<=today&&b.amountReviewedStatementDate!==issued,expected:issued>b.statementDate};}
module.exports={forCharge};
