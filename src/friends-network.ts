import {useEffect,useRef,useState} from 'react'
import {createConnection,decodeRoomCode,makeRoomCode} from './room-connection'
import {errorText,videoId} from './domain'

export type SharedVideo={id:string;title:string;live?:boolean}
export type PublicProfile={name:string;bio:string;pins:SharedVideo[];playlists:{name:string;videos:SharedVideo[]}[]}
export type Friend=PublicProfile&{id:string}
export type FriendMessage={id:string;own:boolean;at:number;text:string;video?:SharedVideo}
type Book={friends:Record<string,Friend>;messages:Record<string,FriendMessage[]>}
type Member={id:string;peer:RTCPeerConnection;channel?:RTCDataChannel;friend?:string;pending?:Promise<void>}
type Signal={member:Member;code:string;kind:'invite'|'reply'}
const storage='viddy-friends-v1'
const prefix='viddy-friend:'
const roomPrefix='viddy-room:'
const encoder=new TextEncoder()
const encode=(value:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(value)))
const decode=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0))
type Keys={privateKey:CryptoKey;publicKey:string}
let identity:Promise<Keys>|undefined

function keys(){
 return identity??= (async()=>{
   const stored=localStorage.getItem('viddy-friend-identity')
   const options={name:'ECDSA',namedCurve:'P-256'}
   if(stored){
     const {privateKey,publicKey}=JSON.parse(stored)
     return {privateKey:await crypto.subtle.importKey('pkcs8',decode(privateKey),options,false,['sign']),publicKey}
   }
   const pair=await crypto.subtle.generateKey(options,true,['sign','verify'])
   const publicKey=encode(await crypto.subtle.exportKey('spki',pair.publicKey))
   localStorage.setItem('viddy-friend-identity',JSON.stringify({privateKey:encode(await crypto.subtle.exportKey('pkcs8',pair.privateKey)),publicKey}))
   return {privateKey:pair.privateKey,publicKey}
 })()
}

export function readSharedVideo(value:unknown):SharedVideo|undefined{
 if(!value||typeof value!=='object')return
 const v=value as Partial<SharedVideo>
 if(typeof v.id==='string'&&videoId(v.id)&&typeof v.title==='string')return {id:v.id,title:v.title.slice(0,250),live:v.live===true}
}
function readProfile(value:unknown):PublicProfile|undefined{
 if(!value||typeof value!=='object')return
 const p=value as Partial<PublicProfile>
 if(typeof p.name!=='string'||typeof p.bio!=='string'||!Array.isArray(p.pins)||!Array.isArray(p.playlists))return
 const videos=(items:unknown[])=>items.map(readSharedVideo).filter((v):v is SharedVideo=>!!v)
 return {name:p.name.slice(0,48),bio:p.bio.slice(0,250),pins:videos(p.pins.slice(0,6)),playlists:p.playlists.slice(0,8).flatMap(list=>
   list&&typeof list.name==='string'&&Array.isArray(list.videos)?[{name:list.name.slice(0,80),videos:videos(list.videos.slice(0,40))}]:[])}
}

