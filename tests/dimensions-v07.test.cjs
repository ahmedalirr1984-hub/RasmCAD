'use strict';
// Semantic regressions for persistent named styles, real datum measurements,
// and editable leaders. Tests intentionally compare measurements/geometry,
// persisted resources and actual DXF output rather than only command names.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../src/core.js'),D=require('../src/dimensions.js');
const output=path.resolve(__dirname,'../build/dimensions-v07');fs.mkdirSync(output,{recursive:true});
const p=(x,y)=>({x,y}),near=(a,b)=>assert.ok(Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(b)),`${a} != ${b}`);
let checks=0;const results=[];
function test(name,fn){fn();checks++;results.push({name,status:'PASS'});console.log('PASS '+name);}
function drawing(){return new C.Document();}
function dimension(doc,style='horizontal',points=[p(0,0),p(100,0),p(0,20)],extra={}){const id=doc.add({kind:'dimension',dimensionStyle:style,points,textHeight:2,arrowSize:1,...extra});return{id,e:doc.entities.find(e=>e.id===id)};}
function at(doc,id){return doc.entities.find(e=>e.id===id);}
function failUnchanged(doc,fn,pattern){const before=doc.serialize(),undo=doc.canUndo(),redo=doc.canRedo();assert.throws(fn,pattern);assert.equal(doc.serialize(),before);assert.equal(doc.canUndo(),undo);assert.equal(doc.canRedo(),redo);}

