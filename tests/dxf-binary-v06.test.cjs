'use strict';
// Independent binary byte fixtures and real ezdxf-written ASCII/binary pairs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const B=require('../src/dxf-binary.js'),IO=require('../src/io.js'),C=require('../src/core.js');
let checks=0;
const equal=(actual,expected,message)=>{checks++;assert.deepEqual(actual,expected,message);};
const ok=(value,message)=>{checks++;assert.ok(value,message);};
const bad=(fn,pattern,message)=>{checks++;assert.throws(fn,pattern,message);};
const signature=Buffer.from('AutoCAD Binary DXF\r\n\x1a\0','binary');
const tag=(code,kind,value)=>({code,kind,value});
const s=(code,value)=>tag(code,'string',value);
function fixture(tags,legacy=false){
  const parts=[signature];
  for(const{code,kind,value}of tags){
    const group=Buffer.alloc(legacy?(code>=255?3:1):2);
    if(legacy&&code>=255){group[0]=255;group.writeUInt16LE(code,1);}
    else if(legacy)group[0]=code;
    else group.writeUInt16LE(code);
    parts.push(group);let item;
    if(kind==='string'){item=Buffer.isBuffer(value)?value:Buffer.from(value,'utf8');parts.push(item,Buffer.from([0]));continue;}
    if(kind==='chunk'){parts.push(Buffer.from([value.length]),Buffer.from(value));continue;}
    item=Buffer.alloc({double:8,int16:2,int32:4,int64:8,byte:1}[kind]);
    if(kind==='double')item.writeDoubleLE(value);
    if(kind==='int16')item.writeInt16LE(value);
    if(kind==='int32')item.writeInt32LE(value);
    if(kind==='int64')item.writeBigInt64LE(BigInt(value));
    if(kind==='byte')item[0]=value;
    parts.push(item);
  }
  return Buffer.concat(parts);
}
const header=(version='AC1032',codepage='ANSI_1252')=>[s(0,'SECTION'),s(2,'HEADER'),s(9,'$ACADVER'),s(1,version),s(9,'$DWGCODEPAGE'),s(3,codepage),s(0,'ENDSEC')];
const end=[s(0,'ENDSEC'),s(0,'EOF')];
const body=[s(0,'SECTION'),s(2,'ENTITIES'),s(0,'LINE'),s(8,'WORK'),tag(10,'double',1.25),tag(20,'double',-2.5),tag(11,'double',110.25),tag(21,'double',79.5)];
const typed=fixture([...header(),...body,tag(70,'int16',-12345),tag(90,'int32',-2147483648),tag(160,'int64','-9223372036854775808'),tag(290,'byte',1),tag(420,'int32',0x0c91e6),tag(310,'chunk',[0,255,128,10]),s(1000,'مخطط 測試'),tag(1004,'chunk',[17,254]),tag(1071,'int32',2147483647),...end]);
ok(B.isBinary(typed),'binary signature recognized');
equal(B.isBinary(Buffer.from('0\nSECTION\n')),false,'ASCII is not binary');
const result=B.decode(typed);
equal(result.sourceVersion,'AC1032','modern source version');equal(result.encoding,'utf-8','modern UTF-8');
for(const expected of ['70\n-12345\n','90\n-2147483648\n','160\n-9223372036854775808\n','290\n1\n','420\n823782\n','310\n00FF800A\n','1000\nمخطط 測試\n','1004\n11FE\n','1071\n2147483647\n'])ok(result.text.includes(expected),'typed data preserved: '+expected.trim());
equal(result.warnings,[],'no encoding assumption for explicit modern version');
const offset=Buffer.concat([Buffer.from([7,8,9]),typed,Buffer.from([11,12])]);
equal(B.decode(offset.subarray(3,-2)).text,result.text,'nonzero byte offset is honored');
equal(B.decode(new Uint8Array(typed).buffer).text,result.text,'ArrayBuffer input');
equal(B.decode(new DataView(typed.buffer,typed.byteOffset,typed.byteLength)).text,result.text,'DataView input');
const old=fixture([...header('AC1009'),...body,s(1000,'extended'),tag(1004,'chunk',[0,255]),tag(1071,'int32',-100),...end],true);
const oldResult=B.decode(old);equal(oldResult.sourceVersion,'AC1009','R12 version');equal(oldResult.encoding,'windows-1252','R12 default code page');
ok(oldResult.text.includes('1000\nextended\n1004\n00FF\n1071\n-100\n'),'R12 extended group codes decoded');
for(let i=0;i<typed.length;i++)bad(()=>B.decode(typed.subarray(0,i)),/DXF|binary/i,'every truncated prefix is rejected');
bad(()=>B.decode(Buffer.concat([typed,Buffer.from([0])])),/trailing data/i,'EOF prevents silent extra records');
bad(()=>B.decode(fixture([...header(),...body,...end.slice(0,1)])),/EOF/,'missing EOF');
bad(()=>B.decode(fixture([...header(),...body,tag(10,'double',NaN),...end])),/non-finite/,'non-finite coordinate');
bad(()=>B.decode(fixture([...header(),...body,tag(290,'byte',2),...end])),/boolean/,'invalid boolean');
bad(()=>B.decode(fixture([...header(),...body,s(80,'reserved'),...end])),/group code 80/,'reserved code cannot shift parse');
bad(()=>B.decode(fixture([...header(),...body,s(1000,'one\ntwo'),...end])),/line break/,'literal linebreak cannot corrupt ASCII grouping');
bad(()=>B.decode(fixture([...header(),...body,s(1000,Buffer.from([0xc3,0x28])),...end])),/malformed utf-8/,'malformed UTF-8');
bad(()=>B.decode(fixture([...header('AC1015'),...body,...end],true)),/width disagree/,'version/code width mismatch');
bad(()=>B.decode(fixture([...header('AC1015','DOS437'),...body,...end])),/Unsupported DXF text code page DOS437/,'unsupported code page explicit');
bad(()=>B.decode(new Uint8Array(64*1024*1024+1)),/64 MiB/,'file-size cap');
bad(()=>B.decode('not bytes'),/bytes/,'input type checked');
equal(B.decodeText(typed).text,result.text,'shared text path handles binary inputs');
const noHeader=B.decode(fixture([...body,...end]));equal(noHeader.sourceVersion,'unknown','missing version is reported');equal(noHeader.warnings.length,1,'missing version reports encoding assumption');
equal(B.decodeText(Buffer.from('\ufeff0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n')).encoding,'utf-8','UTF-8 BOM supported');
equal(B.decodeText(Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n')).encoding,'utf-8','ASCII without header is UTF-8 compatible');
bad(()=>B.decodeText(Buffer.from('0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$DWGCODEPAGE\n3\nDOS437\n0\nENDSEC\n0\nEOF\n')),/DOS437/,'unsupported ASCII encoding also explicit');

const texts={r12:'Cafe é','r2000-arabic':'مخطط مكتب','r2018-unicode':'مخطط 測試 📐'};
const encodings={r12:'windows-1252','r2000-arabic':'windows-1256','r2018-unicode':'utf-8'};
for(const name of Object.keys(texts)){
  const prefix=path.join(__dirname,'fixtures','binary-v06-'+name),binaryBytes=fs.readFileSync(prefix+'.dxf'),asciiBytes=fs.readFileSync(prefix+'-ascii.dxf');
  const binary=B.decode(binaryBytes),ascii=B.decodeText(asciiBytes);
  equal(binary.encoding,encodings[name],name+' binary encoding');equal(ascii.encoding,encodings[name],name+' ASCII encoding');
  const a=IO.importDxf(ascii.text),b=IO.importDxf(binary.text);
  equal(b.document.entities,a.document.entities,name+' actual ASCII/binary imported geometry and styles agree');
  equal(b.document.layers,a.document.layers,name+' imported layer states agree');
  equal(b.document.entities.length,5,name+' expanded block and primitive count');
  equal(b.document.entities.find(e=>e.kind==='text').text,texts[name],name+' actual text preserved');
  equal(b.document.layer('LOCKED').locked,true,name+' locked source layer retained');
  equal(b.document.entities[0].points,[{x:10.25,y:-20.5},{x:110.25,y:79.5}],name+' known line points');
  if(name==='r2018-unicode')equal(b.document.entities[0].color,'#0c91e6','modern true color retained');
  const saved=C.Document.parse(b.document.serialize());equal(saved.entities,b.document.entities,name+' native save/reopen after binary import');
  saved.transform([saved.entities[0].id],{translation:{x:10,y:5}});
  equal(saved.entities[0].points[0],{x:20.25,y:-15.5},name+' imported geometry editable after reopen');
}
console.log('Binary/ASCII DXF v0.6: '+checks+' checks passed.');
