/* Point-driven selection modes; document mutations remain in the application. */
(function(root){'use strict';root.RasmSelectionTools={mount(ctx){
 let state=null;
 function start(mode,extra={}){ctx.begin?.();state={mode,points:[],...extra};ctx.refresh();ctx.log(mode+': pick '+(mode==='CROSSING'?'two corners.':'points, then Enter. Esc cancels.'));}
 function finish(){if(!state)return false;const s=state,S=root.RasmSelection;let ids;
  if(s.mode==='FENCE'){if(s.points.length<2)throw Error('Fence needs at least two points.');ids=S.fenceSelect(ctx.getDocument(),s.points);}
  else if(s.mode==='CROSSING'){if(s.points.length<2)throw Error('Crossing needs two corners.');ids=S.windowSelect(ctx.getDocument(),s.points[0],s.points[1],true);}
  else{if(s.points.length<3)throw Error('Selection polygon needs at least three points.');ids=S.polygonSelect(ctx.getDocument(),s.points,s.mode==='CPOLYGON');}
  ctx.apply(ids,s);state=null;ctx.refresh();return true;
 }
 function point(p){if(!state)return false;state.points.push({...p});if(state.mode==='CROSSING'&&state.points.length===2)finish();else ctx.refresh();return true;}
 function execute(raw){const split=root.RasmCommands.commandSplit(raw),aliases={F:'FENCE',WP:'WPOLYGON',CP:'CPOLYGON',C:'CROSSING',P:'PREVIOUS'};
  let mode=split.name==='SELECT'?split.rest.toUpperCase():split.name;
  if(ctx.acquiring?.())mode=aliases[mode]||mode;
  if(split.name==='SELECT')mode=aliases[mode]||mode;
  if(['FENCE','WPOLYGON','CPOLYGON','CROSSING'].includes(mode)){start(mode);return true;}
  if(mode==='SELECTPREVIOUS'||mode==='PREVIOUS'){ctx.apply(ctx.getPrevious().filter(id=>ctx.getDocument().entities.some(e=>e.id===id)),{replace:true});ctx.refresh();return true;}
  if(mode==='QSELECT'){
   const doc=ctx.getDocument();ctx.dialog('Quick Select',[{name:'kind',label:'Object type',options:['ALL','line','polyline','circle','arc','text','dimension','compound','solid']},{name:'layer',label:'Layer',options:['ALL',...doc.layers.map(l=>l.name)]},{name:'color',label:'Color hex (blank = any)',value:''},{name:'invert',label:'Exclude matching objects',type:'checkbox',value:false}],v=>{const options={invert:v.invert};if(v.kind!=='ALL')options.kind=v.kind;if(v.layer!=='ALL')options.layer=v.layer;if(v.color.trim())options.color=v.color.trim();ctx.apply(root.RasmSelection.filter(ctx.getDocument(),options),{replace:true});ctx.refresh();});return true;
  }
  if(state){const p=ctx.parsePoint(raw,state.points.at(-1));if(p){point(p);return true;}throw Error('Selection expects a point, Enter to finish or Esc.');}
  return false;
 }
 return{execute,start,point,finish,cancel(){if(!state)return false;state=null;ctx.refresh();return true;},get active(){return !!state;},get prompt(){return state?state.mode+': '+state.points.length+' points; Enter applies, Esc cancels.':'';},preview(p){return state?.points.length?[{kind:'polyline',points:p?[...state.points,p]:state.points,closed:['WPOLYGON','CPOLYGON'].includes(state.mode)}]:[];}};
}};})(typeof globalThis!=='undefined'?globalThis:this);
