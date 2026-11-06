/* RasmCAD editable geometry grips. No document is changed during a preview. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.RasmGrips = factory(root.RasmCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  if (!C || !C.Document || !C.validateEntity) throw new Error('RasmCore must be loaded before RasmGrips');

  const MAX_GRIPS = 256;
  const TAU = Math.PI * 2;
  const copyPoint = p => ({ x: p.x, y: p.y });
  const finitePoint = p => !!p && typeof p.x === 'number' && typeof p.y === 'number' &&
    Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 1e12 && Math.abs(p.y) <= 1e12;
  const at = (e, angle) => ({ x: e.points[0].x + e.radius * Math.cos(angle), y: e.points[0].y + e.radius * Math.sin(angle) });

  function handles(entity) {
    if (!entity || !Array.isArray(entity.points) || !entity.points.length) return [];
    const result = [];
    const push = (key, point, role) => { if (finitePoint(point)) result.push({ key, point: copyPoint(point), role }); };
    if(entity.kind==='compound'){push('origin',entity.points[0],'compound-origin');}
    else if (entity.kind === 'circle' || entity.kind === 'arc') {
      push('center', entity.points[0], 'center');
      if (!Number.isFinite(entity.radius) || entity.radius <= 0) return result;
      if (entity.kind === 'circle') {
        // Exact cardinal coordinates avoid tiny sine/cosine offsets at 90 degrees.
        const p = entity.points[0], r = entity.radius;
        [ { x: p.x + r, y: p.y }, { x: p.x, y: p.y + r },
          { x: p.x - r, y: p.y }, { x: p.x, y: p.y - r } ]
          .forEach((point, i) => push('radius:' + i, point, 'radius'));
      } else {
        if (Number.isFinite(entity.startAngle)) push('start', at(entity, entity.startAngle), 'arc-start');
        if (Number.isFinite(entity.endAngle)) push('end', at(entity, entity.endAngle), 'arc-end');
      }
    } else if (entity.kind === 'line' || entity.kind === 'polyline' || entity.kind === 'text' || entity.kind === 'dimension') {
      const count = entity.kind === 'text' ? 1 : entity.kind === 'line' ? Math.min(2, entity.points.length) : entity.points.length;
      const displayed = Math.min(count, MAX_GRIPS);
      for (let slot = 0; slot < displayed; slot++) {
        // Evenly sample a very large polyline. Include both endpoints and retain
        // the original vertex index in the key so editing never targets a proxy.
        const i = displayed === count ? slot : Math.round(slot * (count - 1) / (displayed - 1));
        let role = entity.kind === 'line' ? 'endpoint' : entity.kind === 'text' ? 'text-anchor' : 'vertex';
        if (entity.kind === 'dimension') role = i === count - 1 ? 'dimension-location' : 'dimension-anchor';
        push('point:' + i, entity.points[i], role);
      }
    }
    return result;
  }

  function normalizedClone(entity) {
    C.validateEntity(entity);
    const document = new C.Document();
    const layer = entity.layer === undefined ? '0' : entity.layer;
    document.layers = [{ name: layer, color: '#ffffff', visible: true, locked: false }];
    document.currentLayer = layer;
    document.nextId = entity.id === undefined ? 1 : entity.id;
    document.add(entity);
    return document.entities[0];
  }

  function preview(entity, key, target) {
    if (!finitePoint(target)) throw new Error('Grip target must contain finite X and Y coordinates within the drawing limits');
    if (typeof key !== 'string') throw new Error('Invalid grip key');
    const candidate = normalizedClone(entity);
    if(candidate.kind==='compound'&&key==='origin'){
      const doc=new C.Document();doc.layers=[{name:candidate.layer,color:'#ffffff',visible:true,locked:false}];doc.currentLayer=candidate.layer;doc.nextId=candidate.id;doc.add(candidate);
      doc.transform([candidate.id],{translation:{x:target.x-candidate.points[0].x,y:target.y-candidate.points[0].y}});
      return doc.entities[0];
    }else if ((candidate.kind === 'circle' || candidate.kind === 'arc') && key === 'center') {
      candidate.points[0] = copyPoint(target);
    } else if (candidate.kind === 'circle' && /^radius:[0-3]$/.test(key)) {
      const radius = C.distance(candidate.points[0], target);
      if (!(radius > 0)) throw new Error('A circle radius must be greater than zero');
      candidate.radius = radius;
    } else if (candidate.kind === 'arc' && (key === 'start' || key === 'end')) {
      const center = candidate.points[0], dx = target.x - center.x, dy = target.y - center.y;
      if (dx === 0 && dy === 0) throw new Error('An arc endpoint cannot be dragged onto its center');
      // Endpoint grips change the angle only. The radius stays fixed, projecting
      // the cursor onto the circle. Keep the original angle's full-turn branch.
      const field = key === 'start' ? 'startAngle' : 'endAngle';
      const angle = Math.atan2(dy, dx), oldAngle = candidate[field];
      const nextAngle = angle + Math.round((oldAngle - angle) / TAU) * TAU;
      if (Math.abs(nextAngle - oldAngle) > 1e-12) candidate[field] = nextAngle;
    } else if (['line', 'polyline', 'text', 'dimension'].includes(candidate.kind) && /^point:(0|[1-9]\d*)$/.test(key)) {
      const index = Number(key.slice(6));
      if (!Number.isSafeInteger(index) || index >= candidate.points.length) throw new Error('Grip vertex does not exist');
      candidate.points[index] = copyPoint(target);
    } else throw new Error('Grip does not belong to this entity');
    // Normalize again after the edit. This validates dimensions' derived
    // geometry as well as primitive coordinates, radius, text and style values.
    return normalizedClone(candidate);
  }

  function apply(document, id, key, target) {
    if (!document || typeof document.serialize !== 'function' || typeof document.checkpoint !== 'function') {
      throw new TypeError('Grip edits require a RasmCAD document');
    }
    const index = document.entities.findIndex(entity => entity.id === id);
    if (index < 0) return false;
    const entity = document.entities[index];
    const layer = typeof document.layer === 'function' ? document.layer(entity.layer) : document.layers.find(item => item.name === entity.layer);
    if (!layer || !layer.visible || layer.locked) return false;

    const before = document.serialize();
    const proposed = C.Document.parse(before);
    proposed.entities[index] = preview(entity, key, target);
    const after = proposed.serialize(); // Validate the complete drawing first.
    if (before === after) return false;

    // All potentially failing validation happens before the single checkpoint.
    // Preview/cancel and invalid/no-op drags leave both history stacks intact.
    document.checkpoint();
    document.entities[index] = proposed.entities[index];
    return true;
  }

  return Object.freeze({ handles, preview, apply, MAX_GRIPS });
});
