/* Profile selection gives immediate feedback without delaying sign-in. */
let profileSignInBusy=false;
function beginProfileArrival(button,name){
 const status=$('authMsg'),avatar=button.querySelector('.profile-avatar'),rect=avatar.getBoundingClientRect();status.textContent='Opening '+name+'’s finances…';
 document.body.classList.add('profile-entering');button.classList.add('profile-chosen');
 const overlay=document.createElement('div');overlay.className='profile-arrival';overlay.setAttribute('role','status');overlay.setAttribute('aria-label','Opening '+name+'’s finances');
 overlay.innerHTML=`<div class="profile-arrival-backdrop"></div><div class="profile-arrival-avatar" aria-hidden="true">${esc(name.charAt(0).toUpperCase())}</div><div class="profile-arrival-words"><strong>${esc(name)}</strong><span>Opening your workspace</span></div>`;
 const arrival=overlay.querySelector('.profile-arrival-avatar'),targetX=innerWidth/2-(rect.left+rect.width/2),targetY=Math.min(innerHeight*.38,280)-(rect.top+rect.height/2);
 arrival.style.cssText=`left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;--profile-arrival-x:${targetX}px;--profile-arrival-y:${targetY}px`;
 document.body.append(overlay);requestAnimationFrame(()=>overlay.classList.add('is-active'));
 const remove=()=>{overlay.remove();document.body.classList.remove('profile-entering');button.classList.remove('profile-chosen');status.textContent='';};
 return {async finish(){overlay.classList.add('is-leaving');overlay.addEventListener('transitionend',remove,{once:true});setTimeout(remove,450);},cancel(){remove();}};
}
async function signInWithProfileAnimation(button,profile,password,method='password'){
 if(profileSignInBusy)return;profileSignInBusy=true;$('authMsg').textContent='';const buttons=[...$('profileList').querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);$('profileList').setAttribute('aria-busy','true');let transition;
 try{transition=beginProfileArrival(button,profile.name);const selected=await post('/api/profiles/select',{userId:profile.id,...(password!==undefined?{[method==='pin'?'pin':'password']:password}:{})}),me=await api('/api/me');await showApp(selected.user,me.householdUsers);await transition.finish();return true;}
 catch(error){transition?.cancel();$('authMsg').textContent=error.message;return false;}
 finally{buttons.forEach(b=>b.disabled=false);$('profileList').removeAttribute('aria-busy');profileSignInBusy=false;}
}
