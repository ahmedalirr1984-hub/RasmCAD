'use strict';
// Real mouse/keyboard regression checks. No test mutates application state.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const htmlPath = process.env.RASMCAD_HTML || path.join(root, 'dist', 'RasmCAD-Advanced.html');
const phase = process.env.RASMCAD_PHASE || 'after';
const output = path.join(root, 'build', 'interaction-artifacts');
fs.mkdirSync(output, { recursive: true });
const results = [], pageErrors = [], externalRequests = [];
let browser, server, context, origin;
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

async function cmd(page, value = '') {
  // fill('') emits Delete in Playwright; an empty CAD command deliberately uses
  // Delete as ERASE. A real blank Enter must not introduce that extra keystroke.
  if (value) await page.locator('#command').fill(value);
  else assert.equal(await page.locator('#command').inputValue(), '', 'blank Enter requires an empty command field');
  await page.locator('#command').press('Enter');
}
async function state(page) {
  return page.evaluate(() => ({ tool: RasmCAD.tool, ids: RasmCAD.selectedIds, doc: JSON.parse(RasmCAD.document.serialize()), prompt: document.querySelector('#prompt').textContent, status: document.querySelector('#status-log').textContent }));
}
async function cssPoint(page, p) {
  const q = await page.evaluate(p => RasmCAD.worldToScreen(p), p);
  const box = await page.locator('#canvas').boundingBox();
  assert.ok(box && q.x >= 0 && q.y >= 0 && q.x <= box.width && q.y <= box.height, `world point is visible: ${JSON.stringify(p)}`);
  return { x: box.x + q.x, y: box.y + q.y };
}
async function point(page, p, options = {}) {
  const q = await cssPoint(page, p); await page.mouse.click(q.x, q.y, options);
}
async function drag(page, a, b) {
  const from = await cssPoint(page, a), to = await cssPoint(page, b);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 }); await page.mouse.up();
}
async function drawLine(page, a, b) {
  await cmd(page, 'LINE'); await cmd(page, `${a.x},${a.y}`); await cmd(page, `${b.x},${b.y}`); await cmd(page);
}
async function drawText(page, p, text) {
  await cmd(page, 'TEXT'); await cmd(page, `${p.x},${p.y}`); await cmd(page, text);
}
async function explicitColor(page, color) {
  if (await page.locator('#property-bylayer').count()) await page.locator('#property-bylayer').uncheck();
  await page.locator('#property-color').fill(color);
}
async function chooseSelection(page) {
  await page.locator('[data-tool="select"]').click();
  if (await page.locator('#selection-mode').count()) {
    const element = await page.locator('#selection-mode').evaluate(el => ({ tag: el.tagName, options: Array.from(el.options || []).map(o => ({ value: o.value, label: o.textContent })) }));
    if (element.tag === 'SELECT') {
      const additive = element.options.find(o => /add/i.test(o.value + ' ' + o.label));
      if (additive) await page.locator('#selection-mode').selectOption(additive.value);
    }
  }
}
async function fresh() {
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('dialog', dialog => dialog.accept());
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.RasmCAD);
  if (await page.locator('#snap-btn').getAttribute('aria-pressed') === 'true') await page.locator('#snap-btn').click();
  return page;
}
async function test(name, fn) {
  if (process.env.RASMCAD_TEST_PATTERN && !new RegExp(process.env.RASMCAD_TEST_PATTERN, 'i').test(name)) return;
  const page = await fresh();
  try {
    await fn(page);
    results.push({ name, status: 'PASS' }); console.log(`PASS ${name}`);
  } catch (error) {
    let current = null; try { current = await state(page); } catch (_) { /* capture the original failure */ }
    const screenshot = `${phase}-${String(results.length + 1).padStart(2, '0')}.png`;
    await page.screenshot({ path: path.join(output, screenshot), fullPage: true }).catch(() => {});
    results.push({ name, status: 'FAIL', error: error.message, state: current, screenshot });
    console.error(`FAIL ${name}: ${error.message}`);
  } finally { await page.close(); }
}

