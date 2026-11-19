import {useEffect,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {listen} from '@tauri-apps/api/event'
import {Pin,PinOff,ArrowUpLeft} from 'lucide-react'
import {PlayerFrame} from './player'
import {WindowControls} from './window-controls'
import {decode,empty,type Library} from './library'
import type {Video} from './domain'
import {errorText} from './domain'
import {useUpNext,UpNext} from './up-next'
type Payload={video:Video;start:number;theme:string;accent:string;autoplay:boolean}
export function MiniPlayer(){
 const [payload,setPayload]=useState<Payload>(),[data,setData]=useState<Library>(empty),[pinned,setPinned]=useState(true),[error,setError]=useState(''),[ended,setEnded]=useState(false),[played,setPlayed]=useState<string[]>([])
 useEffect(()=>{
  void invoke<Payload>('player_state').then(setPayload)
  void invoke('load').then(raw=>{if(raw)setData(decode(raw))})
  const stop=listen<Payload>('player-load',e=>{setPayload(e.payload);setEnded(false)})
  return()=>{void stop.then(f=>f())}
 },[])
 useEffect(()=>{if(payload){document.documentElement.dataset.theme=payload.theme;document.documentElement.dataset.accent=payload.accent}},[payload?.theme,payload?.accent])
 const current=payload?.video
 const queue=useUpNext(current??{id:'',title:'',channelId:'',channel:'',description:'',image:'',date:'',duration:0,embeddable:true,paid:false,shorts:false},data,[],played)
 async function watch(video:Video){
  try{await invoke('player_video',{video});setPlayed(old=>[...old,current!.id]);setPayload(old=>old?{...old,video,start:0}:old);setEnded(false)}catch(e){setError(errorText(e))}
 }
 return <div className="mini-player"><header data-tauri-drag-region><span className="mini-title" data-tauri-drag-region>{current?.title??'PureTube'}</span><button className="icon" aria-label={pinned?'Unpin player':'Pin player'} title={pinned?'Unpin from top':'Keep on top'} onClick={()=>void invoke('player_pin',{pinned:!pinned}).then(()=>setPinned(!pinned),e=>setError(errorText(e)))}>{pinned?<Pin size={16}/>:<PinOff size={16}/>}</button><button className="icon" aria-label="Return player to main window" onClick={()=>void invoke('close_player')}><ArrowUpLeft size={17}/></button><WindowControls/></header>
 {current&&<PlayerFrame key={current.id} id={current.id} start={payload.start??0} live={current.live} sampleInterval={1} onElapsed={()=>{}} onSample={(position,duration,elapsed)=>void invoke('player_sample',{videoId:current.id,position,duration,elapsed,started:false}).catch(()=>{})} onPlay={()=>void invoke('player_sample',{videoId:current.id,position:0,duration:0,elapsed:0,started:true}).catch(()=>{})} onEnded={()=>setEnded(true)}/>}
 {error&&<p role="status" className="notice">{error}</p>}
 {current&&!current.live&&<UpNext key={current.id} videos={queue} ended={ended} autoplay={payload.autoplay} onToggle={()=>{const enabled=!payload.autoplay;setPayload(old=>old?{...old,autoplay:enabled}:old);void invoke('player_autoplay',{enabled}).catch(e=>setError(errorText(e)))}} onWatch={v=>void watch(v)}/>}
 </div>
}
