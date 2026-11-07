/* Editable mixed LINE/ARC polylines. Centerlines are analytic; width ribbons
 * are filled CAD solids (arc ribbon edges are tessellated, not NURBS). */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'),require('./precision.js'));else root.RasmCurvePolyline=factory(root.RasmCore,root.RasmPrecision);})(typeof globalThis!=='undefined'?globalThis:this,function(C,P){
'use strict';
const TAU=2*Math.PI,EPS=1e-9,MAX_SEGMENTS=1024,clone=x=>JSON.parse(JSON.stringify(x)),mod=a=>(a%TAU+TAU)%TAU;
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y}),sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}),mul=(a,s)=>({x:a.x*s,y:a.y*s}),dot=(a,b)=>a.x*b.x+a.y*b.y,dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function check(ok,message){if(!ok)throw Error(message);}
function finite(v,label){check(typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e12,'Invalid '+label);return v;}
function point(p){check(p&&typeof p==='object','Expected a point');return{x:finite(p.x,'X'),y:finite(p.y,'Y')};}
function width(w=0){if(typeof w==='number')w={start:w,end:w};check(w&&typeof w==='object','Invalid segment width');const a=finite(w.start??0,'start width'),b=finite(w.end??w.start??0,'end width');check(a>=0&&b>=0,'Segment widths cannot be negative');return{start:a,end:b};}
function geometry(a,b,bulge){
 const chord=dist(a,b);check(chord>EPS,'Polyline contains a zero-length segment');
 if(Math.abs(bulge)<1e-12){const u=mul(sub(b,a),1/chord);return{kind:'line',points:[a,b],length:chord,at:t=>add(a,mul(sub(b,a),t)),normal:()=>({x:-u.y,y:u.x}),bulge:0};}
 const d=sub(b,a),k=(1-bulge*bulge)/(4*bulge),center={x:a.x+d.x/2-d.y*k,y:a.y+d.y/2+d.x*k},radius=dist(center,a),angle=Math.atan2(a.y-center.y,a.x-center.x),sweep=4*Math.atan(bulge);
 point(center);finite(radius,'arc radius');check(radius>EPS,'Invalid arc radius');
 const endpoint=Math.atan2(b.y-center.y,b.x-center.x),entity={kind:'arc',points:[center],radius,startAngle:bulge>0?angle:endpoint,endAngle:bulge>0?endpoint:angle};
 return{...entity,length:Math.abs(sweep)*radius,bulge,sweep,angle,center,at:t=>t===0?{...a}:t===1?{...b}:{x:center.x+radius*Math.cos(angle+sweep*t),y:center.y+radius*Math.sin(angle+sweep*t)},normal:t=>{const x=angle+sweep*t,s=bulge>0?-1:1;return{x:s*Math.cos(x),y:s*Math.sin(x)};}};
}
function arcBulge(a,through,b){a=point(a);through=point(through);b=point(b);const {center}=P.circleThrough3Points(a,through,b),s=Math.atan2(a.y-center.y,a.x-center.x),m=mod(Math.atan2(through.y-center.y,through.x-center.x)-s),e=mod(Math.atan2(b.y-center.y,b.x-center.x)-s);check(e>1e-12&&TAU-e>1e-12,'Arc endpoints must be different');const sweep=m<=e+1e-10?e:e-TAU;return Math.tan(sweep/4);}
function create(vertices,options={}){
 check(Array.isArray(vertices)&&vertices.length>=2&&vertices.length<=MAX_SEGMENTS,'Curved polyline requires 2..1024 vertices');vertices=vertices.map(point);const closed=!!options.closed,count=closed?vertices.length:vertices.length-1;check(!closed||vertices.length>=3,'Closed polyline requires at least three vertices');
 const bulges=Array.from({length:count},(_,i)=>finite(options.bulges?.[i]??0,'bulge')),widths=Array.from({length:count},(_,i)=>width(options.widths?.[i]??options.width??0));
 const common={layer:options.layer||'0',color:options.color??null,lineWidth:options.lineWidth??1},parts=[],ribbons=[];
 for(let i=0;i<count;i++){
  const g=geometry(vertices[i],vertices[(i+1)%vertices.length],bulges[i]),w=widths[i],base={kind:g.kind,points:g.points.map(point),...common};if(g.kind==='arc')Object.assign(base,{radius:g.radius,startAngle:g.startAngle,endAngle:g.endAngle});parts.push(base);
  if(w.start||w.end){check(g.kind!=='arc'||Math.max(w.start,w.end)<=2*g.radius,'Arc width exceeds its diameter; split or reduce the width');const samples=g.kind==='arc'?Math.max(2,Math.min(128,Math.ceil(Math.abs(g.sweep)/(Math.PI/48)))):1;for(let j=0;j<samples;j++){
   const t0=j/samples,t1=(j+1)/samples,a=g.at(t0),b=g.at(t1),n0=g.normal(t0),n1=g.normal(t1),r0=(w.start+(w.end-w.start)*t0)/2,r1=(w.start+(w.end-w.start)*t1)/2;
   ribbons.push({kind:'solid',points:[add(a,mul(n0,r0)),add(b,mul(n1,r1)),sub(b,mul(n1,r1)),sub(a,mul(n0,r0))],...common});
  }}
 }
 check(parts.length+ribbons.length<=50000,'Polyline width ribbon exceeds the part budget; split the path');return{kind:'compound',subtype:'polyline',points:vertices,parts:[...parts,...ribbons],closed,...common,data:{curveVersion:1,closed,localVertices:clone(vertices),bulges,widths,centerlineCount:count,matrix:[1,0,0,1,0,0]}};
}
function isCurve(e){return e?.kind==='compound'&&e.subtype==='polyline'&&e.data?.curveVersion===1;}
function read(e){
 check(isCurve(e),'Select a native curved polyline');const d=e.data,m=d.matrix||[1,0,0,1,0,0],scale=Math.hypot(m[0],m[1]),det=m[0]*m[3]-m[1]*m[2];check(scale>EPS&&Math.abs(Math.hypot(m[2],m[3])-scale)<=scale*1e-8&&Math.abs(m[0]*m[2]+m[1]*m[3])<=scale*scale*1e-8,'Curved polyline metadata supports only uniform affine transforms');
 return{vertices:d.localVertices.map(p=>({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]})),bulges:d.bulges.map(b=>b*(det<0?-1:1)),widths:d.widths.map(w=>({start:w.start*scale,end:w.end*scale})),closed:!!d.closed,layer:e.layer,color:e.color,lineWidth:e.lineWidth};
}
function centerline(e){check(isCurve(e),'Select a native curved polyline');return e.parts.slice(0,e.data.centerlineCount);}
function path(e){
 const d=read(e),segments=[],breaks=[0];let length=0;for(let i=0;i<d.bulges.length;i++){const g=geometry(d.vertices[i],d.vertices[(i+1)%d.vertices.length],d.bulges[i]);segments.push({...g,from:d.vertices[i],to:d.vertices[(i+1)%d.vertices.length],start:length,width:d.widths[i]});length+=g.length;breaks.push(length);}
 function locate(s){s=d.closed?modLength(s,length):Math.max(0,Math.min(length,s));const g=segments.find(g=>s<=g.start+g.length+EPS)||segments.at(-1);return{g,t:Math.max(0,Math.min(1,(s-g.start)/g.length))};}
 const at=s=>{if(s===length)return d.closed?{...d.vertices[0]}:{...d.vertices.at(-1)};const{g,t}=locate(s);return g.at(t);};
 const nearest=p=>{let best=Infinity,value=0;for(const g of segments){let t;if(g.kind==='line'){const v=sub(g.to,g.from);t=Math.max(0,Math.min(1,dot(sub(p,g.from),v)/(g.length*g.length)));}else{const delta=g.sweep>0?mod(Math.atan2(p.y-g.center.y,p.x-g.center.x)-g.angle):mod(g.angle-Math.atan2(p.y-g.center.y,p.x-g.center.x));t=delta<=Math.abs(g.sweep)+1e-10?Math.min(1,delta/Math.abs(g.sweep)):dist(p,g.from)<=dist(p,g.to)?0:1;}const q=g.at(t),distance=dist(p,q);if(distance<best){best=distance;value=g.start+t*g.length;}}return value;};
 return{length,closed:d.closed,segments,breaks,at,nearest,kind:'curvePolyline'};
}
function modLength(a,length){return(a%length+length)%length;}
function slice(e,from,to){
 const d=read(e),p=path(e);check(Number.isFinite(from)&&Number.isFinite(to)&&to-from>EPS&&to-from<=p.length+EPS,'Invalid curved polyline range');check(d.closed||from>=-EPS&&to<=p.length+EPS,'Open polyline range is outside its length');const vertices=[],bulges=[],widths=[];
 const base=d.closed?Math.floor(from/p.length)*p.length:0;
 for(let turn=0;turn<(d.closed?2:1);turn++)for(const g of p.segments){const start=g.start+base+turn*p.length,end=start+g.length,lo=Math.max(start,from),hi=Math.min(end,to);if(hi-lo<=EPS)continue;const a=(lo-start)/g.length,b=(hi-start)/g.length;if(!vertices.length)vertices.push(g.at(a));vertices.push(g.at(b));bulges.push(g.kind==='arc'?Math.tan(g.sweep*(b-a)/4):0);widths.push({start:g.width.start+(g.width.end-g.width.start)*a,end:g.width.start+(g.width.end-g.width.start)*b});}
 return create(vertices,{...d,closed:false,bulges,widths});
}
function fromEntity(e){if(isCurve(e))return clone(e);check(e?.kind==='line'||e?.kind==='polyline','Convert a LINE or straight PLINE');return create(e.points,{closed:!!e.closed,layer:e.layer,color:e.color,lineWidth:e.lineWidth});}
function edit(doc,id,action,value){
 const original=doc.serialize(),w=C.Document.parse(original),e=w.entities.find(e=>e.id===id);check(e,'Polyline no longer exists');const layer=w.layer(e.layer);check(layer?.visible&&!layer.locked,'Polyline is hidden or locked');const d=read(isCurve(e)?e:fromEntity(e));action=String(action).toUpperCase();
 if(action==='WIDTH')d.widths=d.bulges.map(()=>width(value));
 else if(action==='OPEN'){d.closed=false;d.bulges=d.bulges.slice(0,d.vertices.length-1);d.widths=d.widths.slice(0,d.vertices.length-1);}
 else if(action==='CLOSE'){check(d.vertices.length>=3,'Closing requires at least three vertices');d.closed=true;if(d.bulges.length<d.vertices.length){d.bulges.push(0);d.widths.push(width(d.widths.at(-1)?.end||0));}}
 else if(action==='REVERSE'){const n=d.vertices.length,oldB=d.bulges,oldW=d.widths;d.vertices.reverse();d.bulges=oldB.map((_,i)=>(-oldB[d.closed?(n-2-i+n)%n:oldB.length-1-i]||0));d.widths=oldW.map((_,i)=>{const x=oldW[d.closed?(n-2-i+n)%n:oldW.length-1-i];return{start:x.end,end:x.start};});}
 else if(action==='VERTEX'){check(Number.isInteger(value?.index)&&value.index>=0&&value.index<d.vertices.length,'Invalid vertex index');d.vertices[value.index]=point(value.point);}
 else if(action==='SEGMENT'||action==='SEGWIDTH'){const i=value?.index;check(Number.isInteger(i)&&i>=0&&i<d.bulges.length,'Invalid segment index');if(action==='SEGWIDTH')d.widths[i]=width(value);else d.bulges[i]=value.through?arcBulge(d.vertices[i],value.through,d.vertices[(i+1)%d.vertices.length]):finite(value.bulge??0,'bulge');}
 else if(action!=='CONVERT')throw Error('Curved PEDIT supports CONVERT, WIDTH, OPEN, CLOSE, REVERSE, VERTEX, SEGMENT, SEGWIDTH');
 const out=create(d.vertices,d);out.id=e.id;w.entities[w.entities.findIndex(x=>x.id===id)]=out;const after=w.serialize();if(after!==original){doc.checkpoint();doc.entities=w.entities;doc.nextId=w.nextId;}return[id];
}
function area(e){const d=read(e);check(d.closed,'Area requires a closed polyline');const p=path(e),origin=d.vertices[0];let sum=0;for(const g of p.segments){const a=sub(g.from,origin),b=sub(g.to,origin);sum+=a.x*b.y-a.y*b.x;if(g.kind==='arc')sum+=g.radius*g.radius*(g.sweep-Math.sin(g.sweep));}return{area:Math.abs(sum)/2,signedArea:sum/2,perimeter:p.length};}
return Object.freeze({create,isCurve,read,centerline,arcBulge,fromEntity,edit,path,slice,area});
});
