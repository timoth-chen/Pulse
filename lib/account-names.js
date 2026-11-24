 'use strict';
const norm=v=>String(v||'').trim().toLowerCase();
const matches=(a,name)=>[a.name,...(a.nameAliases||[])].some(n=>norm(n)===norm(name));
const find=(db,name)=>(db.accounts||[]).find(a=>matches(a,name));
const identity=a=>({...a,sourceName:a.sourceName||a.nameHistory?.[0]?.from||a.nameAliases?.[0]||a.name,displayName:a.displayName||a.name});
const canonical=(db,name)=>find(db,name)?.name||name;
function validate(db,account,name){if(typeof name!=='string'||!name.trim())throw Error('Enter an account name.');if((db.accounts||[]).some(a=>a.id!==account?.id&&matches(a,name)))throw Error('That name already belongs to another account or its previous name.');}
function relink(db,account,from,{actor='Pulse',id=()=>require('node:crypto').randomUUID(),at=new Date().toISOString()}={}){validate(db,account,from);const to=account.name;account.nameAliases=[...new Set([...(account.nameAliases||[]),from].filter(n=>norm(n)!==norm(to)))];let count=0;db.transactionEvents||=[];for(const t of db.transactions||[]){if(t.accountId!==account.id&&norm(t.account)!==norm(from))continue;const before=t.account;t.sourceAccount||=before;t.account=to;t.accountId=account.id;if(before!==to){count++;db.transactionEvents.push({id:id(),transactionId:t.id,kind:'account-rename',actor,at,before:{account:before},after:{account:to,accountId:account.id}});}}
 for(const h of [...(db.holdings||[]),...(db.investmentActivities||[])])if(h.accountId===account.id||norm(h.account)===norm(from)){h.account=to;h.accountId=account.id;}
 for(const rule of db.transactionRules||[]){const condition=rule.match?.account;if(typeof condition==='string'&&norm(condition)===norm(from))rule.match.account=to;else if(condition&&typeof condition==='object'&&norm(condition.value)===norm(from))condition.value=to;}
 if(db.importPreferences?.excludeAccounts)db.importPreferences.excludeAccounts=db.importPreferences.excludeAccounts.map(name=>norm(name)===norm(from)?to:name);
 return count;
}
function rename(db,account,name,options={}){validate(db,account,name);const before=account.name,to=name.trim();account.sourceName||=identity(account).sourceName;account.displayName=to;if(before===to)return 0;validate(db,account,before);account.name=to;account.nameHistory=[...(account.nameHistory||[]),{from:before,to,at:options.at||new Date().toISOString()}];return relink(db,account,before,options);}
module.exports={identity,matches,find,canonical,validate,relink,rename};
