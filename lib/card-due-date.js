'use strict';
// Keep the monthly anchor unchanged; adjust each occurrence independently.
function effective(card,date){
 const rule=card.paymentDueDayRule||(/wealthsimple/i.test([card.name,card.institution,card.sourceName,...(card.nameAliases||[])].join(' '))?'next-weekday':'calendar');
 if(rule!=='next-weekday')return date;
 const d=new Date(date+'T12:00:00Z');if(d.getUTCDay()===6)d.setUTCDate(d.getUTCDate()+2);else if(d.getUTCDay()===0)d.setUTCDate(d.getUTCDate()+1);
 return d.toISOString().slice(0,10);
}
module.exports={effective};
