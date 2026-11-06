/* Independent planar boundaries, regions and clipped editable hatch geometry. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'),require('./editing.js'));
  else root.RasmHatch=factory(root.RasmCore,root.RasmEdit);
})(typeof globalThis!=='undefined'?globalThis:this,function(C,E){
  'use strict';
  const EPS=1e-7,MAX_SEGMENTS=1200,MAX_PARTS=20000,MAX_VERTICES=4096,TAU=2*Math.PI;
  const clone=x=>JSON.parse(JSON.stringify(x)),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  function check(value,message){if(!value)throw Error(message);}
  function point(p){check(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=1e12&&Math.abs(p.y)<=1e12,'Boundary contains an invalid coordinate.');return{x:p.x,y:p.y};}
  function tolerance(points){let m=1;for(const p of points)m=Math.max(m,Math.abs(p.x),Math.abs(p.y));return EPS+Number.EPSILON*m*2;}
  function signedArea(loop){const o=loop[0];let sum=0;for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length];sum+=(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);}return sum/2;}
  function onSegment(p,a,b,t=EPS){const length=dist(a,b);if(length<=t)return dist(p,a)<=t;return Math.abs(cross(a,b,p))/length<=t&&(p.x-a.x)*(p.x-b.x)+(p.y-a.y)*(p.y-b.y)<=t*length;}
  function contains(loop,p,includeEdge=true){let odd=false;const t=tolerance([p,...loop]);for(let i=0,j=loop.length-1;i<loop.length;j=i++){
    const a=loop[j],b=loop[i];if(onSegment(p,a,b,t))return includeEdge;
    if((a.y>p.y)!==(b.y>p.y)&&(b.x-a.x)*(p.y-a.y)/(b.y-a.y)>p.x-a.x)odd=!odd;
  }return odd;}
  function inside(loops,p){let odd=false;for(const loop of loops)if(contains(loop,p,false))odd=!odd;return odd;}
  function cleanLoop(raw){
    check(Array.isArray(raw)&&raw.length>=3&&raw.length<=MAX_VERTICES,'Boundary needs 3–4096 vertices.');
    const loop=[],t=tolerance(raw);for(const p of raw){const q=point(p);if(!loop.length||dist(q,loop.at(-1))>t)loop.push(q);}
    if(loop.length>1&&dist(loop[0],loop.at(-1))<=t)loop.pop();
    check(loop.length>=3&&Math.abs(signedArea(loop))>t*t,'Boundary has zero area.');return loop;
  }
  function intersection(a,b,c,d){
    // Translate to a local origin before calling the existing intersection engine.
    const local=p=>({x:p.x-a.x,y:p.y-a.y});
    return E.intersections({kind:'line',points:[{x:0,y:0},local(b)]},{kind:'line',points:[local(c),local(d)]}).map(p=>({x:p.x+a.x,y:p.y+a.y}));
  }
  function validateLoops(raw){
    check(Array.isArray(raw)&&raw.length&&raw.length<=256,'Select at least one closed boundary (maximum 256 loops).');
    const loops=raw.map(cleanLoop),count=loops.reduce((n,l)=>n+l.length,0);check(count<=MAX_VERTICES,'Hatch boundaries exceed 4096 vertices.');
    // Intersections across loops are rejected, but endpoint contacts and shared
    // edges between adjacent planar faces are valid even-odd boundaries.
    let comparisons=0;
    for(let n=0;n<loops.length;n++)for(let m=n;m<loops.length;m++){
      const a=loops[n],b=loops[m];
      for(let i=0;i<a.length;i++)for(let j=m===n?i+1:0;j<b.length;j++){
        if(n===m&&(j===i+1||i===0&&j===a.length-1))continue;
        const p=a[i],q=a[(i+1)%a.length],r=b[j],s=b[(j+1)%b.length];
        if(Math.max(p.x,q.x)<Math.min(r.x,s.x)-EPS||Math.max(r.x,s.x)<Math.min(p.x,q.x)-EPS||Math.max(p.y,q.y)<Math.min(r.y,s.y)-EPS||Math.max(r.y,s.y)<Math.min(p.y,q.y)-EPS)continue;
        check(++comparisons<=2000000,'Boundary validation exceeds its geometry limit.');
        const hits=intersection(p,q,r,s),t=tolerance([p,q,r,s]);
        if(n===m)check(!hits.length,'Self-intersecting boundaries are not supported.');
        else for(const hit of hits)check([p,q].some(v=>dist(v,hit)<=t)||[r,s].some(v=>dist(v,hit)<=t),'Crossing boundary loops must be split into planar regions first.');
      }
    }
    return loops.sort((a,b)=>Math.abs(signedArea(b))-Math.abs(signedArea(a)));
  }
  function circleLoop(e){const steps=Math.max(128,Math.min(256,Math.ceil(TAU*Math.sqrt(Math.max(1,e.radius))))),c=e.points[0];return Array.from({length:steps},(_,i)=>({x:c.x+e.radius*Math.cos(i*TAU/steps),y:c.y+e.radius*Math.sin(i*TAU/steps)}));}
  function segmentsOf(e,out=[]){
    if(e.kind==='compound'){
      if(['hatch','region'].includes(e.subtype)&&e.data?.loops){for(const loop of e.data.loops)for(let i=0;i<loop.length;i++)out.push({a:point(loop[i]),b:point(loop[(i+1)%loop.length])});}
      else for(const part of e.parts||[])segmentsOf(part,out);return out;
    }
    let p=e.points;
    if(e.kind==='circle')p=circleLoop(e);
    else if(e.kind==='arc'){let span=C.arcSpan(e.startAngle,e.endAngle),steps=Math.max(8,Math.ceil(span/.04));p=Array.from({length:steps+1},(_,i)=>({x:e.points[0].x+e.radius*Math.cos(e.startAngle+i*span/steps),y:e.points[0].y+e.radius*Math.sin(e.startAngle+i*span/steps)}));}
    else if(!['line','polyline','solid'].includes(e.kind))return out;
    for(let i=1;i<p.length;i++)if(dist(p[i-1],p[i])>EPS)out.push({a:point(p[i-1]),b:point(p[i])});
    if(e.closed||e.kind==='circle'||e.kind==='solid')out.push({a:point(p.at(-1)),b:point(p[0])});return out;
  }
  function planarFaces(entities){
    const segments=[];for(const e of entities)segmentsOf(e,segments);
    check(segments.length&&segments.length<=MAX_SEGMENTS,'Boundary detection supports at most 1200 sampled segments; select a smaller boundary set.');
    const cuts=segments.map(s=>[s.a,s.b]);
    for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
      const a=segments[i],b=segments[j];
      if(Math.max(a.a.x,a.b.x)<Math.min(b.a.x,b.b.x)-EPS||Math.max(b.a.x,b.b.x)<Math.min(a.a.x,a.b.x)-EPS||Math.max(a.a.y,a.b.y)<Math.min(b.a.y,b.b.y)-EPS||Math.max(b.a.y,b.b.y)<Math.min(a.a.y,a.b.y)-EPS)continue;
      for(const p of intersection(a.a,a.b,b.a,b.b)){cuts[i].push(p);cuts[j].push(p);}
    }
    const vertices=[],adj=[],buckets=new Map(),origin=segments[0].a,t=tolerance(segments.flatMap(s=>[s.a,s.b]));
    function vertex(p){const x=Math.round((p.x-origin.x)/t),y=Math.round((p.y-origin.y)/t);
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const id of buckets.get((x+dx)+','+(y+dy))||[])if(dist(vertices[id],p)<=t)return id;
      check(vertices.length<MAX_VERTICES,'Boundary graph exceeds 4096 vertices.');const id=vertices.length;vertices.push(p);adj.push(new Set());const key=x+','+y;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(id);return id;
    }
    segments.forEach((s,i)=>{const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,l=dx*dx+dy*dy;cuts[i].sort((a,b)=>((a.x-s.a.x)*dx+(a.y-s.a.y)*dy-(b.x-s.a.x)*dx-(b.y-s.a.y)*dy)/l);
      let previous=null;for(const p of cuts[i]){const id=vertex(p);if(previous!==null&&previous!==id){adj[previous].add(id);adj[id].add(previous);}previous=id;}
    });
    // Bridges belong to no bounded face. Removing them lets a valid enclosure
    // survive dangling construction lines or a bridge between nested loops.
    const discovery=[],low=[],parent=[],bridges=[];let clock=0;
    for(let root=0;root<vertices.length;root++)if(discovery[root]===undefined){
      discovery[root]=low[root]=clock++;parent[root]=-1;const stack=[{v:root,next:0,list:[...adj[root]]}];
      while(stack.length){const frame=stack.at(-1),v=frame.v;
        if(frame.next<frame.list.length){const u=frame.list[frame.next++];if(u===parent[v])continue;
          if(discovery[u]===undefined){parent[u]=v;discovery[u]=low[u]=clock++;stack.push({v:u,next:0,list:[...adj[u]]});}
          else low[v]=Math.min(low[v],discovery[u]);
        }else{stack.pop();if(parent[v]>=0){const p=parent[v];if(low[v]>discovery[p])bridges.push([v,p]);low[p]=Math.min(low[p],low[v]);}}
      }
    }
    for(const[a,b]of bridges){adj[a].delete(b);adj[b].delete(a);}
    const ordered=adj.map((set,i)=>[...set].sort((a,b)=>Math.atan2(vertices[a].y-vertices[i].y,vertices[a].x-vertices[i].x)-Math.atan2(vertices[b].y-vertices[i].y,vertices[b].x-vertices[i].x))),seen=new Set(),faces=[];
    for(let start=0;start<vertices.length;start++)for(const next of ordered[start]){
      if(seen.has(start+','+next))continue;let a=start,b=next,ids=[],closed=false;
      for(let n=0;n<MAX_VERTICES*4;n++){
        const key=a+','+b;if(seen.has(key)){closed=a===start&&b===next;break;}seen.add(key);ids.push(a);
        const list=ordered[b],at=list.indexOf(a),c=list[(at+list.length-1)%list.length];a=b;b=c;
      }
      if(closed&&ids.length>=3){const loop=ids.map(id=>vertices[id]);if(signedArea(loop)>t*t){
        // Remove spur traversals; a face with repeated vertices is not a simple
        // usable region and must not silently become a filled polygon.
        if(new Set(ids).size===ids.length)faces.push(loop);
      }}
    }
    return faces;
  }
  function loopsFromEntities(entities){
    check(Array.isArray(entities)&&entities.length,'Select closed boundaries first.');
    const loops=[],open=[];
    for(const e of entities){
      if(e.kind==='circle')loops.push(circleLoop(e));
      else if(e.kind==='polyline'&&e.closed||e.kind==='solid')loops.push(e.points);
      else if(e.kind==='compound'&&['hatch','region'].includes(e.subtype)&&e.data?.loops)loops.push(...e.data.loops);
      else open.push(e);
    }
    if(open.length){const faces=planarFaces(open);check(faces.length,'Selected geometry does not enclose a closed boundary.');
      const all=open.flatMap(e=>segmentsOf(e));
      for(const s of all){const middle={x:(s.a.x+s.b.x)/2,y:(s.a.y+s.b.y)/2};check(faces.some(loop=>loop.some((p,i)=>onSegment(middle,p,loop[(i+1)%loop.length],tolerance(loop)))),'Selected boundaries contain open or dangling segments.');}
      loops.push(...faces);
    }
    return validateLoops(loops);
  }
  function scanIntervals(loops,y){
    const hits=[];for(const loop of loops)for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length];if((a.y>y)!==(b.y>y))hits.push(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y));}
    hits.sort((a,b)=>a-b);check(hits.length%2===0,'Boundary intersections do not form closed intervals.');const intervals=[];for(let i=0;i<hits.length;i+=2)if(hits[i+1]-hits[i]>EPS)intervals.push([hits[i],hits[i+1]]);return intervals;
  }
  function solidParts(loops,style){
    // Exact planar slab decomposition supports holes and concave boundaries.
    // Each open slab has a constant edge order; filling alternate edge pairs
    // creates non-overlapping trapezoids with no triangles crossing a hole.
    const ys=[...new Set(loops.flat().map(p=>p.y))].sort((a,b)=>a-b),parts=[];
    for(let k=1;k<ys.length;k++){
      const low=ys[k-1],high=ys[k];if(high-low<=EPS)continue;const mid=(low+high)/2,edges=[];
      for(const loop of loops)for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length];if((a.y>mid)!==(b.y>mid))edges.push({a,b,x:a.x+(mid-a.y)*(b.x-a.x)/(b.y-a.y)});}
      edges.sort((a,b)=>a.x-b.x);check(edges.length%2===0,'Invalid solid-fill boundary.');
      const at=(e,y)=>({x:e.a.x+(y-e.a.y)*(e.b.x-e.a.x)/(e.b.y-e.a.y),y});
      for(let i=0;i<edges.length;i+=2){const p=[at(edges[i],low),at(edges[i+1],low),at(edges[i+1],high),at(edges[i],high)];
        for(const indices of [[0,1,2],[0,2,3]]){const q=indices.map(j=>p[j]);if(Math.abs(signedArea(q))>EPS*EPS)parts.push({...style,kind:'solid',points:q,closed:true});}
        check(parts.length<=MAX_PARTS,'Solid fill exceeds 20,000 triangles.');
      }
    }check(parts.length,'Solid fill has no area.');return parts;
  }
  function patternParts(loops,pattern,spacing,angle,style){
    const parts=[],directions=pattern==='CROSS'?[angle,angle+90]:[pattern==='HORIZONTAL'?0:pattern==='VERTICAL'?90:angle];
    const origin=loops[0][0];
    for(const degrees of directions){const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a),local=loops.map(loop=>loop.map(p=>({x:(p.x-origin.x)*c+(p.y-origin.y)*s,y:-(p.x-origin.x)*s+(p.y-origin.y)*c}))),all=local.flat(),min=Math.min(...all.map(p=>p.y)),max=Math.max(...all.map(p=>p.y));
      const first=Math.floor(min/spacing),last=Math.ceil(max/spacing);check(last-first<=10000,'Hatch is too dense; increase its spacing.');
      const world=(x,y)=>({x:origin.x+x*c-y*s,y:origin.y+x*s+y*c});
      for(let row=first;row<=last;row++){const y=row*spacing;for(const[x1,x2]of scanIntervals(local,y)){parts.push({...style,kind:'line',points:[world(x1,y),world(x2,y)]});check(parts.length<=MAX_PARTS,'Hatch exceeds 20,000 line segments; increase spacing.');}}
    }return parts;
  }
  function geometry(rawLoops,options={},style={}){
    const loops=validateLoops(rawLoops),pattern=String(options.pattern||'ANSI31').toUpperCase(),spacing=Number(options.spacing??10),scale=Number(options.scale??1),angle=Number(options.angle??45);
    check(['SOLID','ANSI31','CROSS','HORIZONTAL','VERTICAL'].includes(pattern),'Hatch pattern must be SOLID, ANSI31, CROSS, HORIZONTAL or VERTICAL.');
    check(Number.isFinite(spacing)&&spacing>0&&spacing<=1e12&&Number.isFinite(scale)&&scale>0&&scale<=1e12,'Hatch spacing and scale must be positive finite values.');check(Number.isFinite(angle)&&Math.abs(angle)<=1e12,'Invalid hatch angle.');
    const parts=pattern==='SOLID'?solidParts(loops,style):patternParts(loops,pattern,spacing*scale,angle,style);
    check(parts.length,'No hatch lines cross this boundary; reduce the spacing or change the angle.');
    return{kind:'compound',subtype:'hatch',points:clone(loops[0]),parts,data:{loops:clone(loops),pattern,spacing,scale,angle},...style};
  }
  function styleOf(e){return{layer:e.layer,color:e.color??null,lineWidth:e.lineWidth||1};}
  function selected(doc,ids){check(Array.isArray(ids)&&ids.length,'Select boundary objects first.');return[...new Set(ids)].map(id=>{const e=doc.entities.find(e=>e.id===id);check(e,'Boundary object no longer exists.');const l=doc.layer(e.layer);check(l?.visible&&!l.locked,'Boundary objects must be on visible, unlocked layers.');return e;});}
  function targetStyle(doc,options={}){const layer=options.layer||doc.currentLayer,l=doc.layer(layer);check(l?.visible&&!l.locked,'Choose a visible, unlocked current layer.');return{layer,color:options.color??null,lineWidth:options.lineWidth??1};}
  function transaction(doc,operation){const before=doc.serialize(),w=C.Document.parse(before),result=operation(w);const after=w.serialize();if(after!==before){doc.checkpoint();doc.entities=w.entities;doc.layers=w.layers;doc.currentLayer=w.currentLayer;doc.nextId=w.nextId;if(w.resources)doc.resources=w.resources;}return result;}
  function create(doc,ids,options={}){return transaction(doc,w=>{const entities=selected(w,ids),loops=loopsFromEntities(entities),style=targetStyle(w,options);return[w.add(geometry(loops,options,style))];});}
  function edit(doc,ids,options={}){return transaction(doc,w=>{const entities=selected(w,ids);for(const e of entities){check(e.kind==='compound'&&e.subtype==='hatch','HATCHEDIT requires hatch objects.');const replacement=geometry(e.data.loops,{...e.data,...options},styleOf(e));replacement.id=e.id;w.entities[w.entities.findIndex(x=>x.id===e.id)]=replacement;}return entities.map(e=>e.id);});}
  function region(doc,ids,options={}){return transaction(doc,w=>{const loops=loopsFromEntities(selected(w,ids)),style=targetStyle(w,options),parts=loops.map(loop=>({...style,kind:'polyline',points:clone(loop),closed:true})),id=w.add({kind:'compound',subtype:'region',points:clone(loops[0]),parts,data:{loops:clone(loops)},...style});if(options.replace)w.erase(ids);return[id];});}
  function boundary(doc,p,options={}){point(p);return transaction(doc,w=>{
    const requested=options.ids?.length?new Set(options.ids):null,entities=w.entities.filter(e=>w.layer(e.layer)?.visible&&(!requested||requested.has(e.id))),faces=planarFaces(entities),candidates=faces.filter(loop=>contains(loop,p,false)).sort((a,b)=>Math.abs(signedArea(a))-Math.abs(signedArea(b)));
    check(candidates.length,'No closed boundary contains the picked point.');const outer=candidates[0],loops=[outer,...faces.filter(loop=>loop!==outer&&Math.abs(signedArea(loop))<Math.abs(signedArea(outer))-EPS&&loop.every(q=>contains(outer,q,false)))];
    const valid=validateLoops(loops),style=targetStyle(w,options);
    if(options.hatch)return[w.add(geometry(valid,options,style))];
    if(options.region)return[w.add({kind:'compound',subtype:'region',points:clone(valid[0]),parts:valid.map(loop=>({...style,kind:'polyline',points:clone(loop),closed:true})),data:{loops:clone(valid)},...style})];
    return valid.map(loop=>w.add({...style,kind:'polyline',points:clone(loop),closed:true}));
  });}
  function area(entityOrLoops){const loops=validateLoops(Array.isArray(entityOrLoops)?entityOrLoops:entityOrLoops.data?.loops||loopsFromEntities([entityOrLoops]));let total=0,perimeter=0;
    for(let i=0;i<loops.length;i++){const depth=loops.filter((loop,j)=>j!==i&&Math.abs(signedArea(loop))>Math.abs(signedArea(loops[i]))&&contains(loop,loops[i][0],false)).length;total+=Math.abs(signedArea(loops[i]))*(depth%2?-1:1);for(let j=0;j<loops[i].length;j++)perimeter+=dist(loops[i][j],loops[i][(j+1)%loops[i].length]);}
    return{area:total,perimeter};
  }
  return Object.freeze({create,edit,boundary,region,geometry,loopsFromEntities,planarFaces,inside,contains,area});
});
