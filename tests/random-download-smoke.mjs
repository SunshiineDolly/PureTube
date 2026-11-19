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

try{
 ws=await connect(await eventually(async()=>(await pages()).find(p=>p.type==='page'&&p.url.includes('tauri.localhost'))))
 await eventually(()=>value('!!document.querySelector(".top-menu:not(:disabled)")'))
 const follows=['UCERUmrDh9hmqEXBsnYFNTIA','UC_x5XG1OV2P6uZZ5FSM9Ttw']
 const data=await invoke('load')??{version:1,settings:{}}
 await invoke('save',{data:{...data,follows,settings:{...data.settings,autoplay:false,tray:false,intro:false}}})
 await value('window.__oldDocument=true');await call('Page.reload');await eventually(()=>value('window.__oldDocument!==true&&!!document.querySelector(".top-menu:not(:disabled)")'))
 for(const page of ['Home','Discover','Following']){
   await navigate(page)
   await eventually(()=>value('!!document.querySelector(".random-watch:not(:disabled)")'),60000)
   await value('document.querySelector(".random-watch").click()')
   await eventually(()=>value('!!document.querySelector(".watch:not(.watch-docked) .player iframe")'))
   const id=await value('new URL(document.querySelector(".player iframe").src).pathname.split("/").pop()')
   if(page==='Following'){
     const saved=await eventually(async()=>{const d=await invoke('load');return d?.savedVideos?.[id]})
     assert.ok(follows.includes(saved.channelId),'Following random video must belong to a followed creator')
   }
   assert.equal(await value('!!document.querySelector(".viddy-transport")'),false)
   assert.equal(await value('new URL(document.querySelector(".player iframe").src).searchParams.get("controls")'),'1')
   await navigate('Downloads')
   await eventually(()=>value('!!document.querySelector(".watch-docked")'))
   assert.equal(await value(`document.querySelector('[aria-label="Return to video page"]').textContent.trim()`),'')
   assert.ok(await value(`!!document.querySelector('[aria-label="Return to video page"] svg')`))
   await value(`document.querySelector('[aria-label="Return to video page"]').click()`)
   await eventually(()=>value('!!document.querySelector(".watch:not(.watch-docked)")'))
 }
 await invoke('download_set_directory',{directory:join(root,'saved-videos')})
 const job=await invoke('download_video',{videoId:'jNQXAC9IVRw',title:'Me at the zoo',quality:1080})
 await navigate('Downloads')
 let complete;const until=Date.now()+150000
 while(Date.now()<until){const j=(await invoke('download_list')).find(j=>j.id===job);if(j?.status==='failed')throw Error(j.message);if(j?.status==='complete'){complete=j;break}await wait(500)}
 assert.ok(complete?.file&&existsSync(complete.file)&&statSync(complete.file).size>10000,'download must save a real file')
 const tools=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'PureTube/download-tools') -Filter ffprobe.exe -Recurse | Select-Object -First 1 -ExpandProperty FullName | ConvertTo-Json"],{encoding:'utf8',windowsHide:true}))
 const probe=JSON.parse(execFileSync(tools,['-v','error','-show_streams','-of','json',complete.file],{encoding:'utf8',windowsHide:true}))
 assert.ok(probe.streams.some(s=>s.codec_type==='video')&&probe.streams.some(s=>s.codec_type==='audio'),'download must include audio and video')
 console.log('Passed: Random watch opens videos on Home/Discover/Following, Following stays within follows, return arrow restores video, YouTube controls remain, and a real download includes audio and video ('+statSync(complete.file).size+' bytes).')
}catch(error){try{console.log('Failure: '+await value('document.body.innerText.slice(-1200)'))}catch{}throw error}
finally{try{await value('setTimeout(()=>document.querySelector(".window-close").click(),100)');await eventually(()=>child.exitCode!==null,10000)}catch{child.kill()}ws?.close();assert.ok(root.startsWith(join(process.env.TEMP,'puretube-features-')));rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:300})}
