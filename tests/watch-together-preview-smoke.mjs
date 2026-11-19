import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtempSync,readFileSync,rmSync} from 'node:fs'
import {createServer} from 'node:net'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {setTimeout as wait} from 'node:timers/promises'
import {stripTypeScriptTypes} from 'node:module'

const server=createServer().listen(0,'127.0.0.1')
await new Promise(ok=>server.once('listening',ok))
const {port}=server.address()
await new Promise(ok=>server.close(ok))
const profile=mkdtempSync(join(tmpdir(),'viddy-room-smoke-'))
const child=spawn(resolve('src-tauri/target/release/puretube.exe'),[],{
  windowsHide:true,stdio:'ignore',env:{...process.env,
    PURETUBE_ISOLATED_PROFILE:join(profile,'app'),
    WEBVIEW2_USER_DATA_FOLDER:join(profile,'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--autoplay-policy=no-user-gesture-required --remote-debugging-port=${port}`,
  },
})

let socket
let sequence=0
async function evaluate(expression){
  const id=++sequence
  const result=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{socket.removeEventListener('message',receive);reject(Error('Evaluation timed out'))},30000)
    function receive(event){
      const data=JSON.parse(event.data)
      if(data.id!==id)return
      clearTimeout(timer)
      socket.removeEventListener('message',receive)
      if(data.error||data.result.exceptionDetails)reject(Error(data.error?.message??data.result.exceptionDetails.exception?.description))
      else resolve(data.result.result.value)
    }
    socket.addEventListener('message',receive)
    socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}))
  })
  return result
}

try{
  let page
  for(let i=0;i<60&&!page;i++){
    try{
      const pages=await (await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(500)})).json()
      page=pages.find(p=>p.type==='page'&&p.url.includes('tauri.localhost'))
    }catch{}
    if(!page)await wait(250)
  }
  assert.ok(page,'Viddy WebView should start')
  socket=new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((ok,fail)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',fail,{once:true})})
  // Evaluate the same room code used by the app, with two independent WebRTC peers.
  const code=stripTypeScriptTypes(readFileSync('src/room-connection.ts','utf8')).replace(/^export /gm,'')
  const playback=await evaluate(`(async()=>{
    ${code}
    const host=createConnection(),guest=createConnection()
    try{
      const state={video:'aqz-KE-bpKQ',position:42,playing:false}
      const channel=host.createDataChannel('viddy-playback')
      const received=new Promise(resolve=>{guest.ondatachannel=e=>{e.channel.onmessage=m=>resolve(readRoomPlayback(m.data))}})
      channel.onopen=()=>channel.send(JSON.stringify(state))
      const id=crypto.randomUUID()
      await guest.setRemoteDescription(decodeRoomCode(await makeRoomCode(host,id,'offer'),'offer'))
      await host.setRemoteDescription(decodeRoomCode(await makeRoomCode(guest,id,'answer'),'answer'))
      return await received
    }finally{host.close();guest.close()}
  })()`)
  assert.deepEqual(playback,{video:'aqz-KE-bpKQ',position:42,playing:false})

  await evaluate(`(()=>{
    document.querySelector('button[aria-label="Watch Together"]').click()
    if(!document.querySelector('dialog.room-panel').open)throw Error('Room dialog did not open')
    document.querySelector('button[aria-label="Close Watch Together"]').click()
    const input=document.querySelector('.searchbar input')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Big Buck Bunny 60fps')
    input.dispatchEvent(new Event('input',{bubbles:true}))
  })()`)
  await evaluate("document.querySelector('.searchbar').requestSubmit()")
  const played=await evaluate(`(async()=>{
    const until=Date.now()+22000
    const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
    const relevance=[...document.querySelectorAll('.search-banner button')].find(button=>button.textContent==='Relevance')
    relevance?.click()
    let button
    while(Date.now()<until&&!button){
      const results=document.querySelector('[aria-label="Matching videos"]')
      button=results?.querySelector('[data-video-id="aqz-KE-bpKQ"] .video-thumbnail')
      if(!button)await delay(300)
    }
    if(!button)return 'known search result unavailable'
    button.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))
    while(Date.now()<until&&!button.querySelector('.thumbnail-preview[data-playing="true"]'))await delay(200)
    const frame=button.querySelector('.thumbnail-preview[data-playing="true"] iframe')
    if(!frame?.src.startsWith('https://www.youtube.com/embed/aqz-KE-bpKQ?'))return 'preview did not play'
    button.dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:document.body}))
    await delay(100)
    return button.querySelector('iframe')?'preview did not stop':'played'
  })()`)
  assert.equal(played,'played')
  console.log('Room code exchange passed, the Watch Together dialog opened, and the YouTube hover preview played and stopped on pointer exit.')
}finally{
  socket?.close()
  if(child.exitCode===null)child.kill()
  rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:300})
}
