'use strict';
module.exports=(app,{requireAuth,getDb})=>{
 app.get('/api/financial-analysis',requireAuth,(req,res)=>{try{const result=require('./financial-analysis').snapshot(getDb(),{owner:String(req.query.scopeOwner||'')});res.setHeader('Cache-Control','no-store');if(req.query.download==='1'){res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="pulse-full-financial-picture-'+result.generatedAt.slice(0,10)+'.json"');return res.send(JSON.stringify(result,null,2));}res.json({generatedAt:result.generatedAt,scope:result.scope,manifest:result.manifest,coverage:result.coverage,summary:result.summary,instructions:result.instructions});}catch(e){res.status(400).json({error:e.message});}});
};
