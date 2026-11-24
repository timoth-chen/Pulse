'use strict';
const settings=require('./category-settings'),{categoryCatalog,financialSummary}=require('./categories');
const groups={
 Home:['Rent','Home Improvement','Furniture & Housewares'],
 'Bills & Utilities':['Utilities','Phone','Internet & Streaming'],
 'Food & Drink':['Groceries','Restaurants & Eating out','Coffee Shops','Drinks','Desserts'],
 'Auto & Transport':['Auto Payment','Auto Insurance','Auto Maintenance','Gas','Parking & Tolls','Public Transit','Taxi & Ride Shares','Biking'],
 Shopping:['General Shopping','Clothing & Accessories','Electronics'],
 'Health & Wellbeing':['Healthcare','Fitness','Personal Care'],
 Lifestyle:['Travel & Vacation','Entertainment & Recreation','Subscriptions','Pets','Gifts','Lottery'],
 Financial:['Financial Fees','Insurance','Taxes','Financial & Legal Services','Loan Repayment'],
 'Education & Work':['Education','Personal Development','Student Loans','Work Expenses','Projects & Tools'],
 Income:['Paychecks','Interest','Cashback','Tax Return','Other Income'],
 Transfers:['Transfer','Credit Card Payment','Investment Transfer','Balance Adjustments'],
 Other:['Uncategorized','Government & Legal','Postage & Shipping']
};
const renames={'Shopping':'General Shopping','Clothing':'Clothing & Accessories'};
const merges={Medical:'Healthcare',Activaties:'Entertainment & Recreation',Activities:'Entertainment & Recreation',Personal:'Uncategorized',Miscellaneous:'Uncategorized','Cash & ATM':'Uncategorized',Salary:'Paychecks',Income:'Paychecks'};
function apply(db,id=()=>require('node:crypto').randomUUID()){
 const beforeTransactions=structuredClone(db.transactions),beforeSummary=financialSummary(db.transactions,db.categories),at=new Date().toISOString();
 const had=()=>new Set(categoryCatalog(db).map(c=>c.name));
 for(const [from,to]of Object.entries(renames))if(had().has(from)&&!had().has(to))settings.saveCategory(db,{originalName:from,name:to,group:'Shopping',type:'expense'},id);
 for(const [group,names]of Object.entries(groups))for(const name of names)settings.saveCategory(db,{name,group,type:group==='Income'?'income':group==='Transfers'?'transfer':'expense'},id);
 for(const [from,to]of Object.entries(merges))if(had().has(from))settings.deleteCategory(db,from,to,id);
 const canonical=name=>settings.canonicalCategory(db,name),byId=new Map(beforeTransactions.map(t=>[t.id,t]));let flagged=0,projects=0,investment=0;
 const mark=(t,reason)=>{t.reviewRequired=true;t.reviewed=false;t.notes=[t.notes,reason].filter(Boolean).join(' | ');flagged++;};
 for(const t of db.transactions){const prior=byId.get(t.id),text=[t.merchant,t.originalStatement,t.notes].join(' ');
  if(['Miscellaneous','Cash & ATM','Personal'].includes(prior.category)){
   if(/openai\s+api/i.test(text)){t.category='Projects & Tools';projects++;}
   else if(prior.category==='Personal'&&/^gyubee\b/i.test(t.merchant)){t.category='Restaurants & Eating out';}
   else mark(t,prior.category==='Cash & ATM'||/\batm\b|\babm\b/i.test(text)?'Cash purpose and any included ATM fee need review. Split only when cash spending and the fee are known.':'Purpose needs review after category cleanup.');
  }
  if(['Transfer','Balance Adjustments'].includes(t.category)&&!t.splits?.length&&!t.scopePartial&&!t.sharedClaimId&&!t.repaymentOriginal&&/interactive\s*bro|\bibkr\b|\btfsa\b|\bfhsa\b|\brrsp\b/i.test([t.merchant,t.originalStatement].join(' '))){t.category='Investment Transfer';t.isTransfer=true;investment++;}
  if(t.category==='Insurance'&&/\b(?:auto|car|vehicle) insurance\b/i.test(text))t.category='Auto Insurance';
  if(t.splits)for(const split of t.splits)split.category=canonical(split.category);
 }
 // Keep live drafts and rule actions compatible; preserve source rows and historical audit data.
 for(const stage of db.transactionImports||[])if(stage.status==='staged')for(const r of stage.rows||[]){r.transaction.category=canonical(r.transaction.category);for(const p of r.proposals||[])if(p.status==='pending'&&p.changes?.category)p.changes.category=canonical(p.changes.category);}
 for(const rule of db.transactionRules||[])if(rule.match?.category&&typeof rule.match.category==='object'&&rule.match.category.value)rule.match.category.value=canonical(rule.match.category.value);
 for(const rule of db.transactionRules||[])if(/openai\s+api/i.test(JSON.stringify(rule.match))&&rule.set?.category==='Uncategorized')rule.set.category='Projects & Tools';
 const parentRenames={'Food & drink':'Food & Drink',Transport:'Auto & Transport','Health & wellbeing':'Health & Wellbeing','Learning & work':'Education & Work'};
 for(const b of db.budgets||[])if(b.targetType==='parent'&&parentRenames[b.category])b.category=parentRenames[b.category];
 for(const v of db.savedViews||[]){const f=v.filters;if(!f)continue;if(f.category)f.category=canonical(f.category);if(f.facets){try{const facets=JSON.parse(f.facets);if(facets.categories)facets.categories=[...new Set(facets.categories.map(canonical))];f.facets=JSON.stringify(facets);}catch{}}}
 for(const r of db.fundsSetups||[])if(r.essentialCategories)r.essentialCategories=r.essentialCategories.map(canonical);
 for(const r of db.cushionPlans||[])if(r.essentialCategories)r.essentialCategories=r.essentialCategories.map(canonical);
 let updated=0;db.transactionEvents||=[];for(const t of db.transactions){const prior=byId.get(t.id);if(JSON.stringify(prior)===JSON.stringify(t))continue;updated++;db.transactionEvents.push({id:id(),transactionId:t.id,kind:'category-structure',actor:'Timothy',at,before:{category:prior.category,splits:prior.splits||[],reviewRequired:prior.reviewRequired,notes:prior.notes},after:{category:t.category,splits:t.splits||[],reviewRequired:t.reviewRequired,notes:t.notes}});}
 if(JSON.stringify(beforeTransactions.map(t=>[t.id,t.date,t.amount,t.account,t.tags]))!==JSON.stringify(db.transactions.map(t=>[t.id,t.date,t.amount,t.account,t.tags])))throw Error('Category migration changed protected financial fields');
 const afterSummary=financialSummary(db.transactions,db.categories);if(beforeSummary.income!==afterSummary.income||beforeSummary.spending!==afterSummary.spending)throw Error('Category migration changed aggregate income/spending');
 return {groups:Object.keys(groups).length,subcategories:categoryCatalog(db).length,transactionsUpdated:updated,flagged,projects,investment,income:afterSummary.income,spending:afterSummary.spending};
}
module.exports={groups,apply};
