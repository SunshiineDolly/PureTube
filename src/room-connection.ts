export type RoomPlayback={video:string;position:number;playing:boolean}
type RoomCode={id:string;type:'offer'|'answer';sdp:string}
const prefix='viddy-room:'

export function createConnection(){
 return new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]})
}

export function encodeRoomCode(id:string,type:RoomCode['type'],sdp:string){
 return prefix+btoa(JSON.stringify({id,type,sdp}))
}

export function decodeRoomCode(input:string,type:RoomCode['type']):RoomCode{
 try{
   if(input.length>32_000||!input.startsWith(prefix))throw new Error()
   const code:RoomCode=JSON.parse(atob(input.slice(prefix.length)))
   if(code?.type!==type||typeof code.id!=='string'||!/^[-\da-f]{36}$/i.test(code.id)
     ||typeof code.sdp!=='string'||!code.sdp.startsWith('v=0')
     ||code.sdp.split(/\r?\n/).filter(line=>line.startsWith('m=')).some(line=>!line.startsWith('m=application ')))
     throw new Error()
   return code
 }catch{
   throw new Error(type==='offer'?'Paste a valid Viddy invite.':'Paste a valid Viddy reply code.')
 }
}

export async function makeRoomCode(peer:RTCPeerConnection,id:string,type:RoomCode['type']){
 const description=type==='offer'?await peer.createOffer():await peer.createAnswer()
 await peer.setLocalDescription(description)
 if(peer.iceGatheringState!=='complete')await new Promise<void>(resolve=>{
   const timer=setTimeout(done,6500)
   function done(){
     clearTimeout(timer)
     peer.removeEventListener('icegatheringstatechange',check)
     resolve()
   }
   function check(){if(peer.iceGatheringState==='complete')done()}
   peer.addEventListener('icegatheringstatechange',check)
   check()
 })
 const sdp=peer.localDescription?.sdp
 if(!sdp)throw new Error('Could not create a room code.')
 return encodeRoomCode(id,type,sdp)
}

export function readRoomPlayback(raw:unknown):RoomPlayback|undefined{
 if(typeof raw!=='string'||raw.length>256)return
 try{
   const {video,position,playing}=JSON.parse(raw) as RoomPlayback
   if(typeof video==='string'&&/^[\w-]{11}$/.test(video)&&typeof playing==='boolean'
     &&Number.isFinite(position)&&position>=0&&position<=864_000)return {video,position,playing}
 }catch{}
}
