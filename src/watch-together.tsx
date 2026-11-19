import {useEffect,useRef,useState,type RefObject} from 'react'
import {Copy,Users,X} from 'lucide-react'
import {errorText} from './domain'
import {createConnection,decodeRoomCode,makeRoomCode,readRoomPlayback,type RoomPlayback} from './room-connection'
export type {RoomPlayback} from './room-connection'

type Member={id:string;peer:RTCPeerConnection;channel?:RTCDataChannel}
type Room={role:'host'|'guest';waiting?:Member;code?:string}

export function useWatchTogether(getPlayback:()=>RoomPlayback|undefined,activeId:string|undefined,openVideo:(id:string)=>void){
 const [room,setRoom]=useState<Room>(),[playback,setPlayback]=useState<RoomPlayback>()
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[connected,setConnected]=useState(0)
 const members=useRef(new Set<Member>())
 const actions=useRef({getPlayback,activeId,openVideo})
 actions.current={getPlayback,activeId,openVideo}

 function remove(member:Member){
   if(!members.current.delete(member))return
   member.peer.close()
   setConnected([...members.current].filter(m=>m.channel?.readyState==='open').length)
 }

 function attach(member:Member,channel:RTCDataChannel,role:Room['role']){
   member.channel=channel
   channel.onopen=()=>{
     setConnected([...members.current].filter(m=>m.channel?.readyState==='open').length)
     setMessage('')
     if(role==='host'){
       const current=actions.current.getPlayback()
       if(current)channel.send(JSON.stringify(current))
     }
   }
   channel.onclose=()=>{
     if(!members.current.has(member))return
     remove(member)
     if(role==='guest'){
       setRoom(undefined)
       setPlayback(undefined)
       setMessage('The host connection ended.')
     }
   }
   if(role==='guest')channel.onmessage=event=>{
     const state=readRoomPlayback(event.data)
     if(!state||!members.current.has(member))return
     setPlayback(state)
     if(actions.current.activeId!==state.video)actions.current.openVideo(state.video)
   }
 }

 function makeMember(id:string,role:Room['role']){
   const peer=createConnection()
   const member:Member={id,peer}
   members.current.add(member)
   peer.onconnectionstatechange=()=>{
     if(peer.connectionState==='failed'&&members.current.has(member)){
       remove(member)
       if(role==='guest'){setRoom(undefined);setPlayback(undefined)}
       setMessage('Could not connect directly. Try another network or create a fresh invite.')
     }
   }
   return member
 }

 useEffect(()=>{
   if(room?.role!=='host')return
   let last=actions.current.getPlayback()
   const timer=setInterval(()=>{
     const now=actions.current.getPlayback()
     last=now??(last?{...last,playing:false}:undefined)
     if(!last)return
     const packet=JSON.stringify(last)
     for(const {channel} of members.current){
       if(channel?.readyState==='open'&&channel.bufferedAmount<4096)channel.send(packet)
     }
   },700)
   return ()=>clearInterval(timer)
 },[room?.role])
 useEffect(()=>{
   const peers=members.current
   return ()=>{for(const {peer} of peers)peer.close();peers.clear()}
 },[])

 async function host(){
   if(!actions.current.getPlayback()){setMessage('Start playing a regular video before hosting.');return}
   if(members.current.size>=8){setMessage('This room is full.');return}
   let member:Member|undefined
   setBusy(true);setMessage('')
   try{
     member=makeMember(crypto.randomUUID(),'host')
     attach(member,member.peer.createDataChannel('viddy-playback'),'host')
     const code=await makeRoomCode(member.peer,member.id,'offer')
     setRoom({role:'host',waiting:member,code})
   }catch(e){if(member)remove(member);setMessage(errorText(e))}
   finally{setBusy(false)}
 }

 async function join(invite:string){
   let member:Member|undefined
   setBusy(true);setMessage('')
   try{
     const offer=decodeRoomCode(invite,'offer')
     member=makeMember(offer.id,'guest')
     const guest=member
     member.peer.ondatachannel=event=>{
       if(event.channel.label==='viddy-playback'&&!guest.channel)attach(guest,event.channel,'guest')
       else event.channel.close()
     }
     await member.peer.setRemoteDescription(offer)
     const code=await makeRoomCode(member.peer,member.id,'answer')
     setRoom({role:'guest',code})
   }catch(e){if(member)remove(member);setMessage(errorText(e))}
   finally{setBusy(false)}
 }

 async function accept(reply:string){
   if(!room?.waiting)return
   setBusy(true);setMessage('')
   try{
     const answer=decodeRoomCode(reply,'answer')
     if(answer.id!==room.waiting.id)throw new Error('That reply belongs to a different invite.')
     await room.waiting.peer.setRemoteDescription(answer)
     setRoom({role:'host'})
     setMessage('Connecting to your guest…')
   }catch(e){setMessage(errorText(e))}
   finally{setBusy(false)}
 }

 function leave(){
   for(const member of members.current)remove(member)
   setRoom(undefined);setPlayback(undefined);setMessage('')
 }
 function cancelInvite(){
   if(room?.waiting)remove(room.waiting)
   setMessage('')
   setRoom(connected?{role:'host'}:undefined)
 }
 return {room,playback,busy,message,connected,host,join,accept,leave,cancelInvite}
}

