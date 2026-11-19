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

  const resolution=await evaluate(`(async()=>{
    const url=await window.__TAURI_INTERNALS__.invoke('preview_stream',{id:'aqz-KE-bpKQ'})
    const video=document.createElement('video')
    video.muted=true
    video.playsInline=true
    video.src=url
    document.body.append(video)
    await video.play()
    return video.videoHeight
  })()`)
  assert.ok(resolution>=360,'A known public YouTube video should decode at 360p or better')
  console.log(`WebView2 exchanged a room invite and playback state, and played a ${resolution}p YouTube preview.`)
}finally{
  socket?.close()
  if(child.exitCode===null)child.kill()
  rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:300})
}
