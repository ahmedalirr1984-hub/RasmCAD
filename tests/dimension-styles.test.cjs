'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../src/core');
const out=path.join(__dirname,'../build/dimension-artifacts');fs.mkdirSync(out,{recursive:true});
let count=0;
const near=(a,b)=>assert(Math.abs(a-b)<1e-8*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const pt=(p,x,y)=>{near(p.x,x);near(p.y,y);};
const base=(extra={})=>({kind:'dimension',points:[{x:0,y:0},{x:100,y:0},{x:10,y:20}],textHeight:2,...extra});
function add(raw){const d=new C.Document();d.add(raw);return [d,d.entities[0]];}
function test(name,fn){fn();count++;console.log('PASS '+name);}
function corners(label){const u={x:Math.cos(label.angle),y:Math.sin(label.angle)},n={x:-u.y,y:u.x};return [[0,0],[label.width,0],[label.width,label.height],[0,label.height]].map(([x,y])=>({x:label.point.x+u.x*x+n.x*y,y:label.point.y+u.y*x+n.y*y}));}

test('dimension styling persists all explicit fields and Arabic text through native reopen',()=>{
 const [d,e]=add(base({dimensionScale:2.5,arrowSize:1.7,extensionOffset:0,extensionExtend:3,textGap:.8,precision:4,prefix:'تقريبًا ',suffix:' mm',text:'<>',textColor:'#aa2255',dimensionColor:'#00bb77',arrowStyle:'tick'}));
 const reopened=C.Document.parse(d.serialize());assert.deepEqual(reopened.entities[0],e);
 for(const field of ['dimensionScale','arrowSize','extensionOffset','extensionExtend','textGap','precision','prefix','suffix','textColor','dimensionColor','arrowStyle'])assert.equal(reopened.entities[0][field],e[field]);
 fs.writeFileSync(path.join(out,'styled-dimension.rasm.json'),d.serialize());
});
test('legacy dimensions derive proportionate visual defaults from text height',()=>{
 const [,e]=add(base({textHeight:140}));near(e.arrowSize,84);near(e.extensionOffset,21);near(e.extensionExtend,35);near(e.textGap,49);
 const sample=C.sampleDocument(),dim=sample.entities.find(e=>e.kind==='dimension');near(dim.arrowSize,dim.textHeight*.6);
 const raw=JSON.parse(sample.serialize());for(const e of raw.entities)if(e.kind==='dimension')for(const f of ['arrowSize','extensionOffset','extensionExtend','textGap','dimensionScale','precision','prefix','suffix','textColor','dimensionColor','arrowStyle'])delete e[f];
 const loaded=C.Document.parse(JSON.stringify(raw)),legacy=loaded.entities.find(e=>e.kind==='dimension');near(legacy.arrowSize,84);assert.equal(C.annotationGeometry(legacy).fills.length,2);
});
test('dimension-only properties are stripped from ordinary primitives',()=>{
 const [,e]=add({kind:'line',points:[{x:0,y:0},{x:1,y:1}],dimensionStyle:'irrelevant',dimensionScale:-1,arrowSize:-2,textColor:'invalid'});
 assert(!Object.hasOwn(e,'dimensionStyle'));assert(!Object.hasOwn(e,'arrowSize'));assert(!Object.hasOwn(e,'dimensionScale'));assert(!Object.hasOwn(e,'textColor'));
});
test('linear dimension has a real text gap, extension offset and extension overrun',()=>{
 const [,e]=add(base({arrowSize:1,extensionOffset:2,extensionExtend:3,textGap:1})),g=C.annotationGeometry(e);
 const extensions=g.segments.filter(s=>s.role==='extension');assert.equal(extensions.length,2);pt(extensions[0].a,0,2);pt(extensions[0].b,0,23);
 const dim=g.segments.filter(s=>s.role==='dimension');assert.equal(dim.length,2);assert(dim[0].b.x<50);assert(dim[1].a.x>50);
 const label=g.labels[0];pt(label.center,50,20);assert.equal(label.angle,0);near(label.width,Array.from(label.text).length*label.height*.65);
});
test('closed, open and tick arrows generate distinct actual geometry',()=>{
 for(const [arrowStyle,fillCount,strokeCount]of[['closed',2,6],['open',0,4],['tick',0,2]]){
  const [,e]=add(base({arrowStyle})),g=C.annotationGeometry(e);assert.equal(g.fills.length,fillCount);assert.equal(g.segments.filter(s=>s.role==='arrow').length,strokeCount);
  for(const fill of g.fills){assert.equal(fill.points.length,3);const center={x:fill.points.reduce((n,p)=>n+p.x,0)/3,y:fill.points.reduce((n,p)=>n+p.y,0)/3};assert(C.hitTest(e,center,0),'filled arrow interior is selectable');}
 }
});
test('dimension scale changes visuals while preserving measurements and source points',()=>{
 const [,a]=add(base({dimensionScale:1})),[,b]=add(base({dimensionScale:3})),ga=C.annotationGeometry(a),gb=C.annotationGeometry(b);near(ga.measurement,gb.measurement);assert.deepEqual(a.points,b.points);near(gb.labels[0].height,ga.labels[0].height*3);
 near(C.distance(gb.fills[0].points[0],gb.fills[0].points[1]),C.distance(ga.fills[0].points[0],ga.fills[0].points[1])*3);
 near(gb.segments.find(s=>s.role==='extension').a.y,ga.segments.find(s=>s.role==='extension').a.y*3);
});
test('reversed and vertical dimensions have readable centered text orientation',()=>{
 for(const raw of [base({points:[{x:100,y:0},{x:0,y:0},{x:0,y:20}]}),base({dimensionStyle:'vertical',points:[{x:0,y:100},{x:0,y:0},{x:20,y:0}]}),base({points:[{x:100,y:-100},{x:0,y:0},{x:20,y:20}]})]){
  const [,e]=add(raw),l=C.annotationGeometry(e).labels[0];assert(l.angle>=-Math.PI/2-1e-12&&l.angle<=Math.PI/2+1e-12);
  const boxes=corners(l),center={x:(boxes[0].x+boxes[2].x)/2,y:(boxes[0].y+boxes[2].y)/2};pt(center,l.center.x,l.center.y);
 }
});
test('precision, prefix, suffix and <> substitution preserve numeric meaning',()=>{
 const [,e]=add(base({precision:3,prefix:'~',suffix:' mm',text:'length <> / <>'}));assert.equal(C.annotationGeometry(e).labels[0].text,'~length 100.000 / 100.000 mm');
 const [,literal]=add(base({text:'TYP.',prefix:'[',suffix:']'}));assert.equal(C.annotationGeometry(literal).labels[0].text,'[TYP.]');
 const [,r]=add(base({dimensionStyle:'radius',points:[{x:0,y:0},{x:3,y:4},{x:20,y:20}],text:'<>',precision:1}));assert.equal(C.annotationGeometry(r).labels[0].text,'R 5.0');
});
test('all six annotation modes retain measurements, colors and drawable geometry',()=>{
 const d=new C.Document();for(const [style,points,expected]of[['aligned',[[0,0],[3,4],[10,10]],5],['horizontal',[[0,0],[3,4],[10,10]],3],['vertical',[[0,0],[3,4],[10,10]],4],['angular',[[10,0],[0,0],[0,10],[20,20]],90],['radius',[[0,0],[3,4],[20,20]],5],['diameter',[[0,0],[3,4],[20,20]],10]]){
  const id=d.add(base({points:points.map(([x,y])=>({x,y})),dimensionStyle:style,textColor:'#ff4488',dimensionColor:'#22aaff',textHeight:.5,arrowSize:.2,textGap:.15,extensionOffset:.1,extensionExtend:.2})),e=d.entities.find(e=>e.id===id),g=C.annotationGeometry(e);near(g.measurement,expected);assert(g.segments.length+g.arcs.length>0);assert(g.fills.length>0);assert(g.labels.every(l=>l.color==='#ff4488'));assert(g.segments.every(s=>s.color==='#22aaff'));assert(g.arcs.every(a=>a.color==='#22aaff'));assert(g.fills.every(f=>f.color==='#22aaff'));
 }
 fs.writeFileSync(path.join(out,'all-styled-dimensions.dxf'),C.exportDxf(d));
});
test('annotation bounds and hit testing cover complete long rotated labels',()=>{
 const [,e]=add(base({points:[{x:100,y:0},{x:0,y:100},{x:100,y:100}],text:'A long technical dimension label',textHeight:3}));
 const g=C.annotationGeometry(e),b=C.entityBounds(e),l=g.labels[0];for(const p of corners(l)){assert(p.x>=b.min.x-1e-8&&p.x<=b.max.x+1e-8&&p.y>=b.min.y-1e-8&&p.y<=b.max.y+1e-8);assert(C.hitTest(e,p,1e-7));}
 const far=corners(l)[2];assert(C.hitTest(e,{x:(far.x+l.center.x)/2,y:(far.y+l.center.y)/2},0));
});
test('invalid styles and zero measurements fail atomically without history changes',()=>{
 const d=new C.Document();const original=d.serialize();for(const invalid of [{dimensionScale:0},{arrowSize:0},{extensionOffset:-1},{extensionExtend:Infinity},{textGap:-1},{precision:1.5},{precision:9},{arrowStyle:'random'},{textColor:'red'},{prefix:'x'.repeat(129)},{points:[{x:0,y:0},{x:0,y:0},{x:10,y:10}]},{dimensionStyle:'horizontal',points:[{x:0,y:0},{x:0,y:10},{x:10,y:10}]}]){assert.throws(()=>d.add(base(invalid)));assert.equal(d.serialize(),original);assert(!d.canUndo());}
});
test('geometric scaling scales persisted visual sizes once and remains reversible',()=>{
 const [d,e]=add(base({dimensionScale:2,arrowSize:1,extensionOffset:2,extensionExtend:3,textGap:4})),before=d.serialize();d.checkpoint();d.transform([e.id],{scale:2});const next=d.entities[0];near(next.textHeight,4);near(next.dimensionScale,2);near(next.arrowSize,2);near(next.extensionOffset,4);near(next.extensionExtend,6);near(next.textGap,8);near(C.annotationGeometry(next).measurement,200);assert(d.undo());assert.equal(d.serialize(),before);
});
test('DXF exports filled arrow SOLIDs, split lines and separate text/line colors',()=>{
 const [d]=add(base({textColor:'#ff4488',dimensionColor:'#22aaff',arrowStyle:'closed'})),dxf=C.exportDxf(d);assert.equal((dxf.match(/\nSOLID\n/g)||[]).length,2);assert(dxf.includes('\n420\n'+parseInt('ff4488',16)+'\n'));assert(dxf.includes('\n420\n'+parseInt('22aaff',16)+'\n'));fs.writeFileSync(path.join(out,'colored-closed-arrows.dxf'),dxf);
});
test('overflow labels above a short dimension never erase its entire dimension line',()=>{
 const [,e]=add(base({text:'A VERY LONG DIMENSION LABEL',textHeight:20,textGap:5})),g=C.annotationGeometry(e);
 const line=g.segments.find(s=>s.role==='dimension');assert(line,'dimension line stays visible');pt(line.a,0,20);pt(line.b,100,20);assert(g.labels[0].center.y>20);
});
console.log('RESULT PASS: '+count+' dimension style checks');
