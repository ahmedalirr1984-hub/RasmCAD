/* DWG output capability boundary. A format must have a verified encoder before
 * it can be advertised as an available Save As choice. */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory();else root.RasmDwgWrite=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const reason='DWG saving is unavailable in the bundled engine. Save an editable RasmCAD project or export DXF. Changing the filename to .dwg does not convert the file.';
  const capability=Object.freeze({format:'dwg',extension:'.dwg',available:false,canWrite:false,engine:'@mlightcad/libredwg-web',engineVersion:'0.8.4',code:'DWG_WRITER_UNAVAILABLE',reason});
  function inspectRuntime(runtime){
    return Object.freeze({
      reader:typeof runtime?.dwg_read_file==='function',
      dwgToDxf:typeof runtime?.dwg_write_dxf==='function',
      dwgWriter:typeof runtime?.dwg_write_file==='function',
      dxfReader:typeof runtime?.dxf_read_file==='function',
      verifiedDocumentEncoder:false
    });
  }
  function write(){const error=new Error(reason);error.code=capability.code;throw error;}
  return Object.freeze({capabilities:()=>capability,inspectRuntime,write});
});
