/* RasmCAD Browser: independent dependency-free 2D document and geometry core. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RasmCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PI = Math.PI, TAU = PI * 2;
  const MAX_FILE = 64 * 1024 * 1024, MAX_ENTITIES = 100000;
  const MAX_POINTS = 100000, MAX_TOTAL_POINTS = 1000000, MAX_LAYERS = 4096;
  const MAX_COORD = 1e12, HISTORY_BUDGET = 16 * 1024 * 1024;
  const KINDS = new Set(['line', 'polyline', 'circle', 'arc', 'text', 'dimension', 'compound', 'solid']);
  const OWN = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const get = (o, k, fallback) => OWN(o, k) ? o[k] : fallback;
  function requireValue(condition, message) { if (!condition) throw new Error(message); }
  function object(value, label) {
    requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), label + ' must be an object');
    return value;
  }
  function number(value, label) {
    requireValue(typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORD, 'Invalid ' + label);
    return value;
  }
  function positive(value, label) { number(value, label); requireValue(value > 0, label + ' must be positive'); return value; }
  function nonnegative(value, label) { number(value, label); requireValue(value >= 0, label + ' must not be negative'); return value; }
  function identifier(value, label) {
    requireValue(Number.isSafeInteger(value) && value > 0 && value < Number.MAX_SAFE_INTEGER, 'Invalid ' + label); return value;
  }
  function bool(value, label) { requireValue(typeof value === 'boolean', 'Invalid ' + label); return value; }
  function string(value, limit, label, emptyAllowed) {
    requireValue(typeof value === 'string' && (emptyAllowed || value.length > 0) && value.length <= limit, 'Invalid ' + label + ' length');
    requireValue(!/[\u0000\r\n]/.test(value), 'Invalid control character in ' + label);
    // Reject unpaired UTF-16 surrogates so downloads preserve text faithfully.
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF) { requireValue(i + 1 < value.length && value.charCodeAt(i + 1) >= 0xDC00 && value.charCodeAt(i + 1) <= 0xDFFF, 'Invalid Unicode in ' + label); i++; }
      else requireValue(c < 0xDC00 || c > 0xDFFF, 'Invalid Unicode in ' + label);
    }
    return value;
  }
  function color(value, byLayer) {
    if (byLayer && value === null) return null;
    requireValue(typeof value === 'string' && /^#[\da-f]{6}$/i.test(value), 'Invalid color'); return value.toLowerCase();
  }
  function point(value) { object(value, 'Point'); return { x: number(get(value, 'x'), 'X coordinate'), y: number(get(value, 'y'), 'Y coordinate') }; }
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const mul = (a, s) => ({ x: a.x * s, y: a.y * s });
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const normalizedAngle = a => ((a % TAU) + TAU) % TAU;
  function arcSpan(start, end) { const span = normalizedAngle(end - start); return span < 1e-12 ? TAU : span; }
  function onArc(a, start, end) { const delta=normalizedAngle(a-start);return delta<=arcSpan(start,end)+1e-10||TAU-delta<=1e-10; }
  function normalizedLayer(raw) {
    object(raw, 'Layer');
    return { name: string(get(raw, 'name'), 255, 'layer name', false), color: color(get(raw, 'color', '#e5edf5'), false),
      visible: bool(get(raw, 'visible', true), 'layer visibility'), locked: bool(get(raw, 'locked', false), 'layer lock') };
  }
  const COMPOUND_TYPES = new Set(['hatch','region','block','spline','leader']);
  function jsonData(value, depth = 0, budget = {nodes:0}, path = new Set()) {
    requireValue(depth <= 32 && ++budget.nodes <= 2000000, 'Metadata exceeds complexity limit');
    if(value===null||typeof value==='boolean')return value;
    if(typeof value==='number')return number(value,'metadata number');
    if(typeof value==='string'){requireValue(value.length<=1000000&&!value.includes('\0'),'Invalid metadata string');return value;}
    requireValue(value&&typeof value==='object'&&!path.has(value),'Invalid or cyclic metadata');path.add(value);
    let result;
    if(Array.isArray(value)){requireValue(value.length<=MAX_TOTAL_POINTS,'Metadata array is too large');result=value.map(v=>jsonData(v,depth+1,budget,path));}
    else {const keys=Object.keys(value);requireValue(keys.length<=100000,'Metadata object is too large');result={};for(const key of keys){requireValue(key.length<=255,'Metadata key is too long');Object.defineProperty(result,key,{value:jsonData(value[key],depth+1,budget,path),enumerable:true,writable:true,configurable:true});}}
    path.delete(value);return result;
  }
  function normalizedResources(raw) {
    const resources=jsonData(raw===undefined?{}:object(raw,'Resources'));
    for(const key of ['blocks','dimStyles','plot'])if(!OWN(resources,key))resources[key]={};
    for(const key of ['blocks','dimStyles','plot'])object(resources[key],key+' resources');
    return resources;
  }
  function resourcePointCount(value,depth=0,path=new Set()){
    if(value===null||typeof value!=='object')return 0;
    requireValue(depth<=32&&!path.has(value),'Invalid or cyclic resources');path.add(value);
    let count=!Array.isArray(value)&&OWN(value,'x')&&OWN(value,'y')?1:0;
    for(const child of Object.values(value)){count+=resourcePointCount(child,depth+1,path);requireValue(count<=MAX_TOTAL_POINTS,'Resources have too many points');}
    path.delete(value);return count;
  }
  function entityMetrics(e) {let points=e.points.length+(e.data?.loops||[]).reduce((sum,loop)=>sum+loop.length,0)+(e.data?.paths||[]).reduce((sum,path)=>sum+path.length,0),entities=1;for(const part of e.parts||[]){const n=entityMetrics(part);points+=n.points;entities+=n.entities;}return{points,entities};}
  function normalizedEntity(raw, defaultLayer, assignedId, depth = 0, budget = {points:0,entities:0}) {
    requireValue(depth<=4&&++budget.entities<=MAX_ENTITIES,'Compound nesting or entity limit exceeded');
    object(raw, 'Entity'); const kind = get(raw, 'kind'); requireValue(KINDS.has(kind), 'Unsupported entity kind');
    const rawPoints = get(raw, 'points'); requireValue(Array.isArray(rawPoints) && rawPoints.length <= MAX_POINTS, 'Invalid entity point array');
    const dimensionStyle = kind === 'dimension' ? get(raw, 'dimensionStyle', 'aligned') : 'aligned';
    if (kind === 'dimension') requireValue(['aligned','horizontal','vertical','angular','radius','diameter','ordinateX','ordinateY'].includes(dimensionStyle), 'Unknown dimension style');
    const needed = kind === 'line' || kind === 'polyline' ? 2 : kind === 'solid' ? 3 : kind === 'dimension' ? (dimensionStyle === 'angular' ? 4 : 3) : 1;
    requireValue(rawPoints.length >= needed && (['polyline','compound'].includes(kind) || kind==='solid'&&rawPoints.length<=4 || rawPoints.length === needed), 'Unexpected entity point count');
    budget.points+=rawPoints.length;requireValue(budget.points<=MAX_TOTAL_POINTS,'Document has too many points');
    const e = { id: identifier(assignedId === undefined ? get(raw, 'id') : assignedId, 'entity ID'), kind,
      points: rawPoints.map(point), radius: number(get(raw, 'radius', 0), 'radius'),
      startAngle: number(get(raw, 'startAngle', 0), 'start angle'), endAngle: number(get(raw, 'endAngle', 0), 'end angle'),
      closed: bool(get(raw, 'closed', false), 'polyline closure'), text: string(get(raw, 'text', ''), 1000000, 'text', true),
      textHeight: positive(get(raw, 'textHeight', 12), 'text height'), layer: string(get(raw, 'layer', defaultLayer || '0'), 255, 'layer name', false),
      color: color(get(raw, 'color', null), true), lineWidth: positive(get(raw, 'lineWidth', 1), 'line width') };
    if(kind==='solid')e.closed=true;
    if(kind==='compound'){
      e.subtype=get(raw,'subtype');requireValue(COMPOUND_TYPES.has(e.subtype),'Unknown compound subtype');
      const parts=get(raw,'parts',[]);requireValue(Array.isArray(parts)&&parts.length<=MAX_ENTITIES,'Invalid compound parts');
      e.parts=parts.map((part,index)=>normalizedEntity(part,e.layer,index+1,depth+1,budget));
      e.data=jsonData(get(raw,'data',{}));object(e.data,'Compound metadata');
      if(e.data.loops!==undefined){requireValue(Array.isArray(e.data.loops)&&e.data.loops.length<=MAX_POINTS,'Invalid compound loops');e.data.loops=e.data.loops.map(loop=>{requireValue(Array.isArray(loop)&&loop.length>=3&&loop.length<=MAX_POINTS,'Invalid boundary loop');budget.points+=loop.length;requireValue(budget.points<=MAX_TOTAL_POINTS,'Document has too many points');return loop.map(point);});}
      if(e.data.paths!==undefined){requireValue(Array.isArray(e.data.paths)&&e.data.paths.length<=MAX_POINTS,'Invalid leader paths');e.data.paths=e.data.paths.map(path=>{requireValue(Array.isArray(path)&&path.length>=2&&path.length<=MAX_POINTS,'Invalid leader path');budget.points+=path.length;requireValue(budget.points<=MAX_TOTAL_POINTS,'Document has too many points');return path.map(point);});}
      if(e.data.textPoint!==undefined)e.data.textPoint=point(e.data.textPoint);
      if(e.data.matrix!==undefined)requireValue(Array.isArray(e.data.matrix)&&e.data.matrix.length===6&&e.data.matrix.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=MAX_COORD),'Invalid block transform matrix');
    }
    if (kind === 'dimension') {
      if(OWN(raw,'styleName'))e.styleName=string(raw.styleName,255,'dimension style name',false);
      e.dimensionStyle = dimensionStyle;
      e.dimensionScale = positive(get(raw, 'dimensionScale', 1), 'dimension scale');
      e.arrowSize = positive(get(raw, 'arrowSize', e.textHeight * .6), 'arrow size');
      e.extensionOffset = nonnegative(get(raw, 'extensionOffset', e.textHeight * .15), 'extension offset');
      e.extensionExtend = nonnegative(get(raw, 'extensionExtend', e.textHeight * .25), 'extension extension');
      e.textGap = nonnegative(get(raw, 'textGap', e.textHeight * .35), 'text gap');
      e.precision = get(raw, 'precision', 2);
      requireValue(Number.isInteger(e.precision) && e.precision >= 0 && e.precision <= 8, 'Dimension precision must be an integer from 0 to 8');
      e.prefix = string(get(raw, 'prefix', ''), 128, 'dimension prefix', true);
      e.suffix = string(get(raw, 'suffix', ''), 128, 'dimension suffix', true);
      e.textColor = color(get(raw, 'textColor', null), true);
      e.dimensionColor = color(get(raw, 'dimensionColor', null), true);
      e.arrowStyle = get(raw, 'arrowStyle', 'closed');
      requireValue(['closed','open','tick'].includes(e.arrowStyle), 'Unknown dimension arrow style');
      annotationGeometry(e);
    }
    if (kind === 'circle' || kind === 'arc') positive(e.radius, 'radius');
    return e;
  }
  function validateEntity(e) { normalizedEntity(e, '0', get(e, 'id', 1) || 1); return true; }
  function validateState(raw) {
    object(raw, 'Document');
    const rawLayers = get(raw, 'layers'), rawEntities = get(raw, 'entities');
    requireValue(Array.isArray(rawLayers) && rawLayers.length > 0 && rawLayers.length <= MAX_LAYERS, 'Invalid layer count');
    requireValue(Array.isArray(rawEntities) && rawEntities.length <= MAX_ENTITIES, 'Invalid entity count');
    const layers = rawLayers.map(normalizedLayer), names = new Set();
    for (const layer of layers) { requireValue(!names.has(layer.name), 'Duplicate layer name'); names.add(layer.name); }
    const currentLayer = string(get(raw, 'currentLayer'), 255, 'current layer', false);
    requireValue(names.has(currentLayer), 'Current layer does not exist');
    const entities = [], ids = new Set(),budget={points:0,entities:0}; let maxId = 0, pointCount = 0;
    for (const rawEntity of rawEntities) {
      const e = normalizedEntity(rawEntity, '0',undefined,0,budget); requireValue(names.has(e.layer), 'Entity layer does not exist');
      requireValue(!ids.has(e.id), 'Duplicate entity ID'); ids.add(e.id); maxId = Math.max(maxId, e.id);
      pointCount += e.points.length; requireValue(pointCount <= MAX_TOTAL_POINTS, 'Document has too many points'); entities.push(e);
    }
    const nextId = identifier(get(raw, 'nextId'), 'next entity ID'); requireValue(nextId > maxId, 'Next entity ID must exceed existing IDs');
    const resources=normalizedResources(get(raw,'resources',undefined));requireValue(budget.points+resourcePointCount(resources)<=MAX_TOTAL_POINTS,'Document resources and geometry have too many points');
    return { entities, layers, currentLayer, nextId, resources };
  }
  function emptyBounds() { return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 }, valid: false }; }
  function include(b, p) {
    if (!b.valid) { b.min = { x: p.x, y: p.y }; b.max = { x: p.x, y: p.y }; b.valid = true; }
    else { b.min.x = Math.min(b.min.x, p.x); b.min.y = Math.min(b.min.y, p.y); b.max.x = Math.max(b.max.x, p.x); b.max.y = Math.max(b.max.y, p.y); }
  }
  function dimensionGeometry(e) {
    const a = e.points[0], b = e.points[1], length = distance(a, b);
    if(e.dimensionStyle==='ordinateX'||e.dimensionStyle==='ordinateY'){const isX=e.dimensionStyle==='ordinateX',location=e.points[2],elbow=isX?{x:b.x,y:location.y}:{x:location.x,y:b.y};return{a,b,da:b,db:elbow,label:location,length:isX?b.x-a.x:b.y-a.y};}
    if(e.dimensionStyle==='horizontal'){const y=e.points[2].y;return{a,b,da:{x:a.x,y},db:{x:b.x,y},label:{x:(a.x+b.x)/2,y:y+e.textHeight*.35},length:Math.abs(b.x-a.x)};}
    if(e.dimensionStyle==='vertical'){const x=e.points[2].x;return{a,b,da:{x,y:a.y},db:{x,y:b.y},label:{x:x+e.textHeight*.35,y:(a.y+b.y)/2},length:Math.abs(b.y-a.y)};}
    const along = length > 1e-12 ? mul(sub(b, a), 1 / length) : { x: 1, y: 0 }, normal = { x: -along.y, y: along.x };
    const delta = sub(e.points[2], a), offset = delta.x * normal.x + delta.y * normal.y;
    const da = add(a, mul(normal, offset)), db = add(b, mul(normal, offset));
    return { a: { ...a }, b: { ...b }, da, db, label: add(mul(add(da, db), 0.5), mul(normal, (e.textHeight || 12) * 0.35)), length };
  }
  function annotationGeometry(e) {
    const segments = [], arcs = [], labels = [], fills = [];
    const scale = positive(e.dimensionScale === undefined ? 1 : e.dimensionScale, 'dimension scale');
    const h = positive((e.textHeight === undefined ? 12 : e.textHeight) * scale, 'scaled text height');
    const size = positive((e.arrowSize === undefined ? (e.textHeight === undefined ? 12 : e.textHeight) * .6 : e.arrowSize) * scale, 'scaled arrow size');
    const offset = nonnegative((e.extensionOffset === undefined ? (e.textHeight === undefined ? 12 : e.textHeight) * .15 : e.extensionOffset) * scale, 'scaled extension offset');
    const extend = nonnegative((e.extensionExtend === undefined ? (e.textHeight === undefined ? 12 : e.textHeight) * .25 : e.extensionExtend) * scale, 'scaled extension extension');
    const gap = nonnegative((e.textGap === undefined ? (e.textHeight === undefined ? 12 : e.textHeight) * .35 : e.textGap) * scale, 'scaled text gap');
    const precision = e.precision === undefined ? 2 : e.precision;
    requireValue(Number.isInteger(precision) && precision >= 0 && precision <= 8, 'Dimension precision must be an integer from 0 to 8');
    const prefix = string(e.prefix === undefined ? '' : e.prefix, 128, 'dimension prefix', true);
    const suffix = string(e.suffix === undefined ? '' : e.suffix, 128, 'dimension suffix', true);
    const dimensionColor = color(e.dimensionColor === undefined ? null : e.dimensionColor, true);
    const textColor = color(e.textColor === undefined ? null : e.textColor, true);
    const arrowStyle = e.arrowStyle === undefined ? 'closed' : e.arrowStyle;
    requireValue(['closed', 'open', 'tick'].includes(arrowStyle), 'Unknown dimension arrow style');
    const style = e.dimensionStyle || 'aligned';
    requireValue(['aligned','horizontal','vertical','angular','radius','diameter','ordinateX','ordinateY'].includes(style), 'Unknown dimension style');
    let measurement;
    const segment = (a, b, role = 'dimension') => {
      point(a); point(b);
      if (distance(a, b) > 1e-12) segments.push({ a: { ...a }, b: { ...b }, color: dimensionColor, role });
    };
    const arc = (center, radius, startAngle, endAngle) => {
      point(center); positive(radius, 'annotation radius'); number(startAngle, 'annotation start angle'); number(endAngle, 'annotation end angle');
      if (endAngle - startAngle > 1e-12) arcs.push({ center: { ...center }, radius, startAngle, endAngle, color: dimensionColor, role: 'dimension' });
    };
    const readable = angle => {
      angle = normalizedAngle(angle);
      if (angle > PI / 2 && angle <= PI * 1.5) angle -= PI;
      if (angle > PI) angle -= TAU;
      return angle;
    };
    const label = (center, value, angle = 0) => {
      angle = readable(angle);
      const width = number(Array.from(value).length * h * 0.65, 'annotation text width');
      const u = { x: Math.cos(angle), y: Math.sin(angle) }, n = { x: -u.y, y: u.x };
      const baseline = sub(sub(center, mul(u, width / 2)), mul(n, h / 2));
      point(baseline); point(center);
      const item = { point: baseline, center: { ...center }, text: value, height: h, angle, color: textColor, width };
      labels.push(item); return item;
    };
    const format = (value, before = '', after = '') => {
      const automatic = before + value.toFixed(precision) + after;
      const text = e.text ? e.text.replace(/<>/g, automatic) : automatic;
      return prefix + text + suffix;
    };
    const arrow = (tip, direction) => {
      const length = Math.hypot(direction.x, direction.y);
      requireValue(length > 1e-12, 'Dimension arrow direction must be nonzero');
      const u = mul(direction, 1 / length), n = { x: -u.y, y: u.x };
      if (arrowStyle === 'tick') {
        const d = mul(add(u, n), size * 0.5); segment(sub(tip, d), add(tip, d), 'arrow'); return;
      }
      const back = add(tip, mul(u, size)), a = add(back, mul(n, size * 0.3)), b = sub(back, mul(n, size * 0.3));
      segment(tip, a, 'arrow'); segment(tip, b, 'arrow');
      if (arrowStyle === 'closed') {
        segment(a, b, 'arrow');
        fills.push({ points: [{ ...tip }, a, b], color: dimensionColor, role: 'arrow' });
      }
    };
    // Clip a dimension/leader line against the rotated label box enlarged by its text gap.
    const gappedSegment = (a, b, item) => {
      const u = { x: Math.cos(item.angle), y: Math.sin(item.angle) }, n = { x: -u.y, y: u.x };
      const delta = sub(b, a), from = sub(a, item.center);
      const starts = [from.x*u.x+from.y*u.y, from.x*n.x+from.y*n.y];
      const steps = [delta.x*u.x+delta.y*u.y, delta.x*n.x+delta.y*n.y];
      const half = [item.width/2+gap, item.height/2+gap]; let low = 0, high = 1;
      for (let i = 0; i < 2; i++) {
        if (Math.abs(steps[i]) < 1e-12) { if (Math.abs(starts[i]) > half[i]) { segment(a,b); return; } }
        else { let p=(-half[i]-starts[i])/steps[i],q=(half[i]-starts[i])/steps[i];if(p>q)[p,q]=[q,p];low=Math.max(low,p);high=Math.min(high,q);if(low>=high){segment(a,b);return;} }
      }
      if (low > 1e-12) segment(a, add(a,mul(delta,low)));
      if (high < 1-1e-12) segment(add(a,mul(delta,high)),b);
    };
    const extension = (anchor, end, fallback) => {
      const d = sub(end, anchor), length = Math.hypot(d.x,d.y), u = length>1e-12?mul(d,1/length):fallback;
      segment(add(anchor,mul(u,Math.min(offset,length))),add(end,mul(u,extend)),'extension');
    };
    if(style==='ordinateX'||style==='ordinateY'){
      requireValue(e.points.length===3,'Ordinate dimension requires datum, feature and label points');
      const [datum,feature,location]=e.points,isX=style==='ordinateX';measurement=isX?feature.x-datum.x:feature.y-datum.y;
      const elbow=isX?{x:feature.x,y:location.y}:{x:location.x,y:feature.y};
      const item=label(location,format(measurement));
      segment(feature,elbow,'extension');gappedSegment(elbow,location,item);
    } else if (style === 'angular') {
      requireValue(e.points.length === 4, 'Angular dimension requires four points');
      const [a,v,b,location] = e.points, da=sub(a,v), db=sub(b,v), la=distance(a,v), lb=distance(b,v);
      requireValue(la>1e-12&&lb>1e-12,'Angular dimension requires two nonzero arms');
      let start=Math.atan2(da.y,da.x),end=Math.atan2(db.y,db.x),sweep=normalizedAngle(end-start),first=a,second=b;
      if(sweep>PI){[start,end]=[end,start];[first,second]=[second,first];sweep=TAU-sweep;}
      requireValue(sweep>1e-12,'Angular dimension requires a nonzero angle');
      const radius=positive(distance(location,v),'angular dimension radius');measurement=sweep*180/PI;
      const at=t=>add(v,{x:radius*Math.cos(t),y:radius*Math.sin(t)}),p=at(start),q=at(start+sweep),middle=start+sweep/2;
      extension(first,p,{x:Math.cos(start),y:Math.sin(start)});
      extension(second,q,{x:Math.cos(start+sweep),y:Math.sin(start+sweep)});
      const value=format(measurement,'','°'),width=Array.from(value).length*h*.65;
      const halfGap=(width/2+gap)/radius,room=halfGap<sweep/2-1e-12;
      const center=room?at(middle):add(v,{x:(radius+gap+h*.5)*Math.cos(middle),y:(radius+gap+h*.5)*Math.sin(middle)});
      label(center,value,middle+PI/2);
      if(room){arc(v,radius,start,middle-halfGap);arc(v,radius,middle+halfGap,start+sweep);}else arc(v,radius,start,start+sweep);
      const inward=radius*sweep>=2*size?1:-1;
      arrow(p,{x:-Math.sin(start)*inward,y:Math.cos(start)*inward});
      arrow(q,{x:Math.sin(start+sweep)*inward,y:-Math.cos(start+sweep)*inward});
    } else if (style === 'radius' || style === 'diameter') {
      requireValue(e.points.length===3,'Radial dimension requires three points');
      const [c,p,location]=e.points,r=positive(distance(c,p),'radial dimension radius'),u=mul(sub(p,c),1/r);
      measurement=r*(style==='diameter'?2:1);
      const from=style==='diameter'?sub(c,mul(u,r)):c;
      const item=label(location,format(measurement,style==='radius'?'R ':'Ø '));
      gappedSegment(from,p,item);if(distance(p,location)>1e-12)gappedSegment(p,location,item);
      arrow(p,mul(u,-1));if(style==='diameter')arrow(from,u);
    } else {
      requireValue(e.points.length===3,'Linear dimension requires three points');
      const g=dimensionGeometry(e);measurement=g.length;
      requireValue(measurement>1e-12,'Linear dimension requires a nonzero measured length');
      const length=positive(distance(g.da,g.db),'dimension line length'),u=mul(sub(g.db,g.da),1/length),normal={x:-u.y,y:u.x};
      extension(g.a,g.da,normal);extension(g.b,g.db,normal);
      const value=format(measurement),width=Array.from(value).length*h*.65,mid=mul(add(g.da,g.db),.5);
      const room=width+2*gap<length-2*size;
      const angle=readable(Math.atan2(u.y,u.x)),readNormal={x:-Math.sin(angle),y:Math.cos(angle)};
      const center=room?mid:add(mid,mul(readNormal,gap+h*.5));
      const item=label(center,value,angle);
      // Above-line overflow text must not erase the dimension line by touching
      // the edge of its expanded label box.
      if(room)gappedSegment(g.da,g.db,item);else segment(g.da,g.db);
      const inward=length>=2*size?1:-1;arrow(g.da,mul(u,inward));arrow(g.db,mul(u,-inward));
    }
    return { segments, arcs, labels, fills, measurement };
  }
  function entityBounds(e) {
    const b = emptyBounds(); if (!e.points || !e.points.length) return b;
    if(e.kind==='compound'){for(const part of e.parts||[]){const box=entityBounds(part);if(box.valid){include(b,box.min);include(b,box.max);}}for(const loop of e.data?.loops||[])for(const p of loop)include(b,p);if(!b.valid)for(const p of e.points)include(b,p);}
    else if (e.kind === 'circle') { const c = e.points[0]; include(b, { x: c.x - e.radius, y: c.y - e.radius }); include(b, { x: c.x + e.radius, y: c.y + e.radius }); }
    else if (e.kind === 'arc') {
      const c = e.points[0], at = a => include(b, add(c, { x: Math.cos(a) * e.radius, y: Math.sin(a) * e.radius }));
      at(e.startAngle); at(e.endAngle); for (let i = 0; i < 4; i++) if (onArc(i * PI / 2, e.startAngle, e.endAngle)) at(i * PI / 2);
    } else if (e.kind === 'text') {
      const w = Array.from(e.text || '').length * (e.textHeight || 12) * 0.65, h = e.textHeight || 12;
      const c = Math.cos(e.startAngle || 0), s = Math.sin(e.startAngle || 0);
      for (const p of [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]) include(b, add(e.points[0], { x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
    } else if (e.kind === 'dimension' && e.points.length >= 3) {
      const g = annotationGeometry(e);
      for (const s of g.segments) { include(b,s.a); include(b,s.b); }
      for (const f of g.fills) for (const p of f.points) include(b,p);
      for (const a of g.arcs) { const box=entityBounds({kind:'arc',points:[a.center],radius:a.radius,startAngle:a.startAngle,endAngle:a.endAngle});include(b,box.min);include(b,box.max); }
      for (const l of g.labels) { const box=entityBounds({kind:'text',points:[l.point],text:l.text,textHeight:l.height,startAngle:l.angle});include(b,box.min);include(b,box.max); }
    } else for (const p of e.points) include(b, p);
    return b;
  }
  function segmentDistance(p, a, b) {
    const d = sub(b, a), len = d.x * d.x + d.y * d.y;
    if (len < 1e-24) return distance(p, a);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / len)); return distance(p, add(a, mul(d, t)));
  }
  function pointInPolygon(p, polygon) {
    let inside = false;
    for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
      const a=polygon[i],b=polygon[j];
      if (segmentDistance(p,a,b)<=1e-10) return true;
      if ((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
    }
    return inside;
  }
  function hitTest(e, p, tolerance) {
    if (!e.points || !e.points.length || !Number.isFinite(tolerance) || tolerance < 0) return false;
    if(e.kind==='compound'){
      if((e.subtype==='hatch'||e.subtype==='region')&&e.data?.loops){let interior=false;for(const loop of e.data.loops)if(pointInPolygon(p,loop))interior=!interior;if(interior)return true;}
      return(e.parts||[]).some(part=>hitTest(part,p,tolerance));
    }
    if(e.kind==='solid'&&pointInPolygon(p,e.points))return true;
    if (e.kind === 'circle' || e.kind === 'arc') {
      const delta = sub(p, e.points[0]); return Math.abs(Math.hypot(delta.x, delta.y) - e.radius) <= tolerance && (e.kind === 'circle' || onArc(Math.atan2(delta.y, delta.x), e.startAngle, e.endAngle));
    }
    if (e.kind === 'text') {
      const d = sub(p, e.points[0]), c = Math.cos(e.startAngle || 0), s = Math.sin(e.startAngle || 0);
      const x = d.x * c + d.y * s, y = -d.x * s + d.y * c, h = e.textHeight || 12;
      return x >= -tolerance && x <= Array.from(e.text || '').length * h * 0.65 + tolerance && y >= -tolerance && y <= h + tolerance;
    }
    if (e.kind === 'dimension') {
      const g=annotationGeometry(e);
      return g.segments.some(s=>segmentDistance(p,s.a,s.b)<=tolerance)
        || g.arcs.some(a=>hitTest({kind:'arc',points:[a.center],radius:a.radius,startAngle:a.startAngle,endAngle:a.endAngle},p,tolerance))
        || g.labels.some(l=>hitTest({kind:'text',points:[l.point],text:l.text,textHeight:l.height,startAngle:l.angle},p,tolerance))
        || g.fills.some(f=>pointInPolygon(p,f.points));
    }
    for (let i = 1; i < e.points.length; i++) if (segmentDistance(p, e.points[i - 1], e.points[i]) <= tolerance) return true;
    return !!e.closed && segmentDistance(p, e.points[e.points.length - 1], e.points[0]) <= tolerance;
  }
  function snapPoints(e) {
    if(e.kind==='compound')return(e.parts||[]).flatMap(snapPoints);
    const points = (e.points || []).map(p => ({ x: p.x, y: p.y })); if (!points.length) return points;
    if (e.kind === 'circle' || e.kind === 'arc') {
      const c = points[0], at = a => points.push(add(c, { x: Math.cos(a) * e.radius, y: Math.sin(a) * e.radius }));
      for (let i = 0; i < 4; i++) if (e.kind === 'circle' || onArc(i * PI / 2, e.startAngle, e.endAngle)) at(i * PI / 2);
      if (e.kind === 'arc') { at(e.startAngle); at(e.endAngle); }
    } else if (e.kind === 'line' || e.kind === 'polyline') {
      for (let i = 1; i < e.points.length; i++) points.push(mul(add(e.points[i - 1], e.points[i]), 0.5));
      if (e.closed && e.points.length > 2) points.push(mul(add(e.points[0], e.points[e.points.length - 1]), 0.5));
    }
    return points;
  }
  function historyPush(stack, state) {
    stack.push(state); let size = stack.reduce((sum, s) => sum + s.length, 0);
    while (stack.length > 1 && (stack.length > 60 || size > HISTORY_BUDGET)) size -= stack.shift().length;
  }
  class Document {
    constructor() { this.reset(); }
    reset() { this.entities = []; this.layers = [{ name: '0', color: '#e5edf5', visible: true, locked: false }]; this.currentLayer = '0'; this.nextId = 1; this.resources={blocks:{},dimStyles:{},plot:{}}; this.warnings = []; this._undo = []; this._redo = []; }
    layer(name) { return this.layers.find(l => l.name === name) || null; }
    add(raw) {
      requireValue(this.entities.length < MAX_ENTITIES, 'Too many entities'); identifier(this.nextId, 'next entity ID');
      requireValue(this.nextId + 1 < Number.MAX_SAFE_INTEGER, 'Entity IDs exhausted');
      const e = normalizedEntity(raw, this.currentLayer, this.nextId); requireValue(this.layer(e.layer), 'Entity layer does not exist');
      let count = entityMetrics(e).points+resourcePointCount(this.resources),totalEntities=entityMetrics(e).entities; for (const item of this.entities){const metric=entityMetrics(item);count+=metric.points;totalEntities+=metric.entities;}requireValue(totalEntities<=MAX_ENTITIES,'Too many compound entities');
      requireValue(count <= MAX_TOTAL_POINTS, 'Document has too many points');
      this.entities.push(e); this.nextId++; return e.id;
    }
    erase(ids) { requireValue(Array.isArray(ids), 'IDs must be an array'); const chosen = new Set(ids); this.entities = this.entities.filter(e => !chosen.has(e.id)); }
    transform(ids, options = {}) {
      requireValue(Array.isArray(ids), 'IDs must be an array'); object(options, 'Transformation');
      const translation = point(get(options, 'translation', { x: 0, y: 0 })), pivot = point(get(options, 'pivot', { x: 0, y: 0 }));
      const rotation = number(get(options, 'rotation', 0), 'rotation'), scale = positive(get(options, 'scale', 1), 'scale');
      const chosen = new Set(ids), c = Math.cos(rotation), s = Math.sin(rotation), updates = [];
      this.entities.forEach((raw, i) => {
        if (!chosen.has(raw.id)) return;
        const e = normalizedEntity(raw, '0');
        const map=p=>{const d=mul(sub(p,pivot),scale);return add(add(pivot,{x:d.x*c-d.y*s,y:d.x*s+d.y*c}),translation);};
        const affine=[c*scale,s*scale,-s*scale,c*scale,pivot.x+translation.x-scale*(c*pivot.x-s*pivot.y),pivot.y+translation.y-scale*(s*pivot.x+c*pivot.y)];
        const transformEntity=item=>{
          item.points=item.points.map(map);item.radius*=scale;item.textHeight*=scale;item.startAngle+=rotation;item.endAngle+=rotation;
          if(item.kind==='dimension')for(const field of ['arrowSize','extensionOffset','extensionExtend','textGap'])item[field]*=scale;
          if(item.kind==='compound'){
            item.parts.forEach(transformEntity);const data=item.data;
            if(data.loops)data.loops=data.loops.map(loop=>loop.map(map));
            if(data.paths)data.paths=data.paths.map(path=>path.map(map));
            if(data.textPoint)data.textPoint=map(data.textPoint);
            if(data.matrix){const[a,b,c0,d,e0,f]=affine,[g,h,j,k,l,m]=data.matrix;data.matrix=[a*g+c0*h,b*g+d*h,a*j+c0*k,b*j+d*k,a*l+c0*m+e0,b*l+d*m+f];}
            if(item.subtype==='leader')data.textRotation=(data.textRotation||0)+rotation;
            if(item.subtype==='leader'&&data.style)for(const key of ['textHeight','arrowSize','extensionOffset','extensionExtend','textGap'])if(typeof data.style[key]==='number')data.style[key]*=scale;
            if(item.subtype==='hatch'){if(typeof data.angle==='number')data.angle+=rotation*180/PI;if(typeof data.spacing==='number')data.spacing*=scale;}
          }
        };
        transformEntity(e);
        updates.push([i, normalizedEntity(e, '0')]);
      });
      for (const [i, e] of updates) this.entities[i] = e;
    }
    bounds() {
      const result = emptyBounds(); for (const e of this.entities) { const l = this.layer(e.layer); if (l && !l.visible) continue; const b = entityBounds(e); if (b.valid) { include(result, b.min); include(result, b.max); } } return result;
    }
    serialize() { const data = validateState(this); const text = JSON.stringify({ format: 'RasmCAD Browser', version: 1, ...data }); requireValue(text.length <= MAX_FILE, 'Drawing exceeds 64 MiB size limit'); return text; }
    static parse(text) {
      requireValue(typeof text === 'string' && text.length <= MAX_FILE, 'Drawing exceeds size limit or is not text');
      let raw; try { raw = JSON.parse(text); } catch (_) { throw new Error('Invalid RasmCAD JSON drawing'); }
      object(raw, 'Drawing'); requireValue(get(raw, 'format') === 'RasmCAD Browser' && get(raw, 'version') === 1, 'Unsupported RasmCAD drawing format or version');
      const data = validateState(raw), d = new Document(); Object.assign(d, data); return d;
    }
    checkpoint() { historyPush(this._undo, this.serialize()); this._redo = []; }
    canUndo() { return this._undo.length > 0; }
    canRedo() { return this._redo.length > 0; }
    _restore(text) { const next = Document.parse(text); this.entities = next.entities; this.layers = next.layers; this.currentLayer = next.currentLayer; this.nextId = next.nextId; this.resources=next.resources; }
    undo() { if (!this.canUndo()) return false; const now = this.serialize(), old = this._undo[this._undo.length - 1]; this._restore(old); this._undo.pop(); historyPush(this._redo, now); return true; }
    redo() { if (!this.canRedo()) return false; const now = this.serialize(), next = this._redo[this._redo.length - 1]; this._restore(next); this._redo.pop(); historyPush(this._undo, now); return true; }
  }
  function importRcad(text) {
    requireValue(typeof text === 'string' && text.length <= MAX_FILE, 'Legacy drawing exceeds size limit or is not text');
    let offset = 0;
    function token() {
      while (offset < text.length && /\s/.test(text[offset])) offset++;
      requireValue(offset < text.length, 'Truncated legacy RasmCAD drawing');
      if (text[offset] === '"') {
        offset++; let value = '', closed = false;
        while (offset < text.length) { let c = text[offset++]; if (c === '"') { closed = true; break; } if (c === '\\') { requireValue(offset < text.length, 'Truncated quoted legacy string'); c = text[offset++]; } value += c; }
        requireValue(closed && (offset === text.length || /\s/.test(text[offset])), 'Invalid quoted legacy string'); return value;
      }
      const begin = offset; while (offset < text.length && !/\s/.test(text[offset])) offset++; return text.slice(begin, offset);
    }
    function expect(wanted) { requireValue(token() === wanted, 'Invalid legacy drawing: expected ' + wanted); }
    function numeric(label) { const s = token(); requireValue(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s), 'Invalid legacy ' + label); return number(Number(s), label); }
    function integer(label, max) { const n = numeric(label); requireValue(Number.isSafeInteger(n) && n >= 0 && n <= max, 'Invalid legacy ' + label); return n; }
    function oldColor(n, byLayer) { requireValue(n <= 0xFFFFFF || (byLayer && n === 0xFFFFFFFF), 'Invalid legacy color'); return n === 0xFFFFFFFF ? null : '#' + n.toString(16).padStart(6, '0'); }
    expect('RASMCAD'); requireValue(integer('version', 1000) === 1, 'Unsupported legacy drawing version');
    expect('NEXT'); const nextId = integer('next ID', Number.MAX_SAFE_INTEGER - 1);
    expect('CURRENT'); const currentLayer = token(); expect('LAYERS'); const count = integer('layer count', MAX_LAYERS);
    requireValue(count > 0, 'Legacy drawing has no layers'); const layers = [];
    for (let i = 0; i < count; i++) { expect('L'); const name = token(), c = oldColor(integer('layer color', 0xFFFFFFFF), false), visible = integer('visibility', 1) !== 0, locked = integer('lock', 1) !== 0; layers.push({ name, color: c, visible, locked }); }
    expect('ENTITIES'); const entityCount = integer('entity count', MAX_ENTITIES), entities = [];
    const oldKinds = ['line', 'polyline', 'circle', 'arc', 'text', 'dimension']; let totalPoints = 0;
    for (let i = 0; i < entityCount; i++) {
      expect('E'); const id = integer('entity ID', Number.MAX_SAFE_INTEGER - 1), kind = oldKinds[integer('entity kind', 5)], layer = token();
      const c = oldColor(integer('entity color', 0xFFFFFFFF), true), lineWidth = numeric('line width'), radius = numeric('radius'), startAngle = numeric('start angle'), endAngle = numeric('end angle');
      const closed = integer('closure', 1) !== 0, textHeight = numeric('text height'), value = token(), pointCount = integer('point count', MAX_POINTS), points = [];
      totalPoints += pointCount; requireValue(totalPoints <= MAX_TOTAL_POINTS, 'Legacy drawing has too many points');
      for (let j = 0; j < pointCount; j++) { expect('P'); points.push({ x: numeric('X'), y: numeric('Y') }); }
      entities.push({ id, kind, layer, color: c, lineWidth, radius, startAngle, endAngle, closed, textHeight, text: value, points });
    }
    expect('END'); requireValue(text.slice(offset).trim() === '', 'Unexpected data after legacy drawing');
    const data = validateState({ entities, layers, currentLayer, nextId }), d = new Document(); Object.assign(d, data); return d;
  }
  function exportDxf(doc,options={}) {
    const version=options.version||'AC1021';
    requireValue(['AC1021','AC1024','AC1027','AC1032'].includes(version),'Unsupported DXF version');
    const data = validateState(doc), lines = [];
    let handle = 1;
    const nextHandle = () => (handle++).toString(16).toUpperCase(), layerTableHandle = nextHandle();
    const g = (code, value) => { lines.push(String(code), String(value)); };
    function base(type, e) { g(0, type); g(5, nextHandle()); g(100, 'AcDbEntity'); g(8, e.layer); if (e.color !== null) g(420, parseInt(e.color.slice(1), 16)); }
    function line(e, a, b) { base('LINE', e); g(100, 'AcDbLine'); g(10, a.x); g(20, a.y); g(30, 0); g(11, b.x); g(21, b.y); g(31, 0); }
    function text(e, p, value, h, angle) { base('TEXT', e); g(100, 'AcDbText'); g(10, p.x); g(20, p.y); g(30, 0); g(40, h); g(1, value); g(50, angle * 180 / PI); }
    g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, version); g(9, '$DWGCODEPAGE'); g(3, 'ANSI_1252'); g(9, '$INSUNITS'); g(70, 0); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER'); g(5, layerTableHandle); g(330, 0); g(100, 'AcDbSymbolTable'); g(70, data.layers.length);
    for (const layer of data.layers) { g(0, 'LAYER'); g(5, nextHandle()); g(330, layerTableHandle); g(100, 'AcDbSymbolTableRecord'); g(100, 'AcDbLayerTableRecord'); g(2, layer.name); g(70, layer.locked ? 4 : 0); g(62, layer.visible ? 7 : -7); g(420, parseInt(layer.color.slice(1), 16)); g(6, 'CONTINUOUS'); }
    g(0, 'ENDTAB'); g(0, 'ENDSEC'); g(0, 'SECTION'); g(2, 'ENTITIES');
    function emit(e,inherited){
      if(inherited&&e.color===null)e={...e,color:inherited.color};
      if(e.kind==='compound'){for(const part of e.parts)emit(part,e);return;}
      if(e.kind==='solid'){
        base('SOLID',e);g(100,'AcDbTrace');
        const vertices=e.points.length===3?[...e.points,e.points[2]]:[e.points[0],e.points[1],e.points[3],e.points[2]];
        vertices.forEach((p,i)=>{g(10+i,p.x);g(20+i,p.y);g(30+i,0);});return;
      }
      if (e.kind === 'line') line(e, e.points[0], e.points[1]);
      else if (e.kind === 'polyline') { base('LWPOLYLINE', e); g(100, 'AcDbPolyline'); g(90, e.points.length); g(70, e.closed ? 1 : 0); for (const p of e.points) { g(10, p.x); g(20, p.y); } }
      else if (e.kind === 'circle' || e.kind === 'arc') {
        const full = e.kind === 'circle' || arcSpan(e.startAngle, e.endAngle) === TAU;
        base(full ? 'CIRCLE' : 'ARC', e); g(100, 'AcDbCircle'); g(10, e.points[0].x); g(20, e.points[0].y); g(30, 0); g(40, e.radius);
        if (!full) { g(100, 'AcDbArc'); g(50, normalizedAngle(e.startAngle) * 180 / PI); g(51, normalizedAngle(e.endAngle) * 180 / PI); }
      } else if (e.kind === 'text') text(e, e.points[0], e.text, e.textHeight, e.startAngle);
      else if (e.kind === 'dimension') {
        const geometry=annotationGeometry(e), styled=c=>({...e,color:c===null?e.color:c});
        for (const s of geometry.segments) line(styled(s.color),s.a,s.b);
        for (const a of geometry.arcs) { base('ARC',styled(a.color));g(100,'AcDbCircle');g(10,a.center.x);g(20,a.center.y);g(30,0);g(40,a.radius);g(100,'AcDbArc');g(50,normalizedAngle(a.startAngle)*180/PI);g(51,normalizedAngle(a.endAngle)*180/PI); }
        for (const f of geometry.fills) {
          base('SOLID',styled(f.color));g(100,'AcDbTrace');
          const vertices=[f.points[0],f.points[1],f.points[2],f.points[2]];
          vertices.forEach((p,i)=>{g(10+i,p.x);g(20+i,p.y);g(30+i,0);});
        }
        for (const l of geometry.labels) text(styled(l.color),l.point,l.text,l.height,l.angle||0);
      }
    }
    for(const entity of data.entities)emit(entity);
    g(0, 'ENDSEC'); g(0, 'EOF'); const output = lines.join('\n') + '\n'; requireValue(output.length <= MAX_FILE, 'DXF exceeds 64 MiB size limit'); return output;
  }
  const SAMPLE_NATIVE = "RASMCAD 1\nNEXT 78\nCURRENT \"WALLS\"\nLAYERS 6\nL \"0\" 14476523 1 0\nL \"WALLS\" 14476523 1 0\nL \"DOORS\" 15055715 1 0\nL \"FURNITURE\" 6801347 1 0\nL \"DIMENSIONS\" 10463672 1 0\nL \"LABELS\" 11320777 1 0\nENTITIES 77\nE 1 1 \"WALLS\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 0 0\nP 12000 0\nP 12000 8000\nP 0 8000\nE 2 1 \"WALLS\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 180 180\nP 11820 180\nP 11820 7820\nP 180 7820\nE 3 0 \"WALLS\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 5600 180\nP 5600 2800\nE 4 0 \"WALLS\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 5600 3700\nP 5600 7820\nE 5 0 \"WALLS\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 5780 180\nP 5780 2800\nE 6 0 \"WALLS\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 5780 3700\nP 5780 7820\nE 7 0 \"WALLS\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 180 4500\nP 2000 4500\nE 8 0 \"WALLS\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 2900 4500\nP 5600 4500\nE 9 0 \"WALLS\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 5780 4500\nP 7500 4500\nE 10 0 \"WALLS\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 8400 4500\nP 11820 4500\nE 11 0 \"WALLS\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 180 4680\nP 2000 4680\nE 12 0 \"WALLS\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 2900 4680\nP 5600 4680\nE 13 0 \"WALLS\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 5780 4680\nP 7500 4680\nE 14 0 \"WALLS\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 8400 4680\nP 11820 4680\nE 15 0 \"WALLS\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 8900 4680\nP 8900 6200\nE 16 0 \"WALLS\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 8900 7100\nP 8900 7820\nE 17 0 \"WALLS\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 9080 4680\nP 9080 6200\nE 18 0 \"WALLS\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 9080 7100\nP 9080 7820\nE 19 0 \"DOORS\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 2000 4500\nP 2000 3600\nE 20 3 \"DOORS\" 4294967295 1 900 -1.5707963267948966 0 0 12 \"\" 1\nP 2000 4500\nE 21 0 \"DOORS\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 7500 4680\nP 7500 5580\nE 22 3 \"DOORS\" 4294967295 1 900 0 1.5707963267948966 0 12 \"\" 1\nP 7500 4680\nE 23 0 \"DOORS\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 5780 2800\nP 6680 2800\nE 24 3 \"DOORS\" 4294967295 1 900 0 1.5707963267948966 0 12 \"\" 1\nP 5780 2800\nE 25 0 \"DOORS\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 8900 6200\nP 8000 6200\nE 26 3 \"DOORS\" 4294967295 1 900 1.5707963267948966 3.1415926535897931 0 12 \"\" 1\nP 8900 6200\nE 27 0 \"FURNITURE\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 1200 80\nP 2300 80\nE 28 0 \"FURNITURE\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 1200 100\nP 1200 240\nE 29 0 \"FURNITURE\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 2300 100\nP 2300 240\nE 30 0 \"FURNITURE\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 3000 80\nP 4100 80\nE 31 0 \"FURNITURE\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 3000 100\nP 3000 240\nE 32 0 \"FURNITURE\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 4100 100\nP 4100 240\nE 33 0 \"FURNITURE\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 6900 80\nP 8000 80\nE 34 0 \"FURNITURE\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 6900 100\nP 6900 240\nE 35 0 \"FURNITURE\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 8000 100\nP 8000 240\nE 36 0 \"FURNITURE\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 10200 80\nP 11300 80\nE 37 0 \"FURNITURE\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 10200 100\nP 10200 240\nE 38 0 \"FURNITURE\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 11300 100\nP 11300 240\nE 39 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 650 850\nP 3150 850\nP 3150 1700\nP 650 1700\nE 40 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 650 1700\nP 1500 1700\nP 1500 3100\nP 650 3100\nE 41 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 1800 2200\nP 3500 2200\nP 3500 3100\nP 1800 3100\nE 42 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 3900 1400\nP 4850 1400\nP 4850 3300\nP 3900 3300\nE 43 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 3750 1550\nP 3870 1550\nP 3870 2100\nP 3750 2100\nE 44 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 3750 2350\nP 3870 2350\nP 3870 2900\nP 3750 2900\nE 45 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 4880 1550\nP 5000 1550\nP 5000 2100\nP 4880 2100\nE 46 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 4880 2350\nP 5000 2350\nP 5000 2900\nP 4880 2900\nE 47 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 900 5450\nP 2700 5450\nP 2700 7450\nP 900 7450\nE 48 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 1000 7020\nP 1750 7020\nP 1750 7350\nP 1000 7350\nE 49 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 1850 7020\nP 2600 7020\nP 2600 7350\nP 1850 7350\nE 50 0 \"FURNITURE\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 970 6800\nP 2630 6800\nE 51 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 3100 5500\nP 3750 5500\nP 3750 7600\nP 3100 7600\nE 52 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 6400 5450\nP 8200 5450\nP 8200 7450\nP 6400 7450\nE 53 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 6500 7020\nP 7250 7020\nP 7250 7350\nP 6500 7350\nE 54 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 7350 7020\nP 8100 7020\nP 8100 7350\nP 7350 7350\nE 55 0 \"FURNITURE\" 4294967295 1 0 0 0 0 12 \"\" 2\nP 6470 6800\nP 8130 6800\nE 56 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 8600 5500\nP 9250 5500\nP 9250 7600\nP 8600 7600\nE 57 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 10100 650\nP 11500 650\nP 11500 1250\nP 10100 1250\nE 58 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 10900 1250\nP 11500 1250\nP 11500 3650\nP 10900 3650\nE 59 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 10350 720\nP 11000 720\nP 11000 1170\nP 10350 1170\nE 60 2 \"FURNITURE\" 4294967295 1 75 0 0 0 12 \"\" 1\nP 11100 2200\nE 61 2 \"FURNITURE\" 4294967295 1 75 0 0 0 12 \"\" 1\nP 11320 2200\nE 62 2 \"FURNITURE\" 4294967295 1 75 0 0 0 12 \"\" 1\nP 11100 2450\nE 63 2 \"FURNITURE\" 4294967295 1 75 0 0 0 12 \"\" 1\nP 11320 2450\nE 64 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 9470 5000\nP 11320 5000\nP 11320 5750\nP 9470 5750\nE 65 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 10550 6750\nP 11250 6750\nP 11250 7450\nP 10550 7450\nE 66 1 \"FURNITURE\" 4294967295 1 0 0 0 1 12 \"\" 4\nP 9600 6900\nP 10120 6900\nP 10120 7550\nP 9600 7550\nE 67 4 \"LABELS\" 4294967295 1 0 0 0 0 230 \"LIVING / DINING\" 1\nP 900 3550\nE 68 4 \"LABELS\" 4294967295 1 0 0 0 0 190 \"BEDROOM 01\" 1\nP 900 5100\nE 69 4 \"LABELS\" 4294967295 1 0 0 0 0 190 \"BEDROOM 02\" 1\nP 6300 5100\nE 70 4 \"LABELS\" 4294967295 1 0 0 0 0 180 \"BATH\" 1\nP 9600 5950\nE 71 4 \"LABELS\" 4294967295 1 0 0 0 0 220 \"KITCHEN\" 1\nP 8300 3650\nE 72 4 \"LABELS\" 4294967295 1 0 0 0 0 260 \"RESIDENCE / CONCEPT PLAN\" 1\nP 200 -1350\nE 73 4 \"LABELS\" 4294967295 1 0 0 0 0 150 \"RasmCAD   |   Units: mm   |   1:100\" 1\nP 200 -1700\nE 74 5 \"DIMENSIONS\" 4294967295 1 0 0 0 0 140 \"\" 3\nP 0 0\nP 12000 0\nP 0 -650\nE 75 5 \"DIMENSIONS\" 4294967295 1 0 0 0 0 140 \"\" 3\nP 0 8000\nP 5600 8000\nP 0 8550\nE 76 5 \"DIMENSIONS\" 4294967295 1 0 0 0 0 140 \"\" 3\nP 5780 8000\nP 12000 8000\nP 0 8550\nE 77 5 \"DIMENSIONS\" 4294967295 1 0 0 0 0 140 \"\" 3\nP 12000 0\nP 12000 8000\nP 12700 0\nEND\n";
  function sampleDocument() { return importRcad(SAMPLE_NATIVE); }
  return Object.freeze({ Document, importRcad, exportDxf, entityBounds, hitTest, snapPoints, dimensionGeometry, annotationGeometry,
    sampleDocument, validateEntity, distance, PI, Pi: PI, normalizedAngle, arcSpan });
});