export function WatchTogether({session,canHost,dialog}:{session:ReturnType<typeof useWatchTogether>;canHost:boolean;dialog:RefObject<HTMLDialogElement|null>}){
 const [input,setInput]=useState(''),[copied,setCopied]=useState(''),[copyError,setCopyError]=useState(false)
 const {room,message,busy,connected}=session
 const copy=(code:string)=>void navigator.clipboard.writeText(code).then(()=>{setCopied(code);setCopyError(false)},()=>setCopyError(true))
 const field=(label:string,submit:(code:string)=>Promise<void>,button:string)=><form className="room-code" onSubmit={e=>{e.preventDefault();void submit(input.trim())}}>
   <label>{label}<input placeholder={label} value={input} maxLength={32000} onChange={e=>setInput(e.target.value)}/></label>
   <button className="button" disabled={busy||!input.trim()}>{button}</button>
 </form>
 const code=(value:string,label:string)=><div className="room-code">
   <label>{label}<input readOnly value={value} onFocus={e=>e.currentTarget.select()}/></label>
   <button className="button accent" onClick={()=>copy(value)}><Copy size={15}/>{copied===value?'Copied':'Copy'}</button>
 </div>
 const leave=()=>{setInput('');session.leave()}
 return <dialog ref={dialog} className="room-panel" aria-labelledby="room-title" onClose={()=>setCopyError(false)}>
   <header className="room-heading">
     <span className="room-mark"><Users size={20}/></span>
     <div><h2 id="room-title">Watch Together</h2><p>Sync a video with friends on Viddy.</p></div>
     <button className="icon" aria-label="Close Watch Together" onClick={()=>dialog.current?.close()}><X size={18}/></button>
   </header>
   <section className="room-body">
     {message&&<p className="room-status" role="status">{message}</p>}
     {copyError&&<p className="room-status" role="status">Select the code and copy it manually.</p>}
     {room?.role==='host'?<>
       {connected>0&&<p>{connected} {connected===1?'guest':'guests'} connected. Your player controls the room.</p>}
       {room.code?<><p>Send the invite to a friend, then paste their reply to connect.</p>{code(room.code,'Invite code')}{field('Reply code',session.accept,'Connect')}</>:null}
       <div className="room-footer">
         {room.code?<button className="button" disabled={busy} onClick={session.cancelInvite}>Cancel invite</button>:<button className="button accent" disabled={busy} onClick={()=>{setInput('');void session.host()}}>Invite a guest</button>}
         <button className="button" disabled={busy} onClick={leave}>End room</button>
       </div>
     </>:room?<><p>{connected?'Following the host’s playback.':'Send this reply code back to the host to finish joining.'}</p>
       {!connected&&room.code&&code(room.code,'Reply code')}
       <div className="room-footer"><button className="button" onClick={leave}>Leave room</button></div>
     </>:<div className="room-options">
       <section><h3>Host a room</h3><p>{canHost?'Share an invite and control playback for your guests.':'Open a regular video to host.'}</p>
       <button className="button accent" disabled={busy||!canHost} onClick={()=>{setInput('');void session.host()}}>{busy?'Preparing…':'Host this video'}</button></section>
       <section><h3>Join a friend</h3><p>Paste their invite to create a reply code.</p>
       {field('Invite code',session.join,'Join')}</section>
     </div>}
   </section>
 </dialog>
}
