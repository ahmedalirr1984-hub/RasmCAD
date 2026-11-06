'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Q = require('../src/commands.js');
let checks = 0;
const p = (x, y) => ({ x, y });
function equal(actual, expected, message) { checks++; assert.deepEqual(actual, expected, message); }
function ok(value, message) { checks++; assert(value, message); }
function throws(fn, pattern) { checks++; assert.throws(fn, pattern); }
function near(actual, expected, message) {
  checks++;
  const tolerance = Math.max(1e-11, Math.abs(expected) * 1e-12);
  assert(Math.abs(actual - expected) <= tolerance, `${message || 'value'}: ${actual} versus ${expected}`);
}
function nearPoint(actual, expected, message) { near(actual.x, expected.x, message + ' x'); near(actual.y, expected.y, message + ' y'); }

equal(Q.normalizeInput('٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹'), '0123456789 0123456789');
equal(Q.normalizeInput('\ufeff\u200f−١٬٢٣٤٫٥،\u200e−۶٫۲\u061c'), '-1234.5,-6.2');
equal(Q.normalizeInput('\u202eLINE\u202c \u2067١٠\u2069'), 'LINE 10');
equal(Q.normalizeInput(null), '');
equal(Q.normalizeInput('  LINE  '), '  LINE  ', 'normalization does not alter useful whitespace');

for (const [input, expected] of [['0', 0], [' -12.5 ', -12.5], ['+.5', .5], ['5.', 5], ['2e3', 2000], ['-4.2E-2', -.042], ['١٢٫٥', 12.5], ['−٢٬٥٠٠', -2500], [42, 42]])
  equal(Q.number(input), expected, 'strict numeric input ' + input);
for (const input of ['', ' ', null, undefined, '12px', '1 2', '1,2', '0x10', '0b11', 'Infinity', '-Infinity', 'NaN', '1e', '1e309', '--1', '.', true, {}, [], [1]])
  equal(Q.number(input), null, 'reject malformed/nonfinite input ' + input);

equal(Q.parsePoint('10,-20'), p(10, -20));
equal(Q.parsePoint(' ١٢٫٥ ، −٣ '), p(12.5, -3));
equal(Q.parsePoint('+1e3, -.25E2'), p(1000, -25));
equal(Q.parsePoint('1,2', p(100, 100)), p(1, 2), 'absolute coordinates ignore an existing base');
equal(Q.parsePoint('@ -3, 4', p(10, -10)), p(7, -6));
equal(Q.parsePoint('@١٠<٩٠', p(5, 7)), p(5, 17));
equal(Q.parsePoint('@10<0', p(-5, -7)), p(5, -7));
equal(Q.parsePoint('@10<180', p(5, 7)), p(-5, 7));
equal(Q.parsePoint('@10<-90', p(5, 7)), p(5, -3));
equal(Q.parsePoint('@10<450', p(5, 7)), p(5, 17));
equal(Q.parsePoint('@0<45', p(5, 7)), p(5, 7), 'zero polar vector is valid coordinate input');
equal(Q.parsePoint('@-10<90', p(5, 7)), p(5, -3), 'signed polar distance reverses the direction');
nearPoint(Q.parsePoint('@10<45', p(10, 20)), p(10 + Math.sqrt(50), 20 + Math.sqrt(50)), 'relative 45-degree polar point');
equal(Q.parsePoint('1000000000000,-1e12'), p(1e12, -1e12));
equal(Q.parsePoint('@2e12,0', p(-1e12, 0)), p(1e12, 0), 'a long finite delta is allowed when the result stays in range');
for (const input of ['', 'LINE', '1', '1,', ',2', '1,2,3', '@@1,2', '1px,2', '1;2', '10<45', '1e,2', '1,2 foo'])
  equal(Q.parsePoint(input), null, 'reject malformed point ' + input);
throws(() => Q.parsePoint('@1,2'), /base point/i);
throws(() => Q.parsePoint('@10<45'), /base point/i);
throws(() => Q.parsePoint('@1,2', p(NaN, 0)), /finite coordinates/i);
throws(() => Q.parsePoint('1e309,2'), /finite/i);
throws(() => Q.parsePoint('1000000000001,0'), /finite coordinates/i);
throws(() => Q.parsePoint('@1,0', p(1e12, 0)), /finite coordinates/i);
throws(() => Q.parsePoint('@1e309<0', p(0, 0)), /finite/i);

const start = p(10, 20);
for (const [cursor, expected] of [[p(13, 24), p(16, 28)], [p(7, 24), p(4, 28)], [p(7, 16), p(4, 12)], [p(13, 16), p(16, 12)]]) {
  const end = Q.distancePoint(start, 10, cursor);
  nearPoint(end, expected, 'scalar distance in every quadrant');
  near(Math.hypot(end.x - start.x, end.y - start.y), 10, 'entered length is independent of cursor distance');
}
equal(Q.distancePoint(start, '١٠'), p(20, 20), 'no pointer uses +X');
equal(Q.distancePoint(start, 10, start), p(20, 20), 'zero pointer displacement uses +X');
equal(Q.distancePoint(start, 10, start, { lastDirection: p(0, -5) }), p(10, 10), 'zero displacement preserves the last direction');
nearPoint(Q.distancePoint(start, 10, null, { lastDirection: p(-3, 4) }), p(4, 28), 'last direction is normalized');
equal(Q.distancePoint(start, 10, p(NaN, 0), { lastDirection: p(-1, 0) }), p(0, 20), 'invalid optional pointer safely uses last direction');
equal(Q.distancePoint(start, 10, null, { lastDirection: p(0, 0) }), p(20, 20), 'zero last direction falls back to +X');
equal(Q.distancePoint(start, 10, p(10, 19), { lastDirection: p(1, 0) }), p(10, 10), 'a current cursor bearing wins over last direction');
for (const [cursor, expected] of [[p(12, 21), p(20, 20)], [p(8, 21), p(0, 20)], [p(11, 18), p(10, 10)], [p(9, 22), p(10, 30)], [p(9, 19), p(0, 20)]])
  equal(Q.distancePoint(start, 10, cursor, { ortho: true }), expected, 'Ortho projects dominant signed axis; ties use X');
