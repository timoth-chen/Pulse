'use strict';
// Payments Canada ACSS closure calendar: weekends and federal bank holidays.
const iso=d=>d.toISOString().slice(0,10),date=s=>new Date(s+'T12:00:00Z'),cache=new Map();
function easter(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),n=h+l-7*m+114;return new Date(Date.UTC(y,Math.floor(n/31)-1,n%31+1,12));}
function holidays(y){if(cache.has(y))return cache.get(y);const set=new Set();
 const observed=(m,d)=>{const v=new Date(Date.UTC(y,m-1,d,12));while(v.getUTCDay()===0||v.getUTCDay()===6||set.has(iso(v)))v.setUTCDate(v.getUTCDate()+1);set.add(iso(v));};
 observed(1,1);observed(7,1);observed(9,30);observed(11,11);observed(12,25);observed(12,26);
 const goodFriday=easter(y);goodFriday.setUTCDate(goodFriday.getUTCDate()-2);set.add(iso(goodFriday));
 const victoria=new Date(Date.UTC(y,4,24,12));while(victoria.getUTCDay()!==1)victoria.setUTCDate(victoria.getUTCDate()-1);set.add(iso(victoria));
 for(const [month,nth]of [[8,1],[9,2]]){const monday=new Date(Date.UTC(y,month,1,12));while(monday.getUTCDay()!==1)monday.setUTCDate(monday.getUTCDate()+1);monday.setUTCDate(monday.getUTCDate()+7*(nth-1));set.add(iso(monday));}
 cache.set(y,set);return set;
}
function isBusinessDay(s){const d=date(s);return d.getUTCDay()!==0&&d.getUTCDay()!==6&&!holidays(d.getUTCFullYear()).has(s);}
function shift(s,n){const d=date(s),direction=n<0?-1:1;for(let left=Math.abs(n);left;){d.setUTCDate(d.getUTCDate()+direction);if(isBusinessDay(iso(d)))left--;}return iso(d);}
function next(s){let d=s;while(!isBusinessDay(d)){const v=date(d);v.setUTCDate(v.getUTCDate()+1);d=iso(v);}return d;}
module.exports={holidays,isBusinessDay,shift,next};
