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
try{
 ws=await connect(await eventually(async()=>(await pages()).find(p=>p.type==='page'&&p.url.includes('tauri.localhost'))))
 await eventually(()=>value('!!document.querySelector(".top-menu:not(:disabled)")'))
 const data=await invoke('load')??{version:1,settings:{}};await invoke('save',{data:{...data,settings:{...data.settings,autoplay:false,tray:false}}});await value('window.__oldDocument=true');await call('Page.reload');await eventually(()=>value('window.__oldDocument!==true&&!!document.querySelector(".top-menu:not(:disabled)")'))
 assert.equal(await value('document.documentElement.dataset.cursor'),'themed')
 assert.ok((await value('getComputedStyle(document.querySelector(".top-menu")).cursor')).includes('data:image/svg+xml'))
 await navigate('Settings');await eventually(()=>value('!!document.querySelector(".settings")'))
 await value(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Preview intro').click()`)
 if(!await value('matchMedia("(prefers-reduced-motion: reduce)").matches')){await eventually(()=>value('!!document.querySelector(".brand-intro")'),5000);assert.equal(await value('getComputedStyle(document.querySelector(".brand-intro")).pointerEvents'),'none');await eventually(()=>value('!document.querySelector(".brand-intro")'),5000)}
 await value(`(()=>{const i=document.querySelector('.searchbar input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'https://www.youtube.com/watch?v=jNQXAC9IVRw');i.dispatchEvent(new Event('input',{bubbles:true}))})()`);await value('document.querySelector(".searchbar").requestSubmit()')
 await eventually(()=>value('document.querySelector(".viddy-seek-track input")?.disabled===false'),45000)
 await eventually(()=>value('document.querySelector(".seek-play")?.getAttribute("aria-label")==="Pause video"'),30000)
 await value('document.querySelector(".seek-play").click()');await eventually(()=>value('document.querySelector(".seek-play").getAttribute("aria-label")==="Play video"'))
 await value(`(()=>{const i=document.querySelector('.viddy-seek-track input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'8');i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))})()`)
 await wait(2200)
 assert.ok(await value('Math.abs(Number(document.querySelector(".viddy-seek-track input").value)-8)<1.5'),'custom seeking must be confirmed by the actual player time')
 await value('document.querySelector(".viddy-transport").scrollIntoView()');const shot=await call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve('src-tauri/target/Viddy-0.13-seekbar.png'),Buffer.from(shot.data,'base64'))
 console.log('Focused check passed: themed cursor, non-blocking/reduced-motion intro, real pause and seek to 0:08 through the custom bar.')
}catch(error){try{console.log('Failure: '+await value('document.body.innerText.slice(-1500)'))}catch{}throw error}
finally{try{await value('setTimeout(()=>document.querySelector(".window-close").click(),100)');await eventually(()=>child.exitCode!==null,10000)}catch{child.kill()}ws?.close();assert.ok(root.startsWith(join(process.env.TEMP,'puretube-features-')));rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:300})}
