'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../src/core'),S=require('../src/save'),IO=require('../src/io');
let checks=0;const check=(v,m)=>{assert.ok(v,m);checks++;};
(async()=>{const d=new C.Document();d.add({kind:'line',points:[{x:150000,y:170000},{x:150100,y:170020}],color:'#ff3300'});d.add({kind:'text',points:[{x:150020,y:170030}],text:'غرفة مكتب',textHeight:3});d.resources.plot={paper:'A3',scale:100};const before=d.serialize();
const native=S.exportFile(d,'native');check(native.content===before,'native export preserves exact document');check(C.Document.parse(native.content).serialize()===before,'native parse roundtrip');
const dir=path.resolve(__dirname,'../build/depth-save');fs.mkdirSync(dir,{recursive:true});
for(const version of ['AC1021','AC1024','AC1027','AC1032']){const e=S.exportFile(d,version);check(e.content.includes('$ACADVER\n1\n'+version+'\n'),'declares requested DXF version');check(e.extension==='.dxf','actual DXF suffix');fs.writeFileSync(path.join(dir,version+'.dxf'),e.content);const r=await IO.importFile(Buffer.from(e.content),'roundtrip.dxf');check(r.document.entities.length===2,'DXF entity count');assert.deepEqual(r.document.entities[0].points,d.entities[0].points);checks++;check(r.document.entities[1].text==='غرفة مكتب','Arabic survives UTF8 DXF');}
assert.throws(()=>S.exportFile(d,'dwg'),/DWG writing/);checks++;assert.throws(()=>C.exportDxf(d,{version:'FAKE'}),/Unsupported DXF/);checks++;check(S.filename('plan.dwg',S.formats[0])==='plan.rasm.json','filename never mislabels native as DWG');check(d.serialize()===before,'export does not mutate drawing');console.log('Save formats: '+checks+' checks passed.');})().catch(e=>{console.error(e);process.exitCode=1;});
