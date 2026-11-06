/* Independent advanced 2D CAD editing. All edits validate before one history checkpoint. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'),require('./precision.js'));
  else root.RasmEdit = factory(root.RasmCore,root.RasmPrecision);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C,P) {
  'use strict';
  if (!C) throw new Error('RasmCore is required');
  const PI = Math.PI, TAU = 2 * PI, EPS = 1e-8, MAX_PARTS = 4096, MAX_COPIES = 10000;
  const add = (a,b) => ({x:a.x+b.x,y:a.y+b.y}), sub = (a,b) => ({x:a.x-b.x,y:a.y-b.y}), mul = (a,s) => ({x:a.x*s,y:a.y*s});
  const dot = (a,b) => a.x*b.x+a.y*b.y, cross = (a,b) => a.x*b.y-a.y*b.x;
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y), norm = a => Math.hypot(a.x,a.y);
  const clone = o => JSON.parse(JSON.stringify(o)), modulo = a => ((a%TAU)+TAU)%TAU;
  function fail(message) { throw new Error(message); }
  function check(ok,message) { if(!ok)fail(message); }
  function finite(n,label) { check(typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e12,'Invalid '+label);return n; }
  function point(p,label='point') { check(p&&typeof p==='object','Invalid '+label);finite(p.x,label+' X');finite(p.y,label+' Y');return {x:p.x,y:p.y}; }
  function unit(v) { const l=norm(v);check(l>EPS,'Degenerate geometry has no direction');return mul(v,1/l); }
  const tol=P.tolerance;
  function span(e) { const s=modulo(e.endAngle-e.startAngle);return s<EPS?TAU:s; }
  function onArcPrimitive(p,c) { return P.onArc(p,c.c,c.r,c.start,c.sweep,c.full); }
  function unique(points,tolerance=EPS) { const out=[];for(const p of points)if(!out.some(q=>distance(p,q)<=Math.max(tolerance,tol(p,q))))out.push(p);return out; }
  function primitives(e) {
    check(e&&Array.isArray(e.points),'Invalid entity');const p=e.points;
    if(e.kind==='line')return [{type:'line',a:p[0],b:p[1]}];
    if(e.kind==='polyline'){check(p.length<=MAX_PARTS,'Polyline is too large for this editing operation');const out=[];for(let i=1;i<p.length;i++)out.push({type:'line',a:p[i-1],b:p[i]});if(e.closed)out.push({type:'line',a:p[p.length-1],b:p[0]});return out;}
    if(e.kind==='circle'||e.kind==='arc')return [{type:'circle',c:p[0],r:e.radius,start:e.startAngle||0,sweep:e.kind==='circle'?TAU:span(e),full:e.kind==='circle'||span(e)>=TAU-EPS}];
    return [];
  }
  function lineLine(a,b,infiniteA,infiniteB) {
    const da=sub(a.b,a.a),db=sub(b.b,b.a),la=norm(da),lb=norm(db);if(la<EPS||lb<EPS)return [];
    const den=cross(da,db),delta=sub(b.a,a.a),tolerance=tol(a.a,a.b,b.a,b.b);
    if(P.determinantZero(da.x,da.y,db.x,db.y)) {
      if(Math.abs(cross(delta,da))/la>tolerance)return [];
      // Collinear overlap has no unique infinite intersection. Finite shared endpoints are useful trim cuts.
      if(infiniteA&&infiniteB)return [];
      const on=(p,l,inf)=>inf||dot(sub(p,l.a),sub(l.b,l.a))>=-tolerance*norm(sub(l.b,l.a))&&dot(sub(p,l.b),sub(l.a,l.b))>=-tolerance*norm(sub(l.b,l.a));
      return unique([a.a,a.b,b.a,b.b].filter(p=>on(p,a,infiniteA)&&on(p,b,infiniteB)),tolerance);
    }
    const t=cross(delta,db)/den,u=cross(delta,da)/den;
    if((!infiniteA&&(t<-tolerance/la||t>1+tolerance/la))||(!infiniteB&&(u<-tolerance/lb||u>1+tolerance/lb)))return [];
    return [add(a.a,mul(da,t))];
  }
  function lineCircle(l,c,infiniteLine) {
    const d=sub(l.b,l.a),length=norm(d);if(length<EPS)return [];
    const u=mul(d,1/length),v=sub(c.c,l.a),along=dot(v,u),perp=cross(v,u),tolerance=tol(l.a,l.b,c.c);
    let h2=c.r*c.r-perp*perp;if(h2<-tolerance*Math.max(1,c.r))return [];h2=Math.max(0,h2);
    const roots=h2<=tolerance*tolerance?[along]:[along-Math.sqrt(h2),along+Math.sqrt(h2)];
    return roots.filter(t=>infiniteLine||t>=-tolerance&&t<=length+tolerance).map(t=>add(l.a,mul(u,t))).filter(p=>onArcPrimitive(p,c));
  }
  function circleCircle(a,b) {
    const v=sub(b.c,a.c),d=norm(v),tolerance=tol(a.c,b.c);if(d<tolerance)return [];
    if(d>a.r+b.r+tolerance||d<Math.abs(a.r-b.r)-tolerance)return [];
    const x=(a.r*a.r-b.r*b.r+d*d)/(2*d),base=add(a.c,mul(v,x/d));let h2=a.r*a.r-x*x;
    if(h2<-tolerance*Math.max(1,a.r))return [];h2=Math.max(0,h2);const n={x:-v.y/d,y:v.x/d};
    return unique([add(base,mul(n,Math.sqrt(h2))),sub(base,mul(n,Math.sqrt(h2)))]).filter(p=>onArcPrimitive(p,a)&&onArcPrimitive(p,b));
  }
  function intersections(entityA,entityB,options={}) {
    const a=primitives(entityA),b=primitives(entityB);check(a.length*b.length<=1000000,'Too many intersection comparisons');const out=[];
    for(const pa of a)for(const pb of b){if(pa.type==='line'&&pb.type==='line')out.push(...lineLine(pa,pb,!!options.infiniteA,!!options.infiniteB));else if(pa.type==='line')out.push(...lineCircle(pa,pb,!!options.infiniteA));else if(pb.type==='line')out.push(...lineCircle(pb,pa,!!options.infiniteB));else out.push(...circleCircle(pa,pb));}
    return unique(out);
  }
  function entity(doc,id,editable=true) {
    const e=doc.entities.find(item=>item.id===id);check(e,'Selected entity no longer exists');
    const layer=doc.layer(e.layer);check(layer&&layer.visible,'Hidden layer cannot be edited');if(editable)check(!layer.locked,'Locked layer cannot be edited');return e;
  }
  function chosenEntities(doc,ids) { check(Array.isArray(ids)&&ids.length>0,'Select at least one entity');return [...new Set(ids)].map(id=>entity(doc,id)); }
  function transaction(doc,operation) {
    const original=doc.serialize(),working=C.Document.parse(original),ids=operation(working),serialized=working.serialize();
    check(Array.isArray(ids),'Editing operation did not return entity IDs');
    if(serialized===original)return ids;
    doc.checkpoint();doc.entities=working.entities;doc.layers=working.layers;doc.currentLayer=working.currentLayer;doc.nextId=working.nextId;doc.resources=working.resources;
    return ids;
  }
  function replace(doc,id,parts) {
    const index=doc.entities.findIndex(e=>e.id===id);check(index>=0,'Entity not found');check(parts.length>0,'Operation would remove the entire entity');
    const result=[];parts.forEach((part,i)=>{part.id=i===0?id:0;if(i===0){doc.entities[index]=part;result.push(id);}else result.push(doc.add(part));});return result;
  }
  function cutters(doc,targetId,ids) {
    check(Array.isArray(ids),'Boundary IDs must be an array');const requested=ids.length?new Set(ids):null;
    const found=doc.entities.filter(e=>e.id!==targetId&&(!requested||requested.has(e.id))&&doc.layer(e.layer)?.visible&&primitives(e).length);
    check(found.length>0,'Select a visible line, polyline, circle or arc boundary');return found;
  }
  function path(e) {
    if(e.kind==='line'||e.kind==='polyline') {
      const points=e.points,segments=[],lengths=[0];let length=0;
      for(let i=1;i<points.length;i++){const l=distance(points[i-1],points[i]);check(l>EPS,'Polyline contains a zero-length segment');segments.push({a:points[i-1],b:points[i],start:length,length:l});length+=l;lengths.push(length);}
      if(e.closed){const l=distance(points[points.length-1],points[0]);check(l>EPS,'Closed polyline contains a zero-length segment');segments.push({a:points[points.length-1],b:points[0],start:length,length:l});length+=l;lengths.push(length);}
      function at(s){s=Math.max(0,Math.min(length,s));const seg=segments.find(item=>s<=item.start+item.length+EPS)||segments[segments.length-1];return add(seg.a,mul(sub(seg.b,seg.a),(s-seg.start)/seg.length));}
      function nearest(p){let best=Infinity,result=0;for(const seg of segments){const d=sub(seg.b,seg.a),t=Math.max(0,Math.min(1,dot(sub(p,seg.a),d)/(seg.length*seg.length))),q=add(seg.a,mul(d,t)),dist=distance(p,q);if(dist<best){best=dist;result=seg.start+t*seg.length;}}return result;}
      return {length,closed:!!e.closed,at,nearest,breaks:lengths,kind:'linear'};
    }
    check(e.kind==='circle'||e.kind==='arc','Trim supports lines, polylines, circles and arcs');const start=e.kind==='circle'?0:e.startAngle,total=e.kind==='circle'?TAU:span(e),length=total*e.radius;
    const at=s=>add(e.points[0],{x:e.radius*Math.cos(start+s/e.radius),y:e.radius*Math.sin(start+s/e.radius)});
    const nearest=p=>{const a=modulo(Math.atan2(p.y-e.points[0].y,p.x-e.points[0].x)-start);if(a<=total+EPS)return Math.min(length,a*e.radius);return distance(p,at(0))<=distance(p,at(length))?0:length;};
    return {length,closed:e.kind==='circle'||total>=TAU-EPS,at,nearest,breaks:[0,length],kind:'circular',start};
  }
  function pathPiece(e,p,start,end) {
    check(end-start>EPS,'Trim produced a zero-length piece');const out=clone(e);
    if(p.kind==='circular'){out.kind='arc';out.startAngle=p.start+start/e.radius;out.endAngle=p.start+end/e.radius;out.closed=false;return out;}
    const points=[p.at(start)];for(const b of p.breaks)if(b>start+EPS&&b<end-EPS)points.push(p.at(b));points.push(p.at(end));out.points=points;out.closed=false;out.kind=e.kind==='line'?'line':'polyline';return out;
  }
  function edgeOptions(options){check(options&&typeof options==='object'&&!Array.isArray(options),'Invalid editing options');for(const key of Object.keys(options))check(key==='edge','Unsupported boundary option: '+key);check(options.edge===undefined||['none','extend'].includes(options.edge),'Edge must be none or extend');return options.edge==='extend';}
  function extendedBoundary(e,extended){return extended&&e.kind==='arc'?{...e,kind:'circle'}:e;}
  function trim(doc,targetId,pickPoint,boundaryIds=[],options={}) {
    const extended=edgeOptions(options);
    point(pickPoint);return transaction(doc,w=>{
      const e=entity(w,targetId),p=path(e);check(p.length>EPS,'Cannot trim a degenerate entity');
      const cuts=[];for(const boundary of cutters(w,targetId,boundaryIds))for(const hit of intersections(e,extendedBoundary(boundary,extended),{infiniteB:extended})){const s=p.nearest(hit);if(p.closed||s>EPS&&s<p.length-EPS)cuts.push(s);}
      const sorted=[...cuts].sort((a,b)=>a-b).filter((s,i,arr)=>i===0||s-arr[i-1]>EPS);
      if(p.closed&&sorted.length>1&&p.length-sorted[sorted.length-1]+sorted[0]<=EPS)sorted.pop();
      check(sorted.length>=(p.closed?2:1),'No usable boundary intersections for trimming');const pick=p.nearest(pickPoint),parts=[];
      if(!p.closed){const all=[0,...sorted,p.length];let interval=all.findIndex((v,i)=>i<all.length-1&&pick>=v-EPS&&pick<=all[i+1]+EPS);if(interval<0)interval=all.length-2;const lo=all[interval],hi=all[interval+1];if(lo>EPS)parts.push(pathPiece(e,p,0,lo));if(hi<p.length-EPS)parts.push(pathPiece(e,p,hi,p.length));}
      else {
        let low=sorted[sorted.length-1]-p.length,high=sorted[0];for(let i=0;i<sorted.length;i++){const a=sorted[i],b=i+1<sorted.length?sorted[i+1]:sorted[0]+p.length;let s=pick;if(s<a)s+=p.length;if(s>=a-EPS&&s<=b+EPS){low=a;high=b;break;}}
        if(p.kind==='circular')parts.push(pathPiece(e,p,high,low+p.length));
        else {const start=high%p.length,end=low%p.length;const q=clone(e);q.kind='polyline';q.closed=false;q.points=[p.at(start)];if(start>end+EPS){for(const b of p.breaks)if(b>start+EPS&&b<p.length-EPS)q.points.push(p.at(b));q.points.push(p.at(0));for(const b of p.breaks)if(b>EPS&&b<end-EPS)q.points.push(p.at(b));}else for(const b of p.breaks)if(b>start+EPS&&b<end-EPS)q.points.push(p.at(b));q.points.push(p.at(end));parts.push(q);}
      }
      return replace(w,targetId,parts);
    });
  }
  function extend(doc,targetId,pickPoint,boundaryIds=[],options={}) {
    const extended=edgeOptions(options);
    point(pickPoint);return transaction(doc,w=>{
      const e=entity(w,targetId),boundaries=cutters(w,targetId,boundaryIds),out=clone(e);
      if(e.kind==='line'||e.kind==='polyline'){
        check(!e.closed,'A closed polyline has no endpoint to extend');const p=e.points,n=p.length,index=distance(pickPoint,p[0])<=distance(pickPoint,p[n-1])?0:n-1,inner=index===0?1:n-2;
        const direction=unit(sub(p[index],p[inner])),line={kind:'line',points:[p[inner],p[index]]};let best=Infinity,hit=null;
        for(const b of boundaries)for(const q of intersections(line,extendedBoundary(b,extended),{infiniteA:true,infiniteB:extended})){const t=dot(sub(q,p[index]),direction);if(t>tol(q,p[index])&&t<best){best=t;hit=q;}}
        check(hit,'No boundary intersects the forward extension of this endpoint');out.points[index]=hit;
      } else if(e.kind==='arc') {
        const total=span(e);check(total<TAU-EPS,'A full circle has no endpoint to extend');const center=e.points[0],at=a=>add(center,{x:e.radius*Math.cos(a),y:e.radius*Math.sin(a)}),start=at(e.startAngle),end=at(e.endAngle),atStart=distance(pickPoint,start)<=distance(pickPoint,end),circle={...e,kind:'circle'};let best=Infinity,angleHit=0;
        for(const b of boundaries)for(const q of intersections(circle,extendedBoundary(b,extended),{infiniteB:extended})){const a=Math.atan2(q.y-center.y,q.x-center.x),delta=atStart?modulo(e.startAngle-a):modulo(a-e.endAngle);if(delta>EPS&&delta<TAU-total-EPS&&delta<best){best=delta;angleHit=a;}}
        check(Number.isFinite(best),'No boundary intersects the available circular extension');if(atStart)out.startAngle=e.startAngle-best;else out.endAngle=e.endAngle+best;
      } else fail('Extend supports lines, open polylines and arcs');
      return replace(w,targetId,[out]);
    });
  }
  function offset(doc,ids,amount,sidePoint,options={}){point(sidePoint);check(options&&typeof options==='object'&&!Array.isArray(options),'Invalid offset options');for(const key of Object.keys(options))check(['through','layer','eraseSource'].includes(key),'Unsupported offset option: '+key);check(options.layer===undefined||['source','current'].includes(options.layer),'Offset layer must be source or current');if(options.through!==undefined)check(typeof options.through==='boolean','Through option must be boolean');if(options.eraseSource!==undefined)check(typeof options.eraseSource==='boolean','Erase source option must be boolean');if(!options.through){finite(amount,'offset distance');check(amount>EPS,'Offset distance must be positive');}return transaction(doc,w=>{
    const outputs=[];for(const source of chosenEntities(w,ids)){const e=clone(source);e.id=0;
      let step=amount;
      if(options.layer==='current'){const layer=w.layer(w.currentLayer);check(layer&&layer.visible&&!layer.locked,'Current offset layer is hidden or locked');e.layer=w.currentLayer;}
      if(options.through){if(e.kind==='circle'||e.kind==='arc')step=Math.abs(distance(sidePoint,e.points[0])-e.radius);else if(e.kind==='line'||e.kind==='polyline'){let best=Infinity;for(const segment of primitives(e)){const u=unit(sub(segment.b,segment.a)),along=Math.max(0,Math.min(distance(segment.a,segment.b),dot(sub(sidePoint,segment.a),u))),d=distance(sidePoint,add(segment.a,mul(u,along)));if(d<best){best=d;step=Math.abs(cross(u,sub(sidePoint,segment.a)));}}}else fail('Offset supports lines, polylines, circles and arcs');check(step>EPS,'Through point lies on the source; choose a nonzero offset');}
      if(e.kind==='circle'||e.kind==='arc'){const sign=distance(sidePoint,e.points[0])>=e.radius?1:-1;e.radius+=sign*step;check(e.radius>EPS,'Offset would create a nonpositive radius');}
      else if(e.kind==='line'||e.kind==='polyline'){
        const p=e.points,n=p.length,count=e.closed?n:n-1,segments=[];let closest=Infinity,side=1;
        for(let i=0;i<count;i++){const a=p[i],b=p[(i+1)%n],u=unit(sub(b,a)),normal={x:-u.y,y:u.x};const t=Math.max(0,Math.min(distance(a,b),dot(sub(sidePoint,a),u)));const d=distance(sidePoint,add(a,mul(u,t)));if(d<closest){closest=d;side=cross(u,sub(sidePoint,a))>=0?1:-1;}segments.push({a,b,u,normal});}
        const shifted=segments.map(s=>({a:add(s.a,mul(s.normal,step*side)),b:add(s.b,mul(s.normal,step*side))}));const q=[];
        for(let i=0;i<n;i++){if(!e.closed&&i===0){q.push(shifted[0].a);continue;}if(!e.closed&&i===n-1){q.push(shifted[count-1].b);continue;}const a=shifted[(i-1+count)%count],b=shifted[i%count],hits=lineLine(a,b,true,true);const hit=hits[0]||b.a;check(distance(hit,p[i])<=step*1000,'Offset miter is too long');q.push(hit);}
        for(let i=0;i<count;i++)for(let j=i+2;j<count;j++){if(e.closed&&i===0&&j===count-1)continue;check(!lineLine({a:q[i],b:q[(i+1)%n]},{a:q[j],b:q[(j+1)%n]},false,false).length,'Offset would self-intersect');}
        check(q.every((a,i)=>i===0||distance(a,q[i-1])>EPS),'Offset collapsed a segment');
        if(e.closed){const signed=points=>points.reduce((s,a,i)=>s+cross(sub(a,points[0]),sub(points[(i+1)%n],points[0])),0),original=signed(p),shift=signed(q);check(original*shift>0,'Offset collapsed or inverted the polygon');for(let i=0;i<n;i++){const previous=sub(p[(i+1)%n],p[i]),next=sub(q[(i+1)%n],q[i]);check(dot(next,previous)>tol(q[i],p[i])*norm(previous),'Offset exceeds the polygon interior');}}
        e.points=q;
      }else fail('Offset supports lines, polylines, circles and arcs');outputs.push(w.add(e));
    }if(options.eraseSource)w.erase([...new Set(ids)]);return outputs;
  });}
  function corner(w,id1,id2,pick1,pick2){check(id1!==id2,'Select two different lines');const a=entity(w,id1),b=entity(w,id2);check(a.kind==='line'&&b.kind==='line','Fillet/chamfer currently support two LINE entities');const hit=lineLine({a:a.points[0],b:a.points[1]},{a:b.points[0],b:b.points[1]},true,true)[0];check(hit,'Lines must intersect at a unique corner');
    function ray(e,pick){let far=e.points.reduce((v,p)=>distance(p,hit)>distance(v,hit)?p:v,e.points[0]);let u=unit(sub(far,hit));if(pick&&Math.abs(dot(sub(pick,hit),u))>EPS&&dot(sub(pick,hit),u)<0)u=mul(u,-1);const candidates=e.points.filter(p=>dot(sub(p,hit),u)>EPS);check(candidates.length,'Pick the side of the line to keep');far=candidates.reduce((v,p)=>dot(sub(p,hit),u)>dot(sub(v,hit),u)?p:v);return{u,far,length:distance(hit,far)};}
    const ra=ray(a,pick1),rb=ray(b,pick2),theta=Math.acos(Math.max(-1,Math.min(1,dot(ra.u,rb.u))));check(theta>EPS&&theta<PI-EPS,'Lines must form a nonzero corner');return{a,b,hit,ra,rb,theta};
  }
  function cornerOptions(options){check(options&&typeof options==='object'&&!Array.isArray(options),'Invalid corner options');for(const key of Object.keys(options))check(key==='trim','Unsupported corner option: '+key);check(options.trim===undefined||typeof options.trim==='boolean','Trim option must be boolean');return options.trim!==false;}
  function fillet(doc,id1,id2,radius,pick1,pick2,options={}){const shouldTrim=cornerOptions(options);finite(radius,'fillet radius');check(radius>=0,'Fillet radius cannot be negative');return transaction(doc,w=>{const g=corner(w,id1,id2,pick1,pick2),t=radius/Math.tan(g.theta/2);check(t<g.ra.length-EPS&&t<g.rb.length-EPS,'Fillet radius is too large for the retained line segments');const pa=add(g.hit,mul(g.ra.u,t)),pb=add(g.hit,mul(g.rb.u,t));if(shouldTrim){g.a.points=[g.ra.far,pa];g.b.points=[g.rb.far,pb];}const ids=[id1,id2];if(radius>EPS){const center=add(g.hit,mul(unit(add(g.ra.u,g.rb.u)),radius/Math.sin(g.theta/2)));let start=Math.atan2(pa.y-center.y,pa.x-center.x),end=Math.atan2(pb.y-center.y,pb.x-center.x);if(modulo(end-start)>PI)[start,end]=[end,start];ids.push(w.add({...clone(g.a),id:0,kind:'arc',points:[center],radius,startAngle:start,endAngle:end,closed:false}));}return ids;});}
  function chamfer(doc,id1,id2,d1,d2,pick1,pick2,options={}){const shouldTrim=cornerOptions(options);finite(d1,'first chamfer distance');finite(d2,'second chamfer distance');check(d1>=0&&d2>=0&&d1+d2>EPS,'Chamfer distances must be nonnegative and not both zero');return transaction(doc,w=>{const g=corner(w,id1,id2,pick1,pick2);check(d1<g.ra.length-EPS&&d2<g.rb.length-EPS,'Chamfer distance exceeds the retained segment');const pa=add(g.hit,mul(g.ra.u,d1)),pb=add(g.hit,mul(g.rb.u,d2));if(shouldTrim){g.a.points=[g.ra.far,pa];g.b.points=[g.rb.far,pb];}return[id1,id2,w.add({...clone(g.a),id:0,kind:'line',points:[pa,pb],closed:false})];});}
  function chamferAngle(doc,id1,id2,amount,angleDegrees,pick1,pick2,options={}){finite(amount,'chamfer distance');finite(angleDegrees,'chamfer angle');check(amount>EPS,'Chamfer distance must be positive');const g=corner(doc,id1,id2,pick1,pick2),angle=angleDegrees*PI/180;check(angle>EPS&&angle<PI-g.theta-EPS,'Chamfer angle must lie inside the retained corner');const second=amount*Math.sin(angle)/Math.sin(g.theta+angle);return chamfer(doc,id1,id2,amount,second,pick1,pick2,options);}
  function mirror(doc,ids,a,b,copy=false){
    point(a);point(b);const u=unit(sub(b,a)),angle=Math.atan2(u.y,u.x);
    const reflect=p=>{const d=sub(p,a);return add(a,sub(mul(u,2*dot(d,u)),d));};
    const origin=reflect({x:0,y:0}),matrix=[2*u.x*u.x-1,2*u.x*u.y,2*u.x*u.y,2*u.y*u.y-1,origin.x,origin.y];
    return transaction(doc,w=>{const result=[];for(const src of chosenEntities(w,ids)){
      let e=clone(src);
      if(e.kind==='compound'){
        const B=typeof module==='object'&&module.exports?require('./blocks.js'):globalThis.RasmBlocks;
        check(B&&B.transformEntity,'Compound transform support is unavailable');e=B.transformEntity(e,matrix);
      }else{
        e.points=e.points.map(reflect);
        if(e.kind==='arc'){const start=e.startAngle;e.startAngle=2*angle-e.endAngle;e.endAngle=2*angle-start;}
        else if(e.kind==='text')e.startAngle=2*angle-e.startAngle;
      }
      if(copy){e.id=0;result.push(w.add(e));}else{w.entities[w.entities.findIndex(x=>x.id===e.id)]=e;result.push(e.id);}
    }return result;});
  }
  function rectangularArray(doc,ids,rows,cols,dx,dy){check(Number.isInteger(rows)&&rows>0&&Number.isInteger(cols)&&cols>0&&rows*cols<=MAX_COPIES,'Array rows/columns must be positive integers; maximum 10,000 instances');finite(dx,'column spacing');finite(dy,'row spacing');return transaction(doc,w=>{const sources=chosenEntities(w,ids).map(clone);check(sources.length*(rows*cols-1)<=MAX_COPIES,'Too many array objects');const result=[];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){if(!r&&!c)continue;const created=sources.map(e=>w.add({...clone(e),id:0}));w.transform(created,{translation:{x:c*dx,y:r*dy}});result.push(...created);}return result;});}
  function polarArray(doc,ids,center,count,angleDegrees=360){point(center);check(Number.isInteger(count)&&count>=2&&count<=MAX_COPIES,'Polar array count must be 2..10,000');finite(angleDegrees,'array angle');return transaction(doc,w=>{const sources=chosenEntities(w,ids).map(clone);check(sources.length*(count-1)<=MAX_COPIES,'Too many array objects');const result=[],step=angleDegrees*PI/180/(Math.abs(Math.abs(angleDegrees)-360)<EPS?count:count-1);for(let i=1;i<count;i++){const created=sources.map(e=>w.add({...clone(e),id:0}));w.transform(created,{rotation:i*step,pivot:center});result.push(...created);}return result;});}
  function explode(doc,ids){return transaction(doc,w=>{const sources=chosenEntities(w,ids),result=[];for(const e of sources){const parts=[];if(e.kind==='polyline'){for(const p of primitives(e))parts.push({...clone(e),kind:'line',points:[p.a,p.b],closed:false});}else if(e.kind==='dimension'){if(C.annotationGeometry){const g=C.annotationGeometry(e);for(const s of g.segments)parts.push({...clone(e),kind:'line',points:[s.a,s.b],closed:false,color:s.color??e.color});for(const a of g.arcs)parts.push({...clone(e),kind:'arc',points:[a.center],radius:a.radius,startAngle:a.startAngle,endAngle:a.endAngle,color:a.color??e.color});for(const l of g.labels)parts.push({...clone(e),kind:'text',points:[l.point],text:l.text,textHeight:l.height,startAngle:l.angle||0,color:l.color??e.color});}else{const g=C.dimensionGeometry(e);for(const s of[[g.a,g.da],[g.b,g.db],[g.da,g.db]])parts.push({...clone(e),kind:'line',points:s});parts.push({...clone(e),kind:'text',points:[g.label],text:g.length.toFixed(2)});}}else fail('Explode supports polylines and dimensions');result.push(...replace(w,e.id,parts));}return result;});}
  function join(doc,ids,tolerance=1e-6){finite(tolerance,'join tolerance');check(tolerance>0,'Join tolerance must be positive');return transaction(doc,w=>{const list=chosenEntities(w,ids);check(list.length>=2,'Select at least two open lines/polylines');check(list.every(e=>(e.kind==='line'||e.kind==='polyline')&&!e.closed),'Join supports open lines and polylines');check(list.every(e=>e.layer===list[0].layer),'Joined objects must use the same layer');let chain=clone(list[0].points),remaining=list.slice(1);while(remaining.length){let matched=false;for(let i=0;i<remaining.length;i++){let p=clone(remaining[i].points);if(distance(chain.at(-1),p[0])<=tolerance)chain.push(...p.slice(1));else if(distance(chain.at(-1),p.at(-1))<=tolerance){p.reverse();chain.push(...p.slice(1));}else if(distance(chain[0],p.at(-1))<=tolerance)chain.unshift(...p.slice(0,-1));else if(distance(chain[0],p[0])<=tolerance){p.reverse();chain.unshift(...p.slice(0,-1));}else continue;remaining.splice(i,1);matched=true;break;}check(matched,'Selected objects do not form one connected chain');}const closed=distance(chain[0],chain.at(-1))<=tolerance;if(closed)chain.pop();const result={...clone(list[0]),kind:'polyline',points:chain,closed};w.erase(list.slice(1).map(e=>e.id));return replace(w,list[0].id,[result]);});}
  function area(e){if(e.kind==='circle')return{area:PI*e.radius**2,signedArea:PI*e.radius**2,perimeter:TAU*e.radius};check(e.kind==='polyline'&&e.closed,'Area requires a circle or closed polyline');let sum=0,perimeter=0;for(let i=0;i<e.points.length;i++){sum+=cross(sub(e.points[i],e.points[0]),sub(e.points[(i+1)%e.points.length],e.points[0]));perimeter+=distance(e.points[i],e.points[(i+1)%e.points.length]);}return{area:Math.abs(sum)/2,signedArea:sum/2,perimeter};}
  function angle(a,vertex,b){point(a);point(vertex);point(b);const u=unit(sub(a,vertex)),v=unit(sub(b,vertex));return Math.acos(Math.max(-1,Math.min(1,dot(u,v))))*180/PI;}
  return Object.freeze({trim,extend,offset,fillet,chamfer,chamferAngle,mirror,rectangularArray,polarArray,explode,join,area,angle,distance,intersections});
});
