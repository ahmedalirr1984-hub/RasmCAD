/* Analytic construction methods, solved in local coordinates. */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory(require('./precision.js'));else root.RasmConstruction=factory(root.RasmPrecision);})(typeof globalThis!=='undefined'?globalThis:this,function(P){
'use strict';
function circleTTR(first,second,radius,near){
 if(!first||!second||first.kind!=='line'||second.kind!=='line')throw Error('CIRCLE TTR currently requires two LINE objects.');
 if(!Number.isFinite(radius)||radius<=0)throw Error('TTR radius must be positive.');
 const origin=first.points[0],lines=[first,second].map(e=>{const[a,b]=e.points,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<=P.tolerance(a,b))throw Error('TTR cannot use a degenerate line.');return {a,b,len,nx:-dy/len,ny:dx/len,c:(-dy*(a.x-origin.x)+dx*(a.y-origin.y))/len};});
 const [a,b]=lines,det=a.nx*b.ny-a.ny*b.nx;
 if(P.determinantZero(a.nx,a.ny,b.nx,b.ny))throw Error('TTR on parallel lines is not supported. Choose intersecting LINE objects.');
 const candidates=[];for(const sa of [-1,1])for(const sb of [-1,1]){
  const ca=a.c+sa*radius,cb=b.c+sb*radius,q={x:(ca*b.ny-a.ny*cb)/det,y:(a.nx*cb-ca*b.nx)/det},center={x:origin.x+q.x,y:origin.y+q.y};
  if(!Number.isFinite(center.x)||!Number.isFinite(center.y)||Math.max(Math.abs(center.x),Math.abs(center.y),radius)>1e12)continue;
  const tangencies=lines.map((l,i)=>({x:center.x-l.nx*(i?sb:sa)*radius,y:center.y-l.ny*(i?sb:sa)*radius}));
  candidates.push({center,radius,tangencies});
 }
 if(!candidates.length)throw Error('TTR construction is outside the supported coordinate range.');
 const target=near||origin;candidates.sort((a,b)=>Math.hypot(a.center.x-target.x,a.center.y-target.y)-Math.hypot(b.center.x-target.x,b.center.y-target.y));
 return candidates[0];
}
return Object.freeze({circleTTR});
});
