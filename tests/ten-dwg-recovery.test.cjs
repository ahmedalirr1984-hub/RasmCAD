'use strict';
const assert=require('node:assert/strict'),C=require('../src/core'),S=require('../src/save'),E=require('../src/dwg-encoder'),IO=require('../src/io'),R=require('../src/recovery'),F=require('../src/curve-polyline');
let checks=0;
async function test(name,fn){await fn();checks++;console.log('PASS '+name);}
(async()=>{
 const d=new C.Document();
 d.add({kind:'line',points:[{x:150000,y:170000},{x:150100,y:170020}],color:'#fa0312'});
 d.layers.push({name:'مكتب',color:'#ff0000',visible:true,locked:false});
 d.add({kind:'text',layer:'مكتب',points:[{x:150000,y:170030}],text:'غرفة مكتب',textHeight:3});
 d.add({kind:'polyline',points:[{x:0,y:0},{x:10,y:0},{x:10,y:10}],closed:true});
 d.add(F.create([{x:20,y:20},{x:30,y:20}],{bulges:[1],width:2}));
 const before=d.serialize();let exported;
 await test('Actual R2000 encoder passes independent reader geometry check',async()=>{exported=await S.exportAsync(d,'DWG_R2000',{encoder:E});assert.equal(Buffer.from(exported.content.subarray(0,6)).toString(),'AC1015');assert.equal(exported.report.readback.geometryVerified,true);assert.equal(d.serialize(),before);assert.equal(exported.extension,'.dwg');});
 await test('Arabic layer and text survive genuine DWG exchange',async()=>{const r=await IO.importFile(exported.content,'test.dwg');assert.ok(r.document.entities.some(e=>e.layer==='مكتب'&&e.text==='غرفة مكتب'));assert.ok(r.document.entities.some(e=>e.kind==='arc'));assert.ok(r.document.entities.some(e=>e.kind==='solid'));assert.ok(exported.warnings.some(w=>w.includes('ACI')));});
 await test('Readback rejects geometry loss rather than emitting a misleading download',async()=>{await assert.rejects(S.exportAsync(d,'DWG_R2000',{encoder:E,verify:async()=>({document:new C.Document()})}),/lost all/);});
 await test('Header-only fake DWG output is rejected',async()=>{await assert.rejects(S.exportAsync(d,'DWG_R2000',{encoder:{capabilities:()=>({canWrite:true}),encode:async()=>new Uint8Array(Buffer.from('AC1015'))}}),/genuine/);});
 await test('Unrepresentable layer names reject before encoding',async()=>{const x=C.Document.parse(before);x.layers.push({name:'工程',color:'#ffffff',visible:true,locked:false});assert.throws(()=>E.envelope(C.exportDxf(x)),/Windows1256/);});
 await test('Recovery records preserve native editable structures and resources',()=>{d.resources.plotPresets={Office:{paper:'A3',scale:100}};const r=R.createRecord(d,'Office',100);assert.equal(R.restoreRecord(r).serialize(),d.serialize());assert.equal(r.name,'Office');assert.equal(r.time,100);assert.equal(R.limits.snapshots,3);});
 await test('Recovery detects modified or truncated stored content',()=>{const r=R.createRecord(d,'Office',100);assert.throws(()=>R.restoreRecord({...r,text:r.text+' '}),/integrity/);assert.throws(()=>R.restoreRecord({...r,text:r.text.slice(0,-1)}),/integrity/);});
 console.log('DWG and recovery: '+checks+' groups passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
