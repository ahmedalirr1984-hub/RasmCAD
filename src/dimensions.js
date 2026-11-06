/* Persistent 2D dimension styles, chained/ordinate dimensions and editable leaders.
 * Uses the rendered style fields supported by RasmCore. This is not the full
 * AutoCAD DIMSTYLE system: alternate/tolerance units and oblique dimensions are
 * deliberately rejected instead of storing controls that have no visual effect.
 */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'));
  else root.RasmDimensions=factory(root.RasmCore);
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  if(!C?.Document)throw Error('RasmCore is required');
  const LIMIT=1e12,EPS=1e-10,MAX_STYLES=1024,MAX_PATHS=256,MAX_PATH_POINTS=4096;
  const FIELDS=Object.freeze(['textHeight','dimensionScale','arrowSize','extensionOffset','extensionExtend','textGap','precision','prefix','suffix','textColor','dimensionColor','arrowStyle','color','lineWidth']);
  const DEFAULTS=Object.freeze({textHeight:2.5,dimensionScale:1,arrowSize:2.5,extensionOffset:.625,extensionExtend:1.25,textGap:.625,precision:2,prefix:'',suffix:'',textColor:null,dimensionColor:null,arrowStyle:'closed',color:null,lineWidth:1});
  const copy=value=>JSON.parse(JSON.stringify(value));
  const own=(o,key)=>Object.prototype.hasOwnProperty.call(o,key);
  const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y}),sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}),mul=(p,k)=>({x:p.x*k,y:p.y*k});
  const norm=p=>Math.hypot(p.x,p.y),distance=(a,b)=>norm(sub(a,b)),dot=(a,b)=>a.x*b.x+a.y*b.y;
  function check(ok,message){if(!ok)throw Error(message);}
  function finite(value,label){check(typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=LIMIT,'Invalid '+label);return value;}
  function point(value,label='point'){check(value&&typeof value==='object'&&!Array.isArray(value),'Invalid '+label);return{x:finite(value.x,label+' X'),y:finite(value.y,label+' Y')};}
  function name(value){check(typeof value==='string','Enter a dimension style name');const out=value.trim();check(out.length>0&&out.length<=80&&!/[\x00-\x1f<>/\\":;?*|,=`]/.test(out),'Invalid dimension style name');check(!['__proto__','constructor','prototype'].includes(out.toLowerCase()),'Reserved dimension style name');return out;}
  function text(value,empty=false){check(typeof value==='string'&&(empty||value.trim().length>0)&&value.length<=1000000&&!/[\u0000\r]/.test(value),'Enter valid leader text');return value;}
  function resources(doc){
    check(doc&&Array.isArray(doc.entities)&&Array.isArray(doc.layers),'A valid drawing is required');
    if(!doc.resources)doc.resources={blocks:{},dimStyles:{},plot:{}};
    if(!doc.resources.dimStyles)doc.resources.dimStyles={};
    check(doc.resources.dimStyles&&typeof doc.resources.dimStyles==='object'&&!Array.isArray(doc.resources.dimStyles),'Invalid dimension style resources');
    return doc.resources;
  }
  function table(doc){return doc.resources?.dimStyles||{};}
  function keyFor(doc,value){const wanted=name(value).toLocaleLowerCase('en-US');return Object.keys(table(doc)).find(key=>key.toLocaleLowerCase('en-US')===wanted)||null;}
  function normalizedStyle(raw={},base=DEFAULTS){
    check(raw&&typeof raw==='object'&&!Array.isArray(raw),'Invalid dimension style settings');
    const values={...base};
    for(const key of Object.keys(raw)){
      const field=key==='overallScale'?'dimensionScale':key;
      check(FIELDS.includes(field),'Unsupported dimension style field: '+key);
      values[field]=raw[key];
    }
    const sample={kind:'dimension',points:[{x:0,y:0},{x:100,y:0},{x:0,y:20}],...values};
    C.validateEntity(sample);
    const d=new C.Document();d.add(sample);const e=d.entities[0];
    return Object.fromEntries(FIELDS.map(field=>[field,e[field]]));
  }
  function styleFields(e){return Object.fromEntries(FIELDS.filter(key=>e[key]!==undefined).map(key=>[key,e[key]]));}
  function settingsOnly(options){return Object.fromEntries(Object.entries(options).filter(([key])=>FIELDS.includes(key)||key==='overallScale'));}
  function currentStyle(doc,fallback){
    const key=doc.resources?.currentDimStyle?keyFor(doc,doc.resources.currentDimStyle):null;
    if(key)return{...normalizedStyle(table(doc)[key]),styleName:key};
    return normalizedStyle(fallback||{});
  }
  function resolveStyle(doc,options={},base){
    const wanted=options.styleName||null,key=wanted?keyFor(doc,wanted):null;
    if(wanted)check(key,'Dimension style does not exist: '+wanted);
    const inherited=key?normalizedStyle(table(doc)[key]):base?normalizedStyle(base):currentStyle(doc);
    const values=normalizedStyle({...settingsOnly(options),...(options.style||{})},inherited);
    return{...values,...(key?{styleName:key}:inherited.styleName?{styleName:inherited.styleName}:{})};
  }
  function editable(doc,id,kind){
    const entity=doc.entities.find(e=>e.id===id);check(entity,'Selected object no longer exists');
    const layer=doc.layer(entity.layer);check(layer?.visible&&!layer.locked,'Selected object is on a hidden or locked layer');
    if(kind==='leader')check(entity.kind==='compound'&&entity.subtype==='leader','Select a leader');
    else if(kind)check(entity.kind===kind,'Select a '+kind+' object');
    return entity;
  }
  function writableLayer(doc,requested){const layer=doc.layer(requested||doc.currentLayer);check(layer?.visible&&!layer.locked,'Choose a visible, unlocked drawing layer');return layer.name;}
  function transaction(doc,operation){
    const before=doc.serialize(),working=C.Document.parse(before),result=operation(working),after=working.serialize();
    if(after!==before){doc.checkpoint();doc.entities=working.entities;doc.layers=working.layers;doc.currentLayer=working.currentLayer;doc.nextId=working.nextId;doc.resources=working.resources;}
    return result;
  }
  function style(doc,action,value,options={}){
    action=String(action||'LIST').toUpperCase();
    check(options&&typeof options==='object'&&!Array.isArray(options),'Invalid style options');
    if(action==='LIST')return Object.keys(table(doc)).sort((a,b)=>a.localeCompare(b)).map(key=>({name:key,...normalizedStyle(table(doc)[key]),current:doc.resources?.currentDimStyle===key}));
    if(action==='GET'){const key=keyFor(doc,value);check(key,'Dimension style does not exist: '+value);return{name:key,...normalizedStyle(table(doc)[key])};}
    return transaction(doc,w=>{
      const r=resources(w),styles=r.dimStyles,found=keyFor(w,value),requested=name(value);
      if(action==='SAVE'||action==='NEW'||action==='UPDATE'){
        if(action==='UPDATE')check(found,'Dimension style does not exist: '+requested);
        if(action!=='UPDATE'&&found&&!options.overwrite)throw Error('Dimension style already exists: '+found);
        if(!found)check(Object.keys(styles).length<MAX_STYLES,'Dimension style limit reached');
        const key=found||requested,base=found?normalizedStyle(styles[key]):options.sourceId?styleFields(editable(w,options.sourceId,'dimension')):currentStyle(w);
        const controls=new Set(['overwrite','sourceId','setCurrent','ids','updateReferences']);
        for(const option of Object.keys(options))check(controls.has(option)||FIELDS.includes(option)||option==='overallScale'||option==='style','Unsupported dimension style option: '+option);
        const next=normalizedStyle({...settingsOnly(options),...(options.style||{})},base);
        Object.defineProperty(styles,key,{value:next,enumerable:true,writable:true,configurable:true});
        const updatedIds=[];
        if(options.updateReferences!==false)for(const e of w.entities)if(e.kind==='dimension'&&e.styleName===key){Object.assign(e,next);C.validateEntity(e);updatedIds.push(e.id);}
        if(options.setCurrent||!r.currentDimStyle)r.currentDimStyle=key;
        return{name:key,created:!found,updatedIds};
      }
      check(found,'Dimension style does not exist: '+requested);
      if(action==='SETCURRENT'||action==='RESTORE'){r.currentDimStyle=found;return{name:found,current:true};}
      if(action==='RENAME'){
        const next=name(options.newName);check(!keyFor(w,next)||next===found,'Dimension style already exists: '+next);
        if(next===found)return{name:found};
        const existing=styles[found];delete styles[found];Object.defineProperty(styles,next,{value:existing,enumerable:true,writable:true,configurable:true});
        for(const e of w.entities)if(e.kind==='dimension'&&e.styleName===found)e.styleName=next;
        if(r.currentDimStyle===found)r.currentDimStyle=next;
        return{name:next};
      }
      if(action==='DELETE'){
        check(r.currentDimStyle!==found,'Set another current style before deleting this style');
        const used=w.entities.filter(e=>e.kind==='dimension'&&e.styleName===found);
        check(!used.length||options.detach===true,'This dimension style is used by drawing objects');
        for(const e of used)delete e.styleName;
        delete styles[found];return{name:found,deleted:true};
      }
      if(action==='APPLY'){
        check(Array.isArray(options.ids)&&options.ids.length,'Select dimensions to apply this style');
        const ids=[...new Set(options.ids)];
        for(const id of ids){const e=editable(w,id,'dimension');Object.assign(e,normalizedStyle(styles[found]),{styleName:found});C.validateEntity(e);}
        return ids;
      }
      throw Error('Unknown DIMSTYLE action. Use SAVE, UPDATE, SETCURRENT, APPLY, RENAME, DELETE or LIST.');
    });
  }
  function continueDimension(doc,referenceId,feature,placement,options={}){
    feature=point(feature,'feature point');if(placement!=null)placement=point(placement,'dimension placement');
    return transaction(doc,w=>{
      const reference=editable(w,referenceId,'dimension');
      check(['aligned','horizontal','vertical'].includes(reference.dimensionStyle),'Continue/baseline needs an aligned, horizontal or vertical reference dimension');
      const baseline=!!options.baseline,start=copy(reference.points[baseline?0:1]);
      const values=resolveStyle(w,options,styleFields(reference));
      if(!values.styleName&&reference.styleName)values.styleName=reference.styleName;
      let location=placement;
      if(!location){
        const shift=baseline?values.textHeight*values.dimensionScale*2:0;
        if(reference.dimensionStyle==='horizontal')location={x:feature.x,y:reference.points[2].y+shift};
        else if(reference.dimensionStyle==='vertical')location={x:reference.points[2].x+shift,y:feature.y};
        else{const u=sub(reference.points[1],reference.points[0]),length=norm(u);check(length>EPS,'Invalid reference dimension');const n={x:-u.y/length,y:u.x/length},offset=dot(sub(reference.points[2],reference.points[0]),n)+shift;location=add(start,mul(n,offset));}
      }
      const entity={kind:'dimension',points:[start,feature,location],dimensionStyle:reference.dimensionStyle,...values,layer:writableLayer(w,options.layer)};
      return[w.add(entity)];
    });
  }
  function ordinate(doc,datum,feature,label,axis='X',options={}){
    datum=point(datum,'datum');feature=point(feature,'feature');label=point(label,'label position');
    axis=String(axis).toUpperCase();check(['X','Y'].includes(axis),'Ordinate axis must be X or Y');
    return transaction(doc,w=>[w.add({kind:'dimension',points:[datum,feature,label],dimensionStyle:axis==='X'?'ordinateX':'ordinateY',...resolveStyle(w,options),layer:writableLayer(w,options.layer)})]);
  }
  function edit(doc,ids,action,value){
    check(Array.isArray(ids)&&ids.length,'Select dimensions to edit');action=String(action||'').toUpperCase();
    return transaction(doc,w=>{
      const selected=[...new Set(ids)].map(id=>editable(w,id,'dimension'));
      if(action==='TEXT'||action==='NEWTEXT'){check(typeof value==='string'&&!/[\r\n\0]/.test(value),'Enter one-line dimension text');for(const e of selected)e.text=value;}
      else if(action==='RESET'||action==='HOME'){for(const e of selected)e.text='';}
      else if(action==='POSITION'||action==='MOVE'){const at=point(value,'dimension label position');for(const e of selected)e.points[e.points.length-1]=copy(at);}
      else throw Error('DIMEDIT supports TEXT, POSITION and RESET; oblique extension lines are not implemented.');
      for(const e of selected)C.validateEntity(e);
      return selected.map(e=>e.id);
    });
  }
  function normalizedPaths(input){
    check(Array.isArray(input)&&input.length,'Specify at least one leader path');
    const paths=Array.isArray(input[0])?input:[input];check(paths.length<=MAX_PATHS,'A leader supports at most 256 paths');
    return paths.map(path=>{
      check(Array.isArray(path)&&path.length>=2&&path.length<=MAX_PATH_POINTS,'Each leader path needs 2–4096 points');
      const result=path.map((p,index)=>point(p,'leader point '+index));
      for(let i=1;i<result.length;i++)check(distance(result[i-1],result[i])>EPS,'Leader path contains repeated adjacent points');
      return result;
    });
  }
  function leaderEntity(paths,textPoint,value,options={}){
    paths=normalizedPaths(paths);textPoint=point(textPoint,'leader text position');value=text(value);
    const visual=normalizedStyle(options.style||settingsOnly(options)),h=visual.textHeight*visual.dimensionScale,size=visual.arrowSize*visual.dimensionScale,gap=visual.textGap*visual.dimensionScale;
    const angle=finite(options.textRotation||0,'leader text rotation'),u={x:Math.cos(angle),y:Math.sin(angle)},normal={x:-u.y,y:u.x},lines=value.split('\n');
    check(lines.length<=256,'Leader text supports at most 256 lines');
    const width=Math.max(...lines.map(line=>Array.from(line).length))*h*.65,parts=[];
    const layer=options.layer||'0',color=visual.dimensionColor??visual.color;
    for(const path of paths){
      const last=path.at(-1),landing=add(add(textPoint,mul(u,dot(sub(last,textPoint),u)<=width*.5?-gap:width+gap)),mul(normal,h*.35));
      const points=copy(path);if(distance(last,landing)>EPS)points.push(landing);
      parts.push({kind:'polyline',points,closed:false,layer,color,lineWidth:visual.lineWidth});
      const tip=path[0],d=sub(path[1],tip),length=norm(d),along=mul(d,1/length),across={x:-along.y,y:along.x},back=add(tip,mul(along,size)),a=add(back,mul(across,size*.3)),b=sub(back,mul(across,size*.3));
      if(visual.arrowStyle==='closed')parts.push({kind:'solid',points:[copy(tip),a,b],closed:true,layer,color,lineWidth:visual.lineWidth});
      else if(visual.arrowStyle==='open')parts.push({kind:'polyline',points:[a,copy(tip),b],closed:false,layer,color,lineWidth:visual.lineWidth});
      else{const diagonal=mul(add(along,across),size*.5);parts.push({kind:'line',points:[sub(tip,diagonal),add(tip,diagonal)],layer,color,lineWidth:visual.lineWidth});}
    }
    for(let i=0;i<lines.length;i++)if(lines[i])parts.push({kind:'text',points:[sub(textPoint,mul(normal,i*h*1.4))],text:lines[i],textHeight:h,startAngle:angle,layer,color:visual.textColor??visual.color,lineWidth:visual.lineWidth});
    const data={paths:copy(paths),textPoint:copy(textPoint),text:value,style:copy(visual),textRotation:angle};if(options.styleName)data.styleName=options.styleName;
    const entity={kind:'compound',subtype:'leader',points:[copy(textPoint),...paths.map(path=>copy(path[0]))],parts,data,layer,color:visual.color,lineWidth:visual.lineWidth};
    C.validateEntity(entity);return entity;
  }
  function leader(doc,paths,textPoint,value,options={}){
    return transaction(doc,w=>{
      const visual=resolveStyle(w,options),entity=leaderEntity(paths,textPoint,value,{style:styleFields(visual),styleName:visual.styleName,layer:writableLayer(w,options.layer),textRotation:options.textRotation||0});
      return[w.add(entity)];
    });
  }
  function editLeader(doc,id,action,value){
    action=String(action||'').toUpperCase();
    return transaction(doc,w=>{
      const e=editable(w,id,'leader'),data=copy(e.data);
      check(data&&Array.isArray(data.paths)&&data.textPoint&&data.style,'Leader metadata is unavailable');
      if(action==='TEXT')data.text=text(value);
      else if(action==='POSITION'||action==='MOVE')data.textPoint=point(value,'leader text position');
      else if(action==='ADD'){const added=normalizedPaths(value);check(data.paths.length+added.length<=MAX_PATHS,'A leader supports at most 256 paths');data.paths.push(...added);}
      else if(action==='REMOVE'){check(Number.isInteger(value)&&value>=0&&value<data.paths.length,'Enter a zero-based leader path index');check(data.paths.length>1,'A leader needs at least one path');data.paths.splice(value,1);}
      else if(action==='STYLE'){
        check(value&&typeof value==='object'&&!Array.isArray(value),'Enter leader style settings');
        const visual=resolveStyle(w,value,data.style);data.style=styleFields(visual);if(visual.styleName)data.styleName=visual.styleName;else delete data.styleName;
      }else if(action==='ROTATION')data.textRotation=finite(value,'leader text rotation');
      else throw Error('MLEADER edit supports TEXT, POSITION, ADD, REMOVE, STYLE and ROTATION');
      const updated=leaderEntity(data.paths,data.textPoint,data.text,{style:data.style,styleName:data.styleName,layer:e.layer,textRotation:data.textRotation||0});
      updated.id=id;w.entities[w.entities.findIndex(item=>item.id===id)]=updated;return[id];
    });
  }
  return Object.freeze({style,currentStyle,normalizedStyle,styleFields,continueDimension,ordinate,edit,leader,editLeader,leaderEntity,fields:FIELDS,defaults:DEFAULTS});
});
