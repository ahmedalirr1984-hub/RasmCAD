'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'dist/RasmCAD-Advanced.html');
const out = path.join(root, 'build/dimension-browser');
const results = [], errors = [], remote = [];
let browser, server, lastPage, origin, fileMode = false;
const source = fs.readFileSync(htmlPath, 'utf8');
const hash = crypto.createHash('sha256').update(source).digest('hex');
function pass(s) { results.push('PASS: ' + s); console.log(results.at(-1)); }
function near(a,b,message) { assert(Math.abs(a-b)<1e-7, `${message}: ${a} versus ${b}`); }
async function command(page, value) { await page.locator('#command').fill(value); await page.locator('#command').press('Enter'); }
async function count(page, n) { await page.waitForFunction(n => Number(document.querySelector('#entity-count').textContent)===n,n); }
async function entity(page,id=1) { return page.evaluate(id=>window.RasmCAD.document.entities.find(e=>e.id===id),id); }
async function geometry(page,id=1) { return page.evaluate(id=>window.RasmCore.annotationGeometry(window.RasmCAD.document.entities.find(e=>e.id===id)),id); }
async function zoom(page) { return page.evaluate(()=>Math.abs(RasmCAD.worldToScreen({x:1,y:0}).x-RasmCAD.worldToScreen({x:0,y:0}).x)); }
async function clickWorld(page,p) { const s=await page.evaluate(p=>RasmCAD.worldToScreen(p),p),b=await page.locator('#canvas').boundingBox();await page.mouse.click(b.x+s.x,b.y+s.y); }
async function selectLabel(page,id) {
  await page.locator('#command').press('Escape');
  const p=await page.evaluate(id=>{const e=RasmCAD.document.entities.find(e=>e.id===id),l=RasmCore.annotationGeometry(e).labels[0],q=RasmSelection.textQuad(l);return {x:q.reduce((n,p)=>n+p.x,0)/q.length,y:q.reduce((n,p)=>n+p.y,0)/q.length};},id);
  await clickWorld(page,p);
  assert.deepEqual(await page.evaluate(()=>RasmCAD.selectedIds),[id]);
}
async function makeDim(page,a,b,label,n) { await page.locator('[data-tool="dimension"]').click();for(const p of[a,b,label])await command(page,`${p.x},${p.y}`);await count(page,n); }
async function fill(page,id,value) { await page.locator('#'+id).fill(String(value)); }
async function color(page,id,value) {
  const control=page.locator('#'+id);assert(await control.isEnabled(),`${id} enabled`);
  // Native color picker dialogs are OS-specific; change the actual HTML color
  // control and deliver its standard input/change events, never the CAD model.
  await control.evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);
}
async function download(page,selector,name) { const event=page.waitForEvent('download');await page.locator(selector).click();const d=await event,p=path.join(out,name);await d.saveAs(p);assert.equal(await d.failure(),null);return p; }
async function exportPng(page,name) { const p=await download(page,'#png-btn',name);const image=PNG.sync.read(fs.readFileSync(p));const colors={red:0,green:0,blue:0};for(let i=0;i<image.data.length;i+=4){const[r,g,b]=image.data.subarray(i,i+3);if(r>70&&r>g*2&&r>b*2)colors.red++;if(g>70&&g>r*2&&g>b*2)colors.green++;if(b>70&&b>r*2&&b>g*2)colors.blue++;}return colors; }
async function attach(page) { lastPage=page;page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('dialog',d=>d.accept());await page.route(/^https?:\/\//,r=>{const u=new URL(r.request().url());if(u.origin===origin){if(u.pathname==='/favicon.ico')return r.fulfill({status:204,body:''});return r.continue();}remote.push(u.href);return r.abort();}); }

(async()=>{
  fs.mkdirSync(out,{recursive:true});results.push(`HTML SHA-256: ${hash}\nHTML bytes: ${Buffer.byteLength(source)}`);
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});results.push('Browser: Chromium '+browser.version());
  const context=await browser.newContext({viewport:{width:1366,height:768},acceptDownloads:true});
  const probe=await context.newPage();try{await probe.goto(pathToFileURL(htmlPath).href);fileMode=true;origin='null';}catch(e){if(!String(e).includes('ERR_BLOCKED_BY_ADMINISTRATOR'))throw e;results.push('LIMITATION: managed Chromium blocks file://; exact standalone HTML tested through allowed loopback HTTP with networking offline after loading. No security policy changed.');server=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});r.end(source);});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;}await probe.close();
  const url=fileMode?pathToFileURL(htmlPath).href:origin+'/RasmCAD-Advanced.html';
  const page=await context.newPage();await attach(page);await page.goto(url);await context.setOffline(true);await page.locator('#new-btn').click();await count(page,0);
  near(await zoom(page),1,'new drawing zoom');
  await makeDim(page,{x:150,y:150},{x:450,y:150},{x:300,y:230},1);
  const automatic=await entity(page),autoGeometry=await geometry(page);
  near(automatic.textHeight*automatic.dimensionScale*await zoom(page),14,'automatically sized dimension text');near(autoGeometry.measurement,300,'dimension measurement');
  pass('actual toolbar and coordinate input create an aligned dimension with automatic 14px text at zoom 1');
  const arrow=autoGeometry.fills[0].points,p={x:arrow.reduce((s,p)=>s+p.x,0)/arrow.length,y:arrow.reduce((s,p)=>s+p.y,0)/arrow.length};
  await clickWorld(page,p);assert.deepEqual(await page.evaluate(()=>RasmCAD.selectedIds),[1]);
  assert(await page.locator('#property-height').isEnabled());assert(await page.locator('#dim-scale').isEnabled());
  await selectLabel(page,1);assert(await page.locator('#dimension-properties').isVisible());
  pass('actual mouse can select the dimension by a filled arrow and by its rendered label; inspector fields enable');

  for(const[id,value]of Object.entries({'property-height':24,'dim-scale':1.5,'dim-arrow-size':10,'dim-precision':1,'dim-prefix':'LEN=','dim-suffix':' mm','dim-extension-offset':4,'dim-extension-extend':7,'dim-text-gap':6}))await fill(page,id,value);
  await page.locator('#dim-line-bylayer').uncheck();await color(page,'dim-line-color','#ff0000');
  await page.locator('#dim-text-bylayer').uncheck();await color(page,'dim-text-color','#00ff00');
  await page.locator('#apply-properties').click();
  let styled=await entity(page),g=await geometry(page);
  for(const[k,v]of Object.entries({textHeight:24,dimensionScale:1.5,arrowSize:10,precision:1,prefix:'LEN=',suffix:' mm',extensionOffset:4,extensionExtend:7,textGap:6,dimensionColor:'#ff0000',textColor:'#00ff00'}))assert.equal(styled[k],v,k);
  near(g.labels[0].height,36,'overall scale changes visual text height');near(g.measurement,300,'style does not change measurement');assert.equal(g.labels[0].text,'LEN=300.0 mm');assert(g.segments.every(s=>s.color==='#ff0000'));assert.equal(g.labels[0].color,'#00ff00');assert.equal(g.fills.length,2);
  let pixels=await exportPng(page,'dimension-closed.png');assert(pixels.red>80&&pixels.green>50,`real PNG separate line/text colors: ${JSON.stringify(pixels)}`);
  pass('changed properties apply text height, overall scale, arrows, extensions, gap, precision, prefix/suffix and independent line/text colors; actual PNG contains red strokes and green text');

  for(const style of['open','tick','closed']){
    await page.locator('#dim-arrow-style').selectOption(style);await page.locator('#apply-properties').click();g=await geometry(page);assert.equal((await entity(page)).arrowStyle,style);assert.equal(g.fills.length,style==='closed'?2:0);assert.equal(g.segments.filter(s=>s.role==='arrow').length,style==='tick'?2:style==='open'?4:6);
    pixels=await exportPng(page,`dimension-${style}.png`);assert(pixels.red>80&&pixels.green>50);
  }
  pass('open, architectural tick and filled closed arrow styles update native fields, annotation geometry and actual PNG output');

  await page.locator('#property-bylayer').uncheck();await color(page,'property-color','#0000ff');await page.locator('#apply-properties').click();
  styled=await entity(page);assert.equal(styled.color,'#0000ff');assert.equal(styled.dimensionColor,'#ff0000');assert.equal(styled.textColor,'#00ff00');
  await page.locator('#dim-line-bylayer').check();await page.locator('#dim-text-bylayer').check();await page.locator('#apply-properties').click();
  styled=await entity(page);assert.equal(styled.color,'#0000ff');assert.equal(styled.dimensionColor,null);assert.equal(styled.textColor,null);assert.equal((await geometry(page)).labels[0].color,null);
  pixels=await exportPng(page,'dimension-inherit-object-blue.png');assert(pixels.blue>100&&pixels.red===0&&pixels.green===0,`inherit object color pixels: ${JSON.stringify(pixels)}`);
  await page.locator('#dim-line-bylayer').uncheck();await color(page,'dim-line-color','#ff0000');await page.locator('#dim-text-bylayer').uncheck();await color(page,'dim-text-color','#00ff00');await page.locator('#apply-properties').click();
  pass('object ByLayer and child Inherit object color controls have distinct semantics; actual inherited-color PNG uses the blue object color');

  const firstBeforeDefaults=await entity(page),docBeforeDefaults=await page.evaluate(()=>RasmCAD.document.serialize());
  for(const[id,value]of Object.entries({'property-height':18,'dim-scale':2,'dim-precision':3,'dim-prefix':'NEXT ','dim-suffix':' cm'}))await fill(page,id,value);
  await page.locator('#dim-arrow-style').selectOption('open');await page.locator('#dim-defaults-btn').click();
  assert.equal(await page.evaluate(()=>RasmCAD.document.serialize()),docBeforeDefaults);
  await makeDim(page,{x:150,y:75},{x:450,y:75},{x:300,y:40},2);
  assert.deepEqual(await entity(page,1),firstBeforeDefaults);const second=await entity(page,2);
  for(const[k,v]of Object.entries({textHeight:18,dimensionScale:2,precision:3,prefix:'NEXT ',suffix:' cm',arrowStyle:'open',arrowSize:10,color:'#0000ff',dimensionColor:'#ff0000',textColor:'#00ff00'}))assert.equal(second[k],v,'new default '+k);
  pass('Use as dimension defaults clones pending style without changing the selected dimension; the next actual dimension inherits it');

  await selectLabel(page,1);await page.locator('#dim-line-color').scrollIntoViewIfNeeded();await page.mouse.move(5,5);await page.screenshot({path:path.join(out,'desktop-dimension-controls.png'),fullPage:true});
  const savedPath=await download(page,'#save-btn','styled-dimensions.rasm.json'),saved=JSON.parse(fs.readFileSync(savedPath,'utf8'));
  await page.locator('#new-btn').click();await count(page,0);await page.locator('#file-input').setInputFiles(savedPath);await count(page,2);
  assert.deepEqual(await page.evaluate(()=>RasmCAD.document.entities),saved.entities);
  const reopenedPath=await download(page,'#save-btn','reopened-dimensions.rasm.json');assert.deepEqual(JSON.parse(fs.readFileSync(reopenedPath,'utf8')).entities,saved.entities);
  const resetZoom=await zoom(page);await makeDim(page,{x:450,y:280},{x:150,y:280},{x:300,y:310},3);
  const reversed=await entity(page,3),reversedGeometry=await geometry(page,3);assert.equal(reversed.prefix,'');assert.equal(reversed.suffix,'');assert.equal(reversed.arrowStyle,'closed');assert.equal(reversed.dimensionScale,1);near(reversed.textHeight*resetZoom,14,'defaults reset to automatic screen sizing on reopen');assert(Math.abs(reversedGeometry.labels[0].angle)<=Math.PI/2);
  pass('real native download and file-input reopen preserve every styled dimension field; session defaults reset and reversed dimensions keep upright labels');
  await page.locator('#fit-btn').click();await page.locator('#command').press('Escape');await page.mouse.move(5,5);await page.screenshot({path:path.join(out,'desktop-dimensions.png'),fullPage:true});

  await page.setViewportSize({width:1150,height:768});await selectLabel(page,1);await page.locator('#dim-line-color').scrollIntoViewIfNeeded();
  const rowOverflow=await page.locator('.dimension-color-row').evaluateAll(rows=>rows.map(r=>r.scrollWidth-r.clientWidth));assert(rowOverflow.every(n=>n<=1),`230px inspector color-row overflow: ${rowOverflow}`);
  await page.screenshot({path:path.join(out,'inspector-230px.png'),fullPage:true});
  const mobileContext=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true,isMobile:true,hasTouch:true});const mobile=await mobileContext.newPage();await attach(mobile);await mobile.goto(url);await mobileContext.setOffline(true);await mobile.locator('#file-input').setInputFiles(savedPath);await count(mobile,2);
  await selectLabel(mobile,1);await mobile.screenshot({path:path.join(out,'narrow-dimensions.png'),fullPage:true});
  await mobile.locator('#layers-toggle').click();await mobile.locator('#dim-line-color').scrollIntoViewIfNeeded();assert(await mobile.locator('#dim-defaults-btn').isVisible());assert(await mobile.locator('#apply-properties').isVisible());
  const mobileOverflow=await mobile.locator('.dimension-color-row').evaluateAll(rows=>rows.map(r=>r.scrollWidth-r.clientWidth));assert(mobileOverflow.every(n=>n<=1),`258px inspector color-row overflow: ${mobileOverflow}`);assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  await mobile.screenshot({path:path.join(out,'narrow-dimension-controls.png'),fullPage:true});
  for(const id of['finish-btn','cancel-btn']){const b=await mobile.locator('#'+id).boundingBox();assert(b&&b.x>=0&&b.x+b.width<=390,`${id} remains on screen`);}
  await mobileContext.close();
  pass('1366px desktop, 230px inspector and 390px narrow layouts retain dimension controls, reachable Apply/defaults, visible Finish/Cancel and no horizontal overflow');
  assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);pass('all drawing/style/save/reopen/export operations worked offline with no external requests or uncaught/console errors');
  results.push('RESULT: PASS');
})().catch(async e=>{console.error(e);results.push('RESULT: FAIL\n'+e.stack);process.exitCode=1;if(lastPage&&!lastPage.isClosed())await lastPage.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});}).finally(async()=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'dimension-browser-results.txt'),results.join('\n')+'\n');if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));});