test('reading current style and listing styles never changes drawing/history',()=>{
 const doc=drawing(),before=doc.serialize();assert.equal(D.currentStyle(doc).textHeight,2.5);assert.deepEqual(D.style(doc,'LIST'),[]);assert.equal(doc.serialize(),before);assert(!doc.canUndo());
});
test('named style saves all rendered settings and persists current selection',()=>{
 const doc=drawing(),saved=D.style(doc,'SAVE','Office 1-50',{style:{textHeight:3,overallScale:2,arrowSize:1.5,extensionOffset:1,extensionExtend:2,textGap:.8,precision:3,prefix:'~',suffix:' mm',textColor:'#00aa22',dimensionColor:'#aa2200',arrowStyle:'tick'},setCurrent:true});
 assert.equal(saved.name,'Office 1-50');const profile=D.currentStyle(doc);assert.equal(profile.styleName,'Office 1-50');assert.equal(profile.dimensionScale,2);assert.equal(profile.arrowStyle,'tick');
 const reopened=C.Document.parse(doc.serialize());assert.deepEqual(D.currentStyle(reopened),profile);assert(reopened.resources.dimStyles['Office 1-50']);
});
test('style names are case insensitive while display spelling is preserved',()=>{
 const doc=drawing();D.style(doc,'SAVE','ISO-25',{textHeight:2.5});assert.equal(D.style(doc,'GET','iso-25').name,'ISO-25');
 failUnchanged(doc,()=>D.style(doc,'SAVE','iso-25',{}),/already exists/);assert.equal(D.style(doc,'LIST').length,1);
});
test('style application preserves dimension geometry and literal override',()=>{
 const doc=drawing(),{id,e}=dimension(doc,'horizontal',undefined,{text:'TYP <>',prefix:'old'}),points=JSON.parse(JSON.stringify(e.points));
 D.style(doc,'SAVE','Red',{textHeight:4,dimensionColor:'#ff0000',precision:1,suffix:' mm'});assert.deepEqual(D.style(doc,'APPLY','Red',{ids:[id]}),[id]);
 const changed=at(doc,id);assert.deepEqual(changed.points,points);assert.equal(changed.text,'TYP <>');assert.equal(changed.styleName,'Red');assert.equal(C.annotationGeometry(changed).labels[0].text,'TYP 100.0 mm');assert(C.annotationGeometry(changed).segments.every(s=>s.color==='#ff0000'));
});
test('updating a referenced named style changes actual geometry and is one undoable action',()=>{
 const doc=drawing(),{id}=dimension(doc);D.style(doc,'SAVE','Plan',{textHeight:2});D.style(doc,'APPLY','Plan',{ids:[id]});const before=doc.serialize(),oldMeasurement=C.annotationGeometry(at(doc,id)).measurement;
 const changed=D.style(doc,'UPDATE','Plan',{textHeight:8,arrowSize:4,precision:0});assert.deepEqual(changed.updatedIds,[id]);near(C.annotationGeometry(at(doc,id)).labels[0].height,8);near(C.annotationGeometry(at(doc,id)).measurement,oldMeasurement);
 assert(doc.undo());assert.equal(doc.serialize(),before);assert(doc.redo());near(C.annotationGeometry(at(doc,id)).labels[0].height,8);
});
test('style rename keeps current selection and all resource associations on native reopen',()=>{
 const doc=drawing(),{id}=dimension(doc);D.style(doc,'SAVE','Metric',{precision:3});D.style(doc,'APPLY','Metric',{ids:[id]});D.style(doc,'RENAME','Metric',{newName:'Metric revised'});
 const reopened=C.Document.parse(doc.serialize());assert.equal(at(reopened,id).styleName,'Metric revised');assert.equal(reopened.resources.currentDimStyle,'Metric revised');assert(!reopened.resources.dimStyles.Metric);assert.equal(D.currentStyle(reopened).precision,3);
});
test('deleting current/used style requires deliberate reassignment or detach',()=>{
 const doc=drawing(),{id}=dimension(doc);D.style(doc,'SAVE','A',{textHeight:5});D.style(doc,'APPLY','A',{ids:[id]});D.style(doc,'SAVE','B',{textHeight:2});
 failUnchanged(doc,()=>D.style(doc,'DELETE','A'),/current style/);D.style(doc,'SETCURRENT','B');failUnchanged(doc,()=>D.style(doc,'DELETE','A'),/used by/);
 const original=at(doc,id).textHeight;D.style(doc,'DELETE','A',{detach:true});assert(!at(doc,id).styleName);near(at(doc,id).textHeight,original);assert(!doc.resources.dimStyles.A);
});
test('invalid or unimplemented style fields fail before modifying document/history',()=>{
 const doc=drawing();for(const invalid of [{textHeight:0},{dimensionScale:-1},{precision:9},{arrowStyle:'dot'},{measurementScale:5},{units:'architectural'},{zeroSuppression:true},{prefix:'bad\nline'}])failUnchanged(doc,()=>D.style(doc,'SAVE','Invalid',invalid));
 for(const invalidName of ['__proto__','constructor','prototype','name/other',''])failUnchanged(doc,()=>D.style(doc,'SAVE',invalidName,{}));
});
test('applying a named style to locked/non-dimension objects is atomic',()=>{
 const doc=drawing(),{id}=dimension(doc),line=doc.add({kind:'line',points:[p(0,0),p(10,0)]});D.style(doc,'SAVE','A',{});
 failUnchanged(doc,()=>D.style(doc,'APPLY','A',{ids:[id,line]}),/dimension/);doc.layers[0].locked=true;failUnchanged(doc,()=>D.style(doc,'APPLY','A',{ids:[id]}),/locked/);
});
test('DIMCONTINUE chains from prior endpoint while DIMBASELINE keeps original datum',()=>{
 const doc=drawing(),{id}=dimension(doc,'horizontal',[p(10,5),p(110,5),p(0,20)],{precision:1,suffix:' mm'});
 const [chain]=D.continueDimension(doc,id,p(160,5),p(0,20)),[baseline]=D.continueDimension(doc,id,p(160,5),p(0,35),{baseline:true});
 assert.deepEqual(at(doc,chain).points[0],p(110,5));near(C.annotationGeometry(at(doc,chain)).measurement,50);
 assert.deepEqual(at(doc,baseline).points[0],p(10,5));near(C.annotationGeometry(at(doc,baseline)).measurement,150);assert.equal(C.annotationGeometry(at(doc,chain)).labels[0].text,'50.0 mm');
});
test('vertical and aligned continuation retain measurement mode and source appearance',()=>{
 for(const [style,points,feature,expected]of [['vertical',[p(5,0),p(5,100),p(20,0)],p(5,160),60],['aligned',[p(0,0),p(3,4),p(5,5)],p(6,8),5]]){
  const doc=drawing(),{id}=dimension(doc,style,points,{textColor:'#0088aa',arrowStyle:'open'}),[created]=D.continueDimension(doc,id,feature,null);assert.equal(at(doc,created).dimensionStyle,style);near(C.annotationGeometry(at(doc,created)).measurement,expected);assert.equal(at(doc,created).textColor,'#0088aa');assert.equal(at(doc,created).arrowStyle,'open');
 }
});
test('baseline automatic spacing changes placement without changing the datum measurement',()=>{
 const doc=drawing(),{id}=dimension(doc,'horizontal',[p(0,0),p(100,0),p(0,20)],{textHeight:2,dimensionScale:3});const [newId]=D.continueDimension(doc,id,p(150,0),null,{baseline:true});near(at(doc,newId).points[2].y,32);near(C.annotationGeometry(at(doc,newId)).measurement,150);
});
test('continued dimensions use requested named style and persist their style association',()=>{
 const doc=drawing(),{id}=dimension(doc);D.style(doc,'SAVE','Fine',{precision:4,textHeight:1});const [newId]=D.continueDimension(doc,id,p(125,0),p(0,20),{styleName:'Fine'});assert.equal(at(doc,newId).styleName,'Fine');assert.equal(C.annotationGeometry(at(doc,newId)).labels[0].text,'25.0000');
 const reopened=C.Document.parse(doc.serialize());assert.equal(at(reopened,newId).styleName,'Fine');
});
test('invalid continuation reference and zero-length features do not checkpoint',()=>{
 const doc=drawing(),{id}=dimension(doc,'radius',[p(0,0),p(5,0),p(10,10)]);failUnchanged(doc,()=>D.continueDimension(doc,id,p(10,0),p(0,20)),/reference dimension/);
 const base=dimension(doc,'horizontal');failUnchanged(doc,()=>D.continueDimension(doc,base.id,p(100,20),p(0,20)),/nonzero/);
});
test('ordinate X/Y dimensions measure signed offsets from explicit datum',()=>{
 const doc=drawing(),[x]=D.ordinate(doc,p(100,200),p(75,260),p(75,300),'X',{textHeight:2,precision:1}),[y]=D.ordinate(doc,p(100,200),p(75,260),p(20,260),'Y',{textHeight:2,precision:0});
 near(C.annotationGeometry(at(doc,x)).measurement,-25);assert.equal(C.annotationGeometry(at(doc,x)).labels[0].text,'-25.0');near(C.annotationGeometry(at(doc,y)).measurement,60);assert.equal(C.annotationGeometry(at(doc,y)).labels[0].text,'60');
 const reopened=C.Document.parse(doc.serialize());near(C.annotationGeometry(at(reopened,x)).measurement,-25);assert(C.annotationGeometry(at(reopened,x)).segments.length>=1);assert(C.hitTest(at(reopened,x),p(75,280),.1));
});
test('zero ordinate remains a legitimate coordinate measurement',()=>{
 const doc=drawing(),[id]=D.ordinate(doc,p(10,20),p(10,30),p(10,50),'X');near(C.annotationGeometry(at(doc,id)).measurement,0);assert.equal(C.annotationGeometry(at(doc,id)).labels[0].text,'0.00');
});
test('DIMEDIT changes text and position and restores numeric measurement',()=>{
 const doc=drawing(),{id}=dimension(doc);D.edit(doc,[id],'TEXT','TYP <>');assert.equal(C.annotationGeometry(at(doc,id)).labels[0].text,'TYP 100.00');D.edit(doc,[id],'POSITION',p(0,35));near(at(doc,id).points[2].y,35);near(C.annotationGeometry(at(doc,id)).measurement,100);D.edit(doc,[id],'RESET');assert.equal(C.annotationGeometry(at(doc,id)).labels[0].text,'100.00');
});
test('DIMEDIT rejects oblique rather than storing a nonfunctional setting',()=>{
 const doc=drawing(),{id}=dimension(doc);failUnchanged(doc,()=>D.edit(doc,[id],'OBLIQUE',30),/not implemented/);
});
test('QLEADER creates real selectable geometry, a filled arrow and Unicode text',()=>{
 const doc=drawing(),[id]=D.leader(doc,[p(0,0),p(15,15)],p(30,15),'غرفة 12',{textHeight:2,arrowSize:2,textColor:'#00aa00',dimensionColor:'#aa0000'}),e=at(doc,id);
 assert.equal(e.kind,'compound');assert.equal(e.subtype,'leader');assert.equal(e.data.text,'غرفة 12');assert.equal(e.parts.filter(e=>e.kind==='solid').length,1);assert.equal(e.parts.find(e=>e.kind==='text').text,'غرفة 12');assert.equal(e.parts.find(e=>e.kind==='text').color,'#00aa00');assert(e.parts.filter(e=>e.kind!=='text').every(e=>e.color==='#aa0000'));assert(C.hitTest(e,p(7.5,7.5),.1));
 const reopened=C.Document.parse(doc.serialize());assert.deepEqual(at(reopened,id),e);
});
test('MLEADER stores multiple independently editable arms sharing one label',()=>{
 const doc=drawing(),[id]=D.leader(doc,[[p(0,0),p(10,10)],[p(0,30),p(10,20)]],p(30,15),'Valve A',{textHeight:2}),e=at(doc,id);assert.equal(e.data.paths.length,2);assert.equal(e.parts.filter(part=>part.kind==='solid').length,2);assert.equal(e.parts.filter(part=>part.kind==='text').length,1);
 D.editLeader(doc,id,'ADD',[p(5,40),p(20,30)]);assert.equal(at(doc,id).data.paths.length,3);D.editLeader(doc,id,'REMOVE',1);assert.equal(at(doc,id).data.paths.length,2);assert.deepEqual(at(doc,id).data.paths[1][0],p(5,40));
});
test('leader editing rebuilds actual label, location and arrow geometry',()=>{
 const doc=drawing(),[id]=D.leader(doc,[p(0,0),p(10,10)],p(20,10),'A',{textHeight:2,arrowSize:1});D.editLeader(doc,id,'TEXT','B');assert.equal(at(doc,id).parts.find(part=>part.kind==='text').text,'B');
 D.editLeader(doc,id,'POSITION',p(40,30));assert.deepEqual(at(doc,id).parts.find(part=>part.kind==='text').points[0],p(40,30));
 D.editLeader(doc,id,'STYLE',{style:{arrowStyle:'open',textHeight:4,textColor:'#00aa22'}});assert.equal(at(doc,id).parts.filter(part=>part.kind==='solid').length,0);near(at(doc,id).parts.find(part=>part.kind==='text').textHeight,4);assert.equal(at(doc,id).parts.find(part=>part.kind==='text').color,'#00aa22');
});
test('multiline leader text uses separate persistent text primitives',()=>{
 const doc=drawing(),[id]=D.leader(doc,[p(0,0),p(10,10)],p(20,10),'Room A\nFloor 2',{textHeight:2});const labels=at(doc,id).parts.filter(part=>part.kind==='text');assert.equal(labels.length,2);near(labels[0].points[0].y-labels[1].points[0].y,2.8);assert.equal(C.Document.parse(doc.serialize()).entities[0].data.text,'Room A\nFloor 2');
});
test('leader named style/current profile is applied to actual parts',()=>{
 const doc=drawing();D.style(doc,'SAVE','LeaderStyle',{textHeight:3,dimensionScale:2,arrowSize:1,textColor:'#112233'});const [id]=D.leader(doc,[p(0,0),p(10,10)],p(30,10),'A');assert.equal(at(doc,id).data.styleName,'LeaderStyle');near(at(doc,id).parts.find(part=>part.kind==='text').textHeight,6);assert.equal(at(doc,id).parts.find(part=>part.kind==='text').color,'#112233');
});
test('translation/scale/rotation keep leader source metadata and later text editing consistent',()=>{
 const doc=drawing(),[id]=D.leader(doc,[p(0,0),p(10,0)],p(20,0),'A',{textHeight:2,arrowSize:1});doc.transform([id],{translation:p(5,7),rotation:Math.PI/2,scale:2,pivot:p(0,0)});const e=at(doc,id),beforeLabel=e.parts.find(part=>part.kind==='text');near(e.data.textPoint.x,5);near(e.data.textPoint.y,47);near(e.data.style.textHeight,4);near(e.data.textRotation,Math.PI/2);
 D.editLeader(doc,id,'TEXT','B');const after=at(doc,id).parts.find(part=>part.kind==='text');near(after.points[0].x,beforeLabel.points[0].x);near(after.points[0].y,beforeLabel.points[0].y);near(after.textHeight,beforeLabel.textHeight);near(after.startAngle,beforeLabel.startAngle);
});
test('leader operations are undoable and invalid edits preserve geometry/history',()=>{
 const doc=drawing(),[id]=D.leader(doc,[p(0,0),p(10,10)],p(20,10),'A'),before=doc.serialize();D.editLeader(doc,id,'TEXT','B');assert(doc.undo());assert.equal(doc.serialize(),before);assert(doc.redo());assert.equal(at(doc,id).data.text,'B');
 failUnchanged(doc,()=>D.editLeader(doc,id,'REMOVE',0),/at least one/);failUnchanged(doc,()=>D.editLeader(doc,id,'ADD',[p(2,2),p(2,2)]),/repeated/);doc.layers[0].locked=true;failUnchanged(doc,()=>D.editLeader(doc,id,'TEXT','C'),/locked/);
});
test('invalid leader geometry/unsupported styles never add partial elements',()=>{
 const doc=drawing();for(const fn of [()=>D.leader(doc,[p(0,0)],p(10,10),'A'),()=>D.leader(doc,[p(0,0),p(Infinity,0)],p(10,10),'A'),()=>D.leader(doc,[p(0,0),p(10,0)],p(20,0),''),()=>D.leader(doc,[p(0,0),p(10,0)],p(20,0),'A',{style:{units:'feet'}})])failUnchanged(doc,fn);
});
test('DXF export retains real leader paths/solid arrows/text and ordinate labels',()=>{
 const doc=drawing();D.leader(doc,[[p(0,0),p(10,10)],[p(0,20),p(10,15)]],p(30,10),'Valve A',{textHeight:2,arrowSize:1});D.ordinate(doc,p(10,10),p(25,30),p(25,50),'X',{precision:1});const dxf=C.exportDxf(doc);assert.equal((dxf.match(/\nSOLID\n/g)||[]).length,2);assert(dxf.includes('\nValve A\n'));assert(dxf.includes('\n15.0\n'));assert(dxf.includes('\nLWPOLYLINE\n'));fs.writeFileSync(path.join(output,'leaders-and-ordinate.dxf'),dxf);fs.writeFileSync(path.join(output,'leaders-and-ordinate.rasm.json'),doc.serialize());
});

fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({tests:checks,passed:checks,failed:0,results,limits:'Rendered dimension style fields only. No alternate/tolerance units, oblique extension editing or complete AutoCAD associative DIMSTYLE/MLEADER semantics.'},null,2)+'\n');
console.log('RESULT PASS '+checks+' dimension/leader groups');
