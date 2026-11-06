/* Selective MATCHPROP. Copies appearance, never geometry or measurement type. */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'));else root.RasmProperties=factory(root.RasmCore);})(typeof globalThis!=='undefined'?globalThis:this,function(C){
'use strict';
const common=Object.freeze(['layer','color','lineWidth']),dimension=Object.freeze(['dimensionScale','arrowSize','extensionOffset','extensionExtend','textGap','precision','prefix','suffix','textColor','dimensionColor','arrowStyle','styleName']);
const fields=Object.freeze([...common,'textHeight',...dimension]),defaults=Object.freeze([...common,'textHeight']);
function check(ok,message){if(!ok)throw Error(message);}
function textual(e){return e.kind==='text'||e.kind==='dimension';}
function sourceEntity(doc,id){const e=doc.entities.find(e=>e.id===id);check(e,'MATCHPROP source no longer exists');check(doc.layer(e.layer)?.visible,'MATCHPROP source layer is hidden');return e;}
function matchProperties(doc,sourceId,targetIds,options={}){
 check(options&&typeof options==='object'&&!Array.isArray(options),'Invalid MATCHPROP options');for(const key of Object.keys(options))check(key==='fields','Unsupported MATCHPROP option: '+key);
 const selected=options.fields===undefined?defaults:options.fields;check(Array.isArray(selected)&&selected.length>0,'Choose at least one property to match');check(selected.every(f=>fields.includes(f)),'Unsupported MATCHPROP field');
 check(Array.isArray(targetIds)&&targetIds.length>0,'Choose at least one MATCHPROP target');const before=doc.serialize(),working=C.Document.parse(before),source=sourceEntity(working,sourceId),ids=[...new Set(targetIds)].filter(id=>id!==sourceId);
 // Validate every target and destination layer before making any real change.
 const targets=ids.map(id=>{const e=working.entities.find(e=>e.id===id);check(e,'MATCHPROP target no longer exists');const layer=working.layer(e.layer);check(layer?.visible&&!layer.locked,'MATCHPROP target layer is hidden or locked');return e;});
 if(selected.includes('layer')){const layer=working.layer(source.layer);check(layer?.visible&&!layer.locked,'MATCHPROP destination layer is hidden or locked');}
 for(const target of targets){
  let changedDimensionStyle=false;
  for(const field of new Set(selected)){
   const compatible=common.includes(field)||field==='textHeight'&&textual(source)&&textual(target)||dimension.includes(field)&&source.kind==='dimension'&&target.kind==='dimension';
   if(!compatible)continue;
   if(Object.prototype.hasOwnProperty.call(source,field))target[field]=source[field];else delete target[field];
   if(field!=='styleName'&&dimension.includes(field)||['textHeight','color','lineWidth'].includes(field)&&source.kind==='dimension'&&target.kind==='dimension')changedDimensionStyle=true;
  }
  if(selected.includes('styleName')&&source.kind==='dimension'&&target.kind==='dimension')for(const field of [...dimension,'textHeight','color','lineWidth']){
   if(Object.prototype.hasOwnProperty.call(source,field))target[field]=source[field];else delete target[field];
  }
  // A partial visual override must not pretend to remain an unmodified named
  // style: future DIMSTYLE UPDATE would otherwise erase these matched values.
  if(changedDimensionStyle&&!selected.includes('styleName'))delete target.styleName;
 }
 const after=working.serialize();if(after!==before){doc.checkpoint();doc.entities=working.entities;doc.layers=working.layers;doc.currentLayer=working.currentLayer;doc.nextId=working.nextId;doc.resources=working.resources;}
 return ids;
}
return Object.freeze({matchProperties,fields,defaults,common,dimension});
});
