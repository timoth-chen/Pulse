'use strict';
try{process.loadEnvFile();}catch(e){if(e.code!=='ENOENT')throw e;}
/*
  Household Finance App v2 — self-hostable, for a couple with combined finances.
  Build-on-Monarch: import Monarch CSVs. No bank connection, no Plaid.
  Data lives in ./data/pulse.sqlite on the server you host.

  Balance convention:
  - checking / savings / investment / cash accounts: balance = what you HAVE
  - credit accounts: balance = what you OWE (positive number)
  - loans are tracked separately (balance = what you owe)
*/
const express = require('express');
const fs = require('node:fs');
const path = require('path');
const crypto = require('crypto');
const { captureBalances, overview: accountOverview } = require('./lib/account-overview');
const { Store } = require('./lib/storage');
const {linkTransfer,balanceChanges,validDate:validMovementDate,claimBalance}=require('./lib/money-movements');
const {alreadySeparated}=require('./lib/splits');
const {categoryInfo,categoryCatalog,financialSummary,flowKind}=require('./lib/categories');
const {budgetMonth,portions}=require('./lib/planning');
const {loanPlan,loanScenario}=require('./lib/loan-plan');
const {syncOwnerProfiles}=require('./lib/profiles');
const { scopedDb, ownerOptions } = require('./lib/owner-scope');
const { stageBalances, importBalances, publicBalanceImport } = require('./lib/balance-import');

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST;
const DATA_DIR = process.env.HF_DATA_DIR || path.join(__dirname, 'data');
const SESSION_DAYS = 30;
const store = new Store(DATA_DIR);
let db = store.load();
function saveDb() {
  syncOwnerProfiles(db);
  require('./lib/chexy-fee-splits').apply(db,{id:()=>crypto.randomUUID()});
  require('./lib/account-ledger').sync(db);
  require('./lib/account-ledger').recordHistory(db);
  require('./lib/bill-matching').sync(db,new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
  require('./lib/loan-ledger').sync(db);
  captureBalances(db);
  try { store.save(db); } catch(e) { db=store.load(); throw e; }
}
const readDb = req => { require('./lib/bill-matching').sync(db,new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto'}).format(new Date()));if(require('./lib/loan-ledger').sync(db))saveDb();return scopedDb(db,String(req.query.scopeOwner||'')); };
const id = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const round = n => Math.round((Number(n) || 0) * 100) / 100;
const todayStr = () => new Date().toISOString().slice(0, 10);

// ---------- auth ----------
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}
function verifyPassword(password, salt, expected) {
  const { hash } = hashPassword(password, salt);
  try { return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected)); } catch { return false; }
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('='); if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function currentUser(req) {
  const token = parseCookies(req).session; if (!token) return null;
  const h = crypto.createHash('sha256').update(token).digest('hex');
  const s = db.sessions.find(x => x.tokenHash === h);
  if (!s || new Date(s.expiresAt) < new Date() || require('./lib/sign-in').enabled(db)&&!s.authenticated) return null;
  return db.users.find(u => u.id === s.userId) || null;
}
function requireAuth(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Not signed in' });
  req.user = u; next();
}
const publicUser = u => ({ id: u.id, name: u.name, email: u.email });

// ---------- dates / periods ----------
function addDays(d, n) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
function addMonths(d, n) { const x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); }
function periodFor(range, anchor) {
  const a = anchor || todayStr();
  if (range === 'day') return { range, start: a, end: a, label: a };
  if (range === 'week') {
    const dow = new Date(a + 'T00:00:00Z').getUTCDay(); // 0 Sun
    const mondayOffset = (dow + 6) % 7;
    const start = addDays(a, -mondayOffset), end = addDays(start, 6);
    return { range, start, end, label: `Week of ${start} to ${end} (Mon–Sun)` };
  }
  if (range === 'year') return { range, start: a.slice(0, 4) + '-01-01', end: a.slice(0, 4) + '-12-31', label: a.slice(0, 4) };
  return { range: 'month', start: a.slice(0, 7) + '-01', end: addDays(addMonths(a.slice(0, 7) + '-01', 1), -1), label: a.slice(0, 7) };
}
function shiftAnchor(range, anchor, dir) {
  const a = anchor || todayStr();
  if (range === 'day') return addDays(a, dir);
  if (range === 'week') return addDays(a, dir * 7);
  if (range === 'year') return addMonths(a, dir * 12);
  return addMonths(a, dir);
}

// ---------- CSV ----------
const isTransferTx=tx=>tx.splits?.length?tx.splits.every(s=>flowKind({...tx,...s,splits:undefined},db.categories)==='transfer'):flowKind(tx,db.categories)==='transfer';
// A split transaction expands into one row per part for category/person totals.
// Parts are validated to sum to the parent amount, so overall totals never double-count.
function expandSplits(list) {
  return list.flatMap(tx => {
    if (!tx.splits || !tx.splits.length) return [tx];
    return tx.splits.map(s => ({ ...tx,
      category: s.category || tx.category,
      person: (s.person !== undefined && s.person !== '') ? s.person : tx.person,
      amount: Number(s.amount) || 0, splits:undefined, _splitPart: true }));
  });
}
function accountByName(name) { return require('./lib/account-names').find(db,name); }
function resolvedPerson(tx) {
  if (tx.person) return tx.person;
  const acc = accountByName(tx.account);
  return (acc && acc.person) || 'Unassigned';
}
function ensureAccount(name, person) {
  if (!name) return;
  if (!accountByName(name)) db.accounts.push({ id: id(), name, type: 'other', person: person || '', institution: '', balance: 0, source: 'import', createdAt: nowIso() });
}

function validAccount(a, res) {
  if(a.owners!==undefined&&(!Array.isArray(a.owners)||new Set(a.owners).size!==a.owners.length||a.owners.some(name=>typeof name!=='string'||!db.users.some(u=>u.name===name)))){res.status(400).json({error:'Choose owners from the existing household profiles.'});return false;}
  if (typeof a.name !== 'string' || !a.name.trim() || !['checking','savings','credit','investment','cash','other'].includes(a.type) ||
      !Number.isFinite(Number(a.balance)) || (a.minimumPayment !== undefined && (!Number.isFinite(Number(a.minimumPayment)) || Number(a.minimumPayment) < 0))) {
    res.status(400).json({ error: 'Enter an account name, valid type, balance, and nonnegative minimum payment.' }); return false;
  }
  const offer=a.welcomeOffer;
  if(offer!==undefined&&(a.type!=='credit'||!offer||typeof offer.terms!=='string'||offer.terms.length>1500||
    !['unverified','in-progress','completed','expired'].includes(offer.status)||
    (offer.deadline!==''&&!validMovementDate(offer.deadline)))){
    res.status(400).json({error:'Check the welcome offer terms, date and status.'});return false;
  }
  try{require('./lib/card-cash-plan').validate(a);}catch(error){res.status(400).json({error:error.message});return false;}
  return true;
}

