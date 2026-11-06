'use strict';
// Browser command workflows use only real input/form/mouse events. RasmCAD is
// read for assertions; no fixture is inserted or command executed through its API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const htmlPath = process.env.RASMCAD_HTML || path.join(root, 'dist/RasmCAD-Advanced.html');
const expectedVersion = process.env.RASMCAD_EXPECT_VERSION || '0.5';
const output = path.resolve(root, process.env.RASMCAD_OUTPUT || 'build/command-ui-v05');
fs.mkdirSync(output, { recursive: true });
const results = [], pageErrors = [], externalRequests = [];
let browser, server, context, origin;
const near = (actual, expected, tolerance = .6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not near ${expected}`);
async function state(page) {
  return page.evaluate(() => ({
    version: RasmCAD.version, tool: RasmCAD.tool,
    doc: JSON.parse(RasmCAD.document.serialize()),
    prompt: document.querySelector('#prompt').textContent,
    status: document.querySelector('#status-log').textContent,
    history: document.querySelector('#command-history').textContent,
    selected: RasmCAD.selectedIds,
    offline: !navigator.onLine,
    errorBanner: !document.querySelector('#errors-banner').hidden
  }));
}
async function command(page, value) {
  const input = page.locator('#command');
  if (value !== undefined) {
    assert.notEqual(value, '', 'blank Enter must not synthesize Playwright fill/Delete');
    await input.fill(value);
  } else assert.equal(await input.inputValue(), '', 'blank Enter requires an empty field');
  await input.press('Enter');
}
async function hover(page, world) {
  const point = await page.evaluate(p => RasmCAD.worldToScreen(p), world);
  const box = await page.locator('#canvas').boundingBox();
  assert.ok(box && point.x >= 0 && point.y >= 0 && point.x < box.width && point.y < box.height, 'hover point must be in view');
  await page.mouse.move(box.x + point.x, box.y + point.y);
}
async function fresh() {
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on('dialog', dialog => dialog.accept());
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
  await context.setOffline(false);
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(version => window.RasmCAD?.version === version, expectedVersion);
  await context.setOffline(true);
  if (await page.locator('#snap-btn').getAttribute('aria-pressed') === 'true') await page.locator('#snap-btn').click();
  assert.equal((await state(page)).offline, true, 'all command interactions run with the browser offline');
  return page;
}
async function test(name, fn) {
  if (process.env.RASMCAD_TEST_PATTERN && !new RegExp(process.env.RASMCAD_TEST_PATTERN, 'i').test(name)) return;
  const page = await fresh();
  try {
    await fn(page);
    assert.equal((await state(page)).errorBanner, false, 'no unexpected-error banner');
    results.push({ name, status: 'PASS' });
    console.log('PASS ' + name);
  } catch (error) {
    let current;
    try { current = await state(page); } catch (_) { /* preserve original failure */ }
    const screenshot = String(results.length + 1).padStart(2, '0') + '.png';
    await page.screenshot({ path: path.join(output, screenshot), fullPage: true }).catch(() => {});
    results.push({ name, status: 'FAIL', error: error.message, state: current, screenshot });
    console.error('FAIL ' + name + ': ' + error.message);
  } finally { await page.close(); }
}

(async () => {
  const html = fs.readFileSync(htmlPath);
  const htmlSha256 = crypto.createHash('sha256').update(html).digest('hex');
  server = http.createServer((request, response) => {
    if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1.25, acceptDownloads: true });
  await context.route('**/*', route => {
    if (route.request().url().startsWith(origin + '/')) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort('blockedbyclient');
  });

  await test('bundled offline startup exposes every CAD module and version ' + expectedVersion, async page => {
    const modules = await page.evaluate(() => ['RasmCore', 'RasmEdit', 'RasmIO', 'RasmSelection', 'RasmGrips', 'RasmCommands', 'RasmView'].map(name => ({ name, available: !!window[name] })));
    assert.ok(modules.every(module => module.available), JSON.stringify(modules));
    assert.equal((await state(page)).version, expectedVersion);
    assert.ok((await page.title()).endsWith('RasmCAD Advanced ' + expectedVersion));
  });

  await test('one Enter advances LINE once; default scalar direction is +X and blank Enter finishes', async page => {
    await command(page, 'LINE');
    let s = await state(page);
    assert.equal(s.tool, 'line'); assert.match(s.prompt, /first point/i); assert.equal(s.doc.entities.length, 0);
    await command(page, '180,240');
    s = await state(page);
    assert.equal(s.tool, 'line'); assert.equal(s.doc.entities.length, 0); assert.match(s.prompt, /next point|length/i);
    await command(page, '100');
    s = await state(page);
    assert.equal(s.tool, 'line', 'one scalar Enter commits a segment without also finishing LINE');
    assert.equal(s.doc.entities.length, 1); near(s.doc.entities[0].points[1].x, 280, 1e-8); near(s.doc.entities[0].points[1].y, 240, 1e-8);
    assert.equal((s.history.match(/Command: 100/g) || []).length, 1, 'one actual Enter records one command submission');
    await command(page);
    s = await state(page); assert.equal(s.tool, 'select'); assert.equal(s.doc.entities.length, 1, 'finish does not add a ghost segment');
  });

  await test('submit button executes a scalar CIRCLE radius exactly once', async page => {
    await command(page, 'CIRCLE'); await command(page, '300,240');
    await page.locator('#command').fill('25');
    await page.locator('#command-form button[type="submit"]').click();
    const s = await state(page);
    assert.equal(s.tool, 'select'); assert.equal(s.doc.entities.length, 1); near(s.doc.entities[0].radius, 25, 1e-8);
    assert.equal((s.history.match(/Command: 25/g) || []).length, 1);
  });

  await test('autocomplete arrows and Tab complete without executing until Enter', async page => {
    const input = page.locator('#command');
    await input.fill('li');
    assert.equal(await input.getAttribute('aria-expanded'), 'true');
    const names = await page.locator('#suggestions li').allTextContents();
    assert.equal(names.length, 2); assert.match(names[0], /^LINE /); assert.match(names[1], /^LIST /);
    await input.press('ArrowDown'); assert.match(await page.locator('#suggestions [aria-selected="true"]').textContent(), /^LINE /);
    await input.press('ArrowDown'); assert.match(await page.locator('#suggestions [aria-selected="true"]').textContent(), /^LIST /);
    await input.press('ArrowUp'); assert.match(await page.locator('#suggestions [aria-selected="true"]').textContent(), /^LINE /);
    await input.press('Tab');
    assert.equal(await input.inputValue(), 'LINE '); assert.equal(await input.getAttribute('aria-expanded'), 'false');
    assert.equal((await state(page)).tool, 'select', 'Tab completes only');
    await input.press('Enter'); assert.equal((await state(page)).tool, 'line');
  });

  await test('autocomplete ArrowUp from no selection chooses the final suggestion', async page => {
    const input = page.locator('#command');
    await input.fill('dim');
    const names = await page.locator('#suggestions li').allTextContents();
    assert.ok(names.length > 2);
    await input.press('ArrowUp');
    assert.equal(await page.locator('#suggestions [aria-selected="true"]').textContent(), names.at(-1));
  });

  await test('Enter accepts a highlighted completion and starts the command once', async page => {
    const input = page.locator('#command');
    await input.fill('cir'); await input.press('ArrowDown'); await input.press('Enter');
    let s = await state(page); assert.equal(s.tool, 'circle'); assert.equal(s.doc.entities.length, 0); assert.match(s.prompt, /center/i);
    await command(page, '250,200'); await command(page, '10');
    s = await state(page); assert.equal(s.tool, 'select'); assert.equal(s.doc.entities.length, 1); near(s.doc.entities[0].radius, 10, 1e-8);
  });

  await test('Up/Down history recall preserves the unfinished draft', async page => {
    await command(page, 'DIMTXT 13'); await command(page, 'DIMASZ 7');
    const input = page.locator('#command');
    await input.fill('@15,0');
    assert.equal(await input.getAttribute('aria-expanded'), 'false');
    await input.press('ArrowUp'); assert.equal(await input.inputValue(), 'DIMASZ 7');
    await input.press('ArrowUp'); assert.equal(await input.inputValue(), 'DIMTXT 13');
    await input.press('ArrowDown'); assert.equal(await input.inputValue(), 'DIMASZ 7');
    await input.press('ArrowDown'); assert.equal(await input.inputValue(), '@15,0');
    assert.equal((await state(page)).tool, 'select', 'recall does not execute recalled entries');
  });

  await test('invalid LINE numbers keep the base point and accept the next valid length', async page => {
    await command(page, 'LINE'); await command(page, '180,240');
    for (const input of ['0', '-5', '1e309', '100px']) {
      await command(page, input);
      const s = await state(page);
      assert.equal(s.tool, 'line'); assert.equal(s.doc.entities.length, 0); assert.match(s.status, /Operation failed:/);
    }
    await command(page, '25');
    const s = await state(page); assert.equal(s.doc.entities.length, 1);
    near(s.doc.entities[0].points[0].x, 180, 1e-8); near(s.doc.entities[0].points[1].x, 205, 1e-8);
  });

  await test('invalid CIRCLE radii keep the center and one valid Enter finishes it', async page => {
    await command(page, 'CIRCLE'); await command(page, '300,240');
    for (const input of ['0', '-3', '1e309', '12px']) {
      await command(page, input);
      const s = await state(page);
      assert.equal(s.tool, 'circle'); assert.equal(s.doc.entities.length, 0); assert.match(s.status, /Operation failed:/);
    }
    await command(page, '36.5');
    const s = await state(page); assert.equal(s.tool, 'select'); assert.equal(s.doc.entities.length, 1);
    near(s.doc.entities[0].points[0].x, 300, 1e-8); near(s.doc.entities[0].radius, 36.5, 1e-8);
  });

  await test('Arabic/Persian LINE coordinates and successive scalar lengths preserve cursor bearing', async page => {
    await command(page, 'LINE'); await command(page, '١٨٠،٢٤٠');
    await hover(page, { x: 300, y: 240 });
    await command(page, '۷۵٫۵'); await command(page, '٢٤٫٥');
    let s = await state(page); assert.equal(s.tool, 'line'); assert.equal(s.doc.entities.length, 2);
    near(s.doc.entities[0].points[1].x, 255.5); near(s.doc.entities[0].points[1].y, 240);
    near(s.doc.entities[1].points[0].x, 255.5); near(s.doc.entities[1].points[1].x, 280); near(s.doc.entities[1].points[1].y, 240);
    await command(page); s = await state(page); assert.equal(s.tool, 'select'); assert.equal(s.doc.entities.length, 2);
  });

  await test('Persian CIRCLE center and Arabic numeric radius create one completed circle', async page => {
    await command(page, 'CIRCLE'); await command(page, '۳۰۰،۲۴۰'); await command(page, '\u200f٣٧٫٥\u200e');
    const s = await state(page); assert.equal(s.tool, 'select'); assert.equal(s.doc.entities.length, 1);
    near(s.doc.entities[0].points[0].x, 300, 1e-8); near(s.doc.entities[0].points[0].y, 240, 1e-8); near(s.doc.entities[0].radius, 37.5, 1e-8);
  });

  await test('literal Arabic TEXT and markup stay unchanged and history creates no HTML elements', async page => {
    const text = 'غرفة ١٢٫٥ −۶ \u200f <em data-history-test="literal">جدار</em>';
    await command(page, 'TEXT'); await command(page, '200,240');
    await page.locator('#command').fill(text);
    assert.equal(await page.locator('#command').getAttribute('aria-expanded'), 'false', 'TEXT contents never trigger command completion');
    await page.locator('#command').press('Enter');
    const s = await state(page); assert.equal(s.tool, 'select'); assert.equal(s.doc.entities.length, 1);
    assert.equal(s.doc.entities[0].text, text, 'literal Arabic digits, minus and bidi mark must not be command-normalized');
    assert.ok(s.history.includes(text));
    assert.equal(await page.locator('#command-history [data-history-test]').count(), 0, 'history uses textContent, not HTML parsing');
    assert.equal(await page.locator('#command-history em').count(), 0);
  });

  await test('Ortho projects typed scalar lengths onto the dominant signed cursor axis', async page => {
    await command(page, 'LINE'); await command(page, '180,240'); await command(page, 'ORTHO');
    assert.equal(await page.locator('#ortho-btn').getAttribute('aria-pressed'), 'true');
    await hover(page, { x: 210, y: 300 }); await command(page, '30');
    let s = await state(page); assert.equal(s.doc.entities.length, 1);
    near(s.doc.entities[0].points[1].x, 180); near(s.doc.entities[0].points[1].y, 270);
    await hover(page, { x: 100, y: 280 }); await command(page, '40');
    s = await state(page); assert.equal(s.doc.entities.length, 2);
    near(s.doc.entities[1].points[1].x, 140); near(s.doc.entities[1].points[1].y, 270);
  });

  await test('scalar length after a coordinate segment follows the last segment direction', async page => {
    await command(page, 'LINE'); await command(page, '180,240'); await command(page, '@-60,80'); await command(page, '50');
    const s = await state(page); assert.equal(s.doc.entities.length, 2);
    near(s.doc.entities[1].points[0].x, 120, 1e-8); near(s.doc.entities[1].points[0].y, 320, 1e-8);
    near(s.doc.entities[1].points[1].x, 90, 1e-8); near(s.doc.entities[1].points[1].y, 360, 1e-8);
  });

  await test('Diagnostics downloads valid JSON with current command stage, errors and literal history', async page => {
    await command(page, 'CIRCLE'); await command(page, '300,240'); await command(page, '-5');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#diagnostics-btn').click()]);
    assert.equal(download.suggestedFilename(), 'RasmCAD-' + expectedVersion + '-diagnostics.json');
    const file = path.join(output, download.suggestedFilename()); await download.saveAs(file);
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(report.application, 'RasmCAD Advanced'); assert.equal(report.version, expectedVersion);
    assert.equal(report.tool, 'circle'); assert.equal(report.unfinishedPoints, 1); assert.equal(report.entityCount, 0);
    assert.ok(report.errors.some(entry => /Radius must be positive/.test(entry.message)));
    assert.ok(report.history.some(entry => entry.message === 'Command: -5'));
    assert.ok(Number.isFinite(Date.parse(report.generatedAt))); assert.ok(report.viewport.width > 0); assert.equal(report.devicePixelRatio, 1.25);
    assert.equal((await state(page)).tool, 'circle', 'downloading diagnostics does not advance the drawing command');
  });

  const summary = {
    htmlPath, htmlSha256, htmlBytes: html.length, expectedVersion, browser: await browser.version(), viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1.25,
    offlineAfterLoad: true, tests: results.length,
    passed: results.filter(result => result.status === 'PASS').length,
    failed: results.filter(result => result.status === 'FAIL').length,
    pageErrors, externalRequests, results
  };
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ htmlSha256, htmlBytes: html.length, tests: summary.tests, passed: summary.passed, failed: summary.failed, pageErrors, externalRequests }));
  await browser.close(); await new Promise(resolve => server.close(resolve));
  if (summary.failed || pageErrors.length || externalRequests.length) process.exitCode = 1;
})().catch(async error => {
  console.error(error);
  if (browser) await browser.close();
  if (server) server.close();
  process.exitCode = 1;
});
