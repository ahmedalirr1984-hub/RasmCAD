/* Pure polar and orthogonal acquisition tracking. No model mutation. */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory();else root.RasmTracking=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function constrain(cursor,base,anchors,aperture,increment=0){
 let x=null,y=null;for(const a of anchors){if(Math.abs(cursor.x-a.x)<=aperture&&(!x||Math.abs(cursor.x-a.x)<Math.abs(cursor.x-x.x)))x=a;if(Math.abs(cursor.y-a.y)<=aperture&&(!y||Math.abs(cursor.y-a.y)<Math.abs(cursor.y-y.y)))y=a;}
 if(x||y)return{point:{x:x?x.x:cursor.x,y:y?y.y:cursor.y},type:'tracking',anchors:[...new Set([x,y].filter(Boolean))]};
 if(base&&increment>0){const dx=cursor.x-base.x,dy=cursor.y-base.y,r=Math.hypot(dx,dy),step=increment*Math.PI/180,a=Math.round(Math.atan2(dy,dx)/step)*step,ux=Math.cos(a),uy=Math.sin(a),along=dx*ux+dy*uy;if(r>0&&along>=0&&Math.abs(dx*uy-dy*ux)<=aperture)return{point:{x:base.x+along*ux,y:base.y+along*uy},type:'polar',anchors:[base],angle:a};}
 return null;
}
return Object.freeze({constrain});
});
