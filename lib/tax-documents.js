'use strict';

const fs=require('node:fs');
const path=require('node:path');

module.exports=function installTaxDocuments(app,{requireAuth,getDb,id,dataDir}){
 const directory=path.join(dataDir,'tax-documents');
 const validYear=year=>/^20\d{2}$/.test(String(year));
 const route='/api/tax-documents';

 app.get(route,requireAuth,(req,res)=>{
  const year=req.query.year;
  if(!validYear(year))return res.status(400).json({error:'Choose a tax year.'});
  const folder=path.join(directory,year);
  const items=fs.existsSync(folder)?fs.readdirSync(folder)
   .filter(name=>/^[a-f0-9-]{36}\.json$/i.test(name))
   .map(name=>JSON.parse(fs.readFileSync(path.join(folder,name),'utf8')))
   .sort((a,b)=>b.addedAt.localeCompare(a.addedAt)):[];
  res.json({items});
 });

 app.post(route,requireAuth,(req,res)=>{
  const {year,person,type,filename,data,outcome,amount}=req.body;
  if(!validYear(year)||!getDb().users.some(user=>user.name===person)||
    !['Tax return','Notice of assessment','T4','T4A','T5','T3','T5008','RRSP contribution receipt','Tax slip','Receipt','Other'].includes(type)){
   return res.status(400).json({error:'Choose a tax year, person and document type.'});
  }
  const hasAmount=Boolean(outcome);
  if(hasAmount&&(!['Tax return','Notice of assessment'].includes(type)||
    !['refund','owing','even'].includes(outcome)||
    (outcome!=='even'&&(!Number.isFinite(Number(amount))||Number(amount)<=0||Number(amount)>1e9)))){
   return res.status(400).json({error:'Enter a positive refund or balance owing, or choose neither.'});
  }

  if(typeof data!=='string'||data.length>14_000_000)return res.status(400).json({error:'Choose a PDF up to 10 MB.'});
  const bytes=Buffer.from(data,'base64');
  if(bytes.length>10*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-'){
   return res.status(400).json({error:'Choose a PDF up to 10 MB.'});
  }

  const record={id:id(),year:String(year),person,type,filename:path.basename(String(filename||'Document.pdf')).slice(0,200),
   ...(hasAmount?{outcome,amount:outcome==='even'?0:Math.round(Number(amount)*100)/100}:{}),addedAt:new Date().toISOString()};
  const folder=path.join(directory,record.year);
  fs.mkdirSync(folder,{recursive:true,mode:0o700});
  const document=path.join(folder,record.id+'.pdf'),metadata=path.join(folder,record.id+'.json');
  fs.writeFileSync(document,bytes,{flag:'wx',mode:0o600});
  try{fs.writeFileSync(metadata,JSON.stringify(record),{flag:'wx',mode:0o600});}
  catch(error){fs.rmSync(document,{force:true});throw error;}
  res.json({item:record});
 });

 app.get(route+'/:year/:id',requireAuth,(req,res)=>{
  const {year,id}=req.params;
  if(!validYear(year)||!/^[a-f0-9-]{36}$/i.test(id))return res.sendStatus(404);
  const folder=path.join(directory,year),metadata=path.join(folder,id+'.json');
  if(!fs.existsSync(metadata))return res.sendStatus(404);
  const {filename}=JSON.parse(fs.readFileSync(metadata,'utf8'));
  res.set('Cache-Control','private, no-store');
  res.download(path.join(folder,id+'.pdf'),filename);
 });
};
