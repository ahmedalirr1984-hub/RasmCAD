'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const C = require('../src/core.js');
const S = require('../src/selection.js');
let checks = 0;
const p = (x, y) => ({ x, y });
function equal(actual, expected, message) { checks++; assert.deepEqual(actual, expected, message); }
function ok(condition, message) { checks++; assert(condition, message); }
function near(actual, expected, message) { checks++; assert(Math.abs(actual - expected) <= 1e-8, `${message || 'value'}: ${actual} versus ${expected}`); }
function drawing(entities) { const d = new C.Document(); for (const e of entities) d.add(e); return d; }
const line = (a, b, extra = {}) => ({ kind: 'line', points: [a, b], ...extra });
const circle = (c, radius, extra = {}) => ({ kind: 'circle', points: [c], radius, ...extra });
const arc = (c, radius, startAngle, endAngle) => ({ kind: 'arc', points: [c], radius, startAngle, endAngle });
const text = (at, value, h = 10, angle = 0) => ({ kind: 'text', points: [at], text: value, textHeight: h, startAngle: angle });
const ids = entities => entities.map(e => e.id);

{
  const d = drawing([line(p(-20, 0), p(20, 0)), line(p(-20, 1.5), p(20, 1.5))]);
  equal(S.pick(d, p(0, .1), 2).id, 1, 'nearest stroke wins over a farther topmost object');
  equal(ids(S.candidates(d, p(0, .1), 2)), [1, 2], 'candidate list is ranked by true distance');
  equal(S.pick(d, p(0, .75), 2).id, 2, 'equidistant objects choose the topmost entity');
  d.add(line(p(-20, 0), p(20, 0)));
  equal(S.pick(d, p(0, 0), 0).id, 3, 'overlapping equal-distance entities use drawing order');
  d.layers.push({ name: 'hidden', visible: false, locked: false, color: '#ffffff' }, { name: 'locked', visible: true, locked: true, color: '#ffffff' });
  d.add(line(p(-20, 0), p(20, 0), { layer: 'hidden' })); d.add(line(p(-20, 0), p(20, 0), { layer: 'locked' }));
  equal(ids(S.candidates(d, p(0, 0), 2)), [3, 1, 2], 'hidden and locked layers are never candidates');
  equal(S.windowSelect(d, p(-30, -5), p(30, 5)), [1, 2, 3], 'window selection excludes hidden and locked layers');
  const before = d.serialize();
  S.pick(d, p(1, 1), 5); S.windowSelect(d, p(10, 10), p(-10, -10), true); S.candidates(d, p(0, 0), 10);
  equal(d.serialize(), before, 'selection never changes geometry, layers, IDs or document state');
  equal(S.pick(d, p(100, 100), 2), null, 'empty space is not selectable');
  equal(S.candidates(d, p(0, 0), -1), []); equal(S.candidates(d, p(NaN, 0), 1), []);
  equal(S.candidates(d, p(0, 0), Infinity), []); equal(S.windowSelect(d, p(0, NaN), p(10, 10), true), []);
  equal(S.pick({ entities: d.entities, layers: d.layers }, p(0, 0), .1).id, 3, 'plain documents with layers arrays are supported');
}

{
  const d = drawing([line(p(-100, 5), p(100, 5)), line(p(-100, -100), p(100, 100))]);
  equal(S.windowSelect(d, p(0, 0), p(10, 10), false), [], 'containment requires both ends of entire line');
  equal(S.windowSelect(d, p(10, 10), p(0, 0), true), [1, 2], 'crossing detects lines with both ends outside rectangle');
  equal(S.windowSelect(d, p(0, 20), p(10, 30), true), [], 'overlapping entity and window bounding boxes alone do not imply a crossing');
  const negative = drawing([line(p(-30, -25), p(-10, -25))]);
  equal(S.windowSelect(negative, p(-35, -30), p(-5, -20)), [1], 'negative-coordinate containment');
  equal(S.windowSelect(negative, p(-5, -20), p(-35, -30)), [1], 'rectangle point order does not change containment');
  equal(S.windowSelect(negative, p(-20, -25), p(-20, -25), true), [1], 'zero-sized window on a segment is a geometric crossing');
  equal(S.windowSelect(negative, p(-20, -24), p(-20, -24), true), [], 'zero-sized window away from segment is empty');
}

