/* Real browser UI verification. Run: node tests/browser.test.cjs */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const artifactDir = path.join(root, 'build', 'browser-artifacts');
const htmlPath = process.env.RASMCAD_HTML || path.join(root, 'dist', 'RasmCAD-Advanced.html');
const results = [];
const errors = [];
const externalRequests = [];
let browser, server, context, lastPage;
let fileProtocolVerified = false;
let origin;

function pass(message) { results.push(`PASS: ${message}`); console.log(results.at(-1)); }
function nativeDoc(value) {
  const doc = value.document || value.drawing || value;
  assert(Array.isArray(doc.entities), 'saved JSON must expose editable entities');
  assert(Array.isArray(doc.layers), 'saved JSON must expose editable layers');
  return doc;
}
async function count(page, expected) {
  await page.waitForFunction(n => Number(document.querySelector('#entity-count')?.textContent) === n, expected);
  assert.equal(Number(await page.locator('#entity-count').innerText()), expected);
}
async function command(page, text) {
  if(text) await page.locator('#command').fill(text);
  await page.locator('#command').press('Enter');
}
async function point(page, worldPoint) {
  const css = await page.evaluate(p => window.RasmCAD.worldToScreen(p), worldPoint);
  const box = await page.locator('#canvas').boundingBox();
  assert(box, 'canvas is visible');
  await page.mouse.click(box.x + css.x, box.y + css.y);
}
async function entityPoints(page, id) {
  return page.evaluate(id => window.RasmCAD.document.entities.find(e => e.id === id).points, id);
}
function pointsNear(actual, expected) {
  assert.equal(actual.length, expected.length);
  actual.forEach((p, i) => {
    assert(Math.abs(p.x - expected[i].x) < 1e-7, `point ${i} X: ${p.x} versus ${expected[i].x}`);
    assert(Math.abs(p.y - expected[i].y) < 1e-7, `point ${i} Y: ${p.y} versus ${expected[i].y}`);
  });
}
async function download(page, button, filename) {
  const pending = page.waitForEvent('download');
  await page.locator(button).click();
  const file = await pending;
  const output = path.join(artifactDir, filename || file.suggestedFilename());
  await file.saveAs(output);
  assert.equal(await file.failure(), null, 'browser download completed');
  return output;
}
async function attachChecks(page) {
  lastPage = page;
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('dialog', dialog => dialog.accept());
  await page.route(/^https?:\/\//, route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname === '/favicon.ico') return route.fulfill({ status: 204, body: '' });
    if (url.origin === origin) return route.continue();
    externalRequests.push(url.href);
    return route.abort('blockedbyclient');
  });
}

