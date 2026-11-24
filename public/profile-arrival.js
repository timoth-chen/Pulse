/* Profile selection gives immediate feedback without delaying sign-in. */
let profileSignInBusy=false;
function beginProfileArrival(button,name){
 const status=$('authMsg');status.textContent='Opening '+name+'’s finances…';
 return {async finish(){status.textContent='';},cancel(){status.textContent='';}};
}
async function signInWithProfileAnimation(button,profile,password,method='password'){
 if(profileSignInBusy)return;profileSignInBusy=true;$('authMsg').textContent='';const buttons=[...$('profileList').querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);$('profileList').setAttribute('aria-busy','true');let transition;
 try{transition=beginProfileArrival(button,profile.name);const selected=await post('/api/profiles/select',{userId:profile.id,...(password!==undefined?{[method==='pin'?'pin':'password']:password}:{})}),me=await api('/api/me');await showApp(selected.user,me.householdUsers);await transition.finish();return true;}
 catch(error){transition?.cancel();$('authMsg').textContent=error.message;return false;}
 finally{buttons.forEach(b=>b.disabled=false);$('profileList').removeAttribute('aria-busy');profileSignInBusy=false;}
}
