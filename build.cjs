'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=__dirname,read=name=>fs.readFileSync(path.join(root,'src',name),'utf8');
let html=read('index.html');
for(const [marker,name]of[['STYLES','style.css'],['CORE','core.js'],['APP','app.js']]){
  const source=read(name);if(/<\/script/i.test(source))throw Error('Unsafe script terminator in '+name);
  html=html.replace('/* '+marker+' */',()=>source);
}
const vendor=name=>fs.readFileSync(path.join(root,'vendor',name),'utf8');
let glue=vendor('libredwg/wasm/libredwg-web.js').replaceAll('import.meta.url','"file:///rasmcad/libredwg-web.js"').replace('export default createModule;','globalThis.createModule=createModule;');
const binary=fs.readFileSync(path.join(root,'vendor/libredwg/wasm/libredwg-web.wasm')).toString('base64');
const extra=[`globalThis.RasmDwgWasm=${JSON.stringify(binary)};`,glue,vendor('libredwg/dist/libredwg-web.umd.cjs'),vendor('dxf-parser/dist/dxf-parser.js'),read('editing.js'),read('dxf-binary.js'),read('io.js'),read('selection.js'),read('grips.js'),read('commands.js'),read('view.js'),read('snaps.js'),read('advanced-edit.js'),read('hatch.js'),read('blocks.js'),read('dimensions.js'),read('plot.js'),read('plot-ui.js'),read('advanced-ui.js')];
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
