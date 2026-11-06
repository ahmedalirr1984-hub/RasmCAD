'use strict';
// Human mouse/keyboard workflows at common Windows display scales. Application
// state is observed only; fixtures are created exclusively through the UI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const phase = process.env.RASMCAD_PHASE || 'after';
const htmlPath = process.env.RASMCAD_HTML || path.join(root, 'dist/RasmCAD-Advanced.html');
const output = path.join(root, 'build/input-v05');
fs.mkdirSync(output, {recursive:true});
const results = [], errors = [], external = [];
let browser, server, origin;
const near = (a,b,t=.7) => assert.ok(Math.abs(a-b)<=t, `${a} is not near ${b}`);
async function state(page) { return page.evaluate(() => ({ tool:RasmCAD.tool, acquiring:RasmCAD.acquiringSelection, selected:RasmCAD.selectedIds, doc:JSON.parse(RasmCAD.document.serialize()), status:document.querySelector('#status-log').textContent, prompt:document.querySelector('#prompt').textContent, focus:document.activeElement?.id })); }
async function command(page, value='') {
  // An empty fill emits Delete, which CAD correctly handles as erase. A real
  // blank Enter must not inject that unrelated synthetic Delete event.
  if(value) await page.locator('#command').fill(value);
  else assert.equal(await page.locator('#command').inputValue(),'');
  await page.locator('#command').press('Enter');
}
async function position(page,p) {
  const q=await page.evaluate(p=>RasmCAD.worldToScreen(p),p), b=await page.locator('#canvas').boundingBox();
  assert.ok(b&&q.x>0&&q.x<b.width&&q.y>0&&q.y<b.height,`point must be visible: ${JSON.stringify({p,q,b})}`);
  return {x:b.x+q.x,y:b.y+q.y};
}
async function point(page,p,options) {const q=await position(page,p);await page.mouse.click(q.x,q.y,options);}
async function preview(page,p) {const q=await position(page,p);await page.mouse.move(q.x,q.y);}
async function line(page,a={x:180,y:240},b={x:300,y:240}) {
  await command(page,'LINE');await command(page,`${a.x},${a.y}`);await command(page,`${b.x},${b.y}`);await command(page);
}
async function fresh(context) {
  const page=await context.newPage();page.setDefaultTimeout(6000);
  page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin,{waitUntil:'load'});await page.waitForFunction(()=>!!window.RasmCAD);
  if(await page.locator('#snap-btn').getAttribute('aria-pressed')==='true')await page.locator('#snap-btn').click();
  return page;
}
async function test(context,dpr,name,fn) {
  if(process.env.RASMCAD_TEST_PATTERN&&!new RegExp(process.env.RASMCAD_TEST_PATTERN,'i').test(name))return;
  const page=await fresh(context);const id=`${phase}-dpr${dpr}-${String(results.length+1).padStart(2,'0')}`;
  try {const details=await fn(page);results.push({dpr,name,status:'PASS',details});console.log(`PASS DPR ${dpr}: ${name}`);}
  catch(e) {let s=null;try{s=await state(page);}catch(_){}await page.screenshot({path:path.join(output,id+'.png'),fullPage:true}).catch(()=>{});results.push({dpr,name,status:'FAIL',error:e.message,state:s,screenshot:id+'.png'});console.log(`FAIL DPR ${dpr}: ${name}: ${e.message}`);}
  finally {await page.close();}
}
(async()=>{
  const html=fs.readFileSync(htmlPath),metadata={phase,htmlPath,sha256:crypto.createHash('sha256').update(html).digest('hex'),htmlBytes:html.length,htmlTitle:html.toString('utf8',0,4096).match(/<title>([^<]+)<\/title>/)?.[1]};
  console.log(JSON.stringify(metadata));server=http.createServer((req,res)=>{if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  for(const dpr of (process.env.RASMCAD_DPRS||'1,1.25,1.5,2').split(',').map(Number)){
    const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:dpr,acceptDownloads:true});
    await context.route('**/*',route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();external.push(route.request().url());return route.abort('blockedbyclient');});
    await test(context,dpr,'first command history and prompts keep canvas layout and world projection stable',async page=>{
      const record=()=>page.evaluate(()=>{const b=document.querySelector('#canvas').getBoundingClientRect();return{left:b.left,top:b.top,width:b.width,height:b.height,projected:RasmCAD.worldToScreen({x:220,y:240})};});
      const initial=await record(),records=[initial];
      await command(page,'LINE');records.push(await record());
      await command(page,'180,240');await command(page,'@100,0');records.push(await record());
      await command(page);await page.keyboard.press('Escape');await page.waitForTimeout(40);records.push(await record());
      for(const r of records.slice(1)){for(const key of ['left','top','width','height'])near(r[key],initial[key],.1);near(r.projected.x,initial.projected.x,.1);near(r.projected.y,initial.projected.y,.1);}
      return records;
    });
    await test(context,dpr,'two-click LINE ends with Enter and remains selectable',async page=>{
      await page.locator('[data-tool="line"]').click();await point(page,{x:180,y:240});await point(page,{x:300,y:240});
      assert.equal((await state(page)).focus,'command');await page.keyboard.press('Enter');
      let s=await state(page);assert.equal(s.tool,'select');assert.equal(s.doc.entities.length,1);near(s.doc.entities[0].points[1].x,300);
      await point(page,{x:220,y:240});s=await state(page);assert.equal(s.selected.length,1);
    });
    await test(context,dpr,'LINE scalar length follows canvas cursor direction',async page=>{
      await command(page,'LINE');await point(page,{x:180,y:240});await preview(page,{x:300,y:240});await command(page,'100');
      let s=await state(page);assert.equal(s.doc.entities.length,1,'numeric length must create an actual LINE segment');near(s.doc.entities[0].points[0].x,180);near(s.doc.entities[0].points[1].x,280);near(s.doc.entities[0].points[1].y,240);
      await page.keyboard.press('Escape');s=await state(page);assert.equal(s.tool,'select');assert.equal(s.doc.entities.length,1,'Esc must not discard the committed numeric segment');
    });
    await test(context,dpr,'Escape cancels an unconfirmed LINE hover preview',async page=>{
      await command(page,'LINE');await point(page,{x:180,y:240});await preview(page,{x:300,y:240});await page.keyboard.press('Escape');
      const s=await state(page);assert.equal(s.tool,'select');assert.equal(s.doc.entities.length,0,'Esc cancels an unconfirmed hover preview');
    });
    await test(context,dpr,'Escape cancels an unconfirmed CIRCLE hover preview',async page=>{
      await command(page,'CIRCLE');await point(page,{x:250,y:240});await preview(page,{x:310,y:240});await page.keyboard.press('Escape');
      const s=await state(page);assert.equal(s.tool,'select');assert.equal(s.doc.entities.length,0,'Esc cancels an unconfirmed hover preview');
    });
    for(const tool of ['LINE','CIRCLE','RECTANGLE'])await test(context,dpr,`${tool} single press-drag-release commits geometry and Escape keeps it`,async page=>{
      await command(page,tool);const a=await position(page,{x:220,y:240}),b=await position(page,{x:320,y:300});
      await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();
      let s=await state(page);assert.equal(s.doc.entities.length,1,'releasing the drag must commit the visible geometry');
      await page.keyboard.press('Escape');s=await state(page);assert.equal(s.tool,'select');assert.equal(s.doc.entities.length,1,'Escape after drag release must keep completed geometry');
      const e=s.doc.entities[0];assert.equal(e.kind,tool==='LINE'?'line':tool==='CIRCLE'?'circle':'polyline');
      near(e.points[0].x,220);near(e.points[0].y,240);
      if(tool==='CIRCLE')near(e.radius,Math.hypot(100,60));else if(tool==='LINE'){near(e.points[1].x,320);near(e.points[1].y,300);}else assert.equal(e.points.length,4);
      await point(page,tool==='CIRCLE'?{x:220+Math.hypot(100,60),y:240}:tool==='LINE'?{x:270,y:270}:{x:270,y:240});
      assert.equal((await state(page)).selected.length,1,'the completed dragged object must be selectable for modification');
    });
    await test(context,dpr,'numeric CIRCLE radius Enter executes once and remains selectable',async page=>{
      await command(page,'CIRCLE');await point(page,{x:250,y:240});await command(page,'37.5');
      let s=await state(page);assert.equal(s.tool,'select');assert.equal(s.doc.entities.length,1);near(s.doc.entities[0].radius,37.5,.0001);
      await point(page,{x:287.5,y:240});s=await state(page);assert.equal(s.selected.length,1,'click on circle circumference must select it');
    });
    await test(context,dpr,'typed absolute and relative coordinates preserve connected geometry',async page=>{
      await command(page,'LINE');await command(page,'180,240');await command(page,'@120,0');await command(page,'@0,80');await page.keyboard.press('Escape');
      const s=await state(page);assert.equal(s.tool,'select');assert.equal(s.doc.entities.length,2);near(s.doc.entities[1].points[0].x,300,.001);near(s.doc.entities[1].points[1].y,320,.001);
    });
    for(const edit of ['MOVE','COPY','MIRROR'])await test(context,dpr,`${edit} command-first mouse selection Enter accepts objects`,async page=>{
      await line(page);await page.keyboard.press('Escape');await command(page,edit);assert.equal((await state(page)).acquiring,true);
      await point(page,{x:220,y:240});let s=await state(page);assert.equal(s.selected.length,1,`${edit} must pick the visible object`);await page.keyboard.press('Enter');
      s=await state(page);assert.equal(s.acquiring,false,'selection Enter must advance exactly one command stage');assert.equal(s.tool,edit.toLowerCase());
      if(edit==='MIRROR'){await command(page,'350,100');await command(page,'350,400');}
      else {await command(page,'180,240');await command(page,'@50,30');}
      if(edit==='COPY'){assert.equal((await state(page)).tool,'copy');await command(page);}
      s=await state(page);assert.equal(s.tool,'select');assert.equal(s.doc.entities.length,edit==='MOVE'?1:2);
      const e=s.doc.entities.at(-1);near(e.points[0].x,edit==='MIRROR'?520:230,.001);near(e.points[0].y,edit==='MIRROR'?240:270,.001);
    });
    await test(context,dpr,'rapid double-click finishes LINE without duplicate or lost segment',async page=>{
      await command(page,'LINE');await point(page,{x:180,y:240});const q=await position(page,{x:300,y:240});await page.mouse.dblclick(q.x,q.y,{delay:30});
      const s=await state(page);assert.equal(s.tool,'select');assert.equal(s.doc.entities.length,1);near(s.doc.entities[0].points[1].x,300);
    });
    await test(context,dpr,'nearby endpoint with browser double-click count still commits a short LINE',async page=>{
      await command(page,'LINE');await point(page,{x:220,y:240});await point(page,{x:223,y:240},{clickCount:2});
      const s=await state(page);assert.equal(s.doc.entities.length,1,'the endpoint must be accepted before handling double-click completion');near(s.doc.entities[0].points[1].x,223);
    });
    await test(context,dpr,'canvas backing pixels and picking remain aligned after viewport resize',async page=>{
      await line(page);const records=[];
      for(const size of [{width:1440,height:1000},{width:1240,height:820},{width:1600,height:1080}]){
        await page.setViewportSize(size);await page.waitForTimeout(80);
        const c=await page.locator('#canvas').evaluate(el=>{const b=el.getBoundingClientRect();return{width:el.width,height:el.height,cssWidth:b.width,cssHeight:b.height,dpr:devicePixelRatio};});records.push(c);
        near(c.width,c.cssWidth*dpr,1.1);near(c.height,c.cssHeight*dpr,1.1);near(c.dpr,dpr,.001);
        const samples=await page.evaluate(()=>{
          const canvas=document.querySelector('#canvas'),ctx=canvas.getContext('2d'),out=[];
          for(let x=190;x<=290;x+=10){const s=RasmCAD.worldToScreen({x,y:240}),px=Math.round(s.x*devicePixelRatio),py=Math.round(s.y*devicePixelRatio),data=ctx.getImageData(px-2,py-2,5,5).data;let brightest=0;for(let i=0;i<data.length;i+=4)brightest=Math.max(brightest,data[i]+data[i+1]+data[i+2]);out.push({x,brightest});}return out;
        });
        c.strokeSamples=samples;assert.ok(samples.every(p=>p.brightest>300),'each interior part of the displayed line must contain rendered stroke pixels');
        await page.keyboard.press('Escape');await point(page,{x:220,y:240});assert.equal((await state(page)).selected.length,1,'picking must use displayed CSS coordinates after resize');
      }return records;
    });
    await test(context,dpr,'native Save project download and file-input reopen preserve editable geometry',async page=>{
      await line(page);
      await command(page,'CIRCLE');await point(page,{x:350,y:200});await preview(page,{x:390,y:200});await command(page,'40');
      const original=(await state(page)).doc;
      const pending=page.waitForEvent('download');await page.locator('#save-btn').click();const download=await pending;
      const savedPath=path.join(output,`${phase}-dpr${dpr}-saved.rasm.json`);await download.saveAs(savedPath);assert.equal(await download.failure(),null);
      const saved=JSON.parse(fs.readFileSync(savedPath,'utf8'));assert.deepEqual(saved.entities,original.entities);assert.deepEqual(saved.layers,original.layers);
      await page.locator('#new-btn').click();await page.waitForFunction(()=>RasmCAD.document.entities.length===0);
      await page.locator('#file-input').setInputFiles(savedPath);await page.waitForFunction(()=>RasmCAD.document.entities.length===2);
      const reopened=(await state(page)).doc;assert.deepEqual(reopened.entities,original.entities);assert.deepEqual(reopened.layers,original.layers);
      await point(page,{x:220,y:240});assert.equal((await state(page)).selected.length,1,'reopened object must remain selectable');
      await command(page,'MOVE');await command(page,'180,240');await command(page,'@25,10');const edited=(await state(page)).doc;
      near(edited.entities[0].points[0].x,205,.001);near(edited.entities[0].points[0].y,250,.001);
      return {download:download.suggestedFilename(),savedPath:path.relative(root,savedPath),entities:reopened.entities.length};
    });
    await context.close();
  }
  const summary={...metadata,browser:await browser.version(),tests:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,pageErrors:errors,externalRequests:external,results};
  fs.writeFileSync(path.join(output,`${phase}-results.json`),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({phase,tests:summary.tests,passed:summary.passed,failed:summary.failed,pageErrors:errors,externalRequests:external}));
  await browser.close();await new Promise(resolve=>server.close(resolve));if(summary.failed||errors.length||external.length)process.exitCode=1;
})().catch(async error=>{console.error(error);if(browser)await browser.close();if(server)server.close();process.exitCode=1;});
