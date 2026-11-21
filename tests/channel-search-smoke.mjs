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
 const personal={version:1,profileName:'Private viewer',profileBio:'Private biography',follows:[creator],favorites:[video],later:[video],history:{[video]:123},collections:[{name:'Private playlist',ids:[video]}],progress:{[video]:{at:10,duration:100,updated:123}},interests:{private:100},viewing:{[video]:{seconds:20,at:123}},liveReminders:{[video]:{title:'Private event',at:Date.now()+600000}},settings:{intro:false,tray:false,themedCursor:false,keywords:['private filter'],blocked:['UC0000000000000000000003']},savedVideos:{[video]:{id:video,title:'Private saved video',channel:'Private creator',channelId:creator,image:'',description:'',date:'',duration:100}}};
 const guest={version:1,settings:{intro:false,tray:false,themedCursor:false}};
 window.fixture={data:signedOut?guest:personal,personal};
 window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>0,unregisterCallback:()=>{},invoke:async(cmd,args={})=>{
  if(cmd==='search_creators'){
    if(window.fixture.fail)throw Error('Channel search temporarily unavailable');
    if(args.query==='Old name')await new Promise(ok=>setTimeout(ok,800));
    return [{id:'UC0000000000000000000002',name:args.query+' creator',handle:'@matchingcreator'}, {id:creator,name:'Already followed',handle:'@following'}, {id:'UC0000000000000000000003',name:'Blocked creator'}];
  }
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
 await navigate('Manage channels')
 const type=async text=>value('(()=>{const input=document.querySelector(".channel-search-form input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,'+JSON.stringify(text)+');input.dispatchEvent(new Event("input",{bubbles:true}))})()')
 await eventually(()=>value('!!document.querySelector(".channel-search-form input")'))
 assert.equal(await value('[...document.querySelectorAll(".sidebar button")].filter(b=>b.textContent.includes("View all channels")).length'),0)
 await type('Nandi')
 await eventually(()=>value('document.querySelector(".channel-search-results")?.textContent.includes("Nandi creator")'))
 assert(await value('document.querySelector(\'button[aria-label="Following Already followed"]\').disabled'))
 assert(await value('document.querySelector(\'button[aria-label="Blocked Blocked creator"]\').disabled'))
 await value('document.querySelector(\'button[aria-label="Follow Nandi creator"]\').click()')
 await eventually(()=>value('!!document.querySelector(\'button[aria-label="Following Nandi creator"]:disabled\')'))
 await type('Old name');await wait(400);await type('New name')
 await eventually(()=>value('document.querySelector(".channel-search-results")?.textContent.includes("New name creator")'))
 await wait(900)
 assert.equal(await value('document.querySelector(".channel-search-results").textContent.includes("Old name creator")'),false)
 await value('window.fixture.fail=true');await type('Retry name')
 await eventually(()=>value('document.querySelector(".channel-search-results")?.textContent.includes("Try again")'))
 await value('window.fixture.fail=false;document.querySelector(".channel-search-results button").click()')
 await eventually(()=>value('document.querySelector(".channel-search-results")?.textContent.includes("Retry name creator")'))
 await type('');await eventually(()=>value('!document.querySelector(".channel-search-results")'))
 report.channelNameSearch=true;report.followFromResults=true;report.followedAndBlockedStates=true;report.staleResponsesIgnored=true;report.retryWorks=true;report.duplicateSidebarLinkRemoved=true;
 writeFileSync(resolve('artifacts/channel-search-verification.json'),JSON.stringify(report,null,2));console.log(report)
} finally {
 try{await call('Browser.close')}catch{child.kill()}
 ws?.close()
 await new Promise(ok=>web.close(ok))
 await wait(500)
 assert(root.startsWith(join(process.env.TEMP,'puretube-features-')))
 rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:300})
}
