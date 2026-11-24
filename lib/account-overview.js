'use strict';
const {ownerMatches}=require('./owner-scope');
const cents = value => Math.round((Number(value) || 0) * 100);
const GROUPS = [
  { id: 'investments', label: 'Investments' },
  { id: 'credit', label: 'Credit cards' },
  { id: 'cash', label: 'Cash & savings' },
  { id: 'loans', label: 'Loans' },
  { id: 'other', label: 'Other assets' }
];
function records(db) {
  return [...db.accounts.map(a => ({ ...a, key: 'account:' + a.id, kind: 'account',
    group: a.type === 'credit' ? 'credit' : a.type === 'investment' ? 'investments' : ['checking', 'savings', 'cash'].includes(a.type) ? 'cash' : 'other' })),
  ...db.loans.map(l => ({ ...l, key: 'loan:' + l.id, kind: 'loan', type: 'loan', institution: l.lender || '', group: 'loans' }))];
}
function captureBalances(db, at = new Date().toISOString()) {
  db.balanceHistory ||= [];
  const latest = new Map(db.balanceHistory.map(h => [h.key, h]));
  const live = records(db);
  const keys = new Set(live.map(a => a.key));
  let changed = false;
  for (const a of live) {
    const balanceCents = cents(a.balance);
    const last = latest.get(a.key);
    if (last && !last.deleted && last.balanceCents === balanceCents && last.person === (a.person || '') && last.group === a.group&&JSON.stringify(last.owners||[])===JSON.stringify(a.owners||[])) continue;
    db.balanceHistory.push({ key: a.key, at, balanceCents, person: a.person || '', owners:a.owners?.length?a.owners:undefined,group: a.group, deleted: false });
    changed = true;
  }
  for (const [key, last] of latest) {
    if (!keys.has(key) && !last.deleted) {
      db.balanceHistory.push({ ...last, at, balanceCents: 0, deleted: true });
      changed = true;
    }
  }
  return changed;
}
const torontoDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'});
function historyDate(point){
  // Imported and ledger dates are bank calendar dates. Live captures are timestamps.
  if(point.source||point.at.endsWith('T00:00:00Z'))return point.at.slice(0,10);
  const observed=new Date(point.at);
  return Number.isFinite(observed.getTime())?torontoDate.format(observed):point.at.slice(0,10);
}
function signed(h) { return (h.group === 'credit' || h.group === 'loans' ? -1 : 1) * h.balanceCents; }
function overview(db, { owner = '', group = '', account = '', query = '', minAmount, maxAmount, period, frequency='monthly', days = 30, today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()) } = {}) {
  const all = records(db);
  const validMin=minAmount!==undefined&&minAmount!==''&&Number.isFinite(Number(minAmount));
  const validMax=maxAmount!==undefined&&maxAmount!==''&&Number.isFinite(Number(maxAmount));
  const cohort=all.filter(a=>(!query||`${a.name} ${a.person||''} ${a.institution||''}`.toLowerCase().includes(query.toLowerCase()))&&(!account||a.key===account)&&(!validMin||Math.abs(cents(a.balance))>=Math.round(Number(minAmount)*100))&&(!validMax||Math.abs(cents(a.balance))<=Math.round(Number(maxAmount)*100)));
  const keys=new Set(cohort.map(a=>a.key));
  const match = a => ownerMatches(a.owners?.length?a.owners:a.person,owner) && (!group || a.group === group) && ((!account&&!query&&!validMin&&!validMax)||keys.has(a.key));
  const hiddenKeys=new Set(all.filter(a=>a.includeInOverview===false).map(a=>a.key));
  const graphMatch=a=>match(a)&&(!hiddenKeys.has(a.key)||!!account);
  const history = require('./account-ledger').history(db,today);
  const latest = new Map(history.map(h => [h.key, h]));
  const items = all.filter(a=>!a.archived&&match(a)).map(a => ({ ...a, balance: cents(a.balance) / 100,
    balanceRecordedAt: latest.get(a.key)?.at || null,
    history: history.filter(h => h.key === a.key && !h.deleted).map(h => ({ date: historyDate(h), balance: h.balanceCents / 100 })) }));
  let assetsCents = 0, liabilitiesCents = 0;
  const assets = [], liabilities = [];
  const groups = GROUPS.map(g => {
    const members = items.filter(a => a.group === g.id);
    let asset = 0, liability = 0;
    for (const a of members.filter(a=>account||a.includeInOverview!==false)) {
      const value = signed({ ...a, balanceCents: cents(a.balance) });
      asset += Math.max(0, value); liability += Math.max(0, -value);
    }
    assetsCents += asset; liabilitiesCents += liability;
    if (asset) assets.push({ ...g, total: asset / 100 });
    if (liability) liabilities.push({ ...g, total: liability / 100 });
    return { ...g, items: members, total: members.reduce((sum, a) => sum + cents(a.balance), 0) / 100 };
  }).filter(g => g.items.length);
  // Last recorded balances are carried forward; nothing is inferred before the first observation.
  const byDate = new Map();
  const state = new Map();
  for (const h of history) {
    if (historyDate(h) > today) continue;
    state.set(h.key, h);
    const totals = { assets: {}, liabilities: {} };
    for (const a of state.values()) {
      if (a.deleted || !graphMatch(a)) continue;
      const value = signed(a), side = value >= 0 ? totals.assets : totals.liabilities;
      side[a.group] = (side[a.group] || 0) + Math.abs(value);
    }
    const assets = GROUPS.filter(g => totals.assets[g.id]).map(g => ({ ...g, total: totals.assets[g.id] / 100 }));
    const liabilities = GROUPS.filter(g => totals.liabilities[g.id]).map(g => ({ ...g, total: totals.liabilities[g.id] / 100 }));
    const totalAssets = Object.values(totals.assets).reduce((n,v) => n+v, 0);
    const totalLiabilities = Object.values(totals.liabilities).reduce((n,v) => n+v, 0);
    byDate.set(historyDate(h), { value:(totalAssets-totalLiabilities)/100, totalAssets:totalAssets/100, totalLiabilities:totalLiabilities/100, assets, liabilities });
  }
  let points = [...byDate].map(([date, totals]) => ({ date, ...totals }));
  // Only show dates after the selected records first became observable.
  const firstPoint = history.find(h => !h.deleted && graphMatch(h));
  const first=firstPoint&&historyDate(firstPoint);
  points = first ? points.filter(p => p.date >= first) : [];
  if (points.length && points.at(-1).date < today) points.push({ ...points.at(-1), date: today });
  const start = new Date(today + 'T00:00:00Z');
  if(period==='ytd'){start.setUTCMonth(0,1);}
  else if(period==='all'&&first){start.setTime(Date.parse(first+'T00:00:00Z'));}
  else if(['1m','3m','6m','1y'].includes(period)){
    const day=start.getUTCDate(),months={'1m':1,'3m':3,'6m':6,'1y':12}[period];
    start.setUTCDate(1);start.setUTCMonth(start.getUTCMonth()-months);
    const end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);
    start.setUTCDate(Math.min(day,end.getUTCDate()));
  }else start.setUTCDate(start.getUTCDate()-days);
  const from = start.toISOString().slice(0, 10);
  const before = points.filter(p => p.date < from).at(-1);
  points = points.filter(p => p.date >= from);
  if (before) points.unshift({ ...before, date: from });
  let breakdown = [];
  if (points.length) {
    const month = new Date(points[0].date.slice(0,7) + '-01T00:00:00Z');
    while (month.toISOString().slice(0,10) <= today) {
      const next = new Date(month); next.setUTCMonth(next.getUTCMonth()+1);
      const end = new Date(next - 864e5).toISOString().slice(0,10);
      const date = end < today ? end : today;
      const closing = points.filter(p => p.date <= date).at(-1);
      if (closing) breakdown.push({ ...closing, date, month:date.slice(0,7) });
      month.setUTCMonth(month.getUTCMonth()+1);
    }
  }
  if(frequency!=='monthly'){
    const buckets=new Map();
    for(const point of breakdown){
      const key=frequency==='yearly'?point.month.slice(0,4):point.month.slice(0,4)+'-Q'+Math.ceil(Number(point.month.slice(5,7))/3);
      buckets.set(key,{...point,periodKey:key});
    }
    breakdown=[...buckets.values()];
  }
  breakdown=breakdown.map((p,i)=>{
    const previous=breakdown[i-1];const delta=(side)=>Object.fromEntries(GROUPS.map(g=>[g.id,previous?Math.round(((p[side].find(x=>x.id===g.id)?.total||0)-(previous[side].find(x=>x.id===g.id)?.total||0))*100)/100:null]));
    return {...p,assetChanges:delta('assets'),liabilityChanges:delta('liabilities'),change:previous?Math.round((p.value-previous.value)*100)/100:null};
  });
  const netWorth = (assetsCents - liabilitiesCents) / 100;
  const change = points.length > 1 ? Math.round((points.at(-1).value - points[0].value) * 100) / 100 : null;
  return { groups, assets, liabilities, totalAssets: assetsCents / 100, totalLiabilities: liabilitiesCents / 100,
    netWorth, history: points, breakdown, frequency, periodStart:from, changePercent:change!==null&&points[0]?.value?Math.round(change/Math.abs(points[0].value)*1000)/10:null, accountOptions:all.filter(a=>!a.archived&&ownerMatches(a.owners?.length?a.owners:a.person,owner)).map(a=>({value:a.key,label:a.name})), historyStart: first || null, change, hiddenCount:items.filter(a=>a.includeInOverview===false).length,
    owners: [...new Set(all.map(a => a.person).filter(Boolean))].sort(), count: items.length };
}
module.exports = { captureBalances, overview };
