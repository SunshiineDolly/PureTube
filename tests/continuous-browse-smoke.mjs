import assert from 'node:assert/strict'
import {spawn,execFileSync} from 'node:child_process'
import {mkdtempSync,existsSync,statSync,writeFileSync,rmSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {setTimeout as wait} from 'node:timers/promises'
import net from 'node:net'

const exe=resolve(process.env.PURETUBE_TEST_EXE??'src-tauri/target/release/puretube.exe')
const root=mkdtempSync(join(process.env.TEMP,'puretube-features-'))
const server=net.createServer().listen(0,'127.0.0.1');await new Promise(ok=>server.once('listening',ok));const port=server.address().port;await new Promise(ok=>server.close(ok))
const child=spawn(exe,[],{stdio:'ignore',env:{...process.env,PURETUBE_ISOLATED_PROFILE:join(root,'profile'),WEBVIEW2_USER_DATA_FOLDER:join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--autoplay-policy=no-user-gesture-required --remote-debugging-port='+port}})
let ws,seq=0
async function eventually(task,ms=40000){let last;const until=Date.now()+ms;while(Date.now()<until){try{const answer=await task();if(answer)return answer}catch(e){last=e}await wait(200)}throw Error('Feature check timed out'+(last?': '+last.message:''))}
async function pages(){return (await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(1500)})).json()}
async function connect(target){const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((ok,no)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',no,{once:true})});return socket}
function call(method,params={},socket=ws){const id=++seq;return new Promise((ok,no)=>{const timer=setTimeout(()=>{socket.removeEventListener('message',receive);no(Error('CDP timed out: '+method))},25000);function receive(e){const m=JSON.parse(e.data);if(m.id!==id)return;clearTimeout(timer);socket.removeEventListener('message',receive);m.error?no(Error(m.error.message)):ok(m.result)}socket.addEventListener('message',receive);socket.send(JSON.stringify({id,method,params}))})}
async function value(expression,socket=ws){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},socket);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.exception?.value??expression);return r.result.value}
const invoke=(command,args={},socket=ws)=>value(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`,socket)
const navigate=name=>value(`document.querySelector('.sidebar [aria-label=${JSON.stringify(name)}]').click()`)
async function watchZoo(){
 await value(`(()=>{const i=document.querySelector('.searchbar input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'https://www.youtube.com/watch?v=jNQXAC9IVRw');i.dispatchEvent(new Event('input',{bubbles:true}));})()`)
 await value('document.querySelector(".searchbar").requestSubmit()')
 await eventually(()=>value('document.querySelector(".player iframe")?.src.includes("jNQXAC9IVRw")'))
 await eventually(()=>value('document.querySelectorAll(".up-next-card").length>0'),50000)
}
async function endVideo(){
 await eventually(()=>value('typeof window.YT?.Player==="function"'))
 await wait(2500)
 await value(`(()=>{const w=document.querySelector('.player iframe').contentWindow;for(const [func,args] of [['seekTo',[18.7,true]],['playVideo',[]]])w.postMessage(JSON.stringify({event:'command',func,args}),'https://www.youtube.com')})()`)
}
async function input(selector,text){await value(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`)}
async function shot(name){const s=await call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve('src-tauri/target/Viddy-0.13-'+name+'.png'),Buffer.from(s.data,'base64'))}
const report={}
try{
 ws=await connect(await eventually(async()=>(await pages()).find(p=>p.type==='page'&&p.url.includes('tauri.localhost'))))
 await eventually(()=>value('!!document.querySelector(".top-menu:not(:disabled)")'))
 const data=await invoke('load')??{version:1,settings:{}}
 await invoke('save',{data:{...data,settings:{...data.settings,autoplay:false,tray:false}}});await value('window.__oldDocument=true');await call('Page.reload',{ignoreCache:true});await eventually(()=>value('window.__oldDocument!==true&&!!document.querySelector(".top-menu:not(:disabled)")'))

 await input('.searchbar input','https://www.youtube.com/watch?v=jNQXAC9IVRw');await value('document.querySelector(".searchbar").requestSubmit()')
 await eventually(()=>value('document.querySelectorAll(".up-next-card").length>=8'),60000)
 for(let n=0;n<18;n++){
 const count=await value('document.querySelectorAll(".up-next-card").length');if(count>24&&await value('Number(document.querySelector(".up-next").dataset.continuationPages)>0'))break
 await value('document.querySelector(".watch-recommendations [data-scroll-sentinel]")?.scrollIntoView()')
 await eventually(()=>value('document.querySelectorAll(".up-next-card").length>'+count),60000)
 }
 report.continuations=await value('Number(document.querySelector(".up-next").dataset.continuationPages)');assert.ok(report.continuations>0,'Scrolling must fetch actual continuation pages');report.upNext=await value('document.querySelectorAll(".up-next-card").length');assert.ok(report.upNext>24,'Up next must continue beyond 24 videos')
 const ids=await value('[...document.querySelectorAll(".up-next-item")].map(e=>e.dataset.videoId)');assert.equal(ids.length,new Set(ids).size)
 assert.equal(await value('[...document.querySelectorAll(".up-next button")].some(b=>b.textContent.includes("More recommendations"))'),false)
 await value('document.querySelector(".up-next-queue:not(:disabled)").click()')
 await eventually(()=>value('!!document.querySelector(".playlist-player")&&!!document.querySelector(".up-next-card")'))
 assert.equal(await value('document.querySelectorAll(".playlist-queue-list>button").length'),2)
 assert.ok(await value('document.querySelector(".up-next-queue:disabled")?.title==="Queued"'))
 await shot('queue-and-recommendations')
 await value('document.querySelector(".player iframe").dataset.persistent="yes"');await navigate('Library')
 await eventually(()=>value('!!document.querySelector(".watch-docked")'))
 assert.ok(await value("document.querySelector('[aria-label=\"Return to video page\"]').textContent.includes('Return to video')"))
 await value(`document.querySelector('[aria-label="Return to video page"]').click()`)
 await eventually(()=>value('!!document.querySelector(".watch:not(.watch-docked)")'));assert.equal(await value('document.querySelector(".player iframe").dataset.persistent'),'yes')
 console.log('Up next grew past 24 by scrolling; recommendations stayed available beside the queue; Add to queue and explicit Return preserved playback.')
 await navigate('Live')
 await eventually(()=>value('document.querySelectorAll(".live-browser .video-grid .card").length>=8'),120000)
 await eventually(()=>value('document.querySelector(".live-browser .heading button")?.disabled===false'),150000)
 report.live=await value('document.querySelectorAll(".live-browser .video-grid .card").length');report.creators=await value('[...new Set([...document.querySelectorAll(".live-browser .card")].map(e=>e.dataset.channelId))].length')
 assert.ok(report.creators>=4);assert.equal(await value('document.querySelectorAll(".live-category-track button").length'),9)
 assert.ok(await value('[...document.querySelectorAll(".live-browser .card")].every(c=>c.querySelector(".live-badge")?.textContent==="Live")'))
 await shot('live-mix')
 await value(`[...document.querySelectorAll('.live-mode-tabs button')].find(b=>b.textContent==='Scheduled').click()`)
 await eventually(()=>value('document.querySelectorAll(".live-browser .video-grid .card").length>0'),150000)
 await eventually(()=>value('document.querySelector(".live-browser .heading button")?.disabled===false'),180000)
 report.scheduled=await value('document.querySelectorAll(".live-browser .video-grid .card").length')
 assert.ok(await value('[...document.querySelectorAll(".live-browser .card")].every(c=>c.querySelector(".scheduled-badge"))'))
 await shot('scheduled-mix')
 console.log('Live and Scheduled returned separate public mixes: '+JSON.stringify(report))
 writeFileSync(resolve('src-tauri/target/Viddy-0.13-audit.json'),JSON.stringify(report,null,2))
}catch(error){try{console.log('Failure: '+await value('document.body.innerText.slice(-4500)'));await shot('failure')}catch{}throw error}
finally{try{await value('setTimeout(()=>document.querySelector(".window-close").click(),100)');await eventually(()=>child.exitCode!==null,10000)}catch{child.kill()}ws?.close();assert.ok(root.startsWith(join(process.env.TEMP,'puretube-features-')));rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:300})}
