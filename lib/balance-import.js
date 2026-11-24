'use strict';
const { createHash, randomUUID } = require('node:crypto');
const { parseCsv } = require('./csv');
const normalize = name => String(name).trim().toLowerCase().replace(/\s+/g,' ');
function suggestType(name) {
  if(/loan|finance|line.of.credit/i.test(name))return {type:'loan',review:false};
  if(/visa|credit.card|aeroplan/i.test(name))return {type:'credit',review:false};
  if(/(?:TIMOTHY CHEN|QIFAN LUO)\s*-|^5360 /i.test(name))return {type:'credit',review:true};
  if(/tfsa|fhsa|rrsp|rrbpp|rbrpp|ressop|portfolio|self.directed|pension|lira/i.test(name))return {type:'investment',review:false};
  if(/savings/i.test(name))return {type:'savings',review:false};
  if(/chequing|checking|staff banking/i.test(name))return {type:'checking',review:false};
  if(/^cash(?:\b|_)|^eq bank card$/i.test(name))return {type:'cash',review:false};
  return {type:'other',review:true};
}
function stageBalances(db, csvText, filename, {account:fallbackAccount='',owner:fallbackOwner=''}={}) {
  const rows=parseCsv(csvText);const header=(rows.shift()||[]).map(x=>x.trim().toLowerCase());
  const date=header.indexOf('date'),balance=header.indexOf('balance'),account=header.indexOf('account');
  if(date<0||balance<0||account<0&&!fallbackAccount)throw new Error('This file needs Date, Balance, and Account columns.');
  if(rows.length>100000)throw new Error('Import at most 100,000 balance rows at a time.');
  const fingerprint=createHash('sha256').update(csvText+(fallbackAccount&&rows.some(row=>!String(account>=0?row[account]:'').trim())?'|account:'+fallbackAccount:'')).digest('hex');
  const previous=(db.balanceImports||[]).find(x=>x.fingerprint===fingerprint);
  if(previous)return publicBalanceImport(previous);
  const importId=randomUUID(),unique=new Map(),accounts=new Map();
  for(const [i,row] of rows.entries()){
    const day=String(row[date]||'').trim(),name=String((account>=0?row[account]:'')||fallbackAccount).trim(),raw=String(row[balance]||'').trim();
    if(!name||name.length>250||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day||!/^[-+]?\d+(?:\.\d{1,2})?$/.test(raw))throw new Error(`Invalid date, balance or account at CSV row ${i+2}. Nothing imported.`);
    const value=Math.round(Number(raw)*100);if(!Number.isSafeInteger(value))throw new Error(`Balance outside supported range at row ${i+2}.`);
    const key=JSON.stringify([normalize(name),day]);
    if(unique.has(key)){
      if(unique.get(key).balanceCents!==value)throw new Error(`Conflicting balances for ${name} on ${day}. Nothing imported.`);
      continue;
    }
    unique.set(key,{id:randomUUID(),importId,date:day,accountName:name,balanceCents:value});
    const entry=accounts.get(normalize(name));
    if(!entry||entry.lastDate<day)accounts.set(normalize(name),{name,lastDate:day,latestSourceCents:value});
  }
  if(!unique.size)throw new Error('This balance file contains no records.');
  const values=[...unique.values()],dates=values.map(r=>r.date).sort();
  const mapping=[...accounts.values()].map(a=>{
    const existing=db.accounts.find(x=>require('./account-names').matches(x,a.name));
    const loan=db.loans.find(x=>normalize(x.name)===normalize(a.name));
    const suggestion=suggestType(a.name);
    return {...a,type:loan?'loan':existing?.type||suggestion.type,owner:loan?.person||existing?.person||(!existing&&!loan?fallbackOwner:'')||'',include:true,
      needsReview:suggestion.review,possibleUSD:/usd|u\.s\./i.test(a.name),stale:a.lastDate<dates.at(-1)};
  });
  const item={id:importId,fingerprint,filename:String(filename||'balances.csv').split(/[\\/]/).at(-1),createdAt:new Date().toISOString(),status:'review',rowCount:values.length,from:dates[0],to:dates.at(-1),mapping};
  db.balanceImports ||= [];db.balanceImportRows ||= [];
  db.balanceImports.push(item);db.balanceImportRows.push(...values);
  return publicBalanceImport(item);
}
function publicBalanceImport(item){return {...item};}
function importBalances(db, importId, options, at=new Date().toISOString()) {
  const item=(db.balanceImports||[]).find(x=>x.id===importId);
  if(!item)throw new Error('Balance import not found.');
  if(item.status==='imported')return item.result;
  if(options.currencyBasis!=='CAD')throw new Error('Confirm all exported amounts are already CAD before importing. Native USD balances need conversion first.');
  if(options.reviewed!==true)throw new Error('Review and confirm the account types before importing.');
  const mapping=options.mapping;
  if(!Array.isArray(mapping)||mapping.length!==item.mapping.length||new Set(mapping.map(m=>normalize(m.name))).size!==mapping.length)throw new Error('Review every account in this import.');
  for(const m of mapping){
    if(!item.mapping.some(a=>normalize(a.name)===normalize(m.name))||!['checking','savings','cash','investment','credit','loan','other'].includes(m.type)||typeof m.include!=='boolean'||typeof m.owner!=='string'||m.owner.length>200)throw new Error('Invalid account mapping.');
    const original=item.mapping.find(a=>normalize(a.name)===normalize(m.name));
    if(m.include&&!m.historyOnly&&original.stale&&options.acknowledgeStale!==true)throw new Error('Acknowledge the older account balances or exclude those accounts.');
  }
  const included=mapping.filter(m=>m.include);if(!included.length)throw new Error('Select at least one account.');
  // Build a candidate database so errors cannot leave half an import in memory.
  const next=structuredClone(db);next.balanceHistory ||= [];
  let created=0,matched=0,skippedNewer=0,addedSnapshots=0;
  for(const m of included){
    const original=item.mapping.find(a=>normalize(a.name)===normalize(m.name));
    const rows=next.balanceImportRows.filter(r=>r.importId===importId&&normalize(r.accountName)===normalize(m.name)).sort((a,b)=>a.date.localeCompare(b.date));
    const collection=m.type==='loan'?'loans':'accounts',other=m.type==='loan'?'accounts':'loans';
    if(next[other].some(a=>normalize(a.name)===normalize(m.name)))throw new Error(`The existing ${m.name} is a different record type. Keep its current type or exclude it.`);
    let entity=next[collection].find(a=>require('./account-names').matches(a,m.name));
    if(!entity){entity={id:randomUUID(),name:m.name,createdAt:at,source:'balance-csv',balance:0};next[collection].push(entity);created++;}else matched++;
    const kind=m.type==='loan'?'loan':'account',key=kind+':'+entity.id;
    const group=m.type==='loan'?'loans':m.type==='credit'?'credit':m.type==='investment'?'investments':['cash','checking','savings'].includes(m.type)?'cash':'other';
    const latestExisting=next.balanceHistory.filter(h=>h.key===key).sort((a,b)=>a.at.localeCompare(b.at)).at(-1);
    const knownDates=new Set(next.balanceHistory.filter(h=>h.key===key).map(h=>h.at.slice(0,10)));
    for(const r of rows){
      if(knownDates.has(r.date))continue; // Never replace an existing observation silently.
      const balanceCents=(m.type==='loan'||m.type==='credit')?-r.balanceCents:r.balanceCents;
      next.balanceHistory.push({id:randomUUID(),key,at:r.date+'T00:00:00.000Z',balanceCents,person:m.owner,group,deleted:false,source:'balance-csv',importId});addedSnapshots++;
    }
    // CSV dates have no time of day. Do not overwrite a snapshot on the same or a later date.
    if(latestExisting&&latestExisting.at.slice(0,10)>=rows.at(-1).date){skippedNewer++;continue;}
    entity.balance=((m.type==='loan'||m.type==='credit')?-rows.at(-1).balanceCents:rows.at(-1).balanceCents)/100;
    if(entity.person!==m.owner)delete entity.owners;
    entity.person=m.owner;entity.currency='CAD';entity.balanceAsOf=original.lastDate;entity.balanceImportId=importId;
    entity.archived=m.historyOnly===true;
    if(entity.archived){
      const closed=new Date(original.lastDate+'T00:00:00Z');closed.setUTCDate(closed.getUTCDate()+1);
      entity.balance=0;entity.closedAfter=original.lastDate;
      next.balanceHistory.push({id:randomUUID(),key,at:closed.toISOString(),balanceCents:0,person:m.owner,group,deleted:false,source:'closed-balance-import',importId});
    }
    if(m.type!=='loan')entity.type=m.type;
  }
  next.balanceHistory.sort((a,b)=>a.at.localeCompare(b.at));
  const result={accountsCreated:created,accountsMatched:matched,accountsExcluded:mapping.length-included.length,snapshotsAdded:addedSnapshots,newerBalancesPreserved:skippedNewer};
  const saved=next.balanceImports.find(x=>x.id===importId);Object.assign(saved,{status:'imported',importedAt:at,mapping,currencyBasis:'CAD',result});
  // Do not store an artificial current-day observation here; the saved CSV dates remain authoritative.
  Object.assign(db,next);return result;
}
// Unassigned review drafts must remain discoverable before their owners exist.
function listBalanceImports(db,owner=''){
 const {ownerMatches}=require('./owner-scope');
 return [...(db.balanceImports||[])].reverse().flatMap(item=>{
  if(!owner)return [publicBalanceImport(item)];
  if(item.status==='review')return [{...publicBalanceImport(item),mapping:[],scoped:true,requiresHouseholdReview:true,totalAccounts:item.mapping.length,totalRows:item.rowCount}];
  const mapping=item.mapping.filter(m=>ownerMatches(m.owner,owner));if(!mapping.length)return [];
  const names=new Set(mapping.map(m=>m.name)),rowCount=(db.balanceImportRows||[]).filter(r=>r.importId===item.id&&names.has(r.accountName)).length;
  return [{...publicBalanceImport(item),mapping,scoped:true,rowCount,result:item.result?{...item.result,snapshotsAdded:(db.balanceHistory||[]).filter(h=>h.importId===item.id&&ownerMatches(h.owners?.length?h.owners:h.person,owner)).length}:undefined}];
 });
}
module.exports={stageBalances,importBalances,publicBalanceImport,listBalanceImports};
