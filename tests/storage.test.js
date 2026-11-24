const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {Store}=require('../lib/storage');
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pulse-sqlite-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('migration preserves profiles, sessions, IDs, unknown fields and creates a JSON backup',t=>{
 const dir=temp(t);const old={users:[{id:'p',name:'Person',passwordHash:'keep'}],sessions:[{tokenHash:'sessionhash',userId:'p'}],accounts:[{id:'a',name:'Cash',type:'cash',balance:1.23}],transactions:[{id:'t',date:'2026-11-05',amount:-.10,custom:'keep'}],customSetting:{keep:true}};
 fs.writeFileSync(path.join(dir,'db.json'),JSON.stringify(old));const store=new Store(dir);const data=store.load();
 for(const k of Object.keys(old))assert.deepEqual(data[k],old[k]);
 assert.equal(store.sql.prepare('SELECT balance_cents FROM accounts').get().balance_cents,123);
 assert.ok(fs.readdirSync(dir).some(x=>x.startsWith('db.pre-sqlite-')));assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'db.json'))),old);
 store.close();const reopened=new Store(dir);assert.equal(reopened.load().transactions[0].id,'t');reopened.close();
});
test('malformed JSON stops migration without erasing it',t=>{const dir=temp(t);fs.writeFileSync(path.join(dir,'db.json'),'{bad');assert.throws(()=>new Store(dir));assert.equal(fs.readFileSync(path.join(dir,'db.json'),'utf8'),'{bad');});
test('writes roll back atomically and reject a stale process',t=>{
 const dir=temp(t),a=new Store(dir),b=new Store(dir);let data=a.load();data.accounts.push({id:'a',name:'A',balance:5});a.save(data);
 const stale=b.load();data=a.load();data.accounts[0].balance=10;a.save(data);stale.accounts[0].balance=99;assert.throws(()=>b.save(stale),/another process/);
 data=a.load();data.accounts[0].balance=100;data.transactions.push({id:'same'},{id:'same'});assert.throws(()=>a.save(data),/Duplicate/);
 assert.equal(a.load().accounts[0].balance,10);a.close();b.close();
});
test('SQLite backup is a consistent, independently readable database',async t=>{
 const dir=temp(t),store=new Store(dir);let data=store.load();data.accounts.push({id:'a',name:'Savings',balance:100.25});store.save(data);
 const file=path.join(dir,'backup.sqlite');await store.backup(file);const {DatabaseSync}=require('node:sqlite');const copy=new DatabaseSync(file,{readOnly:true});assert.equal(copy.prepare('SELECT balance_cents FROM accounts').get().balance_cents,10025);assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check,'ok');copy.close();store.close();
});
