'use strict';
// Actual Chromium mouse/keyboard checks. Application state is read, never patched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const htmlPath = process.env.RASMCAD_HTML || path.join(root, 'dist/RasmCAD-Advanced.html');
const output = path.join(root, 'build/grip-browser');
fs.mkdirSync(output, { recursive: true });
const html = fs.readFileSync(htmlPath);
const results = [], errors = [], externalRequests = [];
let browser, server, origin;
const near = (a, b, tolerance = 0.02) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

async function command(page, value = '') {
  if (value) await page.locator('#command').fill(value);
  else assert.equal(await page.locator('#command').inputValue(), '', 'blank Enter requires an empty field');
  await page.locator('#command').press('Enter');
}
async function state(page) {
  return page.evaluate(() => ({ doc: JSON.parse(RasmCAD.document.serialize()), selected: RasmCAD.selectedIds,
    tool: RasmCAD.tool, canUndo: RasmCAD.document.canUndo(), canRedo: RasmCAD.document.canRedo(),
    status: document.querySelector('#status-log').textContent }));
}
async function css(page, point) {
  const q = await page.evaluate(p => RasmCAD.worldToScreen(p), point);
  const b = await page.locator('#canvas').boundingBox();
  assert(b && q.x > 0 && q.y > 0 && q.x < b.width && q.y < b.height, 'grip is inside canvas: ' + JSON.stringify(point));
  return { x: b.x + q.x, y: b.y + q.y };
}
async function click(page, point) { const p = await css(page, point); await page.mouse.click(p.x, p.y); }
async function beginDrag(page, from, to) {
  const a = await css(page, from), b = await css(page, to);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
}
async function drag(page, from, to) { await beginDrag(page, from, to); await page.mouse.up(); }
async function line(page, a = {x:150,y:200}, b = {x:350,y:200}) {
  await command(page, 'LINE'); for (const p of [a,b]) await command(page, `${p.x},${p.y}`); await command(page);
}
async function circle(page, center = {x:350,y:200}, radius = 60) {
  await command(page, 'CIRCLE'); await command(page, `${center.x},${center.y}`); await command(page, String(radius));
}
async function dimension(page) {
  await page.locator('[data-tool="dimension"]').click();
  for (const p of [{x:150,y:150},{x:450,y:150},{x:300,y:230}]) await command(page, `${p.x},${p.y}`);
}
async function selectLabel(page, id = 1) {
  const p = await page.evaluate(id => { const e = RasmCAD.document.entities.find(e => e.id === id),
    l = RasmCore.annotationGeometry(e).labels[0], q = RasmSelection.textQuad(l);
    return {x:q.reduce((s,p)=>s+p.x,0)/q.length,y:q.reduce((s,p)=>s+p.y,0)/q.length}; }, id);
  await click(page, p); assert.deepEqual((await state(page)).selected, [id]);
}
async function setColor(page, id, color) {
  await page.locator('#' + id).evaluate((element, value) => {
    element.value = value;
    element.dispatchEvent(new Event('input', {bubbles:true}));
    element.dispatchEvent(new Event('change', {bubbles:true}));
  }, color);
}
async function test(name, fn) {
  const context = await browser.newContext({viewport:{width:1560,height:1000},acceptDownloads:true});
  await context.route('**/*', route => {
    if (route.request().url().startsWith(origin + '/')) return route.continue();
    externalRequests.push(route.request().url()); return route.abort('blockedbyclient');
  });
  const page = await context.newPage(); page.setDefaultTimeout(7000);
  page.on('dialog', dialog => dialog.accept());
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if(message.type()==='error') errors.push(message.text()); });
  try {
    await page.goto(origin + '/RasmCAD-Advanced.html', {waitUntil:'load'});
    await page.waitForFunction(() => !!window.RasmCAD && !!window.RasmGrips);
    await context.setOffline(true);
    if(await page.locator('#snap-btn').getAttribute('aria-pressed') === 'true') await page.locator('#snap-btn').click();
    await fn(page);
    results.push({name,status:'PASS'}); console.log('PASS ' + name);
  } catch(error) {
    let current; try { current = await state(page); } catch (_) { current = null; }
    const screenshot = `failure-${results.length + 1}.png`;
    await page.screenshot({path:path.join(output,screenshot),fullPage:true}).catch(()=>{});
    results.push({name,status:'FAIL',error:error.stack,state:current,screenshot});
    console.error('FAIL ' + name + ': ' + error.message);
  } finally { await context.close(); }
}

