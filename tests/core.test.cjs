'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../src/core.js');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'build', 'test-artifacts');
fs.mkdirSync(artifacts, { recursive: true });
let passed = 0;
let failed = 0;
const results = [];
function test(name, fn) {
  try {
    fn(); passed++; results.push({ name, status: 'PASS' });
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++; results.push({ name, status: 'FAIL', error: error.stack });
    console.error(`FAIL ${name}\n${error.stack}`);
  }
}
function near(actual, expected, message, tolerance = 1e-8) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${message}: ${actual} != ${expected}`);
}
function point(actual, expected, message) {
  near(actual.x, expected.x, `${message}.x`); near(actual.y, expected.y, `${message}.y`);
}
const line = (a = { x: 0, y: 0 }, b = { x: 100, y: 50 }) => ({ kind: 'line', points: [a, b] });
const polyline = () => ({ kind: 'polyline', closed: true, points: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 40 }, { x: 0, y: 40 }] });
const circle = () => ({ kind: 'circle', points: [{ x: 25, y: 30 }], radius: 7.5 });
const arc = () => ({ kind: 'arc', points: [{ x: 80, y: 60 }], radius: 12, startAngle: Math.PI / 6, endAngle: Math.PI * 4 / 3 });
const text = () => ({ kind: 'text', points: [{ x: 10, y: 85 }], text: 'غرفة مكتب — Room 01', textHeight: 8 });
const dimension = () => ({ kind: 'dimension', points: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 20, y: -15 }], textHeight: 5 });
function drawing(withDimension = true) {
  const d = new C.Document();
  d.layers.push({ name: 'الجدران', color: '#abcdef', visible: true, locked: false });
  d.layers.push({ name: 'Hidden', color: '#112233', visible: false, locked: true });
  d.currentLayer = 'الجدران';
  d.add({ ...line(), color: '#ff5511', lineWidth: 2.5 });
  d.add(polyline()); d.add({ ...circle(), layer: '0' }); d.add({ ...arc(), layer: '0' }); d.add({ ...text(), layer: '0' });
  if (withDimension) d.add({ ...dimension(), layer: '0' });
  return d;
}
function nativeData(doc) { return JSON.parse(doc.serialize()); }

test('UMD core loads in an isolated global without CommonJS globals or network APIs', () => {
  const context = vm.createContext({ console });
  vm.runInContext(fs.readFileSync(path.join(root, 'src', 'core.js'), 'utf8'), context);
  assert.ok(context.RasmCore && typeof context.RasmCore.Document === 'function');
  assert.equal(new context.RasmCore.Document().entities.length, 0);
});

test('draw all six supported entity kinds with stable unique IDs and defaults', () => {
  const d = drawing();
  assert.deepEqual(d.entities.map(e => e.kind), ['line', 'polyline', 'circle', 'arc', 'text', 'dimension']);
  assert.equal(new Set(d.entities.map(e => e.id)).size, 6);
  assert.ok(d.entities.every(e => Number.isInteger(e.id) && e.id > 0));
  assert.equal(d.entities[0].layer, 'الجدران');
  assert.equal(d.entities[1].color, null);
  const id = d.add({ ...line(), id: 1 });
  assert.ok(id > 6); assert.equal(d.entities.at(-1).id, id);
  assert.equal(d.layer('الجدران').color, '#abcdef');
  const bounds = d.bounds(); assert.equal(bounds.valid, true);
  assert.ok(bounds.min.x <= 0 && bounds.max.x >= 100);
});

test('native JSON saves to disk and reopens all editable geometry, Arabic and layers', () => {
  let original = drawing();
  const expected = nativeData(original);
  const file = path.join(artifacts, 'رسم-قابل-للتحرير.rcad.json');
  fs.writeFileSync(file, original.serialize(), 'utf8');
  original = null;
  const reopened = C.Document.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(nativeData(reopened), expected);
  assert.equal(reopened.entities[4].text, 'غرفة مكتب — Room 01');
  assert.deepEqual(reopened.layer('Hidden'), { name: 'Hidden', color: '#112233', visible: false, locked: true });
  const id = reopened.add(line({ x: 130, y: 0 }, { x: 130, y: 70 }));
  assert.ok(id >= expected.nextId);
  fs.writeFileSync(file, reopened.serialize(), 'utf8');
  assert.deepEqual(nativeData(C.Document.parse(fs.readFileSync(file, 'utf8'))), nativeData(reopened));
});

test('native reopening makes an independent document rather than shared mutable state', () => {
  const original = drawing(); const reopened = C.Document.parse(original.serialize());
  reopened.entities[0].points[0].x = 1234;
  reopened.layers[1].color = '#010203';
  assert.equal(original.entities[0].points[0].x, 0);
  assert.equal(original.layers[1].color, '#abcdef');
});

test('move, rotate and scale retain geometric meaning', () => {
  const d = new C.Document(); const id = d.add(line({ x: 1, y: 0 }, { x: 3, y: 0 }));
  const cid = d.add(circle()); const aid = d.add(arc());
  d.transform([id], { translation: { x: 5, y: -2 } });
  point(d.entities[0].points[0], { x: 6, y: -2 }, 'move start');
  point(d.entities[0].points[1], { x: 8, y: -2 }, 'move end');
  d.transform([id], { rotation: Math.PI / 2, pivot: { x: 6, y: -2 } });
  point(d.entities[0].points[0], { x: 6, y: -2 }, 'rotation pivot stable');
  point(d.entities[0].points[1], { x: 6, y: 0 }, 'rotated endpoint');
  d.transform([cid, aid], { rotation: Math.PI / 2, scale: 2 });
  point(d.entities[1].points[0], { x: -60, y: 50 }, 'circle transformed center');
  near(d.entities[1].radius, 15, 'circle radius scaled');
  near(d.entities[2].radius, 24, 'arc radius scaled');
  near(Math.sin(d.entities[2].startAngle), Math.sin(Math.PI / 6 + Math.PI / 2), 'arc start rotated');
  near(Math.cos(d.entities[2].endAngle), Math.cos(Math.PI * 4 / 3 + Math.PI / 2), 'arc end rotated');
});

test('undo/redo restores geometry and layers and a fresh edit clears redo', () => {
  const d = new C.Document(); const id = d.add(line()); const original = nativeData(d);
  d.checkpoint(); d.layers.push({ name: 'Labels', color: '#ffff00', visible: true, locked: false });
  d.currentLayer = 'Labels'; d.transform([id], { translation: { x: 10, y: 20 } }); const modified = nativeData(d);
  assert.equal(d.canUndo(), true); assert.equal(d.undo(), true); assert.deepEqual(nativeData(d), original);
  assert.equal(d.canRedo(), true); assert.equal(d.redo(), true); assert.deepEqual(nativeData(d), modified);
  d.checkpoint(); d.erase([id]); assert.equal(d.entities.length, 0);
  assert.equal(d.undo(), true); assert.deepEqual(nativeData(d), modified);
  d.checkpoint(); d.add(circle()); assert.equal(d.canRedo(), false);
});

test('hit testing, bounds, snapping and dimension measurement follow actual geometry', () => {
  const d = new C.Document(); d.add(line({ x: 0, y: 0 }, { x: 10, y: 0 })); d.add(circle());
  assert.equal(C.hitTest(d.entities[0], { x: 5, y: 0.1 }, 0.2), true);
  assert.equal(C.hitTest(d.entities[0], { x: 5, y: 2 }, 0.2), false);
  assert.equal(C.hitTest(d.entities[1], { x: 32.5, y: 30 }, 0.01), true);
  assert.equal(C.hitTest(d.entities[1], { x: 25, y: 30 }, 0.1), false);
  const a = { ...arc(), startAngle: 0, endAngle: Math.PI / 2 }; d.add(a);
  assert.equal(C.hitTest(d.entities[2], { x: 92, y: 60 }, 0.01), true);
  assert.equal(C.hitTest(d.entities[2], { x: 68, y: 60 }, 0.01), false);
  d.add(polyline()); assert.equal(C.hitTest(d.entities[3], { x: 0, y: 20 }, 0.01), true);
  const b = C.entityBounds(d.entities[1]);
  point(b.min, { x: 17.5, y: 22.5 }, 'circle lower bounds'); point(b.max, { x: 32.5, y: 37.5 }, 'circle upper bounds');
  assert.ok(C.snapPoints(d.entities[0]).some(p => C.distance(p, { x: 0, y: 0 }) < 1e-9));
  d.add(dimension()); near(C.dimensionGeometry(d.entities[4]).length, 60, 'dimension true length');
});

test('invalid drawing operations fail without partial geometry mutations', () => {
  const d = drawing(); const before = d.serialize();
  assert.throws(() => d.add({ ...line(), points: [{ x: NaN, y: 0 }, { x: 1, y: 1 }] }));
  assert.throws(() => d.add({ ...circle(), radius: -1 }));
  assert.throws(() => d.add({ ...line(), points: [] }));
  assert.throws(() => d.add({ ...line(), kind: 'solid3d' }));
  assert.equal(d.serialize(), before);
  assert.throws(() => d.transform([d.entities[0].id], { scale: 0 }));
  assert.throws(() => d.transform([d.entities[0].id], { translation: { x: Infinity, y: 0 } }));
  assert.equal(d.serialize(), before);
});

test('malformed native files and invalid schema are rejected without replacing active work', () => {
  const active = drawing(); const before = active.serialize();
  for (const input of ['', 'not JSON', '{', '[]', '{}']) assert.throws(() => C.Document.parse(input));
  const bad = JSON.parse(before); bad.version = 999; assert.throws(() => C.Document.parse(JSON.stringify(bad)));
  bad.version = 1; bad.entities[0].points[0].x = null;
  assert.throws(() => C.Document.parse(JSON.stringify(bad)));
  const duplicate = JSON.parse(before); duplicate.entities[1].id = duplicate.entities[0].id;
  assert.throws(() => C.Document.parse(JSON.stringify(duplicate)));
  const truncated = before.slice(0, Math.floor(before.length / 2));
  fs.writeFileSync(path.join(artifacts, 'malformed-project.json'), truncated, 'utf8');
  assert.throws(() => C.Document.parse(fs.readFileSync(path.join(artifacts, 'malformed-project.json'), 'utf8')));
  assert.equal(active.serialize(), before);
  active.entities[0].points[0].x = Infinity;
  assert.throws(() => active.serialize());
});

test('actual legacy C++ architectural project imports all 77 editable entities', () => {
  const legacy = fs.readFileSync(path.join(__dirname, 'fixtures', 'legacy-plan.rcad'), 'utf8');
  const d = C.importRcad(legacy);
  assert.equal(d.entities.length, 77); assert.equal(d.layers.length, 6); assert.equal(d.currentLayer, 'WALLS');
  assert.equal(d.entities[0].kind, 'polyline'); assert.equal(d.entities[0].closed, true);
  point(d.entities[0].points[2], { x: 12000, y: 8000 }, 'legacy rectangle preserved');
  assert.ok(d.entities.some(e => e.kind === 'arc'));
  assert.ok(d.entities.some(e => e.kind === 'dimension'));
  assert.ok(d.entities.some(e => e.kind === 'text' && e.text.includes('LIVING')));
  assert.deepEqual(nativeData(C.Document.parse(d.serialize())), nativeData(d));
  fs.writeFileSync(path.join(artifacts, 'legacy-plan.dxf'), C.exportDxf(d), 'utf8');
});

test('legacy Arabic project preserves Unicode, styling and layers and rejects truncation', () => {
  const legacy = fs.readFileSync(path.join(__dirname, 'fixtures', 'legacy-arabic.rcad'), 'utf8');
  const d = C.importRcad(legacy);
  assert.equal(d.entities.length, 7); assert.equal(d.currentLayer, 'الجدران');
  assert.equal(d.entities[0].color, '#ff5511'); near(d.entities[0].lineWidth, 2.5, 'legacy line width');
  assert.equal(d.layer('الجدران').color, '#abcdef');
  assert.equal(d.entities[4].text, 'غرفة مكتب — Room 01');
  assert.equal(d.layer('Hidden').visible, false); assert.equal(d.layer('Hidden').locked, true);
  assert.deepEqual(nativeData(C.Document.parse(d.serialize())), nativeData(d));
  assert.throws(() => C.importRcad(legacy.slice(0, Math.floor(legacy.length / 2))));
  assert.throws(() => C.importRcad('This is not a RasmCAD file'));
});

test('DXF export writes supported geometry, UTF-8 and dimensions for independent parsing', () => {
  const d = drawing(false); const dxf = C.exportDxf(d);
  assert.ok(dxf.includes('AC1021')); assert.ok(dxf.includes('AcDbPolyline')); assert.ok(dxf.includes('غرفة مكتب — Room 01'));
  fs.writeFileSync(path.join(artifacts, 'roundtrip.dxf'), dxf, 'utf8');
  const dim = new C.Document(); dim.add(dimension());
  fs.writeFileSync(path.join(artifacts, 'dimensions.dxf'), C.exportDxf(dim), 'utf8');
  const invalid = drawing(); invalid.entities[0].points[0].x = Infinity;
  assert.throws(() => C.exportDxf(invalid));
});

test('built-in sample is valid, editable, and survives complete JSON reopening', () => {
  const d = C.sampleDocument(); assert.ok(d.entities.length > 20);
  assert.deepEqual(nativeData(C.Document.parse(d.serialize())), nativeData(d));
  const id = d.add(line()); assert.ok(id > 1);
  fs.writeFileSync(path.join(artifacts, 'sample.json'), d.serialize(), 'utf8');
  fs.writeFileSync(path.join(artifacts, 'sample-plan.dxf'), C.exportDxf(d), 'utf8');
});

console.log(`RESULT ${failed ? 'FAIL' : 'PASS'}: ${passed} groups passed; ${failed} failed`);
fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify({ passed, failed, results }, null, 2));
process.exitCode = failed ? 1 : 0;
