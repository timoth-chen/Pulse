'use strict';
const {randomUUID}=require('node:crypto');
const {ownerKey}=require('./owner-scope');
function syncOwnerProfiles(db){
  const names=new Map();
  for(const key of ['accounts','loans','holdings'])for(const row of db[key]||[]){
    for(const value of (row.owners?.length?row.owners:[row.person])){const name=String(value||'').trim(),key=ownerKey(name);if(name&&!['__joint__','__unassigned__','unassigned'].includes(key))names.set(key,name);}
  }
  let added=0;
  for(const [key,name] of names)if(!(db.users||[]).some(u=>ownerKey(u.name)===key)){
    db.users.push({id:randomUUID(),name,email:'',salt:'',passwordHash:null,createdAt:new Date().toISOString()});added++;
  }
  return added;
}
module.exports={syncOwnerProfiles};
