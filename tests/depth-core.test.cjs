'use strict';
const assert=require('node:assert/strict'),C=require('../src/core');
const a=2*Math.PI/180,c={x:150000,y:170000},r=5,q={x:c.x+r*Math.cos(a),y:c.y+r*Math.sin(a)},e={kind:'arc',points:[c],radius:r,startAngle:a,endAngle:a+Math.PI/2};
assert.equal(C.hitTest(e,q,.001),true,'arc start endpoint must hit despite angular rounding across zero');
assert.equal(C.hitTest(e,{x:c.x-r,y:c.y},.001),false,'outside arc remains excluded');
console.log('Core arc selection: 2 regression checks passed.');
