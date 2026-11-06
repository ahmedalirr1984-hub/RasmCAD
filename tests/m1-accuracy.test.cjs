'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core'),E=require('../src/editing'),S=require('../src/snaps'),K=require('../src/commands');
const line=(a,b)=>({kind:'line',points:[a,b]});
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b} +/- ${t}`);
test('AREA uses local coordinates for small shapes at survey origins',()=>{for(const [x,y,s] of [[150000,170000,.001],[1e8,1e8,1]]){const p=[{x,y},{x:x+s,y},{x:x+s,y:y+s},{x,y:y+s}];near(E.area({kind:'polyline',points:p,closed:true}).area,(p[1].x-x)*(p[2].y-y),1e-15);}});
test('dense intersection snap never discards curves after 240 candidates',()=>{const d=new C.Document();for(let i=0;i<240;i++)d.add(line({x:-10,y:i*.0001},{x:10,y:i*.0001}));d.add(line({x:.3,y:-10},{x:.3,y:10}));const h=S.find(d,{x:0,y:0},1,{modes:['intersection']});assert.ok(h);near(h.point.x,.3);near(h.point.y,0);});
function arc(){const a=2*Math.PI/180,c={x:150000,y:170000},r=5,q={x:c.x+r*Math.cos(a),y:c.y+r*Math.sin(a)};return {a,c,r,q,e:{kind:'arc',points:[c],radius:r,startAngle:a,endAngle:a+Math.PI/2}};}
test('arc start-angle wrap accepts tangent at translated endpoint',()=>{const {a,q,e}=arc(),d=new C.Document();d.add(e);const h=S.find(d,q,.001,{modes:['tangent'],base:{x:q.x-10*Math.sin(a),y:q.y+10*Math.cos(a)}});assert.ok(h);near(h.point.x,q.x);near(h.point.y,q.y);});
test('arc intersections accept rounded start endpoint',()=>{const {a,q,e}=arc(),v={x:-Math.sin(a)*10,y:Math.cos(a)*10};const h=E.intersections(e,line({x:q.x-v.x,y:q.y-v.y},{x:q.x+v.x,y:q.y+v.y}));assert.ok(h.length);near(h[0].x,q.x,1e-7);near(h[0].y,q.y,1e-7);});
test('near-parallel finite lines retain a real interior crossing',()=>{const h=E.intersections(line({x:-1e8,y:0},{x:1e8,y:0}),line({x:-1e8,y:-1e-5},{x:1e8,y:1e-5}));assert.deepEqual(h,[{x:0,y:0}]);});
test('three-point circle construction is stable near survey origin',()=>{assert.equal(typeof K.circleThrough3Points,'function');const c=K.circleThrough3Points({x:150000.001,y:170000},{x:150000,y:170000.001},{x:149999.999,y:170000});near(c.center.x,150000);near(c.center.y,170000);near(c.radius,.001,2e-11);});