export function useFriends(profile:PublicProfile){
 const [book,setBook]=useState<Book>(()=>{
   try{return JSON.parse(localStorage.getItem(storage)??'null')??{friends:{},messages:{}}}catch{return {friends:{},messages:{}}}
 })
 const [online,setOnline]=useState<string[]>([]),[signal,setSignal]=useState<Signal>()
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const peers=useRef(new Set<Member>()),published=useRef(profile)
 published.current=profile
 const profileVersion=JSON.stringify(profile)
 useEffect(()=>{try{localStorage.setItem(storage,JSON.stringify(book))}catch{}},[book])
 const updateOnline=()=>setOnline([...new Set([...peers.current].flatMap(p=>p.friend&&p.channel?.readyState==='open'?[p.friend]:[]))])
 function close(p:Member){peers.current.delete(p);p.peer.close();updateOnline()}
 async function sayHello(p:Member){
   const key=await keys()
   const profile=JSON.stringify(published.current)
   const payload=p.id+'\n'+profile
   const signature=encode(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key.privateKey,encoder.encode(payload)))
   if(p.channel?.readyState==='open')p.channel.send(JSON.stringify({type:'profile',key:key.publicKey,signature,profile}))
 }
 function addMessage(friend:string,entry:FriendMessage){
   setBook(old=>{
     const messages=old.messages[friend]??[]
     if(messages.some(m=>m.id===entry.id))return old
     return {...old,messages:{...old.messages,[friend]:[...messages,entry].slice(-150)}}
   })
 }
 async function receive(p:Member,raw:unknown){
   if(!peers.current.has(p)||typeof raw!=='string'||raw.length>180_000)return
   try{
     const item=JSON.parse(raw)
     if(item.type==='profile'&&typeof item.key==='string'&&item.key.length<=160&&typeof item.signature==='string'&&item.signature.length<=100&&typeof item.profile==='string'){
       const pub=decode(item.key)
       const key=await crypto.subtle.importKey('spki',pub,{name:'ECDSA',namedCurve:'P-256'},false,['verify'])
       const verified=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,decode(item.signature),encoder.encode(p.id+'\n'+item.profile))
       if(!verified||!peers.current.has(p))return
       const parsed=readProfile(JSON.parse(item.profile))
       if(!parsed)return
       const id=encode(await crypto.subtle.digest('SHA-256',pub))
       if(!peers.current.has(p)||(p.friend&&p.friend!==id))return
       p.friend=id
       setBook(old=>({...old,friends:{...old.friends,[id]:{...parsed,id}}}))
       updateOnline();setSignal(old=>old?.member===p?undefined:old);setMessage('')
     }else if(item.type==='message'&&p.friend&&typeof item.id==='string'&&item.id.length===36&&typeof item.text==='string'){
       const video=readSharedVideo(item.video),text=item.text.trim().slice(0,1000)
       if(text||video)addMessage(p.friend,{id:item.id,own:false,at:Date.now(),text,video})
     }
   }catch{}
 }
 function attach(p:Member,channel:RTCDataChannel){
   p.channel=channel
   channel.onopen=()=>void sayHello(p).catch(()=>setMessage('Could not open your friend connection.'))
   channel.onclose=()=>{if(peers.current.has(p))close(p)}
   channel.onmessage=event=>{p.pending=(p.pending??Promise.resolve()).then(()=>receive(p,event.data))}
 }
 function member(id:string){
   const peer=createConnection(),p:Member={id,peer}
   peers.current.add(p)
   peer.onconnectionstatechange=()=>{
     if(peer.connectionState==='failed'&&peers.current.has(p)){
       close(p);setSignal(old=>old?.member===p?undefined:old)
       setMessage('Could not connect directly. Try a new invite or a different network.')
     }
   }
   return p
 }
 async function exchange(kind:'invite'|'reply'|'connect',input=''){
   let created:Member|undefined
   setBusy(true);setMessage('')
   try{
     if(kind==='connect'){
       if(signal?.kind!=='invite')return
       const answer=friendCode(input,'answer')
       if(answer.id!==signal.member.id)throw Error('That reply belongs to a different invite.')
       await signal.member.peer.setRemoteDescription(answer)
       setMessage('Connecting…')
     }else{
       if(peers.current.size>=12)throw Error('Disconnect a friend before adding another connection.')
       const offer=kind==='reply'?friendCode(input,'offer'):undefined
       const p=member(offer?.id??crypto.randomUUID())
       created=p
       if(offer){
         p.peer.ondatachannel=e=>{if(e.channel.label==='viddy-friends'&&!p.channel)attach(p,e.channel);else e.channel.close()}
         await p.peer.setRemoteDescription(offer)
       }else attach(p,p.peer.createDataChannel('viddy-friends'))
       const code=await makeRoomCode(p.peer,p.id,offer?'answer':'offer')
       setSignal({code:prefix+code.slice(roomPrefix.length),member:p,kind})
     }
   }catch(e){if(created)close(created);setMessage(errorText(e))}
   finally{setBusy(false)}
 }
 function friendCode(value:string,type:'offer'|'answer'){
   if(!value.startsWith(prefix))throw Error('Paste a Friends code from Viddy.')
   return decodeRoomCode(roomPrefix+value.slice(prefix.length),type)
 }
 function send(id:string,text:string,video?:SharedVideo){
   const channel=[...peers.current].find(p=>p.friend===id&&p.channel?.readyState==='open')?.channel
   if(!channel)return false
   const entry={id:crypto.randomUUID(),own:true,at:Date.now(),text:text.trim().slice(0,1000),video}
   try{channel.send(JSON.stringify({type:'message',...entry}));addMessage(id,entry);return true}catch{return false}
 }
 function forget(id:string){
   for(const peer of peers.current)if(peer.friend===id)close(peer)
   setBook(old=>{
     const friends={...old.friends},messages={...old.messages}
     delete friends[id];delete messages[id]
     return {friends,messages}
   })
 }
 useEffect(()=>{
   for(const peer of peers.current)if(peer.channel?.readyState==='open')void sayHello(peer).catch(()=>{})
 },[profileVersion])
 useEffect(()=>{const active=peers.current;return ()=>{for(const peer of active)peer.peer.close();active.clear()}},[])
 return {book,online,busy,message,signal,exchange,send,forget,cancel:()=>{if(signal)close(signal.member);setSignal(undefined);setMessage('')}}
}
