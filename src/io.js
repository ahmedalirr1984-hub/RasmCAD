/* Local CAD import, using dxf-parser (MIT) and LibreDWG WebAssembly (GPL-3.0).
 * The complete advanced distribution is GPL-3.0-or-later; see THIRD_PARTY.md. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'),require('../vendor/dxf-parser/dist/dxf-parser.js'),root);else root.RasmIO=factory(root.RasmCore,root.DxfParser,root);})(typeof globalThis!=='undefined'?globalThis:this,function(C,DxfParser,root){
'use strict';
const TAU=2*Math.PI,rad=n=>(n||0)*Math.PI/180,hex=n=>'#'+(Number(n)>>>0&0xffffff).toString(16).padStart(6,'0');
// Canonical ACI palette from bundled dxf-parser (MIT; see vendor notice).
const aci=[0,16711680,16776960,65280,65535,255,16711935,16777215,8421504,12632256,16711680,16744319,13369344,13395558,10027008,10046540,8323072,8339263,4980736,4990502,16727808,16752511,13382400,13401958,10036736,10051404,8331008,8343359,4985600,4992806,16744192,16760703,13395456,13408614,10046464,10056268,8339200,8347455,4990464,4995366,16760576,16768895,13408512,13415014,10056192,10061132,8347392,8351551,4995328,4997670,16776960,16777087,13421568,13421670,10000384,10000460,8355584,8355647,5000192,5000230,12582656,14679935,10079232,11717734,7510016,8755276,6258432,7307071,3755008,4344870,8388352,12582783,6736896,10079334,5019648,7510092,4161280,6258495,2509824,3755046,4194048,10485631,3394560,8375398,2529280,6264908,2064128,5209919,1264640,3099686,65280,8388479,52224,6736998,38912,5019724,32512,4161343,19456,2509862,65343,8388511,52275,6737023,38950,5019743,32543,4161359,19475,2509871,65407,8388543,52326,6737049,38988,5019762,32575,4161375,19494,2509881,65471,8388575,52377,6737074,39026,5019781,32607,4161391,19513,2509890,65535,8388607,52428,6737100,39064,5019800,32639,4161407,19532,2509900,49151,8380415,39372,6730444,29336,5014936,24447,4157311,14668,2507340,32767,8372223,26316,6724044,19608,5010072,16255,4153215,9804,2505036,16383,8364031,13260,6717388,9880,5005208,8063,4149119,4940,2502476,255,8355839,204,6710988,152,5000344,127,4145023,76,2500172,4129023,10452991,3342540,8349388,2490520,6245528,2031743,5193599,1245260,3089996,8323327,12550143,6684876,10053324,4980888,7490712,4128895,6242175,2490444,3745356,12517631,14647295,10027212,11691724,7471256,8735896,6226047,7290751,3735628,4335180,16711935,16744447,13369548,13395660,9961624,9981080,8323199,8339327,4980812,4990540,16711871,16744415,13369497,13395634,9961586,9981061,8323167,8339311,4980793,4990530,16711807,16744383,13369446,13395609,9961548,9981042,8323135,8339295,4980774,4990521,16711743,16744351,13369395,13395583,9961510,9981023,8323103,8339279,4980755,4990511,3355443,5987163,8684676,11382189,14079702,16777215];
const identity=[1,0,0,1,0,0],point=(p)=>{if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))throw Error('Invalid CAD point');return{x:p.x,y:p.y};};
const apply=(m,p)=>({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]});
function compose(a,b){return[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
function cleanText(s){return String(s||'').replace(/\\U\+([0-9a-f]{4})/gi,(_,h)=>String.fromCharCode(parseInt(h,16))).replace(/%%d/gi,'°').replace(/%%p/gi,'±').replace(/%%c/gi,'Ø').replace(/\\P/g,'\n').replace(/\\[ACFHQSTWacfhqstw][^;]*;/g,'').replace(/\\[LlOoKk]/g,'').replace(/[{}]/g,'').replace(/\\~/g,' ');}
function splinePoints(e){const p=e.controlPoints||[],degree=e.degreeOfSplineCurve??e.degree,knots=e.knotValues||e.knots,weights=e.weights||p.map(()=>1);if(!p.length||!Number.isInteger(degree)||degree<1||degree>10||p.length<=degree||!knots||knots.length!==p.length+degree+1)throw Error('Unsupported spline knot/control-point structure');const n=p.length-1,start=knots[degree],end=knots[n+1];if(!(end>start)||knots.some((v,i)=>!Number.isFinite(v)||i&&v<knots[i-1]))throw Error('Invalid spline knots');const result=[];for(let j=0;j<=128;j++){const u=start+(end-start)*j/128;let k=n;if(j<128){k=degree;while(k<n&&u>=knots[k+1])k++;}const d=[];for(let a=0;a<=degree;a++){const i=k-degree+a,w=weights[i]??1;if(!(w>0))throw Error('Nonpositive spline weight');d.push([p[i].x*w,p[i].y*w,w]);}for(let r=1;r<=degree;r++)for(let a=degree;a>=r;a--){const i=k-degree+a,den=knots[i+degree-r+1]-knots[i],t=den?(u-knots[i])/den:0;d[a]=d[a].map((v,b)=>(1-t)*d[a-1][b]+t*v);}result.push({x:d[degree][0]/d[degree][2],y:d[degree][1]/d[degree][2]});}return result;}
// Opening or drawing must never depend on an unusable current layer. Source
// visibility/locks are preserved; only the current layer choice is recovered.
function ensureWritableLayer(doc,preferredName){
 if(!doc||!Array.isArray(doc.layers))throw Error('A valid drawing is required');
 const before=doc.currentLayer,writable=l=>l&&l.visible!==false&&!l.locked;
 const preferred=typeof preferredName==='string'?doc.layer(preferredName):null;
 let chosen=writable(preferred)?preferred:null;
 if(!chosen)chosen=[doc.layer(before),doc.layer('0'),...doc.layers].find(writable);
 let created=false;
 if(!chosen){
  if(doc.layers.length>=4096)throw Error('No writable layer is available. Show and unlock a layer before drawing.');
  let name='RasmCAD-Edit',suffix=1;while(doc.layer(name))name='RasmCAD-Edit-'+suffix++;
  chosen={name,color:'#e5edf5',visible:true,locked:false};doc.layers.push(chosen);created=true;
 }
 doc.currentLayer=chosen.name;
 const changed=created||before!==chosen.name;
 return{name:chosen.name,created,changed,message:created?'Created visible, unlocked layer '+chosen.name+' for new geometry. Original layer states were preserved.':changed?'Current drawing layer: '+chosen.name+'. Original layer states were preserved.':''};
}
// libredwg-web 0.8.4 asks for a misspelled field and then treats undefined as
// locked. Redirect that single lookup to the real native field. Do not unlock
// all layers: deliberate locks, off and frozen states must survive import.
function dwgReader(lib){
 return new Proxy(lib,{get(target,key,receiver){
  if(key==='dwg_dynapi_entity_data')return(item,field)=>target.dwg_dynapi_entity_data(item,field==='plotflockedlag'?'locked':field);
  return Reflect.get(target,key,receiver);
 }});
}
function applyDxfLayerFlags(data,text){
 const layers=data.tables?.layer?.layers||{},groups=text.replace(/\r/g,'').split('\n');
 for(let i=0;i+1<groups.length;i+=2){
  if(groups[i].trim()!=='0'||groups[i+1].trim()!=='LAYER')continue;
  let name='',flags=0,off=null,trueColor=null;
  for(let j=i+2;j+1<groups.length&&groups[j].trim()!=='0';j+=2){
   const code=groups[j].trim(),value=groups[j+1].trim();
   if(code==='2')name=value;if(code==='70')flags=Number(value);if(code==='62')off=Number(value)<0;if(code==='420')trueColor=Number(value);
  }
  const l=Object.hasOwn(layers,name)?layers[name]:null;
  if(l){l.locked=!!(flags&4);l.frozen=!!(flags&1);if(off!==null)l.visible=!off;if(Number.isInteger(trueColor)&&trueColor>=0&&trueColor<=0xffffff)l.color=trueColor;}
 }
}
function convertDatabase(data,format,dwg=false){
 const doc=new C.Document(),counts=new Map(),warn=s=>counts.set(s,(counts.get(s)||0)+1),blocks=dwg?Object.fromEntries((data.tables?.BLOCK_RECORD?.entries||[]).map(b=>[b.name,{...b,position:b.basePoint}])):(data.blocks||{});
 let inputCount=0;const layerRecords=dwg?(data.tables?.LAYER?.entries||[]):Object.values(data.tables?.layer?.layers||{});
 for(const l of layerRecords){const name=String(l.name||'0'),record={name,color:hex(dwg&&Math.abs(l.colorIndex)>=1&&Math.abs(l.colorIndex)<=255?aci[Math.abs(l.colorIndex)]:(l.color??aci[Math.abs(l.colorIndex||7)]??0xffffff)),visible:dwg?!l.off&&!l.frozen:l.visible!==false&&!l.frozen,locked:!!l.locked};if(name==='0')doc.layers[0]=record;else if(!doc.layer(name))doc.layers.push(record);}
 function append(local,m,meta){let e={...local,layer:meta.layer,color:meta.color,lineWidth:meta.lineWidth||1};const sx=Math.hypot(m[0],m[1]),sy=Math.hypot(m[2],m[3]),det=m[0]*m[3]-m[1]*m[2],uniform=Math.abs(sx-sy)<=1e-7*Math.max(1,sx,sy)&&Math.abs(m[0]*m[2]+m[1]*m[3])<1e-7*Math.max(1,sx*sy);
   if((e.kind==='circle'||e.kind==='arc')&&!uniform){const start=e.kind==='circle'?0:e.startAngle,span=e.kind==='circle'?TAU:C.arcSpan(e.startAngle,e.endAngle),p=[];for(let i=0;i<=128;i++){if(e.kind==='circle'&&i===128)break;const a=start+span*i/128;p.push({x:e.points[0].x+e.radius*Math.cos(a),y:e.points[0].y+e.radius*Math.sin(a)});}e={...e,kind:'polyline',points:p,closed:e.kind==='circle'};warn('Nonuniformly scaled circles/arcs approximated as polylines');}
   e.points=e.points.map(p=>apply(m,point(p)));if(e.kind==='circle'||e.kind==='arc'){e.radius*=sx;const angle=a=>Math.atan2(m[1]*Math.cos(a)+m[3]*Math.sin(a),m[0]*Math.cos(a)+m[2]*Math.sin(a));let a=angle(e.startAngle||0),b=angle(e.endAngle||0);if(det<0)[a,b]=[b,a];e.startAngle=a;e.endAngle=b;}
   if(e.kind==='text'){const a=e.startAngle||0;e.startAngle=Math.atan2(m[1]*Math.cos(a)+m[3]*Math.sin(a),m[0]*Math.cos(a)+m[2]*Math.sin(a));e.textHeight*=sy;}
   if(!doc.layer(e.layer))doc.layers.push({name:e.layer,color:'#e5edf5',visible:true,locked:false});doc.add(e);
 }
 function visit(raw,m=identity,inherited={layer:'0',color:null},depth=0){if(++inputCount>100000)throw Error('CAD import exceeds 100,000 source entities');if(depth>20)throw Error('Nested block recursion exceeds 20 levels');const e={...raw},type=e.type;
   if(e.isInPaperSpace||e.inPaperSpace){warn('Paper-space objects skipped; this editor imports model space');return;}if(e.isVisible===false||e.visible===false){warn('Invisible objects skipped');return;}
   const extrusion=e.extrusionDirection;if(extrusion&&(Math.abs(extrusion.x||0)>1e-9||Math.abs(extrusion.y||0)>1e-9||(extrusion.z??1)<0)){warn('Objects with nonstandard OCS/extrusion skipped');return;}
   let name=e.layer||'0';if(name==='0'&&depth)name=inherited.layer;const ci=e.colorIndex,color=ci===0&&!(dwg&&Number.isInteger(e.color))?inherited.color:Number.isInteger(e.color)?hex(e.color):ci===256?null:ci&&aci[Math.abs(ci)]!==undefined?hex(aci[Math.abs(ci)]):null,meta={layer:name,color,lineWidth:1};
   const emit=o=>append(o,m,meta),p=v=>point(v);
   if(type==='LINE'){emit({kind:'line',points:e.vertices||[e.startPoint,e.endPoint]});}
   else if(type==='CIRCLE'||type==='ARC'){emit({kind:type.toLowerCase(),points:[e.center],radius:e.radius,startAngle:e.startAngle||0,endAngle:e.endAngle||0});}
   else if(type==='LWPOLYLINE'||type==='POLYLINE'||type==='POLYLINE_2D'||type==='POLYLINE_3D'){
     const vertices=e.vertices||[],closed=!!(e.shape||e.isClosed||(e.flag&1)||(e.flags&1));if(vertices.length<2){warn('Degenerate polylines skipped');return;}const out=[];
     for(let i=0;i<vertices.length;i++){const a=p(vertices[i]);out.push(a);if(i===vertices.length-1&&!closed)continue;const b=p(vertices[(i+1)%vertices.length]),bulge=vertices[i].bulge||0;if(Math.abs(bulge)>1e-10){const chord=C.distance(a,b);if(chord<1e-10)continue;const center={x:(a.x+b.x)/2-(b.y-a.y)*(1-bulge*bulge)/(4*bulge),y:(a.y+b.y)/2+(b.x-a.x)*(1-bulge*bulge)/(4*bulge)},r=C.distance(a,center),start=Math.atan2(a.y-center.y,a.x-center.x),sweep=4*Math.atan(bulge),steps=Math.max(8,Math.ceil(Math.abs(sweep)/.04));for(let j=1;j<steps;j++){const t=start+sweep*j/steps;out.push({x:center.x+r*Math.cos(t),y:center.y+r*Math.sin(t)});}warn('Bulged polyline segments approximated as polylines');}}
     emit({kind:'polyline',points:out,closed});
   }else if(type==='ELLIPSE'){const center=p(e.center),axis=p(e.majorAxisEndPoint),ratio=e.axisRatio,start=e.startAngle||0,span=C.arcSpan(start,e.endAngle??TAU),out=[];for(let i=0;i<=128;i++){if(span>=TAU-1e-8&&i===128)break;const a=start+span*i/128;out.push({x:center.x+axis.x*Math.cos(a)-axis.y*ratio*Math.sin(a),y:center.y+axis.y*Math.cos(a)+axis.x*ratio*Math.sin(a)});}emit({kind:'polyline',points:out,closed:span>=TAU-1e-8});warn('ELLIPSE curves approximated as 128-segment polylines');
   }else if(type==='SPLINE'){emit({kind:'polyline',points:splinePoints(e),closed:!!(e.closed||(e.flag&1))});warn('SPLINE curves approximated as 128-segment polylines');
   }else if(['TEXT','MTEXT','ATTRIB','ATTDEF'].includes(type)){
     const textData=dwg&&e.text&&typeof e.text==='object'?e.text:e;if(['ATTRIB','ATTDEF'].includes(type)&&(e.flags&1)){warn('Invisible attribute text skipped');return;}const at=p(textData.startPoint||textData.position||textData.insertionPoint),height=textData.textHeight||textData.height||1,angle=dwg?(textData.rotation||0):rad(textData.rotation);const lines=cleanText(textData.text).split('\n');for(let i=0;i<lines.length;i++)if(lines[i])emit({kind:'text',points:[{x:at.x+i*height*1.4*Math.sin(angle),y:at.y-i*height*1.4*Math.cos(angle)}],text:lines[i],textHeight:height,startAngle:angle});if(type==='MTEXT')warn('MTEXT formatting/attachment simplified to text lines');
   }else if(type==='INSERT'||type==='MINSERT'){
     const block=blocks[e.name];if(!block){warn('Unresolved block/xref '+e.name+' skipped');return;}const at=p(e.position||e.insertionPoint),base=block.position||block.basePoint||{x:0,y:0},a=dwg?(e.rotation||0):rad(e.rotation),sx=e.xScale??1,sy=e.yScale??1,co=Math.cos(a),si=Math.sin(a),cols=Math.min(100,e.columnCount||1),rows=Math.min(100,e.rowCount||1);if(cols*rows>1000)throw Error('Block array exceeds 1,000 instances');
     for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const offset={x:c*(e.columnSpacing||0)-base.x,y:r*(e.rowSpacing||0)-base.y},local=[co*sx,si*sx,-si*sy,co*sy,at.x+co*sx*offset.x-si*sy*offset.y,at.y+si*sx*offset.x+co*sy*offset.y],next=compose(m,local);for(const child of block.entities||[])visit(child,next,meta,depth+1);}for(const attr of e.attribs||[])visit(attr,m,meta,depth+1);warn('INSERT blocks expanded into editable geometry; block association is not retained');
   }else if(type==='DIMENSION'){
     const a=e.linearOrAngularPoint1||e.subDefinitionPoint1,b=e.linearOrAngularPoint2||e.subDefinitionPoint2,where=e.anchorPoint||e.definitionPoint;
     if(a&&b&&where&&[0,1].includes((e.dimensionType??0)&7)){emit({kind:'dimension',points:[p(a),p(b),p(where)],text:e.text&&e.text!=='<>'?cleanText(e.text):'',textHeight:Math.max(1,C.distance(p(a),p(b))*.025)});warn('DIMENSION style simplified to a native aligned dimension');}
     else if(blocks[e.block||e.name]?.entities){for(const child of blocks[e.block||e.name].entities)visit(child,m,meta,depth+1);warn('DIMENSION anonymous block expanded; associativity is not retained');}else warn('Unsupported DIMENSION subtype skipped');
   }else if(type==='SOLID'||type==='TRACE'){const pts=e.points||e.corners||e.vertices||(e.corner1&&e.corner2&&e.corner3?[e.corner1,e.corner2,e.corner3,...(e.corner4?[e.corner4]:[])]:null);if(pts&&pts.length>=3){const order=pts.length===4?[pts[0],pts[1],pts[3],pts[2]]:pts;emit({kind:'solid',points:order.map(p),closed:true});}else warn(type+' without readable corners skipped');
   }else if(type==='POINT'){const a=p(e.position||e.point);emit({kind:'line',points:[{x:a.x-.5,y:a.y},{x:a.x+.5,y:a.y}]});emit({kind:'line',points:[{x:a.x,y:a.y-.5},{x:a.x,y:a.y+.5}]});warn('POINT converted to a small cross marker');}
   else if(type==='LEADER'){const pts=e.vertices||e.points;if(pts?.length>1){emit({kind:'polyline',points:pts.map(p),closed:false});warn('LEADER imported as a polyline; arrow/style simplified');}else warn('LEADER skipped');}
   else warn('Unsupported '+type+' objects skipped');
 }
 for(const e of data.entities||[]){try{visit(e);}catch(error){if(/100,000|recursion|exceeds/.test(error.message))throw error;warn((e.type||'Unknown')+' import failed: '+error.message);}}
 const preferred=dwg?data.header?.CLAYER:data.header?.$CLAYER,recovery=ensureWritableLayer(doc,preferred);doc.serialize();const warnings=[...counts].map(([s,n])=>s+' ('+n+')');if(recovery.created||recovery.changed)warnings.push(recovery.message);return{document:doc,warnings,sourceFormat:format,inputEntities:(data.entities||[]).length};
}
function importDxf(text){if(typeof text!=='string'||text.length>64*1024*1024)throw Error('DXF exceeds 64 MiB');if(text.startsWith('AutoCAD Binary DXF'))throw Error('Binary DXF is not supported. Save as ASCII DXF in the source CAD program.');let data;try{data=new DxfParser().parseSync(text);}catch(error){throw Error('Invalid DXF: '+error.message);}if(!data?.entities)throw Error('DXF has no readable ENTITIES section');applyDxfLayerFlags(data,text);const r=convertDatabase(data,'DXF '+(data.header?.$ACADVER||'unknown'));const parsedTypes=new Set((data.entities||[]).map(e=>e.type));const groups=text.replace(/\r/g,'').split('\n');const known=new Set(['SECTION','ENDSEC','EOF','TABLE','ENDTAB','BLOCK','ENDBLK','SEQEND','VERTEX','CLASS']);let section='';for(let i=0;i+1<groups.length;i+=2){if(groups[i].trim()==='2'&&groups[i-2]?.trim()==='0'&&groups[i-1]?.trim()==='SECTION')section=groups[i+1].trim();if(section==='ENTITIES'&&groups[i].trim()==='0'){const t=groups[i+1].trim();if(!known.has(t)&&!parsedTypes.has(t)&&!r.warnings.some(s=>s.includes(t)))r.warnings.push('DXF parser did not expose '+t+' objects; they were skipped.');}}return r;}
let enginePromise;
async function engine(){if(!enginePromise)enginePromise=(async()=>{let L,wasm;if(typeof module==='object'&&module.exports){const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');L=require('../vendor/libredwg/dist/libredwg-web.umd.cjs');const mod=await import(pathToFileURL(path.resolve(__dirname,'../vendor/libredwg/wasm/libredwg-web.js')));wasm=await mod.default({wasmBinary:fs.readFileSync(path.resolve(__dirname,'../vendor/libredwg/wasm/libredwg-web.wasm')),printErr:()=>{},print:()=>{}});}else{L=root['libredwg-web'];if(!L||!root.createModule||!root.RasmDwgWasm&&!root.RasmDwgReaderBytes)throw Error('The bundled DWG engine is unavailable');const bytes=root.RasmDwgReaderBytes?await root.RasmDwgReaderBytes():Uint8Array.from(atob(root.RasmDwgWasm),c=>c.charCodeAt(0));wasm=await root.createModule({wasmBinary:bytes,printErr:()=>{},print:()=>{}});}return{lib:L.LibreDwg.createByWasmInstance(wasm),wasm,L};})();return enginePromise;}
async function importDwg(input){const bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes.length>64*1024*1024)throw Error('DWG exceeds 64 MiB');const header=new TextDecoder('ascii').decode(bytes.subarray(0,6));if(!/^AC10\d\d$/.test(header))throw Error('This file does not have a DWG signature');const{lib,wasm}=await engine();const name='rasmcad-input.dwg';let ptr=0;try{wasm.FS.writeFile(name,bytes);const result=wasm.dwg_read_file(name);ptr=result.data;if(!ptr||result.error>=128)throw Error('LibreDWG could not decode this file (code '+result.error+'). Export ASCII DXF from the source CAD application.');const converted=dwgReader(lib).convertEx(ptr);const out=convertDatabase(converted.database,'DWG '+header,true);if(result.error)out.warnings.unshift('LibreDWG reported decoder flags '+result.error+'; inspect this import carefully.');if(converted.stats.unknownEntityCount)out.warnings.push(converted.stats.unknownEntityCount+' unrecognized DWG entities were not converted.');out.warnings.push('Model-space import only. Custom objects, external references, layouts, fonts and plot settings are not fully supported.');return out;}finally{try{wasm.FS.unlink(name);}catch{}if(ptr)lib.dwg_free(ptr);}}
async function importFile(input,name=''){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes.length>64*1024*1024)throw Error('File exceeds 64 MiB');
 const signature=new TextDecoder('ascii').decode(bytes.subarray(0,32));
 if(/^AC10\d\d/.test(signature))return importDwg(bytes);
 const binary=typeof module==='object'&&module.exports?require('./dxf-binary.js'):root.RasmDxfBinary;
 if(binary?.isBinary(bytes)){const decoded=binary.decode(bytes),result=importDxf(decoded.text);result.sourceFormat='Binary '+result.sourceFormat;result.sourceEncoding=decoded.encoding;result.warnings.unshift(...decoded.warnings);return result;}
 let text=new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/,'');
 if(/(?:^|\n)\s*0\s*\r?\n\s*SECTION\s*(?:\r?\n|$)/.test(text)||/\.dxf$/i.test(name)){const decoded=binary?.decodeText?binary.decodeText(bytes):{text,warnings:[]},result=importDxf(decoded.text);result.warnings.unshift(...decoded.warnings);if(decoded.encoding)result.sourceEncoding=decoded.encoding;return result;}
 if(/^RASMCAD\s/.test(text.trimStart()))return{document:C.importRcad(text),warnings:[],sourceFormat:'RasmCAD native legacy'};
 if(/\.(?:dwg|dwt|dws|bak|sv\$)$/i.test(name))throw Error('This file has no readable DWG signature. Only DWG-based templates/backups are supported.');
 if(/\.(?:dwf|dwfx|dgn)$/i.test(name))throw Error('DWF, DWFx and DGN are not supported by this editor. Use a source CAD program to export DWG or DXF.');
 return{document:C.Document.parse(text),warnings:[],sourceFormat:'RasmCAD JSON'};
}
return Object.freeze({importFile,importDxf,importDwg,convertDatabase,ensureWritableLayer});
});