(async () => {
  server = http.createServer((req,res) => {
    if(req.url === '/favicon.ico') {res.writeHead(204);res.end();return;}
    res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(html);
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});

  await test('line endpoint drag previews without mutation and commits one undoable edit', async page => {
    await line(page); await click(page,{x:250,y:200});
    const before = await state(page); assert.deepEqual(before.selected,[1]);
    await beginDrag(page,{x:350,y:200},{x:420,y:260});
    assert.deepEqual((await state(page)).doc,before.doc,'preview must not alter serialized document');
    await page.screenshot({path:path.join(output,'line-grip-preview.png'),fullPage:true});
    await page.mouse.up();
    const after = await state(page), e = after.doc.entities[0];
    assert.deepEqual(e.points[0],before.doc.entities[0].points[0]); near(e.points[1].x,420);near(e.points[1].y,260);
    assert.equal(after.doc.entities.length,1);assert.deepEqual(after.selected,[1]);
    await page.locator('#undo-btn').click();assert.deepEqual((await state(page)).doc,before.doc);
    await page.locator('#redo-btn').click();assert.deepEqual((await state(page)).doc,after.doc);
  });

  await test('Escape cancels an in-progress grip preview without an undo entry', async page => {
    await line(page);await click(page,{x:250,y:200});const before = await state(page);
    await beginDrag(page,{x:150,y:200},{x:100,y:270});await page.keyboard.press('Escape');await page.mouse.up();
    const after = await state(page);assert.deepEqual(after.doc,before.doc);assert.equal(after.tool,'select');
    await page.locator('#undo-btn').click();assert.equal((await state(page)).doc.entities.length,0,'one Undo reaches original draw history');
  });

  await test('a selected grip click without movement leaves document and history unchanged', async page => {
    await line(page);await click(page,{x:250,y:200});const before = await state(page);
    await click(page,{x:350,y:200});assert.deepEqual((await state(page)).doc,before.doc);
    await page.locator('#undo-btn').click();assert.equal((await state(page)).doc.entities.length,0);
  });

  await test('circle cardinal grip changes only radius, previews safely and supports undo/redo', async page => {
    await circle(page);await click(page,{x:350,y:260});const before = await state(page);
    await beginDrag(page,{x:410,y:200},{x:440,y:200});assert.deepEqual((await state(page)).doc,before.doc);
    await page.mouse.up();const after = await state(page), e = after.doc.entities[0];
    near(e.radius,90);assert.deepEqual(e.points,before.doc.entities[0].points);
    const expected = structuredClone(before.doc);expected.entities[0].radius=e.radius;assert.deepEqual(after.doc,expected);
    await page.locator('#undo-btn').click();assert.deepEqual((await state(page)).doc,before.doc);
    await page.locator('#redo-btn').click();assert.deepEqual((await state(page)).doc,after.doc);
  });

  await test('circle center grip moves center while preserving radius', async page => {
    await circle(page);await click(page,{x:350,y:260});const before = await state(page);
    await drag(page,{x:350,y:200},{x:390,y:245});const e=(await state(page)).doc.entities[0];
    near(e.points[0].x,390);near(e.points[0].y,245);assert.equal(e.radius,before.doc.entities[0].radius);
  });

  await test('invalid circle radius drag cancels without corrupting geometry or history', async page => {
    await circle(page);await click(page,{x:350,y:260});const before = await state(page);
    await drag(page,{x:410,y:200},{x:350,y:200});assert.deepEqual((await state(page)).doc,before.doc);
    await page.locator('#undo-btn').click();assert.equal((await state(page)).doc.entities.length,0);
  });

  await test('styled dimension location grip changes placement while preserving measurement and every style', async page => {
    await dimension(page);await selectLabel(page);
    for(const[id,value]of Object.entries({'property-height':'20','dim-scale':'1.2','dim-arrow-size':'8','dim-precision':'3','dim-prefix':'L=','dim-suffix':' mm','dim-extension-offset':'4','dim-extension-extend':'7','dim-text-gap':'5'}))await page.locator('#'+id).fill(value);
    await page.locator('#dim-arrow-style').selectOption('tick');
    await page.locator('#dim-line-bylayer').uncheck();await setColor(page,'dim-line-color','#ff0000');
    await page.locator('#dim-text-bylayer').uncheck();await setColor(page,'dim-text-color','#00ff00');
    await page.locator('#apply-properties').click();
    const before=await state(page), measurement=await page.evaluate(()=>RasmCore.annotationGeometry(RasmCAD.document.entities[0]).measurement);
    await beginDrag(page,{x:300,y:230},{x:300,y:300});assert.deepEqual((await state(page)).doc,before.doc);
    await page.mouse.up();const after=await state(page),e=after.doc.entities[0],old=before.doc.entities[0];
    near(e.points[2].x,300);near(e.points[2].y,300);assert.deepEqual(e.points.slice(0,2),old.points.slice(0,2));
    const withoutPoints = ({points,...rest})=>rest;assert.deepEqual(withoutPoints(e),withoutPoints(old));
    near(await page.evaluate(()=>RasmCore.annotationGeometry(RasmCAD.document.entities[0]).measurement),measurement);
    await page.screenshot({path:path.join(output,'styled-dimension-grips.png'),fullPage:true});
    await page.locator('#undo-btn').click();assert.deepEqual((await state(page)).doc,before.doc);
    await page.locator('#redo-btn').click();assert.deepEqual((await state(page)).doc,after.doc);
  });

  await test('Shift-click removes selection at a grip instead of starting an edit', async page => {
    await line(page);await click(page,{x:250,y:200});const before = await state(page);
    await page.keyboard.down('Shift');await click(page,{x:350,y:200});await page.keyboard.up('Shift');
    const after=await state(page);assert.deepEqual(after.selected,[]);assert.deepEqual(after.doc,before.doc);
    await page.locator('#undo-btn').click();assert.equal((await state(page)).doc.entities.length,0);
  });

  await test('real save download and file-input reopen retain completed grip edits', async page => {
    await line(page);await click(page,{x:250,y:200});await drag(page,{x:350,y:200},{x:420,y:270});
    await page.keyboard.press('Escape');await circle(page,{x:550,y:200},40);await click(page,{x:550,y:240});await drag(page,{x:590,y:200},{x:620,y:200});
    const edited=(await state(page)).doc;
    const event=page.waitForEvent('download');await page.locator('#save-btn').click();const download=await event;
    const savedPath=path.join(output,'grip-edits.rasm.json');await download.saveAs(savedPath);assert.equal(await download.failure(),null);
    const saved=JSON.parse(fs.readFileSync(savedPath,'utf8'));assert.deepEqual(saved.entities,edited.entities);
    await page.locator('#new-btn').click();assert.equal((await state(page)).doc.entities.length,0);
    await page.locator('#file-input').setInputFiles(savedPath);
    await page.waitForFunction(()=>RasmCAD.document.entities.length===2&&!document.querySelector('#open-btn').disabled);
    const reopened=(await state(page)).doc;assert.deepEqual(reopened.entities,edited.entities);assert.deepEqual(reopened.layers,edited.layers);
    await page.mouse.move(5,5);await page.screenshot({path:path.join(output,'reopened-grip-edits.png'),fullPage:true});
  });

  assert.deepEqual(errors,[],'no browser console or uncaught errors');assert.deepEqual(externalRequests,[],'no external network requests');
})().catch(error=>{results.push({name:'harness',status:'FAIL',error:error.stack});console.error(error);}).finally(async()=>{
  const report={html:htmlPath,bytes:html.length,sha256:crypto.createHash('sha256').update(html).digest('hex'),browser:browser?.version(),
    method:'Exact standalone HTML served by allowed localhost HTTP; browser context offline for all CAD operations. No browser policies changed. All CAD mutations use actual controls/mouse/keyboard; RasmCAD getters only read.',
    results,errors,externalRequests};
  fs.writeFileSync(path.join(output,'grip-browser-results.json'),JSON.stringify(report,null,2)+'\n');
  if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
  const failed=results.filter(r=>r.status==='FAIL');console.log(`${results.length-failed.length}/${results.length} grip browser checks passed`);if(failed.length)process.exitCode=1;
});
