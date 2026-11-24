'use strict';
function transactionStatistics(rows,spending){const cents=rows.map(t=>Math.abs(Math.round(t.amount*100))),dates=rows.map(t=>t.date).sort();return {total:rows.length,largestTransaction:cents.length?cents.reduce((max,n)=>Math.max(max,n),0)/100:0,averageTransaction:rows.length?Math.round(cents.reduce((n,v)=>n+v,0)/rows.length)/100:0,spending,firstDate:dates[0]||'',lastDate:dates.at(-1)||''};}
module.exports={transactionStatistics};
