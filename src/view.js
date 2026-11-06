/* RasmCAD viewport projection and clipping. No document mutation or canvas state. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RasmView = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TAU = Math.PI * 2;
  const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const normalize = a => { const n = a % TAU; return n < 0 ? n + TAU : n; };
  function validView(v) {
    return v && finitePoint(v.camera) && Number.isFinite(v.zoom) && v.zoom > 0 &&
      Number.isFinite(v.width) && v.width > 0 && Number.isFinite(v.height) && v.height > 0;
  }
  function project(p, v) {
    return { x: (p.x - v.camera.x) * v.zoom + v.width / 2, y: (v.camera.y - p.y) * v.zoom + v.height / 2 };
  }
  function clipSegment(a, b, width, height, padding = 2) {
    if (!finitePoint(a) || !finitePoint(b) || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0 || !Number.isFinite(padding) || padding < 0) return null;
    const dx = b.x - a.x, dy = b.y - a.y;
    let lo = 0, hi = 1;
    const cuts = [[-dx, a.x + padding], [dx, width + padding - a.x], [-dy, a.y + padding], [dy, height + padding - a.y]];
    for (const [direction, available] of cuts) {
      if (direction === 0) { if (available < 0) return null; continue; }
      const t = available / direction;
      if (direction < 0) { if (t > hi) return null; lo = Math.max(lo, t); }
      else { if (t < lo) return null; hi = Math.min(hi, t); }
    }
    // Preserve endpoints already in view rather than recomputing them by subtraction.
    const at = t => t === 0 ? { ...a } : t === 1 ? { ...b } : t < .5
      ? { x: a.x + dx * t, y: a.y + dy * t }
      : { x: b.x - dx * (1 - t), y: b.y - dy * (1 - t) };
    return { a: at(lo), b: at(hi) };
  }
  function arcPolylines(e, v, errorPx = .35) {
    if (!validView(v) || !e || !finitePoint(e.points?.[0]) || !Number.isFinite(e.radius) || e.radius <= 0 || !Number.isFinite(errorPx) || errorPx <= 0) return [];
    const start = e.kind === 'circle' ? 0 : normalize(e.startAngle || 0);
    let sweep = e.kind === 'circle' ? TAU : normalize((e.endAngle || 0) - (e.startAngle || 0));
    if (sweep < 1e-12) sweep = TAU;
    const center = project(e.points[0], v), radius = e.radius * v.zoom;
    if (!finitePoint(center) || !Number.isFinite(radius) || radius <= 0) return [];
    const padding = 2, left = -padding, right = v.width + padding, top = -padding, bottom = v.height + padding;
    const inside = p => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
    const point = a => {
      // Subtract the camera in world coordinates before scaling. This keeps small
      // geometry at large survey origins as precise as the stored coordinates.
      const dx = e.points[0].x - v.camera.x, dy = v.camera.y - e.points[0].y;
      const quarter = Math.round(a / (Math.PI / 2));
      const cardinal = a === quarter * (Math.PI / 2), co = cardinal ? [1, 0, -1, 0][((quarter % 4) + 4) % 4] : Math.cos(a);
      const si = cardinal ? [0, 1, 0, -1][((quarter % 4) + 4) % 4] : Math.sin(a);
      return { x: (dx + e.radius * co) * v.zoom + v.width / 2, y: (dy - e.radius * si) * v.zoom + v.height / 2 };
    };
    const cuts = [0, sweep];
    const cut = a => { const delta = normalize(a - start); if (delta > 0 && delta < sweep) cuts.push(delta); };
    // Only tessellate angular intervals that actually reach the viewport. A global
    // vertex cap turns a large circle into distant chords when zoomed in.
    for (const x of [left, right]) {
      const q = (x - center.x) / radius;
      if (q >= -1 && q <= 1) { const a = Math.acos(q); cut(a); cut(-a); }
    }
    for (const y of [top, bottom]) {
      const q = (center.y - y) / radius;
      if (q >= -1 && q <= 1) { const a = Math.asin(q); cut(a); cut(Math.PI - a); }
    }
    cuts.sort((a, b) => a - b);
    // This form retains precision when the projected radius is enormous.
    const ratio = Math.min(1, errorPx / radius), maxStep = Math.min(Math.PI / 2, 2 * Math.asin(Math.sqrt(ratio * (2 - ratio))));
    const result = [];
    for (let i = 1; i < cuts.length; i++) {
      const from = cuts[i - 1], to = cuts[i];
      if (!(to > from) || !inside(point(start + (from + to) / 2))) continue;
      const count = Math.max(1, Math.ceil((to - from) / maxStep));
      // Browser viewports require at most a few thousand visible vertices. The
      // guard rejects pathological dimensions instead of silently degrading arcs.
      if (!Number.isFinite(count) || count > 100000) return [];
      let previous = point(start + from), path = [];
      for (let j = 1; j <= count; j++) {
        const next = point(start + from + (to - from) * j / count);
        const clipped = clipSegment(previous, next, v.width, v.height, padding);
        if (clipped) {
          const last = path[path.length - 1];
          if (!last || Math.hypot(last.x - clipped.a.x, last.y - clipped.a.y) > 1e-6) {
            if (path.length > 1) result.push(path);
            path = [clipped.a];
          }
          path.push(clipped.b);
        } else if (path.length > 1) { result.push(path); path = []; }
        previous = next;
      }
      if (path.length > 1) result.push(path);
    }
    return result;
  }
  return Object.freeze({ project, clipSegment, arcPolylines });
});
