import {PlaylistPlayer,type PlaylistQueue} from './playlist-queue'
import {useEffect,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {listen} from '@tauri-apps/api/event'
import {Pin,PinOff,ArrowUpLeft,ListPlus} from 'lucide-react'
import {PlayerFrame} from './player'
import {WindowControls} from './window-controls'
import {decode,empty,type Library} from './library'
import type {Video} from './domain'
import {errorText} from './domain'
import {lookupCreator} from './creator-links'
import {linkVideo} from './public-feeds'
import {useUpNext,UpNext} from './up-next'
import {applyPalette,readAccent,type Mode} from './palettes'
type Payload={playlist?:PlaylistQueue;video:Video;start:number;theme:string;accent:string;autoplay:boolean}
export function MiniPlayer(){
 const [playbackRun,setPlaybackRun]=useState(0)
 const [payload,setPayload]=useState<Payload>(),[data,setData]=useState<Library>(empty),[pinned,setPinned]=useState(true),[error,setError]=useState(''),[ended,setEnded]=useState(false),[played,setPlayed]=useState<string[]>([])
 useEffect(()=>{
  void invoke<Payload>('player_state').then(setPayload)
  void invoke('load').then(raw=>{if(raw)setData(decode(raw))})
  const stop=listen<Payload>('player-load',e=>{setPayload(e.payload);setEnded(false)})
  return()=>{void stop.then(f=>f())}
 },[])
 useEffect(()=>{if(payload)applyPalette(payload.theme as Mode,readAccent(payload.accent))},[payload?.theme,payload?.accent])
 useEffect(()=>{document.documentElement.dataset.cursor=data.settings.themedCursor?'themed':'system'},[data.settings.themedCursor])
 const current=payload?.video
 useEffect(()=>{if(!current?.id)return;let active=true;void lookupCreator(current.id).then(c=>{if(!active)return;setPayload(old=>old?.video.id===current.id?{...old,video:{...old.video,title:c.title||old.video.title,channelId:c.id,channel:c.name,views:c.views,date:c.date}}:old)},()=>{});return()=>{active=false}},[current?.id])
 const queue=useUpNext(current??{id:'',title:'',channelId:'',channel:'',description:'',image:'',date:'',duration:0,embeddable:true,paid:false,shorts:false},data,[],played)
 async function watch(video:Video){
  try{await invoke('player_video',{video});setPlaybackRun(n=>n+1);setPlayed(old=>[...old,current!.id]);setPayload(old=>old?{...old,video,start:0,playlist:old.playlist?{...old.playlist,index:old.playlist.ids.indexOf(video.id)}:undefined}:old);setEnded(false)}catch(e){setError(errorText(e))}
 }
 return <div className="mini-player"><header data-tauri-drag-region><span className="mini-title" title={current?.title} data-tauri-drag-region>{current?.title??'Viddy'}</span><button className="icon" aria-label={pinned?'Unpin player':'Pin player'} title={pinned?'Unpin from top':'Keep on top'} onClick={()=>void invoke('player_pin',{pinned:!pinned}).then(()=>setPinned(!pinned),e=>setError(errorText(e)))}>{pinned?<Pin size={16}/>:<PinOff size={16}/>}</button><button className="icon" aria-label="Return player to main window" onClick={()=>void invoke('close_player')}><ArrowUpLeft size={17}/></button><WindowControls/></header>
 {current&&<PlayerFrame onVideoChange={id=>void watch(linkVideo(id))} key={current.id+':'+playbackRun} id={current.id} start={payload.start??0} live={current.live} sampleInterval={1} onElapsed={()=>{}} onSample={(position,duration,elapsed)=>void invoke('player_sample',{videoId:current.id,position,duration,elapsed,started:false}).catch(()=>{})} onPlay={()=>void invoke('player_sample',{videoId:current.id,position:0,duration:0,elapsed:0,started:true}).catch(()=>{})} onEnded={()=>setEnded(true)}/>}
 {error&&<p role="status" className="notice">{error}</p>}
 {payload?.playlist&&<PlaylistPlayer queue={payload.playlist} data={data} ended={ended} onWatch={index=>void watch(data.savedVideos[payload.playlist!.ids[index]]??{...current!,id:payload.playlist!.ids[index],title:'YouTube video'})} onClose={()=>{setPayload(old=>old?{...old,playlist:undefined}:old);void invoke('player_queue',{queue:null})}} onRepeat={()=>{const q={...payload.playlist!,repeat:!payload.playlist!.repeat};setPayload(old=>old?{...old,playlist:q}:old);void invoke('player_queue',{queue:q})}}/>}
 {current&&<UpNext key={current.id} videos={queue.videos} ended={!current.live&&!payload.playlist&&ended} autoplay={!current.live&&!payload.playlist&&payload.autoplay} queueActive={!!payload.playlist} onToggle={()=>{const enabled=!payload.autoplay;setPayload(old=>old?{...old,autoplay:enabled}:old);void invoke('player_autoplay',{enabled}).catch(e=>setError(errorText(e)))}} onWatch={v=>void watch(v)}/>} 
 </div>
}
