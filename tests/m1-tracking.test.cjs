'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),T=require('../src/tracking'),S=require('../src/snaps'),C=require('../src/core');
test('polar tracks the exact 45-degree analytic projection',()=>{const h=T.constrain({x:10,y:10.1},{x:0,y:0},[],.2,45);assert.equal(h.type,'polar');assert.ok(Math.abs(h.point.x-10.05)<1e-12);assert.ok(Math.abs(h.point.y-10.05)<1e-12);});
test('object tracking combines acquired x/y without moving anchors',()=>{const a=[{x:150000,y:170010},{x:150020,y:170000}],before=JSON.stringify(a),h=T.constrain({x:150000.02,y:170000.03},null,a,.1);assert.deepEqual(h.point,{x:150000,y:170000});assert.equal(JSON.stringify(a),before);});
test('tracking outside aperture does not invent a constraint',()=>{assert.equal(T.constrain({x:4,y:6},null,[{x:0,y:0}],1),null);});
test('explicit priority and aperture are honored',()=>{const d=new C.Document();d.add({kind:'line',points:[{x:0,y:0},{x:10,y:0}]});assert.equal(S.find(d,{x:.7,y:.01},1,{modes:['endpoint','nearest'],priority:['endpoint','nearest']}).type,'endpoint');assert.equal(S.find(d,{x:.7,y:.01},.1,{modes:['endpoint']}),null);});