{
  const d = drawing([circle(p(0, 0), 10)]);
  equal(S.pick(d, p(0, 0), 1), null, 'circle interior is not a rendered stroke');
  equal(S.pick(d, p(10.2, 0), .3).id, 1);
  equal(S.windowSelect(d, p(8, 8), p(9, 9), true), [], 'circle bounding-box corner does not create a false crossing');
  equal(S.windowSelect(d, p(-1, -1), p(1, 1), true), [], 'window wholly inside an unfilled circle does not cross circumference');
  equal(S.windowSelect(d, p(9, -1), p(11, 1), true), [1], 'circle circumference crosses rectangle');
  equal(S.windowSelect(d, p(10, -.1), p(11, .1), true), [1], 'circle tangent to window edge is selected');
  equal(S.windowSelect(d, p(-10, -10), p(10, 10), false), [1], 'complete circle containment');
  equal(S.windowSelect(d, p(-9, -10), p(10, 10), false), [], 'partial containment is insufficient');
  const quadrant = drawing([arc(p(0, 0), 10, 0, Math.PI / 2)]);
  equal(S.windowSelect(quadrant, p(-1, -11), p(1, -9), true), [], 'absent arc quadrant does not cross a rectangle');
  equal(S.windowSelect(quadrant, p(6, 6), p(8, 8), true), [1], 'arc interior sweep crosses rectangle');
  equal(S.windowSelect(quadrant, p(9.9, -.1), p(10.1, .1), true), [1], 'arc endpoint crossing');
  equal(S.pick(quadrant, p(10, -.05), .06).id, 1, 'points just beyond an arc angle can pick its endpoint');
  equal(S.pick(quadrant, p(10, -.05), .01), null, 'arc endpoint distance is respected');
  const completeArc = drawing([arc(p(-20, -20), 10, 1, 1)]);
  equal(S.windowSelect(completeArc, p(-21, -31), p(-19, -29), true), [1], 'equal arc angles mean a full sweep');
}

{
  const d = drawing([{ kind: 'polyline', points: [p(0, 0), p(100, 0), p(100, 100), p(0, 100)], closed: true }]);
  equal(S.pick(d, p(50, 50), 1), null, 'closed polyline is a stroke, not a filled bounding rectangle');
  equal(S.windowSelect(d, p(10, 10), p(20, 20), true), [], 'small crossing window inside unfilled polyline selects nothing');
  equal(S.windowSelect(d, p(-1, 40), p(1, 60), true), [1], 'closing polyline edge is included');
  equal(S.windowSelect(d, p(-1, -1), p(101, 101)), [1]);
  equal(S.windowSelect(d, p(0, 0), p(50, 100)), []);
}

{
  const d = drawing([text(p(0, 0), 'A', 10, Math.PI / 2)]);
  equal(S.pick(d, p(-5, 3), 0).id, 1, 'inside rotated text quad');
  equal(S.pick(d, p(5, 3), 1), null, 'rotated text does not use an axis-aligned unrotated rectangle');
  equal(S.windowSelect(d, p(-10.1, -.1), p(.1, 6.6)), [1], 'rotated text full containment');
  equal(S.windowSelect(d, p(-10.1, -.1), p(.1, 3)), [], 'rotated text is not fully inside partial window');
  equal(S.windowSelect(d, p(-8, 2), p(-4, 3), true), [1], 'crossing window inside text quad');
  const empty = drawing([text(p(0, 0), '   ')]);
  equal(S.pick(empty, p(0, 0), 100), null, 'nonrendering whitespace is not a giant selectable region');
  equal(S.windowSelect(empty, p(-100, -100), p(100, 100)), []);
  S.setTextMeasurer((value, height) => ({ left: 0, right: Array.from(value).length * height * .3, bottom: -height * .2, top: height * .75 }));
  const actual = drawing([line(p(18, 2), p(25, 2)), text(p(0, 0), 'WWWW', 10)]);
  equal(S.pick(actual, p(20, 2), .5).id, 1, 'actual measured text ends before line; a giant estimated text hit rectangle cannot steal the pick');
  equal(S.windowSelect(actual, p(0, 0), p(12, 10), false), [], 'actual descender lies below baseline and must also fit containment');
  equal(S.windowSelect(actual, p(-.1, -2.1), p(12.1, 7.6), false), [2], 'actual font metrics are used for text containment');
  S.setTextMeasurer(null);
  assert.throws(() => S.setTextMeasurer(1), TypeError); checks++;
}

