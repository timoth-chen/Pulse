'use strict';
const fs=require('node:fs');const path=require('node:path');const {Store}=require('../lib/storage');
(async()=>{
 const directory=process.env.HF_DATA_DIR||path.join(__dirname,'../data');
 const store=new Store(directory);
 try{const folder=path.join(directory,'backups');fs.mkdirSync(folder,{recursive:true,mode:0o700});const target=path.join(folder,'pulse-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');await store.backup(target);const attachments=path.join(directory,'attachments');if(fs.existsSync(attachments))fs.cpSync(attachments,target+'.attachments',{recursive:true});const imports=path.join(directory,'imports');if(fs.existsSync(imports))fs.cpSync(imports,target+'.imports',{recursive:true});const payrollDocuments=path.join(directory,'payroll-documents');if(fs.existsSync(payrollDocuments))fs.cpSync(payrollDocuments,target+'.payroll-documents',{recursive:true});const investmentDocuments=path.join(directory,'investment-documents');if(fs.existsSync(investmentDocuments))fs.cpSync(investmentDocuments,target+'.investment-documents',{recursive:true});console.log('SQLite backup saved:',target);}
 finally{store.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
