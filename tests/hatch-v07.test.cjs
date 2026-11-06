'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../src/core'),H=require('../src/hatch'),DxfParser=require('../vendor/dxf-parser/dist/dxf-parser.js');
const output=path.resolve(__dirname,'../build/hatch-v07');fs.mkdirSync(output,{recursive:true});
const results=[];let assertions=0;
function check(name,fn){fn();results.push({name,status:'PASS'});console.log('PASS '+name);}
function equal(a,b,message){assertions++;assert.deepEqual(a,b,message);}
function near(a,b,t=1e-7){assertions++;assert(Math.abs(a-b)<=t,`${a} differs from ${b}`);}
function ok(a,message){assertions++;assert(a,message);}
const p=(x,y)=>({x,y}),rect=(x=0,y=0,w=20,h=20)=>[p(x,y),p(x+w,y),p(x+w,y+h),p(x,y+h)];
function addLoop(d,points){return d.add({kind:'polyline',points,closed:true});}
function donut(){const d=new C.Document(),outer=addLoop(d,rect()),hole=addLoop(d,rect(5,5,10,10));return{d,outer,hole};}
function line(d,a,b){return d.add({kind:'line',points:[a,b]});}
function triangleArea(points){return Math.abs((points[1].x-points[0].x)*(points[2].y-points[0].y)-(points[1].y-points[0].y)*(points[2].x-points[0].x))/2;}
function state(d){return d.serialize();}
check('SOLID hatch retains an actual hole without crossing fill triangles',()=>{
 const{d,outer,hole}=donut(),ids=H.create(d,[outer,hole],{pattern:'SOLID'}),e=d.entities.find(e=>e.id===ids[0]);
 equal(e.kind,'compound');equal(e.subtype,'hatch');equal(e.data.loops.length,2);near(H.area(e).area,300);near(H.area(e).perimeter,120);
 near(e.parts.reduce((n,t)=>n+triangleArea(t.points),0),300);
 for(const t of e.parts){equal(t.kind,'solid');const c=p(t.points.reduce((n,p)=>n+p.x,0)/3,t.points.reduce((n,p)=>n+p.y,0)/3);ok(!H.contains(rect(5,5,10,10),c,false),'fill must not enter the hole');}
 equal(d.entities.length,3,'source boundaries stay intact');ok(d.canUndo());d.undo();equal(d.entities.length,2);d.redo();equal(d.entities.length,3);
});
check('concave and disjoint SOLID areas are exact',()=>{
 const loops=[[p(0,0),p(10,0),p(10,4),p(4,4),p(4,10),p(0,10)],rect(20,0,5,5)],g=H.geometry(loops,{pattern:'SOLID'});
 near(g.parts.reduce((n,t)=>n+triangleArea(t.points),0),89);near(H.area(loops).area,89);
});
check('nested islands alternate fill and preserve all boundary loops',()=>{
 const loops=[rect(0,0,30,30),rect(5,5,20,20),rect(10,10,10,10)],g=H.geometry(loops,{pattern:'SOLID'});
 near(H.area(g).area,600);near(g.parts.reduce((n,t)=>n+triangleArea(t.points),0),600);
 ok(H.inside(loops,p(2,2)));ok(!H.inside(loops,p(7,7)));ok(H.inside(loops,p(15,15)));
});
check('ANSI31 and CROSS hatch segments are clipped around holes',()=>{
 for(const pattern of ['ANSI31','CROSS','HORIZONTAL','VERTICAL']){
  const g=H.geometry([rect(),rect(5,5,10,10)],{pattern,spacing:2,angle:31});ok(g.parts.length>0);
  for(const e of g.parts){equal(e.kind,'line');for(const t of [.25,.5,.75]){const q=p(e.points[0].x*(1-t)+e.points[1].x*t,e.points[0].y*(1-t)+e.points[1].y*t);ok(!H.contains(rect(5,5,10,10),q,false),'pattern must not cross hole');ok(H.contains(rect(),q,true),'pattern stays in outer boundary');}}
 }
});
check('HATCHEDIT regenerates editable geometry and preserves identity and style',()=>{
 const{d,outer,hole}=donut();const[id]=H.create(d,[outer,hole],{pattern:'ANSI31',spacing:3,color:'#ff0000'}),before=state(d);
 H.edit(d,[id],{pattern:'SOLID'});const e=d.entities.find(e=>e.id===id);equal(e.color,'#ff0000');equal(e.data.pattern,'SOLID');ok(e.parts.every(p=>p.kind==='solid'));d.undo();equal(state(d),before);
});
check('native save/reopen, scale/rotate/translate and HATCHEDIT retain holes and area',()=>{
 const{d,outer,hole}=donut(),[id]=H.create(d,[outer,hole],{pattern:'ANSI31',spacing:2,angle:15});
 const reopened=C.Document.parse(d.serialize());reopened.transform([id],{translation:p(100,200),rotation:Math.PI/2,scale:2,pivot:p(0,0)});
 let e=reopened.entities.find(e=>e.id===id);near(H.area(e).area,1200);near(e.data.spacing,4);near(e.data.angle,105);
 H.edit(reopened,[id],{pattern:'SOLID'});e=reopened.entities.find(e=>e.id===id);near(e.parts.reduce((n,t)=>n+triangleArea(t.points),0),1200);C.Document.parse(reopened.serialize());
 fs.writeFileSync(path.join(output,'transformed-hatch.rasm.json'),reopened.serialize());
});
check('DXF export includes real filled SOLID entities rather than a screenshot',()=>{
 const{d,outer,hole}=donut();H.create(d,[outer,hole],{pattern:'SOLID'});const text=C.exportDxf(d),data=new DxfParser().parseSync(text);
 const imported=require('../src/io').importDxf(text).document;ok(imported.entities.some(e=>e.kind==='solid'));const solids=data.entities.filter(e=>e.type==='SOLID');ok(solids.length>0);equal(solids.length,d.entities.at(-1).parts.length);fs.writeFileSync(path.join(output,'solid-hole.dxf'),text);
});
check('BOUNDARY assembles four independent lines and splits intersections',()=>{
 const d=new C.Document();line(d,p(0,0),p(20,0));line(d,p(20,0),p(20,20));line(d,p(20,20),p(0,20));line(d,p(0,20),p(0,0));line(d,p(10,-5),p(10,25));
 const ids=H.boundary(d,p(3,3)),e=d.entities.find(e=>e.id===ids[0]);equal(e.kind,'polyline');ok(e.closed);near(H.area(H.loopsFromEntities([e])).area,200);ok(e.points.every(p=>p.x<=10+1e-7));
});
check('BOUNDARY ignores dangling construction lines without inventing fill',()=>{
 const d=new C.Document();addLoop(d,rect());line(d,p(0,10),p(8,10));
 const ids=H.boundary(d,p(15,15));near(H.area(H.loopsFromEntities(d.entities.filter(e=>ids.includes(e.id)))).area,400);
});
check('picked hatch boundary discovers nested holes and isolates a picked island',()=>{
 const{d}=donut();let[id]=H.boundary(d,p(2,2),{hatch:true,pattern:'SOLID'});near(H.area(d.entities.find(e=>e.id===id)).area,300);
 const second=donut().d;[id]=H.boundary(second,p(10,10),{hatch:true,pattern:'SOLID'});near(H.area(second.entities.find(e=>e.id===id)).area,100);
});
check('REGION retains closed loops, measurement and optional source replacement',()=>{
 const{d,outer,hole}=donut(),[id]=H.region(d,[outer,hole],{replace:true}),e=d.entities.find(e=>e.id===id);equal(d.entities.length,1);equal(e.subtype,'region');near(H.area(e).area,300);equal(C.Document.parse(d.serialize()).entities[0].data.loops,e.data.loops);
});
check('circle boundaries are explicitly sampled closed geometry',()=>{
 const d=new C.Document(),circle=d.add({kind:'circle',points:[p(0,0)],radius:10}),[id]=H.create(d,[circle],{pattern:'SOLID'}),e=d.entities.find(e=>e.id===id);ok(e.points.length>=32);near(H.area(e).area,Math.PI*100,1);ok(e.parts.length>10);
});
check('large survey-origin solids retain area without global-coordinate cancellation',()=>{
 const offset=8e11,g=H.geometry([rect(offset,offset,20,20),rect(offset+5,offset+5,10,10)],{pattern:'SOLID'});near(H.area(g).area,300);near(g.parts.reduce((n,t)=>n+triangleArea(t.points),0),300);
});
check('invalid, open, crossing and dense hatches preserve drawing and history',()=>{
 for(const kind of ['open','self','crossing','dense','locked']){
  const d=new C.Document();let ids;
  if(kind==='open')ids=[line(d,p(0,0),p(10,0))];
  else if(kind==='self')ids=[addLoop(d,[p(0,0),p(10,10),p(0,10),p(10,0)])];
  else if(kind==='crossing')ids=[addLoop(d,rect()),addLoop(d,rect(10,10,20,20))];
  else ids=[addLoop(d,rect())];
  if(kind==='locked')d.layer('0').locked=true;
  const before=state(d),undo=d.canUndo();assert.throws(()=>H.create(d,ids,{pattern:'ANSI31',spacing:kind==='dense'?1e-8:2}));equal(state(d),before);equal(d.canUndo(),undo);
 }
});
check('HATCHEDIT rejects nonhatches and unsupported patterns transactionally',()=>{
 const d=new C.Document(),id=addLoop(d,rect()),before=state(d);assert.throws(()=>H.edit(d,[id],{pattern:'SOLID'}));equal(state(d),before);assert.throws(()=>H.create(d,[id],{pattern:'UNKNOWN'}));equal(state(d),before);
});
const summary={groups:results.length,assertions,passed:results.length,failed:0,results,limits:'Closed 2D polygonal/sampled boundaries; five hatch patterns; planar REGION is not an ACIS solid or boolean engine. Geometry/complexity limits reject unsupported input explicitly.'};
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(summary,null,2)+'\n');console.log(`PASS ${results.length} hatch/region groups (${assertions} assertions)`);