{
  const raw = { kind: 'dimension', points: [p(0, 0), p(100, 0), p(0, 20)], textHeight: 10, text: 'LONG DIMENSION LABEL EXCEEDS THE END' };
  const d = drawing([raw]), e = d.entities[0], g = C.annotationGeometry(e), label = g.labels[0];
  const quad = S.textQuad(label), center = mul(quad.reduce((v, q) => add(v, q), p(0, 0)), .25);
  equal(S.pick(d, center, 0).id, 1, 'dimension label is selectable far away from its insertion point');
  equal(S.windowSelect(d, p(-10, -10), p(110, 40), false), [], 'full containment includes the complete long dimension label');
  equal(S.windowSelect(d, p(center.x - .1, center.y - .1), p(center.x + .1, center.y + .1), true), [1], 'crossing can select the dimension by its label alone');
  const bounds = S.entityBounds(e); ok(bounds.max.x > 110 || bounds.min.x < -10, 'dimension bounds include label width, not just anchor');
  const exact = S.windowSelect(d, p(bounds.min.x - .01, bounds.min.y - .01), p(bounds.max.x + .01, bounds.max.y + .01));
  equal(exact, [1], 'dimension with all geometry and label contained');
  for (const style of ['horizontal', 'vertical', 'aligned', 'angular', 'radius', 'diameter']) {
    const points = style === 'angular' ? [p(20, 0), p(0, 0), p(0, 20), p(10, 10)] : [p(0, 0), p(20, 10), p(30, 30)];
    const one = drawing([{ kind: 'dimension', dimensionStyle: style, points, textHeight: 2 }]);
    const geom = C.annotationGeometry(one.entities[0]), b = S.entityBounds(one.entities[0]);
    ok(b.valid, `${style} dimension bounds`);
    equal(S.windowSelect(one, p(b.min.x - 1, b.min.y - 1), p(b.max.x + 1, b.max.y + 1)), [1], `${style} dimension containment`);
    if (geom.segments.length) { const s = geom.segments[0]; equal(S.pick(one, mul(add(s.a, s.b), .5), .01).id, 1, `${style} dimension stroke pick`); }
  }
}

{
  // Isolate the documented filled-arrow contract even if core arrow styles later change.
  const sandbox = { RasmCore: { ...C, annotationGeometry() { return { segments: [], arcs: [], labels: [], fills: [{ points: [p(0, 0), p(10, 0), p(0, 10)] }] }; } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/selection.js'), 'utf8'), sandbox);
  const select = sandbox.RasmSelection, d = { layers: [{ name: '0', visible: true, locked: false }], entities: [{ id: 1, kind: 'dimension', layer: '0', points: [] }] };
  equal(select.pick(d, p(2, 2), 0).id, 1, 'filled arrow triangle interior can be picked');
  equal(Array.from(select.windowSelect(d, p(1, 1), p(2, 2), true)), [1], 'window inside filled arrow triangle crosses visible fill');
  equal(Array.from(select.windowSelect(d, p(8, 8), p(9, 9), true)), [], 'triangle bounding-box corner is not a filled hit');
}

{
  // Independent analytical circle/rectangle invariant: a circle stroke intersects
  // a rectangle iff radius lies between nearest and farthest rectangle distance.
  let random = 89123;
  const next = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random / 0x100000000; };
  for (let i = 0; i < 300; i++) {
    const center = p(next() * 200 - 100, next() * 200 - 100), r = next() * 40 + .1;
    const a = p(next() * 250 - 125, next() * 250 - 125), b = p(a.x + next() * 60 + .1, a.y + next() * 60 + .1);
    const dx = Math.max(a.x - center.x, 0, center.x - b.x), dy = Math.max(a.y - center.y, 0, center.y - b.y);
    const nearest = Math.hypot(dx, dy), farthest = Math.max(...[a, b, p(a.x, b.y), p(b.x, a.y)].map(q => Math.hypot(q.x - center.x, q.y - center.y)));
    equal(S.windowSelect(drawing([circle(center, r)]), a, b, true).length === 1, nearest <= r && r <= farthest, `analytical crossing case ${i}`);
  }
}
function add(a, b) { return p(a.x + b.x, a.y + b.y); }
function mul(a, scale) { return p(a.x * scale, a.y * scale); }
console.log(`PASS: ${checks} geometric selection checks`);
