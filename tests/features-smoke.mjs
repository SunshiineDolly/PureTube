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
const follows=['UCERUmrDh9hmqEXBsnYFNTIA','UC_x5XG1OV2P6uZZ5FSM9Ttw']
const report={queries:[],home:0,discover:0,homeGenres:[],download:null}
try{
 ws=await connect(await eventually(async()=>(await pages()).find(p=>p.type==='page'&&p.url.includes('tauri.localhost'))))
 await eventually(()=>value('!!document.querySelector(".sidebar")'))
 const data=await invoke('load')??{version:1,settings:{}}
 await invoke('save',{data:{...data,follows,profileName:'Feature test',interests:{Gaming:12,'Style & beauty':5},settings:{...data.settings,showTime:true,autoplay:true}}})
 await call('Page.reload')
 await eventually(()=>value('document.querySelector(".profile-chip")?.textContent==="F"'))
 if(process.env.PURETUBE_FEATURES_ONLY!=='1'){
 await eventually(()=>value('document.querySelectorAll(".recommendations .card").length>=9&&[...document.querySelectorAll(".heading button")].some(b=>b.textContent.includes("New mix")&&!b.disabled)'),60000)
 const home=await value('[...document.querySelectorAll(".recommendations .card")].map(c=>c.dataset.videoId)')
 report.home=home.length;report.homeGenres=await value('[...new Set([...document.querySelectorAll(".recommendation-reason>span")].map(e=>e.textContent))]')
 assert.ok(report.homeGenres.length>=3,'Home must mix at least three genres')
 await value('document.querySelector(".recommendations [data-scroll-sentinel]").scrollIntoView()')
 await eventually(()=>value('document.querySelectorAll(".recommendations .card").length>'+home.length),50000)
 await navigate('Discover')
 await eventually(()=>value('document.querySelectorAll(".recommendations .card").length>=9&& !document.querySelector(".recommendation-toolbar button").disabled'),60000)
 const discover=await value('[...document.querySelectorAll(".recommendations .card")].map(c=>c.dataset.videoId)')
 report.discover=discover.length
 assert.ok(discover.every(id=>!home.includes(id)),'Discover must offer different videos')
 for(const query of ['gyaru makeup tutorial','minecraft survival gameplay','jazz studio performance','NASA space documentary','料理 レシピ','football highlights']){
  let page
  for(let attempt=0;attempt<3;attempt++){try{page=await invoke('search_youtube',{query,filter:'all',cursor:null});break}catch(error){console.log('Search retry: '+error.message);if(attempt===2)throw error;await wait(3000*(attempt+1))}}
  console.log('Auditing '+query+': '+page.items.length+' videos on the first page')
  assert.ok(page.items.length>=1,'public search must return videos for '+query)
  assert.ok(page.items.every(v=>!v.shorts),'Shorts must be absent')
  const entry={query,firstPage:page.items.length,secondPage:0}
  let cursor=page.next
  for(let i=0;cursor&&i<3;i++){const more=await invoke('search_youtube',{query,filter:'all',cursor});entry.secondPage+=more.items.filter(v=>!page.items.some(old=>old.id===v.id)).length;cursor=more.next;if(entry.secondPage>0)break}
  report.queries.push(entry)
 }
 console.log('Discovery audit: '+JSON.stringify({home:report.home,genres:report.homeGenres,discover:report.discover,queries:report.queries}))
 await navigate('Following')
 await eventually(()=>value('document.querySelectorAll(".video-grid .card").length>5'),50000)
 const select=()=>value(`(()=>{const s=document.querySelector('.filter-row select');s.value=${JSON.stringify(follows[0])};s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
 await select();await eventually(()=>value('document.querySelectorAll(".video-grid .card").length>5'))
 const initial=await value('document.querySelectorAll(".video-grid .card").length')
 await value('document.querySelector("[data-scroll-sentinel]").scrollIntoView()')
 await eventually(()=>value('document.querySelectorAll(".video-grid .card").length>'+initial),50000)
 const bylines=await value('[...document.querySelectorAll(".video-grid .byline")].map(e=>e.textContent.trim())')
 const owners=await value('[...document.querySelectorAll(".video-grid .card")].map(e=>e.dataset.channelId)')
 assert.ok(owners.length>initial&&owners.every(id=>id===follows[0]),'Following must contain only the selected followed creator')
 assert.ok(bylines.every(name=>name&&name!=='Creator'),'older uploads must retain their creator names')
 console.log('Following showed only the selected followed creator and loaded older uploads automatically.')
 }
 if(process.env.PURETUBE_DOWNLOAD_ONLY!=='1'){
 await watchZoo();await endVideo()
 await eventually(()=>value('!!document.querySelector(".autoplay-countdown")'))
 await value(`document.querySelector('[aria-label="Cancel autoplay"]').click()`)
 await wait(9000)
 assert.ok(await value('document.querySelector(".player iframe")?.src.includes("jNQXAC9IVRw")'),'Cancel must keep the current video')
 await navigate('Home');await watchZoo();await endVideo()
 await eventually(()=>value('!!document.querySelector(".autoplay-countdown")'))
 await eventually(()=>value('!!document.querySelector(".player iframe")&&!document.querySelector(".player iframe").src.includes("jNQXAC9IVRw")'),18000)
 console.log('Autoplay offered real recommendations, honored Cancel, then advanced to the next video after its countdown.')
 await value(`[...document.querySelectorAll('.watch-actions button')].find(b=>b.textContent.includes('Pop out')).click()`)
 const miniTarget=await eventually(async()=>(await pages()).find(p=>p.type==='page'&&p.url.includes('mini=1')))
 const mini=await connect(miniTarget)
 try{
  await eventually(()=>value('!!document.querySelector(".player iframe")',mini))
  await invoke('player_sample',{videoId:'AAAAAAAAAAA',position:999,duration:999,elapsed:1,started:false},mini)
  assert.notEqual((await invoke('player_state',{},mini)).start,999,'a stale sample must not change another video’s playback position')
  assert.equal(await value('!!document.querySelector(".watch .player iframe")'),false,'handoff must stop the main player')
  await value(`document.querySelector('[aria-label="Unpin player"]').click()`,mini)
  await eventually(()=>value(`!!document.querySelector('[aria-label="Pin player"]')`,mini))
  await value(`document.querySelector('[aria-label="Pin player"]').click()`,mini)
  await eventually(()=>value(`!!document.querySelector('[aria-label="Unpin player"]')`,mini))
  assert.equal(await invoke('save',{data:{}},mini).then(()=>false,()=>true),true,'mini player cannot overwrite the library')
  await value('document.querySelector(".autoplay-toggle input").click()',mini)
  await eventually(async()=>!(await invoke('load')).settings.autoplay)
  await value(`document.querySelector('[aria-label="Return player to main window"]').click()`,mini)
 }finally{mini.close()}
 await eventually(()=>value('!!document.querySelector(".watch .player iframe")'))
 assert.equal((await pages()).filter(p=>p.type==='page'&&p.url.includes('mini=1')).length,0)
 console.log('The separate mini player played, stopped duplicate audio in the main player, toggled pinning, synchronized autoplay, and returned playback to the main window.')
 }
 assert.equal(await invoke('download_video',{videoId:'../bad',title:'Invalid',quality:1080}).then(()=>false,()=>true),true)
 const job=await invoke('download_video',{videoId:'jNQXAC9IVRw',title:'Me at the zoo',quality:720})
 await navigate('Downloads')
 const complete=await eventually(async()=>{const j=(await invoke('download_list')).find(j=>j.id===job);if(j?.status==='failed')throw Error(j.message);return j?.status==='complete'?j:false},360000)
 assert.ok(complete.file&&existsSync(complete.file)&&statSync(complete.file).size>10000)
 const localFile=complete.file.startsWith('\\\\?\\')?complete.file.slice(4):complete.file
 assert.ok(resolve(localFile).startsWith(resolve(root)),'test downloads must stay in the isolated profile')
 report.download={status:complete.status,bytes:statSync(complete.file).size}
 const cancelled=await invoke('download_video',{videoId:'jNQXAC9IVRw',title:'Cancel test',quality:720})
 await invoke('download_cancel',{id:cancelled})
 await eventually(async()=>(await invoke('download_list')).some(j=>j.id===cancelled&&j.status==='cancelled'),20000)
 assert.ok(existsSync(complete.file),'cancellation must preserve the already completed video')
 const tools=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'PureTube/download-tools') -Filter ffprobe.exe -Recurse | Select-Object -First 1 -ExpandProperty FullName | ConvertTo-Json`],{encoding:'utf8',windowsHide:true}))
 const probe=JSON.parse(execFileSync(tools,['-v','error','-show_streams','-of','json',complete.file],{encoding:'utf8',windowsHide:true}))
 assert.ok(probe.streams.some(s=>s.codec_type==='video')&&probe.streams.some(s=>s.codec_type==='audio'),'downloaded file must contain both video and audio')
 console.log('A real public video downloaded successfully with audio and video; progress and completion appeared in Downloads.')
 const shot=await call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve('src-tauri/target/PureTube-0.10.0-downloads.png'),Buffer.from(shot.data,'base64'))
 if(report.queries.length)writeFileSync(resolve('src-tauri/target/PureTube-0.10.0-audit.json'),JSON.stringify(report,null,2))
 console.log('All new feature checks passed.')
}catch(error){
 try{console.log('Failure state: '+JSON.stringify(await value('({title:document.querySelector("h1")?.textContent,notices:[...document.querySelectorAll(".notice")].map(e=>e.textContent),player:document.querySelector(".player iframe")?.src,upNext:document.querySelectorAll(".up-next-card").length})')));console.log('Pages: '+JSON.stringify((await pages()).map(p=>({type:p.type,url:p.url}))));const shot=await call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve('src-tauri/target/PureTube-feature-failure.png'),Buffer.from(shot.data,'base64'))}catch{}
 throw error
}finally{
 try{await value('setTimeout(()=>document.querySelector(".window-close").click(),100)');await eventually(()=>child.exitCode!==null,10000)}catch{child.kill()}
 ws?.close()
 assert.ok(root.startsWith(join(process.env.TEMP,'puretube-features-')))
 rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:300})
}
