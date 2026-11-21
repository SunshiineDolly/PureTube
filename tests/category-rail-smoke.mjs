import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {resolve,join,extname,sep} from 'node:path'
import http from 'node:http'
import {setTimeout as wait} from 'node:timers/promises'
import net from 'node:net'

// Deterministic frontend stress test in a fresh browser profile. No user data or public requests.
const root=mkdtempSync(join(process.env.TEMP,'puretube-features-'))
const web=http.createServer(async(req,res)=>{
 const path=resolve('dist','.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));
 if(!path.startsWith(resolve('dist')+sep)){res.writeHead(404).end();return}
 try{const {readFile}=await import('node:fs/promises');const data=await readFile(path);res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[extname(path)]??'application/octet-stream');res.end(data)}catch{res.writeHead(404).end()}
}).listen(0,'127.0.0.1');await new Promise(ok=>web.once('listening',ok));
const server=net.createServer().listen(0,'127.0.0.1');await new Promise(ok=>server.once('listening',ok));const port=server.address().port;await new Promise(ok=>server.close(ok))
const edge=process.env.EDGE_EXE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const child=spawn(edge,['--headless=new','--no-first-run','--disable-extensions','--disable-background-networking','--remote-debugging-port='+port,'--user-data-dir='+root,'about:blank'],{stdio:'ignore'})
let ws,seq=0
async function eventually(task,ms=40000){let last;const until=Date.now()+ms;while(Date.now()<until){try{const answer=await task();if(answer)return answer}catch(e){last=e}await wait(200)}throw Error('Feature check timed out'+(last?': '+last.message:''))}
async function pages(){return (await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(1500)})).json()}
async function connect(target){const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((ok,no)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',no,{once:true})});return socket}
function call(method,params={},socket=ws){const id=++seq;return new Promise((ok,no)=>{const timer=setTimeout(()=>{socket.removeEventListener('message',receive);no(Error('CDP timed out: '+method))},25000);function receive(e){const m=JSON.parse(e.data);if(m.id!==id)return;clearTimeout(timer);socket.removeEventListener('message',receive);m.error?no(Error(m.error.message)):ok(m.result)}socket.addEventListener('message',receive);socket.send(JSON.stringify({id,method,params}))})}
async function value(expression,socket=ws){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},socket);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.exception?.value??expression);return r.result.value}
const navigate=name=>value(`document.querySelector('.sidebar [aria-label=${JSON.stringify(name)}]').click()`)

