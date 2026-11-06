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
const expected='80f90cf791dddbdf168423c454f70c237fdfa027dd6f9b33ef25e5faf8dcb378';
if(hash!==expected)throw Error('Release hash mismatch: '+hash);
console.log(out);
