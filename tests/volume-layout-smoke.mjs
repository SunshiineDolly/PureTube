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

async function openVideo(id){
 await value('(()=>{const i=document.querySelector(".searchbar input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(i,"https://www.youtube.com/watch?v='+id+'");i.dispatchEvent(new Event("input",{bubbles:true}))})()')
 await value('document.querySelector(".searchbar").requestSubmit()')
 await eventually(()=>value('document.querySelector(".watch:not(.watch-docked) .player iframe")?.src.includes("'+id+'")'))
}
try{
 ws=await connect(await eventually(async()=>(await pages()).find(p=>p.type==='page'&&p.url.includes('tauri.localhost'))))
 await eventually(()=>value('!!document.querySelector(".top-menu:not(:disabled)")'))
 const data=await invoke('load')??{version:1,settings:{}};await invoke('save',{data:{...data,settings:{...data.settings,autoplay:false,tray:false,intro:false}}})
 await value('localStorage.setItem("viddy-volume","42");window.__oldDocument=true');await call('Page.reload');await eventually(()=>value('window.__oldDocument!==true&&!!document.querySelector(".top-menu:not(:disabled)")'))
 await openVideo('M7lc1UVf-VE');await eventually(()=>value('!!document.querySelector(".up-next-card")'),60000)
 await value('document.querySelector(".up-next-queue:not(:disabled)").click()')
 await navigate('Home');await eventually(()=>value('document.querySelector(".compact-volume output")?.textContent==="42%"'))
 await value('document.querySelector(\'[aria-label="Return to video page"]\').click()')
 await value('[...document.querySelectorAll(".watch-view-controls button")].find(b=>b.textContent.includes("Pop out")).click()')
 const mini=await connect(await eventually(async()=>(await pages()).find(p=>p.url.includes('mini=1'))))
 await eventually(()=>value('document.querySelector(".compact-volume output")?.textContent==="42%"',mini))
 const bounds=await value('(()=>{const q=document.querySelector(".playlist-player").getBoundingClientRect(),v=document.querySelector(".compact-volume").getBoundingClientRect();return {queue:q.bottom,volume:v.top}})()',mini)
 assert.ok(bounds.queue<=bounds.volume,'queue panel must not overlap the volume slider')
 await value('(()=>{const i=document.querySelector(".compact-volume input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(i,"65");i.dispatchEvent(new Event("input",{bubbles:true}))})()',mini)
 await eventually(()=>value('document.querySelector(".compact-volume output").textContent==="65%"',mini))
 await invoke('close_player');mini.close()
 console.log('Passed: saved volume restored at 42% in both mini modes, popout slider changes to 65%, and queue panel stays clear of volume.')
}catch(error){try{console.log('Failure: '+await value('document.body.innerText.slice(-800)'))}catch{}throw error}
finally{try{await invoke('close_player');await value('setTimeout(()=>document.querySelector(".window-close").click(),100)');await eventually(()=>child.exitCode!==null,10000)}catch{child.kill()}ws?.close();assert.ok(root.startsWith(join(process.env.TEMP,'puretube-features-')));rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:300})}
