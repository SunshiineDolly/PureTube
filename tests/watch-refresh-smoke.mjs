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
async function input(selector,text){await value(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`)}
async function click(text){await value(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`)}
async function shot(name){const s=await call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve('src-tauri/target/0.11-'+name+'.png'),Buffer.from(s.data,'base64'))}
const report={}
try{
 ws=await connect(await eventually(async()=>(await pages()).find(p=>p.type==='page'&&p.url.includes('tauri.localhost'))))
 await eventually(()=>value('!!document.querySelector(".sidebar")'))
 const data=await invoke('load')??{version:1,settings:{}}
 const zoo={id:'jNQXAC9IVRw',title:'Me at the zoo',channel:'jawed',channelId:'UC4QobU6STFB0P71PMvOGN5A',description:'The first YouTube video',date:'2005-04-23',duration:19,embeddable:true,shorts:false,paid:false}
 await invoke('save',{data:{...data,profileName:'Refresh test',favorites:[zoo.id],history:{[zoo.id]:Date.now()},progress:{[zoo.id]:{at:5,duration:19,updated:Date.now()}},savedVideos:{[zoo.id]:zoo},settings:{...data.settings,autoplay:false,tray:false}}})
 await call('Page.reload');await eventually(()=>value('document.querySelector(".profile-chip")?.textContent==="R"'))
 if(process.env.PURETUBE_ORIGINAL_ONLY!=='1'){
 await navigate('Your profile');await eventually(()=>value('!!document.querySelector(".profile-name-form")'))
 await input('.profile-fields input','Dolly');await input('.profile-fields textarea','Gaming, travel, and creative afternoons.')
 await value(`document.querySelector('[aria-label="Use 🎀 avatar"]').click()`);await click('Save profile');await eventually(async()=>(await invoke('load')).profileName==='Dolly')
 await value(`[...document.querySelectorAll('.profile-topic-list button')].find(b=>b.textContent==='Gaming').click()`)
 assert.ok((await invoke('load')).preferredTopics.includes('Gaming'))
 assert.equal(await value('!!document.querySelector(".personal-profile [data-route]")'),false)
 await shot('profile-dark')
 await navigate('Library');await eventually(()=>value('!!document.querySelector(".filter-row select")'))
 assert.equal(await value('document.querySelector(".filter-row select").value'),'favorites')
 assert.ok(!(await value('document.querySelector(".filter-row select").textContent')).includes('Continue watching'))
 assert.ok(await value('document.querySelector(".list").textContent.includes("Me at the zoo")'))
 await navigate('History');await click('Unfinished videos');assert.ok(await value('document.querySelector(".list").textContent.includes("26% watched")'))
 console.log('Profile, selected topics, saved titles, and the unified History/Unfinished view passed.')
 await input('.searchbar input','capsule bunny');await value('document.querySelector(".searchbar").requestSubmit()');await eventually(()=>value('document.querySelector(".searchbar input").value===""'))
 await eventually(()=>value('document.querySelectorAll(".video-grid .card").length>0'),60000)
 report.searchFirst=await value('document.querySelectorAll(".video-grid .card").length')
 await value('document.querySelector(".video-grid .card .video-title").click()')
 await eventually(()=>value('!!document.querySelector(".watch")'));await click('Back')
 await eventually(()=>value('document.querySelectorAll(".video-grid .card").length>0'))
 assert.equal(await value('document.querySelector(".searchbar input").value'),'')
 await input('.searchbar input','https://www.youtube.com/watch?v=jNQXAC9IVRw');await value('document.querySelector(".searchbar").requestSubmit()')
 await eventually(()=>value('document.querySelector(".player iframe")?.src.includes("jNQXAC9IVRw")'))
 await eventually(()=>value('document.querySelector(".watch h1")?.textContent==="Me at the zoo"'))
 assert.equal(await value("!!document.querySelector('.watch [aria-label=\"Download quality\"]')"),false)
 await value('document.querySelector(".video-comments").scrollIntoView()')
 await eventually(()=>value('document.querySelectorAll(".comment-list>.comment-row").length>0'),60000)
 report.comments=await value('document.querySelectorAll(".comment-list>.comment-row").length');report.top=await value('document.querySelectorAll(".comment-list>.comment-row")[1].dataset.commentId')
 await shot('comments-dark')
 const reply=await value('!!document.querySelector(".comment-replies-toggle")')
 if(reply){await value('document.querySelector(".comment-replies-toggle").click()');await eventually(()=>value('document.querySelectorAll(".comment-replies .comment-row").length>0'),40000);report.replies=await value('document.querySelectorAll(".comment-replies .comment-row").length')}
 await value(`(()=>{const s=document.querySelector('[aria-label="Sort comments"]');s.value='newest';s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
 await eventually(()=>value(`document.querySelectorAll('.comment-list>.comment-row')[1]?.dataset.commentId!==${JSON.stringify(report.top)}&&document.querySelectorAll('.comment-list>.comment-row').length>0`),60000)
 report.newest=await value('document.querySelectorAll(".comment-list>.comment-row")[1].dataset.commentId')
 console.log('Actual YouTube comments, replies, and server-side Top/Newest sorting passed.')
 await navigate('Settings');await eventually(()=>value('document.querySelectorAll(".palette-option").length===8'))
 await value(`(()=>{const s=document.querySelector('.settings select');s.value='light';s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
 await value(`[...document.querySelectorAll('.palette-option')].find(b=>b.textContent==='Neapolitan').click()`)
 assert.equal(await value('getComputedStyle(document.documentElement).getPropertyValue("--bg")'),'#FCF7E9')
 await navigate('Your profile');await shot('profile-light')
 await navigate('Downloads');await eventually(()=>value('!!document.querySelector(".download-preferences")'))
 const destination=join(root,'chosen-downloads');await input('[aria-label="Download destination"]',destination);await click('Save location')
 await eventually(async()=>(await invoke('download_preferences')).directory===destination)
 assert.equal((await invoke('download_set_quality',{quality:720})).quality,720)
 const job=await invoke('download_video',{videoId:zoo.id,title:'Me at the zoo'})
 const complete=await eventually(async()=>{const j=(await invoke('download_list')).find(j=>j.id===job);if(j?.status==='failed')throw Error(j.message);return j?.status==='complete'?j:false},360000)
 assert.equal(complete.quality,720);assert.ok(existsSync(complete.file));assert.ok(complete.directory.endsWith('chosen-downloads'))
 report.download={directory:complete.directory,bytes:statSync(complete.file).size}
 await shot('downloads-light')
 await value(`document.querySelector('.download-menu summary').click()`);await click('Remove from list');await eventually(async()=>(await invoke('download_list')).length===0)
 assert.ok(existsSync(complete.file),'removing an entry must preserve its file')
 const second=await invoke('download_video',{videoId:zoo.id,title:'Me at the zoo'})
 await eventually(async()=>(await invoke('download_list')).some(j=>j.id===second&&j.status==='complete'),120000)
 await value('window.confirm=()=>true');await value(`document.querySelector('.download-menu summary').click()`);await click('Delete file')
 await eventually(async()=>(await invoke('download_list')).length===0);assert.ok(!existsSync(complete.file),'explicit Delete file must delete the video')
 const cancel=await invoke('download_video',{videoId:zoo.id,title:'Cancelled entry'});await invoke('download_cancel',{id:cancel});await eventually(async()=>(await invoke('download_list')).some(j=>j.id===cancel&&j.status==='cancelled'),20000)
 await click('Clear finished entries');await eventually(async()=>(await invoke('download_list')).length===0)
 console.log('Custom download destination, saved quality, real download, remove-entry/file deletion, and cancelled-entry clearing passed.')
 }
 const search=await invoke('search_youtube',{query:"Japanese Street Fashion Explained Harajuku Global Influence Iconic Styles GPkP",filter:'all',cursor:null})
 const blocked=search.items.find(v=>v.title.includes('Japanese Street Fashion Explained'))
 assert.ok(blocked,'screenshot video should be discoverable')
 report.restrictedId=blocked.id
 const creator=await invoke('watch_creator',{id:blocked.id});assert.equal(creator.embeddable,false)
 await input('.searchbar input','https://www.youtube.com/watch?v='+blocked.id);await value('document.querySelector(".searchbar").requestSubmit()')
 await eventually(()=>value('!!document.querySelector(".original-player-card")'),45000);await click('Play in PureTube')
 const target=await eventually(async()=>(await pages()).find(p=>p.type==='page'&&p.url.startsWith('https://www.youtube.com/watch?v='+blocked.id)),30000)
 const official=await connect(target)
 try{
 await eventually(()=>value('!!document.querySelector("video")',official),60000)
 await eventually(()=>value('document.querySelector("video").videoWidth>0&&document.querySelector("video").currentTime>1',official),60000)
 const playback=await value(`(()=>{const v=document.querySelector('video');return {width:v.videoWidth,height:v.videoHeight,paused:v.paused,time:v.currentTime,error:document.querySelector('.ytp-error-content-wrap-reason')?.textContent}})()`,official)
 report.original=playback
 assert.ok(!playback.error,'original YouTube watch player must not show embedding restriction')
 console.log('The creator-restricted video opened on its original YouTube watch page inside a PureTube window: '+JSON.stringify(playback))
 }finally{official.close();await invoke('close_original_player')}
 await navigate('Settings');await eventually(()=>value('document.querySelectorAll(".palette-option").length===8'))
 await value(`(()=>{const s=document.querySelector('.settings select');s.value='dark';s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
 await input('.searchbar input','https://www.youtube.com/watch?v=jNQXAC9IVRw');await value('document.querySelector(".searchbar").requestSubmit()');await eventually(()=>value('document.querySelector(".watch h1")?.textContent==="Me at the zoo"'))
 await value('document.querySelector(".watch h1").scrollIntoView()');await shot('watch-dark')
 writeFileSync(resolve('src-tauri/target/PureTube-0.11.0-audit.json'),JSON.stringify(report,null,2))
 console.log('All watch-refresh checks passed: '+JSON.stringify(report))
}catch(error){try{console.log('Failure: '+await value('document.body.innerText.slice(-6500)'));await shot('failure')}catch{}throw error}
finally{try{await invoke('close_original_player');await value('setTimeout(()=>document.querySelector(".window-close").click(),100)');await eventually(()=>child.exitCode!==null,10000)}catch{child.kill()}ws?.close();assert.ok(root.startsWith(join(process.env.TEMP,'puretube-features-')));rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:300})}
