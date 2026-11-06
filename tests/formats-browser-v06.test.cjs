'use strict';
// Real file-input/edit/export/reopen workflows. Model access is read-only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),htmlPath=process.env.RASMCAD_HTML||path.join(root,'dist/RasmCAD-Advanced.html');
const output=path.resolve(root,process.env.RASMCAD_OUTPUT||'build/formats-v06');fs.mkdirSync(output,{recursive:true});
const expectedVersion=process.env.RASMCAD_EXPECT_VERSION||'0.6';
const results=[],pageErrors=[],externalRequests=[];let browser,server,context,origin,htmlSha256,htmlBytes;
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,`${a} is not near ${b}`);
async function state(page){return page.evaluate(()=>({version:RasmCAD.version,tool:RasmCAD.tool,selected:RasmCAD.selectedIds,doc:JSON.parse(RasmCAD.document.serialize()),status:document.querySelector('#status-log').textContent,errorBanner:!document.querySelector('#errors-banner').hidden}));}
async function command(page,value){
  if(value!==undefined){assert.notEqual(value,'','empty fill emits an unrelated Delete event');await page.locator('#command').fill(value);}
  else assert.equal(await page.locator('#command').inputValue(),'');
  await page.locator('#command').press('Enter');
}
async function point(page,p){
  const q=await page.evaluate(p=>RasmCAD.worldToScreen(p),p),box=await page.locator('#canvas').boundingBox();
  assert.ok(box&&q.x>0&&q.x<box.width&&q.y>0&&q.y<box.height,'entity point must be visible in the actual canvas');
  await page.mouse.click(box.x+q.x,box.y+q.y);
}
async function upload(page,name,buffer){
  await page.locator('#file-input').setInputFiles({name,mimeType:'application/octet-stream',buffer:Buffer.from(buffer)});
  await page.waitForFunction(()=>!document.querySelector('#open-btn').disabled);
  if(await page.locator('#import-report').isVisible()){
    if(await page.locator('#import-continue').count())await page.locator('#import-continue').click();
    else await page.locator('#import-report-close').click();
  }
  await page.waitForTimeout(40);
}
async function fresh(){
  const page=await context.newPage();page.setDefaultTimeout(7000);
  page.on('dialog',dialog=>dialog.accept());page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')pageErrors.push(message.text());});
  await context.setOffline(false);await page.goto(origin,{waitUntil:'load'});
  await page.waitForFunction(v=>window.RasmCAD?.version===v,expectedVersion);await context.setOffline(true);
  if(await page.locator('#snap-btn').getAttribute('aria-pressed')==='true')await page.locator('#snap-btn').click();
  assert.equal(await page.evaluate(()=>navigator.onLine),false,'file operations run offline');return page;
}
async function test(name,fn){
  if(process.env.RASMCAD_TEST_PATTERN&&!new RegExp(process.env.RASMCAD_TEST_PATTERN,'i').test(name))return;
  const page=await fresh();
  try{const details=await fn(page);assert.equal((await state(page)).errorBanner,false);results.push({name,status:'PASS',details});console.log('PASS '+name);}
  catch(error){let snapshot;try{snapshot=await state(page);}catch{}const screenshot=String(results.length+1).padStart(2,'0')+'.png';await page.screenshot({path:path.join(output,screenshot),fullPage:true}).catch(()=>{});results.push({name,status:'FAIL',error:error.message,state:snapshot,screenshot});console.error('FAIL '+name+': '+error.message);}
  finally{await page.close();}
}
async function moveLine(page,line,delta={x:10,y:5}){
  await page.keyboard.press('Escape');await page.locator('[data-tool="select"]').click();
  await point(page,{x:(line.points[0].x+line.points[1].x)/2,y:(line.points[0].y+line.points[1].y)/2});
  assert.ok((await state(page)).selected.includes(line.id),'original imported line selected by actual mouse');
  await command(page,'MOVE');await command(page,`${line.points[0].x},${line.points[0].y}`);await command(page,`${line.points[0].x+delta.x},${line.points[0].y+delta.y}`);
  const moved=(await state(page)).doc.entities.find(e=>e.id===line.id);near(moved.points[0].x,line.points[0].x+delta.x);near(moved.points[0].y,line.points[0].y+delta.y);return moved;
}
async function editExportReopen(page,name,bytes,expected={}){
  await upload(page,name,bytes);let current=await state(page);assert.match(current.status,/Opened /,'actual file import succeeded');
  const initial=current.doc.entities.length;assert.ok(initial>0,'editable primitives imported');
  if(expected.count!==undefined)assert.equal(initial,expected.count);
  const currentLayer=current.doc.layers.find(l=>l.name===current.doc.currentLayer);assert.ok(currentLayer.visible&&!currentLayer.locked,'current drawing layer is usable');
  if(expected.text!==undefined)assert.equal(current.doc.entities.find(e=>e.kind==='text').text,expected.text);
  if(expected.color!==undefined)assert.equal(current.doc.entities.find(e=>e.kind==='line').color,expected.color);
  const line=current.doc.entities.find(e=>e.kind==='line'&&current.doc.layers.some(l=>l.name===e.layer&&l.visible&&!l.locked));assert.ok(line,'a real imported line is editable');
  const moved=await moveLine(page,line);
  await command(page,'LINE');await command(page,`${moved.points[0].x+2},${moved.points[0].y+2}`);await command(page,'@20,0');await command(page);
  current=await state(page);assert.equal(current.doc.entities.length,initial+1,'new geometry added to imported CAD drawing');assert.doesNotMatch(current.status,/Operation failed:/);
  const pending=page.waitForEvent('download');await page.locator('#dxf-btn').click();const download=await pending;
  const file=path.join(output,name.replace(/[^a-z0-9._-]/gi,'_')+'-edited.dxf');await download.saveAs(file);assert.equal(await download.failure(),null);
  await upload(page,'edited-exchange.dxf',fs.readFileSync(file));current=await state(page);assert.equal(current.doc.entities.length,initial+1,'exported DXF reopens with original and added geometry');
  const restored=current.doc.entities.find(e=>e.kind==='line'&&Math.abs(e.points[0].x-moved.points[0].x)<1e-6&&Math.abs(e.points[0].y-moved.points[0].y)<1e-6);assert.ok(restored,'edited original line survived DXF export/reopen');
  await moveLine(page,restored,{x:3,y:-2});
  return{inputObjects:initial,reopenedObjects:current.doc.entities.length,text:expected.text,exchangeDownload:path.basename(file)};
}
(async()=>{
  const html=fs.readFileSync(htmlPath);htmlBytes=html.length;htmlSha256=crypto.createHash('sha256').update(html).digest('hex');
  console.log(JSON.stringify({htmlPath,htmlSha256,htmlBytes,expectedVersion}));
  server=http.createServer((request,response)=>{if(request.url==='/favicon.ico'){response.writeHead(204);response.end();return;}response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end(html);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  context=await browser.newContext({viewport:{width:1500,height:1040},deviceScaleFactor:1.25,acceptDownloads:true});
  await context.route('**/*',route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();externalRequests.push(route.request().url());return route.abort('blockedbyclient');});
  const names={r12:'Cafe é','r2000-arabic':'مخطط مكتب','r2018-unicode':'مخطط 測試 📐'};
  for(const[label,text]of Object.entries(names))for(const variant of['','-ascii']){
    const name='binary-v06-'+label+variant+'.dxf',bytes=fs.readFileSync(path.join(root,'tests/fixtures',name));
    await test(`${variant?'ASCII':'Binary'} ${label}: actual open, edit, add, DXF download/reopen/edit`,page=>editExportReopen(page,name,bytes,{count:5,text,...(label==='r2018-unicode'?{color:'#0c91e6'}:{})}));
  }
  const dwg=fs.readFileSync(path.join(root,'tests/fixtures/2018-Line.dwg'));
  for(const suffix of['.dwg','.dwt','.dws','.bak','.sv$']){
    await test(`Real AC1032 DWG bytes named ${suffix}: open, edit, add, DXF download/reopen/edit`,async page=>{
      const accept=await page.locator('#file-input').getAttribute('accept');assert.ok(accept.split(',').includes(suffix),'file picker offers '+suffix);
      return editExportReopen(page,'source-line'+suffix,dwg,{count:1});
    });
  }
  await test('Malformed binary DXF preserves the already imported drawing and editing remains usable',async page=>{
    const bytes=fs.readFileSync(path.join(root,'tests/fixtures/binary-v06-r2018-unicode.dxf'));
    await upload(page,'valid-before-error.dxf',bytes);const before=(await state(page)).doc;
    await upload(page,'truncated.dxf',bytes.subarray(0,-10));const after=await state(page);
    assert.match(after.status,/Open failed; current drawing was preserved/);assert.deepEqual(after.doc,before);
    const line=before.entities.find(e=>e.kind==='line');await moveLine(page,line);
    return{preservedObjects:before.entities.length};
  });
  assert.deepEqual(pageErrors,[],'no uncaught browser errors');assert.deepEqual(externalRequests,[],'no external requests');
})().catch(error=>{pageErrors.push(error.stack||error.message);console.error(error);}).finally(async()=>{
  const browserVersion=browser?await browser.version():null;
  if(context)await context.close();if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
  const summary={htmlPath,htmlSha256,htmlBytes,expectedVersion,browser:browserVersion,deviceScaleFactor:1.25,offlineAfterLoad:true,tests:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,pageErrors,externalRequests,results};
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({htmlSha256,tests:summary.tests,passed:summary.passed,failed:summary.failed,pageErrors,externalRequests}));
  process.exitCode=summary.failed||pageErrors.length||externalRequests.length?1:0;
});
