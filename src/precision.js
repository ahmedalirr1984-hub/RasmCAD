/* Numerical predicates shared by construction, editing and object snaps. */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory();else root.RasmPrecision=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const TAU=2*Math.PI,mod=a=>(a%TAU+TAU)%TAU;
function tolerance(...points){let scale=1;for(const p of points)if(p)scale=Math.max(scale,Math.abs(p.x),Math.abs(p.y));return 1e-8+Number.EPSILON*8*scale;}
function onArc(p,c,r,start,sweep,full=false){if(full)return true;const a=mod(Math.atan2(p.y-c.y,p.x-c.x)-start),t=Math.max(1e-12,tolerance(p,c)/Math.max(r,1e-12));return a<=sweep+t||TAU-a<=t;}
function determinantZero(ax,ay,bx,by){return Math.abs(ax*by-ay*bx)<=Number.EPSILON*8*(Math.abs(ax*by)+Math.abs(ay*bx));}
function circleThrough3Points(a,b,c){const u={x:b.x-a.x,y:b.y-a.y},v={x:c.x-a.x,y:c.y-a.y},den=2*(u.x*v.y-u.y*v.x);if(determinantZero(u.x,u.y,v.x,v.y))throw Error('Three non-collinear points are required.');const uu=u.x*u.x+u.y*u.y,vv=v.x*v.x+v.y*v.y;const center={x:a.x+(uu*v.y-vv*u.y)/den,y:a.y+(u.x*vv-v.x*uu)/den};const radius=Math.hypot(center.x-a.x,center.y-a.y);if(!Number.isFinite(radius)||radius<=0||Math.max(Math.abs(center.x),Math.abs(center.y),radius)>1e12)throw Error('Circle construction is outside the supported coordinate range.');return{center,radius};}
return Object.freeze({tolerance,onArc,determinantZero,circleThrough3Points});
});
