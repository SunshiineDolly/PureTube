import assert from 'node:assert/strict'
import {spawn,execFileSync,spawnSync} from 'node:child_process'
import {existsSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {setTimeout as wait} from 'node:timers/promises'
import net from 'node:net'

// Run on a Windows test account with no existing PureTube installation or app data.
const installer=resolve(process.argv[2]??'src-tauri/target/release/bundle/nsis/PureTube_0.9.0_x64-setup.exe')
const live=process.env.PURETUBE_LIVE_SMOKE==='1'
const youtubeOnly=process.env.PURETUBE_YOUTUBE_SMOKE==='1'
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
 child=spawn(exe,[],{stdio:'ignore',env:{...process.env,PURETUBE_ISOLATED_PROFILE:join(root,'profile'),WEBVIEW2_USER_DATA_FOLDER:join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--autoplay-policy=no-user-gesture-required --remote-debugging-port='+port}})
 ws=await connect(await eventually(async()=>(await pages()).find(p=>p.type==='page'&&p.url.includes('tauri.localhost'))))
}
async function pages() {
 return (await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(1000)})).json()
}
async function connect(target) {
 const socket=new WebSocket(target.webSocketDebuggerUrl)
 await new Promise((ok,no)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',no,{once:true})})
 return socket
}
let seq=0
function call(method,params={},socket=ws) {
 const id=++seq
 return new Promise((ok,no)=>{
   const timer=setTimeout(()=>{socket.removeEventListener('message',receive);no(Error('CDP timed out: '+method))},10000)
   function receive(e){const p=JSON.parse(e.data);if(p.id!==id)return;clearTimeout(timer);socket.removeEventListener('message',receive);p.error?no(Error(p.error.message)):ok(p.result)}
   socket.addEventListener('message',receive);socket.send(JSON.stringify({id,method,params}))
 })
}
async function value(expression,socket=ws) {
 const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},socket)
 if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??expression)
 return result.result.value
}
async function nativeSearch() {
 const term='Me at the zoo jawed',videoId='jNQXAC9IVRw'
 await value(`(() => { const input=document.querySelector('.searchbar input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(term)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
 await value(`document.querySelector('.searchbar').requestSubmit()`)
 await eventually(()=>value(`document.querySelector('h1')?.textContent==="Search results" && !!document.querySelector('.search-banner button')`))
 await value(`[...document.querySelectorAll('.search-banner button')].find(b=>b.textContent==='Relevance').click()`)
 await eventually(()=>value(`document.querySelector('h1')?.textContent==="Search results" && [...document.querySelectorAll(".thumbnail")].some(b=>b.getAttribute("aria-label")==="Watch Me at the zoo")`),35000)
 await value(`document.querySelector('.thumbnail[aria-label="Watch Me at the zoo"]').click()`)
 await eventually(()=>value(`document.querySelector(".player iframe")?.src.includes(${JSON.stringify('/embed/'+videoId)})`))
 assert.equal((await pages()).filter(p=>p.type==='page').length,1,'search and watch must stay in the main window')
 assert.equal(await value('!![...document.querySelectorAll(".watch-actions button")].find(b=>b.textContent.includes("YouTube window"))'),false)
 await eventually(()=>value('typeof window.YT?.Player==="function"'))
 await eventually(()=>value(`window.__TAURI_INTERNALS__.invoke("load").then(d=>!!d.history[${JSON.stringify(videoId)}])`),30000)
 await value('document.querySelector(".back").click()')
 await eventually(()=>value(`document.querySelector('h1')?.textContent==="Search results" && !!document.querySelector('.thumbnail[aria-label="Watch Me at the zoo"]')`))
 console.log('A public search result started playback without a second click; Back restored the results.')
}
async function suggestionsAndScroll(){
 await value(`(() => { const input=document.querySelector('.searchbar input');input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'acoustic guit');input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
 await eventually(()=>value('document.querySelectorAll(".search-suggestions [role=option]").length>1'),30000)
 await call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40})
 const picked=await value('document.querySelector(".search-suggestions [aria-selected=true]").textContent')
 await value('document.querySelector(".searchbar").requestSubmit()')
 assert.equal(await value('document.querySelector(".searchbar input").value'),picked)
 await eventually(()=>value('document.querySelectorAll(".studio-shelf .thumbnail").length>8'))
 assert.ok(await value('!!document.querySelector(".card .meta")'),'results should show YouTube’s upload labels')
 await eventually(()=>value('!!document.querySelector(".card .creator-dot img")?.naturalWidth'))
 assert.equal(await value('!!document.querySelector(".live-badge")'),false)
 const before=await value('document.querySelectorAll(".studio-shelf .thumbnail").length')
 await value('document.querySelector("[data-scroll-sentinel]").scrollIntoView()')
 await eventually(()=>value(`document.querySelectorAll(".studio-shelf .thumbnail").length>${before}`),30000)
 assert.equal(await value('[...document.querySelectorAll("main button")].some(b=>b.textContent.trim()==="Load more")'),false)
 const position=await value('document.querySelector("main").scrollTop')
 const total=await value('document.querySelectorAll(".studio-shelf .thumbnail").length')
 await value('[...document.querySelectorAll(".studio-shelf .thumbnail")].at(-1).click()')
 await eventually(()=>value('!!document.querySelector(".back")'))
 await value('document.querySelector(".back").click()')
 await eventually(()=>value(`document.querySelector(".searchbar input").value===${JSON.stringify(picked)} && document.querySelectorAll(".studio-shelf .thumbnail").length>=${total} && document.querySelector("main").scrollTop>=${Math.max(0,position-4)}`))
 console.log('Keyboard autocomplete, creator photos, dates, and automatic search continuation passed.')
}
async function scheduledStreams(){
 await value(`[...document.querySelectorAll('[aria-label="Live filters"] button')].find(b=>b.textContent==='Scheduled').click()`)
 await eventually(()=>value('!!document.querySelector(".scheduled-badge") && !!document.querySelector(".schedule-details time")'),30000)
 const at=await value('Date.parse(document.querySelector(".schedule-details time").dateTime)')
 assert.ok(Number.isFinite(at))
 await value('document.querySelector(".schedule-details button").click()')
 await eventually(()=>value('document.querySelector(".schedule-details button")?.textContent==="Reminder set" && window.__TAURI_INTERNALS__.invoke("load").then(d=>Object.values(d.liveReminders).some(r=>r.at==='+at+'))'))
 await value('document.querySelector(".thumbnail:has(.scheduled-badge)").click()')
 await eventually(()=>value('!!document.querySelector(".scheduled-watch .schedule-details") && !document.querySelector(".player iframe")'))
 await value('document.querySelector(".back").click()')
 await eventually(()=>value('document.querySelector("[aria-label=\'Live filters\'] [aria-pressed=true]")?.textContent==="Scheduled"'))
 console.log('Scheduled streams showed real start times, countdowns, and a persisted reminder.')
}
async function liveReminderNotice(){
 await value(`document.querySelector('.sidebar button[aria-label="Live"]').click()`)
 await eventually(()=>value('document.querySelectorAll(".live-badge").length>0'),30000)
 const ids=await value(`[...document.querySelectorAll(".thumbnail:has(.live-badge) img")].slice(0,6).map(i=>new URL(i.src).pathname.split('/')[2])`)
 const id=await value(`Promise.all(${JSON.stringify(ids)}.map(id=>window.__TAURI_INTERNALS__.invoke("live_status",{id}).then(s=>s==="live"?id:"",()=>""))).then(ids=>ids.find(Boolean))`)
 assert.ok(id,'YouTube must confirm at least one of these streams is currently live')
 await value(`window.__TAURI_INTERNALS__.invoke("load").then(d=>window.__TAURI_INTERNALS__.invoke("save",{data:{...d,liveReminders:{...d.liveReminders,[${JSON.stringify(id)}]:{title:"Live reminder fixture",at:Date.now()-1000}}}}))`)
 await close()
 await launch()
 await eventually(()=>value(`[...document.querySelectorAll('main [role=status]')].some(n=>n.textContent.includes("Now live:") && n.textContent.includes("Live reminder fixture"))`),30000)
 await value(`[...document.querySelectorAll('main button')].find(b=>b.textContent==='Watch live').click()`)
 await eventually(()=>value(`document.querySelector(".player iframe")?.src.includes(${JSON.stringify('/embed/'+id)}) && !![...document.querySelectorAll(".live-control button")].find(b=>b.textContent==="Go live")`))
 assert.equal(await value('new URL(document.querySelector(".player iframe").src).searchParams.has("start")'),false)
 console.log('The app confirmed an actual broadcast was live, notified the user, and opened it without a saved video position.')
}
async function collaboratorLinks(){
 const q='Capsule Bunny Yumechi viral gyaru photoshoot'
 await value(`(() => { const field=document.querySelector('.searchbar input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(q)}); field.dispatchEvent(new Event('input',{bubbles:true})); })()`)
 await value('document.querySelector(".searchbar").requestSubmit()')
 await eventually(()=>value('document.querySelector("h1")?.textContent==="Search results"'))
 await value(`[...document.querySelectorAll('.search-banner button')].find(b=>b.textContent==='Relevance').click()`)
 const card='[...document.querySelectorAll(".card")].find(c=>c.textContent.includes("VIRAL Gyaru Photoshoot"))'
 await eventually(()=>value(`${card}?.querySelectorAll('.byline button').length===2`),35000)
 await value(`${card}.querySelector('.byline button').click()`)
 await eventually(()=>value('document.querySelector("h1")?.textContent==="Capsule Bunny"'),35000)
 await value('document.querySelector(".back").click()')
 await eventually(()=>value(`!!${card}`))
 await value(`${card}.querySelector('.thumbnail').click()`)
 await eventually(()=>value('document.querySelector(".watch iframe")?.src.includes("asm4uYb-_YU")'))
 await value(`[...document.querySelectorAll('.channel-meta .byline button')].find(b=>b.textContent==='Yumechi').click()`)
 await eventually(()=>value('document.querySelector("h1")?.textContent==="Yumechi"'),35000)
 await value(`(() => { const field=document.querySelector('.searchbar input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'https://youtu.be/asm4uYb-_YU'); field.dispatchEvent(new Event('input',{bubbles:true})); })()`)
 await value('document.querySelector(".searchbar").requestSubmit()')
 await eventually(()=>value('document.querySelector(".watch .channel-meta .byline button")?.textContent==="Capsule Bunny"'),35000)
 console.log('The reported video linked both creators; a pasted copy also resolved its uploader.')
}
async function dashieLive(){
 const channelId='UCERUmrDh9hmqEXBsnYFNTIA'
 const stream=await value(`window.__TAURI_INTERNALS__.invoke('channel_live',{id:${JSON.stringify(channelId)}})`)
 assert.ok(stream?.live,'DashieGames must currently be live for this live regression test')
 await value(`window.__TAURI_INTERNALS__.invoke("load").then(d=>window.__TAURI_INTERNALS__.invoke("save",{data:{...d,follows:[...new Set([...d.follows,${JSON.stringify(channelId)}])],progress:{...d.progress,[${JSON.stringify(stream.id)}]:{at:45,duration:300,updated:Date.now()}}}}))`)
 await close()
 await launch()
 await eventually(()=>value(`!!document.querySelector('.sidebar-follows button[title="DashieGames — live now"] .sidebar-live') && !!document.querySelector('.followed-live-card[aria-label="Watch live: DashieGames"]')`),35000)
 await value(`document.querySelector('.sidebar-follows button[title="DashieGames — live now"]').click()`)
 await eventually(()=>value(`document.querySelector('h1')?.textContent.includes('DashieGames') && document.querySelector('.creator-broadcast img')?.src.includes(${JSON.stringify('/vi/'+stream.id+'/')}) && document.querySelector('.creator-live-label')?.textContent==='LIVE NOW'`),35000)
 await value(`[...document.querySelectorAll('.creator-tabs button')].find(b=>b.textContent==='Videos').click()`)
 await eventually(()=>value('document.querySelectorAll(".creator-page .video-grid .card").length>10'),35000)
 const channelCount=await value('document.querySelectorAll(".creator-page .video-grid .card").length')
 await value('document.querySelector(".creator-page [data-scroll-sentinel]").scrollIntoView()')
 await eventually(()=>value(`document.querySelectorAll('.creator-page .video-grid .card').length>${channelCount}`),35000)
 await value(`[...document.querySelectorAll('.creator-tabs button')].find(b=>b.textContent==='About').click()`)
 assert.equal(await value('!!document.querySelector(".creator-broadcast .live-badge")'),true)
 await value('document.querySelector(".creator-broadcast .button").click()')
 await eventually(()=>value(`document.querySelector('.player iframe')?.src.includes(${JSON.stringify('/embed/'+stream.id)})`))
 console.log('The channel page showed the same active broadcast across tabs and loaded older uploads automatically.')
 await value(`document.querySelector('.sidebar button[aria-label="Following"]').click()`)
 await eventually(()=>value(`!!document.querySelector('.followed-live-card[aria-label="Watch live: DashieGames"]')`))
 assert.equal(await value(`[...document.querySelectorAll('.video-grid .thumbnail img')].some(i=>i.src.includes(${JSON.stringify('/vi/'+stream.id+'/')}))`),false)
 await value(`document.querySelector('.followed-live-card[aria-label="Watch live: DashieGames"]').click()`)
 await eventually(()=>value(`document.querySelector('.player iframe')?.src.includes(${JSON.stringify('/embed/'+stream.id)})`))
 assert.equal(await value('new URL(document.querySelector(".player iframe").src).searchParams.has("start")'),false)
 try{
   await eventually(()=>value('document.querySelector(".live-control [role=status]")?.textContent==="Live stream"'),40000)
 }catch(e){throw Error('Dashie live did not begin: '+await value('document.querySelector(".watch .notice")?.textContent'),{cause:e})}
 await value(`document.querySelector('.live-control button').click()`)
 await eventually(()=>value('document.querySelector(".live-control [role=status]")?.textContent==="Live stream"'),30000)
 assert.equal(await value(`window.__TAURI_INTERNALS__.invoke("load").then(d=>d.progress[${JSON.stringify(stream.id)}]?.at)`),45)
 console.log('DashieGames was labeled LIVE before clicking, played in PureTube without saved progress, and resumed after Go live.')
 await eventually(()=>value('!!document.querySelector(".live-chat iframe")'))
 const chatUrl=await value('document.querySelector(".live-chat iframe").src')
 assert.equal(new URL(chatUrl).searchParams.get('v'),stream.id)
 assert.equal(new URL(chatUrl).searchParams.get('embed_domain'),'tauri.localhost')
 const chatTarget=await eventually(async()=>(await pages()).find(p=>p.type==='iframe'&&p.url===chatUrl))
 const chatSocket=await connect(chatTarget)
 let chatPolls=0
 const onPoll=e=>{
   const message=JSON.parse(e.data)
   const response=message.params?.response
   if(message.method==='Network.responseReceived'&&response?.status===200&&/\/live_chat\/get_live_chat(?:\?|$)/.test(response.url))chatPolls++
 }
 chatSocket.addEventListener('message',onPoll)
 await call('Network.enable',{},chatSocket)
 try{
   await eventually(()=>value('document.querySelectorAll("yt-live-chat-text-message-renderer").length>0',chatSocket),40000)
   await eventually(()=>value('!document.querySelector("#input-panel,yt-live-chat-message-input-renderer,#sign-in-button")',chatSocket))
   assert.equal(await value('[...document.querySelectorAll("button,a")].some(e=>e.getClientRects().length&&/sign in to chat/i.test(e.textContent))',chatSocket),false)
   assert.equal(await value('(()=>{try{return window.open("https://example.com/","_blank")===null}catch(e){return e.name==="SecurityError"}})()',chatSocket),true)
   const last=await value('[...document.querySelectorAll("yt-live-chat-text-message-renderer")].slice(-3).map(n=>n.id+" "+n.innerText).join("|")',chatSocket)
   await eventually(async()=>chatPolls>=2||await value(`[...document.querySelectorAll('yt-live-chat-text-message-renderer')].slice(-3).map(n=>n.id+" "+n.innerText).join("|")!==${JSON.stringify(last)}`,chatSocket),45000)
 }finally{chatSocket.removeEventListener('message',onPoll);chatSocket.close()}
 await value(`document.querySelector('[aria-label="Hide live chat"]').click()`)
 assert.equal(await value('!!document.querySelector(".live-chat iframe")'),false)
 await value(`[...document.querySelectorAll('.live-chat-closed button')].find(b=>b.textContent.includes('Show live chat')).click()`)
 await eventually(()=>value('!!document.querySelector(".live-chat iframe")'))
 console.log('Read-only live chat had no sign-in input, blocked popups, and continued checking for new messages.')
}
async function lifecycle(){
 await value('window.__TAURI_INTERNALS__.invoke("load").then(d=>window.__TAURI_INTERNALS__.invoke("save",{data:{...d,settings:{...d.settings,tray:true}}}))')
 await close();await launch()
 const original=child.pid
 await eventually(()=>value(`!!document.querySelector('[aria-label="Minimize window"]')`))
 const windowHandle=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`(Get-Process -Id ${original}).MainWindowHandle.ToInt64()`],{encoding:'utf8',windowsHide:true}).trim()
 const windowState=()=>JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class PureTubeWindowCheck { [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h); [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h); }'; @{visible=[PureTubeWindowCheck]::IsWindowVisible([IntPtr]${windowHandle});minimized=[PureTubeWindowCheck]::IsIconic([IntPtr]${windowHandle})}|ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true}))
 await value(`document.querySelector('[aria-label="Minimize window"]').click()`)
 await eventually(()=>{const state=windowState();return !state.visible||state.minimized})
 const second=spawn(exe,[],{stdio:'ignore',env:{...process.env,PURETUBE_ISOLATED_PROFILE:join(root,'profile'),WEBVIEW2_USER_DATA_FOLDER:join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port='+port}})
 await eventually(()=>second.exitCode!==null,15000)
 assert.equal(second.exitCode,0)
 assert.equal(child.pid,original)
 await eventually(()=>{const state=windowState();return state.visible&&!state.minimized})
 const processCount=()=>Number(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`@(Get-Process puretube -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${exe.replaceAll("'","''")}' }).Count`],{encoding:'utf8',windowsHide:true}).trim())
 assert.equal(processCount(),1,'opening again must reuse one app process')
 await value('setTimeout(()=>document.querySelector(".window-close").click(),75)')
 await eventually(()=>child.exitCode!==null,12000)
 assert.equal(processCount(),0,'Close must fully exit, including the tray instance')
 ws?.close();ws=undefined;child=undefined
 await launch()
 await eventually(()=>value('document.querySelector("h1")?.textContent==="Home"'))
 assert.equal(processCount(),1)
 console.log('A second launch restored the hidden app; Close removed its process; reopening started exactly one new instance.')
}
async function recommendationMix(){
 await value(`document.querySelector('.sidebar button[aria-label="Home"]').click()`)
 await eventually(()=>value(`[...document.querySelectorAll('.heading button')].some(b=>b.textContent.includes('New mix')&&!b.disabled)&&document.querySelectorAll('.recommendations .card').length>=8`),45000)
 const first=await value('[...document.querySelectorAll(".recommendations .card")].map(c=>c.dataset.videoId)')
 const categories=await value('[...document.querySelectorAll(".recommendation-reason>span")].map(c=>c.textContent)')
 assert.ok(new Set(categories).size>=3,'Home must show at least three genres')
 await value(`document.querySelector('.recommendation-reason button').click()`)
 await eventually(()=>value(`![...document.querySelectorAll('.card')].some(c=>c.dataset.videoId===${JSON.stringify(first[0])})`))
 await value(`[...document.querySelectorAll('.heading button')].find(b=>b.textContent.includes('New mix')).click()`)
 await eventually(()=>value(`[...document.querySelectorAll('.heading button')].some(b=>b.textContent.includes('New mix')&&!b.disabled)`),45000)
 const second=await value('[...document.querySelectorAll(".recommendations .card")].map(c=>c.dataset.videoId)')
 assert.ok(second.some(id=>!first.includes(id)),'New mix must introduce different videos')
 assert.ok(!second.includes(first[0]),'a dismissed video must not return')
 await value(`document.querySelector('.sidebar button[aria-label="Discover"]').click()`)
 await eventually(()=>value('document.querySelectorAll(".recommendations .card").length>=6 && !document.querySelector(".recommendation-toolbar button").disabled'),45000)
 const discover=await value('[...document.querySelectorAll(".recommendations .card")].map(c=>c.dataset.videoId)')
 assert.ok(discover.every(id=>!second.includes(id)),'Discover must not duplicate the Home selection')
 console.log('Home mixed genres, New mix introduced different videos, Not interested persisted, and Discover offered a separate mix.')
}
async function redesign(){
 await value(`document.querySelector('.sidebar button[aria-label="Settings"]').click()`)
 if(await value('document.documentElement.dataset.theme')==='light')await value(`document.querySelector('[aria-label="Switch to dark theme"]').click()`)
 await eventually(()=>value(`[...document.querySelectorAll('.palette-option')].some(b=>b.textContent==='Rose Noir')`))
 await value(`[...document.querySelectorAll('.palette-option')].find(b=>b.textContent==='Rose Noir').click()`)
 await value(`document.querySelector('.sidebar button[aria-label="Home"]').click()`)
 await eventually(()=>value('document.querySelectorAll(".recommendations .card").length>=6 && [...document.querySelectorAll(".heading button")].some(b=>b.textContent.includes("New mix")&&!b.disabled)'),45000)
 await eventually(()=>value('[...document.querySelectorAll(".recommendations .thumbnail img")].slice(0,6).every(i=>i.complete&&i.naturalWidth>0)'),30000)
 const dark=await call('Page.captureScreenshot',{format:'png'})
 writeFileSync(resolve('src-tauri/target/PureTube-0.9.0-dark-home.png'),Buffer.from(dark.data,'base64'))
 await value(`document.querySelector('[aria-label="Switch to light theme"]').click()`)
 await eventually(()=>value('document.documentElement.dataset.theme==="light"'))
 const light=await call('Page.captureScreenshot',{format:'png'})
 writeFileSync(resolve('src-tauri/target/PureTube-0.9.0-light-home.png'),Buffer.from(light.data,'base64'))
 await value(`[...document.querySelectorAll('.category-track .category-chip')].find(b=>b.textContent==='Gaming').click()`)
 await eventually(()=>value('document.querySelector(".topic-catalog .eyebrow")?.textContent==="Gaming" && document.querySelectorAll(".topic-catalog .thumbnail").length>0'),30000)
 console.log('The redesigned dark/light layouts rendered; the Home category rail opened real gaming results.')
}
async function hoverPreview(){
 await value(`document.querySelector('.sidebar button[aria-label="Home"]').click()`)
 await eventually(()=>value('!!document.querySelector(".video-grid .thumbnail")'))
 await eventually(()=>value(`[...document.querySelectorAll('.heading button')].some(b=>b.textContent.includes('New mix')&&!b.disabled)`),40000)
 const point=await value('(()=>{const b=document.querySelector(".video-grid .thumbnail");b.scrollIntoView({block:"center"});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point})
 await eventually(()=>value('!!document.querySelector(".thumbnail-preview")'),15000)
 const preview=await value('document.querySelector(".thumbnail-preview").src')
 assert.equal(new URL(preview).searchParams.get('mute'),'1')
 assert.equal(new URL(preview).searchParams.get('autoplay'),'1')
 assert.equal(await value('document.querySelectorAll(".thumbnail-preview").length'),1)
 const target=await eventually(async()=>(await pages()).find(p=>p.type==='iframe'&&p.url===preview))
 const previewSocket=await connect(target)
 try{
   await eventually(()=>value('(()=>{const v=document.querySelector("video");return !!v&&!v.paused&&v.currentTime>0.1&&v.muted})()',previewSocket),30000)
 }finally{previewSocket.close()}
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:20,y:28})
 await eventually(()=>value('!document.querySelector(".thumbnail-preview")'))
 console.log('Hover played an actual muted video preview and removed it when the pointer left.')
}
async function playbackAudit(checkSession=true){
 const stream=await value(`window.__TAURI_INTERNALS__.invoke('channel_live',{id:'UCERUmrDh9hmqEXBsnYFNTIA'})`)
 assert.ok(stream?.live,'the live playback audit requires an active DashieGames broadcast')
 await value('window.__TAURI_INTERNALS__.invoke("load").then(d=>window.__TAURI_INTERNALS__.invoke("save",{data:{...d,settings:{...d.settings,showTime:true,progress:false,reminder:0}}}))')
 await close();await launch()
 await eventually(()=>value('!!document.querySelector("[data-session-seconds]") || document.querySelector(".sidebar-footer")?.textContent.includes("this session")'))
 await value(`(()=>{const input=document.querySelector('.searchbar input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify('https://www.youtube.com/live/'+stream.id)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`)
 await value('document.querySelector(".searchbar").requestSubmit()')
 await eventually(()=>value('document.querySelector(".live-control [role=status]")?.textContent==="Live stream"'),40000)
 const videoTarget=await eventually(async()=>(await pages()).find(p=>p.type==='iframe'&&new URL(p.url).pathname==='/embed/'+stream.id))
 const videoSocket=await connect(videoTarget)
 try{
   if(checkSession){
     const before=await value('Number(document.querySelector("[data-session-seconds]").dataset.sessionSeconds)')
     await eventually(()=>value(`Number(document.querySelector("[data-session-seconds]").dataset.sessionSeconds)>=${before+2}`),6000)
     await value('[...document.querySelectorAll("button")].find(b=>/^Pause\\b/.test(b.getAttribute("aria-label")??"")&&b.getClientRects().length).click()',videoSocket)
     await eventually(()=>value('document.querySelector("video")?.paused',videoSocket))
     await wait(1100)
     const paused=await value('Number(document.querySelector("[data-session-seconds]").dataset.sessionSeconds)')
     await wait(2400)
     assert.equal(await value('Number(document.querySelector("[data-session-seconds]").dataset.sessionSeconds)'),paused,'session time must stop while paused')
     await value('[...document.querySelectorAll("button")].find(b=>/^Play\\b/.test(b.getAttribute("aria-label")??"")&&b.getClientRects().length).click()',videoSocket)
     await eventually(()=>value(`Number(document.querySelector("[data-session-seconds]").dataset.sessionSeconds)>=${paused+2}`),7000)
     await value(`document.querySelector('.sidebar button[aria-label="Home"]').click()`)
     await wait(1200)
     const left=await value('Number(document.querySelector("[data-session-seconds]").dataset.sessionSeconds)')
     await wait(2200)
     assert.equal(await value('Number(document.querySelector("[data-session-seconds]").dataset.sessionSeconds)'),left,'leaving the player must stop counting')
     console.log('Session time advanced each second with progress disabled, paused, resumed, and stopped on leaving the player.')
     return
   }
   const settings='.ytp-settings-button,button[aria-label="Playback Settings"]'
   try{await eventually(()=>value(`!!document.querySelector(${JSON.stringify(settings)})`,videoSocket),20000)}
   catch(e){throw Error('The quality control was not found: '+JSON.stringify(await value('({title:document.title,url:location.href,buttons:[...document.querySelectorAll("button")].slice(0,15).map(b=>({label:b.getAttribute("aria-label"),className:b.className}))})',videoSocket)),{cause:e})}
   await value(`document.querySelector(${JSON.stringify(settings)}).click()`,videoSocket)
   console.log('Player settings: '+await value('document.body.innerText.slice(-1400)',videoSocket))
   const menuItems='button,[role="menuitem"],.ytp-menuitem,ytm-menu-item'
   await eventually(()=>value(`[...document.querySelectorAll(${JSON.stringify(menuItems)})].some(e=>/^Quality\\b/.test(e.innerText.trim()))`,videoSocket))
   await value(`[...document.querySelectorAll(${JSON.stringify(menuItems)})].find(e=>/^Quality\\b/.test(e.innerText.trim())).click()`,videoSocket)
   const options=await eventually(()=>value(`(()=>{const options=[...document.querySelectorAll(${JSON.stringify(menuItems)})].map(e=>e.innerText.trim()).filter(Boolean);return options.some(s=>s.includes("1080"))?options:undefined})()`,videoSocket))
   console.log('YouTube quality options: '+JSON.stringify(options))
   await value(`[...document.querySelectorAll(${JSON.stringify(menuItems)})].find(e=>/^1080/.test(e.innerText.trim())&&!e.innerText.includes("Premium")).click()`,videoSocket)
   await eventually(()=>value('document.querySelector("video")?.videoHeight>=1080',videoSocket),40000)
   const frame=await value('new Promise((resolve,reject)=>{const v=document.querySelector("video");const timer=setTimeout(()=>reject(Error("No decoded video frame arrived")),8000);v.requestVideoFrameCallback((_,m)=>{clearTimeout(timer);resolve({width:m.width,height:m.height,presentedFrames:m.presentedFrames})})})',videoSocket)
   assert.ok(frame.height>=1080,'the rendered frame must actually be 1080p')
   const dimensions=await value('(()=>{const v=document.querySelector("video"),q=v.getVideoPlaybackQuality?.();return {decodedWidth:v.videoWidth,decodedHeight:v.videoHeight,displayWidth:v.clientWidth,displayHeight:v.clientHeight,devicePixelRatio,droppedFrames:q?.droppedVideoFrames,totalFrames:q?.totalVideoFrames}})()',videoSocket)
   console.log('Actual live playback after choosing 1080p: '+JSON.stringify(dimensions))
   console.log('Confirmed rendered video frame: '+JSON.stringify(frame))
 }finally{videoSocket.close()}
}
async function publicUploads() {
 const id='UC_x5XG1OV2P6uZZ5FSM9Ttw'
 const xml=await value(`window.__TAURI_INTERNALS__.invoke('public_feed',{id:${JSON.stringify(id)}})`)
 assert.match(xml,/<yt:videoId>[\w-]{11}<\/yt:videoId>/)
 console.log('YouTube returned a real public Atom feed without credentials.')
 await value(`document.querySelector('.sidebar button[aria-label="Manage follows"]').click()`)
 await eventually(()=>value('document.querySelector("h1")?.textContent === "Manage follows"'))
 await value(`(() => {
   const input=document.querySelector('input[aria-label="Channel ID or link"]')
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify('https://www.youtube.com/channel/'+id)})
   input.dispatchEvent(new Event('input',{bubbles:true}))
 })()`)
 await eventually(()=>value(`!document.querySelector('.filter-row button').disabled`))
 await value(`document.querySelector('form.filter-row').requestSubmit()`)
 await eventually(()=>value(`document.querySelector('.list-row .video-title')?.textContent === 'Google for Developers'`))
 console.log('Following a channel by its public URL passed.')
 await value(`document.querySelector('.sidebar button[aria-label="Following"]').click()`)
 await eventually(()=>value('document.querySelectorAll(".card").length>0'))
 const count=await value('document.querySelectorAll(".card").length')
 const displayed=await value(`[...document.querySelectorAll('.card .thumbnail img')].map(img=>new URL(img.src).pathname.split('/')[2])`)
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
 await value('document.querySelector(".card .thumbnail:not(:has(.short-badge))").click()')
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
 try {
   await eventually(()=>value(`window.__TAURI_INTERNALS__.invoke("load").then(d=>!!d.history[${JSON.stringify(video)}])`),30000)
 } catch(e) {
   const status=await value('document.querySelector(".watch .notice")?.textContent')
   throw Error('The live embed did not start playback: '+(status??e.message))
 }
 await value(`Array.from(document.querySelectorAll('.watch button')).find(b=>b.textContent.trim()==='Watch Later').click()`)
 await eventually(()=>value(`window.__TAURI_INTERNALS__.invoke("load").then(d=>d.later.includes(${JSON.stringify(video)}))`))
 await value(`Array.from(document.querySelectorAll('.watch button')).find(b=>b.textContent.trim()==='Share').click()`)
 assert.match(await value('document.querySelector(".watch input[readonly]").value'),/https:\/\/www\.youtube\.com\/watch\?v=/)
 await value('document.querySelector(".share-panel .icon").click()')
 assert.equal(await value('!!document.querySelector(".share-panel")'),false)
 await value(`[...document.querySelectorAll('.watch button')].find(b=>b.textContent.trim()==='Share').click()`)
 const copy=await value(`(()=>{const b=document.querySelector('.share-panel .accent');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
 await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...copy})
 await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...copy})
 await eventually(()=>value('!document.querySelector(".share-panel") && document.querySelector(".watch [role=status]")?.textContent==="Link copied."'))
 await eventually(()=>value('window.__TAURI_INTERNALS__.invoke("load").then(d=>d.interests.Technology>=1)'))
 await value(`document.querySelector('.sidebar button[aria-label="Discover"]').click()`)
 await eventually(()=>value('document.querySelectorAll(".category-chip")[1]?.textContent==="Technology"'))
 console.log('Live keyless playback and Watch Later passed.')
 await value(`document.querySelector('.sidebar-follows button[title="Google for Developers"]').click()`)
 await eventually(()=>value('document.querySelector("h1")?.textContent==="Google for Developers" && !!document.querySelector(".creator-banner")?.naturalWidth && !!document.querySelector(".creator-identity .creator-dot img")?.naturalWidth'),35000)
 await value(`[...document.querySelectorAll('.creator-tabs button')].find(b=>b.textContent==='Videos').click()`)
 await eventually(()=>value('document.querySelectorAll(".creator-page .thumbnail").length>0'),30000)
 await value(`[...document.querySelectorAll('.creator-tabs button')].find(b=>b.textContent==='Past streams').click()`)
 await eventually(()=>value('document.querySelector(".creator-tabs button[aria-pressed=true]")?.textContent==="Past streams" && document.querySelectorAll(".thumbnail").length>0'),30000)
 console.log('Public channel uploads and streams rendered as PureTube cards.')
}
async function cleanFollows() {
 await value(`document.querySelector('.sidebar button[aria-label="Manage follows"]').click()`)
 await eventually(()=>value('document.querySelector("h1")?.textContent==="Manage follows"'))
 assert.equal(await value('document.querySelector("main").textContent.includes("Import follows from CSV")'),false)
 assert.equal(await value(`!!document.querySelector('input[placeholder="Group name"]')`),false)
 console.log('Manage follows shows the local follow list without CSV or groups.')
}
async function close() {
 ws?.close();ws=undefined
 if(child?.pid && child.exitCode===null){
   const closeWindow=()=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`(Get-Process -Id ${child.pid} -ErrorAction SilentlyContinue).CloseMainWindow() | Out-Null`],{windowsHide:true,stdio:'ignore'})
   closeWindow()
   try{await eventually(()=>child.exitCode!==null,2500)}catch{
     // The YouTube window might have been active, so close the remaining app window.
     closeWindow()
     await eventually(()=>child.exitCode!==null,12000)
   }
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
 await eventually(()=>value('document.querySelector("h1")?.textContent === "Home"'))
 assert.equal(await value('document.documentElement.dataset.theme'),'dark')
 assert.equal(await value('document.documentElement.dataset.accent'),'rose')
 await value(`document.querySelector('[aria-label="Maximize window"]').click()`)
 await eventually(()=>value(`!!document.querySelector('[aria-label="Restore window"]')`))
 assert.ok(await value('Math.abs(document.querySelector(".window-close").getBoundingClientRect().right-innerWidth)<2'))
 await value(`document.querySelector('[aria-label="Restore window"]').click()`)
 await eventually(()=>value(`!!document.querySelector('[aria-label="Maximize window"]')`))
 assert.equal(await value('!!document.querySelector(".sidebar [aria-label=Discover]")'),true)
 assert.equal(await value('window.__TAURI_INTERNALS__.invoke("youtube_account",{action:"mine"}).then(()=>false,()=>true)'),true)
 await value(`document.querySelector('.sidebar button[aria-label="Your profile"]').click()`)
 await eventually(()=>value('document.querySelector("h1")?.textContent==="Your profile"'))
 await value(`(() => { const input=document.querySelector('.profile-name-form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Nova'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
 await value(`document.querySelector('.profile-name-form').requestSubmit()`)
 await eventually(()=>value('window.__TAURI_INTERNALS__.invoke("load").then(d=>d.profileName==="Nova")'))
 await value(`document.querySelector('.sidebar button[aria-label="Home"]').click()`)
 if(live){
   await eventually(()=>value('[...document.querySelectorAll(".studio-shelf .thumbnail img")].slice(0,8).filter(i=>i.complete&&i.naturalWidth>0).length>=4'),35000)
   const png=await call('Page.captureScreenshot',{format:'png'})
   writeFileSync(resolve('src-tauri/target/PureTube-0.9.0-home.png'),Buffer.from(png.data,'base64'))
 }
 await value(`document.querySelector('[aria-label="Switch to light theme"]').click()`)
 await eventually(()=>value('window.__TAURI_INTERNALS__.invoke("load").then(d=>d.settings.theme==="light")'))
 await value(`document.querySelector('.sidebar button[aria-label="Settings"]').click()`)
 await eventually(()=>value('document.querySelector("h1")?.textContent === "Settings"'))
 assert.ok(await value('Array.from(document.querySelectorAll("h2")).some(h=>h.textContent.includes("Privacy and library"))'))
 await value(`[...document.querySelectorAll('.palette-option')].find(b=>b.textContent==='Jade Porcelain').click()`)
 await eventually(()=>value('document.documentElement.dataset.accent==="jade" && window.__TAURI_INTERNALS__.invoke("load").then(d=>d.settings.accent==="jade")'))
 assert.equal(await value('getComputedStyle(document.documentElement).colorScheme'),'light')
 await eventually(()=>value('Array.from(document.querySelectorAll("section")).some(section=>section.textContent.includes("Signed updates are not configured for this build"))'))
 await close()
 await launch()
 await eventually(()=>value('document.querySelector("h1")?.textContent === "Home" && document.documentElement.dataset.theme === "light" && document.documentElement.dataset.accent === "jade" && document.querySelector(".profile-chip")?.textContent==="N"'))
 console.log('Local profile name and theme persisted after restart.')
 if(live){
   await eventually(()=>value('document.querySelectorAll(".studio-shelf .thumbnail img").length>=8'))
   const homeIds=await value(`[...document.querySelectorAll(".studio-shelf .thumbnail img")].map(img=>img.src)`)
   await eventually(()=>value('[...document.querySelectorAll(".studio-shelf .thumbnail img")].slice(0,6).every(i=>i.complete&&i.naturalWidth>0)'),35000)
   const light=await call('Page.captureScreenshot',{format:'png'})
   writeFileSync(resolve('src-tauri/target/PureTube-0.9.0-jade-porcelain.png'),Buffer.from(light.data,'base64'))
   await value(`document.querySelector('.sidebar button[aria-label="Discover"]').click()`)
   await eventually(()=>value('document.querySelectorAll(".category-track .category-chip").length>=12'))
   await value(`document.querySelector('[aria-label="Next categories"]').click()`)
   await eventually(()=>value('document.querySelector(".category-track").scrollLeft>0'))
   await value(`[...document.querySelectorAll('.category-chip')].find(b=>b.textContent==='Space').click()`)
   await eventually(()=>value('document.querySelector(".category-chip[aria-pressed=true]").textContent==="Space" && document.querySelectorAll(".studio-shelf .thumbnail").length>0'))
   await value(`[...document.querySelectorAll('.category-chip')].find(b=>b.textContent==='Style & beauty').click()`)
   await eventually(()=>value('document.querySelector(".category-chip[aria-pressed=true]").textContent==="Style & beauty" && document.querySelectorAll(".studio-shelf .card").length>0'))
   const discoverIds=await value(`[...document.querySelectorAll(".studio-shelf .thumbnail img")].map(img=>img.src)`)
   assert.ok(discoverIds.length>0&&discoverIds.every(id=>!homeIds.includes(id)),'Home and Discover must offer different videos')
   console.log('Discover showed a different selection than Home and switched topics.')
   await value(`(() => { const input=document.querySelector('.searchbar input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'NASA'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
   await value(`document.querySelector('.searchbar').requestSubmit()`)
   await eventually(()=>value('document.querySelector("h1")?.textContent==="Search results" && document.querySelector(".search-banner button")?.textContent.includes("Newest first")'))
   await value(`[...document.querySelectorAll(".search-banner button")].find(b=>b.textContent==="Recent uploads").click()`)
   await eventually(()=>value('[...document.querySelectorAll(".studio-shelf .byline")].some(b=>b.textContent==="NASA")'))
   assert.equal(await value('!!document.querySelector(".google-panel, .sidebar [aria-label=\'Your YouTube\']")'),false)
   console.log('Recent uploads search passed.')
   await value(`document.querySelector('.sidebar button[aria-label="Live"]').click()`)
   await eventually(()=>value('document.querySelector("h1")?.textContent==="Live streams"'))
   await eventually(()=>value('document.querySelectorAll(".live-badge").length>0'),30000)
   assert.ok(await value('document.querySelectorAll(".live-badge").length===document.querySelectorAll(".studio-shelf .thumbnail").length'))
   await value(`(() => { const input=document.querySelector('.searchbar input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'https://www.youtube.com/shorts/jNQXAC9IVRw'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
   await value(`document.querySelector('.searchbar').requestSubmit()`)
   await eventually(()=>value('document.querySelector(".notice")?.textContent.includes("Shorts are not available")'))
   console.log('Live listed live streams only; Shorts links were rejected.')
   await scheduledStreams()
   await suggestionsAndScroll()
   await publicUploads()
 }
 await cleanFollows()
 if(live||youtubeOnly) await nativeSearch()
 if(live) await collaboratorLinks()
 if(live) await liveReminderNotice()
 if(live||process.env.PURETUBE_DASHIE_SMOKE==='1'){await dashieLive();await hoverPreview()}
 else if(process.env.PURETUBE_CHAT_SMOKE==='1')await dashieLive()
 else if(process.env.PURETUBE_HOVER_SMOKE==='1')await hoverPreview()
 if(live||process.env.PURETUBE_RECOMMENDATIONS_SMOKE==='1')await recommendationMix()
 if(process.env.PURETUBE_PLAYBACK_SMOKE==='1')await playbackAudit(true)
 if(process.env.PURETUBE_QUALITY_SMOKE==='1')await playbackAudit(false)
 if(process.env.PURETUBE_LIFECYCLE_SMOKE==='1')await lifecycle()
 if(process.env.PURETUBE_UI_SMOKE==='1')await redesign()
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
