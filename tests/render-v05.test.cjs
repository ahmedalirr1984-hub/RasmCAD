'use strict';
// Regression checks for origin-independent picking and actual viewport rendering.
// Browser cases load documents and zoom/click through the public user interface.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const C = require('../src/core.js');
const S = require('../src/selection.js');
const V = require('../src/view.js');
const p = (x, y) => ({ x, y });
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'build', 'render-artifacts');
fs.mkdirSync(output, { recursive: true });
let checks = 0;
function check(value, message) { checks++; assert.ok(value, message); }
function equal(actual, expected, message) { checks++; assert.deepEqual(actual, expected, message); }
function drawing(entities) { const d = new C.Document(); for (const e of entities) d.add(e); return d; }
const line = (a, b, color = '#ff00ff') => ({ kind: 'line', points: [a, b], color });
const circle = (center, radius, color = '#ff00ff') => ({ kind: 'circle', points: [center], radius, color });

for (const origin of [0, -1e8, 1e8, -8e11, 8e11]) {
  const d = drawing([line(p(origin, origin), p(origin + 1, origin + 1)), line(p(origin, origin + .001), p(origin + 1, origin + 1.001))]);
  const at = p(origin + .5, origin + .5);
  equal(S.pick(d, at, .0007)?.id, 1, `nearest stroke at survey origin ${origin}`);
  equal(S.pick(d, at, 0)?.id, 1, `exact diagonal can be picked with zero tolerance at ${origin}`);
  equal(S.pick(drawing([d.entities[0]]), p(origin + .5, origin + .502), .0007), null, `seven-pixel tolerance does not grow with origin ${origin}`);
  for (const zoom of [1e-5, .1, 1, 100, 10000]) {
    const view = { camera: p(origin + .5, origin + .5), zoom, width: 800, height: 600 };
    equal(V.project(at, view), p(400, 300), `camera-relative projection at ${origin}, zoom ${zoom}`);
  }
}
{
  const o = 8e11, d = drawing([line(p(o, o), p(o + 1, o))]);
  equal(S.windowSelect(d, p(o - .1, o - .1), p(o + .999, o + .1), false), [], 'containment cannot grow by ten screen pixels at a large origin');
}
for (const sign of [-1, 1]) {
  const origin = sign * 8e11;
  const short = drawing([line(p(origin, origin), p(origin + .001, origin + .001))]);
  equal(S.pick(short, p(origin + .0005, origin + .0005), .0007)?.id, 1, 'representable short segment remains selectable at a large origin');
}
equal(V.clipSegment(p(1e9, -1e9), p(-1e9, 1.1e9), 800, 600), null, 'offscreen segment must not become a false diagonal through endpoint clamping');
equal(V.clipSegment(p(-100, 300), p(900, 300), 800, 600, 0), { a: p(0, 300), b: p(800, 300) }, 'proper segment clipping retains the true visible stroke');
equal(V.clipSegment(p(100, 100), p(200, 200), 800, 600), { a: p(100, 100), b: p(200, 200) }, 'visible endpoints are not altered');
equal(V.clipSegment(p(-4, 100), p(-4, 200), 800, 600), null, 'parallel offscreen segment');
equal(V.clipSegment(p(NaN, 0), p(10, 10), 800, 600), null, 'invalid segment is rejected');

function nearestSegmentDistance(point, paths) {
  let best = Infinity;
  for (const points of paths) for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t));
  }
  return best;
}
for (const origin of [0, 1e8, -8e11]) for (const radius of [10, 1e3, 1e6, 1e10]) for (const a of [0, .005235987755982988, Math.PI / 2, 2.1, Math.PI, 4.7]) {
  const center = p(origin, origin), world = p(origin + radius * Math.cos(a), origin + radius * Math.sin(a));
  const view = { camera: world, zoom: 1, width: 800, height: 600 };
  const paths = V.arcPolylines(circle(center, radius), view);
  check(paths.length > 0, `visible circle section r${radius}, angle${a}, origin${origin}`);
  check(paths.reduce((n, points) => n + points.length, 0) < 2000, 'visible-circle work remains bounded rather than tessellating its invisible circumference');
  check(nearestSegmentDistance(V.project(world, view), paths) <= .351, `subpixel circle error r${radius}, angle${a}, origin${origin}`);
  for (const points of paths) for (const point of points) check(Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= -2.01 && point.x <= 802.01 && point.y >= -2.01 && point.y <= 602.01, 'output arc vertices are finite and clipped');
}
{
  const v = { camera: p(0, 0), zoom: 1, width: 800, height: 600 };
  equal(V.arcPolylines(circle(p(0, 0), 1e6), v), [], 'circle surrounding the viewport does not draw false interior strokes');
  equal(V.arcPolylines({ kind: 'arc', points: [p(0, 0)], radius: 100, startAngle: 0, endAngle: Math.PI / 2 }, { ...v, camera: p(-100, -100), width: 20, height: 20 }), [], 'absent arc quadrant remains absent');
}
console.log(`PASS ${checks} selection/projection/clipping checks`);

if (process.env.RASMCAD_SKIP_BROWSER === '1') process.exit(0);