equal(Q.distancePoint(start, 10, null, { ortho: true, lastDirection: p(-1, 4) }), p(10, 30));
equal(Q.distancePoint(start, 10, null, { angleDegrees: '-٩٠' }), p(10, 10));
equal(Q.distancePoint(start, 10, null, { angleDegrees: 360 }), p(20, 20));
nearPoint(Q.distancePoint(start, 10, p(-100, 20), { ortho: true, angleDegrees: 45 }), p(10 + Math.sqrt(50), 20 + Math.sqrt(50)), 'explicit angle overrides pointer and Ortho');
nearPoint(Q.distancePoint(p(0, 0), 10, p(Number.MAX_VALUE, Number.MAX_VALUE)), p(Math.sqrt(50), Math.sqrt(50)), 'large vectors normalize without overflowing');
equal(Q.distancePoint(p(0, 0), 5e-324, p(5e-324, 0)), p(5e-324, 0), 'tiny finite vectors remain usable');
equal(Q.distancePoint(p(1e12 - 10, 0), 10), p(1e12, 0), 'coordinate boundary is inclusive');
for (const invalid of [0, -1, Infinity, NaN, null, '', 'bad', '10px', '1e309'])
  throws(() => Q.distancePoint(start, invalid), /positive finite/i);
throws(() => Q.distancePoint(p(NaN, 0), 10), /finite coordinates/i);
throws(() => Q.distancePoint(null, 10), /finite coordinates/i);
throws(() => Q.distancePoint(p(1e12, 0), 1), /finite coordinates/i);
throws(() => Q.distancePoint(start, 1e20), /finite coordinates/i);
throws(() => Q.distancePoint(start, 10, null, { angleDegrees: 'north' }), /angle.*finite/i);
const immutableBase = Object.freeze(p(1, 2)), immutableCursor = Object.freeze(p(4, 6));
Q.distancePoint(immutableBase, 5, immutableCursor, Object.freeze({ lastDirection: Object.freeze(p(1, 0)) }));
equal(immutableBase, p(1, 2), 'helpers never mutate base points');
equal(immutableCursor, p(4, 6), 'helpers never mutate cursor points');

equal(Q.commandSplit('  line   @١٠،٢  '), { name: 'LINE', rest: '@10,2' });
equal(Q.commandSplit('\u200fDimtxt\t۱۲٫۵'), { name: 'DIMTXT', rest: '12.5' });
equal(Q.commandSplit('layer Wall A'), { name: 'LAYER', rest: 'Wall A' }, 'rest preserves case and internal spacing');
equal(Q.commandSplit(''), { name: '', rest: '' });
equal(Q.commandSplit(null), { name: '', rest: '' });
equal(Q.commandSplit('HELP'), { name: 'HELP', rest: '' });
equal(Q.suggest('li').map(entry => entry.name), ['LINE', 'LIST']);
equal(Q.suggest('\u200eoff').map(entry => entry.name), ['OFFSET']);
equal(Q.suggest('dim', 3).map(entry => entry.name), ['DIM', 'DIMANGULAR', 'DIMASZ']);
equal(Q.suggest('dim', 0), []);
equal(Q.suggest('dim', -1), []);
equal(Q.suggest('dim', 2.9).length, 2);
equal(Q.suggest('dim').length, 8);
for (const input of ['', '   ', 'LINE ', 'LINE 1,2', '1', '@10,20', 'notacommand']) equal(Q.suggest(input), []);
equal(Q.catalog.length, new Set(Q.catalog.map(entry => entry.name)).size, 'completion catalog has no duplicate words');
ok(Q.catalog.every(entry => /^[A-Z]+$/.test(entry.name) && entry.description.length > 10), 'all entries have usable English descriptions');
ok(Q.catalog.some(entry => entry.name === 'DIMVERTICAL'), 'vertical dimensions are discoverable');
ok(!Q.catalog.some(entry => ['L', 'CO', 'DLI', 'EXTRUDE', 'DWGOUT'].includes(entry.name)), 'aliases and unsupported operations are not advertised');
ok(Object.isFrozen(Q.catalog) && Q.catalog.every(Object.isFrozen), 'catalog cannot be modified by consumers');

// The same source exposes the browser global without requiring DOM or Node.
const sandbox = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/precision.js'), 'utf8'), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/commands.js'), 'utf8'), sandbox);
ok(sandbox.RasmCommands && typeof sandbox.RasmCommands.distancePoint === 'function', 'UMD browser global');
equal(JSON.parse(JSON.stringify(sandbox.RasmCommands.parsePoint('@١٠<٩٠', p(5, 5)))), p(5, 15));
equal(sandbox.RasmCommands.number('−١٢٫٥'), -12.5);

console.log(`Command input v0.5: ${checks} checks passed.`);
