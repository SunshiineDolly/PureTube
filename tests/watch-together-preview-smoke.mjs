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
  for(let i=0;i<60;i++){
    if(await evaluate("typeof window.__TAURI_INTERNALS__?.invoke==='function' && !!document.querySelector('.top-menu:not(:disabled)')"))break
    if(i===59)throw Error('Viddy did not finish starting')
    await wait(200)
  }
  if(process.env.VIDDY_CHECK_PUBLIC_SCHEDULE==='1'){
    const publicSchedule=await evaluate(`(async()=>{
      const responses=await Promise.allSettled(['@NASA','@NFL','@FIDE_chess','@capcomfighters'].map(channel=>
        window.__TAURI_INTERNALS__.invoke('scheduled_channel',{channel})))
      return responses.map(result=>result.status==='fulfilled'
        ?result.value.filter(item=>item.upcoming&&!item.live&&item.scheduledAt).length
        :String(result.reason))
    })()`)
    assert.ok(publicSchedule.filter(count=>typeof count==='number'&&count>0).length>=2,
      'Expected dated upcoming broadcasts on multiple public creator pages: '+JSON.stringify(publicSchedule))
    console.log('Upcoming broadcasts found on public creator pages: '+JSON.stringify(publicSchedule))
  }else if(process.env.VIDDY_CHECK_FRIENDS==='1'){
    const creators=await evaluate("window.__TAURI_INTERNALS__.invoke('search_creators',{query:'DashieGames'})")
    assert.ok(creators.some(creator=>creator.name.toLowerCase()==='dashiegames'),'The creator search should return DashieGames')
    await evaluate(`document.querySelector('.sidebar [aria-label="Profile & friends"]').click()`)
    await evaluate(`(()=>{
      document.querySelector('.friend-connect summary').click()
      document.querySelector('.friend-connect button.accent').click()
    })()`)
    let invite
    for(let i=0;i<50&&!invite;i++){
      invite=await evaluate("document.querySelector('.friend-connect input[readonly]')?.value")
      if(!invite)await wait(200)
    }
    assert.ok(invite?.startsWith('viddy-friend:'),'Friends should create an invite')
    const source=stripTypeScriptTypes(readFileSync('src/room-connection.ts','utf8')).replace(/^export /gm,'')
    const answer=await evaluate(`(async()=>{
      ${source}
      const offer=decodeRoomCode(${JSON.stringify('viddy-room:'+invite.slice('viddy-friend:'.length))},'offer')
      const peer=createConnection()
      window.testFriend={peer}
      const profile=JSON.stringify({name:'Test friend',bio:'',pins:[],playlists:[]})
      const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])
      const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)))
      const key=encode(await crypto.subtle.exportKey('spki',pair.publicKey))
      const signature=encode(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,new TextEncoder().encode(offer.id+'\\n'+profile)))
      peer.ondatachannel=({channel})=>{
        channel.onopen=()=>{
          channel.send(JSON.stringify({type:'profile',key,signature,profile}))
          channel.send(JSON.stringify({type:'message',id:'11111111-1111-4111-8111-111111111111',text:'Shared live',video:{id:'aqz-KE-bpKQ',title:'Test broadcast',live:true}}))
        }
        channel.onmessage=event=>{const packet=JSON.parse(event.data);if(packet.type==='message')window.testFriend.received=packet.text}
      }
      await peer.setRemoteDescription(offer)
      return await makeRoomCode(peer,offer.id,'answer')
    })()`)
    const reply='viddy-friend:'+answer.slice('viddy-room:'.length)
    const fill=(selector,value)=>evaluate(`(()=>{
      const input=document.querySelector(${JSON.stringify(selector)})
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)})
      input.dispatchEvent(new Event('input',{bubbles:true}))
    })()`)
    await fill('[aria-label="Friend reply code"]',reply)
    await evaluate("document.querySelector('.friend-connect form').requestSubmit()")
    for(let i=0;i<60;i++){
      if(await evaluate("!!document.querySelector('.friend-entry')"))break
      if(i===59)throw Error('The friend did not connect')
      await wait(200)
    }
    await evaluate("document.querySelector('.friend-entry').click()")
    await evaluate("[...document.querySelectorAll('.friends-toolbar button')].find(b=>b.textContent==='Messages').click()")
    assert.ok(await evaluate("document.querySelector('.friend-messages').textContent.includes('Test broadcast')"),'The incoming live attachment should appear')
    await fill('[aria-label="Message"]','Hi from Viddy')
    await evaluate("document.querySelector('.friend-compose').requestSubmit()")
    for(let i=0;i<30;i++){
      if(await evaluate("window.testFriend.received==='Hi from Viddy'"))break
      if(i===29)throw Error('The peer did not receive the reply')
      await wait(150)
    }
    console.log('Creator lookup, authenticated friend profile, incoming live attachment, and outgoing direct message passed.')
  }else{
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
    if(document.querySelector('button[aria-label="Watch Together"]'))throw Error('Watch Together should not be on Home')
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
    if(button.querySelector('iframe'))return 'preview did not stop'
    button.click()
    return 'played'
  })()`)
  assert.equal(played,'played')
  const centered=await evaluate(`(async()=>{
    const button=document.querySelector('.watch-overview button[aria-label="Watch Together"]')
    if(!button)throw Error('Watch Together was missing on the video page')
    button.click()
    await new Promise(resolve=>setTimeout(resolve,225))
    const dialog=document.querySelector('dialog.room-panel')
    const bounds=dialog.getBoundingClientRect()
    const centered=dialog.open&&Math.abs(bounds.x+bounds.width/2-innerWidth/2)<3&&Math.abs(bounds.y+bounds.height/2-innerHeight/2)<3
    dialog.querySelector('button[aria-label="Close Watch Together"]').click()
    const fades=dialog.open&&dialog.dataset.closing==='true'
    await new Promise(resolve=>setTimeout(resolve,225))
    return centered&&fades&&!dialog.open
  })()`)
  assert.ok(centered,'Watch Together should open centered and fade out')
  console.log('Room code exchange passed, Watch Together centered and faded out, and the YouTube hover preview played and stopped on pointer exit.')

  await evaluate(`(async()=>{
    const invoke=window.__TAURI_INTERNALS__.invoke
    const data=await invoke('load')??{version:1}
    await invoke('save',{data:{...data,liveReminders:{aqz_KE_TEST:{title:'Saved fixture outside search',at:Date.now()+3600000}}}})
    setTimeout(()=>location.reload(),100)
  })()`)
  await wait(1200)
  const reminder=await evaluate(`(async()=>{
    const until=Date.now()+10000
    const pause=()=>new Promise(resolve=>setTimeout(resolve,150))
    while(Date.now()<until&&!document.querySelector('.top-menu:not(:disabled)'))await pause()
    document.querySelector('.sidebar button[aria-label="Live"]').click()
    while(Date.now()<until&&!document.querySelector('.live-mode-tabs'))await pause()
    const scheduled=[...document.querySelectorAll('.live-mode-tabs button')].find(b=>b.textContent==='Scheduled')
    scheduled?.click()
    while(Date.now()<until&&!document.querySelector('.scheduled-reminders'))await pause()
    const shelf=document.querySelector('.scheduled-reminders')
    return shelf?.textContent.includes('Saved fixture outside search')&&shelf?.textContent.includes('Reminder set')
  })()`)
  assert.ok(reminder,'A saved reminder should appear without a matching public search result')
  console.log('Scheduled reminders appeared from storage independently of the public catalog.')
  }
}finally{
  socket?.close()
  if(child.exitCode===null)child.kill()
  rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:300})
}
