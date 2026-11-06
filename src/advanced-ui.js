/* Interactive advanced 2D command workflows. Geometry lives in the pure modules. */
(function(root){'use strict';
root.RasmAdvancedUI={mount(ctx){
 const C=root.RasmCore,A=root.RasmAdvancedEdit,H=root.RasmHatch,B=root.RasmBlocks,D=root.RasmDimensions,N=root.RasmCommands;
 let state=null,blockSession=null;
 const snapModes=new Set(['endpoint','midpoint','center','quadrant','intersection']);
 const names=['STRETCH','BREAK','LENGTHEN','ALIGN','PEDIT','SPLINEDIT','SPLINE','OVERKILL','EXPLODE','EXPLOAD','HATCH','HATCHEDIT','BOUNDARY','REGION','BLOCK','INSERT','WBLOCK','BEDIT','REFEDIT','BCLOSE','ATTDEF','ATTEDIT','ATTSYNC','DIMSTYLE','DIMCONTINUE','DIMBASELINE','DIMORDINATE','DIMEDIT','QLEADER','MLEADER','MLEADEREDIT','OSNAPSET'];
 const doc=()=>ctx.getDocument(),ids=()=>ctx.getSelection(),clone=x=>JSON.parse(JSON.stringify(x));
 const number=(v,label)=>{const n=N.number(v);if(n===null)throw Error('Enter a valid '+label);return n;};
 const done=(result,message)=>{state=null;ctx.changed(Array.isArray(result)?result:[],message||'Command completed.');};
 const refresh=()=>ctx.refresh();
 const run=fn=>{try{return fn();}catch(e){ctx.log(e.message,true);refresh();}};
 function dialog(title,fields,apply){
  const d=document.createElement('dialog');d.className='advanced-dialog';
  const heading=document.createElement('h2');heading.textContent=title;d.append(heading);
  let applied=false;
  const form=document.createElement('form');form.className='advanced-form';const elements={};
  for(const f of fields){const label=document.createElement('label');label.textContent=f.label;const input=document.createElement(f.options?'select':f.multiline?'textarea':'input');
   if(f.options)for(const item of f.options){const o=document.createElement('option');o.value=typeof item==='string'?item:item.value;o.textContent=typeof item==='string'?item:item.label;input.append(o);}
   else if(!f.multiline)input.type=f.type||'text';
   input.name=f.name;input.id='advanced-'+f.name;input.value=f.value??(f.options?input.options[0]?.value:'');if(f.type==='checkbox')input.checked=!!f.value;
   if(f.type==='number')input.step='any';if(f.required)input.required=true;if(f.readOnly)input.readOnly=true;label.append(input);form.append(label);elements[f.name]=input;
  }
  const error=document.createElement('p');error.className='advanced-error';error.role='alert';form.append(error);
  const actions=document.createElement('div');actions.className='import-actions';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>d.close();
  const save=document.createElement('button');save.type='submit';save.className='primary';save.textContent='Apply';actions.append(cancel,save);form.append(actions);
  form.onsubmit=e=>{e.preventDefault();try{const values=Object.fromEntries(Object.entries(elements).map(([k,v])=>[k,v.type==='checkbox'?v.checked:v.value]));apply(values);applied=true;d.close();}catch(ex){error.textContent=ex.message;ctx.log(ex.message,true);}};
  d.append(form);d.addEventListener('close',()=>{if(!applied){state=null;refresh();}d.remove();ctx.focus();});document.body.append(d);d.showModal();return d;
 }
 function selectedOne(kind){const chosen=doc().entities.filter(e=>ids().includes(e.id));if(chosen.length!==1||kind&&!kind(chosen[0]))throw Error('Select one suitable object first.');return chosen[0];}
 function acquire(name,after,extra={}){state={name,stage:'select',points:[],after,...extra};if(ids().length){state.stage='ready';after();}else{state.prompt=name+': select objects, then Enter.';refresh();}}
 function stage(name,prompt,count,action,extra={}){state={name,prompt,points:[],count,action,...extra};refresh();ctx.focus();}
 function askName(title,apply,value=''){dialog(title,[{name:'name',label:'Name',value,required:true}],v=>apply(v.name.trim()));}
 function attributeForm(name){
  dialog('Attribute definition — '+name,[{name:'operation',label:'Operation',options:['ADD','UPDATE','REMOVE']},{name:'originalTag',label:'Existing tag for UPDATE / REMOVE'},{name:'tag',label:'Tag (unique)'},{name:'prompt',label:'Prompt'},{name:'defaultValue',label:'Default value'},{name:'x',label:'Local X',type:'number',value:0},{name:'y',label:'Local Y',type:'number',value:0},{name:'height',label:'Text height',type:'number',value:12},{name:'rotation',label:'Rotation degrees',type:'number',value:0},{name:'invisible',label:'Invisible',type:'checkbox'},{name:'constant',label:'Constant',type:'checkbox'},{name:'required',label:'Require a nonempty value',type:'checkbox'}],v=>{
   const data={tag:v.tag,prompt:v.prompt,defaultValue:v.defaultValue,point:{x:number(v.x,'X'),y:number(v.y,'Y')},height:number(v.height,'height'),rotation:number(v.rotation,'angle')*Math.PI/180,invisible:v.invisible,constant:v.constant,required:v.required};
   const result=v.operation==='REMOVE'?B.removeAttribute(doc(),name,v.originalTag):v.operation==='UPDATE'?B.updateAttribute(doc(),name,v.originalTag,data):B.addAttribute(doc(),name,data);
   done(result,'Attribute definitions updated. Use ATTEDIT for instance values.');
  });
 }
 function hatchForm(edit=false,inside=false){
  const chosen=doc().entities.find(e=>ids().includes(e.id)&&e.subtype==='hatch'),data=chosen?.data||{};
  dialog(edit?'HATCHEDIT':inside?'HATCH — pick enclosed area':'HATCH — selected closed boundaries',[{name:'pattern',label:'Pattern',options:['ANSI31','CROSS','SOLID','HORIZONTAL','VERTICAL'],value:data.pattern||'ANSI31'},{name:'spacing',label:'Spacing in drawing units',type:'number',value:data.spacing||10},{name:'angle',label:'Angle degrees',type:'number',value:data.angle??45}],v=>{const options={pattern:v.pattern,spacing:number(v.spacing,'spacing'),angle:number(v.angle,'angle')};if(inside)stage('HATCH','HATCH: pick inside a closed area.',1,p=>done(H.boundary(doc(),p[0],{hatch:true,...options})));else done((edit?H.edit:H.create)(doc(),ids(),options),'Hatch saved as an editable object.');});
 }
 function dimStyleForm(name){
  const base=D.currentStyle(doc()),stored=doc().resources?.dimStyles?.[name];const style={...base,...(stored?.style||stored||{})};
  const window=dialog('DIMSTYLE — '+name,[{name:'name',label:'Style name',value:name,required:true},...['textHeight','dimensionScale','arrowSize','extensionOffset','extensionExtend','textGap','precision','lineWidth'].map(k=>({name:k,label:k,type:'number',value:style[k]??(k==='precision'?2:1)})),{name:'arrowStyle',label:'Arrow style',options:['closed','open','tick'],value:style.arrowStyle||'closed'},{name:'prefix',label:'Prefix',value:style.prefix||''},{name:'suffix',label:'Suffix',value:style.suffix||''},{name:'color',label:'Object color (blank inherits layer)',value:style.color||''},{name:'dimensionColor',label:'Dimension color (blank inherits)',value:style.dimensionColor||''},{name:'textColor',label:'Text color (blank inherits)',value:style.textColor||''},{name:'applySelected',label:'Apply to selected dimensions',type:'checkbox',value:ids().length>0}],v=>{
   if(v.applySelected&&ids().some(id=>doc().entities.find(e=>e.id===id)?.kind!=='dimension'))throw Error('Select only dimensions before applying a dimension style.');
   const opts={};for(const k of ['textHeight','dimensionScale','arrowSize','extensionOffset','extensionExtend','textGap','precision','lineWidth'])opts[k]=number(v[k],k);
   for(const k of ['arrowStyle','prefix','suffix'])opts[k]=v[k];opts.color=v.color||null;opts.dimensionColor=v.dimensionColor||null;opts.textColor=v.textColor||null;
   const original=doc(),working=C.Document.parse(original.serialize());
   D.style(working,D.style(working,'LIST').some(s=>s.name.toLowerCase()===v.name.toLowerCase())?'UPDATE':'SAVE',v.name,opts);D.style(working,'SETCURRENT',v.name);
   if(v.applySelected)D.style(working,'APPLY',v.name,{ids:ids()});
   if(working.serialize()!==original.serialize()){original.checkpoint();original.entities=working.entities;original.resources=working.resources;}
   done(ids(),'Dimension style saved and set current.');
  });
  const load=document.createElement('div');load.className='dimstyle-load';load.style.cssText='grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;align-items:center';
  const sources=document.createElement('select');sources.id='advanced-style-source';sources.setAttribute('aria-label','Existing dimension style');for(const entry of D.style(doc(),'LIST')){const o=document.createElement('option');o.value=entry.name;o.textContent=entry.name;sources.append(o);}sources.value=name;
  const loadStyle=document.createElement('button');loadStyle.id='advanced-style-load';loadStyle.type='button';loadStyle.textContent='Load existing style';loadStyle.disabled=!sources.options.length;
  const presets=document.createElement('select');presets.id='advanced-style-preset';presets.setAttribute('aria-label','Visual dimension preset');for(const entry of D.style(doc(),'PRESETS')){const o=document.createElement('option');o.value=entry.name;o.textContent=entry.name;presets.append(o);}
  const loadPreset=document.createElement('button');loadPreset.id='advanced-style-load-preset';loadPreset.type='button';loadPreset.textContent='Load visual preset';
  const fill=(values,newName)=>{for(const key of D.fields){const input=window.querySelector('#advanced-'+key);if(input)input.value=values[key]??'';}if(newName)window.querySelector('#advanced-name').value=newName;};
  loadStyle.onclick=()=>run(()=>fill(D.style(doc(),'GET',sources.value),sources.value));loadPreset.onclick=()=>run(()=>fill(D.style(doc(),'PRESETS').find(x=>x.name===presets.value),presets.value));
  load.append(sources,loadStyle,presets,loadPreset);window.querySelector('form').prepend(load);
  const note=document.createElement('p');note.style.gridColumn='1/-1';note.textContent='All rendered style fields are editable. To copy a loaded style, enter a new name before Apply. Presets change visual sizes only; units, tolerances and alternate measurements are not implemented.';load.after(note);

 }
 function start(name,rest){
  state=null;ctx.enter();name=name==='EXPLOAD'?'EXPLODE':name;
  if(name==='OSNAPSET'){
   const fields=['endpoint','midpoint','center','quadrant','intersection','perpendicular','tangent','nearest'].map(k=>({name:k,label:k,type:'checkbox',value:snapModes.has(k)}));
   dialog('Object snap modes',fields,v=>{snapModes.clear();for(const k of Object.keys(v))if(v[k])snapModes.add(k);ctx.log('Object snap modes: '+[...snapModes].join(', '));});return;
  }
  if(name==='STRETCH'){stage(name,'STRETCH: first crossing-window corner, then opposite corner; then base and destination.',4,p=>{const selected=ctx.crossing(p[0],p[1]);done(A.stretch(doc(),selected,p[0],p[1],{x:p[3].x-p[2].x,y:p[3].y-p[2].y}),'Vertices inside the crossing window stretched.');});return;}
  if(name==='BREAK'){acquire(name,()=>{const e=selectedOne();stage(name,'BREAK: first break point, then second break point on selected object.',2,p=>done(A.breakEntity(doc(),e.id,p[0],p[1])));});return;}
  if(name==='LENGTHEN'){acquire(name,()=>{const e=selectedOne();dialog('LENGTHEN',[{name:'mode',label:'Mode',options:['TOTAL','DELTA','PERCENT'],value:'TOTAL'},{name:'value',label:'Length / change / percent',type:'number',value:100}],v=>stage(name,'LENGTHEN: pick near the endpoint to change.',1,p=>done(A.lengthen(doc(),e.id,v.mode,number(v.value,'length'),p[0]))));});return;}
  if(name==='ALIGN'){acquire(name,()=>dialog('ALIGN',[{name:'scale',label:'Scale uniformly to target length',type:'checkbox'}],v=>stage(name,'ALIGN: source point 1, destination 1, source point 2, destination 2.',4,p=>done(A.align(doc(),ids(),p[0],p[2],p[1],p[3],v.scale)))));return;}
  if(name==='PEDIT'||name==='SPLINEDIT'){
   acquire(name,()=>{const spline=name==='SPLINEDIT';const actions=spline?['VERTEX','INSERT','DELETE','REVERSE','CLOSE','OPEN','TENSION']:['CLOSE','OPEN','REVERSE','JOIN','VERTEX','INSERT','DELETE'];
    const apply=(action,value)=>{if(spline)done(A.splineEdit(doc(),selectedOne().id,action,value));else done(A.pedit(doc(),ids(),action,value));};
    if(rest){const [rawAction,...args]=rest.split(/\s+/),action=rawAction.toUpperCase();let value;
     const nums=args.join(' ').split(/[,\s]+/).filter(Boolean).map(x=>number(x,'option value'));
     if(['VERTEX','INSERT'].includes(action)){if(nums.length!==3)throw Error('Enter index x y after the operation.');value={index:nums[0],point:{x:nums[1],y:nums[2]}};}
     else if(nums.length)value=nums[0];apply(action,value);return;}
    dialog(name,[{name:'action',label:'Operation',options:actions},{name:'index',label:'Vertex index (zero based)',type:'number',value:0},{name:'x',label:'New X',type:'number',value:0},{name:'y',label:'New Y',type:'number',value:0},{name:'tension',label:'Spline tension',type:'number',value:.5}],v=>{let value;if(['VERTEX','INSERT'].includes(v.action))value={index:number(v.index,'index'),point:{x:number(v.x,'X'),y:number(v.y,'Y')}};else if(v.action==='DELETE')value=number(v.index,'index');else if(v.action==='TENSION')value=number(v.tension,'tension');apply(v.action,value);});
   });return;
  }
  if(name==='SPLINE'){stage(name,'SPLINE: specify control points; Enter finishes (at least 2).',Infinity,null,{finish:p=>{if(p.length<2)throw Error('Specify at least two spline points.');ctx.append(A.createSpline(p,{tension:.5}));done([],'Editable spline created.');}});return;}
  if(name==='OVERKILL'){acquire(name,()=>dialog('OVERKILL',[{name:'tolerance',label:'Geometric tolerance in drawing units',type:'number',value:.000001}],v=>done(A.overkill(doc(),ids(),number(v.tolerance,'tolerance')),'Duplicates and compatible collinear overlaps processed.')));return;}
  if(name==='EXPLODE'){acquire(name,()=>done(A.explode(doc(),ids()),'Objects exploded into editable components.'));return;}
  if(name==='HATCH'&&!ids().length){hatchForm(false,true);return;}
  if(name==='HATCH'||name==='HATCHEDIT'){acquire(name,()=>hatchForm(name==='HATCHEDIT'));return;}
  if(name==='REGION'){acquire(name,()=>done(H.region(doc(),ids()),'Planar region created.'));return;}
  if(name==='BOUNDARY'){stage(name,'BOUNDARY: pick inside a closed area.',1,p=>done(H.boundary(doc(),p[0]),'Closed boundary created.'));return;}
  if(name==='BLOCK'){
   const define=name=>acquire('BLOCK',()=>stage('BLOCK','BLOCK '+name+': specify base point.',1,p=>done(B.define(doc(),name,ids(),p[0],{replace:true}),'Block '+name+' defined. Use INSERT to reuse it.')));
   if(rest)define(rest);else askName('BLOCK — definition name',define);return;
  }
  if(name==='INSERT'){
   const insert=name=>{const definition=doc().resources?.blocks?.[name];if(!definition)throw Error('Block definition does not exist: '+name);const attributes=definition.attributes||[];
    dialog('INSERT — '+name,[{name:'scale',label:'Uniform scale',type:'number',value:1},{name:'rotation',label:'Rotation degrees',type:'number',value:0},...attributes.map(a=>({name:'attribute_'+a.tag,label:(a.prompt||a.tag)+' ['+a.tag+']'+(a.constant?' (constant)':''),value:a.defaultValue||'',readOnly:a.constant,required:a.required}))],v=>{
     const values=Object.fromEntries(attributes.filter(a=>!a.constant).map(a=>[a.tag,v['attribute_'+a.tag]]));
     stage('INSERT','INSERT '+name+': specify insertion point.',1,p=>done(B.insert(doc(),name,p[0],{scale:number(v.scale,'scale'),rotation:number(v.rotation,'rotation')*Math.PI/180,attributes:values})));
    });};
   if(rest)insert(rest);else askName('INSERT — existing definition name',insert);return;
  }
  if(name==='WBLOCK'){const save=name=>{const standalone=B.exportBlock(doc(),name);ctx.download(standalone.serialize(),name+'.block.rasm.json','application/json');ctx.log('Downloaded a reusable native block drawing; this is not a DWG export.');};if(rest)save(rest);else askName('WBLOCK — native block export',save);return;}
  if(name==='BEDIT'||name==='REFEDIT'){
   const edit=key=>{if(blockSession)throw Error('Close the current block edit with BCLOSE first.');const original=doc(),result=B.beginEdit(original,key);blockSession={original,context:result.context};ctx.replaceDocument(result.document,'Block edit');updateBlockBanner();ctx.log('Block editing: edit the working geometry, then BCLOSE SAVE or BCLOSE CANCEL.');};
   if(name==='REFEDIT')edit(selectedOne(e=>e.subtype==='block').id);else if(rest)edit(rest);else askName('BEDIT — definition name',edit);return;
  }
  if(name==='BCLOSE'){if(!blockSession)throw Error('No block definition is being edited.');const close=save=>{const session=blockSession,working=doc();if(save)B.commitEdit(session.original,session.context,working);blockSession=null;ctx.replaceDocument(session.original,'Drawing');updateBlockBanner();ctx.changed([],save?'Block definition saved; references updated.':'Block edit discarded.');};if(rest)close(!['CANCEL','DISCARD','NO'].includes(rest.toUpperCase()));else dialog('Close block editing',[{name:'save',label:'Save changes to definition',type:'checkbox',value:true}],v=>close(v.save));return;}
  if(name==='ATTDEF'){if(rest)attributeForm(rest);else askName('ATTDEF — block name',attributeForm);return;}
  if(name==='ATTEDIT'){acquire(name,()=>{const e=selectedOne(e=>e.subtype==='block'),attributes=doc().resources.blocks[e.data.name]?.attributes||[];if(!attributes.length)throw Error('This block has no attributes. Use ATTDEF to add definitions.');
   dialog('ATTEDIT — '+e.data.name,attributes.map(a=>({name:'attribute_'+a.tag,label:(a.prompt||a.tag)+' ['+a.tag+']'+(a.constant?' (constant)':a.invisible?' (invisible)':''),value:e.data.attributes[a.tag]??a.defaultValue,readOnly:a.constant,required:a.required})),v=>done(B.setAttributes(doc(),ids(),Object.fromEntries(attributes.filter(a=>!a.constant).map(a=>[a.tag,v['attribute_'+a.tag]])))));
  });return;}
  if(name==='ATTSYNC'){const sync=name=>done(B.syncAttributes(doc(),name),'Block attributes synchronized.');if(rest)sync(rest);else askName('ATTSYNC — block name',sync);return;}
  if(name==='DIMSTYLE'){
   const [action,...arg]=rest.split(/\s+/),styleName=arg.join(' ');
   if(['COPY','PRESET'].includes(action.toUpperCase())){const [source,newName]=styleName.split('|').map(x=>x.trim());if(!source||!newName)throw Error('Use DIMSTYLE '+action.toUpperCase()+' Source|New name');D.style(doc(),action,source,{newName});ctx.changed(ids(),'Dimension style created.');return;}
   if(action.toUpperCase()==='PRESETS'){ctx.log(JSON.stringify(D.style(doc(),'PRESETS')));return;}
   if(action.toUpperCase()==='RENAME'){const [oldName,newName]=styleName.split('|').map(x=>x.trim());if(!newName)throw Error('Use DIMSTYLE RENAME Old name|New name');D.style(doc(),'RENAME',oldName,{newName});ctx.changed(ids(),'Dimension style renamed.');return;}
   if(['SETCURRENT','DELETE','RENAME','APPLY','LIST'].includes(action.toUpperCase())){const result=D.style(doc(),action.toUpperCase(),styleName,{ids:ids()});ctx.changed(ids(),typeof result==='object'?JSON.stringify(result):'Dimension style updated.');return;}
   dimStyleForm(rest||doc().resources?.currentDimStyle||'Standard');return;
  }
  if(name==='DIMCONTINUE'||name==='DIMBASELINE'){
   const tokens=rest.trim().split(/\s+/).filter(Boolean),automatic=tokens[0]?.toUpperCase()==='AUTO';
   if(tokens.length&&(!automatic||tokens.length>2||name==='DIMCONTINUE'&&tokens.length>1))throw Error(name+': use no options for two-point placement, or AUTO'+(name==='DIMBASELINE'?' [spacing]':''));
   const baselineSpacing=tokens[1]?number(tokens[1],'baseline spacing'):undefined;if(baselineSpacing!=null&&baselineSpacing<0)throw Error('Baseline spacing must be nonnegative.');
   acquire(name,()=>{const ref=selectedOne(e=>e.kind==='dimension');
    if(!automatic){stage(name,name+': next feature point, then dimension placement.',2,p=>done(D.continueDimension(doc(),ref.id,p[0],p[1],{baseline:name==='DIMBASELINE'})));return;}
    let previous=ref.id;const edits=[];let last=doc().serialize();
    const next=()=>stage(name,name+' AUTO: pick next feature; U undo; Enter/Esc finish.',1,p=>{
     const id=D.continueDimension(doc(),previous,p[0],null,{baseline:name==='DIMBASELINE',baselineSpacing})[0];edits.push({before:previous,id});previous=id;last=doc().serialize();ctx.changed([id],'Dimension added. Continue picking features, U undo, Enter/Esc finish.');next();
    },{basePoint:clone(doc().entities.find(e=>e.id===previous).points[name==='DIMBASELINE'?0:1]),finish:()=>{state=null;refresh();ctx.log('Automatic dimension chain finished.');},localUndo:()=>{if(!edits.length){ctx.log('No dimensions in this chain to undo.');return;}if(doc().serialize()!==last)throw Error('Another document change intervened. Finish this chain before using history Undo.');if(!doc().undo())throw Error('No more dimension history is available.');previous=edits.pop().before;last=doc().serialize();ctx.changed([previous],'Last chained dimension undone.');next();}});
    next();
   });return;
  }
  if(name==='DIMORDINATE'){dialog('DIMORDINATE',[{name:'axis',label:'Measured coordinate',options:['X','Y']}],v=>stage(name,'DIMORDINATE: datum origin, feature point, label location.',3,p=>done(D.ordinate(doc(),p[0],p[1],p[2],v.axis))));return;}
  if(name==='DIMEDIT'){acquire(name,()=>dialog('DIMEDIT',[{name:'action',label:'Operation',options:['TEXT','POSITION','RESET']},{name:'text',label:'Text override (<> = measurement)',value:'<>'}],v=>{if(v.action==='POSITION')stage(name,'DIMEDIT: pick new dimension placement.',1,p=>done(D.edit(doc(),ids(),'POSITION',p[0])));else done(D.edit(doc(),ids(),v.action,v.text));}));return;}
  if(name==='QLEADER'||name==='MLEADER'){stage(name,name+': arrow tip, bend point, then text location.',3,p=>{state={name,stage:'leadertext',points:p,prompt:name+': enter the leader text.'};refresh();});return;}
  if(name==='MLEADEREDIT'){acquire(name,()=>{const e=selectedOne(e=>e.subtype==='leader');dialog('MLEADEREDIT',[{name:'action',label:'Operation',options:['TEXT','POSITION','ADD','REMOVE']},{name:'text',label:'Text',value:e.data.text||''},{name:'index',label:'Arm index (zero based)',type:'number',value:0}],v=>{if(v.action==='TEXT')done(D.editLeader(doc(),e.id,'TEXT',v.text));else if(v.action==='REMOVE')done(D.editLeader(doc(),e.id,'REMOVE',number(v.index,'index')));else stage(name,v.action==='ADD'?'Pick new leader arrow tip, then bend point.':'Pick new text location.',v.action==='ADD'?2:1,p=>done(D.editLeader(doc(),e.id,v.action,v.action==='ADD'?p:p[0])));});});return;}
 }
 function updateBlockBanner(){let banner=document.getElementById('block-edit-banner');if(!banner){banner=document.createElement('div');banner.id='block-edit-banner';banner.className='block-edit-banner';document.querySelector('.work-area').prepend(banner);}banner.replaceChildren();banner.hidden=!blockSession;if(blockSession){const text=document.createElement('span');text.textContent='BLOCK EDIT — changes are staged until saved. ';const save=document.createElement('button');save.textContent='Save block';save.onclick=()=>run(()=>start('BCLOSE','SAVE'));const cancel=document.createElement('button');cancel.textContent='Discard';cancel.onclick=()=>run(()=>start('BCLOSE','CANCEL'));banner.append(text,save,cancel);}}
 function accept(p){if(!state||state.stage==='select'||state.stage==='leadertext')return false;const active=state,previous=state.points.map(clone);state.points.push({...p});try{if(state.points.length>=state.count){const action=state.action,values=state.points.map(clone);action(values);}else refresh();return true;}catch(error){if(state===active)state.points=previous;refresh();throw error;}}
 function finish(){if(!state)return false;if(state.stage==='select'){if(!ids().length)throw Error('Select at least one editable object.');const after=state.after;state.stage='ready';after();return true;}if(state.finish){const action=state.finish,p=state.points.map(clone);action(p);return true;}ctx.log('Complete the requested points, or Esc to cancel.',true);return true;}
 function execute(raw){const split=N.commandSplit(raw);if(state?.stage==='leadertext'){done(D.leader(doc(),[[state.points[0],state.points[1],state.points[2]]],state.points[2],raw,D.currentStyle(doc())),'Leader created.');return true;}
  if(names.includes(split.name)){start(split.name,split.rest);return true;}
  if(!state)return false;
  if(state.localUndo&&['U','UNDO'].includes(split.name)&&!split.rest){state.localUndo();return true;}
  if(state.stage==='select'){if(['ALL','A'].includes(split.name)){ctx.selectAll();return true;}throw Error('Select objects, then Enter.');}
  const point=ctx.parsePoint?ctx.parsePoint(raw,state.points.at(-1)||null):N.parsePoint(raw,state.points.at(-1)||null);if(point){if(ctx.acceptPoint)ctx.acceptPoint(point);else accept(point);return true;}throw Error('This command expects a point as x,y, or Esc to cancel.');
 }
 function addToolbar(){const group=document.createElement('details');group.className='tool-group';const summary=document.createElement('summary');summary.textContent='Advanced 2D';group.append(summary);const grid=document.createElement('div');grid.className='tool-grid';for(const name of ['STRETCH','BREAK','LENGTHEN','ALIGN','PEDIT','SPLINE','SPLINEDIT','OVERKILL','EXPLODE','HATCH','HATCHEDIT','BOUNDARY','REGION','BLOCK','INSERT','BEDIT','REFEDIT','WBLOCK','ATTDEF','ATTEDIT','DIMSTYLE','DIMCONTINUE','DIMBASELINE','DIMORDINATE','DIMEDIT','QLEADER','MLEADER','MLEADEREDIT','OSNAPSET']){const b=document.createElement('button');b.type='button';b.dataset.advanced=name;b.textContent=name;b.title=name;b.onclick=()=>run(()=>start(name,''));grid.append(b);}group.append(grid);document.querySelector('.tools').append(group);}
 addToolbar();
 return{get textInput(){return state?.stage==='leadertext';},execute,acceptPoint:accept,finish,cancel(){state=null;refresh();},get active(){return !!state;},get acquiring(){return state?.stage==='select';},get prompt(){return state?.prompt||'';},get name(){return state?.name||'';},get basePoint(){return state?.basePoint||state?.points.at(-1)||null;},get snapModes(){return [...snapModes];},get blockEditing(){return !!blockSession;},guardReplace(){if(blockSession){ctx.log('Save or discard the block edit with BCLOSE before opening another drawing.',true);return false;}return true;},preview(){return state?.points.length>1?[{kind:'polyline',points:state.points,closed:false}]:[];},dialog};
}};
})(typeof globalThis!=='undefined'?globalThis:this);
