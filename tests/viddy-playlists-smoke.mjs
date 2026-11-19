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
async function input(selector,text){await value(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`)}
async function click(text){await value(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`)}
async function shot(name){const s=await call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve('src-tauri/target/Viddy-0.12-'+name+'.png'),Buffer.from(s.data,'base64'))}
const report={}
try{
 ws=await connect(await eventually(async()=>(await pages()).find(p=>p.type==='page'&&p.url.includes('tauri.localhost'))))
 await eventually(()=>value('!!document.querySelector(".sidebar")'))
 assert.equal(await value('document.querySelector(".brand").textContent'),'Viddy✦')
 assert.equal(await value("!!document.querySelector('.profile-chip, [aria-label=\"Your profile\"]')"),false)
 const data=await invoke('load')??{version:1,settings:{}}
 const zoo={id:'jNQXAC9IVRw',title:'Me at the zoo',channel:'jawed',channelId:'UC4QobU6STFB0P71PMvOGN5A',description:'A day at the zoo',date:'2005-04-23',image:'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg',duration:19,embeddable:true,shorts:false,paid:false}
 const bunny={...zoo,id:'aqz-KE-bpKQ',title:'Big Buck Bunny',channel:'Blender',duration:596},rick={...zoo,id:'dQw4w9WgXcQ',title:'Never Gonna Give You Up',channel:'Rick Astley',duration:212}
 await invoke('save',{data:{...data,profileName:'Existing profile',collections:[{name:'Cozy evenings',ids:[zoo.id,bunny.id,rick.id]}],favorites:[bunny.id],savedVideos:{[zoo.id]:zoo,[bunny.id]:bunny,[rick.id]:rick},history:{[rick.id]:Date.now()},progress:{[rick.id]:{at:10,duration:212,updated:Date.now()}},settings:{...data.settings,showTime:true,autoplay:true,tray:false}}})
 await call('Page.reload');await eventually(()=>value('!!document.querySelector(".sidebar")'));await navigate('Library')
 await eventually(()=>value('document.querySelectorAll(".playlist-tile").length===2'))
 const rails=await value(`(()=>{const s=document.querySelector('.sidebar');return {width:s.clientWidth,scrollWidth:s.scrollWidth,thumb:getComputedStyle(s,'::-webkit-scrollbar-thumb').backgroundColor,rail:getComputedStyle(s,'::-webkit-scrollbar').width,overflow:getComputedStyle(s).overflowX}})()`)
 assert.ok(rails.scrollWidth<=rails.width);assert.equal(rails.rail,'7px');report.scrollbars=rails
 await eventually(()=>value('[...document.querySelectorAll(".playlist-cover img")].every(i=>i.complete&&i.naturalWidth>0)'));await shot('library-dark');await click('New playlist');await input('[aria-label="Playlist name"]','Study time');await click('Create playlist')
 await eventually(async()=>(await invoke('load')).collections.some(c=>c.name==='Study time'))
 await click('All playlists');await value(`[...document.querySelectorAll('.playlist-tile')].find(b=>b.textContent.includes('Cozy evenings')).click()`)
 await value(`document.querySelector('[aria-label="Move down Me at the zoo"]').click()`)
 await eventually(async()=>(await invoke('load')).collections[0].ids[0]===bunny.id)
 await value(`document.querySelector('[aria-label="Move up Me at the zoo"]').click()`)
 await eventually(async()=>(await invoke('load')).collections[0].ids[0]===zoo.id)
 await click('Rename');await input('[aria-label="Rename playlist"]','Weekend favorites');await click('Save name')
 await eventually(async()=>(await invoke('load')).collections[0].name==='Weekend favorites')
 await input('[aria-label="Search playlist"]','Bunny');assert.equal(await value('document.querySelectorAll(".playlist-video-row").length'),1);await input('[aria-label="Search playlist"]','')
 await value(`document.querySelector('[aria-label="Remove Never Gonna Give You Up from playlist"]').click()`)
 await eventually(async()=>(await invoke('load')).collections[0].ids.length===2)
 await eventually(()=>value('[...document.querySelectorAll(".playlist-video-thumb img")].every(i=>i.complete&&i.naturalWidth>0)'));await shot('playlist-dark');await click('Play all')
 await eventually(()=>value('document.querySelector(".player iframe")?.src.includes("jNQXAC9IVRw")'))
 await value('document.querySelector(".player iframe").dataset.samePlayer="yes"')
 await navigate('Library');await eventually(()=>value('!!document.querySelector(".watch-docked")'))
 assert.equal(await value('document.querySelector(".player iframe").dataset.samePlayer'),'yes','docking must preserve the same iframe')
 await value(`document.querySelector('[aria-label="Show queue"]').click()`)
 await eventually(()=>value('!!document.querySelector(".dock-queue-open")'))
 const queueFit=await value(`(()=>{const q=document.querySelector('.watch-playlist').getBoundingClientRect(),p=document.querySelector('.watch-docked').getBoundingClientRect();return {queueBottom:q.bottom,playerTop:p.top}})()`);assert.ok(queueFit.queueBottom<=queueFit.playerTop,'queue must sit above the video rather than cover it');await shot('docked-queue')
 await value(`document.querySelector('[aria-label="Next playlist video"]').click()`)
 await eventually(()=>value('document.querySelector(".watch-docked .player iframe")?.src.includes("aqz-KE-bpKQ")'))
 assert.equal(await value('document.querySelector(".library-studio h1").textContent'),'Library','queue changes must not interrupt browsing')
 await value(`document.querySelector('[aria-label="Previous playlist video"]').click()`)
 await eventually(()=>value('document.querySelector(".watch-docked .player iframe")?.src.includes("jNQXAC9IVRw")'))
 await endVideo()
 await eventually(()=>value('!!document.querySelector(".playlist-advance")'),20000)
 await eventually(()=>value('document.querySelector(".watch-docked .player iframe")?.src.includes("aqz-KE-bpKQ")'),15000)
 report.docking='Same iframe preserved; ordered queue advanced after actual playback ended while browsing.'
 console.log(report.docking)
 await value('document.querySelector(".dock-header>button").click()')
 await eventually(()=>value('!!document.querySelector(".watch:not(.watch-docked)")'))
 await value(`[...document.querySelectorAll('.watch-view-controls button')].find(b=>b.textContent.includes('Pop out')).click()`)
 const miniTarget=await eventually(async()=>(await pages()).find(p=>p.type==='page'&&p.url.includes('mini=1')))
 const mini=await connect(miniTarget)
 try{
 await eventually(()=>value('!!document.querySelector(".player iframe")',mini))
 await eventually(async()=>(await invoke('player_state',{},mini)).start>0.2,40000)
 const fit=await value('({height:innerHeight,body:document.body.scrollHeight,width:innerWidth,bodyWidth:document.body.scrollWidth,player:document.querySelector(".player").getBoundingClientRect().height})',mini)
 assert.ok(fit.body<=fit.height&&fit.bodyWidth<=fit.width,'pop-out must fit without scrollbars');assert.equal(Math.round(fit.player),fit.height);report.popout=fit
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:300,y:150},mini);await wait(1200);const miniShot=await call('Page.captureScreenshot',{format:'png'},mini);writeFileSync(resolve('src-tauri/target/Viddy-0.12-popout.png'),Buffer.from(miniShot.data,'base64'))
 assert.equal((await invoke('player_state',{},mini)).playlist.name,'Weekend favorites')
 await value(`document.querySelector('[aria-label="Repeat playlist"]').click()`,mini);await eventually(async()=>(await invoke('player_state',{},mini)).playlist.repeat===true)
 await value(`document.querySelector('[aria-label="Previous playlist video"]').click()`,mini);await eventually(async()=>(await invoke('player_state',{},mini)).video.id===zoo.id)
 await value(`document.querySelector('[aria-label="Return player to main window"]').click()`,mini)
 }finally{mini.close()}
 await eventually(()=>value('document.querySelector(".watch .player iframe")?.src.includes("jNQXAC9IVRw")'))
 await navigate('Settings');await eventually(()=>value('!!document.querySelector(".settings")'))
 await value(`(()=>{const s=document.querySelector('.settings select');s.value='light';s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
 await navigate('Library');await value(`[...document.querySelectorAll('.playlist-tile')].find(b=>b.textContent.includes('Weekend favorites')).click()`);await shot('playlist-light')
 await click('Shuffle');await eventually(()=>value('!!document.querySelector(".playlist-player")'))
 assert.equal(await value('document.querySelectorAll(".playlist-queue-list>button").length'),2)
 await navigate('Library');await value(`document.querySelector('[aria-label="Close mini player"]').click()`);assert.equal(await value('!!document.querySelector(".player iframe")'),false)
 await input('.searchbar input','jazz piano');await value('document.querySelector(".searchbar").requestSubmit()');await eventually(()=>value('document.querySelectorAll(".video-grid .card").length>0'),60000)
 await value("document.querySelector('.video-grid .card [title=\"Add to queue\"]').click()")
 await eventually(()=>value('!!document.querySelector(".playlist-player")'))
 const related=await invoke('related_videos',{id:zoo.id});report.related=related.length
 assert.ok(related.length>0,'actual YouTube watch-page recommendations should be available')
 console.log('Playlist creation, rename, ordering, filtering, removal, Play all, Shuffle, automatic advance, manual queue, mini player, pop-out fit and repeat synchronization passed.')
 writeFileSync(resolve('src-tauri/target/Viddy-0.12.0-audit.json'),JSON.stringify(report,null,2))
}catch(error){try{console.log('Failure state: '+await value('document.body.innerText.slice(-5000)'));await shot('failure')}catch{}throw error}
finally{try{await invoke('close_player');await value('setTimeout(()=>document.querySelector(".window-close").click(),100)');await eventually(()=>child.exitCode!==null,10000)}catch{child.kill()}ws?.close();assert.ok(root.startsWith(join(process.env.TEMP,'puretube-features-')));rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:300})}
