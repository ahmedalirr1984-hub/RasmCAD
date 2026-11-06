/* Workspace navigation and command reference. Drawing uses the existing command form. */
(function(root){'use strict';
const workflows=[
 ['LINE','Draw','Start point → next point or length. U removes a segment; C closes; Enter finishes.'],
 ['PLINE','Draw','Pick connected vertices, use U or C, then Enter to commit the path.'],
 ['CIRCLE','Draw','Center and radius, diameter, 2P or 3P. Choose the method before the required points.'],
 ['ARC','Draw','CENTER uses center/start/end direction. Enter 3P first for three circumference points.'],
 ['RECTANGLE','Draw','Choose opposite corners, or enter D after the first corner for width and height.'],
 ['MOVE','Modify','Select objects → base point → destination. D uses a displacement vector.'],
 ['COPY','Modify','S / M chooses Single / Multiple. A creates an Array; count includes the original. F fits the span. U undoes.'],
 ['ROTATE','Modify','Select objects → pivot → angle. R defines a reference angle, then a target angle.'],
 ['SCALE','Modify','Select objects → base point → factor. R defines a reference length, then a target length.'],
 ['MIRROR','Modify','KEEP or DELETE chooses source handling before the two-point mirror axis. Default: Keep.'],
 ['TRIM','Modify','Choose boundaries or use visible geometry, then pick the parts to remove. U undoes the last edit.'],
 ['EXTEND','Modify','Choose boundaries, then pick the endpoints to extend. Enter finishes repeated edits.'],
 ['OFFSET','Modify','Select source geometry → distance or prompted construction → side point.'],
 ['FILLET','Modify','Enter the radius, then pick two supported edges near the desired corner.'],
 ['CHAMFER','Modify','Enter setbacks or the supported angle option, then pick the corner edges.'],
 ['MATCHPROP','Modify','Pick a source object and apply compatible properties to target objects.'],
 ['DIMSTYLE','Annotate','Manage named dimension styles; set annotation size, colors, arrows and precision.'],
 ['OSNAPSET','Draw','Configure exact object snaps. F3 toggles running snaps; END / MID / CEN / INT are one-shot overrides.'],
 ['PLOT','Output','Choose the plotted geometry, paper, physical scale and PDF or printer output.'],
 ['SAVEAS','Output','Choose a file name and supported format. Keep a native project for full editable data.']
];
function start(){
 const doc=root.document,active=doc.getElementById('active-command'),name=doc.getElementById('workflow-name'),guide=doc.getElementById('workflow-guide'),reference=doc.getElementById('workflow-reference');
 if(!active||!reference)return;
 const tabs=[...doc.querySelectorAll('[data-workspace-tab]')],groups=[...doc.querySelectorAll('[data-workspace-group]')];
 function focusGroup(group){for(const b of tabs){const on=b.dataset.workspaceTab===group;b.classList.toggle('is-current',on);b.setAttribute('aria-pressed',String(on));}const found=groups.find(g=>g.dataset.workspaceGroup===group);if(found){found.open=true;found.scrollIntoView({block:'nearest'});}else if(group==='output'){doc.getElementById('print-btn')?.focus();}}
 for(const tab of tabs)tab.onclick=()=>focusGroup(tab.dataset.workspaceTab);
 const launch=command=>{reference.close();const input=doc.getElementById('command');input.value=command;doc.getElementById('command-form').requestSubmit();input.focus();};
 const list=doc.getElementById('workflow-reference-list');
 for(const [command,group,text]of workflows){const button=doc.createElement('button');button.type='button';button.className='workflow-reference-item';const heading=doc.createElement('strong'),category=doc.createElement('small'),description=doc.createElement('span');heading.textContent=command;category.textContent=group;description.textContent=text;button.append(heading,category,description);button.onclick=()=>launch(command);list.append(button);}
 doc.getElementById('workflow-reference-btn').onclick=()=>reference.showModal();doc.getElementById('workflow-reference-close').onclick=()=>reference.close();
 function update(){const command=active.textContent.trim().split(/[\s·]/)[0];const entry=workflows.find(w=>w[0]===command)||({'POLYLINE':workflows[1],'DIMENSION':workflows[16],'DIMLINEAR':workflows[16],'DIMANGULAR':workflows[16]}[command]);name.textContent=entry?entry[0]:command==='SELECT'?'Selection':command;guide.textContent=entry?entry[2]:command==='SELECT'?'Pick objects or drag a directional selection window. Shift removes from the selection.':'Follow the current command prompt for the next selection, point or option.';if(entry){for(const b of tabs){const on=b.dataset.workspaceTab===entry[1].toLowerCase();b.classList.toggle('is-current',on);b.setAttribute('aria-pressed',String(on));}}}
 new MutationObserver(update).observe(active,{childList:true,characterData:true,subtree:true});update();
}
if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(typeof globalThis!=='undefined'?globalThis:this);