function validTransaction(tx,res){
  const date=tx.date;
  if(typeof tx.merchant!=='string'||!tx.merchant.trim()||typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||tx.amount===null||tx.amount===''||!Number.isFinite(Number(tx.amount))){res.status(400).json({error:'Enter a valid date, merchant, and amount.'});return false;}
  if(tx.displayName!==undefined&&(typeof tx.displayName!=='string'||!tx.displayName.trim()||tx.displayName.length>200)){res.status(400).json({error:'Enter a display name up to 200 characters.'});return false;}
  if(tx.mcc!==undefined&&tx.mcc!==''&&!/^\d{4}$/.test(String(tx.mcc))){res.status(400).json({error:'MCC must be four digits, or blank.'});return false;}
  for(const key of ['category','account','person','notes','tags'])if(tx[key]!==undefined&&typeof tx[key]!=='string'){res.status(400).json({error:'Transaction fields must be text.'});return false;}
  return true;
}
function validLoan(loan,res){
  const numeric=['originalAmount','apr','monthlyPayment'];
  if(typeof loan.name!=='string'||!loan.name.trim()||!Number.isFinite(Number(loan.balance))||numeric.some(k=>loan[k]!==undefined&&loan[k]!==null&&loan[k]!==''&&(!Number.isFinite(Number(loan[k]))||Number(loan[k])<0))){res.status(400).json({error:'Enter a loan name, finite balance, and nonnegative APR, payment and original principal when known.'});return false;}
  if(['balanceAsOf','startDate','repaymentStartDate','maturityDate','nextDueDate'].some(k=>loan[k]&&!require('./lib/payroll').validDate(loan[k]))){res.status(400).json({error:'Enter valid loan dates.'});return false;}
  if(loan.includeInOverview!==undefined&&typeof loan.includeInOverview!=='boolean'){res.status(400).json({error:'Overview visibility must be on or off.'});return false;}
  return true;
}
function validPlanning(key,b,res){
 const positive=(v,zero=true)=>v!==''&&v!==null&&Number.isFinite(Number(v))&&(zero?Number(v)>=0:Number(v)>0);
 const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 let error='';
 if(key==='budgets'&&(!String(b.category||'').trim()||!positive(b.monthlyLimit)||b.startMonth&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(b.startMonth)||b.group&&!['Fixed','Flexible','Non-monthly'].includes(b.group)||b.overrides&&Object.entries(b.overrides).some(([m,v])=>!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)||!positive(v))))error='Enter a category, nonnegative budget and valid month/group.';
 if(key==='buckets'&&(!String(b.name||'').trim()||!positive(b.targetAmount,false)||!positive(b.currentAmount)||b.targetDate&&!date(b.targetDate)||b.monthlyContribution!==undefined&&!positive(b.monthlyContribution)))error='Enter a goal name, positive target, nonnegative balance/contribution and valid target date.';
 if(key==='bills'&&((b.status&&!['active','paused','cancelled'].includes(b.status))||(b.billGroup&&!['household','personal'].includes(b.billGroup))||(b.startDate&&!date(b.startDate))||(b.endDate&&!date(b.endDate))||(b.startDate&&b.endDate&&b.startDate>b.endDate)))error='Review bill status and start/end dates.';
 if(key==='bills'){try{require('./lib/budget-shares').validate(db,b);}catch(e){error=e.message;}}
 if(key==='bills'&&['statementDate','amountReviewedStatementDate'].some(k=>b[k]&&!date(b[k])))error='Choose a valid statement date.';
 if(key==='bills'&&(b.providerDueDate&&!date(b.providerDueDate)||b.matchMerchant!==undefined&&(typeof b.matchMerchant!=='string'||b.matchMerchant.length>200)))error='Check the merchant match and provider payment date.';
 if(key==='bills'&&(b.paymentMethod&&!['direct','chexy'].includes(b.paymentMethod)||b.paymentMethod==='chexy'&&(!date(b.providerDueDate)||b.chargeLeadBusinessDays!==undefined&&(!Number.isInteger(Number(b.chargeLeadBusinessDays))||Number(b.chargeLeadBusinessDays)<1||Number(b.chargeLeadBusinessDays)>15))||b.providerScheduleAnchorDate&&!date(b.providerScheduleAnchorDate)||b.providerDueDayRule&&!['calendar','next-business-day'].includes(b.providerDueDayRule)))error='Check the payment method, provider date and business-day lead time.';
 if(key==='bills'&&b.processingFeePercent!==undefined&&(!Number.isFinite(Number(b.processingFeePercent))||Number(b.processingFeePercent)<0||Number(b.processingFeePercent)>100))error='Enter a processing fee from 0 to 100%.';
 if(key==='bills'&&(!String(b.name||'').trim()||!positive(b.amount)||!['weekly','biweekly','monthly','quarterly','semiannual','yearly','one-time'].includes(b.frequency||'monthly')||(!date(b.nextDueDate)&&!(b.frequency==='one-time'&&b.paymentMethod!=='chexy'&&!b.nextDueDate))))error='Enter a bill name, nonnegative amount, frequency and valid due date.';
 if(key==='holdings'&&(!String(b.name||'').trim()||!positive(b.currentValue)||!positive(b.costBasis??0)))error='Enter a holding name and nonnegative value and cost.';
 if(key==='scenarios'&&(!String(b.name||'').trim()||!positive(b.start)||!positive(b.monthly)||!positive(b.rate)||Number(b.rate)>50||![1,5,10,20,30].includes(Number(b.years))))error='Enter a name, nonnegative assumptions, growth up to 50% and a supported duration.';
 if(error){res.status(400).json({error});return false;}return true;
}
// ---------- generic CRUD helper ----------
function crud(app, route, key, fields) {
  app.get(route, requireAuth, (req, res) => res.json({ items: key==='accounts'?readDb(req)[key].map(a=>require('./lib/account-names').identity(a)):readDb(req)[key] }));
  app.post(route, requireAuth, (req, res) => {
    if(key==='accounts'&&req.body.displayName!==undefined)req.body.name=req.body.displayName;
    if (key === 'accounts' && !validAccount(req.body, res)) return;
    if(key==='accounts'){try{require('./lib/account-names').validate(db,null,req.body.name);}catch(e){return res.status(400).json({error:e.message});}}
    if(key==='loans'&&!validLoan(req.body,res))return;
    if(!validPlanning(key,req.body,res))return;
    if(key==='accounts'&&req.body.owners!==undefined)req.body.person=req.body.owners.length>1?'Household / Joint':req.body.owners[0]||'';
    const item = { id: id(), createdAt: nowIso(), source: 'manual' };
    for (const f of fields) if (req.body && req.body[f] !== undefined) item[f] = req.body[f];
    if(key==='budgets'&&db.budgets.some(b=>b.category.toLowerCase()===String(item.category).toLowerCase()&&(b.person||'').toLowerCase()===(item.person||'').toLowerCase()))return res.status(409).json({error:'This owner already has a budget for that category. Edit its template or monthly plan.'});
    if(key==='accounts'){item.sourceName=item.name;item.displayName=item.name;}
    if(key==='bills'){if(item.paymentMethod==='chexy')item.nextDueDate=require('./lib/canadian-business-days').shift(item.providerDueDate,-Number(item.chargeLeadBusinessDays??3));item.scheduleAnchorDate=item.nextDueDate;if(item.paymentMethod==='chexy')item.providerScheduleAnchorDate||=item.providerDueDate;}
    db[key].push(item); saveDb(); res.json({ item });
  });
  app.put(route + '/:id', requireAuth, (req, res) => {
    const item = db[key].find(x => x.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if(key==='accounts'&&req.body.sourceName!==undefined&&req.body.sourceName!==require('./lib/account-names').identity(item).sourceName)return res.status(400).json({error:'Imported names stay unchanged. Edit the display name.'});
    if(key==='accounts'&&req.body.displayName!==undefined)req.body.name=req.body.displayName;
    if (key === 'accounts' && !validAccount({ ...item, ...req.body }, res)) return;
    if(key==='loans'&&!validLoan({...item,...req.body},res))return;
    if(!validPlanning(key,{...item,...req.body},res))return;
    if(key==='accounts'&&req.body.owners!==undefined)req.body.person=req.body.owners.length>1?'Household / Joint':req.body.owners[0]||'';
    if(key==='bills'&&req.body.providerDueDate&&req.body.providerDueDate!==item.providerDueDate)req.body.providerScheduleAnchorDate=req.body.providerDueDate;
    if(key==='bills'&&req.body.nextDueDate!==undefined&&req.body.nextDueDate!==item.nextDueDate)item.scheduleAnchorDate=req.body.nextDueDate;
    if(key==='loans'&&req.body.balance!==undefined&&(Number(req.body.balance)!==Number(item.balance)||req.body.balanceAsOf&&req.body.balanceAsOf!==item.balanceAsOf)){delete item.paymentBalanceAnchor;item.balanceAsOf=req.body.balanceAsOf||todayStr();}
    if(key==='loans'&&item.paymentBalanceAnchor&&req.body.nextDueDate&&req.body.nextDueDate!==item.nextDueDate)item.paymentBalanceAnchor.nextDueDate=req.body.nextDueDate;
    const previousGoalAmount=key==='buckets'?Number(item.currentAmount):null;const previousLoanBalance=key==='loans'?Number(item.balance):null;
    if(key==='accounts'&&req.body.name!==undefined){try{req.body.name=req.body.name.trim();require('./lib/account-names').rename(db,item,req.body.name,{actor:req.user.name,id});}catch(e){return res.status(400).json({error:e.message});}}
    for (const f of fields) if (req.body && req.body[f] !== undefined) item[f] = req.body[f];
    if(key==='bills'&&item.paymentMethod==='chexy')item.nextDueDate=require('./lib/canadian-business-days').shift(item.providerDueDate,-Number(item.chargeLeadBusinessDays??3));
    if(key==='loans'&&req.body.balanceAsOf&&Number(item.balance)!==previousLoanBalance){db.balanceHistory.push({id:id(),key:'loan:'+item.id,at:item.balanceAsOf+'T12:00:00.000Z',balanceCents:Math.round(Number(item.balance)*100),person:item.person||'',group:'loans',deleted:false,source:'loan-document-update'});}
    if(key==='buckets'&&Number(item.currentAmount)!==previousGoalAmount)db.goalEvents.push({id:id(),goalId:item.id,person:item.person||'',date:todayStr(),amount:round(Number(item.currentAmount)-previousGoalAmount),kind:'balance-adjustment',note:'Goal balance edited'});
    saveDb(); res.json({ item });
  });
  app.delete(route + '/:id', requireAuth, (req, res) => {
    const before = db[key].length;
    db[key] = db[key].filter(x => x.id !== req.params.id);
    if (db[key].length === before) return res.status(404).json({ error: 'Not found' });
    saveDb(); res.json({ ok: true });
  });
}

// ---------- app ----------
if(syncOwnerProfiles(db))saveDb();
if(require('./lib/funds-bills-migration')(db,id))saveDb();
if(require('./lib/chexy-timing-migration')(db))saveDb();
const app = express();
app.use(express.json({ limit: '25mb' }));
// A command-line import or another server may have committed new records.
app.use('/api', (_req,_res,next)=>{try{if(store.getRevision()!==store.revision)db=store.load();next();}catch(e){next(e);}});
app.use(express.static(path.join(__dirname, 'public'),{setHeaders:(res,file)=>{if(/\.(?:js|css|html)$/.test(file))res.setHeader('Cache-Control','no-cache');}}));

require('./lib/sign-in').install(app,{getDb:()=>db,saveDb,requireAuth,currentUser,hashPassword,verifyPassword,publicUser});

app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 8)
    return res.status(400).json({ error: 'Name, email, and a password of 8+ characters are required.' });
  if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase()))
    return res.status(409).json({ error: 'That email is already registered on this instance.' });
  const { salt, hash } = hashPassword(password);
  const user = { id: id(), name, email, salt, passwordHash: hash, createdAt: nowIso() };
  db.users.push(user); saveDb();
  res.json({ user: publicUser(user), householdUsers: db.users.length });
});
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.users.find(u => u.email.toLowerCase() === String(email || '').toLowerCase());
  if (!user || !user.passwordHash || !verifyPassword(password || '', user.salt, user.passwordHash))
    return res.status(401).json({ error: 'Wrong email or password.' });
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions.push({ tokenHash: crypto.createHash('sha256').update(token).digest('hex'), userId: user.id,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5).toISOString() });
  saveDb();
  res.setHeader('Set-Cookie', `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`);
  res.json({ user: publicUser(user) });
});
// ---------- profiles: tap-to-sign-in, no password (owner's choice, v3.3) ----------
// WARNING: /api/profiles lists names and /api/profiles/select signs in as any
// profile with no credential check. That is deliberate for a private,
// two-person household app, and it is why the README says: keep this app on
// a private network and do NOT expose it to the public internet without
// proxy-level authentication in front of it.
app.get('/api/profiles', (_req, res) => {
  if(syncOwnerProfiles(db))saveDb();
  res.json({ profiles: db.users.map(u => ({ id: u.id, name: u.name, pinEnabled: !!u.pinHash && !!u.passwordHash })) });
});
app.post('/api/profiles', (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();
  if (!name||['unassigned','joint','household'].includes(name.toLowerCase())) return res.status(400).json({ error: 'Use a real owner name for a profile.' });
  const existing=db.users.find(u=>u.name.toLowerCase()===name.toLowerCase());if(existing)return res.json({user:publicUser(existing)});
  if(db.users.length&&!ownerOptions(db).some(o=>o.value.toLowerCase()===name.toLowerCase()))return res.status(400).json({error:'Assign an account to this owner first; their profile will be available automatically.'});
  const user = { id: id(), name, email: '', salt: '', passwordHash: null, createdAt: nowIso() };
  db.users.push(user); saveDb();
  res.json({ user: publicUser(user) });
});
app.post('/api/profiles/select', (req, res) => {
  const user = db.users.find(u => u.id === (req.body && req.body.userId));
  if (!user) return res.status(404).json({ error: 'That profile does not exist.' });
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions.push({ tokenHash: crypto.createHash('sha256').update(token).digest('hex'), userId: user.id,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5).toISOString() });
  saveDb();
  res.setHeader('Set-Cookie', `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`);
  res.json({ user: publicUser(user) });
});
app.post('/api/logout', (req, res) => {
  const token = parseCookies(req).session;
  if (token) { const h = crypto.createHash('sha256').update(token).digest('hex'); db.sessions = db.sessions.filter(s => s.tokenHash !== h); saveDb(); }
  res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user), householdUsers: db.users.map(publicUser) }));

