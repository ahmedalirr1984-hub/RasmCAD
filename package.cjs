'use strict';
const fs=require('node:fs'),path=require('node:path'),C=require('./src/core');
const root=__dirname,out=path.join(root,'delivery','RasmCAD-Advanced-0.7');fs.mkdirSync(out,{recursive:true});
const docs=['README.md','README_AR.txt','UPGRADE_0.7.md','UPGRADE_0.7_AR.md','DEVELOPMENT.md','FEATURES.md','CHANGELOG.md','COMMAND_WORDS.txt','THIRD_PARTY.md','TEST_RESULTS.md','GPL-3.0.txt','ORIGINAL-MIT-LICENSE.txt'];
for(const name of docs)fs.copyFileSync(path.join(root,name),path.join(out,name==='GPL-3.0.txt'?'LICENSE':name));
const files=[['dist/RasmCAD-Advanced.html','RasmCAD-Advanced.html'],['build/v07-example/advanced-example.rasm.json','advanced-example.rasm.json'],['build/v07-example/advanced-example.pdf','advanced-example.pdf'],['build/advanced-browser/advanced-desktop.png','preview.png']];
for(const[from,to]of files)fs.copyFileSync(path.join(root,from),path.join(out,to));
fs.writeFileSync(path.join(out,'example.rasm.json'),C.sampleDocument().serialize());
fs.writeFileSync(path.join(out,'START-HERE.txt'),`RasmCAD Advanced 0.7 — ADVANCED 2D

1. Save your older project and close its old application tab. Extract this complete ZIP into a new folder.
2. Open RasmCAD-Advanced.html in Edge/Chrome and confirm visible version 0.7.
3. Open advanced-example.rasm.json for editable hatching with a hole, block references/attributes, named dimensions, leader and native spline. advanced-example.pdf shows its scaled vector output.
4. Expand Advanced 2D in the left tools, or type commands. UPGRADE_0.7_AR.md gives Arabic instructions; UPGRADE_0.7.md has detailed workflows and limits.
5. OSNAPSET enables intersection/perpendicular/tangent/nearest. Perpendicular/tangent require a first/base point. STRETCH/BREAK/LENGTHEN/ALIGN/PEDIT/SPLINEDIT/OVERKILL/EXPLODE are available.
6. HATCH/HATCHEDIT/BOUNDARY/REGION retain editable native data. BLOCK/INSERT/BEDIT/REFEDIT/BCLOSE, attributes and native WBLOCK are available.
7. DIMSTYLE/DIMCONTINUE/DIMBASELINE/DIMORDINATE/DIMEDIT/QLEADER/MLEADER/MLEADEREDIT extend annotations.
8. Plot vector PDF uses physical paper, drawing units, plot window and scale1:N. Print the PDF at Actual size/100% to retain scale.
9. Save project keeps new native systems in .rasm.json. DXF export flattens systems into supported editable vectors; native DWG writing is unavailable.
10. Source contains editable application/dependency/font source, licenses, tests and build scripts. DEVELOPMENT.md explains rebuilding. Running this HTML requires no Python/Node installation.

The new systems implement supported workflows, not every AutoCAD option. Full DIMSTYLE, in-context Xref editing, ACIS regions, NURBS/dynamic blocks/advanced attributes and all DWG fidelity are not established. Read FEATURES.md and TEST_RESULTS.md.
`);
const source=path.join(out,'Source');fs.mkdirSync(source,{recursive:true});
for(const name of ['src','vendor','tests','build.cjs','package.cjs','make-advanced-example.cjs','LICENSE',...docs])fs.cpSync(path.join(root,name),path.join(source,name),{recursive:true});
const evidence=path.join(source,'test-results');fs.mkdirSync(evidence,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(root,'build/v07-final-manifest.json'),'utf8'));
if(manifest.suites.length!==26||manifest.suites.some(e=>e.status!==0||!e.unchanged))throw Error('Final validation is incomplete');
if(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'dist/RasmCAD-Advanced.html'))).digest('hex')!==manifest.htmlSha256)throw Error('HTML does not match final tests');
fs.copyFileSync(path.join(root,'build/v07-final-manifest.json'),path.join(evidence,'v07-final-manifest.json'));
for(const entry of manifest.suites){if(entry.status!==0||!entry.unchanged)throw Error('Unvalidated test suite: '+entry.name);fs.copyFileSync(path.join(root,entry.log),path.join(evidence,path.basename(entry.log)));}
for(const [from,to]of [['advanced-ui-v07/results.json','advanced-ui-v07.json'],['hatch-ui-v07/results.json','hatch-ui-v07.json'],['systems-ui-v07/results.json','systems-ui-v07.json'],['command-ui-v07/results.json','command-ui-v07.json'],['input-v05/v07-results.json','input-v07.json'],['plot-v07/results.json','plot-v07.json'],['hatch-v07/results.json','hatch-v07.json'],['dimensions-v07/results.json','dimensions-v07.json'],['import-v06/results.json','import-current.json'],['binary-v06/results.json','binary-current.json']])fs.copyFileSync(path.join(root,'build',from),path.join(evidence,to));
console.log('Prepared '+out);
