'use strict';
module.exports=b=>Math.round(Number(b.amount??b.lastAmount??0)*(1+Number(b.processingFeePercent||0)/100)*100)/100;