app.get('/api/accounts-overview', requireAuth, (req, res) => {
  readDb(req);
  if (captureBalances(db)) saveDb();
  const days = [30,90,180,365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const period=['1m','3m','6m','ytd','1y','all'].includes(req.query.period)?req.query.period:undefined;
  const frequency=['monthly','quarterly','yearly'].includes(req.query.frequency)?req.query.frequency:'monthly';
  res.json(accountOverview(db, {days,period,frequency,owner:String(req.query.scopeOwner||req.query.owner||''),group:String(req.query.group||''),account:String(req.query.account||''),query:String(req.query.q||''),minAmount:req.query.minAmount,maxAmount:req.query.maxAmount}));
});

app.get('/api/owners',requireAuth,(_req,res)=>res.json({items:ownerOptions(db)}));
app.get('/api/preferences',requireAuth,(req,res)=>res.json({defaultView:req.user.preferences?.defaultView==='everyone'?'everyone':'me',layout:require('./public/layout-model').normalize(req.user.preferences?.layout)}));
app.put('/api/preferences/layout',requireAuth,(req,res)=>{try{const layout=require('./public/layout-model').normalize(req.body.layout);req.user.preferences={...req.user.preferences,layout};saveDb();res.json({layout});}catch(e){res.status(400).json({error:e.message});}});
app.put('/api/preferences',requireAuth,(req,res)=>{
  if(!['me','everyone'].includes(req.body.defaultView))return res.status(400).json({error:'Choose Me or Everyone.'});
  req.user.preferences={...req.user.preferences,defaultView:req.body.defaultView};saveDb();res.json(req.user.preferences);
});


function accountUploads(db,record,kind){
 const balanceIds=new Set((db.balanceImportRows||[]).filter(r=>require('./lib/account-names').matches(record,r.accountName)).map(r=>r.importId));
 const balances=(db.balanceImports||[]).filter(i=>i.status==='imported'&&(balanceIds.has(i.id)||i.mapping?.some(m=>require('./lib/account-names').matches(record,m.name)&&m.include))).map(i=>({id:i.id,kind:'Balances',filename:i.filename,uploadedAt:i.importedAt||i.createdAt,through:i.to||null}));
 const transactions=(db.transactionImports||[]).filter(i=>i.status==='committed'&&i.rows.some(r=>(r.include||r.duplicate||r.reconcileId)&&!r.error&&!r.excluded&&require('./lib/account-names').matches(record,r.transaction.account))).map(i=>({id:i.id,kind:'Transactions',filename:i.filename,uploadedAt:i.committedAt||i.createdAt,through:i.rows.filter(r=>(r.include||r.duplicate||r.reconcileId)&&!r.error&&!r.excluded&&require('./lib/account-names').matches(record,r.transaction.account)&&!r.error).reduce((d,r)=>r.transaction.date>d?r.transaction.date:d,'')}));
 return [...balances,...transactions].sort((a,b)=>String(b.uploadedAt).localeCompare(String(a.uploadedAt))).slice(0,5);
}
app.get('/api/account-detail/:kind/:id',requireAuth,(req,res)=>{
  if(!['account','loan'].includes(req.params.kind))return res.status(404).json({error:'Account not found.'});
  const kind=req.params.kind,collection=kind==='loan'?'loans':'accounts',view=readDb(req);
  const record=view[collection].find(a=>a.id===req.params.id);
  if(!record)return res.status(404).json({error:'This account is not in the selected owner view.'});
  const key=kind+':'+record.id;
  const period=['1m','3m','6m','ytd','1y','all'].includes(req.query.period)?req.query.period:'6m';
  const chart=accountOverview(db,{account:key,period});
  const debt=kind==='loan'||record.type==='credit';
  const history=chart.history.map(p=>({...p,value:debt?-p.value:p.value,accountLabel:debt?'Amount owed':'Balance'}));
  res.json({record:{...(kind==='account'?require('./lib/account-names').identity(record):record),kind,key},history,historyStart:chart.historyStart,
    transactions:view.transactions.filter(t=>t.accountId===record.id||require('./lib/account-names').matches(record,t.account)).sort((a,b)=>b.date.localeCompare(a.date)),
    holdings:view.holdings.filter(h=>h.account===record.name),
    uploads:accountUploads(db,record,kind),
    statement:record.type==='credit'?require('./lib/card-statement').estimate(db,record):null,
    lastRecordedAt:db.balanceHistory.filter(h=>h.key===key).at(-1)?.at||null,
    payoff:kind==='loan'?loanProgress(record):null});
});

// Balance CSVs are a separate import from transaction CSVs.
app.get('/api/balance-imports', requireAuth, (req,res)=>{
 res.json({items:require('./lib/balance-import').listBalanceImports(db,String(req.query.scopeOwner||''))});
});
app.post('/api/balance-imports', requireAuth, (req,res)=>{
  try { if(req.body.account&&!db.accounts.some(a=>a.name===req.body.account)&&!db.loans.some(a=>a.name===req.body.account))throw Error('Choose an existing account for missing account names.');if(req.body.owner&&!db.users.some(u=>u.name===req.body.owner))throw Error('Choose an existing owner.');const item=stageBalances(db,String(req.body.csvText||''),req.body.filename,{account:String(req.body.account||''),owner:String(req.body.owner||'')});require('./lib/import-owner').assertAccounts(db,item.mapping.map(m=>({transaction:{account:m.name},excluded:m.include===false})),req.query.importOwner);const staged=db.balanceImports.find(i=>i.id===item.id);if(staged)staged.importOwner=req.query.importOwner||null;store.save(db);res.json({item}); }
  catch(e){db=store.load();res.status(400).json({error:e.message});}
});
app.post('/api/balance-imports/:id/commit', requireAuth, (req,res)=>{
  try { const staged=db.balanceImports.find(i=>i.id===req.params.id);require('./lib/import-owner').assertAccounts(db,(req.body.mapping||staged?.mapping||[]).map(m=>({transaction:{account:m.name},excluded:m.include===false})),staged?.importOwner);const result=importBalances(db,req.params.id,req.body);store.save(db);res.json({result}); }
  catch(e){db=store.load();res.status(400).json({error:e.message});}
});

// accounts / budgets / buckets / bills / holdings / loans
crud(app, '/api/accounts', 'accounts', ['name','type','person','owners','institution','balance','creditLimit','creditLimitType','minimumPayment','dueDay','payFromAccountId','statementCloseDate','statementIssueDate','paymentDueDate','statementBalance','statementBalanceAsOf','balanceAsOf','includeInOverview','note','welcomeOffer']);
app.post('/api/accounts/:id/reward-history',requireAuth,(req,res)=>{
 const account=readDb(req).accounts.find(a=>a.id===req.params.id&&a.type==='credit');
 if(!account)return res.status(404).json({error:'Choose a credit card.'});
 const {date,unit}=req.body,amount=Number(req.body.amount),cents=Math.round(amount*100);
 if(!validMovementDate(date)||!['points','cashback'].includes(unit)||req.body.amount===''||
   req.body.amount==null||!Number.isFinite(amount)||amount<0||amount>1e9||
   (unit==='points'&&!Number.isInteger(amount))){
   return res.status(400).json({error:'Enter a date and a valid rewards balance.'});
 }
 const record=db.accounts.find(a=>a.id===account.id);
 const entry={date,unit,amount:cents/100};
 record.rewardHistory=(record.rewardHistory||[]).filter(r=>r.date!==date||r.unit!==unit);
 record.rewardHistory.push(entry);
 saveDb();res.json({entry});
});
crud(app, '/api/budgets', 'budgets', ['category','monthlyLimit','note','person','group','rollover','startMonth','overrides']);
crud(app, '/api/buckets', 'buckets', ['name','targetAmount','currentAmount','accountId','note','person','targetDate','monthlyContribution']);
crud(app, '/api/bills', 'bills', ['name','kind','category','amount','lastAmount','nextDueDate','frequency','payFromAccountId','person','autopay','note','detectionKey','processingFeePercent','status','startDate','endDate','billGroup','matchMerchant','providerDueDate','paymentMethod','providerScheduleAnchorDate','chargeLeadBusinessDays','providerEndOfMonth','providerDueDayRule','linkedLoanId','statementDate','amountReviewedStatementDate','budgetShares','budgetFeePerson']);
crud(app, '/api/holdings', 'holdings', ['name','symbol','assetType','account','shares','currentValue','costBasis','person']);
crud(app, '/api/loans', 'loans', ['name','lender','type','originalAmount','balance','apr','monthlyPayment','nextDueDate','payFromAccountId','person','note','includeInOverview','balanceAsOf','startDate','repaymentStartDate','maturityDate','remainingTermMonths','sourceDocument','paymentEndOfMonth']);

crud(app,'/api/scenarios','scenarios',['name','person','start','monthly','rate','years']);
require('./lib/vehicle-routes')(app,{requireAuth,getDb:()=>db,readDb,saveDb,id});
require('./lib/financial-analysis-routes')(app,{requireAuth,getDb:()=>db});
require('./lib/investment-history-routes')(app,{requireAuth,getDb:()=>db,readDb,saveDb});
require('./lib/investment-routes')(app,{requireAuth,getDb:()=>db,readDb,saveDb,id,directory:DATA_DIR});
require('./lib/other-investment-routes')(app,{requireAuth,getDb:()=>db,readDb,saveDb,id});
require('./lib/ibkr-flex-routes')(app,{requireAuth,getDb:()=>db,readDb,saveDb,directory:DATA_DIR,backupDb:async()=>{const folder=path.join(DATA_DIR,'backups');fs.mkdirSync(folder,{recursive:true,mode:0o700});await store.backup(path.join(folder,'before-ibkr-flex-'+Date.now()+'.sqlite'));}});
require('./lib/cash-calendar').install(app,{requireAuth,getDb:()=>db,readDb,saveDb,id});
require('./lib/cushion-routes')(app,{requireAuth,getDb:()=>db,readDb,saveDb,id});
require('./lib/funds-setup-routes')(app,{requireAuth,getDb:()=>db,readDb,saveDb,id});
require('./lib/upload-center-routes')(app,{requireAuth,getDb:()=>db,readDb});
require('./lib/expense-capture-routes')(app,{requireAuth,getDb:()=>db,readDb,saveDb,id,directory:DATA_DIR});
require('./lib/payroll-routes')(app,{requireAuth,getDb:()=>db,readDb,saveDb,id,directory:DATA_DIR});
require('./lib/budget-workspace-routes')(app,{requireAuth,getDb:()=>db,readDb,saveDb,id});
require('./lib/planning-routes')(app,{requireAuth,getDb:()=>db,readDb,saveDb,id});

require('./lib/movement-routes')(app,{requireAuth,getDb:()=>db,readDb,saveDb,id});
require('./lib/import-ai-routes')(app,{requireAuth,getDb:()=>db,saveDb,id,directory:DATA_DIR});
require('./lib/attachment-routes')(app,{requireAuth,getDb:()=>db,readDb,saveDb,id,directory:DATA_DIR});

// Record the purchase and goal withdrawal in a single persisted change.
app.post('/api/buckets/:id/spend', requireAuth, (req, res) => {
  const goal = db.buckets.find(g => g.id === req.params.id);
  const account = db.accounts.find(a => a.id === req.body.accountId);
  const amount = round(req.body.amount);
  const { merchant, date, category } = req.body;
  if (!goal) return res.status(404).json({ error: 'Goal not found.' });
  if (!account || !Number.isFinite(Number(req.body.amount)) || amount <= 0 || amount > round(goal.currentAmount))
    return res.status(400).json({ error: 'Choose an account and an amount within the goal’s available balance.' });
  if (typeof merchant !== 'string' || !merchant.trim() || typeof category !== 'string' || !category.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)
    return res.status(400).json({ error: 'Enter a merchant, category and valid date.' });
  const tx = { id: id(), date, merchant: merchant.trim(), category: category.trim(), account: account.name,
    person: req.body.person || goal.person || account.person || req.user.name, amount: -amount, notes: 'Spent from goal: ' + goal.name, goalId: goal.id,
    isTransfer: false, source: 'manual', addedBy: req.user.name, createdAt: nowIso() };
  tx.dedupeKey = tx.id;
  goal.currentAmount = round(goal.currentAmount - amount);
  db.goalEvents.push({id:id(),goalId:goal.id,person:goal.person||'',date,amount:-amount,kind:'purchase',transactionId:tx.id,accountId:account.id,note:merchant});
  db.transactions.push(tx);
  saveDb();
  res.json({ goal, transaction: tx });
});

// bills: mark paid advances the due date by frequency
const FREQ_STEP = { weekly: d => addDays(d, 7), biweekly: d => addDays(d, 14), monthly: d => addMonths(d, 1),
  quarterly: d => addMonths(d, 3), semiannual: d => addMonths(d, 6), yearly: d => addMonths(d, 12), 'one-time': null };
app.post('/api/bills/:id/pay', requireAuth, (req, res) => {
  const bill = db.bills.find(b => b.id === req.params.id);
  if (!bill) return res.status(404).json({ error: 'Not found' });
  if(req.body.amount!==undefined&&(!Number.isFinite(Number(req.body.amount))||Number(req.body.amount)<0))return res.status(400).json({error:'Enter a nonnegative payment amount.'});
  if(req.body.date&&!validMovementDate(req.body.date))return res.status(400).json({error:'Enter a valid payment date.'});const paidDate=req.body.date||todayStr();
  const undated=bill.frequency==='one-time'&&!bill.nextDueDate&&bill.paymentMethod!=='chexy';
  if(['paused','cancelled'].includes(bill.status))return res.status(400).json({error:'This bill is inactive.'});
  const dueDate=undated?paidDate:req.body.dueDate||bill.nextDueDate;if(!validMovementDate(dueDate)||(!undated&&!require('./lib/bill-schedule').dates({...bill,nextDueDate:dueDate},dueDate,dueDate).includes(dueDate)))return res.status(400).json({error:'Choose a scheduled bill occurrence.'});if(db.billPayments.some(p=>p.billId===bill.id&&p.dueDate===dueDate))return res.status(400).json({error:'This bill occurrence is already paid.'});
  bill.lastAmount=req.body.amount!==undefined?round(req.body.amount):require('./lib/bill-cost')(bill);bill.lastPaidAt=paidDate;
  db.billPayments.push({id:id(),billId:bill.id,name:bill.name,person:bill.person||'',date:paidDate,amount:bill.lastAmount,accountId:bill.payFromAccountId||'',dueDate,...(bill.paymentMethod==='chexy'?{providerDueDate:require('./lib/bill-charge-dates').providerDate(bill,dueDate)}:{})});
  const step = FREQ_STEP[bill.frequency || 'monthly'];
  if (step&&dueDate===bill.nextDueDate) {bill.scheduleAnchorDate||=bill.nextDueDate||todayStr();const next=require('./lib/bill-schedule').dates(bill,addDays(bill.nextDueDate||todayStr(),1),addDays(bill.nextDueDate||todayStr(),370))[0];bill.nextDueDate=next||step(bill.nextDueDate||todayStr());}
  else if(!step)bill.status='cancelled';
  if(bill.paymentMethod==='chexy')bill.providerDueDate=require('./lib/bill-charge-dates').providerDate(bill,bill.nextDueDate)||bill.providerDueDate;
  saveDb(); res.json({ ok: true, bill });
});
function occurrences(billLike, fromStr, days) {
  // returns due dates in (from-1 ... from+days], counting overdue first occurrence
  const out = []; let d = billLike.nextDueDate; if (!d) return out;
  const end = addDays(fromStr, days);
  let guard = 0;
  while (d <= end && guard++ < 120) {
    out.push(d);
    const step = FREQ_STEP[billLike.frequency || 'monthly'];
    if (!step) break;
    d = step(d);
    if ((billLike.frequency === 'monthly' || !billLike.frequency) && out.length >= 2 && billLike._monthlyOnly) break;
  }
  return out;
}

require('./lib/tax-documents')(app,{requireAuth,getDb:()=>db,id,dataDir:DATA_DIR});

// ---------- transactions ----------
require('./lib/transaction-routes')(app,{requireAuth,getDb:()=>db,readDb,saveDb,id,ensureAccount,isTransferTx});
// The legacy import URL now stages rows; it never commits purchases automatically.
app.post('/api/import',requireAuth,(req,res)=>res.status(409).json({error:'Use /api/transaction-imports to preview and explicitly commit this CSV.'}));
function decorateTransaction(t){const link=db.transferLinks.find(l=>l.id===t.transferLinkId);const account=db.accounts.find(a=>a.name===t.account);return {...t,sharedClaimId:db.reimbursements.find(c=>c.transactionId===t.id)?.id||'',accountId:account?.id||'',accountOwners:account?.owners?.length?account.owners:account?.person?[account.person]:[],displayName:t.displayName||t.merchant||t.originalStatement||'Unknown',bankStatus:t.bankStatus||'',originalName:t.originalName||t.originalStatement||t.merchant,reviewRequired:!t.reviewed&&!!(t.reviewRequired||t.reviewAssignee),relatedAccounts:link?[link.fromAccountId,link.toAccountId].map(id=>db.accounts.find(a=>a.id===id)).filter(Boolean).map(a=>({id:a.id,name:a.name,type:a.type})):[],transferLink:link?{id:link.id,kind:link.kind,fromAccountId:link.fromAccountId,toAccountId:link.toAccountId}:null};}
app.get('/api/transactions', requireAuth, (req, res) => {
  const view=readDb(req);
  let list = [...view.transactions].sort((a, b) => b.date.localeCompare(a.date))
    .map(t => ({ ...decorateTransaction(t), personResolved: resolvedPerson(t), isTransfer: isTransferTx(t),alreadySeparated:alreadySeparated(t,db.transactions) }));
  const { from, to, month, category, person, account, q, minAmount, maxAmount, review,status, sort='date-desc' } = req.query;
  try{list=require('./lib/transaction-query').filterTransactions(list,req.query,categoryCatalog(db));}catch(e){return res.status(400).json({error:e.message});}
  if(['receipt','retail'].includes(req.query.purchaseKind))list=list.filter(t=>t.purchaseDetails?.kind===req.query.purchaseKind||(req.query.purchaseKind==='receipt'&&db.transactionAttachments.some(a=>a.transactionId===t.id)));

  const ordering={'date-desc':(a,b)=>b.date.localeCompare(a.date),'date-asc':(a,b)=>a.date.localeCompare(b.date),'amount-desc':(a,b)=>Math.abs(b.amount)-Math.abs(a.amount),'amount-asc':(a,b)=>Math.abs(a.amount)-Math.abs(b.amount),'account-asc':(a,b)=>(a.account||'').localeCompare(b.account||''),'account-desc':(a,b)=>(b.account||'').localeCompare(a.account||'')};
  list.sort(ordering[sort]||ordering['date-desc']);
  if(req.query.format==='csv'){const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"',headers=['Pulse Transaction ID','Date','Merchant','Category','Account','Owner','Amount','Tags','Notes','Original Statement','Pulse Row Scope','Split Number','Split Category','Split Amount','Split Owner','Split Note'];return res.json({csv:[headers.map(cell).join(','),...list.flatMap(t=>{const original=db.transactions.find(r=>r.id===t.id)||t,base=[t.id,t.date,t.displayName||t.merchant,t.category,t.account,original.person||'',t.amount,t.tags,t.notes,original.originalStatement||'',t.scopePartial?'partial':'full'];return t.splits?.length?t.splits.map((p,i)=>[...base,i+1,p.category,p.amount,p.person||original.person||'',p.note||''].map(cell).join(',')):[[...base,'','','','',''].map(cell).join(',')];})].join('\r\n')});}
  const totals=summarise(list,{includePending:req.query.includePending==='true'});const eligible=list.filter(t=>!t.hidden&&(req.query.includePending==='true'||!t.pending)&&flowKind(t,db.categories)!=='transfer');
  const offset=Math.max(0,Math.floor(Number(req.query.offset)||0)),limit=Math.min(2000,Math.max(1,Math.floor(Number(req.query.limit)||200)));
  res.json({ offset,limit,transactions: list.slice(offset,offset+limit), total: list.length,summary:{...require('./lib/transaction-statistics').transactionStatistics(list,totals.spending),income:totals.income,spending:totals.spending,net:totals.net,expenseRefunds:totals.expenseRefunds,pendingExcluded:totals.pendingExcluded,hiddenExcluded:totals.hiddenExcluded,transfersExcluded:totals.transfersExcluded,needsReview:list.filter(t=>!t.reviewed&&(t.reviewRequired||t.reviewAssignee)).length,largestIncome:eligible.reduce((n,t)=>Math.max(n,t.amount),0),largestExpense:Math.abs(eligible.reduce((n,t)=>Math.min(n,t.amount),0)),average:list.length?round(list.reduce((n,t)=>n+t.amount,0)/list.length):0,firstDate:list.length?list.reduce((d,t)=>t.date<d?t.date:d,list[0].date):'',lastDate:list.length?list.reduce((d,t)=>t.date>d?t.date:d,list[0].date):''},
    tags:[...new Set(view.transactions.flatMap(t=>String(t.tags||'').split(/[,;]/).map(s=>s.trim()).filter(Boolean)))].sort(),categoryCatalog:categoryCatalog(db),categories: [...new Set(view.transactions.flatMap(t => [t.category,...(t.splits||[]).map(s=>s.category)]))].sort(),
    persons: [...new Set(view.transactions.map(t => resolvedPerson(t)))].sort(),
    accounts: [...new Set(view.transactions.map(t => t.account).filter(Boolean))].sort() });
});
app.get('/api/transaction-tags',requireAuth,(req,res)=>res.json({tags:[...new Set(readDb(req).transactions.flatMap(t=>String(t.tags||'').split(/[,;]/).map(s=>s.trim()).filter(Boolean)))].sort((a,b)=>a.localeCompare(b))}));
app.get('/api/categories',requireAuth,(_req,res)=>res.json({categories:categoryCatalog(db)}));
app.put('/api/categories',requireAuth,(req,res)=>{try{const categories=require('./lib/category-settings').saveCategory(db,req.body,id);saveDb();res.json({categories});}catch(e){res.status(400).json({error:e.message});}});
app.get('/api/categories/usage',requireAuth,(req,res)=>res.json(require('./lib/category-settings').categoryUsage(db,String(req.query.name||''))));
app.put('/api/category-groups/color',requireAuth,(req,res)=>{try{const categories=require('./lib/category-settings').saveParentColor(db,req.body.group,req.body.color,id);saveDb();res.json({categories});}catch(e){res.status(400).json({error:e.message});}});
app.post('/api/category-groups/move',requireAuth,(req,res)=>{try{if(req.body.confirm!==true)throw Error('Confirm the parent category change.');const categories=require('./lib/category-settings').moveParentGroup(db,req.body.from,req.body.to,id);saveDb();res.json({categories});}catch(e){res.status(400).json({error:e.message});}});
app.post('/api/categories/delete',requireAuth,(req,res)=>{try{if(req.body.confirm!==true)throw Error('Confirm deletion first.');const result=require('./lib/category-settings').deleteCategory(db,req.body.name,req.body.replacement,id);saveDb();res.json(result);}catch(e){res.status(400).json({error:e.message});}});
app.get('/api/summary-reconciliation',requireAuth,(req,res)=>{
 const view=readDb(req),included=summarise(view.transactions,{includePending:true});const imports=db.transactionImports.filter(i=>i.status==='committed'),source=[...imports].reverse().find(i=>i.format==='monarch'||!i.format&&/transactions.*csv$/i.test(i.filename))||imports.at(-1);const rows=(source?.rows||[]).filter(r=>!r.error&&(!req.query.scopeOwner||r.transaction.person===req.query.scopeOwner)).map(r=>({...r.original,person:r.transaction.person}));const excluded=(source?.rows||[]).filter(r=>r.excluded&&(!req.query.scopeOwner||r.transaction.person===req.query.scopeOwner));res.json({current:{count:view.transactions.length,posted:summarise(view.transactions),includingPending:included},source:{filename:source?.filename||'',count:rows.length,summary:summarise(rows,{includePending:true}),excludedRows:excluded.length,lastDate:rows.reduce((d,t)=>t.date>d?t.date:d,'')},explanation:'Expense-category refunds reduce spending. Income-category reversals reduce income. Transfers are excluded. Pending entries are optional. Account exclusions remain in force.'});
});
app.get('/api/transaction-options',requireAuth,(req,res)=>{const view=readDb(req);res.json({categories:categoryCatalog(db),merchants:[...new Set(view.transactions.map(t=>t.displayName||t.merchant).filter(Boolean))].sort(),accounts:view.accounts.map(a=>({id:a.id,name:a.name})),owners:[...new Set(view.transactions.flatMap(t=>[resolvedPerson(t),...(t.splits||[]).map(s=>s.person)]).filter(Boolean))].sort(),tags:[...new Set(view.transactions.flatMap(t=>String(t.tags||'').split(/[,;]/).map(x=>x.trim()).filter(Boolean)))].sort(),goals:view.buckets.map(g=>({id:g.id,name:g.name}))});});
app.get('/api/transaction-insight',requireAuth,(req,res)=>{try{const view=readDb(req),rows=require('./lib/transaction-query').filterTransactions(view.transactions.map(t=>({...t,personResolved:resolvedPerson(t)})),req.query,categoryCatalog(db)),period=req.query.period||'monthly';res.json({period,timeline:require('./lib/transaction-insight').transactionTimeline(rows,period,db.categories,req.query.includePending==='true'),summary:summarise(rows,{includePending:req.query.includePending==='true'})});}catch(e){res.status(400).json({error:e.message});}});
app.get('/api/transactions/:id',requireAuth,(req,res)=>{const t=readDb(req).transactions.find(t=>t.id===req.params.id);if(!t)return res.status(404).json({error:'Transaction not found in this owner view.'});res.json({transaction:{...decorateTransaction(t),personResolved:resolvedPerson(t),isTransfer:isTransferTx(t),alreadySeparated:alreadySeparated(t,db.transactions)}});});
app.post('/api/transactions/review',requireAuth,(req,res)=>{
 const ids=req.body.ids;if(!Array.isArray(ids)||!ids.length||ids.length>2000||typeof req.body.reviewed!=='boolean')return res.status(400).json({error:'Select transactions and a review state.'});
 const visible=readDb(req).transactions;
 if(ids.some(id=>!visible.some(t=>t.id===id&&!t.scopePartial)))return res.status(400).json({error:'Choose Everyone to review a transaction shared across owners.'});
 const selected=new Set(ids);for(const tx of db.transactions)if(selected.has(tx.id)){db.transactionEvents.push({id:id(),transactionId:tx.id,kind:'review',at:nowIso(),actor:req.user.name,before:{reviewed:tx.reviewed??false},after:{reviewed:req.body.reviewed}});tx.reviewed=req.body.reviewed;if(!req.body.reviewed)tx.reviewRequired=true;}
 saveDb();res.json({updated:selected.size});
});
app.post('/api/transactions', requireAuth, (req, res) => {
  const { date, merchant, category, amount, account, notes, person } = req.body || {};
  if(!validTransaction(req.body,res))return;
  if(!db.accounts.some(a=>a.name===account))return res.status(400).json({error:'Choose the account this transaction belongs to.'});
  const tx = { id: id(), date, merchant, category: category || 'Uncategorized', account: account || '', person: person || '',
    originalName:merchant,displayName:merchant,notes: notes || '', tags: '', amount: parseFloat(amount), source: 'manual', addedBy: req.user.name, createdAt: nowIso() };
  tx.isTransfer = isTransferTx(tx);
  tx.dedupeKey = crypto.createHash('sha256').update([tx.date, tx.merchant, tx.amount, tx.account, tx.category, tx.id].join('|')).digest('hex');
  ensureAccount(tx.account, tx.person);
  db.transactions.push(tx); saveDb();
  res.json({ transaction: { ...tx, personResolved: resolvedPerson(tx) } });
});
app.put('/api/transactions/:id', requireAuth, (req, res) => {
  const tx = db.transactions.find(t => t.id === req.params.id);
  if (!tx) return res.status(404).json({ error: 'Not found' });
  if(req.body.originalName!==undefined&&req.body.originalName!==(tx.originalName||tx.originalStatement||tx.merchant))return res.status(400).json({error:'Original bank names stay unchanged. Edit the display name instead.'});
  if(req.body.displayName!==undefined)req.body.merchant=req.body.displayName;
  if(req.body.category)req.body.category=require('./lib/category-settings').canonicalCategory(db,req.body.category);
  if(!validTransaction({...tx,...req.body},res))return;
  if(req.body.reviewAssignee&&!db.users.some(u=>u.name===req.body.reviewAssignee))return res.status(400).json({error:'Choose an existing reviewer.'});
  if(req.body.goalId&&!db.buckets.some(g=>g.id===req.body.goalId))return res.status(400).json({error:'Goal not found.'});
  if((tx.transferLinkId||tx.repaymentOriginal||db.reimbursements.some(c=>c.transactionId===tx.id))&&['amount','date','account','category','person','manualTransfer'].some(k=>req.body[k]!==undefined&&req.body[k]!==tx[k]&&!(k==='amount'&&Number(req.body[k])===tx.amount)))return res.status(400).json({error:'Unlink this money movement/shared purchase before changing its amount, date, account or allocation.'});
  let savedSplits;
  if(req.body.splits!==undefined){
    if(tx.transferLinkId||tx.repaymentOriginal||db.reimbursements.some(c=>c.transactionId===tx.id))return res.status(400).json({error:'Unlink the money movement/shared purchase before editing its split.'});
    try{savedSplits=require('./lib/transaction-split-validation').validate({...tx,amount:req.body.amount??tx.amount},req.body.splits,name=>require('./lib/category-settings').canonicalCategory(db,name));}catch(e){return res.status(400).json({error:e.message});}
  }
  const before=JSON.parse(JSON.stringify(tx));
  tx.originalName||=tx.originalStatement||tx.merchant;
  if(req.body.merchant!==undefined)tx.displayName=req.body.merchant;
  if(req.body.purchaseDetails!==undefined){const p=req.body.purchaseDetails;if(!p||!['receipt','retail'].includes(p.kind)||typeof p.reference!=='string'||typeof p.items!=='string'||p.items.length>20000||p.reference.length>500)return res.status(400).json({error:'Enter valid purchase details.'});}
  if(savedSplits===undefined&&req.body.amount!==undefined&&tx.splits?.length&&Math.round(Number(req.body.amount)*100)!==Math.round(tx.amount*100))return res.status(400).json({error:'Remove or update the split before changing the total amount.'});
  for (const f of ['date','merchant','category','account','person','notes','tags','mcc','reviewAssignee','goalId','displayName']) if (req.body[f] !== undefined) tx[f] = req.body[f];

  if (req.body.amount !== undefined) tx.amount = Number(req.body.amount);
  if(savedSplits!==undefined)tx.splits=savedSplits;
  if(req.body.purchaseDetails!==undefined)tx.purchaseDetails=req.body.purchaseDetails;
  if(req.body.hidden!==undefined)tx.hidden=req.body.hidden===true;
  if(req.body.reviewRequired!==undefined)tx.reviewRequired=req.body.reviewRequired===true;
  if(req.body.reviewed!==undefined){tx.reviewed=req.body.reviewed===true;tx.reviewedAt=nowIso();tx.reviewedBy=req.user.name;}
  if (req.body.manualTransfer !== undefined) tx.manualTransfer = req.body.manualTransfer === true;
  tx.isTransfer = isTransferTx(tx);
  db.transactionEvents.push({id:id(),transactionId:tx.id,at:nowIso(),actor:req.user.name,kind:'edit',before,after:{...tx}});
  saveDb(); res.json({ transaction: { ...tx, personResolved: resolvedPerson(tx) } });
});
// Split one transaction into parts (e.g. Costco $200 -> $120 Groceries/Timothy + $80 Household/Partner).
// Parts must sum to the original amount, signs included, so nothing is counted twice or lost.
app.put('/api/transactions/:id/splits', requireAuth, (req, res) => {
  const tx = db.transactions.find(t => t.id === req.params.id);
  if (!tx) return res.status(404).json({ error: 'Not found' });
  if(tx.transferLinkId||tx.repaymentOriginal||db.reimbursements.some(c=>c.transactionId===tx.id))return res.status(400).json({error:'Unlink the money movement/shared purchase before editing its split.'});
  const splits = (req.body && req.body.splits) || [];
  if (!Array.isArray(splits)) return res.status(400).json({ error: 'splits must be a list.' });
  if (splits.length === 0) { db.transactionEvents.push({id:id(),transactionId:tx.id,at:nowIso(),actor:req.user.name,kind:'remove-split',before:{splits:tx.splits||[]},after:{splits:[]}});tx.splits = []; saveDb(); return res.json({ transaction: tx }); }
  if (splits.length < 2) return res.status(400).json({ error: 'A split needs at least 2 parts — or clear the split instead.' });
  const cleaned = splits.map(s => ({ category: s.category || tx.category, person: s.person || '',
    amount: Number(s.amount), note: s.note || '' }));
  if (cleaned.some(s => !Number.isFinite(s.amount) || s.amount === 0||typeof s.category!=='string'||typeof s.person!=='string'||typeof s.note!=='string'))
    return res.status(400).json({ error: 'Every part needs a non-zero amount.' });
  const sum = round(cleaned.reduce((a, s) => a + s.amount, 0));
  if (Math.round(sum*100)!==Math.round(tx.amount*100))
    return res.status(400).json({ error: `Parts add up to ${sum}, but the transaction is ${tx.amount}. They must match exactly so nothing is double-counted.` });
  db.transactionEvents.push({id:id(),transactionId:tx.id,at:nowIso(),actor:req.user.name,kind:'split',before:{splits:tx.splits||[]},after:{splits:cleaned}});tx.splits = cleaned; saveDb();
  res.json({ transaction: { ...tx, personResolved: resolvedPerson(tx) } });
});
app.delete('/api/transactions/:id', requireAuth, (req, res) => {
  const linked=db.transactions.find(t=>t.id===req.params.id);if(linked&&(linked.transferLinkId||linked.repaymentOriginal||db.reimbursements.some(c=>c.transactionId===linked.id)))return res.status(400).json({error:'Unlink this shared payment or transfer before deleting it.'});
  const before = db.transactions.length;
  db.transactions = db.transactions.filter(t => t.id !== req.params.id);
  if (db.transactions.length === before) return res.status(404).json({ error: 'Not found' });
  saveDb(); res.json({ ok: true });
});

// ---------- dashboard ----------
function summarise(list,options={}){
 const normalized=list.map(t=>({...t,person:resolvedPerson(t),splits:t.splits?.map(s=>({...s,person:s.person||resolvedPerson(t)}))}));const summary=financialSummary(normalized,db.categories,options);
 const byAccount=new Map();for(const t of list)if(!t.hidden&&!t.pending&&flowKind(t,db.categories)!=='transfer')byAccount.set(t.account||'No account',(byAccount.get(t.account||'No account')||0)+Math.abs(t.amount));
 return {...summary,byCategory:summary.byCategory.map(c=>({...c,color:categoryInfo(c.label,db.categories).color})),count:list.length,byAccount:[...byAccount].map(([label,total])=>({label,total:round(total)})).sort((a,b)=>b.total-a.total),largest:list.filter(t=>!t.pending&&!t.hidden&&flowKind(t,db.categories)==='expense').sort((a,b)=>a.amount-b.amount).slice(0,5)};
}
app.get('/api/dashboard', requireAuth, (req, res) => {
  const view=readDb(req);
  const range = ['day','week','month','year'].includes(req.query.range) ? req.query.range : 'month';
  const anchor = req.query.date || todayStr();
  const p = periodFor(range, anchor);
  const inPeriod = view.transactions.filter(t => t.date >= p.start && t.date <= p.end);
  const s = summarise(inPeriod);
  const expenseGroups=new Map();
  const spendingMonth=periodFor('month',anchor);
  const monthlySpending=range==='month'?s:summarise(view.transactions.filter(t=>t.date>=spendingMonth.start&&t.date<=spendingMonth.end));
  for(const category of monthlySpending.byCategory){
    const group=categoryInfo(category.label,db.categories).group||'Uncategorized';
    expenseGroups.set(group,(expenseGroups.get(group)||0)+Math.round(category.total*100));
  }
  const spendingGroups=[...expenseGroups].map(([label,cents])=>({label,total:cents/100})).sort((a,b)=>b.total-a.total);
  // Sankey: sources (income by person) -> Household -> destinations (categories + savings, or + deficit source)
  const totalIn = s.income, totalOutCats = s.spending;
  const deficit = Math.max(0, round(totalOutCats - totalIn));
  const savings = Math.max(0, round(totalIn - totalOutCats));
  const sankey = { sources: [...s.incomeByPerson.filter(p=>p.total>0),...s.byCategory.filter(c=>c.total<0).map(c=>({label:'Net refunds · '+c.label,total:-c.total}))], deficit,
    destinations: [...s.byCategory.filter(c=>c.total>0).map(c => ({ label: c.label, total: c.total,color:categoryInfo(c.label,db.categories).color })),...s.incomeByPerson.filter(p=>p.total<0).map(p=>({label:'Income reversal · '+p.label,total:-p.total})), ...(savings > 0 ? [{ label: 'Saved / left over', total: savings }] : [])],
    total: round(s.incomeByPerson.filter(p=>p.total>0).reduce((n,p)=>n+p.total,0)+s.byCategory.filter(c=>c.total<0).reduce((n,c)=>n-c.total,0)+deficit) };
  // Trend buckets
  const trend = [];
  const bucketCount = range === 'day' ? 14 : range === 'week' ? 12 : range === 'year' ? 5 : 12;
  for (let i = bucketCount - 1; i >= 0; i--) {
    const bp = periodFor(range, shiftAnchor(range, anchor, -i));
    const l = view.transactions.filter(t => t.date >= bp.start && t.date <= bp.end);
    const sm = summarise(l);
    trend.push({ label: range === 'month' ? bp.start.slice(0, 7) : range === 'year' ? bp.start.slice(0, 4) : bp.start, income: sm.income, spending: sm.spending });
  }
  // Budgets for the anchor month
  const monthKey = anchor.slice(0, 7);
  const monthTxs = expandSplits(view.transactions.filter(t => t.date.startsWith(monthKey) && !isTransferTx(t)&&!t.pending&&!t.hidden)).filter(t => t.amount < 0);
  const budgetWorkspace=require('./lib/budget-workspace').workspace(require('./lib/budget-shares').view(db,String(req.query.scopeOwner||'')),monthKey);
  const budgetRows=budgetWorkspace.flexPoolSummary?require('./public/budget-expense-sections').sections(budgetWorkspace.families).map(section=>({...section,...(section.kind==='Flexible'?budgetWorkspace.flexPoolSummary:{}),key:section.kind,group:section.kind})):budgetWorkspace.families.filter(f=>f.type==='expense');
  const budgets=budgetRows.map(f=>({id:f.key,category:f.group,planned:f.planned,available:f.available,spent:f.actual,remaining:f.remaining,person:f.person})).map(b=>({...b,monthlyLimit:b.available,over:b.spent>b.available}));
  const transfersInPeriod = view.transfers.filter(t => t.date >= p.start && t.date <= p.end);
  res.json({ period: p, prevAnchor: shiftAnchor(range, anchor, -1), nextAnchor: shiftAnchor(range, anchor, 1),
    ...s, spendingGroups, spendingMonth, sankey, trend, budgets, budgetMonth: monthKey,statementReviews:require('./lib/bill-schedule').agenda(view,new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto'}).format(new Date()),30).upcoming.filter(r=>r.status==='upcoming'&&r.statement?.needsReview).map(r=>({id:r.id,name:r.name,chargeDate:r.date,statementDate:r.statement.date})),
    transfersMoved: round(transfersInPeriod.reduce((x, t) => x + (Number(t.amount) || 0), 0)),
    partnerBalances: partnerBalances(view.transfers) });
});
app.get('/api/cash-flow',requireAuth,(req,res)=>{try{res.json(require('./lib/cash-flow').cashFlow(readDb(req),req.query));}catch(e){res.status(400).json({error:e.message});}});
// Owner-scoped reporting uses split portions and excludes transfers.
app.get('/api/reports',requireAuth,(req,res)=>{try{res.json(require('./lib/reports').report(readDb(req),req.query));}catch(e){res.status(400).json({error:e.message});}});
app.get('/api/report-views',requireAuth,(req,res)=>res.json({items:db.reportViews.filter(v=>v.userId===req.user.id)}));
app.post('/api/report-views',requireAuth,(req,res)=>{const name=String(req.body.name||'').trim();if(!name||name.length>80)return res.status(400).json({error:'Name the report (80 characters or fewer).'});const config={};for(const key of ['from','to','account','category','period','grouping','visual','mode','preset'])if(typeof req.body.config?.[key]==='string')config[key]=req.body.config[key].slice(0,500);const item={id:id(),userId:req.user.id,name,config};db.reportViews.push(item);saveDb();res.json({item});});
app.delete('/api/report-views/:id',requireAuth,(req,res)=>{db.reportViews=db.reportViews.filter(v=>v.id!==req.params.id||v.userId!==req.user.id);saveDb();res.json({ok:true});});
// Backwards-compatible monthly summary (v1)
app.get('/api/summary', requireAuth, (req, res) => {
  const view=readDb(req);
  const months = [...new Set(view.transactions.map(t => t.date.slice(0, 7)))].sort();
  const month = req.query.month || months[months.length - 1] || todayStr().slice(0, 7);
  const s = summarise(view.transactions.filter(t => t.date.startsWith(month)));
  res.json({ month, availableMonths: months, ...s,
    byCategory: s.byCategory.map(c => ({ category: c.label, total: c.total })),
    topMerchants: (() => { const m = {}; view.transactions.filter(t => t.date.startsWith(month) && !isTransferTx(t)&&!t.pending&&!t.hidden && t.amount < 0)
      .forEach(t => { m[t.merchant] = (m[t.merchant] || 0) + Math.abs(t.amount); });
      return Object.entries(m).map(([merchant, total]) => ({ merchant, total: round(total) })).sort((a, b) => b.total - a.total).slice(0, 8); })() });
});

// ---------- bills / investments / loans overviews ----------
app.get('/api/bills-overview', requireAuth, (req, res) => {
  const view=readDb(req);
  const bills = view.bills.filter(b=>require('./lib/bill-schedule').active(b,todayStr())).map(b => ({ ...b, overdue: b.nextDueDate && b.nextDueDate < todayStr(),
    dueInDays: b.nextDueDate ? Math.round((new Date(b.nextDueDate) - new Date(todayStr())) / 864e5) : null }));
  const fixed = bills.filter(b => b.kind !== 'variable');
  const variable = bills.filter(b => b.kind === 'variable');
  const monthlyEstimate = list => round(list.reduce((s, b) => {
    const perMonth = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3, semiannual: 1 / 6, yearly: 1 / 12, 'one-time': 0 }[b.frequency || 'monthly'] ?? 1;
    return s + require('./lib/bill-cost')(b) * perMonth;
  }, 0));
  res.json({ bills: bills.sort((a, b) => String(a.nextDueDate).localeCompare(String(b.nextDueDate))),
    fixedMonthly: monthlyEstimate(fixed), variableMonthly: monthlyEstimate(variable),
    totalMonthly: monthlyEstimate(bills), next30DaysTotal: round(bills.reduce((s, b) => s + occurrences({ ...b, _monthlyOnly: false }, todayStr(), 30).length * require('./lib/bill-cost')(b), 0)) });
});
app.get('/api/investments-overview', requireAuth, (req, res) => {
  const view=readDb(req);
  const totalValue = round(view.holdings.reduce((s, h) => s + (Number(h.currentValue) || 0), 0));
  const costKnown=view.holdings.length>0&&view.holdings.every(h=>h.costBasis!==null&&h.costBasis!==undefined&&h.costBasis!=='');
  const totalCost = round(view.holdings.reduce((s, h) => s + (Number(h.costBasis) || 0), 0));
  const byAccountMap = {}, byTypeMap = {};
  view.holdings.forEach(h => {
    byAccountMap[h.account || 'No account'] = (byAccountMap[h.account || 'No account'] || 0) + (Number(h.currentValue) || 0);
    byTypeMap[h.assetType || 'Other'] = (byTypeMap[h.assetType || 'Other'] || 0) + (Number(h.currentValue) || 0);
  });
  const toList = m => Object.entries(m).map(([label, total]) => ({ label, total: round(total) })).sort((a, b) => b.total - a.total);
  res.json({ holdings: view.holdings, totalValue,totalCost:costKnown?totalCost:null,gain:costKnown?round(totalValue-totalCost):null,costKnown,
    gainPct:costKnown&&totalCost>0?Math.round((totalValue-totalCost)/totalCost*1000)/10:null,
    byAccount: toList(byAccountMap), byType: toList(byTypeMap),
    investmentAccountsTotal: round(view.accounts.filter(a => a.type === 'investment').reduce((s, a) => s + (Number(a.balance) || 0), 0)) });
});
function loanProgress(loan){return loanPlan(loan,todayStr());}
app.post('/api/loans/:id/preview',requireAuth,(req,res)=>{
  const loan=readDb(req).loans.find(l=>l.id===req.params.id);
  if(!loan)return res.status(404).json({error:'Loan not found in this owner view.'});
  try{res.json(loanScenario(loan,req.body.monthlyPayment,req.body.apr,todayStr()));}
  catch(e){res.status(400).json({error:e.message});}
});
app.get('/api/loans-overview', requireAuth, (req, res) => {
  const view=readDb(req);
  const loans = view.loans.map(loanProgress);
  res.json({ loans, totalOwed: round(loans.reduce((s, l) => s + (Number(l.balance) || 0), 0)),
    totalMonthlyPayments: round(loans.reduce((s, l) => s + (Number(l.monthlyPayment) || 0), 0)) });
});

// ---------- checking coverage / who I owe / funds check ----------
function coverageFor(account, days = 30) {
  const from = todayStr();
  const billsDue = db.bills.filter(b => (b.payFromAccountId || '') === account.id)
    .flatMap(b => occurrences(b, from, days).filter(d=>require('./lib/bill-schedule').active(b,d)).map(d => ({ kind: 'Bill', name: b.name, date: d, amount: require('./lib/bill-cost')(b) })));
  const firstChecking = db.accounts.find(a => a.type === 'checking');
  const billsUnassigned = account.id === (firstChecking && firstChecking.id)
    ? db.bills.filter(b => !b.payFromAccountId).flatMap(b => occurrences(b, from, days).filter(d=>require('./lib/bill-schedule').active(b,d)).map(d => ({ kind: 'Bill (unassigned — counted here)', name: b.name, date: d, amount: require('./lib/bill-cost')(b) }))) : [];
  const loanDue = db.loans.filter(l => (l.payFromAccountId || '') === account.id && l.nextDueDate && l.nextDueDate <= addDays(from, days))
    .map(l => ({ kind: 'Loan payment', name: l.name, date: l.nextDueDate, amount: Number(l.monthlyPayment) || 0 }));
  const creditDue = db.accounts.filter(a => a.type === 'credit' && a.payFromAccountId === account.id && a.minimumPayment)
    .map(a => ({ kind: 'Credit card minimum', name: a.name, date: from, amount: Number(a.minimumPayment) || 0 }));
  const obligations = [...billsDue, ...billsUnassigned, ...loanDue, ...creditDue].sort((a, b) => a.date.localeCompare(b.date));
  const totalObligations = round(obligations.reduce((s, o) => s + o.amount, 0));
  const balance = Number(account.balance) || 0;
  return { account: { id: account.id, name: account.name, person: account.person || '', balance },
    days, obligations, totalObligations, safeToSpend: round(balance - totalObligations),
    enough: balance >= totalObligations, shortfall: round(Math.max(0, totalObligations - balance)) };
}
app.get('/api/coverage', requireAuth, (req, res) => {
  const view=readDb(req);
  const checking = view.accounts.filter(a => a.type === 'checking' && !a.archived);
  const whoIOwe = [
    ...view.loans.map(l => ({ who: l.lender || l.name, what: l.name, amount: round(Number(l.balance) || 0), kind: 'Loan' })),
    ...view.accounts.filter(a => a.type === 'credit').map(a => ({ who: a.institution || a.name, what: a.name, amount: round(Number(a.balance) || 0), kind: 'Credit card' })),
    ...view.bills.filter(b => b.nextDueDate && b.nextDueDate < todayStr()).map(b => ({ who: b.name, what: 'Overdue bill', amount: round(Number(b.amount) || 0), kind: 'Overdue bill' })),
  ].filter(x => x.amount > 0).sort((a, b) => b.amount - a.amount);
  res.json({ checkingCoverage: checking.map(a => coverageFor(a, 30)),
    whoIOwe, totalOwed: round(whoIOwe.reduce((s, x) => s + x.amount, 0)) });
});
app.post('/api/funds-check',requireAuth,(req,res)=>{const account=readDb(req).accounts.find(a=>a.id===req.body.accountId&&a.type==='checking');if(!account)return res.status(400).json({error:'Choose a chequing account in this owner view.'});try{if(req.body.start)return res.json(require('./lib/cash-plan').project(db,account,req.body));const c=coverageFor(account,30),amount=Number(req.body.amount);if(!Number.isFinite(amount)||amount<0)throw Error('Enter a nonnegative purchase amount.');res.json({...c,purchaseAmount:amount,canAfford:amount<=c.safeToSpend,safeAfterPurchase:round(c.safeToSpend-amount),message:'Recorded balance minus known payments: '+round(c.safeToSpend-amount)+' after this purchase. Open Funds Check for dated income, spending and purchase projections.'});}catch(error){res.status(400).json({error:error.message});}});

// ---------- transfers: between accounts, and between partners ----------
// A transfer is NOT income or spending — it never touches dashboard totals.
// kind 'account': money moved between your accounts (optionally updates both balances)
// kind 'lend':    fromPerson lent/covered toPerson -> toPerson owes fromPerson
// kind 'repay':   fromPerson paid back toPerson    -> reduces what fromPerson owes toPerson
function balanceDelta(account, isFrom, amount) {
  // asset accounts: out = -, in = +. credit accounts track OWED: using it = +, paying it = -.
  if (account.type === 'credit') return isFrom ? amount : -amount;
  return isFrom ? -amount : amount;
}
function applyTransferToBalances(t, direction) { // direction: +1 apply, -1 reverse
  if (!t.updateBalances) return;
  const from = db.accounts.find(a => a.id === t.fromAccountId);
  const to = db.accounts.find(a => a.id === t.toAccountId);
  if (from) from.balance = round((Number(from.balance) || 0) + direction * balanceDelta(from, true, Number(t.amount) || 0));
  if (to) to.balance = round((Number(to.balance) || 0) + direction * balanceDelta(to, false, Number(t.amount) || 0));
}
function partnerBalances(transfers=db.transfers) {
  const owed = {}; // owed[debtor][creditor] = amount
  const add = (debtor, creditor, amt) => {
    if (!debtor || !creditor || debtor === creditor || !amt) return;
    owed[debtor] = owed[debtor] || {}; owed[debtor][creditor] = (owed[debtor][creditor] || 0) + amt;
  };
  for (const t of transfers) {
    if (t.kind === 'lend') add(t.toPerson, t.fromPerson, Number(t.amount) || 0);
    if (t.kind === 'repay') add(t.fromPerson, t.toPerson, -(Number(t.amount) || 0));
  }
  for(const c of db.reimbursements||[])add(c.debtor,c.creditor,claimBalance(db,c));
  const pairs = new Set();
  Object.entries(owed).forEach(([d, cs]) => Object.keys(cs).forEach(c => pairs.add([d, c].sort().join('|'))));
  const out = [];
  for (const key of pairs) {
    const [a, b] = key.split('|');
    const net = round(((owed[a] && owed[a][b]) || 0) - ((owed[b] && owed[b][a]) || 0));
    if (net > 0) out.push({ debtor: a, creditor: b, amount: net });
    else if (net < 0) out.push({ debtor: b, creditor: a, amount: -net });
  }
  return out;
}
app.get('/api/transfers', requireAuth, (req, res) => { const view=readDb(req);
  res.json({items:[...view.transfers].sort((a,b)=>b.date.localeCompare(a.date)),partnerBalances:partnerBalances(view.transfers)}); });
app.post('/api/transfers', requireAuth, (req, res) => {
  const { date, amount, fromAccountId, toAccountId, fromPerson, toPerson, kind, note, updateBalances } = req.body || {};
  const amt = Number(amount);
  if (!validMovementDate(date) || !Number.isFinite(amt) || amt <= 0||!Number.isSafeInteger(Math.round(amt*100))) return res.status(400).json({ error: 'Date and a positive amount are required.' });
  if (!['account', 'lend', 'repay'].includes(kind)) return res.status(400).json({ error: 'Pick a transfer type: account, lend, or repay.' });
  if (kind === 'account' && (!fromAccountId || !toAccountId || fromAccountId === toAccountId))
    return res.status(400).json({ error: 'An account transfer needs two different accounts.' });
  if (kind !== 'account' && (!fromPerson || !toPerson || fromPerson === toPerson))
    return res.status(400).json({ error: 'A transfer between people needs two different people.' });
  const fromAcc = db.accounts.find(a => a.id === fromAccountId), toAcc = db.accounts.find(a => a.id === toAccountId);
  if(kind==='account'&&(!fromAcc||!toAcc))return res.status(400).json({error:'Choose two existing accounts.'});
  if(kind==='account'&&updateBalances===true){const dates=[fromAcc,toAcc].map(a=>a.balanceAsOf||db.balanceHistory.filter(h=>h.key==='account:'+a.id).at(-1)?.at.slice(0,10)||'');if(dates.some(d=>d>date))return res.status(400).json({error:'Newer balance snapshots already exist. Record this transfer without applying it to balances.'});}
  const t = { id: id(), date, amount: round(amt), kind,
    fromAccountId: fromAccountId || '', toAccountId: toAccountId || '',
    fromAccountName: fromAcc ? fromAcc.name : '', toAccountName: toAcc ? toAcc.name : '',
    fromPerson: fromPerson || '', toPerson: toPerson || '', note: note || '',
    updateBalances: kind === 'account' ? updateBalances === true : false,
    source: 'manual', addedBy: req.user.name, createdAt: nowIso() };
  if(kind==='account'){const before={from:Number(fromAcc.balance)||0,to:Number(toAcc.balance)||0},category=toAcc.type==='credit'?'Credit Card Payment':'Transfer';const make=(a,amount)=>({id:id(),date,merchant:toAcc.type==='credit'?'Card payment':'Account transfer',displayName:toAcc.type==='credit'?'Card payment':'Account transfer',originalName:'Manual account transfer',originalStatement:'Manual account transfer',account:a.name,person:a.person||'',amount,category,source:'manual-transfer',manualTransferId:t.id,dedupeKey:id(),createdAt:nowIso()});const outgoing=make(fromAcc,-round(amt)),incoming=make(toAcc,round(amt));db.transactions.push(outgoing,incoming);const link=linkTransfer(db,outgoing.id,incoming.id,req.user.name);t.transactionIds=[outgoing.id,incoming.id];t.transferLinkId=link.id;applyTransferToBalances(t,+1);t.balanceBefore=before;t.balanceAfter={from:fromAcc.balance,to:toAcc.balance};}
  db.transfers.push(t); saveDb();
  res.json({ item: t, partnerBalances: partnerBalances() });
});
app.delete('/api/transfers/:id', requireAuth, (req, res) => {
  const t = db.transfers.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if(t.updateBalances&&t.balanceAfter){const from=db.accounts.find(a=>a.id===t.fromAccountId),to=db.accounts.find(a=>a.id===t.toAccountId);if(from?.balance!==t.balanceAfter.from||to?.balance!==t.balanceAfter.to)return res.status(400).json({error:'Account balances changed after this transfer. Correct current balances rather than undoing an older snapshot.'});}
  if(t.transactionIds?.some(id=>db.transactions.find(tx=>tx.id===id)?.repaymentOriginal))return res.status(400).json({error:'Unlink repayments before deleting this transfer.'});
  if(t.transactionIds){db.transactions=db.transactions.filter(tx=>!t.transactionIds.includes(tx.id));db.transferLinks=db.transferLinks.filter(l=>l.id!==t.transferLinkId);}
  applyTransferToBalances(t, -1); // undo the balance move, if it made one
  db.transfers = db.transfers.filter(x => x.id !== req.params.id);
  saveDb(); res.json({ ok: true, partnerBalances: partnerBalances() });
});

// ---------- sample data (fake, removable) ----------
app.post('/api/sample-data', requireAuth, (req, res) => {
  const add = (key, item, keyFields) => {
    const dk = keyFields.map(f => item[f]).join('|');
    if (db[key].some(x => x._sampleKey === dk)) return 0;
    db[key].push({ id: id(), source: 'sample', _sampleKey: dk, createdAt: nowIso(), ...item }); return 1;
  };
  let n = 0;
  const chq = { name: 'Joint Chequing', type: 'checking', person: 'Household / Joint', institution: 'Demo Bank', balance: 3250 };
  n += add('accounts', chq, ['name']);
  const visa = { name: 'Visa', type: 'credit', person: 'Timothy', institution: 'Demo Bank', balance: 640, minimumPayment: 35, payFromAccountId: '' };
  n += add('accounts', visa, ['name']);
  const tfsa = { name: 'TFSA', type: 'investment', person: 'Timothy', institution: 'Demo Broker', balance: 12400 };
  n += add('accounts', tfsa, ['name']);
  const chqId = (accountByName('Joint Chequing') || {}).id || '';
  const visaAcct = accountByName('Visa'); if (visaAcct && !visaAcct.payFromAccountId) visaAcct.payFromAccountId = chqId;
  const txData = [
    ['2026-10-01','Payroll — Employer','Income','Joint Chequing','Timothy',3200],['2026-10-02','Payroll — Partner','Income','Joint Chequing','Partner',2600],
    ['2026-10-03','Landlord','Rent','Joint Chequing','Household / Joint',-1850],['2026-10-05','Loblaws','Groceries','Visa','Timothy',-142.18],
    ['2026-10-07','Toronto Hydro','Utilities','Joint Chequing','Household / Joint',-118.40],['2026-10-09','Shell','Gas & Transport','Visa','Partner',-64.20],
    ['2026-10-11','Restaurant — Dinner','Dining Out','Visa','Partner',-86.50],['2026-10-14','Metro','Groceries','Visa','Partner',-97.33],
    ['2026-10-16','Netflix','Subscriptions','Visa','Timothy',-16.99],['2026-10-18','TTC','Gas & Transport','Visa','Timothy',-35],
    ['2026-10-21','Amazon','Shopping','Visa','Timothy',-54.99],
  ];
  for (const [date, merchant, category, account, person, amount] of txData) {
    const tx = { date, merchant, category, account, person, amount, notes: 'Sample data', tags: 'sample' };
    tx.isTransfer = isTransferTx(tx);
    tx.dedupeKey = crypto.createHash('sha256').update(['sample', date, merchant, amount].join('|')).digest('hex');
    if (!db.transactions.some(t => t.dedupeKey === tx.dedupeKey)) { db.transactions.push({ id: id(), ...tx, source: 'sample', addedBy: req.user.name, createdAt: nowIso() }); n++; }
  }
  // Demo split: one Costco run, split across two categories and two people.
  const costcoKey = crypto.createHash('sha256').update(['sample','2026-10-22','Costco',-200].join('|')).digest('hex');
  if (!db.transactions.some(t => t.dedupeKey === costcoKey)) {
    db.transactions.push({ id: id(), date: '2026-10-22', merchant: 'Costco', category: 'Groceries', account: 'Visa',
      person: 'Household / Joint', amount: -200, notes: 'Sample data (split)', tags: 'sample', isTransfer: false,
      splits: [ { category: 'Groceries', person: 'Timothy', amount: -120, note: 'Food' },
                { category: 'Household Supplies', person: 'Partner', amount: -80, note: 'Household' } ],
      dedupeKey: costcoKey, source: 'sample', addedBy: req.user.name, createdAt: nowIso() }); n++;
  }
  // Demo lend between partners: Timothy covered Partner by $50 (record only, no account balances touched).
  if (!db.transfers.some(t => t._sampleKey === 'lend-demo')) {
    db.transfers.push({ id: id(), date: '2026-10-22', amount: 50, kind: 'lend', fromPerson: 'Timothy', toPerson: 'Partner',
      fromAccountId: '', toAccountId: '', fromAccountName: '', toAccountName: '', note: 'Sample: covered a purchase',
      updateBalances: false, source: 'sample', _sampleKey: 'lend-demo', addedBy: req.user.name, createdAt: nowIso() }); n++;
  }
  n += add('budgets', { category: 'Groceries', monthlyLimit: 600 }, ['category']);
  n += add('budgets', { category: 'Dining Out', monthlyLimit: 150 }, ['category']);
  n += add('budgets', { category: 'Shopping', monthlyLimit: 100 }, ['category']);
  n += add('buckets', { name: 'Emergency fund', targetAmount: 10000, currentAmount: 4200, accountId: chqId }, ['name']);
  n += add('buckets', { name: 'Trip', targetAmount: 3000, currentAmount: 850, accountId: chqId }, ['name']);
  n += add('bills', { name: 'Rent', kind: 'fixed', category: 'Rent', amount: 1850, nextDueDate: addMonths(todayStr().slice(0,7)+'-01', 1), frequency: 'monthly', payFromAccountId: chqId, autopay: false }, ['name']);
  n += add('bills', { name: 'Toronto Hydro', kind: 'variable', category: 'Utilities', amount: 120, lastAmount: 118.40, nextDueDate: addDays(todayStr(), 10), frequency: 'monthly', payFromAccountId: chqId, autopay: true }, ['name']);
  n += add('bills', { name: 'Internet', kind: 'fixed', category: 'Utilities', amount: 85, nextDueDate: addDays(todayStr(), 6), frequency: 'monthly', payFromAccountId: chqId, autopay: true }, ['name']);
  n += add('holdings', { name: 'Broad Market ETF', symbol: 'XEQT', assetType: 'ETF', account: 'TFSA', currentValue: 8200, costBasis: 7100, person: 'Timothy' }, ['symbol']);
  n += add('holdings', { name: 'US Index ETF', symbol: 'VFV', assetType: 'ETF', account: 'TFSA', currentValue: 4200, costBasis: 3900, person: 'Timothy' }, ['symbol']);
  n += add('loans', { name: 'Car loan', lender: 'Demo Auto Finance', type: 'Auto', originalAmount: 24000, balance: 13800, apr: 5.9, monthlyPayment: 385, nextDueDate: addDays(todayStr(), 12), payFromAccountId: chqId, person: 'Household / Joint' }, ['name']);
  n += add('loans', { name: 'Student loan', lender: 'NSLSC', type: 'Student', originalAmount: 15000, balance: 6200, apr: 0, monthlyPayment: 180, nextDueDate: addDays(todayStr(), 20), payFromAccountId: chqId, person: 'Timothy' }, ['name']);
  saveDb(); res.json({ added: n });
});
app.delete('/api/sample-data', requireAuth, (_req, res) => {
  for (const k of ['transactions','accounts','budgets','buckets','bills','holdings','loans','transfers']) db[k] = db[k].filter(x => x.source !== 'sample');
  saveDb(); res.json({ ok: true });
});
app.get('/api/export', requireAuth, (req, res) => {
  const view=readDb(req);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="pulse-backup.json"');
  res.send(JSON.stringify({ exportedAt: nowIso(), viewOwner:String(req.query.scopeOwner||''), ...view, scheduledTransfers:view.scheduledTransfers?.filter(row=>require('./lib/cash-calendar').canSeeTransfer(row,req.user.name)), transactionImports:undefined,payrollImports:undefined,payrollRecords:view.payrollRecords?.filter(r=>!req.query.scopeOwner||r.person===req.query.scopeOwner).map(({sourceText,...r})=>r),savedViews:undefined,transactionEvents:undefined, users: undefined, sessions: undefined }, null, 2));
});
app.get('/health', (_req, res) => res.json({ ok: true, version: 3, storage: 'sqlite' }));

app.get(['/signin','/dashboard','/accounts','/accounts/:id','/accounts/loans/:id','/transactions','/transactions/:tabOrId','/transactions/categories/:name','/transactions/groups/:name','/transactions/merchants/:name','/cash-flow','/reports','/forecast','/payroll','/tools','/funds-check','/calendar','/budget','/savings','/goals','/recurring','/payoff','/investments','/import','/settings'],(_req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));

app.use((err,_req,res,_next)=>{ console.error(err.message);res.status(500).json({error:'The change could not be saved. Reload and try again.'}); });
const server=app.listen(PORT, HOST, () => console.log(`Pulse listening on http://${HOST || 'localhost'}:${PORT} · SQLite storage`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{store.close();process.exit(0);}));
