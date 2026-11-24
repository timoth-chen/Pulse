(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseSankey=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function build(data){
  const valid=rows=>(rows||[]).filter(r=>Number.isFinite(r.total)&&Math.round(Math.abs(r.total)*100)>0);
  const entry=(r,kind,suffix='')=>({...r,label:r.label+suffix,total:Math.abs(r.total),
    detail:r.synthetic?null:{label:r.label,kind,grouping:data.grouping==='both'?'category':data.grouping||'category'}});
  let left=[...valid(data.income).filter(r=>r.total>0).map(r=>entry(r,'income')),...valid(data.expense).filter(r=>r.total<0).map(r=>entry(r,'expense',' refunds'))],
      right=[...valid(data.expense).filter(r=>r.total>0).map(r=>entry(r,'expense')),...valid(data.income).filter(r=>r.total<0).map(r=>entry(r,'income',' reversals'))];
  const sum=rows=>rows.reduce((n,r)=>n+Math.round(r.total*100),0),l=sum(left),r=sum(right),totalCents=Math.max(l,r);
  if(!totalCents)return null;
  if(l<r)left.push({label:'From existing funds',total:(r-l)/100,color:'#8fa0d2'});else if(l>r)right.push({label:'Net savings',total:(l-r)/100,color:'#51aa8f'});
  const condense=(rows,label)=>{rows=rows.map(n=>({...n,cents:Math.round(n.total*100)})).sort((a,b)=>b.cents-a.cents);if(rows.length<=12)return rows;const rest=rows.slice(11);return [...rows.slice(0,11),{label:`Other ${label} (${rest.length})`,total:sum(rest)/100,cents:sum(rest),color:'#8fa0b7',members:rest}];};
  left=condense(left,'sources');right=condense(right,'uses');
  const height=Math.max(420,Math.max(left.length,right.length)*60+64),gap=14,pad=40,available=height-pad*2;
  const used=(rows,scale)=>rows.reduce((h,n)=>h+Math.max(42,n.cents*scale),0)+gap*(rows.length-1);
  let low=0,high=available/totalCents;for(let i=0;i<60;i++){const mid=(low+high)/2;if(Math.max(used(left,mid),used(right,mid))<=available)low=mid;else high=mid;}
  const scale=low,centerHeight=totalCents*scale,centerTop=(height-centerHeight)/2;
  const layout=rows=>{let y=(height-used(rows,scale))/2,offset=centerTop;return rows.map(n=>{const h=n.cents*scale,rowHeight=Math.max(42,h),node={...n,h,y:y+(rowHeight-h)/2,cy:y+rowHeight/2,centerY:offset};offset+=h;y+=rowHeight+gap;return node;});};
  return {width:1200,height,total:totalCents/100,centerTop,centerHeight,left:layout(left),right:layout(right)};
 }
 function ribbon(x1,y1,x2,y2,h){const bend=(x2-x1)*.48;return `M${x1},${y1} C${x1+bend},${y1} ${x2-bend},${y2} ${x2},${y2} L${x2},${y2+h} C${x2-bend},${y2+h} ${x1+bend},${y1+h} ${x1},${y1+h} Z`;}
 return {build,ribbon};
});
