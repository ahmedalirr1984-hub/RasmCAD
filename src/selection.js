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
  function onArc(a, arc) { const d=angle(a-arc.startAngle);return span(arc)>=TAU-1e-12||d<=span(arc)+1e-11||TAU-d<=1e-11; }
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
  // Polygon/fence tests use analytic segment and circular-arc intersections.
  // Rebuild from current document geometry on each operation: there is no
  // revision cache which could retain stale grips or imported/edited shapes.
  const cross=(a,b)=>a.x*b.y-a.y*b.x,dot=(a,b)=>a.x*b.x+a.y*b.y;
  function pathPoints(points,min,label){
    if(!Array.isArray(points)||points.length<min||points.length>4096||!points.every(finitePoint))throw Error(label+' needs '+min+'..4096 finite points');
    return points.map(p=>({x:p.x,y:p.y}));
  }
  function segmentCuts(a,b,c,d){
    const u=sub(b,a),v=sub(d,c),w=sub(c,a),den=cross(u,v),eps=epsilon(a,b,c,d),lu=Math.hypot(u.x,u.y),lv=Math.hypot(v.x,v.y);
    if(!lu)return segmentDistance(a,c,d)<=eps?[{point:a,t:0}]:[];
    const error=Number.EPSILON*8*(Math.abs(u.x*v.y)+Math.abs(u.y*v.x));
    if(Math.abs(den)<=error){
      if(Math.abs(cross(w,u))/lu>eps)return[];
      return[c,d].map(p=>({point:p,t:dot(sub(p,a),u)/(lu*lu)})).filter(q=>q.t>=-eps/lu&&q.t<=1+eps/lu)
        .concat([a,b].filter(p=>segmentDistance(p,c,d)<=eps).map(p=>({point:p,t:dot(sub(p,a),u)/(lu*lu)})));
    }
    const t=cross(w,v)/den,s=cross(w,u)/den;
    return t>=-eps/lu&&t<=1+eps/lu&&s>=-eps/Math.max(lv,eps)&&s<=1+eps/Math.max(lv,eps)?[{point:add(a,mul(u,Math.max(0,Math.min(1,t)))),t:Math.max(0,Math.min(1,t))}]:[];
  }
  function arcCuts(arc,a,b){
    const d=sub(b,a),length=Math.hypot(d.x,d.y);if(!length)return arcDistance(a,arc)<=epsilon(a,arc.center)?[a]:[];
    const u=mul(d,1/length),v=sub(arc.center,a),along=dot(v,u),perp=cross(v,u),eps=epsilon(a,b,arc.center);
    let h2=arc.radius*arc.radius-perp*perp;if(h2<-eps*Math.max(1,arc.radius))return[];h2=Math.max(0,h2);
    return[along-Math.sqrt(h2),along+Math.sqrt(h2)].filter(t=>t>=-eps&&t<=length+eps).map(t=>add(a,mul(u,t))).filter(p=>onArc(Math.atan2(p.y-arc.center.y,p.x-arc.center.x),arc));
  }
  function edges(poly){return poly.map((p,i)=>({a:p,b:poly[(i+1)%poly.length]}));}
  function inPolygon(p,poly){return polygonDistance(p,poly)<=epsilon(p,...poly);}
  function checkedPolygon(raw){
    const p=pathPoints(raw,3,'Selection polygon');if(distance(p[0],p.at(-1))<=epsilon(p[0],p.at(-1)))p.pop();
    if(p.length<3)throw Error('Selection polygon needs three distinct vertices');
    const e=edges(p);for(const s of e)if(distance(s.a,s.b)<=epsilon(s.a,s.b))throw Error('Selection polygon has a zero-length edge');
    for(let i=0;i<e.length;i++)for(let j=i+1;j<e.length;j++)if(j!==i+1&&!(i===0&&j===e.length-1)&&segmentCuts(e[i].a,e[i].b,e[j].a,e[j].b).length)throw Error('Selection polygon must not self-intersect');
    const origin=p[0],area=e.reduce((n,s)=>n+cross(sub(s.a,origin),sub(s.b,origin)),0);if(Math.abs(area)<=epsilon(...p)**2)throw Error('Selection polygon has no area');return p;
  }
  function segmentInside(a,b,poly,pe){
    if(!inPolygon(a,poly)||!inPolygon(b,poly))return false;
    const ts=[0,1,...pe.flatMap(e=>segmentCuts(a,b,e.a,e.b).map(q=>q.t))].sort((x,y)=>x-y);
    return ts.every((t,i)=>i===0||inPolygon(add(a,mul(sub(b,a),(t+ts[i-1])/2)),poly));
  }
  function arcInside(a,poly,pe){
    const sweep=span(a),ts=[0,sweep];for(const e of pe)for(const q of arcCuts(a,e.a,e.b)){const t=angle(Math.atan2(q.y-a.center.y,q.x-a.center.x)-a.startAngle);if(t<=sweep+1e-10)ts.push(Math.min(t,sweep));}
    ts.sort((x,y)=>x-y);return ts.every((t,i)=>inPolygon(arcPoint(a,a.startAngle+t),poly)&&(i===0||inPolygon(arcPoint(a,a.startAngle+(t+ts[i-1])/2),poly)));
  }
  function arcFenceDistance(a,f){
    let best=Math.min(arcDistance(f.a,a),arcDistance(f.b,a),segmentDistance(arcPoint(a,a.startAngle),f.a,f.b),segmentDistance(arcPoint(a,a.endAngle),f.a,f.b));
    const d=sub(f.b,f.a),l2=dot(d,d),t=l2?Math.max(0,Math.min(1,dot(sub(a.center,f.a),d)/l2)):0,q=add(f.a,mul(d,t)),v=sub(q,a.center),r=Math.hypot(v.x,v.y);
    if(r&&onArc(Math.atan2(v.y,v.x),a))best=Math.min(best,Math.abs(r-a.radius));return best;
  }
  function fenceSelect(doc,raw,options={}){
    const points=pathPoints(raw,2,'Fence'),tolerance=options.tolerance??0;if(!Number.isFinite(tolerance)||tolerance<0)throw Error('Fence tolerance must be finite and nonnegative');
    const fence=points.slice(1).map((b,i)=>({a:points[i],b})).filter(s=>distance(s.a,s.b)>epsilon(s.a,s.b));if(!fence.length)throw Error('Fence needs distinct points');
    return doc.entities.filter(e=>editable(doc,e)).filter(e=>{const g=geometry(e);return fence.some(f=>g.segments.some(s=>segmentCuts(s.a,s.b,f.a,f.b).length||tolerance>0&&Math.min(segmentDistance(s.a,f.a,f.b),segmentDistance(s.b,f.a,f.b),segmentDistance(f.a,s.a,s.b),segmentDistance(f.b,s.a,s.b))<=tolerance)||g.arcs.some(a=>arcCuts(a,f.a,f.b).length||tolerance>0&&arcFenceDistance(a,f)<=tolerance)||g.polygons.some(poly=>inPolygon(f.a,poly)||edges(poly).some(s=>segmentCuts(s.a,s.b,f.a,f.b).length))||g.fillLoops.some(loops=>insideLoops(f.a,loops)||insideLoops(f.b,loops)));}).map(e=>e.id);
  }
  function polygonSelect(doc,raw,crossing=false){
    const poly=checkedPolygon(raw),pe=edges(poly),bounds=emptyBounds();for(const p of poly)include(bounds,p);
    return doc.entities.filter(e=>editable(doc,e)).filter(e=>{const g=geometry(e),b=geometryBounds(g);if(!b.valid||b.max.x<bounds.min.x||b.min.x>bounds.max.x||b.max.y<bounds.min.y||b.min.y>bounds.max.y)return false;
      if(!crossing)return g.segments.every(s=>segmentInside(s.a,s.b,poly,pe))&&g.arcs.every(a=>arcInside(a,poly,pe))&&g.polygons.every(p=>edges(p).every(s=>segmentInside(s.a,s.b,poly,pe)));
      return g.segments.some(s=>inPolygon(s.a,poly)||inPolygon(s.b,poly)||pe.some(e=>segmentCuts(s.a,s.b,e.a,e.b).length))||g.arcs.some(a=>inPolygon(arcPoint(a,a.startAngle),poly)||inPolygon(arcPoint(a,a.endAngle),poly)||pe.some(e=>arcCuts(a,e.a,e.b).length))||g.polygons.some(p=>p.some(q=>inPolygon(q,poly))||poly.some(q=>inPolygon(q,p))||edges(p).some(s=>pe.some(e=>segmentCuts(s.a,s.b,e.a,e.b).length)))||g.fillLoops.some(loops=>poly.some(p=>insideLoops(p,loops)));
    }).map(e=>e.id);
  }
  function filter(doc,options={}){
    const allowed=['kind','kinds','layer','layers','color','colors','operator','invert','includeLocked'];for(const key of Object.keys(options))if(!allowed.includes(key))throw Error('Unsupported selection filter: '+key);
    if(options.operator!==undefined&&!['all','any'].includes(options.operator))throw Error('Filter operator must be all or any');
    for(const key of ['invert','includeLocked'])if(options[key]!==undefined&&typeof options[key]!=='boolean')throw Error(key+' must be boolean');
    const criteria=[];for(const [one,many]of [['kind','kinds'],['layer','layers'],['color','colors']]){const values=options[many]??(options[one]===undefined?null:[options[one]]);if(values===null)continue;if(!Array.isArray(values)||!values.length||!values.every(v=>typeof v==='string'&&v.length))throw Error('Invalid '+many+' filter');const set=new Set(values.map(v=>one==='color'?v.toLowerCase():v));criteria.push(e=>{const layer=doc.layer(e.layer),value=one==='kind'?e.kind:one==='layer'?e.layer:(e.color||layer?.color||'').toLowerCase();return set.has(value)||one==='kind'&&e.kind==='compound'&&set.has(e.subtype);});}
    return doc.entities.filter(e=>{const layer=doc.layer(e.layer);if(!layer||layer.visible===false||layer.locked&&!options.includeLocked)return false;const match=!criteria.length||(options.operator==='any'?criteria.some(f=>f(e)):criteria.every(f=>f(e)));return options.invert?!match:match;}).map(e=>e.id);
  }
  return Object.freeze({ pick, candidates, windowSelect, fenceSelect, polygonSelect, filter, distanceToEntity, entityBounds, textQuad, setTextMeasurer });
});
