'use strict';
function validate(transaction,parts,canonical=x=>x){
 if(!Array.isArray(parts))throw Error('Splits must be a list.');if(!parts.length)return [];
 if(parts.length<2||parts.length>100)throw Error('Use between 2 and 100 split parts.');
 const cleaned=parts.map(s=>({category:canonical(s.category||transaction.category),person:s.person||'',amount:Number(s.amount),note:s.note||''}));
 if(cleaned.some(s=>!Number.isFinite(s.amount)||!s.amount||typeof s.category!=='string'||!s.category.trim()||typeof s.person!=='string'||typeof s.note!=='string'||Math.abs(s.amount*100-Math.round(s.amount*100))>.000001))throw Error('Each part needs a category and a nonzero amount with at most two decimals.');
 const cents=cleaned.reduce((n,s)=>n+Math.round(s.amount*100),0);
 if(cents!==Math.round(Number(transaction.amount)*100))throw Error('Split parts must equal the transaction total.');return cleaned;
}
module.exports={validate};
