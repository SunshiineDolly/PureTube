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
  const original=async(cmd,args)=>{
   if(cmd==='load')return {version:1,settings:{intro:false,tray:false,themedCursor:false}};
   if(cmd==='account_configured'||cmd==='update_configured')return false;
   if(cmd==='plugin:app|version')return '0.26.0';
   if(cmd==='plugin:event|listen')return 1;
   if(cmd==='plugin:window|is_maximized')return false;
   if(cmd==='account_restore'||cmd==='update_check')return null;
   if(cmd==='feed')return [];
   return null;
  }
  window.__TAURI_INTERNALS__={invoke:original,metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>0,unregisterCallback:()=>{}};
`+
 `

  window.fixture={original,epoch:Date.now(),sources:new Map(),queries:new Set(),calls:0,fail:false,statuses:{},videos:new Map()}
  const f=window.fixture,pixel='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
  function batch(key,filter,cursor){
   if(f.fail)throw Error('Fixture temporarily unavailable')
   f.queries.add(key);f.calls++
   if(!f.sources.has(key))f.sources.set(key,f.sources.size+1)
   const source=f.sources.get(key),page=cursor?Number(cursor.token.split(':').at(-1)):0
   const prefix=filter==='live'?'L':filter==='scheduled'?'S':'D'
   const items=Array.from({length:24},(_,i)=>{
    const n=source*10000+page*100+i,id=prefix+String(n).padStart(10,'0')
    const v={id,title:'Explore fixture '+n,description:'Public fixture metadata',metadataComplete:true,channelId:'UC'+String(n%96).padStart(22,'0'),channel:'Fixture creator '+(n%96),image:pixel,channelImage:pixel,date:'2026-11-20',duration:filter==='all'||filter==='latest'?120:0,shorts:false,paid:false,embeddable:true,live:filter==='live',upcoming:filter==='scheduled',scheduledAt:filter==='scheduled'?f.epoch+((n%48)+1)*60000:undefined}
    f.videos.set(id,v);return v
   })
   return {items,next:page<2?{token:source+':'+(page+1),version:'2.20261120.00.00'}:null}
  }
  window.__TAURI_INTERNALS__.invoke=async(cmd,args={})=>{
   if(cmd==='search_youtube')return batch(args.query+':'+args.filter,args.filter,args.cursor)
   if(cmd==='scheduled_channel')return batch(args.channel,'scheduled',null).items.slice(0,4)
   if(cmd==='creator_photo'||cmd==='channel_live')return null
   if(cmd==='live_status'){const video=f.videos.get(args.id);return {status:f.statuses[args.id]??(video?.upcoming?'waiting':'live'),start:video?.scheduledAt?new Date(video.scheduledAt).toISOString():undefined}}
   return original(cmd,args)
  }
 })()`
 await call('Page.addScriptToEvaluateOnNewDocument',{source:fixture})
 await call('Page.navigate',{url:'http://127.0.0.1:'+web.address().port})
 await eventually(()=>value('!!document.querySelector(".sidebar [aria-label=Discover]:not(:disabled)")'))
 assert(await value('window.fixture.calls')>0,'fixture must be installed before frontend loads')
 const discoverCount=()=>value('document.querySelectorAll(".content > div:not([hidden]) .studio-discover.recommendations .card").length')
 await navigate('Discover')
 await eventually(async()=>await discoverCount()>30)
 for(let n=0;n<100&&await discoverCount()<1200;n++){
   const before=await discoverCount()
   if(n%10===0)console.log("Discovery",n,before,"cards",await value("window.fixture.queries.size"),"queries")
   await value('document.querySelector(".content").scrollTop=document.querySelector(".content").scrollHeight')
   await eventually(async()=>await discoverCount()>before||await value('!!document.querySelector(".content > div:not([hidden]) .auto-more button")'),12000)
   if(await value('!!document.querySelector(".content > div:not([hidden]) .auto-more button")'))await value('document.querySelector(".content > div:not([hidden]) .auto-more button").click()')
 }
 report.discoverCards=await discoverCount()
 console.log('Discovery result',report.discoverCards,'cards',await value('window.fixture.queries.size'),'queries')
 assert(report.discoverCards>=1200,'Discover should continue past 1,200 rendered cards')
 report.distinctDiscoveryQueries=await value('window.fixture.queries.size')
 assert(report.distinctDiscoveryQueries>8,'exhausted search cursors should branch into new searches')
 await navigate('Live')
 const liveSelector='[aria-label="Live now videos"] .card'
 const liveCount=()=>value('document.querySelectorAll('+JSON.stringify(liveSelector)+').length')
 await eventually(async()=>await liveCount()>50)
 for(let n=0;n<5;n++){
  const before=await liveCount()
  await value('document.querySelector(".content").scrollTop=document.querySelector(".content").scrollHeight')
  await eventually(async()=>await liveCount()>before,12000)
 }
 console.log("Live scrolling passed")
 report.liveCards=await liveCount()
 const beforeFailure=await liveCount()
 await value('window.fixture.fail=true;document.querySelector(".content").scrollTop=document.querySelector(".content").scrollHeight')
 await eventually(()=>value('!!document.querySelector(".live-browser .auto-more button")'),15000)
 assert(await liveCount()>=beforeFailure,'failed pagination must retain visible streams')
 await value('window.fixture.fail=false;document.querySelector(".live-browser .auto-more button").click()')
 await eventually(async()=>await liveCount()>beforeFailure,15000)
 console.log("Live retry passed")
 report.livePaginationRetryPreservesResults=true
 const liveBeforeSwitch=await liveCount()
 await value('[...document.querySelectorAll(".live-mode-tabs button")].find(b=>b.textContent==="Scheduled").click()')
 const scheduleSelector='[aria-label="Scheduled videos"] .card'
 const scheduleCount=()=>value('document.querySelectorAll('+JSON.stringify(scheduleSelector)+').length')
 await eventually(async()=>await scheduleCount()>10)
 const times=await value('[...document.querySelectorAll('+JSON.stringify('[aria-label="Scheduled videos"] time')+')].map(t=>Date.parse(t.dateTime))')
 assert(times.length>0)
 assert(times.every((t,i)=>i===0||t>=times[i-1]),'upcoming streams must be in time order')
 report.scheduledCards=await scheduleCount()
 report.scheduledTimesInOrder=true
 await value('[...document.querySelectorAll(".live-mode-tabs button")].find(b=>b.textContent==="Live now").click()')
 await eventually(async()=>await liveCount()>=liveBeforeSwitch,10000)
 report.liveTabCachePreservesPagination=true
 await value('[...document.querySelectorAll(".live-mode-tabs button")].find(b=>b.textContent==="Scheduled").click()')
 await eventually(async()=>await scheduleCount()>10)
 const moved=await value('document.querySelector('+JSON.stringify(scheduleSelector)+').dataset.videoId')
 await value('window.fixture.statuses['+JSON.stringify(moved)+']="live";window.fixture.realNow=Date.now;Date.now=()=>window.fixture.realNow()+65000;window.dispatchEvent(new Event("focus"))')
 await eventually(()=>value('!document.querySelector('+JSON.stringify('[aria-label="Scheduled videos"] [data-video-id="'+moved+'"]')+')'),12000)
 await value('[...document.querySelectorAll(".live-mode-tabs button")].find(b=>b.textContent==="Live now").click()')
 await eventually(()=>value('!!document.querySelector('+JSON.stringify('[aria-label="Live now videos"] [data-video-id="'+moved+'"]')+')'),12000)
 report.scheduledToLiveTransition=true
 report.fixtureRequests=await value('window.fixture.calls')
 writeFileSync(resolve('artifacts/discovery-live-verification.json'),JSON.stringify(report,null,2))
 console.log(JSON.stringify(report,null,2))
} finally {
 try{await call('Browser.close')}catch{child.kill()}
 ws?.close()
 await new Promise(ok=>web.close(ok))
 await wait(500)
 assert(root.startsWith(join(process.env.TEMP,'puretube-features-')))
 rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:300})
}
