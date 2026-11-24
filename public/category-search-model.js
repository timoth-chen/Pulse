(function(root){'use strict';
const aliases={
 'Furniture & Housewares':'kitchen cookware pot pans dishes utensils appliances household couch sofa furniture',
 'Personal Care':'hair haircut barber salon skincare skin care hygiene shampoo toothpaste grooming',
 'Clothing & Accessories':'clothes clothing shoes workout clothes bags jewellery jewelry',
 Pets:'cat cats kitten litter pet food toys vet animal',
 'Projects & Tools':'api openai hosting domains software development project tools',
 'Internet & Streaming':'bell wifi broadband internet television tv streaming',
 'General Shopping':'amazon shopping random plush stuffed toys',
 'Credit Card Payment':'scotiabank scotia td amex american express cibc rbc rogers tangerine payment',
 'Financial Fees':'atm fee bank charges interest chexy',
 'Restaurants & Eating out':'food meals restaurant eating dining takeout delivery',
 'Parking & Tolls':'car parking toll',Paychecks:'salary wages income payroll',Healthcare:'medical dentist dental vision medication prescriptions'
};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function matches(c,q){const terms=norm(q).split(' ').filter(Boolean),text=norm([c.name,c.group,aliases[c.name]].join(' '));return terms.every(t=>text.includes(t));}
const api={matches};if(typeof module!=='undefined')module.exports=api;else root.PulseCategorySearch=api;
})(typeof window==='undefined'?globalThis:window);
