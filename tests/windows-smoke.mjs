import assert from 'node:assert/strict'
import {spawn,execFileSync,spawnSync} from 'node:child_process'
import {existsSync,mkdtempSync,rmSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {setTimeout as wait} from 'node:timers/promises'
import net from 'node:net'

// Run on a Windows test account with no existing PureTube installation or app data.
const installer=resolve(process.argv[2]??'src-tauri/target/release/bundle/nsis/PureTube_0.1.1_x64-setup.exe')
const live=process.env.PURETUBE_LIVE_SMOKE==='1'
assert.ok(existsSync(installer),'build the NSIS installer first')
const registered=spawnSync('reg.exe',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PureTube'])
assert.notEqual(registered.status,0,'test requires no existing PureTube installation')
const shortcutFolders=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"[Environment]::GetFolderPath('DesktopDirectory'); [Environment]::GetFolderPath('Programs')"],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/)
assert.equal(shortcutFolders.length,2)
const shortcuts=shortcutFolders.map(folder=>join(folder,'PureTube.lnk'))
assert.ok(shortcuts.every(path=>!existsSync(path)),'test requires no existing PureTube shortcuts')
const root=mkdtempSync(join(process.env.TEMP,'puretube-smoke-'))
const dir=join(root,'app'),exe=join(dir,'puretube.exe')
let child, ws
const server=net.createServer().listen(0,'127.0.0.1')
await new Promise(ok=>server.once('listening',ok))
const port=server.address().port
await new Promise(ok=>server.close(ok))
async function eventually(fn,ms=20000) {
 const until=Date.now()+ms
 while(Date.now()<until) {try{const answer=await fn();if(answer)return answer}catch{} await wait(200)}
 throw Error('Timed out waiting for the app')
}
async function launch() {
 child=spawn(exe,[],{stdio:'ignore',env:{...process.env,PURETUBE_ISOLATED_PROFILE:join(root,'profile'),WEBVIEW2_USER_DATA_FOLDER:join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port='+port}})
 const target=await eventually(async()=>{
   const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(1000)})).json()
   return pages.find(p=>p.type==='page'&&p.url.includes('tauri.localhost'))
 })
 ws=new WebSocket(target.webSocketDebuggerUrl)
 await new Promise((ok,no)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',no,{once:true})})
}
let seq=0
function call(method,params={}) {
 const id=++seq
 return new Promise((ok,no)=>{
   const timer=setTimeout(()=>{ws.removeEventListener('message',receive);no(Error('CDP timed out: '+method))},10000)
   function receive(e){const p=JSON.parse(e.data);if(p.id!==id)return;clearTimeout(timer);ws.removeEventListener('message',receive);p.error?no(Error(p.error.message)):ok(p.result)}
   ws.addEventListener('message',receive);ws.send(JSON.stringify({id,method,params}))
 })
}
async function value(expression) {
 const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
 if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??expression)
 return result.result.value
}
async function publicUploads() {
 const id='UC_x5XG1OV2P6uZZ5FSM9Ttw'
 const xml=await value(`window.__TAURI_INTERNALS__.invoke('public_feed',{id:${JSON.stringify(id)}})`)
 assert.match(xml,/<yt:videoId>[\w-]{11}<\/yt:videoId>/)
 console.log('YouTube returned a real public Atom feed without credentials.')
 await value(`document.querySelector('.sidebar button[aria-label="Subscriptions"]').click()`)
 await eventually(()=>value('document.querySelector("h1")?.textContent === "Subscriptions"'))
 await value(`(() => {
   const input=document.querySelector('input[aria-label="Channel ID or link"]')
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify('https://www.youtube.com/channel/'+id)})
   input.dispatchEvent(new Event('input',{bubbles:true}))
 })()`)
 await eventually(()=>value(`!document.querySelector('.filter-row button').disabled`))
 await value(`document.querySelector('form.filter-row').requestSubmit()`)
 await eventually(()=>value(`document.querySelector('.list-row .video-title')?.textContent === 'Google for Developers'`))
 console.log('Following a channel by its public URL passed.')
 await value(`document.querySelector('.sidebar button[aria-label="Home"]').click()`)
 await eventually(()=>value('document.querySelectorAll(".card").length>0'))
 const count=await value('document.querySelectorAll(".card").length')
 const displayed=await value(`[...document.querySelectorAll('.card img')].map(img=>new URL(img.src).pathname.split('/')[2])`)
 const published=await value(`[...new DOMParser().parseFromString(${JSON.stringify(xml)},'application/xml').getElementsByTagNameNS('http://www.w3.org/2005/Atom','entry')].map(e=>[e.getElementsByTagNameNS('http://www.youtube.com/xml/schemas/2015','videoId')[0].textContent,Date.parse(e.getElementsByTagNameNS('http://www.w3.org/2005/Atom','published')[0].textContent)])`)
 const dates=new Map(published)
 assert.ok(displayed.every(id=>dates.has(id)),'every displayed upload must come from the followed channel')
 assert.ok(displayed.every((id,i)=>i===0||dates.get(displayed[i-1])>=dates.get(id)),'uploads must be newest first')
 const lastChecked=await value('document.querySelector(".filter-row [role=status]").textContent')
 assert.match(lastChecked,/Checked /)
 // Exercise the elapsed-time check used when the window regains focus.
 await value(`(() => { const clock=Date.now.bind(Date); window.restoreTestClock=()=>{Date.now=clock}; Date.now=()=>clock()+360000; window.dispatchEvent(new Event('focus')); })()`)
 await eventually(()=>value(`document.querySelector(".filter-row [role=status]").textContent.startsWith("Checked ") && document.querySelector(".filter-row [role=status]").textContent !== ${JSON.stringify(lastChecked)}`))
 await value('window.restoreTestClock()')
 assert.ok(await value('document.querySelectorAll(".card").length')>0)
 console.log('Live keyless feed passed: followed Google for Developers, rendered '+count+' uploads, refreshed on return.')
 await value('document.querySelector(".card .thumbnail").click()')
 await eventually(()=>value('document.querySelector(".player iframe")?.src.includes("youtube.com/embed/")'))
 const iframe=await value('document.querySelector(".player iframe").src')
 const video=new URL(iframe).pathname.split('/').pop()
 await value(`document.querySelector('.sidebar button[aria-label="Home"]').click()`)
 await value(`(() => {
   const field=document.querySelector('.searchbar input')
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify('https://youtu.be/'+video)})
   field.dispatchEvent(new Event('input',{bubbles:true}))
 })()`)
 await eventually(()=>value(`document.querySelector('.searchbar input').value.endsWith(${JSON.stringify(video)})`))
 await value(`document.querySelector('.searchbar').requestSubmit()`)
 await eventually(()=>value(`document.querySelector('.player iframe')?.src.includes(${JSON.stringify('/embed/'+video)})`))
 console.log('Opening a pasted YouTube video link without credentials passed.')
 try { await eventually(()=>value('typeof window.YT?.Player === "function"'),15000) }
 catch(e) { throw Error('The YouTube player API did not initialize: '+(await value('document.querySelector(".watch .notice")?.textContent')??e.message)) }
 const pos=await value('(()=>{const r=document.querySelector(".player iframe").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
 await wait(2000)
 await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...pos})
 await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...pos})
 try {
   await eventually(()=>value(`window.__TAURI_INTERNALS__.invoke("load").then(d=>!!d.history[${JSON.stringify(video)}])`),30000)
 } catch(e) {
   const status=await value('document.querySelector(".watch .notice")?.textContent')
   throw Error('The live embed did not start playback: '+(status??e.message))
 }
 await value(`Array.from(document.querySelectorAll('.watch button')).find(b=>b.textContent.trim()==='Watch Later').click()`)
 await eventually(()=>value(`window.__TAURI_INTERNALS__.invoke("load").then(d=>d.later.includes(${JSON.stringify(video)}))`))
 console.log('Live keyless playback and Watch Later passed.')
}
async function close() {
 ws?.close();ws=undefined
 if(child?.pid && child.exitCode===null){
   execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`(Get-Process -Id ${child.pid} -ErrorAction SilentlyContinue).CloseMainWindow() | Out-Null`],{windowsHide:true,stdio:'ignore'})
   await eventually(()=>child.exitCode!==null,12000)
 }
 child=undefined
}
try {
 const install=spawnSync(installer,['/S','/D='+dir],{argv0:'"'+installer+'"',windowsVerbatimArguments:true,stdio:'ignore',timeout:90000})
 if(install.error) throw install.error
 assert.equal(install.status,0)
 assert.ok(existsSync(exe),'installer did not deploy the native executable')
 assert.ok(shortcuts.every(existsSync),'installer did not create both shortcuts')
 await launch()
 await eventually(()=>value('document.querySelector("h1")?.textContent === "Your feed"'))
 assert.equal(await value('document.documentElement.dataset.theme'),'dark')
 assert.equal(await value('document.querySelector(".modes button").getAttribute("aria-pressed")'),'true')
 assert.equal(await value('window.__TAURI_INTERNALS__.invoke("has_key")'),false)
 await value(`document.querySelector('[aria-label="Switch to light theme"]').click()`)
 await eventually(()=>value('window.__TAURI_INTERNALS__.invoke("load").then(d=>d.settings.theme==="light")'))
 await value(`document.querySelector('.sidebar button[aria-label="Settings"]').click()`)
 await eventually(()=>value('document.querySelector("h1")?.textContent === "Settings"'))
 assert.ok(await value('Array.from(document.querySelectorAll("h2")).some(h=>h.textContent.includes("Privacy and library"))'))
 await close()
 await launch()
 await eventually(()=>value('document.querySelector("h1")?.textContent === "Your feed" && document.documentElement.dataset.theme === "light"'))
 if(live)await publicUploads()
 console.log('NSIS install, shortcuts, native launch, default Quiet Mode, Settings, and SQLite theme persistence passed.')
} finally {
 try{await close()}catch{child?.kill()}
 const uninstall=join(dir,'uninstall.exe')
 if(existsSync(uninstall)){
   const result=spawnSync(uninstall,['/S'],{stdio:'ignore',timeout:45000})
   if(result.status!==0)process.exitCode=1
   else await eventually(()=>!existsSync(exe)&&shortcuts.every(path=>!existsSync(path)),15000)
 }
 if(shortcuts.some(existsSync)){console.error('A temporary shortcut remained after uninstall.');process.exitCode=1}
 // Delete only the temporary directory created for this run.
 assert.ok(root.startsWith(resolve(process.env.TEMP)+ '\\puretube-smoke-'))
 rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200})
}


