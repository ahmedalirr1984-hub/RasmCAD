'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const file=path.join(root,'dist','RasmCAD-Advanced.html');
if(!fs.existsSync(file))require('./restore-release.cjs');
const html=fs.readFileSync(file,'utf8');
const zlib=require('node:zlib');
for(const [name,destination]of [['RasmReaderGzip','vendor/libredwg/wasm/libredwg-web.wasm'],['RasmWriterGzip','vendor/dwg-writer/dxf2dwg.wasm']]){
 const match=html.match(new RegExp('globalThis\\.'+name+'="([A-Za-z0-9+/=]+)";'));
 if(!match)throw Error('Embedded engine not found: '+name);
 const out=path.join(root,destination);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,zlib.gunzipSync(Buffer.from(match[1],'base64')));console.log(out);
}
