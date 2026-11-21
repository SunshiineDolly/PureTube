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
 Object.defineProperty(navigator,'platform',{value:localStorage.getItem('preview-platform')??'MacIntel'});
 const media=window.matchMedia.bind(window);window.matchMedia=q=>{const result=media(q);if(q==='(hover:hover)'||q==='(prefers-reduced-motion:reduce)')Object.defineProperty(result,'matches',{value:q==='(hover:hover)'||localStorage.getItem('preview-reduced')==='yes'});return result};
 window.YT={Player:class{constructor(frame,{events}){queueMicrotask(()=>events.onError({data:153}))}destroy(){}mute(){}playVideo(){}}};
 const signedOut=localStorage.getItem('fixture-guest')==='yes';
 const id='discord:1234567890123456',video='jNQXAC9IVRw',creator='UC1234567890123456789012';
 const personal={version:1,profileName:'Private viewer',profileBio:'Private biography',follows:[creator],favorites:[video],later:[video],history:{[video]:123},collections:[{name:'Private playlist',ids:[video]}],progress:{[video]:{at:10,duration:100,updated:123}},interests:{private:100},viewing:{[video]:{seconds:20,at:123}},liveReminders:{[video]:{title:'Private event',at:Date.now()+600000}},settings:{intro:false,tray:false,themedCursor:false,keywords:['private filter']},savedVideos:{[video]:{id:video,title:'Private saved video',channel:'Private creator',channelId:creator,image:'',description:'',date:'',duration:100}}};
 const guest={version:1,settings:{intro:false,tray:false,themedCursor:false}};
 window.fixture={data:signedOut?guest:personal,personal,metadata:0};
 const sample={id:'abcdefghijk',title:'Preview sample',description:'Preview test',metadataComplete:true,channelId:'UC0000000000000000000002',channel:'Example creator',image:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',date:'2026-11-21',duration:120,shorts:false,paid:false,embeddable:true};
 const mode=localStorage.getItem('preview-mode');if(mode==='animated'||mode==='broken')sample.previewImage='https://i.ytimg.com/an_webp/abcdefghijk/'+(mode==='broken'?'broken':'mqdefault_6s')+'.webp';
 window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>0,unregisterCallback:()=>{},invoke:async(cmd,args={})=>{
  if(cmd==='watch_creator'){window.fixture.metadata++;return {id:sample.channelId,name:sample.channel,title:sample.title,embeddable:true,live:false,storyboard:'https://i.ytimg.com/sb/abcdefghijk/storyboard3_L$L/$N.jpg|160#90#50#5#5#2000#M$M#signature'}};
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
  if(cmd==='search_youtube'||cmd==='channel_videos')return {items:[sample],next:null};
  if(cmd==='scheduled_channel')return [];
  if(cmd==='update_configured'||cmd==='plugin:window|is_maximized')return false;
  return null;
 }};
 })()`
 await call('Page.addScriptToEvaluateOnNewDocument',{source:fixture})
 const sheet='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#476783"/></svg>';
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Fetch.requestPaused'){const broken=m.params.request.url.includes('/broken.webp');void call('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:broken?404:200,responseHeaders:[{name:'Content-Type',value:'image/svg+xml'}],body:Buffer.from(broken?'':sheet).toString('base64')}).catch(()=>{})}});
 await call('Fetch.enable',{patterns:[{urlPattern:'https://i.ytimg.com/*'}]});
 await call('Network.enable');await call('Network.setBlockedURLs',{urls:['https://www.youtube.com/*','https://s.ytimg.com/*']});
 await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:'http://127.0.0.1:'+web.address().port})
 await eventually(()=>value('!!document.querySelector(".sidebar [aria-label=Settings]:not(:disabled)")'))
 const hover=async()=>{await eventually(()=>value('!!document.querySelector(".content > div:not([hidden]) .card .thumbnail")'));const p=await value('(()=>{const r=document.querySelector(".content > div:not([hidden]) .card .thumbnail").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');await call('Input.dispatchMouseEvent',{type:'mouseMoved',...p})};
 const leave=()=>call('Input.dispatchMouseEvent',{type:'mouseMoved',x:5,y:5});
 const ready=()=>value('!!document.querySelector(".thumbnail-motion-preview[data-ready=true]")');
 await hover();await eventually(ready);
 assert.equal(await value('document.querySelectorAll(".thumbnail-preview iframe").length'),0);
 const frame=await value('document.querySelector(".thumbnail-motion-preview").dataset.previewFrame');await wait(800);assert.notEqual(await value('document.querySelector(".thumbnail-motion-preview").dataset.previewFrame'),frame);
 await leave();await eventually(()=>value('!document.querySelector(".thumbnail-motion-preview")'));report.macStoryboardMotion=true;report.stopsOnPointerLeave=true;
 async function reload(mode,platform='MacIntel',reduced=false){await leave();await value('localStorage.setItem("preview-mode",'+JSON.stringify(mode)+');localStorage.setItem("preview-platform",'+JSON.stringify(platform)+');localStorage.setItem("preview-reduced",'+JSON.stringify(reduced?'yes':'no')+')');await call('Page.reload');await eventually(()=>value('!!document.querySelector(".sidebar [aria-label=Settings]:not(:disabled)")'));await hover()}
 await reload('animated');await eventually(ready);assert(await value('!!document.querySelector(".thumbnail-motion-preview img")'));assert.equal(await value('window.fixture.metadata'),0);report.macAnimatedImage=true;
 await reload('broken');await eventually(()=>value('!!document.querySelector(".thumbnail-motion-preview[data-preview-frame]")'));assert(await value('window.fixture.metadata')>0);report.failedAnimatedImageFallsBack=true;
 await reload('storyboard','Win32');await eventually(ready);assert.equal(await value('document.querySelectorAll(".thumbnail-preview iframe").length'),1);report.windowsPlayerFailureFallsBack=true;
 await value('window.dispatchEvent(new Event("blur"))');await eventually(()=>value('!document.querySelector(".thumbnail-motion-preview")'));report.stopsWhenWindowBlurs=true;
 await reload('storyboard','MacIntel',true);await wait(1100);assert.equal(await ready(),false);assert.equal(await value('window.fixture.metadata'),0);report.reducedMotionRespected=true;
 writeFileSync('artifacts/thumbnail-preview-verification.json',JSON.stringify(report,null,2));console.log(report);
} finally {
 try{await call('Browser.close')}catch{child.kill()}
 ws?.close()
 await new Promise(ok=>web.close(ok))
 await wait(500)
 assert(root.startsWith(join(process.env.TEMP,'puretube-features-')))
 rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:300})
}
