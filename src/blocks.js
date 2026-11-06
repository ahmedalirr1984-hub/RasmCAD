/* Named 2D blocks, editable references and attribute definitions. */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'));else root.RasmBlocks=factory(root.RasmCore);})(typeof globalThis!=='undefined'?globalThis:this,function(C){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x)), own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k), IDENTITY=[1,0,0,1,0,0], MAX_DEPTH=4;
function check(ok,message){if(!ok)throw Error(message);}
function finite(n,label){check(typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e12,'Invalid '+label);return n;}
function point(p){check(p&&typeof p==='object','A point is required');return{x:finite(p.x,'point X'),y:finite(p.y,'point Y')};}
function text(s,label,max=1000000){check(typeof s==='string'&&s.length<=max&&!/[\x00\r\n]/.test(s),'Invalid '+label);return s;}
function name(s){text(s,'block name',255);check(s.trim()===s&&s.length&&!/[<>\/\\":;?*|=,]/.test(s)&&!['__proto__','constructor','prototype'].includes(s),'Invalid block name');return s;}
function resources(d){if(!d.resources)d.resources={};if(!d.resources.blocks)d.resources.blocks={};return d.resources.blocks;}
function lookup(d,n){name(n);const r=resources(d);check(own(r,n),'Block does not exist: '+n);return r[n];}
function matrix(m){check(Array.isArray(m)&&m.length===6,'Invalid block transform');m=m.map((x,i)=>finite(x,'matrix '+i));check(Math.abs(m[0]*m[3]-m[1]*m[2])>1e-15,'Block transform must be invertible');return m;}
function multiply(a,b){return[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
function at(m,p){return{x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]};}
function transformEntity(entity,m){
 const e=clone(entity),sx=Math.hypot(m[0],m[1]),sy=Math.hypot(m[2],m[3]),det=m[0]*m[3]-m[1]*m[2],angle=Math.atan2(m[1],m[0]);
 check(Math.abs(sx-sy)<=1e-8*Math.max(1,sx,sy),'Blocks currently support uniform scale');
 e.points=e.points.map(p=>at(m,p));
 if(e.parts)e.parts=e.parts.map(p=>transformEntity(p,m));
 if(e.radius)e.radius*=sx;if(e.textHeight)e.textHeight*=sx;
 if(e.kind==='arc'){const a=e.startAngle;e.startAngle=angle+(det<0?-e.endAngle:e.startAngle);e.endAngle=angle+(det<0?-a:e.endAngle);}
 else if(e.startAngle!==undefined)e.startAngle=angle+(det<0?-e.startAngle:e.startAngle);
 if(e.kind==='dimension')for(const f of ['arrowSize','extensionOffset','extensionExtend','textGap'])if(e[f]!==undefined)e[f]*=sx;
 if(e.data?.loops)e.data.loops=e.data.loops.map(loop=>loop.map(p=>at(m,p)));
 if(e.data?.paths)e.data.paths=e.data.paths.map(path=>path.map(p=>at(m,p)));
 if(e.data?.textPoint)e.data.textPoint=at(m,e.data.textPoint);
 if(e.subtype==='leader'){
  e.data.textRotation=angle+(det<0?-(e.data.textRotation||0):(e.data.textRotation||0));
  if(e.data.style)for(const key of ['textHeight','arrowSize','extensionOffset','extensionExtend','textGap'])if(typeof e.data.style[key]==='number')e.data.style[key]*=sx;
 }
 if(e.subtype==='hatch'){
  if(typeof e.data.angle==='number')e.data.angle=angle*180/Math.PI+(det<0?-e.data.angle:e.data.angle);
  if(typeof e.data.spacing==='number')e.data.spacing*=sx;
 }
 if(e.subtype==='block'&&e.data?.matrix)e.data.matrix=multiply(m,e.data.matrix);
 return e;
}
function attribute(raw){
 check(raw&&typeof raw==='object','Attribute definition is required');
 const tag=text(String(raw.tag||'').toUpperCase(),'attribute tag',80);check(/^[A-Z0-9_\-]+$/.test(tag),'Attribute tags use letters, numbers, underscore or hyphen');
 const height=raw.height??12;check(finite(height,'attribute height')>0,'Attribute height must be positive');
 for(const k of ['invisible','constant','required'])if(raw[k]!==undefined)check(typeof raw[k]==='boolean','Invalid attribute '+k);
 return{tag,prompt:text(raw.prompt??tag,'attribute prompt',255),defaultValue:text(raw.defaultValue??'','attribute default'),point:point(raw.point||{x:0,y:0}),height,rotation:finite(raw.rotation??0,'attribute rotation'),invisible:!!raw.invisible,constant:!!raw.constant,required:!!raw.required};
}
function attributes(raw){check(Array.isArray(raw)&&raw.length<=1024,'Invalid attribute definitions');const out=raw.map(attribute),seen=new Set();for(const a of out){check(!seen.has(a.tag),'Duplicate attribute tag: '+a.tag);seen.add(a.tag);}return out;}
function definition(raw,n){
 check(raw&&typeof raw==='object','Block definition is required');
 check(Array.isArray(raw.entities)&&raw.entities.length<=10000,'Invalid block geometry');
 const attrs=attributes(raw.attributes||[]);check(raw.entities.length||attrs.length,'Block needs geometry or attributes');
 const entities=raw.entities.map((raw,i)=>{const e=clone(raw);e.id=i+1;C.validateEntity(e);return e;});
 return{name:name(n||raw.name),base:point(raw.base||{x:0,y:0}),entities,attributes:attrs,revision:Number.isInteger(raw.revision)&&raw.revision>0?raw.revision:1};
}
function validateGraph(d){
 const defs=resources(d),names=Object.keys(defs);check(names.length<=1024,'Block definition limit is 1,024');
 const visit=(n,stack)=>{check(stack.length<MAX_DEPTH,'Block nesting exceeds '+MAX_DEPTH+' levels');check(!stack.includes(n),'Circular block reference: '+[...stack,n].join(' → '));const def=lookup(d,n);for(const e of def.entities)walk(e,[...stack,n]);};
 const walk=(e,stack)=>{if(e.kind==='compound'&&e.subtype==='block')visit(e.data?.name,stack);else if(e.parts)for(const p of e.parts)walk(p,stack);};
 for(const n of names)visit(n,[]);
}
function valuesFor(def,provided,prior={},strict=false){
 check(provided&&typeof provided==='object'&&!Array.isArray(provided),'Attribute values must be an object');
 const out={},known=new Set(def.attributes.map(a=>a.tag));
 if(strict)for(const k of Object.keys(provided))check(known.has(k),'Unknown attribute tag: '+k);
 for(const a of def.attributes){const value=a.constant?a.defaultValue:own(provided,a.tag)?text(provided[a.tag],'attribute '+a.tag):own(prior,a.tag)?text(prior[a.tag],'attribute '+a.tag):a.defaultValue;check(!a.required||value.length>0,'Attribute '+a.tag+' requires a value');out[a.tag]=value;}
 return out;
}
function instance(d,n,m,layer='0',provided={},prior={},depth=0){
 check(depth<MAX_DEPTH,'Block nesting exceeds '+MAX_DEPTH+' levels');const def=lookup(d,n);m=matrix(m);const vals=valuesFor(def,provided,prior,true),parts=[];
 const materialize=e=>{
  if(e.kind==='compound'&&e.subtype==='block')return instance(d,e.data.name,e.data.matrix,layer,{},e.data.attributes||{},depth+1);
  const copy=clone(e);if(copy.layer&&copy.layer!=='0'&&copy.color==null)copy.color=d.layer(copy.layer)?.color||null;copy.layer=layer;
  if(copy.parts)copy.parts=copy.parts.map(materialize);return copy;
 };
 for(const e of def.entities)parts.push(transformEntity(materialize(e),m));
 for(const a of def.attributes)if(!a.invisible){const value=vals[a.tag];if(value)parts.push(transformEntity({id:parts.length+1,kind:'text',layer,color:null,lineWidth:1,points:[a.point],text:value,textHeight:a.height,startAngle:a.rotation},m));}
 return{kind:'compound',subtype:'block',points:[at(m,{x:0,y:0})],parts,data:{name:n,matrix:m,attributes:vals},layer,color:null,lineWidth:1};
}
function refresh(d){
 validateGraph(d);
 // Check expansion cost before allocating rebuilt geometry. A small block used
 // thousands of times must not expand into millions of objects after BEDIT.
 const cache=new Map(),addCost=(a,b)=>({entities:a.entities+b.entities,points:a.points+b.points});
 const entityCost=e=>{
  if(e.subtype==='block')return blockCost(e.data.name);
  let result={entities:1,points:e.points.length};for(const child of e.parts||[])result=addCost(result,entityCost(child));return result;
 };
 const blockCost=n=>{if(cache.has(n))return cache.get(n);const def=lookup(d,n);let result={entities:1,points:1};for(const e of def.entities)result=addCost(result,entityCost(e));for(const a of def.attributes)if(!a.invisible)result=addCost(result,{entities:1,points:1});cache.set(n,result);return result;};
 let cost={entities:0,points:0};for(const e of d.entities){cost=addCost(cost,entityCost(e));check(cost.entities<=100000&&cost.points<=1000000,'Block expansion exceeds the document geometry limit');}
 const ids=[];
 const refreshEntity=e=>{
  if(e.kind==='compound'&&e.subtype==='block'){const rebuilt=instance(d,e.data.name,e.data.matrix,e.layer,{},e.data.attributes||{});return{...e,...rebuilt,id:e.id,color:e.color,lineWidth:e.lineWidth};}
  if(e.parts){const copy=clone(e);copy.parts=copy.parts.map(refreshEntity);return copy;}return e;
 };
 d.entities=d.entities.map(e=>{if(e.kind==='compound'&&e.subtype==='block')ids.push(e.id);return refreshEntity(e);});return ids;
}
function transaction(d,fn){
 const w=C.Document.parse(d.serialize());resources(w);const result=fn(w);w.serialize();d.checkpoint();
 d.entities=w.entities;d.layers=w.layers;d.currentLayer=w.currentLayer;d.nextId=w.nextId;d.resources=w.resources;return result;
}
function chosen(d,ids){check(Array.isArray(ids)&&ids.length,'Select at least one object');const set=new Set(ids),list=d.entities.filter(e=>set.has(e.id));check(list.length===set.size,'Selected object was not found');for(const e of list){const l=d.layer(e.layer);check(l?.visible&&!l.locked,'Selected object is on a hidden or locked layer');}return list;}
function ensureLayer(d,n){if(!d.layer(n))d.layers.push({name:n,color:'#e5edf5',visible:true,locked:false});}
function define(d,n,ids,base,options={}){
 name(n);base=point(base);return transaction(d,w=>{
  const r=resources(w);check(!own(r,n),'Block already exists; use BEDIT or redefine');const list=chosen(w,ids),m=[1,0,0,1,-base.x,-base.y];
  r[n]=definition({base,entities:list.map(e=>transformEntity(e,m)),attributes:options.attributes||[]},n);validateGraph(w);
  if(options.replace===false)return[];w.erase(ids);ensureLayer(w,w.currentLayer);const l=w.layer(w.currentLayer);check(l.visible&&!l.locked,'Current layer is hidden or locked');return[w.add(instance(w,n,[1,0,0,1,base.x,base.y],w.currentLayer,options.values||{}))];
 });
}
function insert(d,n,insertion,options={}){
 name(n);insertion=point(insertion);const scale=options.scale??1,rotation=options.rotation??0;check(finite(scale,'block scale')>0,'Block scale must be positive');finite(rotation,'block rotation');const c=Math.cos(rotation)*scale,s=Math.sin(rotation)*scale;
 return transaction(d,w=>{const l=w.layer(w.currentLayer);check(l?.visible&&!l.locked,'Current layer is hidden or locked');return[w.add(instance(w,n,[c,s,-s,c,insertion.x,insertion.y],w.currentLayer,options.attributes||{}))];});
}
function redefine(d,n,raw){name(n);return transaction(d,w=>{const old=lookup(w,n),next=definition({...raw,revision:old.revision+1},n);resources(w)[n]=next;return refresh(w);});}
function addAttribute(d,n,raw){const def=clone(lookup(d,n)),a=attribute(raw);check(!def.attributes.some(x=>x.tag===a.tag),'Duplicate attribute tag: '+a.tag);def.attributes.push(a);return redefine(d,n,def);}
function updateAttribute(d,n,tag,patch){
 const oldTag=String(tag).toUpperCase(),def=clone(lookup(d,n)),index=def.attributes.findIndex(a=>a.tag===oldTag);check(index>=0,'Attribute tag does not exist');
 const next=attribute({...def.attributes[index],...patch});def.attributes[index]=next;attributes(def.attributes);
 return transaction(d,w=>{
  const migrate=e=>{if(e.subtype==='block'&&e.data?.name===n&&own(e.data.attributes||{},oldTag)){const value=e.data.attributes[oldTag];delete e.data.attributes[oldTag];e.data.attributes[next.tag]=value;}if(e.parts)e.parts.forEach(migrate);};
  if(next.tag!==oldTag){w.entities.forEach(migrate);for(const item of Object.values(resources(w)))item.entities.forEach(migrate);}
  resources(w)[n]=definition({...def,revision:lookup(w,n).revision+1},n);return refresh(w);
 });
}
function removeAttribute(d,n,tag){const def=clone(lookup(d,n)),before=def.attributes.length;def.attributes=def.attributes.filter(a=>a.tag!==String(tag).toUpperCase());check(def.attributes.length<before,'Attribute tag does not exist');return redefine(d,n,def);}
function setAttributes(d,ids,values){return transaction(d,w=>{const list=chosen(w,ids);check(list.every(e=>e.kind==='compound'&&e.subtype==='block'),'Select block references');for(const e of list){const def=lookup(w,e.data.name),next=valuesFor(def,values,e.data.attributes||{},true);for(const a of def.attributes)if(a.constant&&own(values,a.tag))check(values[a.tag]===a.defaultValue,'Constant attribute cannot be edited: '+a.tag);e.data.attributes=next;}refresh(w);return list.map(e=>e.id);});}
function syncAttributes(d,n){lookup(d,n);return transaction(d,w=>refresh(w));}
function beginEdit(d,nameOrId){
 const source=typeof nameOrId==='number'?d.entities.find(e=>e.id===nameOrId):null;
 const n=source?(check(source.subtype==='block','Select a block reference'),source.data.name):nameOrId,def=clone(lookup(d,n));
 const work=new C.Document();work.layers=clone(d.layers);work.currentLayer=d.currentLayer;work.resources=clone(d.resources||{});resources(work);
 for(const e of def.entities){ensureLayer(work,e.layer);work.add({...clone(e),id:undefined});}
 const context={name:n,revision:def.revision,definitionSnapshot:JSON.stringify(def),base:def.base,attributes:clone(def.attributes)};
 return{document:work,context};
}
function commitEdit(d,context,workingDoc){
 check(context&&typeof context==='object','Missing block edit context');const def=lookup(d,context.name);check(JSON.stringify(def)===context.definitionSnapshot,'Block definition changed while editing; reopen BEDIT');
 workingDoc.serialize();return transaction(d,w=>{
  // Definitions created while editing are retained, but unrelated existing
  // definitions cannot be silently overwritten by the temporary document.
  const wr=resources(w),edited=resources(workingDoc);
  for(const n of Object.keys(edited))if(!own(wr,n))wr[n]=clone(edited[n]);
  for(const l of workingDoc.layers)ensureLayer(w,l.name);
  wr[context.name]=definition({base:context.base,entities:workingDoc.entities,attributes:context.attributes,revision:def.revision+1},context.name);
  return refresh(w);
 });
}
function exportBlock(d,n){
 lookup(d,n);const out=new C.Document();out.layers=clone(d.layers);out.currentLayer=d.currentLayer;out.resources=clone(d.resources||{});out.resources.blocks={};
 const gather=n=>{if(own(out.resources.blocks,n))return;const def=clone(lookup(d,n));out.resources.blocks[n]=def;const visit=e=>{if(e.subtype==='block')gather(e.data.name);else if(e.parts)e.parts.forEach(visit);};def.entities.forEach(visit);};gather(n);validateGraph(out);
 let layer=out.layer(out.currentLayer);if(!layer?.visible||layer.locked){layer=out.layers.find(l=>l.visible&&!l.locked);if(!layer){let label='WBlock',i=1;while(out.layer(label))label='WBlock-'+i++;ensureLayer(out,label);layer=out.layer(label);}out.currentLayer=layer.name;}
 // The standalone native project contains the chosen definition/dependencies and
 // one insertion at its local origin, including visible default attributes.
 out.add(instance(out,n,IDENTITY,out.currentLayer));out.serialize();return out;
}
function list(d){return Object.keys(resources(d)).sort().map(n=>{const def=lookup(d,n);return{name:n,entities:def.entities.length,attributes:clone(def.attributes),revision:def.revision};});}
return Object.freeze({define,insert,redefine,beginEdit,commitEdit,exportBlock,addAttribute,updateAttribute,removeAttribute,setAttributes,syncAttributes,list,attribute,instance,transformEntity});
});
