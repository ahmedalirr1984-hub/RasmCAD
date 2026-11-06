/* Analytic running object snaps in world coordinates. */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'),require('./editing.js'),require('./precision.js'));else root.RasmSnaps=factory(root.RasmCore,root.RasmEdit,root.RasmPrecision);})(typeof globalThis!=='undefined'?globalThis:this,function(C,E,P){
'use strict';
const TAU=2*Math.PI,dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),mod=a=>(a%TAU+TAU)%TAU;
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y),allModes=['endpoint','midpoint','center','quadrant','intersection','perpendicular','tangent','nearest'];
function onArc(e,p){return P.onArc(p,e.points[0],e.radius,e.startAngle,C.arcSpan(e.startAngle,e.endAngle),e.kind==='circle');}
function flat(e,id,out){if(e.kind==='compound'){for(const p of e.parts||[])flat(p,id,out);}else if(e.kind==='dimension'){const g=C.annotationGeometry(e);for(const s of g.segments)out.push({id,e:{kind:'line',points:[s.a,s.b]}});for(const a of g.arcs)out.push({id,e:{kind:'arc',points:[a.center],radius:a.radius,startAngle:a.startAngle,endAngle:a.endAngle}});}else if(e.kind==='polyline'||e.kind==='solid'){const p=e.points;for(let i=1;i<p.length;i++)out.push({id,e:{kind:'line',points:[p[i-1],p[i]]}});if(e.closed||e.kind==='solid')out.push({id,e:{kind:'line',points:[p.at(-1),p[0]]}});}else if(['line','circle','arc','text'].includes(e.kind))out.push({id,e});}
function projection(p,a,b,clamp){const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;if(l2===0)return null;let t=((p.x-a.x)*dx+(p.y-a.y)*dy)/l2;if(clamp)t=Math.max(0,Math.min(1,t));else if(t<0||t>1)return null;return{x:a.x+dx*t,y:a.y+dy*t};}
function nearBounds(e,p,t){if(e.kind==='line'){const[a,b]=e.points;return p.x>=Math.min(a.x,b.x)-t&&p.x<=Math.max(a.x,b.x)+t&&p.y>=Math.min(a.y,b.y)-t&&p.y<=Math.max(a.y,b.y)+t;}if(e.kind==='circle'||e.kind==='arc'){const d=dist(e.points[0],p);return Math.abs(d-e.radius)<=t;}return dist(p,e.points[0])<=t;}
function find(doc,cursor,tolerance,options={}){
 if(!point(cursor)||!Number.isFinite(tolerance)||tolerance<=0)throw Error('Snap cursor and tolerance must be finite and positive');
 const enabled=new Set(options.modes||allModes),excluded=new Set(options.excludeIds||[]),base=point(options.base)?options.base:null,shapes=[];
 if(!enabled.size)return null;
 for(const e of doc.entities)if(!excluded.has(e.id)&&doc.layer(e.layer)?.visible!==false)flat(e,e.id,shapes);
 let best=null,bestScore=Infinity;const bias={endpoint:0,intersection:0,midpoint:.04,center:.04,quadrant:.04,perpendicular:.08,tangent:.08,nearest:2};
 function add(p,type,ids){if(!p||!point(p)||!enabled.has(type))return;const d=dist(cursor,p);if(d>tolerance)return;const rank=options.priority?.indexOf(type);const score=options.priority?(rank<0?allModes.length:rank)*tolerance*2+d:d+tolerance*(bias[type]||0);if(score<bestScore){bestScore=score;best={point:{x:p.x,y:p.y},type,entityIds:[...new Set(ids)],distance:d};}}
 const nearby=[];
 for(const item of shapes){const e=item.e,p=e.points,id=item.id;if(e.kind==='line'){
  add(p[0],'endpoint',[id]);add(p[1],'endpoint',[id]);add({x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2},'midpoint',[id]);
  if(enabled.has('nearest'))add(projection(cursor,p[0],p[1],true),'nearest',[id]);
  if(base&&enabled.has('perpendicular'))add(projection(base,p[0],p[1],false),'perpendicular',[id]);
 }else if(e.kind==='circle'||e.kind==='arc'){
  const c=p[0],r=e.radius;add(c,'center',[id]);
  if(e.kind==='arc'){for(const a of[e.startAngle,e.endAngle])add({x:c.x+r*Math.cos(a),y:c.y+r*Math.sin(a)},'endpoint',[id]);const a=e.startAngle+C.arcSpan(e.startAngle,e.endAngle)/2;add({x:c.x+r*Math.cos(a),y:c.y+r*Math.sin(a)},'midpoint',[id]);}
  for(let i=0;i<4;i++){const a=i*Math.PI/2,q={x:c.x+r*Math.cos(a),y:c.y+r*Math.sin(a)};if(onArc(e,q))add(q,'quadrant',[id]);}
  const dx=cursor.x-c.x,dy=cursor.y-c.y,d=Math.hypot(dx,dy);
  if(d>0&&enabled.has('nearest')){let q={x:c.x+r*dx/d,y:c.y+r*dy/d};if(onArc(e,q))add(q,'nearest',[id]);else for(const a of[e.startAngle,e.endAngle])add({x:c.x+r*Math.cos(a),y:c.y+r*Math.sin(a)},'nearest',[id]);}
  if(base){const bx=base.x-c.x,by=base.y-c.y,bd=Math.hypot(bx,by);
   if(bd>0&&enabled.has('perpendicular'))for(const sign of[-1,1]){const q={x:c.x+sign*r*bx/bd,y:c.y+sign*r*by/bd};if(onArc(e,q))add(q,'perpendicular',[id]);}
   if(enabled.has('tangent')&&bd>=r){const angle=Math.atan2(by,bx),offset=Math.acos(Math.min(1,r/bd));for(const a of[angle-offset,angle+offset]){const q={x:c.x+r*Math.cos(a),y:c.y+r*Math.sin(a)};if(onArc(e,q))add(q,'tangent',[id]);}}
  }
 }else if(e.kind==='text')add(p[0],'endpoint',[id]);
 if(enabled.has('intersection')&&['line','circle','arc'].includes(e.kind)&&nearBounds(e,cursor,tolerance))nearby.push(item);
 }
 if(enabled.has('intersection')){
  // Never discard a curve merely because it was inserted after the 240th.
  // An explicit pair budget bounds worst-case pointer work. Warn independently
  // of a winning snap; callers must not mistake an incomplete search for exact.
  const budget=options.maxIntersectionPairs??100000;let pairs=0,incomplete=false;
  search:for(let i=0;i<nearby.length;i++)for(let j=i+1;j<nearby.length;j++){
   // Zero score is a proven optimum; later intersections cannot improve it.
   if(bestScore===0)break search;
   if(++pairs>budget){incomplete=true;break search;}
   const a=nearby[i],b=nearby[j];for(const p of E.intersections(a.e,b.e))add(p,'intersection',[a.id,b.id]);
  }
  if(incomplete){const warning='Intersection search incomplete: '+budget+' pair budget reached. Zoom in or use a one-shot snap on isolated geometry.';options.onWarning?.(warning);if(best)best.warnings=[warning];}
 }
 return best;
}
return Object.freeze({find,modes:Object.freeze(allModes.slice())});
});
