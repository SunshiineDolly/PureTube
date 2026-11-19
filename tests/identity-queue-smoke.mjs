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
 const ids=['M7lc1UVf-VE','jNQXAC9IVRw','dQw4w9WgXcQ'],data=await invoke('load')??{version:1,settings:{}}
 const savedVideos=Object.fromEntries(ids.map((id,i)=>[id,{id,title:'Queue sample '+i,channelId:'UC4QobU6STFB0P71PMvOGN5A',channel:'jawed',description:'',date:'2020-01-01',image:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg',duration:600,shorts:false,paid:false,embeddable:true}]))
 await invoke('save',{data:{...data,savedVideos,collections:[{name:'Edit test',ids}],settings:{...data.settings,autoplay:false,tray:false,intro:false,accent:'rose'}}})
 await value('window.__oldDocument=true');await call('Page.reload');await eventually(()=>value('window.__oldDocument!==true&&!!document.querySelector(".top-menu:not(:disabled)")'))
 assert.equal(await value('document.querySelector(".brand-name").textContent'),'Viddy')
 await navigate('Library');await eventually(()=>value('[...document.querySelectorAll(".playlist-tile")].some(b=>b.textContent.includes("Edit test"))'))
 await value('[...document.querySelectorAll(".playlist-tile")].find(b=>b.textContent.includes("Edit test")).click()')
 await value('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Play all").click()')
 await eventually(()=>value('document.querySelectorAll(".queue-entry").length===3'))
 await value('document.querySelectorAll(".queue-edit-actions button[aria-label^=\\\"Move up\\\"]")[2].click()')
 let order=await value('[...document.querySelectorAll(".queue-entry img")].map(i=>i.src.split("/vi/")[1].split("/")[0])');assert.deepEqual(order,[ids[0],ids[2],ids[1]])
 await value('document.querySelectorAll(".queue-edit-actions button[aria-label^=\\\"Remove\\\"]")[1].click()');await eventually(()=>value('document.querySelectorAll(".queue-entry").length===2'))
 await value('document.querySelector("[aria-label=\\\"Minimize queue\\\"]").click()');assert.equal(await value('document.querySelector(".playlist-queue-list").hidden'),true)
 await value('document.querySelector("[aria-label=\\\"Expand queue\\\"]").click()')
 await value('document.querySelector(".collection-saver summary").click()')
 await value('(()=>{const i=document.querySelector("[aria-label=\\\"New playlist name\\\"]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(i,"New watch list");i.dispatchEvent(new Event("input",{bubbles:true}))})()')
 await value('document.querySelector(".collection-saver form").requestSubmit()');await eventually(()=>value('!!document.querySelector(".viddy-toast")'))
 await eventually(()=>value('!document.querySelector(".viddy-toast")'),6000)
 await value('(()=>{const s=document.querySelector("select[aria-label=Playlist]");s.value="1";s.dispatchEvent(new Event("change",{bubbles:true}))})()')
 await value('[...document.querySelectorAll(".collection-saver button")].find(b=>b.textContent==="Remove from playlist").click()')
 await eventually(async()=>!(await invoke('load')).collections.find(c=>c.name==='New watch list').ids.length)
 await value('document.querySelector("[aria-label=\\\"Minimize playlist options\\\"]").click()');assert.equal(await value('document.querySelector(".collection-saver").open'),false)
 await navigate('Home');await eventually(()=>value('!!document.querySelector(".watch-docked .compact-volume")'))
 await value('(()=>{const i=document.querySelector(".compact-volume input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(i,"42");i.dispatchEvent(new Event("input",{bubbles:true}))})()')
 await eventually(()=>value('document.querySelector(".compact-volume output").textContent==="42%"'))
 await value('document.querySelector("[aria-label=\\\"Return to video page\\\"]").click()');await value('document.querySelector(".back").click()');await eventually(()=>value('!!document.querySelector(".library-studio")'))
 await value('document.querySelector("[aria-label=\\\"Return to video page\\\"]").click()')
 await value('window.open("https://www.youtube.com/watch?v=jNQXAC9IVRw","_blank")')
 await eventually(()=>value('document.querySelector(".watch:not(.watch-docked) .player iframe")?.src.includes("jNQXAC9IVRw")'))
 await eventually(()=>value('document.querySelector(".watch-overview h1")?.textContent==="Me at the zoo"'))
 await eventually(()=>value('!!document.querySelector(".subscriber-count")?.textContent'),30000)
 assert.equal(await value('[...document.querySelectorAll("button")].some(b=>b.textContent==="More from this creator")'),false)
 console.log('Queue edits, watch-page playlist removal/toast/collapse, docked volume, Back, embedded links and subscriber counts passed.')
 const url=await invoke('preview_stream',{id:ids[0]})
 await value('(()=>{const v=document.createElement("video");v.id="smooth-preview-check";v.muted=true;v.autoplay=true;v.src='+JSON.stringify(url)+';v.style="position:fixed;left:20px;bottom:20px;width:480px;z-index:9999";document.body.appendChild(v);return v.play()})()')
 await eventually(()=>value('(()=>{const v=document.querySelector("#smooth-preview-check");return v.videoHeight>=360&&v.currentTime>.5&&!v.paused})()'),40000)
 console.log('Smooth preview decoded and played at '+await value('document.querySelector("#smooth-preview-check").videoWidth+"x"+document.querySelector("#smooth-preview-check").videoHeight'))
 await value('document.querySelector("#smooth-preview-check").remove()')
 await navigate('Live');await eventually(()=>value('!!document.querySelector(".live-category-track")'))
 await value('[...document.querySelectorAll(".live-category-track button")].find(b=>b.textContent==="Gaming").click()')
 await eventually(()=>value('document.querySelectorAll(".live-browser .card").length>0&& !document.querySelector(".live-browser .heading button").disabled'),60000)
 const gaming=await value('[...document.querySelectorAll(".live-browser .card")].map(c=>c.dataset.videoId)')
 await value('[...document.querySelectorAll(".live-category-track button")].find(b=>b.textContent==="All streams").click()')
 await eventually(()=>value('document.querySelectorAll(".live-browser .card").length>=5&&!document.querySelector(".live-browser .heading button").disabled'),60000)
 const all=await value('[...document.querySelectorAll(".live-browser .card")].map(c=>c.dataset.videoId)');assert.ok(all.some(id=>!gaming.includes(id)))
 const shot=await call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve('src-tauri/target/Viddy-0.16-check.png'),Buffer.from(shot.data,'base64'))
 console.log('All streams reset the Gaming selection and loaded a different mixed catalog.')
}catch(error){try{console.log('Failure: '+await value('document.body.innerText.slice(-1200)'))}catch{}throw error}
finally{try{await invoke('close_player');await value('setTimeout(()=>document.querySelector(".window-close").click(),100)');await eventually(()=>child.exitCode!==null,10000)}catch{child.kill()}ws?.close();assert.ok(root.startsWith(join(process.env.TEMP,'puretube-features-')));rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:300})}
