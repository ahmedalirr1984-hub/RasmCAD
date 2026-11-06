'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),html=path.join(root,'dist/RasmCAD-Advanced.html');
const digest=()=>crypto.createHash('sha256').update(fs.readFileSync(html)).digest('hex');
fs.mkdirSync(path.join(root,'build/depth-validation'),{recursive:true});
const expected=digest(),report={htmlSha256:expected,htmlBytes:fs.statSync(html).size,suites:[]};
for(const file of fs.readdirSync(__dirname).filter(n=>n.endsWith('.test.cjs')).sort()){
 const log=path.join(root,'build/depth-validation',file+'.log'),fd=fs.openSync(log,'w');
 const run=cp.spawnSync(process.execPath,[path.join(__dirname,file)],{cwd:root,env:{...process.env,RASMCAD_EXPECT_VERSION:'0.8-dev',RASMCAD_PHASE:'depth',RASMCAD_OUTPUT:'build/depth-formats-command',RASMCAD_PDF_AUDIT:'1'},stdio:['ignore',fd,fd],timeout:360000});fs.closeSync(fd);
 const result={file,exitCode:run.status,unchanged:digest()===expected,log:path.relative(root,log)};report.suites.push(result);
 fs.writeFileSync(path.join(root,'build/depth-validation.json'),JSON.stringify(report,null,2));
 console.log((run.status===0&&result.unchanged?'PASS ':'FAIL ')+file);
 if(run.status!==0||!result.unchanged){console.error(fs.readFileSync(log,'utf8').slice(-5000));process.exit(1);}
}
report.browser=JSON.parse(fs.readFileSync(path.join(root,'build/m1-browser/results.json')));
report.fileProtocol=report.browser.fileProtocol;report.scope='Command depth development preview; no AutoCAD parity claim';
fs.writeFileSync(path.join(root,'build/depth-validation.json'),JSON.stringify(report,null,2));
console.log('ALL '+report.suites.length+' automated suites passed. file protocol: '+report.fileProtocol.status);
