'use strict';
const assert=require('node:assert/strict'),K=require('../src/construction');let count=0;
const near=(a,b,t=1e-8)=>{assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);count++;};
for(const o of [0,150000,1e8]){const a={kind:'line',points:[{x:o-100,y:o},{x:o+100,y:o}]},b={kind:'line',points:[{x:o,y:o-100},{x:o,y:o+100}]},c=K.circleTTR(a,b,10,{x:o+9,y:o+9});near(c.center.x,o+10);near(c.center.y,o+10);for(const [i,l]of [a,b].entries()){const q=c.tangencies[i];near(Math.hypot(q.x-c.center.x,q.y-c.center.y),10);near((q.x-c.center.x)*(l.points[1].x-l.points[0].x)+(q.y-c.center.y)*(l.points[1].y-l.points[0].y),0);}}
assert.throws(()=>K.circleTTR({kind:'circle'},{kind:'line'},5),/two LINE/);count++;assert.throws(()=>K.circleTTR({kind:'line',points:[{x:0,y:0},{x:10,y:0}]},{kind:'line',points:[{x:0,y:3},{x:10,y:3}]},2),/parallel/);count++;console.log('Tangent construction: '+count+' checks passed.');
