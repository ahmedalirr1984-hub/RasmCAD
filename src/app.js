/* RasmCAD Browser UI. All storage is user-initiated file download/open. */
(() => {
  'use strict';
  const C = window.RasmCore, E = window.RasmEdit, IO = window.RasmIO, S = window.RasmSelection, G = window.RasmGrips,
        Commands = window.RasmCommands, View = window.RasmView,
        $ = id => document.getElementById(id);
  const canvas = $('canvas'), ctx = canvas.getContext('2d'), wrap = $('canvas-wrap');
  let doc = new C.Document(), selected = new Set(), tool = 'select', lastTool = 'line', points = [];
  let dirty = false, filename = 'Drawing', camera = {x: 300, y: 200}, zoom = 1;
  let W = 800, H = 500, dpr = 1, grid = true, snap = true, ortho = false, mouse = null,
      snapPoint = null, gesture = null;
  let frame = 0, downloadSerial = 0;
  let params = {}, lastMeasurement = null, dimTextHeight = 12, busy = false,
      linearStyle = 'horizontal';
  let selectionMode = 'additive', hovered = null, previewWorld = null, selectionCycle = null;
  let lastCreatedId = null, dimensionDefaults = null;
  let propertySelectionKey = '', propertyDirty = new Set();
  let gripPreview = null;
  let advanced=null,plotUI=null,snapType='';
  const VERSION='0.7', commandHistory=[], inputHistory=[], diagnosticEvents=[];
  let historyIndex=0, historyDraft='', suggestions=[], suggestionIndex=-1;
  const accent = '#69dfc3', ink = '#dce7ef';
  const V = {
    add: (a, b) => ({x: a.x + b.x, y: a.y + b.y}),
    sub: (a, b) => ({x: a.x - b.x, y: a.y - b.y}),
    mul: (a, k) => ({x: a.x * k, y: a.y * k})
  };
  const fmt = n => Number(n).toLocaleString(
      'en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false});
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const safe = fn => (...args) => {
    try {
      return fn(...args);
    } catch (error) {
      log('Operation failed: ' + error.message, true);
    }
  };
  function log(message, error = false) {
    message=String(message);
    $('status-log').textContent = message;
    $('status-log').style.color = error ? '#ffbaac' : '';
    commandHistory.push({message,error,time:new Date().toISOString()});
    if(commandHistory.length>200)commandHistory.shift();
    const entry=document.createElement('div');entry.textContent=message;
    entry.className=error?'history-error':'history-entry';
    $('command-history').append(entry);
    while($('command-history').childElementCount>200)$('command-history').firstChild.remove();
    $('command-history').scrollTop=$('command-history').scrollHeight;
    if(error){diagnosticEvents.push({time:new Date().toISOString(),message});if(diagnosticEvents.length>100)diagnosticEvents.shift();}
  }
  const currentView=()=>({camera,zoom,width:W,height:H});
  function worldToScreen(p) {
    return View.project(p,currentView());
  }
  function screenToWorld(p) {
    return {x: camera.x + (p.x - W / 2) / zoom, y: camera.y - (p.y - H / 2) / zoom};
  }
  function pointer(e) {
    const r = canvas.getBoundingClientRect();
    return {x: e.clientX - r.left, y: e.clientY - r.top};
  }
  function layer(e) {
    return doc.layer(e.layer);
  }
  function visible(e) {
    return layer(e)?.visible !== false;
  }
  function editable(e) {
    const l = layer(e);
    return l && l.visible && !l.locked;
  }
  function entityColor(e) {
    return e.color || layer(e)?.color || ink;
  }
  function schedule() {
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        render();
      });
  }
  function sync() {
    $('entity-count').textContent = String(doc.entities.length);
    $('selection-count').textContent = String(selected.size);
    $('save-state').textContent =
        dirty ? 'Unsaved changes — save your project' : 'No unsaved changes';
    $('file-name').textContent =
        (filename === 'Drawing' ? 'Untitled drawing' : filename) + (dirty ? ' *' : '');
    document.title = (dirty ? '* ' : '') + filename + ' — RasmCAD Advanced '+VERSION;
    $('undo-btn').disabled = !doc.canUndo();
    $('redo-btn').disabled = !doc.canRedo();
    $('delete-btn').disabled = selected.size === 0;
    $('welcome').hidden = doc.entities.length > 0 || tool !== 'select';
    document.querySelectorAll('[data-tool]').forEach(b => {
      const on = b.dataset.tool === tool;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    for (const [id, on] of [['grid-btn', grid], ['snap-btn', snap], ['ortho-btn', ortho]])
      $(id).setAttribute('aria-pressed', String(on));
    if ($('active-command')) $('active-command').textContent = advanced?.active?advanced.name+(advanced.acquiring?' · SELECT':''):params.acquiring ? tool.toUpperCase()+' · SELECT' : tool.toUpperCase();
    if ($('selection-hint')) $('selection-hint').textContent = params.acquiring ? 'Select objects, then Enter or right-click to continue. Shift removes.' : 'Click adds · Shift removes · left→right window · right→left crossing · Esc clears';
    if ($('finish-btn')) $('finish-btn').disabled = tool === 'select'&&!advanced?.active;
    const draft=points.length>0&&tool!=='select';
    $('draft-status').textContent=draft ? 'Preview is unfinished. Click the next point or enter a value to commit; Esc keeps completed objects.' : doc.entities.length+' committed objects · Esc returns to selection';
    $('draft-status').classList.toggle('pending',draft);
    updateProperties();
    schedule();
  }
  function changed() {
    dirty = true;
    sync();
  }
  function updateLayers() {
    const select = $('layer-select');
    select.replaceChildren();
    $('layer-list').replaceChildren();
    for (const l of doc.layers) {
      const option = document.createElement('option');
      option.value = l.name;
      option.textContent = l.name + (l.visible ? '' : ' (hidden)') + (l.locked ? ' (locked)' : '');
      select.append(option);
      const b = document.createElement('button');
      b.className = 'layer-row' + (l.name === doc.currentLayer ? ' active' : '');
      b.title = l.name;
      const chip = document.createElement('span');
      chip.style.backgroundColor = l.color;
      const title = document.createElement('span');
      title.className = 'layer-title';
      title.textContent = l.name;
      const flag = document.createElement('em');
      flag.textContent = !l.visible ? 'hidden' : l.locked ? 'locked' : '';
      b.append(chip, title, flag);
      b.onclick = () => selectLayer(l.name);
      $('layer-list').append(b);
    }
    select.value = doc.currentLayer;
    const current = doc.layer(doc.currentLayer);
    $('layer-color').value = current.color;
    $('layer-visibility').textContent = current.visible ? 'Hide' : 'Show';
    $('layer-lock').textContent = current.locked ? 'Unlock' : 'Lock';
    const lockedVisible=doc.layers.filter(l=>l.visible&&l.locked).length;
    $('unlock-visible-layers').disabled=!lockedVisible;
    $('import-unlock-layers').hidden=!lockedVisible;
    $('layer-state').textContent=current.visible&&!current.locked?'Ready to draw on '+current.name:
      current.name+' is '+(!current.visible?'hidden':'locked')+'. Drawing will use an editable layer.';
    const properties = $('property-layer');
    if (properties) {
      const pending=properties.value;
      properties.replaceChildren();
      for (const l of doc.layers) {
        const o = document.createElement('option');
        o.value = l.name;
        o.textContent = l.name;
        properties.append(o);
      }
      if(propertyDirty.has('property-layer')&&doc.layer(pending))properties.value=pending;
    }
  }
  const propertyFields = {
    'property-layer':['layer','string'], 'property-color':['color','color'],
    'property-linewidth':['lineWidth','number'], 'property-text':['text','text'],
    'property-height':['textHeight','textNumber'], 'dim-scale':['dimensionScale','dimensionNumber'],
    'dim-arrow-size':['arrowSize','dimensionNumber'], 'dim-arrow-style':['arrowStyle','dimensionString'],
    'dim-extension-offset':['extensionOffset','dimensionNumber'], 'dim-extension-extend':['extensionExtend','dimensionNumber'],
    'dim-text-gap':['textGap','dimensionNumber'], 'dim-precision':['precision','dimensionNumber'],
    'dim-prefix':['prefix','dimensionString'], 'dim-suffix':['suffix','dimensionString'],
    'dim-line-color':['dimensionColor','dimensionColor'], 'dim-text-color':['textColor','dimensionColor']
  };
  const colorChecks = {'property-bylayer':'property-color','dim-line-bylayer':'dim-line-color','dim-text-bylayer':'dim-text-color'};
  const isText = e => e.kind==='text'||e.kind==='dimension';
  function updateProperties() {
    const list=doc.entities.filter(e=>selected.has(e.id)),key=[...selected].sort((a,b)=>a-b).join(',');
    if(key!==propertySelectionKey){propertySelectionKey=key;propertyDirty.clear();}
    $('property-type').textContent=list.length===1?list[0].kind.toUpperCase():list.length?list.length+' objects':'No selection';
    const dims=list.filter(e=>e.kind==='dimension');
    if($('dimension-properties')) $('dimension-properties').hidden=!dims.length;
    for(const[id,[field,type]] of Object.entries(propertyFields)){
      const el=$(id);if(!el)continue;
      const applicable=type.startsWith('dimension')?dims:type.startsWith('text')?list.filter(isText):list;
      el.disabled=!applicable.length;
      if(propertyDirty.has(id))continue;
      const values=applicable.map(e=>e[field]??(type.endsWith('Color')||type==='color'?null:field==='dimensionScale'?1:field==='arrowStyle'?'closed':field==='precision'?2:field==='textHeight'?12:type.includes('Number')||type==='number'?0:''));
      const mixed=values.some(v=>v!==values[0]);el.dataset.mixed=String(mixed);el.title=mixed?'Mixed values. Edit only the fields you want to change.':'';
      if(el.type==='color')el.value=values[0]|| (applicable[0]?entityColor(applicable[0]):'#e5edf5');
      else el.value=mixed?'':(values[0]??'');
      if('placeholder' in el)el.placeholder=mixed?'Mixed':field==='text'?'<> = measured value':'';
    }
    for(const[check,id]of Object.entries(colorChecks)){
      const box=$(check),el=$(id);if(!box||!el)continue;
      const field=propertyFields[id][0],applicable=id==='property-color'?list:dims;
      box.disabled=!applicable.length;
      if(!propertyDirty.has(id)){
        const inherited=applicable.filter(e=>e[field]==null).length;
        box.checked=!!applicable.length&&inherited===applicable.length;
        box.indeterminate=inherited>0&&inherited<applicable.length;
      }
      el.disabled=!applicable.length||box.checked;
    }
    $('apply-properties').disabled=!list.length;
  }
  function applyProperties() {
    if(!selected.size)throw Error('Select objects first.');
    if(!propertyDirty.size){log('No property changes to apply.');return;}
    const next=C.Document.parse(doc.serialize());
    for(const e of next.entities)if(selected.has(e.id)){
      if(!editable(doc.entities.find(x=>x.id===e.id)))throw Error('Selection contains a locked or hidden object');
      for(const id of propertyDirty){const[field,type]=propertyFields[id];if(type.startsWith('dimension')&&e.kind!=='dimension'||type.startsWith('text')&&!isText(e))continue;
        const el=$(id);let value=type==='number'||type.endsWith('Number')?Number(el.value):el.value;
        if(type==='number'||type.endsWith('Number')){if(el.value.trim()===''||!Number.isFinite(value))throw Error('Enter a valid '+field);}
        if(type==='color'||type==='dimensionColor'){const check=Object.keys(colorChecks).find(k=>colorChecks[k]===id);value=$(check).checked?null:el.value;}
        e[field]=value;
      }
      const target=next.layer(e.layer);if(!target||!target.visible||target.locked)throw Error('Target layer is hidden, locked or missing');
    }
    next.serialize();doc.checkpoint();doc.entities=next.entities;propertyDirty.clear();changed();log('Changed properties applied; other object properties were preserved.');
  }
  function defaultDimensionStyle(){
    if(doc.resources?.currentDimStyle)return window.RasmDimensions.currentStyle(doc);
    if(dimensionDefaults)return {...dimensionDefaults};
    const height=clamp(14/zoom,1e-6,1e9);
    return {textHeight:height,dimensionScale:1,arrowSize:height*.6,extensionOffset:height*.15,extensionExtend:height*.25,textGap:height*.35,precision:2,prefix:'',suffix:'',textColor:null,dimensionColor:null,arrowStyle:'closed'};
  }
  function useDimensionDefaults(){
    const selectedDimension=doc.entities.find(e=>selected.has(e.id)&&e.kind==='dimension');if(!selectedDimension)throw Error('Select a dimension first.');
    const e={...selectedDimension};for(const id of propertyDirty){const[field,type]=propertyFields[id];if(!type.startsWith('dimension')&&id!=='property-height'&&id!=='property-color')continue;const el=$(id);if(type.endsWith('Number')){if(el.value.trim()==='')throw Error('Enter a valid '+field);e[field]=Number(el.value);}else if(type==='dimensionColor'||type==='color'){const check=Object.keys(colorChecks).find(k=>colorChecks[k]===id);e[field]=$(check).checked?null:el.value;}else e[field]=el.value;}
    C.validateEntity(e);
    dimensionDefaults=Object.fromEntries(['textHeight','dimensionScale','arrowSize','extensionOffset','extensionExtend','textGap','precision','prefix','suffix','textColor','dimensionColor','arrowStyle','color'].map(k=>[k,e[k]]));
    dimTextHeight=e.textHeight;log('New-dimension defaults updated for this session. Selected objects were not changed.');
  }
  function selectLayer(name) {
    if (name !== doc.currentLayer) {
      doc.checkpoint();
      doc.currentLayer = name;
      points = [];
      changed();
    }
    updateLayers();
  }
  function addLayer(name) {
    name = name.trim();
    if (!name) throw Error('Enter a layer name.');
    if (name.length > 80 || /[\x00-\x1f]/.test(name))
      throw Error('Invalid layer name or name too long.');
    if (doc.layer(name)) {
      selectLayer(name);
      return;
    }
    if (doc.layers.length >= 4096) throw Error('Layer limit reached.');
    doc.checkpoint();
    doc.layers.push({name, color: '#69dfc3', visible: true, locked: false});
    doc.currentLayer = name;
    points = [];
    changed();
    updateLayers();
    $('layer-name').value = '';
    log('Layer created: ' + name);
  }
  function ensureDrawingLayer(){
    const current=doc.layer(doc.currentLayer);
    if(current?.visible&&!current.locked)return null;
    // Prepare the repair before changing history, so a layer-limit error leaves
    // both the drawing and Undo stack intact.
    const next=C.Document.parse(doc.serialize()),result=IO.ensureWritableLayer(next);
    doc.checkpoint();doc.layers=next.layers;doc.currentLayer=next.currentLayer;
    dirty=true;updateLayers();sync();
    log(result.message||'Drawing on editable layer '+doc.currentLayer+'. Source layer states were preserved.');
    return result;
  }
  function unlockVisibleLayers(){
    const count=doc.layers.filter(l=>l.visible&&l.locked).length;
    if(!count){log('All visible layers are already unlocked.');return;}
    doc.checkpoint();for(const l of doc.layers)if(l.visible)l.locked=false;
    updateLayers();changed();
    log('Unlocked '+count+' visible layers. Their objects can now be selected and edited. Undo restores the locks.');
  }
  function prompt() {
    if(advanced?.active){$('prompt').textContent=advanced.prompt;return;}
    if(params.acquiring){$('prompt').textContent=tool.toUpperCase()+': select objects, then Enter / right-click / Finish to continue. Shift removes.';return;}
    const at = points.length;
    const prompts = {
      select: 'Select objects. Click adds; Shift removes. Type an edit command after selecting.',
      line: at ? 'LINE: next point; Enter / right-click / Finish ends. U undo; C close.' :
                 'LINE: specify first point or enter x,y.',
      polyline: at ? 'PLINE: next point; Enter to finish, C to close.' :
                     'PLINE: specify first point.',
      rectangle: at ? 'RECTANGLE: specify opposite corner.' : 'RECTANGLE: specify first corner.',
      circle: params.circleMode==='2P'?'CIRCLE 2P: specify diameter endpoints.':params.circleMode==='3P'?'CIRCLE 3P: specify three points on the circumference.':at ? 'CIRCLE: click radius point, enter radius, or D for diameter. Finish accepts preview.' : 'CIRCLE: specify center, or enter 2P / 3P.',
      arc: at === 0 ? 'ARC: specify center.' :
          at === 1  ? 'ARC: specify start point.' :
                      'ARC: specify end direction (counterclockwise).',
      text: at ? 'TEXT: enter text in the command field.' : 'TEXT: specify insertion point.',
      dimension: at === 0 ? 'DIM: first extension point.' :
          at === 1        ? 'DIM: second extension point.' :
                            'DIM: specify dimension line location.',
      move: at ? 'MOVE: specify destination or @dx,dy.' : 'MOVE: specify base point.',
      copy: at ? 'COPY: specify destination or @dx,dy.' : 'COPY: specify base point.',
      rotate: at ? 'ROTATE: enter angle in degrees (positive counterclockwise).' :
                   'ROTATE: specify rotation center.',
      scale: at ? 'SCALE: enter positive scale factor (2 or 0.5).' : 'SCALE: specify base point.'
    };
    const extra = {
      trim:
          'TRIM: click the portion to remove. All other visible objects are boundaries (or preselect boundaries).',
      extend: 'EXTEND: click near the endpoint to extend; other visible objects are boundaries.',
      offset: params.value == null ?
          'OFFSET: enter positive distance, then click the side for selected objects.' :
          'OFFSET: click the side to create the offset.',
      fillet: params.value == null ?
          'FILLET: enter radius, then click the retained side of two lines.' :
          params.first ? 'FILLET: select the second line on the side to keep.' :
                         'FILLET: select the first line on the side to keep.',
      chamfer: params.value == null ? 'CHAMFER: enter distance1,distance2, then click two lines.' :
          params.first              ? 'CHAMFER: select second line.' :
                                      'CHAMFER: select first line.',
      mirror: points.length ? 'MIRROR: second point on mirror axis (creates a copy).' :
                              'MIRROR: first point on mirror axis.',
      array: 'ARRAY: enter rows,columns,dx,dy for selected objects.',
      polararray: params.count ? 'POLARARRAY: specify array center.' :
                                 'POLARARRAY: enter count,fill-angle (example 6,360).',
      distance: points.length ? 'DISTANCE: specify second point.' :
                                'DISTANCE: specify first point.',
      angle: [
        'ANGLE: specify first arm point.', 'ANGLE: specify vertex.',
        'ANGLE: specify second arm point.'
      ][points.length],
      area: 'AREA: click a circle/closed polyline, or enter polygon vertices then Enter.',
      dimlinear: points.length < 2 ?
          'DIMLINEAR: specify extension points.' :
          'DIMLINEAR: specify dimension line location (' + linearStyle + ').',
      dimangular: [
        'DIMANGULAR: first arm point.', 'DIMANGULAR: vertex.', 'DIMANGULAR: second arm point.',
        'DIMANGULAR: specify arc/text location.'
      ][points.length],
      dimradius: params.circle ? 'DIMRADIUS: specify label/leader location.' :
                                 'DIMRADIUS: select a circle/arc, then specify label location.',
      dimdiameter: params.circle ? 'DIMDIAMETER: specify label/leader location.' :
                                   'DIMDIAMETER: select a circle/arc, then specify label location.'
    };
    $('prompt').textContent = extra[tool] || prompts[tool] || 'Specify input in the command field.';
  }
  function setTool(next, focus = true) {
    if(next==='explode'&&advanced){advanced.execute('EXPLODE');return;}
    if(advanced?.active)advanced.cancel();
    if (tool==='polyline'&&points.length>=2&&next!==tool){const p=points;points=[];append(make('polyline',p,{closed:false}));}
    selected=new Set([...selected].filter(id=>doc.entities.some(e=>e.id===id&&editable(e))));
    const needsSelection=['move','copy','rotate','scale','offset','mirror','array','polararray','explode','join','erase'].includes(next);
    if ((next === 'explode' || next === 'join')&&selected.size) {
      finishEdit(E[next](doc, [...selected]));
      return;
    }
    if(['line','polyline','rectangle','circle','arc','text','dimension','dimlinear','dimangular','dimradius','dimdiameter'].includes(next))selected.clear();
    if (next !== 'select') lastTool = next;
    tool = next;
    points = [];
    params = {boundaries: [...selected],acquiring:needsSelection&&!selected.size};
    snapPoint = null;
    previewWorld = null;
    hovered = null;
    gesture = null;
    gripPreview = null;
    selectionCycle = null;
    if(['line','polyline','rectangle','circle','arc','text','dimension','dimlinear','dimangular','dimradius','dimdiameter'].includes(next))ensureDrawingLayer();
    prompt();
    sync();
    if (focus) $('command').focus();
  }
  function commitSelection(){
    if(!selected.size){log('Select at least one editable object, or Esc to cancel.',true);return;}
    params.acquiring=false;
    if(tool==='erase'){erase();return;}
    if(tool==='explode'||tool==='join'){finishEdit(E[tool](doc,[...selected]));return;}
    prompt();sync();log(selected.size+' objects selected. Follow the command prompt.');
  }
  function finishCommand(){
    if(advanced?.active){advanced.finish();return;}
    if(params.acquiring){commitSelection();return;}
    if(tool==='polyline'){finishPolyline(false);return;}
    if(tool==='circle'&&points.length){
      if(previewWorld&&C.distance(previewWorld,points[0])>1/zoom){acceptPoint(previewWorld);return;}
      log('Specify a valid radius point or positive radius. Esc cancels the unfinished circle.',true);return;
    }
    if(tool==='area'&&points.length>=3){const a=E.area(make('polyline',points,{closed:true}));measured({type:'area',...a},'AREA = '+fmt(a.area)+'   PERIMETER = '+fmt(a.perimeter));return;}
    if(tool==='select'){
      if(selected.size){log(selected.size+' objects selected. Choose Move, Copy, Properties, or another edit command.');return;}
      setTool(lastTool);return;
    }
    setTool('select');log('Command finished. Select objects or start another command.');
  }
  function cancelCommand(){
    if(advanced?.active)advanced.cancel();
    if(tool==='polyline'&&points.length>=2){finishPolyline(false);}else{points=[];setTool('select',false);}
    selected.clear();$('command').value='';previewWorld=null;updateSuggestions();sync();log('Command canceled. Completed geometry has been kept.');canvas.focus();
  }
  function append(entity) {
    ensureDrawingLayer();
    entity.layer = doc.currentLayer;
    C.validateEntity({...entity, id: doc.nextId});
    doc.checkpoint();
    const id=doc.add(entity);lastCreatedId=id;
    changed();
    return id;
  }
  function make(kind, p, extra = {}) {
    return {kind, points: p.map(q => ({...q})), ...extra};
  }
  function hitAt(p) {
    return S.pick(doc,p,8/zoom);
  }
  function finishEdit(ids) {
    selected = new Set(ids);
    changed();
    setTool('select');
    log('Edit completed. ' + ids.length + ' resulting objects.');
  }
  function measured(result, message) {
    lastMeasurement = result;
    setTool('select');
    log(message);
  }
  function advancedPoint(p) {
    if (tool === 'id') {
      measured({type: 'id', point: p}, 'ID: X = ' + fmt(p.x) + '   Y = ' + fmt(p.y));
      return true;
    }
    if (tool === 'matchprop') {
      const e = hitAt(p);
      if (!e) throw Error('Pick a source/target object');
      if (!params.source) {
        params.source = e;
        log('MATCHPROP: now pick the target object.');
        return true;
      }
      const next = C.Document.parse(doc.serialize()),
            target = next.entities.find(x => x.id === e.id), source = params.source;
      target.layer = source.layer;
      target.color = source.color;
      target.lineWidth = source.lineWidth;
      target.textHeight = source.textHeight;
      next.serialize();
      doc.checkpoint();
      doc.entities = next.entities;
      finishEdit([e.id]);
      return true;
    }
    if (tool === 'trim' || tool === 'extend') {
      const e = hitAt(p);
      if (!e) throw Error('Pick an object close to the portion or endpoint to edit');
      finishEdit(E[tool](doc, e.id, p, params.boundaries || []));
      return true;
    }
    if (tool === 'offset') {
      if (params.value == null) throw Error('Enter offset distance first');
      finishEdit(E.offset(doc, [...selected], params.value, p));
      return true;
    }
    if (tool === 'fillet' || tool === 'chamfer') {
      if (params.value == null) throw Error('Enter radius or chamfer distances first');
      const e = hitAt(p);
      if (!e || e.kind !== 'line') throw Error('Pick a LINE entity');
      if (!params.first) {
        params.first = e.id;
        params.pick = p;
        prompt();
        return true;
      }
      const ids = tool === 'fillet' ?
          E.fillet(doc, params.first, e.id, params.value, params.pick, p) :
          E.chamfer(doc, params.first, e.id, params.value, params.second, params.pick, p);
      finishEdit(ids);
      return true;
    }
    if (tool === 'mirror') {
      points.push(p);
      if (points.length === 2)
        finishEdit(E.mirror(doc, [...selected], points[0], points[1], true));
      else
        prompt();
      return true;
    }
    if (tool === 'polararray') {
      if (!params.count) throw Error('Enter count,fill-angle first');
      finishEdit(E.polarArray(doc, [...selected], p, params.count, params.fill));
      return true;
    }
    if (tool === 'array') throw Error('Enter rows,columns,dx,dy in the command field');
    if (tool === 'distance') {
      points.push(p);
      if (points.length === 2) {
        const [a, b] = points, d = E.distance(a, b);
        measured(
            {type: 'distance', value: d, dx: b.x - a.x, dy: b.y - a.y},
            'DISTANCE = ' + fmt(d) + '   ΔX = ' + fmt(b.x - a.x) + '   ΔY = ' + fmt(b.y - a.y));
      } else
        prompt();
      return true;
    }
    if (tool === 'angle') {
      points.push(p);
      if (points.length === 3) {
        const a = E.angle(points[0], points[1], points[2]);
        measured({type: 'angle', value: a}, 'ANGLE = ' + fmt(a) + ' degrees');
      } else
        prompt();
      return true;
    }
    if (tool === 'area') {
      if (!points.length) {
        const e = hitAt(p);
        if (e && (e.kind === 'circle' || e.kind === 'polyline' && e.closed)) {
          const a = E.area(e);
          measured(
              {type: 'area', ...a}, 'AREA = ' + fmt(a.area) + '   PERIMETER = ' + fmt(a.perimeter));
          return true;
        }
      }
      points.push(p);
      prompt();
      schedule();
      return true;
    }
    if (['dimlinear', 'dimangular'].includes(tool)) {
      points.push(p);
      const count = tool === 'dimangular' ? 4 : 3;
      if (points.length === count) {
        append(make('dimension', points, {
          ...defaultDimensionStyle(),
          dimensionStyle: tool === 'dimangular' ? 'angular' : linearStyle,
        }));
        setTool('select');
      } else
        prompt();
      schedule();
      return true;
    }
    if (tool === 'dimradius' || tool === 'dimdiameter') {
      if (!params.circle && !points.length) {
        const e = hitAt(p);
        if (e && (e.kind === 'circle' || e.kind === 'arc')) {
          params.circle = e;
          prompt();
          return true;
        }
      }
      if (params.circle) {
        const c = params.circle.points[0], d = V.sub(p, c), length = C.distance(p, c);
        if (length < 1e-9) throw Error('Specify a label away from the center');
        const edge = V.add(c, V.mul(d, params.circle.radius / length));
        append(make('dimension', [c, edge, p], {
          ...defaultDimensionStyle(),
          dimensionStyle: tool === 'dimradius' ? 'radius' : 'diameter',
        }));
        setTool('select');
      } else {
        points.push(p);
        if (points.length === 3) {
          append(make('dimension', points, {
            ...defaultDimensionStyle(),
            dimensionStyle: tool === 'dimradius' ? 'radius' : 'diameter',
          }));
          setTool('select');
        } else
          prompt();
      }
      schedule();
      return true;
    }
    return false;
  }
  function finishPolyline(close) {
    const vertices=points.map(p=>({...p}));points=[];
    if (vertices.length >= 2) {
      append(make('polyline', vertices, {closed: close&&vertices.length>=3}));
      log('Polyline created.');
    }
    setTool('select');
  }
  function acceptPoint(p) {
    if(advanced?.active&&advanced.acceptPoint(p))return;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1e12 ||
        Math.abs(p.y) > 1e12)
      throw Error('Coordinates out of range.');
    if(params.acquiring){pick(worldToScreen(p),{});return;}
    const savedPoints=points.map(q=>({...q}));
    try {
    if (advancedPoint(p)) return;
    if (tool === 'select') {
      log('Choose a drawing tool before entering coordinates.');
      return;
    }
    if (['move', 'copy'].includes(tool)) {
      if (!points.length)
        points = [p];
      else {
        const delta = V.sub(p, points[0]), next = C.Document.parse(doc.serialize());
        let ids = [...selected].filter(id => doc.entities.some(e => e.id === id && editable(e)));
        if (tool === 'copy') {
          ids = ids.map(id => {
            const e = doc.entities.find(e => e.id === id);
            return next.add({...e, id: undefined});
          });
        }
        next.transform(ids, {translation: delta});
        doc.checkpoint();
        doc.entities = next.entities;
        doc.nextId = next.nextId;
        selected = new Set(ids);
        changed();
        log(tool === 'copy' ? 'Objects copied.' : 'Objects moved.');
        setTool('select');
      }
      prompt();
      schedule();
      return;
    }
    if (['rotate', 'scale'].includes(tool)) {
      if (!points.length)
        points = [p];
      else
        log('Enter a numeric value in the command field.');
      prompt();
      schedule();
      return;
    }
    if (tool === 'text') {
      points = [p];
      prompt();
      schedule();
      return;
    }
    if(tool==='polyline'&&points.length&&C.distance(points.at(-1),p)<1e-9)return;
    if(['dimension','dimlinear'].includes(tool)&&points.length===1&&C.distance(points[0],p)<1e-9)throw Error('Choose distinct extension points.');
    if(tool==='polyline'&&points.length)params.lastDirection=V.sub(p,points.at(-1));
    points.push(p);
    if(tool==='line'&&points.length===1){params.lineStart={...p};params.lineIds=[];}
    if (tool === 'line' && points.length === 2) {
      if (C.distance(points[0], points[1]) < 1e-9) {
        points.pop();
        log('Same point. Double-click or Finish to end the LINE command.');return;
      }
      const id=append(make('line', points));params.lineIds.push(id);
      params.lastDirection=V.sub(points[1],points[0]);
      points = [p];
    } else if (tool === 'rectangle' && points.length === 2) {
      const [a, b] = points;
      if (Math.abs(a.x - b.x) < 1e-9 || Math.abs(a.y - b.y) < 1e-9) {
        points.pop();
        throw Error('Rectangle requires nonzero width and height.');
      }
      append(make('polyline', [a, {x: b.x, y: a.y}, b, {x: a.x, y: b.y}], {closed: true}));
      setTool('select');
    } else if (tool === 'circle' && (points.length === (params.circleMode==='3P'?3:2))) {
      let center=points[0],r=C.distance(points[0],points[1]);
      if(params.circleMode==='2P'){center=V.mul(V.add(points[0],points[1]),.5);r/=2;}
      if(params.circleMode==='3P'){const[a,b,c]=points,den=2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y));if(Math.abs(den)<1e-10){points.pop();throw Error('Three non-collinear points are required.');}const aa=a.x*a.x+a.y*a.y,bb=b.x*b.x+b.y*b.y,cc=c.x*c.x+c.y*c.y;center={x:(aa*(b.y-c.y)+bb*(c.y-a.y)+cc*(a.y-b.y))/den,y:(aa*(c.x-b.x)+bb*(a.x-c.x)+cc*(b.x-a.x))/den};r=C.distance(center,a);}
      if (r < 1e-9) {
        points.pop();
        throw Error('Radius must be positive.');
      }
      append(make('circle', [center], {radius: r}));
      setTool('select');
    } else if (tool === 'arc' && points.length === 3) {
      const [c, a, b] = points, r = C.distance(c, a);
      if (r < 1e-9) {
        points.pop();
        points.pop();
        throw Error('Arc radius must be positive.');
      }
      append(make('arc', [c], {
        radius: r,
        startAngle: Math.atan2(a.y - c.y, a.x - c.x),
        endAngle: Math.atan2(b.y - c.y, b.x - c.x)
      }));
      setTool('select');
    } else if (tool === 'dimension' && points.length === 3) {
      if (C.distance(points[0], points[1]) < 1e-9) {
        points.pop();
        points.pop();
        throw Error('Choose different extension points.');
      }
      append(make('dimension', points, defaultDimensionStyle()));
      setTool('select');
    }
    prompt();
    sync();
    }catch(error){points=savedPoints;prompt();schedule();throw error;}
  }
  function constrained(px) {
    let p = screenToWorld(px);
    snapPoint = null;
    snapType='';
    if(snap){
      const hit=window.RasmSnaps.find(doc,p,10/zoom,{modes:advanced?.snapModes,base:advanced?.basePoint||points.at(-1)||null,excludeIds:gesture?.kind==='grip'?[gesture.id]:[]});
      if(hit){p={...hit.point};snapPoint=p;snapType=hit.type;}
    }
    if (!snapPoint && ortho && points.length &&
        ['line', 'polyline', 'move', 'copy'].includes(tool)) {
      const b = points.at(-1);
      if (Math.abs(p.x - b.x) > Math.abs(p.y - b.y))
        p.y = b.y;
      else
        p.x = b.x;
    }
    return p;
  }
  function transformNumber(value) {
    if (!points.length) throw Error('Specify base point first.');
    if (tool === 'scale' && value <= 0) throw Error('Scale factor must be positive.');
    const options = {pivot: points[0]};
    if (tool === 'rotate')
      options.rotation = value * Math.PI / 180;
    else
      options.scale = value;
    const ids = [...selected].filter(id => doc.entities.some(e => e.id === id && editable(e)));
    doc.checkpoint();
    doc.transform(ids, options);
    changed();
    log('Selected objects updated.');
    setTool('select');
  }
  function erase() {
    const ids = [...selected].filter(id => doc.entities.some(e => e.id === id && editable(e)));
    if (!ids.length){setTool('erase');return;}
    doc.checkpoint();
    doc.erase(ids);
    selected.clear();
    setTool('select', false);
    changed();
    log('Erased ' + ids.length + ' objects.');
  }
  function history(redo = false) {
    if(!redo&&tool==='line'&&params.lineIds?.length){execute('U');return;}
    if(!redo&&tool==='polyline'&&points.length>1){points.pop();prompt();schedule();log('Last polyline vertex undone.');return;}
    points=[];
    if (redo ? doc.redo() : doc.undo()) {
      selected.clear();
      setTool('select', false);
      changed();
      updateLayers();
      log(redo ? 'Redo.' : 'Undo.');
    }
  }
  function fit() {
    const b = doc.bounds();
    if (!b.valid) {
      camera = {x: 300, y: 200};
      zoom = 1;
    } else {
      camera = V.mul(V.add(b.min, b.max), .5);
      zoom = clamp(
          Math.min(
              Math.max(40, W - 100) / Math.max(1, b.max.x - b.min.x),
              Math.max(40, H - 100) / Math.max(1, b.max.y - b.min.y)),
          .00001, 10000);
    }
    schedule();
  }
  function parsePoint(input) {
    return Commands.parsePoint(input,points.at(-1)||null);
  }
  function updateSuggestions(){
    const value=$('command').value;
    suggestions=tool==='text'&&points.length?[]:Commands.suggest(value);
    suggestionIndex=-1;renderSuggestions();
  }
  function renderSuggestions(){
    const list=$('suggestions');list.replaceChildren();list.hidden=!suggestions.length;
    $('command').setAttribute('aria-expanded',String(!!suggestions.length));
    $('command').removeAttribute('aria-activedescendant');
    suggestions.forEach((entry,index)=>{
      const item=document.createElement('li');item.id='suggestion-'+index;
      item.role='option';item.setAttribute('aria-selected',String(index===suggestionIndex));
      item.classList.toggle('active',index===suggestionIndex);
      item.textContent=entry.name+' — '+entry.description;
      item.addEventListener('mousedown',e=>{e.preventDefault();completeSuggestion(index);});
      list.append(item);
      if(index===suggestionIndex)$('command').setAttribute('aria-activedescendant',item.id);
    });
  }
  function completeSuggestion(index=0){
    if(!suggestions[index])return;
    $('command').value=suggestions[index].name+' ';suggestions=[];suggestionIndex=-1;renderSuggestions();$('command').focus();
  }
  function submitCommand(){
    if(suggestionIndex>=0&&suggestions[suggestionIndex])$('command').value=suggestions[suggestionIndex].name;
    const value=$('command').value;
    if(value.trim()){
      if(inputHistory.at(-1)!==value)inputHistory.push(value);
      if(inputHistory.length>100)inputHistory.shift();
      log('Command: '+value);
    }
    historyIndex=inputHistory.length;historyDraft='';execute(value);
  }
  function downloadDiagnostics(){
    const result={application:'RasmCAD Advanced',version:VERSION,generatedAt:new Date().toISOString(),
      browser:navigator.userAgent,devicePixelRatio:window.devicePixelRatio,viewport:{width:W,height:H},camera,zoom,
      tool,entityCount:doc.entities.length,selectedCount:selected.size,unfinishedPoints:points.length,
      history:commandHistory.slice(-100),errors:diagnosticEvents.slice()};
    download(JSON.stringify(result,null,2),'RasmCAD-'+VERSION+'-diagnostics.json','application/json');
    log('Diagnostics downloaded. Review the file before sharing: recent command text is included.');
  }
  function execute(input) {
    input = String(input).trim();
    $('command').value = '';
    updateSuggestions();
    if (!input) {
      finishCommand();
      return;
    }
    if(advanced?.active||/^(STRETCH|BREAK|LENGTHEN|ALIGN|PEDIT|SPLINEDIT|SPLINE|OVERKILL|EXPLODE|EXPLOAD|HATCH|HATCHEDIT|BOUNDARY|REGION|BLOCK|INSERT|WBLOCK|BEDIT|REFEDIT|BCLOSE|ATTDEF|ATTEDIT|ATTSYNC|DIMSTYLE|DIMCONTINUE|DIMBASELINE|DIMORDINATE|DIMEDIT|QLEADER|MLEADER|MLEADEREDIT|OSNAPSET)(?:\s|$)/i.test(input)){if(advanced.execute(input))return;}
    if(params.acquiring){const p=parsePoint(input);if(p){acceptPoint(p);return;}if(['ALL','A'].includes(input.toUpperCase())){selected=new Set(doc.entities.filter(editable).map(e=>e.id));sync();return;}throw Error('Select objects, then press Enter. Esc cancels.');}
    if (tool === 'text' && points.length) {
      append(make('text', [points[0]], {text: input, textHeight:clamp(14/zoom,1e-6,1e9)}));
      setTool('select');
      log('Text created.');
      return;
    }
    input=Commands.normalizeInput(input);
    if (tool === 'polyline' && input.toUpperCase() === 'C') {
      finishPolyline(true);
      return;
    }
    if(tool==='line'&&input.toUpperCase()==='C'){if(!params.lineStart||!params.lineIds?.length)throw Error('Draw line segments before Close.');if(C.distance(points[0],params.lineStart)>1e-9)append(make('line',[points[0],params.lineStart]));setTool('select');return;}
    if(tool==='line'&&['U','UNDO'].includes(input.toUpperCase())){const id=params.lineIds?.at(-1),e=doc.entities.find(e=>e.id===id);if(!e){log('No more segments in this LINE command to undo.');return;}const start={...e.points[0]};doc.undo();params.lineIds.pop();points=[start];changed();prompt();log('Last LINE segment undone. Continue drawing or Finish.');return;}
    if(tool==='polyline'&&['U','UNDO'].includes(input.toUpperCase())){if(points.length>1)points.pop();prompt();schedule();return;}
    if(tool==='circle'&&!points.length&&['2P','3P'].includes(input.toUpperCase())){params.circleMode=input.toUpperCase();prompt();return;}
    if(tool==='circle'&&points.length===1&&!params.circleMode&&input.toUpperCase()==='D'){params.circleDiameter=true;prompt();log('CIRCLE: enter diameter (not radius).');return;}
    if (tool === 'array') {
      const a = input.split(/[,\s]+/).map(Number);
      if (a.length !== 4 || a.some(v => !Number.isFinite(v)))
        throw Error('Enter rows,columns,dx,dy');
      finishEdit(E.rectangularArray(doc, [...selected], ...a));
      return;
    }
    if (tool === 'polararray' && !params.count) {
      const a = input.split(/[,\s]+/).map(Number);
      if (a.length < 1 || a.length > 2 || !Number.isInteger(a[0]) || a[0] < 2 ||
          a.some(v => !Number.isFinite(v)))
        throw Error('Enter integer count and optional fill angle');
      params.count = a[0];
      params.fill = a[1] ?? 360;
      prompt();
      return;
    }
    if (['offset', 'fillet', 'chamfer'].includes(tool) && params.value == null) {
      const a = input.split(/[,\s]+/).map(Number);
      if (a.length > 2 || a.some(v => !Number.isFinite(v)) || a[0] < 0 ||
          (tool === 'offset' && a[0] === 0))
        throw Error('Enter a valid distance/radius');
      params.value = a[0];
      params.second = a[1] ?? a[0];
      prompt();
      return;
    }
    const point = parsePoint(input);
    if (point) {
      acceptPoint(point);
      return;
    }
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(input)) {
      const v = Number(input);
      if (!Number.isFinite(v)) throw Error('Enter a valid number.');
      if(['line','polyline'].includes(tool)){
        if(!points.length)throw Error('Specify the first point before entering a length.');
        const base=points.at(-1),cursor=previewWorld||(mouse?constrained(mouse):null);
        const endpoint=Commands.distancePoint(base,v,cursor,{ortho,lastDirection:params.lastDirection});
        params.lastDirection=V.sub(endpoint,base);
        acceptPoint(endpoint);mouse=null;previewWorld={...endpoint};
        log(tool.toUpperCase()+': length '+fmt(v)+' committed. Enter or Esc ends drawing; click or enter the next segment.');
        sync();return;
      }
      if (tool === 'circle' && points.length&&!params.circleMode) {
        if (v <= 0) throw Error('Radius must be positive.');
        acceptPoint({x: points[0].x + v/(params.circleDiameter?2:1), y: points[0].y});
        return;
      }
      if (['rotate', 'scale'].includes(tool)) {
        transformNumber(v);
        return;
      }
      throw Error('This command needs a point or a command name. For a point enter x,y.');
    }
    const match = input.match(/^(\S+)(?:\s+([\s\S]*))?$/), name = match[1].toUpperCase(),
          rest = match[2] || '';
    const aliases = {
      L: 'line',
      LINE: 'line',
      PL: 'polyline',
      PLINE: 'polyline',
      POLYLINE: 'polyline',
      REC: 'rectangle',
      RECTANGLE: 'rectangle',
      C: 'circle',
      CIRCLE: 'circle',
      A: 'arc',
      ARC: 'arc',
      T: 'text',
      TEXT: 'text',
      DTEXT: 'text',
      MTEXT: 'text',
      DIM: 'dimension',
      DIMALIGNED: 'dimension',
      DAL: 'dimension',
      M: 'move',
      MOVE: 'move',
      CO: 'copy',
      COPY: 'copy',
      RO: 'rotate',
      ROTATE: 'rotate',
      SC: 'scale',
      SCALE: 'scale',
      SELECT: 'select',
      TR: 'trim',
      TRIM: 'trim',
      EX: 'extend',
      EXTEND: 'extend',
      O: 'offset',
      OFFSET: 'offset',
      F: 'fillet',
      FILLET: 'fillet',
      CHA: 'chamfer',
      CHAMFER: 'chamfer',
      MI: 'mirror',
      MIRROR: 'mirror',
      AR: 'array',
      ARRAY: 'array',
      ARRAYRECT: 'array',
      POLARARRAY: 'polararray',
      ARRAYPOLAR: 'polararray',
      X: 'explode',
      EXPLODE: 'explode',
      J: 'join',
      JOIN: 'join',
      DI: 'distance',
      DIST: 'distance',
      DISTANCE: 'distance',
      ANGLE: 'angle',
      AREA: 'area',
      AA: 'area',
      DIMLINEAR: 'dimlinear',
      DLI: 'dimlinear',
      DIMANGULAR: 'dimangular',
      DAN: 'dimangular',
      DIMRADIUS: 'dimradius',
      DRA: 'dimradius',
      DIMDIAMETER: 'dimdiameter',
      DDI: 'dimdiameter',
      PAN: 'pan',
      ID: 'id',
      MATCHPROP: 'matchprop',
      MA: 'matchprop'
    };
    if (name === 'DIMHORIZONTAL' || name === 'DIMVERTICAL') {
      linearStyle = name === 'DIMHORIZONTAL' ? 'horizontal' : 'vertical';
      setTool('dimlinear');
      return;
    }
    const dimensionVariables={DIMTXT:'textHeight',DIMSCALE:'dimensionScale',DIMASZ:'arrowSize',DIMEXO:'extensionOffset',DIMEXE:'extensionExtend',DIMGAP:'textGap',DIMDEC:'precision'};
    if (dimensionVariables[name]) {
      const v = Number(rest);
      const field=dimensionVariables[name];if(!rest||!Number.isFinite(v)||v<0||(['textHeight','dimensionScale','arrowSize'].includes(field)&&v===0)||field==='precision'&&(!Number.isInteger(v)||v>8))throw Error('Invalid '+name+' value');
      dimensionDefaults={...defaultDimensionStyle(),[field]:v};dimTextHeight=dimensionDefaults.textHeight;
      log(name+' = '+v+' for new dimensions. Select existing dimensions and use Properties to change them.');
      return;
    }
    if (name === 'DIMLINEAR' || name === 'DLI') linearStyle = 'horizontal';
    if (aliases[name]) {
      setTool(aliases[name]);
      if (rest) {
        for (const token of rest.split(/\s+/)) execute(token);
      }
      return;
    }
    if (name === 'LAYER') {
      addLayer(rest);
      return;
    }
    const actions = {
      Z: fit,
      ZOOM: fit,
      ZOOMEXTENTS: fit,
      U: () => history(),
      UNDO: () => history(),
      REDO: () => history(true),
      MREDO: () => history(true),
      E: erase,
      ERASE: erase,
      SAVE: save,
      SAVEAS: save,
      QSAVE: save,
      OPEN: () => openPicker(),
      IMPORT: () => openPicker(),
      DXFIN: () => openPicker(),
      DXFOUT: exportDxf,
      EXPORT: exportDxf,
      NEW: () => newDrawing(),
      QNEW: () => newDrawing(),
      DEMO: () => example(),
      HELP: () => showHelp(),
      GRID: () => toggle('grid'),
      SNAP: () => toggle('snap'),
      OSNAP: () => toggle('snap'),
      ORTHO: () => toggle('ortho'),
      REGEN: schedule,
      REDRAW: schedule,
      PLOT: printDrawing,
      PRINT: printDrawing,
      PROPERTIES: () => $('sidebar').classList.add('open'),
      LIST: () => log(JSON.stringify(doc.entities.filter(e => selected.has(e.id)))),
      SELECTALL: () => {
        selected = new Set(doc.entities.filter(editable).map(e => e.id));
        sync();
      }
    };
    if (actions[name]) {
      actions[name]();
      return;
    }
    throw Error('Unknown command. Enter HELP or coordinates as x,y.');
  }
  function confirmReplace() {
    return !dirty ||
        window.confirm(
            'Unsaved changes. Cancel and Save project to keep them, or OK to discard them.');
  }
  function setDocument(next, name, saved) {
    const layerRecovery=IO.ensureWritableLayer(next);
    // Replacing a document must not finish an old PLINE into the new document.
    // Clear the old construction state before setTool can inspect it.
    points=[];params={};gesture=null;gripPreview=null;mouse=null;previewWorld=null;
    doc = next;
    filename = name;
    dimensionDefaults=null;propertyDirty.clear();propertySelectionKey='';lastCreatedId=null;
    selected.clear();
    setTool('select', false);
    dirty = !saved||layerRecovery.changed;
    updateLayers();
    fit();
    sync();
    return layerRecovery;
  }
  function newDrawing() {
    if(advanced&&!advanced.guardReplace())return;
    if (confirmReplace()) {
      setDocument(new C.Document(), 'Drawing', true);
      log('Untitled drawing.');
    }
  }
  function example() {
    if(advanced&&!advanced.guardReplace())return;
    if (confirmReplace()) {
      setDocument(C.sampleDocument(), 'Example', false);
      log('Example plan opened: ' + doc.entities.length + ' editable objects.');
    }
  }
  function download(content, name, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], {type: mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.hidden = true;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
    downloadSerial++;
  }
  function save() {
    const data = doc.serialize();
    download(data, filename + '.rasm.json', 'application/json;charset=utf-8');
    dirty = false;
    sync();
    log('Downloaded ' + filename + '.rasm.json to browser downloads. Keep the latest version.');
  }
  function openPicker() {
    if(advanced&&!advanced.guardReplace())return;
    if (confirmReplace()) {
      $('file-input').value = '';
      $('file-input').click();
    }
  }
  async function loadFile(file) {
    if(advanced&&!advanced.guardReplace())throw Error('Close block editing before opening another drawing.');
    if (!file) return;
    if (file.size > 64 * 1024 * 1024) throw Error('File exceeds 64 MiB.');
    if (busy) throw Error('An import is already running');
    busy = true;
    document.querySelector('main').inert = true;
    document.querySelector('.actions').inert = true;
    log('Reading ' + file.name + ' locally. DWG may take several seconds...');
    $('open-btn').disabled = true;
    try {
      await new Promise(r => setTimeout(r, 50));
      const result = await IO.importFile(new Uint8Array(await file.arrayBuffer()), file.name);
      const name = file.name.replace(/(?:\.rasm)?\.json$|\.(?:rcad|dxf|dwg|dwt|dws|bak|sv\$)$/i, '') || 'Drawing';
      const layerRecovery=setDocument(result.document, name, /\.json$/i.test(file.name));
      if(layerRecovery.changed&&layerRecovery.message)result.warnings.push(layerRecovery.message);
      log('Opened ' + file.name + ' — ' + doc.entities.length + ' objects. ' +
          result.warnings.length + ' import notices.');
      const editableCount=doc.entities.filter(editable).length;
      $('import-report-content').textContent = 'Source: ' + result.sourceFormat +
          '\nImported objects: ' + doc.entities.length + '\nCurrently selectable objects: '+editableCount+
          '\nCurrent drawing layer: '+doc.currentLayer+' (visible and unlocked)\n\n' +
          (result.warnings.length ? result.warnings.join('\n') :
                                    'No import notices for the supported objects.');
      if (result.warnings.length) $('import-report').showModal();
    } finally {
      busy = false;
      document.querySelector('main').inert = false;
      document.querySelector('.actions').inert = false;
      $('open-btn').disabled = false;
    }
  }
  function exportDxf() {
    download(C.exportDxf(doc), filename + '.dxf', 'application/dxf;charset=utf-8');
    log('DXF exported. Also save the native project to retain editable dimension objects.');
  }
  function exportPng() {
    const oldMouse = mouse, oldSelected = selected;
    mouse = null;
    selected = new Set();
    render(true);
    canvas.toBlob(blob => {
      if (blob) download(blob, filename + '.png', 'image/png');
    }, 'image/png');
    mouse = oldMouse;
    selected = oldSelected;
    schedule();
    log('Current view exported as PNG.');
  }
  function printDrawing() {
    if(plotUI){plotUI.show();return;}
    render(true);
    const image = canvas.toDataURL('image/png');
    const win = window.open('', '_blank');
    if (!win)
      throw Error(
          'The browser blocked the print window. Allow this user-initiated window to print.');
    win.document.open();
    win.document.write(
        '<!doctype html><title>RasmCAD drawing</title><style>@page{size:landscape;margin:12mm}body{margin:0;background:white}img{width:100%;max-height:95vh;object-fit:contain}</style><img alt="RasmCAD drawing">');
    win.document.close();
    win.document.querySelector('img').src = image;
    win.document.querySelector('img').onload = () => {
      win.focus();
      win.print();
    };
    schedule();
  }
  function toggle(which) {
    if (which === 'grid') grid = !grid;
    if (which === 'snap') snap = !snap;
    if (which === 'ortho') ortho = !ortho;
    sync();
  }
  function showHelp() {
    const d = $('help-dialog');
    if (!d.open) d.showModal();
  }
  function line(a, b, color, width = 1, dash = []) {
    const clipped=View.clipSegment(worldToScreen(a),worldToScreen(b),W,H,Math.max(2,width));
    if(!clipped)return;
    a=clipped.a;b=clipped.b;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function text(p, value, height, color, angle = 0) {
    const s = worldToScreen(p), size = clamp(height * zoom, 0, 600);
    if (size < 2) return;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(-angle);
    ctx.fillStyle = color;
    ctx.font = size + 'px Tahoma, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.direction = 'ltr';
    ctx.fillText(value, 0, 0);
    ctx.restore();
  }
  function drawEntity(e, color, width = 1) {
    const p = e.points;
    if (!p.length) return;
    if(e.kind==='compound'){for(const part of e.parts||[])drawEntity(part,selected.has(e.id)||hovered===e.id?color:(part.color||color),width);return;}
    if(e.kind==='solid'){ctx.beginPath();p.forEach((q,i)=>{const at=worldToScreen(q);if(i)ctx.lineTo(at.x,at.y);else ctx.moveTo(at.x,at.y);});ctx.closePath();ctx.fillStyle=color;ctx.fill();return;}
    if (e.kind === 'line' || e.kind === 'polyline') {
      for (let i = 1; i < p.length; i++) line(p[i - 1], p[i], color, width);
      if (e.closed) line(p.at(-1), p[0], color, width);
    } else if (e.kind === 'circle' || e.kind === 'arc') {
      ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=width;
      for(const path of View.arcPolylines(e,currentView())){
        ctx.moveTo(path[0].x,path[0].y);
        for(let i=1;i<path.length;i++)ctx.lineTo(path[i].x,path[i].y);
      }
      ctx.stroke();
    } else if (e.kind === 'text')
      text(p[0], e.text, e.textHeight, color, e.startAngle);
    else if (e.kind === 'dimension') {
      const g = C.annotationGeometry(e);
      const override=selected.has(e.id)||hovered===e.id;
      for(const f of g.fills||[]){ctx.beginPath();f.points.forEach((p,i)=>{const s=worldToScreen(p);if(i)ctx.lineTo(s.x,s.y);else ctx.moveTo(s.x,s.y);});ctx.closePath();ctx.fillStyle=override?color:(f.color||color);ctx.fill();}
      for (const s of g.segments) line(s.a, s.b, override?color:(s.color||color), width);
      for (const a of g.arcs)
        drawEntity(
            {
              kind: 'arc',
              points: [a.center],
              radius: a.radius,
              startAngle: a.startAngle,
              endAngle: a.endAngle
            },
            override?color:(a.color||color), width);
      for (const l of g.labels) text(l.point, l.text, l.height, override?color:(l.color||color), l.angle || 0);
    }
  }
  function preview() {
    if(advanced?.active){for(const e of advanced.preview())drawEntity(e,accent);return;}
    if (!points.length||params.acquiring) return;
    const p = mouse ? constrained(mouse) : points.at(-1);
    let e;
    if (tool === 'line' || tool === 'polyline') e = make('polyline', [...points, p]);
    if (tool === 'rectangle') {
      const a = points[0];
      e = make('polyline', [a, {x: p.x, y: a.y}, p, {x: a.x, y: p.y}], {closed: true});
    }
    if (tool === 'circle'&&!params.circleMode) e = make('circle', [points[0]], {radius: C.distance(points[0], p)});
    if(tool==='circle'&&params.circleMode==='2P')e=make('circle',[V.mul(V.add(points[0],p),.5)],{radius:C.distance(points[0],p)/2});
    if(tool==='circle'&&params.circleMode==='3P'){if(points.length===1)line(points[0],p,accent,1,[4,4]);else{const[a,b]=points,c=p,den=2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y));if(Math.abs(den)>1e-10){const aa=a.x*a.x+a.y*a.y,bb=b.x*b.x+b.y*b.y,cc=c.x*c.x+c.y*c.y,center={x:(aa*(b.y-c.y)+bb*(c.y-a.y)+cc*(a.y-b.y))/den,y:(aa*(c.x-b.x)+bb*(a.x-c.x)+cc*(b.x-a.x))/den};e=make('circle',[center],{radius:C.distance(center,a)});}}}
    if (tool === 'arc') {
      const c = points[0], a = points[1] || p;
      e = make('arc', [c], {
        radius: C.distance(c, a),
        startAngle: points.length > 1 ? Math.atan2(a.y - c.y, a.x - c.x) : 0,
        endAngle: Math.atan2(p.y - c.y, p.x - c.x)
      });
    }
    if (tool === 'dimension' && points.length === 1) line(points[0], p, accent, 1, [4, 4]);
    if (tool === 'dimension' && points.length === 2 && C.distance(points[0], points[1]) > 1e-9)
      e = make('dimension', [...points, p], defaultDimensionStyle());
    if(tool==='dimlinear'&&points.length===2)e=make('dimension',[...points,p],{...defaultDimensionStyle(),dimensionStyle:linearStyle});
    if(tool==='dimangular'&&points.length===3){try{const d=make('dimension',[...points,p],{...defaultDimensionStyle(),dimensionStyle:'angular'});C.annotationGeometry(d);e=d;}catch{}}
    if(['dimradius','dimdiameter'].includes(tool)&&params.circle){const c=params.circle.points[0],length=C.distance(c,p);if(length>1e-9)e=make('dimension',[c,V.add(c,V.mul(V.sub(p,c),params.circle.radius/length)),p],{...defaultDimensionStyle(),dimensionStyle:tool==='dimradius'?'radius':'diameter'});}
    if (tool === 'text') text(points[0], 'Enter text...', 12, accent);
    if (tool === 'move' || tool === 'copy') {
      const delta = V.sub(p, points[0]);
      for (const item of doc.entities)
        if (selected.has(item.id) && editable(item)) {
          drawEntity({...item, points: item.points.map(q => V.add(q, delta))}, accent);
        }
      line(points[0], p, accent, 1, [4, 4]);
    }
    if (e) drawEntity(e, accent);
    for (const p of points) {
      const s = worldToScreen(p);
      ctx.fillStyle = accent;
      ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
    }
  }
  function render(clean = false) {
    const previousSelection=selected,previousHover=hovered;
    if(clean){selected=new Set();hovered=null;}
    try{
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#101b27';
    ctx.fillRect(0, 0, W, H);
    if (grid) {
      let step = Math.pow(10, Math.floor(Math.log10(65 / zoom)));
      if (step * zoom < 24)
        step *= 5;
      else if (step * zoom < 40)
        step *= 2;
      const a = screenToWorld({x: 0, y: H}), b = screenToWorld({x: W, y: 0});
      let count = 0;
      for (let x = Math.ceil(a.x / step) * step; x <= b.x && count < 500; x += step, count++)
        line({x, y: a.y}, {x, y: b.y}, '#203141');
      count = 0;
      for (let y = Math.ceil(a.y / step) * step; y <= b.y && count < 500; y += step, count++)
        line({x: a.x, y}, {x: b.x, y}, '#203141');
    }
    for (const original of doc.entities) {
      const e=gripPreview&&gripPreview.id===original.id?gripPreview:original;
      if (visible(e)) {
        drawEntity(
            e, selected.has(e.id) ? accent : hovered===e.id?'#a4e8ff':entityColor(e),
            selected.has(e.id)||hovered===e.id ? 2 : clamp(e.lineWidth || 1, 1, 4));
        if (selected.has(e.id))
          for (const handle of G.handles(e)) {
            const s = worldToScreen(handle.point);
            ctx.fillStyle = accent;
            ctx.fillRect(s.x - 4, s.y - 4, 8, 8);
          }
      }
    }
    if (!clean) preview();
    if (mouse && !clean) {
      ctx.strokeStyle = '#9bb5c6';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mouse.x - 18, mouse.y);
      ctx.lineTo(mouse.x + 18, mouse.y);
      ctx.moveTo(mouse.x, mouse.y - 18);
      ctx.lineTo(mouse.x, mouse.y + 18);
      ctx.stroke();
      if (snapPoint) {
        const s = worldToScreen(snapPoint);
        ctx.strokeStyle = '#ffdb82';
        ctx.strokeRect(s.x - 5, s.y - 5, 10, 10);
      }
    }
    if (gesture?.kind === 'select' && gesture.moved && mouse) {
      const crossing=mouse.x<gesture.start.x;
      ctx.strokeStyle = crossing?'#69dfc3':'#7db8ff';
      ctx.fillStyle = crossing?'#69dfc318':'#7db8ff18';
      const x = Math.min(gesture.start.x, mouse.x), y = Math.min(gesture.start.y, mouse.y),
            w = Math.abs(gesture.start.x - mouse.x), h = Math.abs(gesture.start.y - mouse.y);
      ctx.fillRect(x, y, w, h);
      ctx.setLineDash(crossing?[5,4]:[]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#f29197';
    ctx.beginPath();
    ctx.moveTo(29, H - 28);
    ctx.lineTo(65, H - 28);
    ctx.stroke();
    ctx.strokeStyle = '#77d9b3';
    ctx.beginPath();
    ctx.moveTo(29, H - 28);
    ctx.lineTo(29, H - 64);
    ctx.stroke();
    ctx.font = '10px Arial';
    ctx.fillStyle = '#f29197';
    ctx.fillText('X', 70, H - 24);
    ctx.fillStyle = '#77d9b3';
    ctx.fillText('Y', 25, H - 71);
    }finally{if(clean){selected=previousSelection;hovered=previousHover;}}
  }
  function resize() {
    const r = wrap.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    schedule();
  }
  function pick(px, modifiers = {}) {
    const hits=S.candidates(doc,screenToWorld(px),7/zoom),found=hits[0];
    if(selectionMode==='replace'&&!params.acquiring&&!modifiers.ctrlKey&&!modifiers.metaKey&&!modifiers.shiftKey)selected.clear();
    if(found){
      if(modifiers.shiftKey)selected.delete(found.id);
      else if((modifiers.ctrlKey||modifiers.metaKey)&&selected.has(found.id))selected.delete(found.id);
      else selected.add(found.id);
      selectionCycle={px:{...px},ids:hits.map(e=>e.id),index:0};
    }else if(!params.acquiring&&!modifiers.shiftKey&&!modifiers.ctrlKey&&!modifiers.metaKey){selected.clear();selectionCycle=null;}
    prompt();sync();
  }
  function gripAt(px){let best=8,result=null;for(const e of doc.entities)if(selected.has(e.id)&&editable(e))for(const h of G.handles(e)){const s=worldToScreen(h.point),distance=Math.hypot(s.x-px.x,s.y-px.y);if(distance<best){best=distance;result={id:e.id,key:h.key,role:h.role};}}return result;}
  canvas.addEventListener('pointerdown',safe(e=>{
    if(busy||![0,1,2].includes(e.button))return;
    e.preventDefault();canvas.focus();const px=pointer(e);mouse=px;canvas.setPointerCapture(e.pointerId);
    if(e.button===1||tool==='pan'){gesture={kind:'pan',start:px,camera:{...camera}};canvas.style.cursor='grabbing';return;}
    if(e.button===2){gesture={kind:'right',start:px};return;}
    if(advanced?.active&&!advanced.acquiring){gesture={kind:'advanced'};acceptPoint(constrained(px));$('command').focus();return;}
    if(tool==='select'&&!params.acquiring&&!advanced?.active&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){const grip=gripAt(px);if(grip){gesture={kind:'grip',...grip,start:px,moved:false};selectionCycle=null;canvas.style.cursor='move';log('Drag '+grip.role+'. Release to apply; Esc cancels.');return;}}
    if(tool==='select'||params.acquiring){gesture={kind:'select',start:px,moved:false,modifiers:{ctrlKey:e.ctrlKey,metaKey:e.metaKey,shiftKey:e.shiftKey}};return;}
    const initialTool=tool,initialStage=points.length,p=constrained(px);
    previewWorld={...p};acceptPoint(p);
    // A press-drag-release starts and completes a single shape. Ordinary clicks
    // still use the continuous LINE workflow and never commit twice on release.
    if(tool===initialTool)gesture={kind:'draw',start:px,initialTool,createdStart:initialStage===0&&points.length===1};
    $('command').focus();
  }));
  canvas.addEventListener('pointermove',safe(e=>{
    const px=pointer(e);mouse=px;
    if(gesture?.kind==='pan')camera={x:gesture.camera.x-(px.x-gesture.start.x)/zoom,y:gesture.camera.y+(px.y-gesture.start.y)/zoom};
    if(gesture?.kind==='select'&&Math.hypot(px.x-gesture.start.x,px.y-gesture.start.y)>5)gesture.moved=true;
    const p=constrained(px);previewWorld={...p};
    if(gesture?.kind==='grip'){
      if(Math.hypot(px.x-gesture.start.x,px.y-gesture.start.y)>3)gesture.moved=true;
      gesture.target={...p};try{gripPreview=G.preview(doc.entities.find(e=>e.id===gesture.id),gesture.key,p);gesture.invalid=null;}catch(error){gripPreview=null;gesture.invalid=error.message;}
    }
    hovered=(tool==='select'||params.acquiring)&&gesture?.kind!=='pan'?S.pick(doc,screenToWorld(px),7/zoom)?.id??null:null;
    $('coordinates').textContent='X '+fmt(p.x)+' · Y '+fmt(p.y)+(snapType?' · '+snapType.toUpperCase():'');schedule();
  }));
  canvas.addEventListener('pointerup',safe(e=>{
    const px=pointer(e),g=gesture;gesture=null;
    gripPreview=null;
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor=tool==='select'||params.acquiring?'default':'crosshair';
    if(g?.kind==='draw'&&g.createdStart&&tool===g.initialTool&&['line','circle','rectangle'].includes(tool)&&params.circleMode!=='3P'&&Math.hypot(px.x-g.start.x,px.y-g.start.y)>5){
      const p=constrained(px);acceptPoint(p);
      if(tool==='line')setTool('select');
      log('Drawing committed. Select the object or start another command.');
    }else if(g?.kind==='grip'){
      if(g.moved&&g.target&&!g.invalid){if(G.apply(doc,g.id,g.key,g.target)){changed();log('Grip edit applied. Undo restores the previous geometry.');}}
      else if(g.invalid)log('Grip edit canceled: '+g.invalid,true);
    }else if(g?.kind==='right'){
      if(Math.hypot(px.x-g.start.x,px.y-g.start.y)<6&&tool!=='select')finishCommand();
      else if(tool==='select'&&selected.size)log(selected.size+' objects selected. Choose an edit command or Properties.');
    }else if(g?.kind==='select'){
      if(g.moved){
        const ids=S.windowSelect(doc,screenToWorld(g.start),screenToWorld(px),px.x<g.start.x),m=g.modifiers;
        if(selectionMode==='replace'&&!params.acquiring&&!m.shiftKey&&!m.ctrlKey&&!m.metaKey)selected.clear();
        for(const id of ids)if(m.shiftKey)selected.delete(id);else if((m.ctrlKey||m.metaKey)&&selected.has(id))selected.delete(id);else selected.add(id);
        prompt();sync();
      }else pick(px,g.modifiers);
    }
    $('command').focus();schedule();
  }));
  canvas.addEventListener('pointercancel', () => {
    gesture = null;
    gripPreview = null;
    schedule();
  });
  canvas.addEventListener('pointerleave', () => {
    if (!gesture) {
      mouse = null;
      snapPoint = null;
      schedule();
    }
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('dblclick',safe(e=>{e.preventDefault();if(['line','polyline'].includes(tool)){finishCommand();return;}if(tool==='select'){const found=S.pick(doc,screenToWorld(pointer(e)),7/zoom);if(found){selected=new Set([found.id]);sync();$('sidebar').classList.add('open');if(isText(found))$('property-text').focus();}}}));
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const px = pointer(e), before = screenToWorld(px);
    zoom = clamp(zoom * Math.exp(-e.deltaY * .0015), .00001, 10000);
    camera = V.add(camera, V.sub(before, screenToWorld(px)));
    schedule();
  }, {passive: false});
  document.querySelectorAll('[data-tool]')
      .forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  const bind = (id, fn) => $(id).addEventListener('click', safe(fn));
  bind('new-btn', newDrawing);
  bind('open-btn', openPicker);
  bind('save-btn', save);
  bind('example-btn', example);
  bind('dxf-btn', exportDxf);
  bind('png-btn', exportPng);
  bind('undo-btn', () => history());
  bind('redo-btn', () => history(true));
  bind('delete-btn', erase);
  bind('fit-btn', fit);
  bind('welcome-line', () => setTool('line'));
  bind('welcome-example', example);
  bind('help-btn', showHelp);
  bind('help-close', () => $('help-dialog').close());
  bind('layers-toggle', () => $('sidebar').classList.toggle('open'));
  bind('print-btn', printDrawing);
  bind('apply-properties', applyProperties);
  bind('finish-btn',finishCommand);bind('cancel-btn',cancelCommand);bind('dim-defaults-btn',useDimensionDefaults);
  bind('select-btn',cancelCommand);bind('repeat-btn',()=>setTool(lastTool));bind('diagnostics-btn',downloadDiagnostics);
  bind('history-toggle',()=>{const on=$('command-history').classList.toggle('expanded');$('history-toggle').setAttribute('aria-expanded',String(on));$('history-toggle').textContent='COMMAND HISTORY '+(on?'▾':'▴');$('command-history').scrollTop=$('command-history').scrollHeight;});
  $('selection-mode').addEventListener('change',e=>{selectionMode=e.target.value;log('Selection mode: '+selectionMode);});
  for(const id of Object.keys(propertyFields)){
    for(const event of['input','change'])$(id).addEventListener(event,()=>{propertyDirty.add(id);if($(id).type==='color'){const check=Object.keys(colorChecks).find(k=>colorChecks[k]===id);if(check){$(check).checked=false;$(check).indeterminate=false;}}});
  }
  for(const[check,id]of Object.entries(colorChecks))$(check).addEventListener('change',()=>{propertyDirty.add(id);$(id).disabled=$(check).checked;});
  bind('import-report-close', () => $('import-report').close());
  bind('import-continue',()=>{$('import-report').close();$('command').focus();});
  bind('import-unlock-layers',()=>{unlockVisibleLayers();$('import-report').close();$('command').focus();});
  bind('unlock-visible-layers',unlockVisibleLayers);
  for (const which of ['grid', 'snap', 'ortho']) bind(which + '-btn', () => toggle(which));
  bind('add-layer-btn', () => addLayer($('layer-name').value));
  $('layer-name').addEventListener('keydown', safe(e => {
                                     if (e.key === 'Enter') {
                                       e.preventDefault();
                                       addLayer(e.currentTarget.value);
                                     }
                                   }));
  $('layer-select').addEventListener('change', safe(e => selectLayer(e.target.value)));
  $('layer-color').addEventListener('change', safe(e => {
                                      doc.checkpoint();
                                      doc.layer(doc.currentLayer).color = e.target.value;
                                      changed();
                                      updateLayers();
                                    }));
  bind('layer-visibility', () => {
    doc.checkpoint();
    const l = doc.layer(doc.currentLayer);
    l.visible = !l.visible;
    selected.clear();
    points = [];
    changed();
    updateLayers();
  });
  bind('layer-lock', () => {
    doc.checkpoint();
    const l = doc.layer(doc.currentLayer);
    l.locked = !l.locked;
    selected.clear();
    points = [];
    changed();
    updateLayers();
  });
  $('command-form').addEventListener('submit', safe(e => {
                                       e.preventDefault();
                                       submitCommand();
                                     }));
  $('command').addEventListener('input',()=>{historyIndex=inputHistory.length;updateSuggestions();});
  $('command').addEventListener('keydown',safe(e=>{
    if(e.isComposing||e.keyCode===229)return;
    if(e.key==='Enter'){e.preventDefault();e.stopPropagation();submitCommand();return;}
    if(e.key==='Tab'&&suggestions.length){e.preventDefault();e.stopPropagation();completeSuggestion(suggestionIndex<0?0:suggestionIndex);return;}
    if(['ArrowUp','ArrowDown'].includes(e.key)){
      e.preventDefault();e.stopPropagation();const step=e.key==='ArrowUp'?-1:1;
      if(suggestions.length){suggestionIndex=suggestionIndex<0?(step<0?suggestions.length-1:0):(suggestionIndex+step+suggestions.length)%suggestions.length;renderSuggestions();}
      else if(inputHistory.length){
        if(historyIndex===inputHistory.length)historyDraft=$('command').value;
        historyIndex=clamp(historyIndex+step,0,inputHistory.length);
        $('command').value=historyIndex===inputHistory.length?historyDraft:inputHistory[historyIndex];
      }
    }
  }));
  $('file-input').addEventListener('change', async e => {
    try {
      await loadFile(e.target.files[0]);
    } catch (error) {
      log('Open failed; current drawing was preserved. ' + error.message, true);
    }
  });
  document.addEventListener('keydown', safe(e => {
                              if(e.isComposing||e.keyCode===229)return;
                              const input = e.target instanceof HTMLInputElement ||
                                  e.target instanceof HTMLSelectElement ||
                                  e.target instanceof HTMLTextAreaElement;
                              const cmd = e.target === $('command');
                              const empty = cmd && !$('command').value;
                              if(document.querySelector('.advanced-dialog[open],#plot-dialog[open]'))return;
                              if ($('help-dialog').open || $('import-report').open) {
                                if (e.key === 'Escape') {
                                  if ($('help-dialog').open) $('help-dialog').close();
                                  if ($('import-report').open) $('import-report').close();
                                }
                                return;
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelCommand();
                                return;
                              }
                              if (e.key === 'F1') {
                                e.preventDefault();
                                showHelp();
                                return;
                              }
                              if(['F3','F7','F8'].includes(e.key)){e.preventDefault();toggle(e.key==='F3'?'snap':e.key==='F7'?'grid':'ortho');return;}
                              if (input && !cmd) return;
                              if(e.key==='Tab'&&selectionCycle?.ids.length>1&&(!input||empty)){
                                e.preventDefault();const ids=selectionCycle.ids;selected.delete(ids[selectionCycle.index]);selectionCycle.index=(selectionCycle.index+(e.shiftKey?ids.length-1:1))%ids.length;selected.add(ids[selectionCycle.index]);sync();return;
                              }
                              if (e.ctrlKey || e.metaKey) {
                                const key = e.key.toLowerCase();
                                const actions = {
                                  s: save,
                                  o: openPicker,
                                  n: newDrawing,
                                  z: () => history(e.shiftKey),
                                  y: () => history(true)
                                };
                                if (actions[key]) {
                                  e.preventDefault();
                                  actions[key]();
                                  return;
                                }
                                if (key === 'a' && (!input || empty)) {
                                  e.preventDefault();
                                  selected = new Set(doc.entities.filter(editable).map(e => e.id));
                                  sync();
                                  return;
                                }
                                return;
                              }
                              if (e.key === 'Delete' && (!input || empty)) {
                                e.preventDefault();
                                erase();
                                return;
                              }
                              if ((!input||empty) && e.key===' '&&tool!=='text'&&!(e.target instanceof HTMLButtonElement)){
                                e.preventDefault();finishCommand();return;
                              }
                              if (!input && e.key === 'Enter'&&!(e.target instanceof HTMLButtonElement)) {
                                e.preventDefault();
                                execute('');
                                return;
                              }
                              if (!input && e.key.length === 1 && !e.altKey) {
                                $('command').focus();
                                $('command').value += e.key;
                                updateSuggestions();
                                e.preventDefault();
                              }
                            }));
  window.addEventListener('beforeunload', e => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  const reportUnexpected=message=>{const banner=$('errors-banner');banner.hidden=false;banner.textContent='Unexpected error: '+message+'. Save your project and use Diagnostics to report this.';log('Unexpected error: '+message,true);};
  window.addEventListener('error',e=>reportUnexpected(e.message||'A script could not run'));
  window.addEventListener('unhandledrejection',e=>reportUnexpected(e.reason?.message||String(e.reason)));
  new ResizeObserver(resize).observe(wrap);
  window.addEventListener('resize', resize);
  Object.defineProperty(window, 'RasmCAD', {
    value: Object.freeze({
      version:VERSION,
      get document() {
        return doc;
      },
      get selectedIds() {
        return [...selected];
      },
      get tool() {
        return advanced?.active?advanced.name.toLowerCase():tool;
      },
      get dirty() {
        return dirty;
      },
      get downloads() {
        return downloadSerial;
      },
      get lastMeasurement() {
        return lastMeasurement;
      },
      get acquiringSelection(){return !!params.acquiring||!!advanced?.acquiring;},
      worldToScreen,
      screenToWorld,
      execute: safe(execute)
    })
  });
  const measurementCtx=document.createElement('canvas').getContext('2d');
  S.setTextMeasurer((value,height)=>{measurementCtx.font=clamp(height*zoom,0,600)+'px Tahoma, Arial, sans-serif';const m=measurementCtx.measureText(value);return {left:-m.actualBoundingBoxLeft/zoom,right:m.actualBoundingBoxRight/zoom,bottom:-m.actualBoundingBoxDescent/zoom,top:m.actualBoundingBoxAscent/zoom};});
  advanced=window.RasmAdvancedUI.mount({
    getDocument:()=>doc,getSelection:()=>[...selected],
    enter:()=>{setTool('select',false);},
    changed:(ids,message)=>{if(ids)selected=new Set(ids);dirty=true;updateLayers();prompt();sync();if(message)log(message);},
    refresh:()=>{prompt();sync();},focus:()=>$('command').focus(),log,download,
    append:e=>{ensureDrawingLayer();append(e);},
    crossing:(a,b)=>S.windowSelect(doc,a,b,true),
    selectAll:()=>{selected=new Set(doc.entities.filter(editable).map(e=>e.id));prompt();sync();},
    replaceDocument:(next,name)=>setDocument(next,name,false)
  });
  plotUI=window.RasmPlotUI.mount({getDocument:()=>doc,download,log,
    getSelectionBounds:()=>{const b={valid:false,min:{x:0,y:0},max:{x:0,y:0}};for(const e of doc.entities)if(selected.has(e.id)){const q=C.entityBounds(e);if(q.valid){if(!b.valid){b.min={...q.min};b.max={...q.max};b.valid=true;}else{b.min.x=Math.min(b.min.x,q.min.x);b.min.y=Math.min(b.min.y,q.min.y);b.max.x=Math.max(b.max.x,q.max.x);b.max.y=Math.max(b.max.y,q.max.y);}}}return b.valid?b:null;},
    setPlotSettings:settings=>{doc.checkpoint();doc.resources.plot=settings;changed();}
  });
  updateLayers();
  resize();
  prompt();
  sync();
})();