(async () => {
  const html = fs.readFileSync(htmlPath);
  server = http.createServer((req, res) => {
    if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  context = await browser.newContext({ viewport: { width: 1560, height: 1100 }, acceptDownloads: true });
  await context.route('**/*', route => {
    if (route.request().url().startsWith(origin + '/')) return route.continue();
    externalRequests.push(route.request().url()); return route.abort('blockedbyclient');
  });

  for (const finish of ['Enter', 'Escape', 'rightclick']) await test(`LINE mouse drawing finishes with ${finish} and preserves completed segment`, async page => {
    await page.locator('[data-tool="line"]').click();
    await point(page, { x: 200, y: 200 }); await point(page, { x: 350, y: 200 });
    let s = await state(page); assert.equal(s.doc.entities.length, 1); assert.equal(s.tool, 'line');
    if (finish === 'rightclick') await point(page, { x: 400, y: 250 }, { button: 'right' });
    else await page.keyboard.press(finish);
    s = await state(page); assert.equal(s.tool, 'select'); assert.equal(s.doc.entities.length, 1);
    near(s.doc.entities[0].points[0].x, 200, 1); near(s.doc.entities[0].points[1].x, 350, 1);
    await point(page, { x: 400, y: 200 });
    assert.equal((await state(page)).doc.entities.length, 1, 'finish must not leave an active rubber-band segment');
  });

  await test('CIRCLE finishes on second mouse click with measured positive radius', async page => {
    await page.locator('[data-tool="circle"]').click();
    await point(page, { x: 250, y: 200 }); await point(page, { x: 300, y: 200 });
    const s = await state(page); assert.equal(s.tool, 'select'); assert.equal(s.doc.entities.length, 1);
    assert.equal(s.doc.entities[0].kind, 'circle'); near(s.doc.entities[0].radius, 50, 1);
  });
  await test('CIRCLE accepts numeric radius after mouse center and returns to selection', async page => {
    await page.locator('[data-tool="circle"]').click(); await point(page, { x: 250, y: 200 });
    await cmd(page, '37.5'); const s = await state(page);
    assert.equal(s.tool, 'select'); assert.equal(s.doc.entities.length, 1); near(s.doc.entities[0].radius, 37.5);
  });
  await test('CIRCLE Finish commits the visible radius preview after its center was picked', async page => {
    await page.locator('[data-tool="circle"]').click(); await point(page, { x: 250, y: 200 });
    const preview = await cssPoint(page, { x: 310, y: 200 }); await page.mouse.move(preview.x, preview.y);
    await page.locator('#finish-btn').click(); const s = await state(page);
    assert.equal(s.tool, 'select'); assert.equal(s.doc.entities.length, 1); near(s.doc.entities[0].radius, 60, 1);
  });

  await test('plain SELECT clicks accumulate objects and Shift-click removes only the picked object', async page => {
    await drawLine(page, { x: 150, y: 220 }, { x: 250, y: 220 });
    await drawLine(page, { x: 350, y: 220 }, { x: 450, y: 220 });
    await chooseSelection(page); await point(page, { x: 200, y: 220 }); await point(page, { x: 400, y: 220 });
    let s = await state(page); assert.equal(s.ids.length, 2, 'second click should add instead of silently replacing');
    await page.keyboard.down('Shift'); await point(page, { x: 200, y: 220 }); await page.keyboard.up('Shift');
    s = await state(page); assert.deepEqual(s.ids, [s.doc.entities[1].id]);
  });

  await test('left-to-right window selects fully contained objects and excludes partial intersections', async page => {
    await drawLine(page, { x: 150, y: 220 }, { x: 250, y: 220 });
    await drawLine(page, { x: 300, y: 220 }, { x: 450, y: 220 });
    await chooseSelection(page); await drag(page, { x: 130, y: 240 }, { x: 340, y: 200 });
    const s = await state(page); assert.deepEqual(s.ids, [s.doc.entities[0].id]);
  });
  await test('right-to-left crossing selects a line intersected by the window', async page => {
    await drawLine(page, { x: 150, y: 220 }, { x: 450, y: 220 });
    await chooseSelection(page); await drag(page, { x: 340, y: 240 }, { x: 300, y: 200 });
    const s = await state(page); assert.deepEqual(s.ids, [s.doc.entities[0].id], 'crossing must select intersections without containing the full bounds');
  });
  await test('crossing a circle bounding box without touching the circle leaves it unselected', async page => {
    await cmd(page, 'CIRCLE'); await cmd(page, '300,220'); await cmd(page, '50');
    await chooseSelection(page); await drag(page, { x: 256, y: 269 }, { x: 251, y: 264 });
    assert.deepEqual((await state(page)).ids, [], 'crossing selection must test actual geometry instead of a bounding box alone');
  });

  await test('MOVE command before selection accepts picks, Enter confirms, and base/displacement move geometry once', async page => {
    await drawLine(page, { x: 150, y: 220 }, { x: 250, y: 220 });
    await page.keyboard.press('Escape'); await cmd(page, 'MOVE');
    let s = await state(page); assert.equal(s.tool, 'move', 'command-first edit must wait for selection');
    await point(page, { x: 200, y: 220 }); await cmd(page);
    s = await state(page); assert.equal(s.tool, 'move'); assert.equal(s.ids.length, 1);
    await cmd(page, '0,0'); await cmd(page, '@25,15');
    s = await state(page); assert.equal(s.tool, 'select'); assert.equal(s.doc.entities.length, 1);
    near(s.doc.entities[0].points[0].x, 175); near(s.doc.entities[0].points[0].y, 235);
    near(s.doc.entities[0].points[1].x, 275); near(s.doc.entities[0].points[1].y, 235);
    await page.locator('#undo-btn').click(); s = await state(page);
    near(s.doc.entities[0].points[0].x, 150); near(s.doc.entities[0].points[0].y, 220);
  });
  await test('Enter after selecting an object does not repeat the previous drawing command', async page => {
    await cmd(page, 'CIRCLE'); await cmd(page, '300,220'); await cmd(page, '50');
    await chooseSelection(page); await point(page, { x: 350, y: 220 }); await cmd(page);
    const s = await state(page); assert.equal(s.ids.length, 1); assert.equal(s.tool, 'select');
    assert.equal(s.doc.entities.length, 1);
  });
  await test('ERASE command before selection confirms picked objects with Enter and supports undo', async page => {
    await drawLine(page, { x: 150, y: 220 }, { x: 250, y: 220 });
    assert.equal((await state(page)).doc.entities.length, 1);
    await page.keyboard.press('Escape'); await cmd(page, 'ERASE');
    assert.equal((await state(page)).tool, 'erase', 'ERASE should acquire a selection before editing');
    await point(page, { x: 200, y: 220 }); await cmd(page);
    assert.equal((await state(page)).doc.entities.length, 0);
    await page.locator('#undo-btn').click(); assert.equal((await state(page)).doc.entities.length, 1);
  });
  await test('COPY command before selection confirms picks and creates one translated independent copy', async page => {
    await drawLine(page, { x: 150, y: 220 }, { x: 250, y: 220 });
    await page.keyboard.press('Escape'); await cmd(page, 'COPY');
    assert.equal((await state(page)).tool, 'copy');
    await point(page, { x: 200, y: 220 }); await cmd(page); await cmd(page, '0,0'); await cmd(page, '@0,50');
    const s = await state(page); assert.equal(s.doc.entities.length, 2);
    near(s.doc.entities[0].points[0].y, 220); near(s.doc.entities[1].points[0].y, 270);
  });

  await test('multi-selection linewidth edit preserves each object color, text, height and layer', async page => {
    await drawText(page, { x: 150, y: 220 }, 'Alpha');
    await chooseSelection(page); await point(page, { x: 155, y: 224 });
    await explicitColor(page, '#ff0000'); await page.locator('#property-height').fill('10');
    await page.locator('#apply-properties').click(); await page.keyboard.press('Escape');
    await page.locator('#layer-name').fill('Second layer'); await page.locator('#add-layer-btn').click();
    await drawText(page, { x: 350, y: 220 }, 'Beta');
    await chooseSelection(page); await point(page, { x: 355, y: 224 });
    await explicitColor(page, '#00ff00'); await page.locator('#property-height').fill('20');
    await page.locator('#apply-properties').click(); await page.keyboard.press('Escape');
    const before = (await state(page)).doc.entities;
    await chooseSelection(page); await point(page, { x: 155, y: 224 });
    await page.keyboard.down('Control'); await point(page, { x: 355, y: 224 }); await page.keyboard.up('Control');
    assert.equal((await state(page)).ids.length, 2);
    await page.locator('#property-linewidth').fill('3'); await page.locator('#apply-properties').click();
    const after = (await state(page)).doc.entities;
    for (let i = 0; i < 2; i++) {
      assert.equal(after[i].lineWidth, 3);
      for (const key of ['color', 'text', 'textHeight', 'layer']) assert.deepEqual(after[i][key], before[i][key], `unchanged ${key} of object ${i}`);
    }
    await page.locator('#fit-btn').click();
    await page.screenshot({ path: path.join(output, `${phase}-preserved-properties.png`), fullPage: true });
    await page.locator('#undo-btn').click(); assert.deepEqual((await state(page)).doc.entities, before);
  });

  await test('visible Finish and Cancel controls complete or cancel pending drawing without adding stray geometry', async page => {
    await page.locator('[data-tool="line"]').click(); await point(page, { x: 200, y: 200 }); await point(page, { x: 300, y: 200 });
    await page.locator('#finish-btn').click(); assert.equal((await state(page)).tool, 'select');
    await page.locator('[data-tool="circle"]').click(); await point(page, { x: 400, y: 200 });
    await page.locator('#cancel-btn').click(); const s = await state(page);
    assert.equal(s.tool, 'select'); assert.equal(s.doc.entities.length, 1);
  });
  await test('double-click completes a LINE chain without creating a zero-length duplicate', async page => {
    await page.locator('[data-tool="line"]').click(); await point(page, { x: 150, y: 200 }); await point(page, { x: 250, y: 200 });
    const q = await cssPoint(page, { x: 350, y: 200 }); await page.mouse.dblclick(q.x, q.y);
    const s = await state(page); assert.equal(s.tool, 'select'); assert.equal(s.doc.entities.length, 2);
    assert.ok(s.doc.entities.every(e => Math.hypot(e.points[1].x - e.points[0].x, e.points[1].y - e.points[0].y) > 1));
  });
  await test('LINE U removes the latest chain segment while keeping the command ready for the next point', async page => {
    await cmd(page, 'LINE'); await cmd(page, '150,200'); await cmd(page, '250,200'); await cmd(page, '250,300');
    await cmd(page, 'U'); let s = await state(page); assert.equal(s.tool, 'line'); assert.equal(s.doc.entities.length, 1);
    await cmd(page, '350,200'); await cmd(page); s = await state(page);
    assert.equal(s.doc.entities.length, 2); near(s.doc.entities[1].points[0].x, 250); near(s.doc.entities[1].points[1].x, 350);
  });

  const failed = results.filter(r => r.status === 'FAIL').length;
  if (pageErrors.length) results.push({ name: 'browser console/runtime errors', status: 'FAIL', errors: pageErrors });
  if (externalRequests.length) results.push({ name: 'unexpected external requests', status: 'FAIL', requests: externalRequests });
  const report = { phase, htmlPath, chromium: browser.version(), tests: results.length, passed: results.filter(r => r.status === 'PASS').length, failed: results.filter(r => r.status === 'FAIL').length, pageErrors, externalRequests, results, limitation: 'Exact HTML served through allowed loopback HTTP because this environment blocks file URLs. No browser or Windows policies changed.' };
  fs.writeFileSync(path.join(output, `${phase}-results.json`), JSON.stringify(report, null, 2));
  console.log(`RESULT ${report.failed ? 'FAIL' : 'PASS'}: ${report.passed} passed, ${report.failed} failed; runtime errors=${pageErrors.length}, external requests=${externalRequests.length}`);
  process.exitCode = failed || pageErrors.length || externalRequests.length ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve));
});
