'use strict';
const fs=require('fs'),cp=require('child_process');
const suites=['core','core-v07','advanced','advanced-edit-v07','blocks-v07','hatch-v07','selection','snaps-v07','depth-core','depth-geometry','depth-dimensions','depth-save','depth-dwg','curve-polyline','print-layouts','ten-dimension-associations','ten-selection-snap','ten-dwg-recovery'];
fs.mkdirSync('build',{recursive:true});let failures=0;const results=[];
for(const suite of suites){const r=cp.spawnSync('node',['tests/'+suite+'.test.cjs'],{encoding:'utf8'}),output=(r.stdout||'')+(r.stderr||'')+(r.error?.message||'');fs.writeFileSync('build/ten-'+suite+'.log',output);const ok=!r.error&&r.status===0&&/pass/i.test(output);results.push({suite,status:ok?'PASS':'FAIL',summary:output.trim().split('\n').at(-1)});if(!ok)failures++;}
fs.writeFileSync('build/ten-focused-results.json',JSON.stringify(results,null,2));for(const r of results)console.log(r.status+' '+r.suite+': '+r.summary);process.exitCode=failures?1:0;
