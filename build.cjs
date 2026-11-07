'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=__dirname,read=name=>fs.readFileSync(path.join(root,'src',name),'utf8');
let html=read('index.html');
for(const [marker,name]of[['STYLES','style.css'],['CORE','core.js'],['APP','app.js']]){
  const source=read(name);if(/<\/script/i.test(source))throw Error('Unsafe script terminator in '+name);
  html=html.replace('/* '+marker+' */',()=>source);
}
const vendor=name=>fs.readFileSync(path.join(root,'vendor',name),'utf8');
let glue=vendor('libredwg/wasm/libredwg-web.js').replaceAll('import.meta.url','"file:///rasmcad/libredwg-web.js"').replace('export default createModule;','globalThis.createModule=createModule;');
const binary=zlib.gzipSync(fs.readFileSync(path.join(root,'vendor/libredwg/wasm/libredwg-web.wasm')),{level:9}).toString('base64');
const writer=zlib.gzipSync(fs.readFileSync(path.join(root,'vendor/dwg-writer/dxf2dwg.wasm')),{level:9});fs.writeFileSync(path.join(root,'vendor/dwg-writer/dxf2dwg.wasm.gz'),writer);
const engines=`globalThis.RasmReaderGzip=${JSON.stringify(binary)};globalThis.RasmWriterGzip=${JSON.stringify(writer.toString('base64'))};
async function rasmInflate(b64){if(typeof DecompressionStream==='undefined')throw Error('This browser needs local gzip decompression support. Use a current Chromium-based browser.');const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}
let rasmReaderBytes,rasmWriterBytes;globalThis.RasmDwgReaderBytes=()=>rasmReaderBytes??=rasmInflate(RasmReaderGzip);globalThis.RasmDwgWriterBytes=()=>rasmWriterBytes??=rasmInflate(RasmWriterGzip);`;
const extra=[engines,glue,vendor('libredwg/dist/libredwg-web.umd.cjs'),vendor('dxf-parser/dist/dxf-parser.js'),read('precision.js'),read('curve-polyline.js'),read('construction.js'),read('editing.js'),read('properties.js'),read('dxf-binary.js'),read('io.js'),read('selection.js'),read('selection-tools.js'),read('grips.js'),read('commands.js'),read('view.js'),read('tracking.js'),read('snaps.js'),read('advanced-edit.js'),read('hatch.js'),read('blocks.js'),read('dimensions.js'),read('plot.js'),read('plot-ui.js'),read('advanced-ui.js'),read('dwg-write.js'),vendor('dwg-writer/dxf2dwg.cjs'),`globalThis.RasmDwgDxfTemplate=${JSON.stringify(vendor('dwg-writer/template.dxf'))};globalThis.RasmDwgPalette=${vendor('dwg-writer/aci.json')};globalThis.RasmDwgCodepage=${vendor('dwg-writer/cp1256.json')};`,read('dwg-encoder.js'),read('save.js'),read('recovery.js'),read('plot-advanced-ui.js'),read('save-ui.js'),read('workspace-ui.js')];
for(const source of extra)if(/<\/script/i.test(source))throw Error('Unsafe vendor script terminator');
// Inject dependencies immediately before the UI script; no network fetches are needed.
// A callback preserves literal $ tokens in embedded source (e.g. regex strings).
// String replacement would interpret $' as the text after the matched script.
const ui=read('app.js');html=html.replace('<script>'+ui+'</script>',()=>extra.map(s=>'<script>'+s+'</script>').join('')+'<script>'+ui+'</script>');
for(const source of extra)if(!html.includes('<script>'+source+'</script>'))throw Error('Embedded module was altered during bundling');
// Emscripten Embind generates local JavaScript call wrappers through Function().
// This policy applies only to this document; network connections stay forbidden.
html=html.replace("script-src 'unsafe-inline'","script-src 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval'");
fs.mkdirSync(path.join(root,'dist'),{recursive:true});fs.writeFileSync(path.join(root,'dist','RasmCAD-Advanced.html'),html);
console.log('Built dist/RasmCAD-Advanced.html ('+Buffer.byteLength(html)+' bytes; DWG engine embedded)');
