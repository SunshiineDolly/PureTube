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
 const personal={version:1,profileName:'Private viewer',profileBio:'Private biography',follows:[creator],favorites:[video],later:[video],history:{[video]:123},collections:[{name:'Private playlist',ids:[video]}],progress:{[video]:{at:10,duration:100,updated:123}},interests:{private:100},viewing:{[video]:{seconds:20,at:123}},liveReminders:{[video]:{title:'Private event',at:Date.now()+600000}},settings:{intro:false,tray:false,themedCursor:false,keywords:[]},savedVideos:{[video]:{id:video,title:'Private saved video',channel:'Private creator',channelId:creator,image:'',description:'',date:'',duration:100}}};
 const guest={version:1,settings:{intro:false,tray:false,themedCursor:false}};
 window.fixture={data:signedOut?guest:personal,personal};
 window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>0,unregisterCallback:()=>{},invoke:async(cmd,args={})=>{
  if(cmd==='watch_creator')return {id:creator,name:'Example creator',title:'Example video',description:'Video description',date:'2026-11-21',live:false,embeddable:true};
  if(cmd==='related_videos')return [];
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
 await call('Network.enable');await call('Network.setBlockedURLs',{urls:['https://www.youtube.com/*','https://s.ytimg.com/*','https://i.ytimg.com/*']});
 await value('(()=>{const input=document.querySelector(".searchbar input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,"https://www.youtube.com/watch?v=jNQXAC9IVRw");input.dispatchEvent(new Event("input",{bubbles:true}))})()');await value('document.querySelector(".searchbar").requestSubmit()');
 await eventually(()=>value('!!document.querySelector(".collection-saver summary")'));
 await value('document.querySelector(".collection-saver summary").click()');
 await eventually(()=>value('!!document.querySelector(".collection-saver[open] select")'));
 const click=label=>value('[...document.querySelectorAll(".collection-saver button")].find(b=>b.textContent==='+JSON.stringify(label)+').click()');
 const text=()=>value('document.querySelector(".playlist-saver-body").textContent');
 assert((await text()).includes('Remove from playlist'));
 await click('Remove from playlist');await eventually(async()=>(await text()).includes('Add to playlist'));
 await click('Add to playlist');await eventually(async()=>(await text()).includes('This video is saved'));
 await click('New playlist');await eventually(()=>value('!!document.querySelector(".collection-saver input")'));
 assert.equal(await value('!!document.querySelector(".collection-saver select")'),false);
 const type=name=>value('(()=>{const input=document.querySelector(".collection-saver input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,'+JSON.stringify(name)+');input.dispatchEvent(new Event("input",{bubbles:true}))})()');
 await type('Private playlist');await value('document.querySelector(".collection-saver form").requestSubmit()');await eventually(async()=>(await text()).includes('already exists'));
 await type('Weekend watching');await value('document.querySelector(".collection-saver form").requestSubmit()');
 await eventually(()=>value('document.querySelector(".collection-saver select")?.value==="Weekend watching"'));
 assert((await text()).includes('This video is saved'));
 await click('New playlist');await click('Cancel');assert.equal(await value('document.querySelector(".collection-saver select").value'),'Weekend watching');
 for(const [width,height] of [[820,560],[1280,720]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await wait(100);
  assert(await value('(()=>{const box=document.querySelector(".collection-saver");return box.scrollWidth<=box.clientWidth+1})()'));
 }
 await value('document.querySelector(".collection-saver").scrollIntoView({block:"center"})');await call('Page.captureScreenshot',{format:'png'}).then(r=>writeFileSync('artifacts/playlist-saver-ui.png',Buffer.from(r.data,'base64')));
 report.chooseAndCreateSeparated=true;report.addAndRemoveWork=true;report.createAndSaveWorks=true;report.duplicateNamesExplained=true;report.cancelPreservesSelection=true;report.smallWindowFits=true;writeFileSync('artifacts/playlist-saver-verification.json',JSON.stringify(report,null,2));console.log(report);
} finally {
 try{await call('Browser.close')}catch{child.kill()}
 ws?.close()
 await new Promise(ok=>web.close(ok))
 await wait(500)
 assert(root.startsWith(join(process.env.TEMP,'puretube-features-')))
 rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:300})
}
