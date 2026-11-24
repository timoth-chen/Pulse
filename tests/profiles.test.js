const test=require('node:test');const assert=require('node:assert/strict');const {syncOwnerProfiles}=require('../lib/profiles');
test('profiles are created for actual named owners, not joint or unassigned records',()=>{
 const db={users:[{id:'existing',name:'Timothy'}],accounts:[{person:'Timothy'},{person:'Rebekah'},{person:''},{person:'Joint'},{person:'Unassigned'}],loans:[],holdings:[]};
 assert.equal(syncOwnerProfiles(db),1);assert.deepEqual(db.users.map(u=>u.name),['Timothy','Rebekah']);assert.equal(syncOwnerProfiles(db),0);assert.equal(db.users[0].id,'existing');
});
test('a single owner does not create an extra profile',()=>{const db={users:[{id:'one',name:'Timothy'}],accounts:[{person:'Timothy'},{person:''}]};assert.equal(syncOwnerProfiles(db),0);assert.equal(db.users.length,1);});
