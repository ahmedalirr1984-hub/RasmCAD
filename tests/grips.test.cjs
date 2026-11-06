'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../src/core.js');
const G = require('../src/grips.js');

let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS ' + name); }
const p = (x, y) => ({ x, y });
const near = (actual, expected) => assert(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
function drawing(raw) { const doc = new C.Document(); doc.add(raw); return doc; }
function history(doc) { return JSON.stringify({ undo: doc._undo, redo: doc._redo }); }
const line = () => ({ kind: 'line', points: [p(0, 0), p(10, 20)], color: '#abcdef', lineWidth: 2.5 });

test('line endpoint previews preserve styles and never mutate the original', () => {
  const doc = drawing(line()), original = doc.entities[0], before = doc.serialize();
  assert.deepEqual(G.handles(original), [
    { key: 'point:0', point: p(0, 0), role: 'endpoint' },
    { key: 'point:1', point: p(10, 20), role: 'endpoint' }
  ]);
  const target = p(-4, 7), next = G.preview(original, 'point:1', target);
  assert.deepEqual(next.points, [p(0, 0), target]);
  assert.equal(next.id, original.id); assert.equal(next.color, original.color); assert.equal(next.lineWidth, 2.5);
  target.x = 999; assert.equal(next.points[1].x, -4);
  assert.equal(doc.serialize(), before); assert(!doc.canUndo());
  const handles = G.handles(original); handles[0].point.x = 321; assert.equal(original.points[0].x, 0);
});

test('a grip edit is one undoable transaction and unchanged drags preserve redo', () => {
  const doc = drawing(line()), before = doc.serialize(), id = doc.entities[0].id;
  assert(G.apply(doc, id, 'point:1', p(30, 40))); assert.equal(doc._undo.length, 1);
  const after = doc.serialize(); assert.notEqual(after, before);
  assert(doc.undo()); assert.equal(doc.serialize(), before); assert(doc.canRedo());
  const stack = history(doc); assert.equal(G.apply(doc, id, 'point:1', p(10, 20)), false); assert.equal(history(doc), stack);
  assert(doc.redo()); assert.equal(doc.serialize(), after);
  assert.equal(G.apply(doc, 999, 'point:0', p(1, 1)), false); assert.equal(doc.serialize(), after);
});

test('polyline grips have stable exact vertex keys and large paths are bounded', () => {
  const points = Array.from({ length: 10000 }, (_, i) => p(i, Math.sin(i)));
  const doc = drawing({ kind: 'polyline', points, closed: true }), entity = doc.entities[0], handles = G.handles(entity);
  assert.equal(handles.length, 256); assert.equal(handles[0].key, 'point:0'); assert.equal(handles.at(-1).key, 'point:9999');
  assert.equal(new Set(handles.map(handle => handle.key)).size, 256);
  const chosen = handles[123], index = Number(chosen.key.slice(6));
  const next = G.preview(entity, chosen.key, p(17, -80));
  assert.deepEqual(next.points[index], p(17, -80)); assert(next.closed);
  assert.deepEqual(entity.points[index], points[index]);
  assert.deepEqual(next.points[index - 1], points[index - 1]); assert.deepEqual(next.points[index + 1], points[index + 1]);
});

test('circle center and all four radius grips edit actual analytical geometry', () => {
  const doc = drawing({ kind: 'circle', points: [p(3, 4)], radius: 5 }), entity = doc.entities[0];
  assert.deepEqual(G.handles(entity).map(handle => handle.point), [p(3, 4), p(8, 4), p(3, 9), p(-2, 4), p(3, -1)]);
  const moved = G.preview(entity, 'center', p(-10, 7)); assert.deepEqual(moved.points, [p(-10, 7)]); assert.equal(moved.radius, 5);
  for (let cardinal = 0; cardinal < 4; cardinal++) {
    const changed = G.preview(entity, 'radius:' + cardinal, p(6, 8)); near(changed.radius, 5);
    const enlarged = G.preview(entity, 'radius:' + cardinal, p(9, 12)); near(enlarged.radius, 10); assert.deepEqual(enlarged.points, [p(3, 4)]);
  }
  assert.equal(G.apply(doc, entity.id, 'radius:0', p(8, 4)), false); assert(!doc.canUndo());
});

test('arc endpoint grips project onto the fixed radius and center drags preserve angles', () => {
  const doc = drawing({ kind: 'arc', points: [p(2, 3)], radius: 10, startAngle: 0, endAngle: Math.PI }), entity = doc.entities[0];
  assert.deepEqual(G.handles(entity).map(handle => handle.key), ['center', 'start', 'end']);
  const next = G.preview(entity, 'start', p(2, 203)); near(next.startAngle, Math.PI / 2); near(next.endAngle, Math.PI); assert.equal(next.radius, 10);
  const end = G.preview(entity, 'end', p(2, -7)); near(C.normalizedAngle(end.endAngle), Math.PI * 1.5); assert.equal(end.startAngle, 0);
  const moved = G.preview(entity, 'center', p(-2, -3)); assert.deepEqual(moved.points, [p(-2, -3)]); assert.equal(moved.radius, 10); assert.equal(moved.endAngle, Math.PI);
  assert.equal(G.apply(doc, entity.id, 'end', G.handles(entity)[2].point), false); assert(!doc.canUndo());
  const wrapped = drawing({ kind: 'arc', points: [p(0, 0)], radius: 2, startAngle: Math.PI * 4, endAngle: Math.PI * 4.5 });
  assert.equal(G.apply(wrapped, 1, 'start', G.handles(wrapped.entities[0])[1].point), false);
});

test('text anchor moves preserve Unicode, size and rotation', () => {
  const doc = drawing({ kind: 'text', points: [p(1, 2)], text: 'غرفة 01', textHeight: 4, startAngle: .7 }), entity = doc.entities[0];
  assert.deepEqual(G.handles(entity), [{ key: 'point:0', point: p(1, 2), role: 'text-anchor' }]);
  const next = G.preview(entity, 'point:0', p(30, -4)); assert.deepEqual(next.points, [p(30, -4)]); assert.equal(next.text, 'غرفة 01'); assert.equal(next.textHeight, 4); assert.equal(next.startAngle, .7);
});

test('dimension definition grips change the measured value while location grips preserve it', () => {
  for (const [style, points, changed, expected] of [
    ['aligned', [p(0, 0), p(3, 4), p(10, 10)], p(6, 8), 10],
    ['horizontal', [p(0, 0), p(3, 4), p(10, 10)], p(6, 8), 6],
    ['vertical', [p(0, 0), p(3, 4), p(10, 10)], p(6, 8), 8],
    ['radius', [p(0, 0), p(3, 4), p(10, 10)], p(6, 8), 10],
    ['diameter', [p(0, 0), p(3, 4), p(10, 10)], p(6, 8), 20]
  ]) {
    const doc = drawing({ kind: 'dimension', dimensionStyle: style, points, textHeight: 1.5,
      textColor: '#ff0088', dimensionColor: '#00aaff', precision: 3, arrowStyle: 'tick', prefix: '~', suffix: ' mm' });
    const entity = doc.entities[0], measured = C.annotationGeometry(entity).measurement;
    const anchored = G.preview(entity, 'point:1', changed); near(C.annotationGeometry(anchored).measurement, expected);
    const location = G.preview(entity, 'point:2', p(30, 25)); near(C.annotationGeometry(location).measurement, measured);
    assert.equal(location.dimensionStyle, style); assert.equal(location.textColor, '#ff0088'); assert.equal(location.dimensionColor, '#00aaff');
    assert.equal(location.precision, 3); assert.equal(location.arrowStyle, 'tick'); assert.equal(location.prefix, '~'); assert.equal(location.suffix, ' mm');
    assert.equal(G.handles(entity)[2].role, 'dimension-location');
  }
  const doc = drawing({ kind: 'dimension', dimensionStyle: 'angular', points: [p(10, 0), p(0, 0), p(0, 10), p(20, 20)], textHeight: .5 });
  assert.equal(G.handles(doc.entities[0]).length, 4); assert.equal(G.handles(doc.entities[0])[3].role, 'dimension-location');
  const arm = G.preview(doc.entities[0], 'point:2', p(10, 10)); near(C.annotationGeometry(arm).measurement, 45);
  const location = G.preview(doc.entities[0], 'point:3', p(35, 30)); near(C.annotationGeometry(location).measurement, 90);
});

test('locked and hidden layers reject edits without altering geometry or history', () => {
  for (const flags of [{ locked: true }, { visible: false }]) {
    const doc = drawing(line()); Object.assign(doc.layers[0], flags); const before = doc.serialize(), stack = history(doc);
    assert.equal(G.apply(doc, 1, 'point:0', p(6, 7)), false); assert.equal(doc.serialize(), before); assert.equal(history(doc), stack);
  }
});

test('invalid targets, grips, zero radius and degenerate dimensions fail atomically', () => {
  const doc = drawing({ kind: 'circle', points: [p(3, 4)], radius: 5 }); doc.checkpoint(); doc.entities[0].radius = 6; doc.undo();
  const before = doc.serialize(), stack = history(doc);
  for (const [key, target] of [['radius:0', p(3, 4)], ['radius:4', p(5, 6)], ['point:0', p(1, 2)], ['center', p(Infinity, 2)], ['center', p(NaN, 2)], ['center', p(1e12 + 1, 0)], ['center', { x: '3', y: 4 }]]) {
    assert.throws(() => G.apply(doc, 1, key, target)); assert.equal(doc.serialize(), before); assert.equal(history(doc), stack);
  }
  const dimension = drawing({ kind: 'dimension', points: [p(0, 0), p(3, 4), p(10, 10)] }), saved = dimension.serialize();
  assert.throws(() => G.apply(dimension, 1, 'point:1', p(0, 0))); assert.equal(dimension.serialize(), saved); assert(!dimension.canUndo());
  const arc = drawing({ kind: 'arc', points: [p(0, 0)], radius: 5, startAngle: 0, endAngle: 1 });
  assert.throws(() => G.apply(arc, 1, 'end', p(0, 0))); assert(!arc.canUndo());
  const pathDoc = drawing(line()); for (const key of ['point:-1', 'point:01', 'point:2', 'point:999999999999999999999']) assert.throws(() => G.preview(pathDoc.entities[0], key, p(1, 2)));
});

test('whole-document validation prevents committing around unrelated invalid state', () => {
  const doc = drawing(line()); doc.add({ kind: 'circle', points: [p(20, 30)], radius: 5 });
  doc.entities[1].radius = -1; const state = JSON.stringify(doc), stack = history(doc);
  assert.throws(() => G.apply(doc, 1, 'point:1', p(30, 40))); assert.equal(JSON.stringify(doc), state); assert.equal(history(doc), stack);
});

test('UMD browser module requires only RasmCore and exposes the same API', () => {
  const sandbox = { RasmCore: C }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/grips.js'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.RasmGrips.handles, 'function'); assert.equal(typeof sandbox.RasmGrips.preview, 'function'); assert.equal(typeof sandbox.RasmGrips.apply, 'function');
  assert.equal(sandbox.RasmGrips.MAX_GRIPS, 256); assert.deepEqual(G.handles(null), []); assert.deepEqual(G.handles({ kind: 'unknown', points: [p(1, 2)] }), []);
});

console.log(`RESULT PASS: ${checks} grip editing checks`);
