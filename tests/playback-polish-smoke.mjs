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
 const data=await invoke('load')??{version:1,settings:{}}
 const sample=(id,title)=>({id,title,channelId:'UC4QobU6STFB0P71PMvOGN5A',channel:'jawed',description:'',date:'2020-01-01',duration:600,image:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg',shorts:false,embeddable:true,paid:false,views:'1,234 views'})
 await invoke('save',{data:{...data,history:{jNQXAC9IVRw:100,'M7lc1UVf-VE':200},progress:{jNQXAC9IVRw:{at:19,duration:19,updated:100},'M7lc1UVf-VE':{at:20,duration:600,updated:200}},savedVideos:{jNQXAC9IVRw:sample('jNQXAC9IVRw','Finished sample'),'M7lc1UVf-VE':sample('M7lc1UVf-VE','Unfinished sample')},settings:{...data.settings,focus:true,autoplay:false,tray:false,intro:false}}})
 await value('window.__oldDocument=true');await call('Page.reload');await eventually(()=>value('window.__oldDocument!==true&&!!document.querySelector(".top-menu:not(:disabled)")'))
 assert.equal(await value('!!document.querySelector(".app.focus")'),false)
 await navigate('History');await eventually(()=>value('document.body.innerText.includes("Finished videos")'))
 await value('[...document.querySelectorAll(".history-tabs button")].find(b=>b.textContent==="Finished videos").click()')
 assert.equal(await value('document.querySelectorAll(".list-row").length'),1)
 assert.ok(await value('document.querySelector(".list-row").textContent.includes("Finished sample")'))
 await value('[...document.querySelectorAll(".history-tabs button")].find(b=>b.textContent==="Unfinished videos").click()')
 assert.ok(await value('document.querySelector(".list-row").textContent.includes("Unfinished sample")'))
 await value('window.confirm=()=>true;[...document.querySelectorAll("button")].find(b=>b.textContent==="Clear history").click()')
 await eventually(async()=>{const d=await invoke('load');return Object.keys(d.history).length===0&&Object.keys(d.progress).length===0})
 await navigate('Home');await eventually(()=>value('!!document.querySelector(".card .thumbnail")'),60000)
 await value('document.querySelector(".card .thumbnail").dispatchEvent(new MouseEvent("mouseover",{bubbles:true}))')
 await wait(1600)
 assert.equal(await value('document.querySelectorAll(".thumbnail iframe").length'),0)
 await value('document.querySelector(".card .thumbnail").dispatchEvent(new MouseEvent("mouseout",{bubbles:true}))')
 await openVideo('M7lc1UVf-VE')
 assert.equal(await value(`!!document.querySelector('[aria-label="Focus Player"]')`),false)
 await eventually(()=>value('!!document.querySelector(".up-next-card")'),60000)
 assert.ok(await value('document.querySelector(".up-next-card").querySelectorAll("small").length>=2'))
 await value('document.querySelector(".up-next-queue:not(:disabled)").click()')
 await eventually(()=>value('!!document.querySelector(".viddy-toast")'))
 await eventually(()=>value('!document.querySelector(".viddy-toast")'),6000)
 await value('document.querySelector(".watch-creator .byline button").click()')
 await eventually(()=>value('!!document.querySelector(".channel-page")||!!document.querySelector(".channel-profile")||document.body.innerText.includes("Past streams")'))
 assert.ok(await value('!!document.querySelector(".back")'))
 await value('document.querySelector(".back").click()')
 await eventually(()=>value('!!document.querySelector(".watch:not(.watch-docked)")'))
 await value('[...document.querySelectorAll(".watch-view-controls button")].find(b=>b.textContent.includes("Pop out")).click()')
 const mini=await connect(await eventually(async()=>(await pages()).find(p=>p.url.includes('mini=1'))))
 await eventually(()=>value('!!document.querySelector(".mini-player .player iframe")',mini))
 const bounds=await value('(()=>{const h=document.querySelector(".mini-player>header").getBoundingClientRect(),p=document.querySelector(".mini-player>.player").getBoundingClientRect(),a=document.querySelector(".mini-player>.up-next").getBoundingClientRect();return {header:h.bottom,top:p.top,bottom:p.bottom,auto:a.top,scroll:document.documentElement.scrollHeight,view:innerHeight}})()',mini)
 assert.ok(bounds.header<=bounds.top+1&&bounds.bottom<=bounds.auto+1,'popout controls must be outside the video')
 assert.ok(bounds.scroll<=bounds.view+1,'popout must not scroll')
 const shot=await call('Page.captureScreenshot',{format:'png'},mini);writeFileSync(resolve('src-tauri/target/Viddy-0.15-popout.png'),Buffer.from(shot.data,'base64'))
 await invoke('close_player');mini.close()
 console.log('Passed: focus removed, Finished/Unfinished filters and mass clear, clean previews, Up next metadata, fading queue toast, creator link/back navigation, and separate popout controls without scrolling.')
}catch(error){try{console.log('Failure: '+await value('document.body.innerText.slice(-1600)'))}catch{}throw error}
finally{try{await invoke('close_player');await value('setTimeout(()=>document.querySelector(".window-close").click(),100)');await eventually(()=>child.exitCode!==null,10000)}catch{child.kill()}ws?.close();assert.ok(root.startsWith(join(process.env.TEMP,'puretube-features-')));rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:300})}
