'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {Store}=require('../lib/storage');
const {stageBalances}=require('../lib/balance-import');
const directory=process.env.HF_DATA_DIR||path.join(__dirname,'../data');
const store=new Store(directory);
try{
 const db=store.load();
 const at=process.argv.indexOf('--balances');
 if(at!==-1){
   const file=process.argv[at+1];if(!file)throw new Error('Pass a CSV path after --balances.');
   const preview=stageBalances(db,fs.readFileSync(file,'utf8'),path.basename(file));store.save(db);
   console.log(`Staged ${preview.rowCount} balance rows across ${preview.mapping.length} accounts (${preview.from}–${preview.to}). Review under Import in Pulse.`);
 }
 console.log(`SQLite is ready: ${store.file}`);
 console.log('Existing JSON is backed up and preserved. Start Pulse with npm start.');
}finally{store.close();}