const { chromium } = require('playwright');
const results = [], errors = [], externalRequests = [];
let browser, server, context, origin, htmlSha256;
const phase = process.env.RASMCAD_PHASE || 'after';
async function load(page, doc) {
  await page.locator('#file-input').setInputFiles({ name: 'render-regression.rasm.json', mimeType: 'application/json', buffer: Buffer.from(doc.serialize()) });
  await page.waitForFunction(count => RasmCAD.document.entities.length === count, doc.entities.length);
  if (await page.locator('#grid-btn').getAttribute('aria-pressed') === 'true') await page.locator('#grid-btn').click();
  if (await page.locator('#snap-btn').getAttribute('aria-pressed') === 'true') await page.locator('#snap-btn').click();
  await page.locator('[data-tool="select"]').click();
}
async function screen(page, world) {
  const at = await page.evaluate(world => RasmCAD.worldToScreen(world), world);
  const box = await page.locator('#canvas').boundingBox();
  return { x: at.x, y: at.y, clientX: at.x + box.x, clientY: at.y + box.y, width: box.width, height: box.height };
}
async function zoomAt(page, world, desired) {
  const readZoom = () => page.evaluate(() => { const a = RasmCAD.screenToWorld({ x: 0, y: 0 }), b = RasmCAD.screenToWorld({ x: 100, y: 0 }); return 100 / (b.x - a.x); });
  // Wheel events use integer CSS client coordinates. Small steps keep their
  // subpixel rounding from moving the target thousands of pixels out of view.
  let current = await readZoom();
  for (let i = 0; i < 32 && Math.abs(Math.log(desired / current)) > 1e-6; i++) {
    const factor = Math.max(.25, Math.min(4, desired / current));
    const at = await screen(page, world);
    await page.mouse.move(at.clientX, at.clientY);
    await page.mouse.wheel(0, -Math.log(factor) / .0015);
    await page.waitForTimeout(50);
    current = await readZoom();
  }
  assert.ok(Math.abs(Math.log(desired / current)) < 1e-5, `requested zoom ${desired} reached ${current}`);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(50);
}
async function brightPixel(page, at, radius = 2, magentaOnly = false) {
  return page.evaluate(({ at, radius, magentaOnly }) => {
    const canvas = document.querySelector('#canvas'), ratio = canvas.width / canvas.getBoundingClientRect().width, ctx = canvas.getContext('2d');
    const minX = Math.max(0, Math.floor((at.x - radius) * ratio)), minY = Math.max(0, Math.floor((at.y - radius) * ratio));
    const image = ctx.getImageData(minX, minY, Math.max(1, Math.ceil((radius * 2 + 1) * ratio)), Math.max(1, Math.ceil((radius * 2 + 1) * ratio)));
    for (let i = 0; i < image.data.length; i += 4) {
      const r = image.data[i], g = image.data[i + 1], b = image.data[i + 2];
      if (magentaOnly ? r > 160 && b > 160 && g < 100 : Math.max(r, g, b) > 120) return true;
    }
    return false;
  }, { at, radius, magentaOnly });
}
async function test(name, dpr, fn) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.RasmCAD);
  try {
    await fn(page);
    results.push({ name, dpr, status: 'PASS' }); console.log(`PASS ${name} DPR${dpr}`);
  } catch (error) {
    const screenshot = `${phase}-${results.length + 1}-dpr${dpr}.png`;
    await page.screenshot({ path: path.join(output, screenshot) });
    results.push({ name, dpr, status: 'FAIL', error: error.message, screenshot }); console.error(`FAIL ${name} DPR${dpr}: ${error.message}`);
  } finally { await page.close(); }
}
(async () => {
  const html = fs.readFileSync(process.env.RASMCAD_HTML || path.join(root, 'dist', 'RasmCAD-Advanced.html'));
  htmlSha256 = crypto.createHash('sha256').update(html).digest('hex');
  server = http.createServer((req, res) => { if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; } res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  for (const dpr of [1, 1.25, 2]) {
    context = await browser.newContext({ viewport: { width: 1560, height: 1100 }, deviceScaleFactor: dpr });
    await context.route('**/*', route => { if (route.request().url().startsWith(origin + '/')) return route.continue(); externalRequests.push(route.request().url()); return route.abort('blockedbyclient'); });
    await test('zoomed circle draws its true curve and can be selected there', dpr, async page => {
      const radius = 1e6, angle = Math.PI / 600, world = p(radius * Math.cos(angle), radius * Math.sin(angle));
      await load(page, drawing([circle(p(0, 0), radius)]));
      await zoomAt(page, world, 1);
      const at = await screen(page, world);
      assert.ok(at.x > 5 && at.x < at.width - 5 && at.y > 5 && at.y < at.height - 5, 'circumference under test remains inside canvas');
      assert.ok(await brightPixel(page, at), 'actual circle circumference is missing within two pixels');
      await page.mouse.click(at.clientX, at.clientY);
      assert.deepEqual(await page.evaluate(() => RasmCAD.selectedIds), [1]);
    });
    await test('offscreen large segment never creates a false visible diagonal', dpr, async page => {
      const doc = drawing([circle(p(0, 0), 1e12, '#00ff00'), line(p(9e11, -9e11), p(-9e11, 1e12))]);
      await load(page, doc);
      await zoomAt(page, p(0, 0), .0001);
      const box = await page.locator('#canvas').boundingBox(), diagonal = Math.min(box.width, box.height) / 3;
      const at = { x: diagonal, y: diagonal, clientX: box.x + diagonal, clientY: box.y + diagonal };
      assert.equal(await brightPixel(page, at, 3, true), false, 'endpoint clamping invented a magenta stroke through empty space');
      await page.mouse.click(at.clientX, at.clientY);
      assert.deepEqual(await page.evaluate(() => RasmCAD.selectedIds), []);
    });
    await context.close();
  }
  assert.deepEqual(errors, [], 'no browser errors');
  assert.deepEqual(externalRequests, [], 'standalone renderer makes no external requests');
})().catch(error => { errors.push(error.stack); console.error(error); }).finally(async () => {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(output, `results-${phase}.json`), JSON.stringify({ phase, htmlSha256, checks, results, errors, externalRequests }, null, 2));
  process.exitCode = errors.length || results.some(result => result.status === 'FAIL') ? 1 : 0;
});
