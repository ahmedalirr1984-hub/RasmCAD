/* Independent bounded DXF byte decoding. No drawing conversion or mutation. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.RasmDxfBinary=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MAX_BYTES=64*1024*1024,MAX_GROUPS=2000000,MAX_STRING=1024*1024;
  const SIGNATURE=Uint8Array.from([65,117,116,111,67,65,68,32,66,105,110,97,114,121,32,68,88,70,13,10,26,0]);
  function bytesOf(input){
    let bytes;
    if(input instanceof Uint8Array)bytes=input;
    else if(input instanceof ArrayBuffer)bytes=new Uint8Array(input);
    else if(ArrayBuffer.isView(input))bytes=new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
    else throw Error('DXF input must contain bytes.');
    if(bytes.length>MAX_BYTES)throw Error('DXF exceeds 64 MiB.');
    return bytes;
  }
  function isBinary(input){
    const bytes=bytesOf(input);
    return bytes.length>=SIGNATURE.length&&SIGNATURE.every((b,i)=>bytes[i]===b);
  }
  const ascii=bytes=>{let result='';for(const byte of bytes)result+=String.fromCharCode(byte);return result;};
  function codec(sourceVersion,codepage,bom=false){
    if(bom||/^AC\d{4}$/.test(sourceVersion)&&sourceVersion>='AC1021')return'utf-8';
    const page=String(codepage||'ANSI_1252').trim().toUpperCase();
    const direct={UTF8:'utf-8','UTF-8':'utf-8',ANSI_874:'windows-874',ANSI_932:'shift_jis',DOS932:'shift_jis',ANSI_936:'gbk',GB2312:'gbk',ANSI_949:'euc-kr',KSC5601:'euc-kr',ANSI_950:'big5',BIG5:'big5',DOS866:'ibm866','MAC-ROMAN':'macintosh'};
    if(direct[page])return direct[page];
    if(/^ANSI_125[0-8]$/.test(page))return'windows-'+page.slice(5);
    if(/^ISO8859_[1-9]$/.test(page))return'iso-8859-'+page.slice(8);
    throw Error('Unsupported DXF text code page '+page+'. Save the source drawing as UTF-8 DXF (2007 or newer).');
  }
  function decoder(encoding){
    try{return new TextDecoder(encoding,{fatal:true});}
    catch{throw Error('The browser does not support DXF text encoding '+encoding+'.');}
  }
  function decodeValue(bytes,textDecoder){
    try{return textDecoder.decode(bytes);}
    catch{throw Error('DXF contains malformed '+textDecoder.encoding+' text.');}
  }
  function scalarType(code){
    if(code>=310&&code<=319||code===1004)return'chunk';
    if(code>=10&&code<=59||code>=110&&code<=149||code>=210&&code<=239||code>=460&&code<=469||code>=1010&&code<=1059)return'double';
    if(code>=60&&code<=79||code>=170&&code<=179||code>=270&&code<=289||code>=370&&code<=389||code>=400&&code<=409||code>=1060&&code<=1070)return'int16';
    if(code>=90&&code<=99||code>=420&&code<=429||code>=440&&code<=459||code===1071)return'int32';
    if(code>=160&&code<=169)return'int64';
    if(code>=290&&code<=299)return'byte';
    // Defined string/handle ranges. Reserved codes are rejected rather than
    // guessing a byte width and shifting every subsequent group.
    if(code>=0&&code<=9||code>=100&&code<=102||code===105||code>=300&&code<=309||code>=320&&code<=369||code>=390&&code<=399||code>=410&&code<=419||code>=430&&code<=439||code>=470&&code<=481||code===999||code>=1000&&code<=1003||code>=1005&&code<=1009)return'string';
    throw Error('Unsupported binary DXF group code '+code+'.');
  }
  function reader(bytes,legacy){
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=SIGNATURE.length,groups=0;
    function need(count){if(at+count>bytes.length)throw Error('Truncated binary DXF at byte '+at+'.');}
    function next(){
      if(++groups>MAX_GROUPS)throw Error('DXF exceeds 2,000,000 groups.');
      need(legacy?1:2);let code;
      if(legacy){code=view.getUint8(at++);if(code===255){need(2);code=view.getUint16(at,true);at+=2;}}
      else{code=view.getUint16(at,true);at+=2;}
      const type=scalarType(code);let value;
      if(type==='chunk'){
        need(1);const count=view.getUint8(at++);need(count);
        value='';for(let i=0;i<count;i++)value+=view.getUint8(at++).toString(16).padStart(2,'0').toUpperCase();
      }else if(type==='double'){
        need(8);value=view.getFloat64(at,true);at+=8;if(!Number.isFinite(value))throw Error('Binary DXF contains a non-finite number.');
      }else if(type==='int16'){need(2);value=view.getInt16(at,true);at+=2;}
      else if(type==='int32'){need(4);value=view.getInt32(at,true);at+=4;}
      else if(type==='int64'){need(8);value=view.getBigInt64(at,true).toString();at+=8;}
      else if(type==='byte'){need(1);value=view.getUint8(at++);if(value>1)throw Error('Invalid binary DXF boolean value.');}
      else{
        const end=bytes.indexOf(0,at);
        if(end<0)throw Error('Unterminated binary DXF text at byte '+at+'.');
        if(end-at>MAX_STRING)throw Error('Binary DXF text value exceeds 1 MiB.');
        value=bytes.subarray(at,end);at=end+1;
      }
      return{code,type,value};
    }
    return{next,get position(){return at;},get groups(){return groups;}};
  }
  function metadata(bytes,legacy){
    const input=reader(bytes,legacy);let section='',expectSection=false,pending='',sourceVersion='',codepage='';
    while(input.position<bytes.length&&input.position<MAX_STRING){
      const tag=input.next(),value=tag.type==='string'?ascii(tag.value):String(tag.value);
      if(tag.code===0){
        if(value==='EOF')break;
        if(value==='SECTION')expectSection=true;
        else if(value==='ENDSEC'&&section==='HEADER')break;
      }else if(expectSection&&tag.code===2){section=value;expectSection=false;}
      if(section!=='HEADER')continue;
      if(tag.code===9)pending=value;
      else if(pending){if(pending==='$ACADVER'&&tag.code===1)sourceVersion=value;if(pending==='$DWGCODEPAGE'&&tag.code===3)codepage=value;pending='';}
    }
    if(sourceVersion&&!/^AC\d{4}$/.test(sourceVersion))throw Error('Invalid binary DXF version '+sourceVersion+'.');
    if(sourceVersion&&(sourceVersion<='AC1009')!==legacy)throw Error('Binary DXF version and group-code width disagree.');
    return{sourceVersion:sourceVersion||(legacy?'AC1009':'unknown'),codepage};
  }
  function decode(input){
    const bytes=bytesOf(input);
    if(!isBinary(bytes))throw Error('Not an AutoCAD binary DXF file.');
    if(bytes.length<SIGNATURE.length+3||bytes[SIGNATURE.length]!==0)throw Error('Binary DXF must begin with a SECTION group.');
    const legacy=bytes[SIGNATURE.length+1]!==0;
    const meta=metadata(bytes,legacy),encoding=codec(meta.sourceVersion,meta.codepage),textDecoder=decoder(encoding);
    const source=reader(bytes,legacy),lines=[];let outputSize=0,done=false,first=true;
    while(source.position<bytes.length){
      const tag=source.next();let value=tag.type==='string'?decodeValue(tag.value,textDecoder):String(tag.value);
      if(/[\r\n]/.test(value))throw Error('Binary DXF contains a text value with an unsupported literal line break.');
      if(first){if(tag.code!==0||value!=='SECTION')throw Error('Binary DXF must begin with SECTION.');first=false;}
      outputSize+=String(tag.code).length+value.length+2;
      if(outputSize>MAX_BYTES)throw Error('Decoded DXF exceeds 64 MiB.');
      lines.push(String(tag.code),value);
      if(tag.code===0&&value==='EOF'){done=true;break;}
    }
    if(!done)throw Error('Binary DXF is missing its EOF group.');
    if(source.position!==bytes.length)throw Error('Binary DXF contains trailing data after EOF.');
    const warnings=meta.sourceVersion==='unknown'?[meta.codepage?'Binary DXF has no version header; text uses its declared '+meta.codepage+' code page.':'Binary DXF has no version or code-page header; Windows-1252 text encoding was assumed.']:[];
    return{text:lines.join('\n')+'\n',warnings,sourceVersion:meta.sourceVersion,encoding};
  }
  function decodeText(input){
    const bytes=bytesOf(input);
    if(isBinary(bytes))return decode(bytes);
    const probe=ascii(bytes.subarray(0,MAX_STRING)),field=name=>{
      const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      return probe.match(new RegExp('(?:^|\\r?\\n)\\s*9\\s*\\r?\\n'+escaped+'\\r?\\n\\s*[13]\\s*\\r?\\n([^\\r\\n]+)'))?.[1]?.trim()||'';
    };
    const sourceVersion=field('$ACADVER'),codepage=field('$DWGCODEPAGE'),bom=bytes[0]===239&&bytes[1]===187&&bytes[2]===191;
    let encoding=codec(sourceVersion,codepage,bom),warnings=[];
    if(!sourceVersion&&!codepage&&!bom){
      try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);encoding='utf-8';}
      catch{warnings.push('DXF has no version or code-page header; Windows-1252 text encoding was assumed.');}
    }
    const text=decodeValue(bytes,decoder(encoding)).replace(/^\uFEFF/,'');
    return{text,warnings,sourceVersion:sourceVersion||'unknown',encoding};
  }
  return Object.freeze({isBinary,decode,decodeText});
});
