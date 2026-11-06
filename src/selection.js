/* RasmCAD geometric picking and directional selection. No document mutation. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.RasmSelection = factory(root.RasmCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  const TAU = Math.PI * 2;
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const mul = (a, s) => ({ x: a.x * s, y: a.y * s });
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const angle = a => ((a % TAU) + TAU) % TAU;
  let textMeasurer = null, textContext;

  function epsilon(...points) {
    let scale = 1;
    for (const p of points) if (p) scale = Math.max(scale, Math.abs(p.x || 0), Math.abs(p.y || 0));
    return Math.max(1e-9, scale * Number.EPSILON);
  }
  function editable(doc, e) {
    const layer = typeof doc.layer === 'function' ? doc.layer(e.layer) : doc.layers?.find(l => l.name === (e.layer || '0'));
    return !!layer && layer.visible !== false && layer.locked !== true;
  }
  function rect(a, b) {
    return { min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) } };
  }
  function inside(p, r, eps = epsilon(p, r.min, r.max)) {
    return p.x >= r.min.x - eps && p.x <= r.max.x + eps && p.y >= r.min.y - eps && p.y <= r.max.y + eps;
  }
  function emptyBounds() { return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 }, valid: false }; }
  function include(bounds, p) {
    if (!finitePoint(p)) return;
    if (!bounds.valid) { bounds.min = { ...p }; bounds.max = { ...p }; bounds.valid = true; }
    else { bounds.min.x = Math.min(bounds.min.x, p.x); bounds.min.y = Math.min(bounds.min.y, p.y); bounds.max.x = Math.max(bounds.max.x, p.x); bounds.max.y = Math.max(bounds.max.y, p.y); }
  }
  function span(arc) {
    if (arc.full) return TAU;
    const s = angle(arc.endAngle - arc.startAngle);
    return s < 1e-12 ? TAU : s;
  }
  function onArc(a, arc) { return span(arc) >= TAU - 1e-12 || angle(a - arc.startAngle) <= span(arc) + 1e-11; }
  function arcPoint(arc, a) { return { x: arc.center.x + arc.radius * Math.cos(a), y: arc.center.y + arc.radius * Math.sin(a) }; }
  function segmentDistance(p, a, b) {
    const d = sub(b, a), length = Math.hypot(d.x, d.y);
    if (!length) return distance(p, a);
    const ux = d.x / length, uy = d.y / length;
    const px = p.x - a.x, py = p.y - a.y, projected = px * ux + py * uy;
    if (projected <= 0) return distance(p, a);
    if (projected >= length) return distance(p, b);
    // The perpendicular cross product avoids constructing and subtracting a
    // rounded closest point, which can miss an exact diagonal at tolerance zero.
    return Math.abs(px * uy - py * ux);
  }
  function arcDistance(p, arc) {
    const delta = sub(p, arc.center), radial = Math.hypot(delta.x, delta.y);
    if (onArc(Math.atan2(delta.y, delta.x), arc)) return Math.abs(radial - arc.radius);
    return Math.min(distance(p, arcPoint(arc, arc.startAngle)), distance(p, arcPoint(arc, arc.endAngle)));
  }
  function polygonDistance(p, polygon) {
    if (!polygon.length) return Infinity;
    let best = Infinity, isInside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[j], b = polygon[i];
      best = Math.min(best, segmentDistance(p, a, b));
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) isInside = !isInside;
    }
    return isInside ? 0 : best;
  }
  function measurement(value, height, suppliedWidth) {
    if (textMeasurer) {
      const result = textMeasurer(value, height);
      if (result && [result.left, result.right, result.bottom, result.top].every(Number.isFinite)) return result;
    }
    if (textContext === undefined) {
      textContext = null;
      try {
        if (typeof OffscreenCanvas !== 'undefined') textContext = new OffscreenCanvas(1, 1).getContext('2d');
        else if (typeof document !== 'undefined') textContext = document.createElement('canvas').getContext('2d');
      } catch (_) { /* Node and restricted canvas environments use deterministic metrics. */ }
    }
    if (textContext) {
      // Measure at a stable font size; drawing coordinates can be tiny or enormous.
      textContext.font = '100px Tahoma, Arial, sans-serif';
      textContext.textAlign = 'left'; textContext.textBaseline = 'alphabetic'; textContext.direction = 'ltr';
      const m = textContext.measureText(value), scale = height / 100;
      if ([m.actualBoundingBoxLeft, m.actualBoundingBoxRight, m.actualBoundingBoxAscent, m.actualBoundingBoxDescent].every(Number.isFinite)) {
        return { left: -m.actualBoundingBoxLeft * scale, right: m.actualBoundingBoxRight * scale, bottom: -m.actualBoundingBoxDescent * scale, top: m.actualBoundingBoxAscent * scale };
      }
      if (Number.isFinite(m.width)) return { left: 0, right: m.width * scale, bottom: 0, top: height };
    }
    return { left: 0, right: Number.isFinite(suppliedWidth) ? suppliedWidth : Array.from(value).length * height * .65, bottom: 0, top: height };
  }
  function textQuad(label) {
    const value = String(label.text || ''), p = label.point || label.points?.[0];
    if (!value.trim() || !finitePoint(p)) return [];
    const h = label.height || label.textHeight || 12, a = label.angle || label.startAngle || 0;
    if (!Number.isFinite(h) || h <= 0 || !Number.isFinite(a)) return [];
    const m = measurement(value, h, label.width), co = Math.cos(a), si = Math.sin(a);
    return [{ x: m.left, y: m.bottom }, { x: m.right, y: m.bottom }, { x: m.right, y: m.top }, { x: m.left, y: m.top }]
      .map(q => add(p, { x: q.x * co - q.y * si, y: q.x * si + q.y * co }));
  }
  function geometry(e) {
    const out = { segments: [], arcs: [], polygons: [], fillLoops: [] }, p = e.points || [];
    const segment = (a, b) => { if (finitePoint(a) && finitePoint(b)) out.segments.push({ a, b }); };
    const arc = a => {
      const center = a.center || a.c;
      if (finitePoint(center) && Number.isFinite(a.radius) && a.radius > 0 && Number.isFinite(a.startAngle) && Number.isFinite(a.endAngle)) out.arcs.push({ ...a, center });
    };
    const polygon = points => { if (Array.isArray(points) && points.length >= 3 && points.every(finitePoint)) out.polygons.push(points); };
    if(e.kind==='compound'){
      for(const part of e.parts||[]){const child=geometry(part);out.segments.push(...child.segments);out.arcs.push(...child.arcs);out.polygons.push(...child.polygons);out.fillLoops.push(...child.fillLoops);}
      if(['hatch','region'].includes(e.subtype)&&e.data?.loops){out.fillLoops.push(e.data.loops);for(const loop of e.data.loops)for(let i=0;i<loop.length;i++)segment(loop[i],loop[(i+1)%loop.length]);}
    }else if(e.kind==='solid')polygon(p);
    else if (e.kind === 'line' || e.kind === 'polyline') {
      for (let i = 1; i < p.length; i++) segment(p[i - 1], p[i]);
      if (e.closed && p.length > 2) segment(p.at(-1), p[0]);
    } else if (e.kind === 'circle' || e.kind === 'arc') {
      arc({ center: p[0], radius: e.radius, startAngle: e.startAngle || 0, endAngle: e.endAngle || 0, full: e.kind === 'circle' });
    } else if (e.kind === 'text') polygon(textQuad({ ...e, point: p[0] }));
    else if (e.kind === 'dimension') {
      const g = C.annotationGeometry(e);
      for (const s of g.segments || []) segment(s.a || s[0], s.b || s[1]);
      for (const a of g.arcs || []) arc(a);
      for (const l of g.labels || []) polygon(textQuad(l));
      for (const f of g.fills || []) polygon(Array.isArray(f) ? f : f.points || f.vertices);
    }
    return out;
  }
  function geometryBounds(g) {
    const bounds = emptyBounds();
    for (const s of g.segments) { include(bounds, s.a); include(bounds, s.b); }
    for (const a of g.arcs) {
      include(bounds, arcPoint(a, a.startAngle)); include(bounds, arcPoint(a, a.endAngle));
      for (let i = 0; i < 4; i++) if (onArc(i * Math.PI / 2, a)) include(bounds, arcPoint(a, i * Math.PI / 2));
    }
    for (const polygon of g.polygons) for (const p of polygon) include(bounds, p);
    return bounds;
  }
  function entityBounds(e) { return geometryBounds(geometry(e)); }
  function insideLoops(p,loops){
    let inside=false;
    for(const polygon of loops){let within=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)within=!within;}if(within)inside=!inside;}
    return inside;
  }
  function distanceToGeometry(p, g) {
    let result = g.fillLoops.some(loops=>insideLoops(p,loops))?0:Infinity;
    for (const s of g.segments) result = Math.min(result, segmentDistance(p, s.a, s.b));
    for (const a of g.arcs) result = Math.min(result, arcDistance(p, a));
    for (const polygon of g.polygons) result = Math.min(result, polygonDistance(p, polygon));
    return result;
  }
  function distanceToEntity(e, p) { return finitePoint(p) ? distanceToGeometry(p, geometry(e)) : Infinity; }
  function candidates(doc, p, tolerance) {
    if (!doc || !Array.isArray(doc.entities) || !finitePoint(p) || !Number.isFinite(tolerance) || tolerance < 0) return [];
    const ranked = [];
    for (let i = 0; i < doc.entities.length; i++) {
      const e = doc.entities[i]; if (!editable(doc, e)) continue;
      const g = geometry(e), b = geometryBounds(g);
      if (!b.valid || p.x < b.min.x - tolerance || p.x > b.max.x + tolerance || p.y < b.min.y - tolerance || p.y > b.max.y + tolerance) continue;
      const d = distanceToGeometry(p, g);
      if (!Number.isFinite(d)) continue;
      // Distances are measured in a local frame. A tolerance based on the absolute
      // survey origin can expand a seven-pixel aperture to twenty pixels and make
      // a farther stroke steal a pick from the one directly under the pointer.
      const distanceEpsilon = Math.max(d, tolerance) * Number.EPSILON * 16;
      if (d <= tolerance + distanceEpsilon) ranked.push({ e, d, index: i });
    }
    ranked.sort((a, b) => Math.abs(a.d - b.d) <= Math.max(a.d, b.d) * Number.EPSILON * 16 ? b.index - a.index : a.d - b.d);
    return ranked.map(item => item.e);
  }
  function pick(doc, p, tolerance) { return candidates(doc, p, tolerance)[0] || null; }
  function segmentCrosses(a, b, r) {
    // Slab clipping handles corner touches, collinear edges and degenerate segments.
    const eps = epsilon(a, b, r.min, r.max), d = sub(b, a);
    let lo = 0, hi = 1;
    for (const axis of ['x', 'y']) {
      if (Math.abs(d[axis]) <= eps) { if (a[axis] < r.min[axis] - eps || a[axis] > r.max[axis] + eps) return false; }
      else {
        let t0 = (r.min[axis] - eps - a[axis]) / d[axis], t1 = (r.max[axis] + eps - a[axis]) / d[axis];
        if (t0 > t1) [t0, t1] = [t1, t0]; lo = Math.max(lo, t0); hi = Math.min(hi, t1);
        if (lo > hi) return false;
      }
    }
    return hi >= 0 && lo <= 1;
  }
  function arcCrosses(a, r) {
    if (inside(arcPoint(a, a.startAngle), r) || inside(arcPoint(a, a.endAngle), r)) return true;
    const eps = epsilon(a.center, r.min, r.max), radius = a.radius;
    function hit(p) { return inside(p, r, eps) && onArc(Math.atan2(p.y - a.center.y, p.x - a.center.x), a); }
    for (const x of [r.min.x, r.max.x]) {
      const dx = x - a.center.x;
      if (Math.abs(dx) > radius + eps) continue;
      const dy = Math.sqrt(Math.max(0, radius * radius - dx * dx));
      if (hit({ x, y: a.center.y - dy }) || hit({ x, y: a.center.y + dy })) return true;
    }
    for (const y of [r.min.y, r.max.y]) {
      const dy = y - a.center.y;
      if (Math.abs(dy) > radius + eps) continue;
      const dx = Math.sqrt(Math.max(0, radius * radius - dy * dy));
      if (hit({ x: a.center.x - dx, y }) || hit({ x: a.center.x + dx, y })) return true;
    }
    return false;
  }
  function polygonCrosses(polygon, r) {
    if (polygon.some(p => inside(p, r))) return true;
    for (let i = 0; i < polygon.length; i++) if (segmentCrosses(polygon[i], polygon[(i + 1) % polygon.length], r)) return true;
    return [r.min, r.max, { x: r.min.x, y: r.max.y }, { x: r.max.x, y: r.min.y }].some(p => polygonDistance(p, polygon) === 0);
  }
  function windowSelect(doc, a, b, crossing = false) {
    if (!doc || !Array.isArray(doc.entities) || !finitePoint(a) || !finitePoint(b)) return [];
    const r = rect(a, b), result = [];
    for (const e of doc.entities) {
      if (!editable(doc, e)) continue;
      const g = geometry(e), bounds = geometryBounds(g); if (!bounds.valid) continue;
      if (inside(bounds.min, r) && inside(bounds.max, r)) { result.push(e.id); continue; }
      if (!crossing) continue;
      const eps = epsilon(r.min, r.max, bounds.min, bounds.max);
      if (bounds.max.x < r.min.x - eps || bounds.min.x > r.max.x + eps || bounds.max.y < r.min.y - eps || bounds.min.y > r.max.y + eps) continue;
      if (g.segments.some(s => segmentCrosses(s.a, s.b, r)) || g.arcs.some(a => arcCrosses(a, r)) || g.polygons.some(p => polygonCrosses(p, r)) || g.fillLoops.some(loops=>[r.min,r.max,{x:r.min.x,y:r.max.y},{x:r.max.x,y:r.min.y}].some(p=>insideLoops(p,loops)))) result.push(e.id);
    }
    return result;
  }
  function setTextMeasurer(measurer) {
    if (measurer !== null && typeof measurer !== 'function') throw new TypeError('Text measurer must be a function or null');
    textMeasurer = measurer;
  }
  return Object.freeze({ pick, candidates, windowSelect, distanceToEntity, entityBounds, textQuad, setTextMeasurer });
});
