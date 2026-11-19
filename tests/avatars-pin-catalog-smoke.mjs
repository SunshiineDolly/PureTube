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
 const {DatabaseSync}=await import('node:sqlite'),db=new DatabaseSync(join(process.env.APPDATA,'app.puretube.desktop','library.sqlite3'),{readOnly:true})
 const follows=JSON.parse(db.prepare('SELECT data FROM library WHERE id=1').get().data).follows;db.close()
 const data=await invoke('load')??{version:1,settings:{}}
 await invoke('save',{data:{...data,follows,settings:{...data.settings,autoplay:false,tray:false,intro:false}}})
 await value('window.__oldDocument=true');await call('Page.reload');await eventually(()=>value('window.__oldDocument!==true&&!!document.querySelector(".top-menu:not(:disabled)")'))
 await navigate('Manage channels');await eventually(()=>value('document.querySelectorAll(".list-row .creator-dot").length==='+follows.length))
 await value('document.querySelector(".list-row:last-child").scrollIntoView()')
 await eventually(()=>value('document.querySelectorAll(".list-row .creator-dot img").length==='+follows.length+'&&[...document.querySelectorAll(".list-row .creator-dot img")].every(i=>i.complete&&i.naturalWidth>0)'),75000)
 console.log('All '+follows.length+' followed-channel profile pictures loaded.')
 await openVideo('M7lc1UVf-VE');await eventually(()=>value('!!document.querySelector(".watch-overview h1")'))
 await value('[...document.querySelectorAll(".watch-view-controls button")].find(b=>b.textContent.includes("Pop out")).click()')
 const mini=await connect(await eventually(async()=>(await pages()).find(p=>p.url.includes('mini=1'))))
 await eventually(()=>value('!!document.querySelector(\'[aria-label="Pin player"]\')',mini))
 const windowState=(move)=>JSON.parse(execFileSync('pwsh.exe',['-NoProfile','-NonInteractive','-File',resolve('tests/player-window.ps1'),'-TargetProcessId',String(child.pid),...(move?['-Move','-Left',String(move.x),'-Top',String(move.y)]:[])],{encoding:'utf8',windowsHide:true}))
 const before=windowState();assert.equal(before.topmost,false)
 await value('document.querySelector(\'[aria-label="Pin player"]\').click()',mini)
 await eventually(()=>value('!!document.querySelector(\'[aria-label="Unpin player"]\')',mini))
 const pinned=windowState();assert.equal(pinned.topmost,true);assert.equal(pinned.resizable,false)
 assert.equal(await value('document.querySelector(".mini-title").hasAttribute("data-tauri-drag-region")',mini),false)
 const locked=windowState({x:pinned.x+80,y:pinned.y+60});assert.equal(locked.x,pinned.x);assert.equal(locked.y,pinned.y)
 await value('document.querySelector(\'[aria-label="Unpin player"]\').click()',mini)
 await eventually(()=>value('!!document.querySelector(\'[aria-label="Pin player"]\')',mini))
 const unlocked=windowState({x:pinned.x+80,y:pinned.y+60});assert.equal(unlocked.topmost,false);assert.equal(unlocked.resizable,true);assert.ok(unlocked.x!==pinned.x||unlocked.y!==pinned.y)
 await invoke('close_player');mini.close()
 console.log('Pinning set the native topmost flag, locked size/position against an attempted move, and unpinning restored movement.')
 const report=[];let continued=0
 for(const query of ['makeup tutorial','minecraft survival gameplay','jazz concert','NASA documentary','料理 レシピ','football highlights']){
   const page=await invoke('search_youtube',{query,filter:'all',cursor:null});assert.ok(page.items.length>0);assert.ok(page.items.every(v=>!v.shorts))
   let more=0;if(page.next){const next=await invoke('search_youtube',{query,filter:'all',cursor:page.next});more=next.items.filter(v=>!page.items.some(old=>old.id===v.id)).length;if(more)continued++}
   report.push({query,first:page.items.length,additional:more})
 }
 assert.ok(continued>=3,'different genres and languages must expose genuine continuation pages')
 await navigate('Live');await eventually(()=>value('document.querySelectorAll(".live-category-track button").length===17'))
 await eventually(()=>value('document.querySelectorAll(".live-browser .card").length>5&&!document.querySelector(".live-browser .heading button").disabled'),60000)
 const initial=await value('document.querySelectorAll(".live-browser .card").length')
 for(let i=0;i<3;i++){await value('document.querySelector(".live-browser [data-scroll-sentinel]").scrollIntoView()');await wait(1800)}
 const total=await value('document.querySelectorAll(".live-browser .card").length');assert.ok(total>initial,'live browsing must add videos from deferred categories as you scroll')
 console.log('Public catalog audit: '+JSON.stringify({queries:report,liveInitial:initial,liveAfterScroll:total,categories:16}))
}catch(error){try{console.log('Failure: '+await value('document.body.innerText.slice(-1200)'))}catch{}throw error}
finally{try{await invoke('close_player');await value('setTimeout(()=>document.querySelector(".window-close").click(),100)');await eventually(()=>child.exitCode!==null,10000)}catch{child.kill()}ws?.close();assert.ok(root.startsWith(join(process.env.TEMP,'puretube-features-')));rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:300})}