(async () => {
  fs.mkdirSync(artifactDir, { recursive: true });
  assert(fs.existsSync(htmlPath), `build the standalone HTML first: ${htmlPath}`);
  const source = fs.readFileSync(htmlPath, 'utf8');
  assert(!/<script\b[^>]*\bsrc\s*=/i.test(source), 'standalone file contains no external script reference');
  assert(!/<link\b[^>]*\bhref\s*=\s*["']https?:/i.test(source), 'standalone file contains no external stylesheet');
  pass('standalone HTML has no external script or HTTP stylesheet dependencies');

  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  results.push(`Browser: Chromium ${browser.version()}; viewport 1440x1000 and 390x844`);
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const probe = await context.newPage();
  try {
    await probe.goto(pathToFileURL(htmlPath).href);
    fileProtocolVerified = true;
    origin = 'null';
    pass('standalone application loads directly through file://');
  } catch (error) {
    if (!String(error).includes('ERR_BLOCKED_BY_ADMINISTRATOR')) throw error;
    results.push('LIMITATION: this QA environment blocks file:// URLs by managed Chromium policy; tested the exact standalone file through allowed loopback HTTP instead. No browser policy was changed.');
    server = http.createServer((req, res) => {
      if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      if (req.url !== '/' && req.url !== '/RasmCAD-Browser.html') { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(source);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
  }
  await probe.close();
  const page = await context.newPage();
  await attachChecks(page);
  await page.goto(fileProtocolVerified ? pathToFileURL(htmlPath).href : `${origin}/RasmCAD-Browser.html`);
  await page.locator('#canvas').waitFor({ state: 'visible' });
  await context.setOffline(true);
  await page.locator('#new-btn').click();
  await count(page, 0);
  pass('application starts with visible canvas and can create a blank drawing while offline');

  await page.locator('[data-tool="line"]').click();
  await command(page, '0,0');
  await command(page, '100,0');
  await command(page, '');
  await count(page, 1);
  await page.locator('[data-tool="rectangle"]').click();
  await command(page, '0,30');
  await command(page, '100,90');
  await count(page, 2);
  await page.locator('[data-tool="circle"]').click();
  await command(page, '200,80');
  await command(page, '30');
  await count(page, 3);
  await page.locator('[data-tool="arc"]').click();
  await command(page, '300,80');
  await command(page, '330,80');
  await command(page, '300,110');
  await count(page, 4);
  await page.locator('[data-tool="text"]').click();
  await command(page, '0,130');
  await command(page, 'غرفة اختبار — Test room');
  await count(page, 5);
  await page.locator('[data-tool="dimension"]').click();
  await command(page, '0,0');
  await command(page, '100,0');
  await command(page, '50,-25');
  await count(page, 6);
  await page.locator('[data-tool="polyline"]').click();
  await command(page, '0,200');
  await command(page, '@50,0');
  await command(page, '@0,30');
  await command(page, 'C');
  await count(page, 7);
  pass('actual toolbar and command-field input draw line, rectangle, circle, arc, Arabic text, dimension and closed polyline');

  await page.locator('#layer-name').fill('الجدران العربية');
  await page.locator('#add-layer-btn').click();
  assert.equal(await page.locator('#layer-select').inputValue(), 'الجدران العربية');
  await page.locator('#fit-btn').click();
  await page.locator('[data-tool="line"]').click();
  await point(page, { x: 150, y: 180 });
  await point(page, { x: 240, y: 180 });
  await command(page, '');
  await count(page, 8);
  pass('actual canvas mouse input draws a line on an Arabic-named layer');

  await page.locator('#undo-btn').click(); await count(page, 7);
  await page.locator('#redo-btn').click(); await count(page, 8);
  await page.locator('[data-tool="select"]').click();
  await point(page, { x: 195, y: 180 });
  assert.equal(Number(await page.locator('#selection-count').innerText()), 1);
  await page.locator('#delete-btn').click(); await count(page, 7);
  await page.locator('#undo-btn').click(); await count(page, 8);
  pass('selection, delete, undo and redo change the editable drawing correctly');

  await point(page, { x: 195, y: 180 });
  const selectedId = await page.evaluate(() => window.RasmCAD.selectedIds[0]);
  assert(selectedId, 'actual mouse selects the drawn line');
  const initialPoints = await entityPoints(page, selectedId);
  await page.locator('[data-tool="move"]').click();
  await command(page, '0,0'); await command(page, '@20,15');
  const movedPoints = initialPoints.map(p => ({ x: p.x + 20, y: p.y + 15 }));
  pointsNear(await entityPoints(page, selectedId), movedPoints);
  await page.locator('[data-tool="copy"]').click();
  await command(page, '0,0'); await command(page, '@30,10'); await count(page, 9);
  const copiedId = await page.evaluate(() => window.RasmCAD.selectedIds[0]);
  assert.notEqual(copiedId, selectedId);
  pointsNear(await entityPoints(page, copiedId), movedPoints.map(p => ({ x: p.x + 30, y: p.y + 10 })));
  await command(page); // M1 COPY repeats until Enter; next Undo is standalone.
  await page.locator('#undo-btn').click(); await count(page, 8);

  const movedMidpoint = { x: (movedPoints[0].x + movedPoints[1].x) / 2, y: (movedPoints[0].y + movedPoints[1].y) / 2 };
  await point(page, movedMidpoint);
  await page.locator('[data-tool="rotate"]').click();
  await command(page, '0,0'); await command(page, '90');
  pointsNear(await entityPoints(page, selectedId), movedPoints.map(p => ({ x: -p.y, y: p.x })));
  await page.locator('#undo-btn').click();
  await point(page, movedMidpoint);
  await page.locator('[data-tool="scale"]').click();
  await command(page, '0,0'); await command(page, '2');
  pointsNear(await entityPoints(page, selectedId), movedPoints.map(p => ({ x: p.x * 2, y: p.y * 2 })));
  await page.locator('#undo-btn').click(); await count(page, 8);
  pass('actual mouse selection plus toolbar/command input move, copy, rotate and scale exact geometry; undo restores it');

  await page.locator('[data-tool="line"]').click();
  const nearCenter = await page.evaluate(() => window.RasmCAD.worldToScreen({ x: 200, y: 80 }));
  const snapCanvas = await page.locator('#canvas').boundingBox();
  await page.mouse.click(snapCanvas.x + nearCenter.x + 3, snapCanvas.y + nearCenter.y + 2);
  await point(page, { x: 250, y: 120 }); await command(page, ''); await count(page, 9);
  const snappedFirst = await page.evaluate(() => window.RasmCAD.document.entities.at(-1).points[0]);
  pointsNear([snappedFirst], [{ x: 200, y: 80 }]);
  await page.locator('#undo-btn').click(); await count(page, 8);
  await page.locator('#snap-btn').click();
  assert.equal(await page.locator('#snap-btn').getAttribute('aria-pressed'), 'false');
  await page.locator('#ortho-btn').click();
  assert.equal(await page.locator('#ortho-btn').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-tool="line"]').click();
  await point(page, { x: 250, y: 200 }); await point(page, { x: 310, y: 230 });
  await command(page, ''); await count(page, 9);
  const orthogonal = await page.evaluate(() => window.RasmCAD.document.entities.at(-1).points);
  assert(Math.abs(orthogonal[0].y - orthogonal[1].y) < 1e-9, 'ortho constrains actual mouse input to horizontal');
  assert(orthogonal[1].x > orthogonal[0].x);
  await page.locator('#undo-btn').click(); await count(page, 8);
  await page.locator('#ortho-btn').click(); await page.locator('#snap-btn').click();
  pass('object-snap captures an existing circle center and ortho constrains actual mouse input');

  const savedPath = await download(page, '#save-btn', 'drawn.rasm.json');
  const saved = nativeDoc(JSON.parse(fs.readFileSync(savedPath, 'utf8')));
  assert.equal(saved.entities.length, 8);
  assert(JSON.stringify(saved).includes('غرفة اختبار'));
  assert(JSON.stringify(saved.layers).includes('الجدران العربية'));
  await page.screenshot({ path: path.join(artifactDir, 'desktop-drawing.png'), fullPage: true });
  await page.locator('#new-btn').click(); await count(page, 0);
  await page.locator('#file-input').setInputFiles(savedPath); await count(page, 8);
  const reopenedPath = await download(page, '#save-btn', 'reopened.rasm.json');
  const reopened = nativeDoc(JSON.parse(fs.readFileSync(reopenedPath, 'utf8')));
  assert.deepEqual(reopened.entities, saved.entities);
  assert.deepEqual(reopened.layers, saved.layers);
  await page.locator('[data-tool="circle"]').click();
  await command(page, '500,200'); await command(page, '10'); await count(page, 9);
  await page.locator('#undo-btn').click(); await count(page, 8);
  pass('real JSON download, clear, file-input reopen preserve exact geometry/layers/Arabic and remain editable');

  const beforeMalformed = await page.evaluate(() => window.RasmCAD.document.serialize());
  await page.locator('#file-input').setInputFiles({ name: 'malformed.rasm.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"RasmCAD Browser",invalid') });
  await page.waitForFunction(() => document.querySelector('#status-log').textContent.includes('current drawing was preserved'));
  await count(page, 8);
  assert.equal(await page.evaluate(() => window.RasmCAD.document.serialize()), beforeMalformed);
  pass('malformed file input displays an error and preserves the entire current document');

  const dxfPath = await download(page, '#dxf-btn', 'drawing.dxf');
  const dxf = fs.readFileSync(dxfPath, 'utf8');
  assert(/\bENTITIES\b/.test(dxf) && /\bEOF\b/.test(dxf));
  assert(/\bLINE\b/.test(dxf) && /\bCIRCLE\b/.test(dxf) && /\bARC\b/.test(dxf));
  pass('DXF export creates a real downloaded drawing with expected entity records');
  const pngPath = await download(page, '#png-btn', 'drawing.png');
  assert.equal(fs.readFileSync(pngPath).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  pass('PNG export creates a valid PNG download');

  const legacyPath = path.join(root, 'tests', 'fixtures', 'legacy-arabic.rcad');
  if (fs.existsSync(legacyPath)) {
    await page.locator('#file-input').setInputFiles(legacyPath); await count(page, 7);
    const legacySaved = nativeDoc(JSON.parse(fs.readFileSync(await download(page, '#save-btn', 'legacy-import.rasm.json'), 'utf8')));
    assert(JSON.stringify(legacySaved).includes('غرفة مكتب'));
    assert(JSON.stringify(legacySaved.layers).includes('الجدران'));
    pass('actual legacy Windows .rcad file imports seven editable entities with Arabic text/layers');
  }

  await page.locator('#example-btn').click();
  const sampleCount = Number(await page.locator('#entity-count').innerText());
  assert(sampleCount > 20, 'example contains substantive editable geometry');
  await page.screenshot({ path: path.join(artifactDir, 'desktop-example.png'), fullPage: true });
  pass(`example drawing renders ${sampleCount} editable entities at desktop size`);

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage();
  await attachChecks(mobile);
  await mobile.goto(fileProtocolVerified ? pathToFileURL(htmlPath).href : `${origin}/RasmCAD-Browser.html`);
  await mobileContext.setOffline(true);
  await mobile.locator('#example-btn').click();
  const mobileBox = await mobile.locator('#canvas').boundingBox();
  assert(mobileBox && mobileBox.width >= 250 && mobileBox.height >= 200, 'canvas remains useful at narrow width');
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
  assert.equal(overflow, false, 'narrow layout has no horizontal page overflow');
  await mobile.screenshot({ path: path.join(artifactDir, 'mobile-example.png'), fullPage: true });
  if (await mobile.locator('#layers-toggle').isVisible()) {
    await mobile.locator('#layers-toggle').click();
    assert(await mobile.locator('#sidebar').isVisible(), 'narrow screen layer drawer opens');
    await mobile.screenshot({ path: path.join(artifactDir, 'mobile-layers.png'), fullPage: true });
  }
  await mobileContext.close();
  pass('390px narrow-screen layout has usable canvas and no horizontal page overflow');

  assert.deepEqual(externalRequests, [], 'no external network requests');
  assert.deepEqual(errors, [], 'no application console or uncaught JavaScript errors');
  pass('all drawing/save/reopen/export interactions worked with browser networking offline; no external requests or JavaScript errors');
  results.push(`RESULT: PASS\nDirect file:// navigation verified: ${fileProtocolVerified ? 'yes' : 'no; managed environment policy blocks file URLs'}`);
})().catch(async error => {
  console.error(error);
  results.push(`RESULT: FAIL\n${error.stack}`);
  if (lastPage && !lastPage.isClosed()) await lastPage.screenshot({ path: path.join(artifactDir, 'failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
}).finally(async () => {
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, 'browser-results.txt'), results.join('\n') + '\n');
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