try {
 ws=await connect(await eventually(async()=>(await pages()).find(p=>p.type==='page')))
 const report={usedIsolatedProfile:true,realLibraryTouched:false,fixtureOnly:true}
 await call('Page.enable')
 const fixture=`(()=>{
 const signedOut=localStorage.getItem('fixture-guest')==='yes';
 const id='discord:1234567890123456',video='jNQXAC9IVRw',creator='UC1234567890123456789012';
 const personal={version:1,profileName:'Private viewer',profileBio:'Private biography',follows:[creator],favorites:[video],later:[video],history:{[video]:123},collections:[{name:'Private playlist',ids:[video]}],progress:{[video]:{at:10,duration:100,updated:123}},interests:{private:100},viewing:{[video]:{seconds:20,at:123}},liveReminders:{[video]:{title:'Private event',at:Date.now()+600000}},settings:{intro:false,tray:false,themedCursor:false,keywords:['private filter']},savedVideos:{[video]:{id:video,title:'Private saved video',channel:'Private creator',channelId:creator,image:'',description:'',date:'',duration:100}}};
 const guest={version:1,settings:{intro:false,tray:false,themedCursor:false}};
 window.fixture={data:signedOut?guest:personal,personal};
 window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>0,unregisterCallback:()=>{},invoke:async(cmd,args={})=>{
  if(cmd==='load')return window.fixture.data;
  if(cmd==='library_profile')return signedOut?null:id;
  if(cmd==='account_configured')return true;
  if(cmd==='account_restore')return signedOut?null:{identity:{id,display_name:'Private viewer'},base:personal};
  if(cmd==='account_read')return {revision:1,data:personal};
  if(cmd==='account_write')return true;
  if(cmd==='account_sign_out'){localStorage.setItem('fixture-guest','yes');return null}
  if(cmd==='plugin:app|version')return '0.26.1';
  if(cmd==='plugin:event|listen')return 1;
  if(cmd==='public_feed')return '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Private creator</title></feed>';
  if(cmd==='search_youtube'||cmd==='channel_videos')return {items:[],next:null};
  if(cmd==='scheduled_channel')return [];
  if(cmd==='update_configured'||cmd==='plugin:window|is_maximized')return false;
  return null;
 }};
 })()`
 await call('Page.addScriptToEvaluateOnNewDocument',{source:fixture})
 await call('Page.navigate',{url:'http://127.0.0.1:'+web.address().port})
 await eventually(()=>value('!!document.querySelector(".sidebar [aria-label=Settings]:not(:disabled)")'))
 report.version='0.26.4';report.viewports=[];
 for(const [width,height] of [[820,560],[1024,600],[1280,720],[1622,900],[1920,1080]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await wait(100);
  const layout=await value('(()=>{const bar=document.querySelector(".home-browse-heading"),r=bar.getBoundingClientRect(),chips=[...bar.querySelectorAll("button")],mix=bar.querySelector(".new-mix-button").getBoundingClientRect(),picker=bar.querySelector(".category-picker-trigger").getBoundingClientRect();return {width:innerWidth,wholeChoices:chips.every(c=>{const b=c.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1&&b.top>=r.top-1&&b.bottom<=r.bottom+1}),noOverflow:bar.scrollWidth<=bar.clientWidth+1,noArrows:!bar.querySelector(".carousel-arrow"),pickerPresent:!!bar.querySelector(".category-picker-trigger"),newMixNearby:Math.abs(mix.top-picker.top)>10||mix.left-picker.right<20}})()');
  console.log(layout);assert(layout.wholeChoices&&layout.noOverflow&&layout.noArrows&&layout.pickerPresent&&layout.newMixNearby);report.viewports.push(layout);
  await value('document.querySelector(".home-browse-heading .category-picker-trigger").click()');await eventually(()=>value('!!document.querySelector(".category-popover")'));
  assert(await value('(()=>{const r=document.querySelector(".category-popover").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()'));
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});await eventually(()=>value('!document.querySelector(".category-popover")'));
 }
 await value('document.querySelector(".home-browse-heading .category-picker-trigger").click()');await eventually(()=>value('!!document.querySelector(".category-popover")'));
 await value('[...document.querySelectorAll(".category-menu-grid button")].find(b=>b.textContent==="Space").click()');
 await eventually(()=>value('[...document.querySelectorAll(".home-browse-heading .category-chip[aria-pressed=true]")].some(b=>b.textContent==="Space")'));
 assert.equal(await value('!!document.querySelector(".category-popover")'),false);
 await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});await wait(100);
 await call('Page.captureScreenshot',{format:'png'}).then(r=>writeFileSync('artifacts/category-toolbar-0.26.4.png',Buffer.from(r.data,'base64')));
 await value('document.querySelector(".home-browse-heading .category-picker-trigger").click()');await eventually(()=>value('!!document.querySelector(".category-popover")'));
 await call('Page.captureScreenshot',{format:'png'}).then(r=>writeFileSync('artifacts/category-picker-0.26.4.png',Buffer.from(r.data,'base64')));
 const outside=await value('(()=>{return {x:innerWidth-8,y:innerHeight-8}})()');await call('Input.dispatchMouseEvent',{type:'mousePressed',...outside,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...outside,button:'left',clickCount:1});await eventually(()=>value('!document.querySelector(".category-popover")'));
 report.extraTopicSelectable=true;report.selectedTopicVisible=true;report.escapeAndOutsideDismiss=true;writeFileSync('artifacts/category-bar-verification.json',JSON.stringify(report,null,2));
} finally {
 try{await call('Browser.close')}catch{child.kill()}
 ws?.close()
 await new Promise(ok=>web.close(ok))
 await wait(500)
 assert(root.startsWith(join(process.env.TEMP,'puretube-features-')))
 rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:300})
}
