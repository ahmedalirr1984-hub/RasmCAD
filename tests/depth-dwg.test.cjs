'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const W=require('../src/dwg-write');
(async()=>{
  const caps=W.capabilities();assert.equal(caps.available,false);assert.equal(caps.canWrite,false);assert.equal(caps.extension,'.dwg');assert.ok(Object.isFrozen(caps));assert.match(caps.reason,/Changing the filename/);
  assert.throws(()=>W.write({entities:[]}),e=>e.code==='DWG_WRITER_UNAVAILABLE');
  // Presence of an unverified function must never automatically enable DWG Save.
  assert.equal(W.inspectRuntime({dwg_write_file(){}}).verifiedDocumentEncoder,false);
  assert.equal(W.capabilities().available,false);
  const root=path.resolve(__dirname,'..'),bytes=fs.readFileSync(path.join(root,'vendor/libredwg/wasm/libredwg-web.wasm'));
  const mod=await import(pathToFileURL(path.join(root,'vendor/libredwg/wasm/libredwg-web.js')));
  const runtime=await mod.default({wasmBinary:bytes,print:()=>{},printErr:()=>{}}),observed=W.inspectRuntime(runtime);
  assert.equal(observed.reader,true);assert.equal(observed.dwgToDxf,true);assert.equal(observed.dwgWriter,false);assert.equal(observed.dxfReader,false);assert.equal(observed.verifiedDocumentEncoder,false);
  // Direct native exports are also inspected; Emscripten embind functions are
  // checked above because not all JS-facing functions are native WASM exports.
  const exports=WebAssembly.Module.exports(new WebAssembly.Module(bytes)).map(e=>e.name);
  assert.ok(!exports.some(n=>/^_?dwg_write_file$/.test(n)));
  const report={engine:caps.engine,version:caps.engineVersion,wasmSha256:crypto.createHash('sha256').update(bytes).digest('hex'),runtime:observed,capability:caps,nativeExportCount:exports.length,runtimeKeyCount:Object.keys(runtime).length,tests:4,passed:4};
  fs.mkdirSync(path.join(root,'build'),{recursive:true});fs.writeFileSync(path.join(root,'build/depth-dwg-capability.json'),JSON.stringify(report,null,2));
  console.log('PASS 4 DWG capability checks: honest Save As status, explicit refusal, no unverified auto-enable, actual bundled runtime inspection');
})().catch(e=>{console.error(e);process.exitCode=1;});
