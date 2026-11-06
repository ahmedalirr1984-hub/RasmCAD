/* Explicit native and standards-versioned DXF export choices. */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'));else root.RasmSave=factory(root.RasmCore);})(typeof globalThis!=='undefined'?globalThis:this,function(C){
'use strict';
const formats=Object.freeze([{id:'native',label:'RasmCAD project — full editable data (.rasm.json)',extension:'.rasm.json',mime:'application/json'},...Object.entries({AC1021:'AutoCAD 2007 DXF',AC1024:'AutoCAD 2010 DXF',AC1027:'AutoCAD 2013 DXF',AC1032:'AutoCAD 2018–2024 DXF'}).map(([id,label])=>({id,label:label+' (.dxf)',extension:'.dxf',mime:'application/dxf'}))].map(Object.freeze));
function exportFile(doc,id){const format=formats.find(f=>f.id===id);if(!format)throw Error(id==='dwg'?'DWG writing is unavailable in the bundled engine. Choose DXF for CAD exchange or a native project to preserve all editable data.':'Unsupported save format: '+id);const content=id==='native'?doc.serialize():C.exportDxf(doc,{version:id});return{...format,content,warnings:id==='native'?[]:['DXF exports supported visible geometry. Native block definitions, editable hatch patterns, dimension styles and associativity are flattened; retain a native project for continued editing.']};}
function filename(value,format){let name=String(value||'Drawing').trim().replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/(?:\.rasm\.json|\.rcad|\.json|\.dwg|\.dxf)$/i,'');if(!name||/^\.+$/.test(name))name='Drawing';return name.slice(0,180)+format.extension;}
return Object.freeze({formats,exportFile,filename});
});
