'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');
const COLLECTIONS = {
  otherInvestments:'other_investments',historicalSeries:'historical_market_series',investmentHistoryRuns:'investment_history_runs',
  importFormats:'import_formats',investmentActivities:'investment_activities',users:'profiles', sessions:'sessions', accounts:'accounts', transactions:'transactions', budgets:'budgets',
  buckets:'goals', bills:'bills', scheduledTransfers:'scheduled_transfers', holdings:'holdings', loans:'loans', transfers:'transfers', balanceHistory:'balance_snapshots',
  balanceImports:'balance_imports', balanceImportRows:'balance_import_rows', transactionRules:'transaction_rules', transactionImports:'transaction_imports', goalEvents:'goal_events', transactionEvents:'transaction_events', savedViews:'saved_views', payrollRecords:'payroll_records',payrollImports:'payroll_imports',reportViews:'report_views',scenarios:'scenarios',fundsSetups:'funds_setups',cushionPlans:'cushion_plans',investmentSnapshots:'investment_snapshots',investmentImports:'investment_imports',marketQuotes:'market_quotes',marketRates:'market_rates',marketJobs:'market_jobs', transactionAttachments:'transaction_attachments',billPayments:'bill_payments',categories:'categories',transferLinks:'transfer_links',reimbursements:'reimbursements',repaymentAllocations:'repayment_allocations'
};
const emptyDb = () => Object.fromEntries(Object.keys(COLLECTIONS).map(k=>[k,[]]));
const generated = {
  accounts: ", name TEXT GENERATED ALWAYS AS (json_extract(data,'$.name')) STORED, type TEXT GENERATED ALWAYS AS (json_extract(data,'$.type')) STORED, owner TEXT GENERATED ALWAYS AS (json_extract(data,'$.person')) STORED, balance_cents INTEGER GENERATED ALWAYS AS (CAST(round(coalesce(json_extract(data,'$.balance'),0)*100) AS INTEGER)) STORED",
  transactions: ", date TEXT GENERATED ALWAYS AS (json_extract(data,'$.date')) STORED, account_name TEXT GENERATED ALWAYS AS (json_extract(data,'$.account')) STORED, amount_cents INTEGER GENERATED ALWAYS AS (CAST(round(coalesce(json_extract(data,'$.amount'),0)*100) AS INTEGER)) STORED",
  balanceHistory: ", account_key TEXT GENERATED ALWAYS AS (json_extract(data,'$.key')) STORED, recorded_at TEXT GENERATED ALWAYS AS (json_extract(data,'$.at')) STORED, balance_cents INTEGER GENERATED ALWAYS AS (json_extract(data,'$.balanceCents')) STORED",
  balanceImportRows: ", import_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.importId')) STORED, date TEXT GENERATED ALWAYS AS (json_extract(data,'$.date')) STORED, balance_cents INTEGER GENERATED ALWAYS AS (json_extract(data,'$.balanceCents')) STORED"
};
class Store {
  constructor(directory) {
    fs.mkdirSync(directory,{recursive:true,mode:0o700});
    this.directory=directory;this.file=path.join(directory,'pulse.sqlite');
    this.sql=new DatabaseSync(this.file);
    fs.chmodSync(this.file,0o600);
    this.sql.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
    this.sql.exec('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
    const version=this.sql.prepare("SELECT value FROM metadata WHERE key='schema_version'").get();
    if(version && Number(version.value)>1)throw new Error('This Pulse database needs a newer app version.');
    this.sql.exec('BEGIN IMMEDIATE');
    try {
      for(const [key,table] of Object.entries(COLLECTIONS))this.sql.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, ordinal INTEGER NOT NULL, data TEXT NOT NULL CHECK(json_valid(data))${generated[key]||''})`);
      this.sql.exec('CREATE INDEX IF NOT EXISTS balance_history_lookup ON balance_snapshots(account_key,recorded_at); CREATE INDEX IF NOT EXISTS transaction_dates ON transactions(date); CREATE INDEX IF NOT EXISTS import_rows_lookup ON balance_import_rows(import_id,date);');
      this.sql.prepare("INSERT OR IGNORE INTO metadata VALUES ('schema_version','1')").run();
      this.sql.prepare("INSERT OR IGNORE INTO metadata VALUES ('revision','0')").run();
      this.sql.exec('COMMIT');
    } catch(e){this.sql.exec('ROLLBACK');throw e;}
    this.load();
    if(!this.sql.prepare("SELECT value FROM metadata WHERE key='initialized'").get())this.migrateJson();
  }
  getRevision(){return Number(this.sql.prepare("SELECT value FROM metadata WHERE key='revision'").get().value);}
  load() {
    this.sql.exec('BEGIN');
    try {
      const db=emptyDb();this.cache=new Map();
      this.revision=this.getRevision();
      for(const [key,table] of Object.entries(COLLECTIONS)){
        const rows=this.sql.prepare(`SELECT id,ordinal,data FROM ${table} ORDER BY ordinal`).all();
        db[key]=rows.map(r=>JSON.parse(r.data));this.cache.set(key,new Map(rows.map(r=>[r.id,{ordinal:r.ordinal,data:r.data}])));
      }
      const extra=this.sql.prepare("SELECT value FROM metadata WHERE key='legacy_extra'").get();
      this.sql.exec('COMMIT');return {...(extra?JSON.parse(extra.value):{}),...db};
    }catch(e){this.sql.exec('ROLLBACK');throw e;}
  }
  migrateJson() {
    const file=path.join(this.directory,'db.json');let db=emptyDb();
    if(fs.existsSync(file)){
      // Parsing errors stop migration; never replace an unreadable database with an empty one.
      const original=fs.readFileSync(file,'utf8');const parsed=JSON.parse(original);
      for(const key of Object.keys(COLLECTIONS))if(parsed[key]!==undefined&&!Array.isArray(parsed[key]))throw new Error(`Invalid legacy collection: ${key}`);
      const backupFile=path.join(this.directory,'db.pre-sqlite-'+Date.now()+'.json');
      fs.writeFileSync(backupFile,original,{flag:'wx',mode:0o600});db={...db,...parsed};
    }
    this.save(db,true);
  }
  save(db,initialize=false) {
    const next=new Map();this.sql.exec('BEGIN IMMEDIATE');
    try {
      if(this.getRevision()!==this.revision)throw new Error('Database changed in another process. Reload and retry.');
      for(const [key,table] of Object.entries(COLLECTIONS)){
        if(!Array.isArray(db[key]||[]))throw new Error(`Invalid collection: ${key}`);
        const previous=this.cache.get(key)||new Map(),current=new Map();
        const upsert=this.sql.prepare(`INSERT INTO ${table}(id,ordinal,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET ordinal=excluded.ordinal,data=excluded.data`);
        (db[key]||[]).forEach((row,ordinal)=>{
          const id=String(row.id||row.tokenHash||`${key}:${ordinal}`),data=JSON.stringify(row);
          if(current.has(id))throw new Error(`Duplicate identifier in ${key}`);
          current.set(id,{ordinal,data});const old=previous.get(id);
          if(!old||old.data!==data||old.ordinal!==ordinal)upsert.run(id,ordinal,data);
        });
        const remove=this.sql.prepare(`DELETE FROM ${table} WHERE id=?`);
        for(const id of previous.keys())if(!current.has(id))remove.run(id);
        next.set(key,current);
      }
      const extra=Object.fromEntries(Object.entries(db).filter(([k])=>!Object.hasOwn(COLLECTIONS,k)));
      this.sql.prepare("INSERT OR REPLACE INTO metadata VALUES('legacy_extra',?)").run(JSON.stringify(extra));
      this.sql.prepare("UPDATE metadata SET value=? WHERE key='revision'").run(String(this.revision+1));
      if(initialize)this.sql.prepare("INSERT OR REPLACE INTO metadata VALUES('initialized','1')").run();
      this.sql.exec('COMMIT');this.cache=next;this.revision++;
    }catch(e){this.sql.exec('ROLLBACK');throw e;}
  }
  async backup(destination){await backup(this.sql,destination);fs.chmodSync(destination,0o600);}
  close(){this.sql.close();}
}
module.exports={Store,emptyDb};
