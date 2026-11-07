'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const parts=fs.readdirSync(path.join(root,'dist','parts')).filter(n=>/^RasmCAD-Advanced\.html\.part\d+$/.test(n)).sort();
if(!parts.length)throw Error('No release parts found in dist/parts');
const out=path.join(root,'dist','RasmCAD-Advanced.html');
const fd=fs.openSync(out,'w');
try{for(const part of parts)fs.writeSync(fd,fs.readFileSync(path.join(root,'dist','parts',part)));}finally{fs.closeSync(fd);}
const crypto=require('node:crypto');
const hash=crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
const expected='bf16cf5adb095a04465b134267325d4525debb21de089ebd9a7c5b6f55bb032d';
if(hash!==expected)throw Error('Release hash mismatch: '+hash);
console.log(out);
