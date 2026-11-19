import {useEffect,useRef,useState} from 'react'
import {Play} from 'lucide-react'
import type {Video} from './domain'
import {invoke} from '@tauri-apps/api/core'
const previewCache=new Map<string,{url:string;at:number}>()
const pendingPreviews=new Map<string,Promise<string>>()

function smoothPreview(id:string){
 const cached=previewCache.get(id)
 if(cached&&Date.now()-cached.at<15*60_000)return Promise.resolve(cached.url)
 const pending=pendingPreviews.get(id)
 if(pending)return pending
 if(pendingPreviews.size>=2)return
 const request=invoke<string>('preview_stream',{id}).then(url=>{
   previewCache.delete(id)
   previewCache.set(id,{url,at:Date.now()})
   if(previewCache.size>60)previewCache.delete(previewCache.keys().next().value!)
   return url
 }).finally(()=>pendingPreviews.delete(id))
 pendingPreviews.set(id,request)
 return request
}

export function Thumbnail({video:v,onWatch,progress,checked}:{video:Video;onWatch:(v:Video)=>void;progress?:{at:number;duration:number};checked?:string}){
 const [preview,setPreview]=useState<{id:string;url:string;playing:boolean}>()
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
 const run=useRef(0)
 const stop=()=>{
   run.current++
   clearTimeout(timer.current)
   setPreview(undefined)
 }
 function start(){
   if(v.live||v.scheduledAt||v.paid||!v.embeddable||!matchMedia('(hover:hover)').matches||matchMedia('(prefers-reduced-motion:reduce)').matches)return
   const current=++run.current
   timer.current=setTimeout(()=>{
     void smoothPreview(v.id)?.then(url=>{
       if(run.current===current)setPreview({id:v.id,url,playing:false})
     },()=>{/* Keep the thumbnail when YouTube does not supply a playable stream. */})
   },250)
 }
 useEffect(()=>{
   const hidden=()=>{if(document.hidden)stop()}
   document.addEventListener('visibilitychange',hidden)
   return ()=>{
     document.removeEventListener('visibilitychange',hidden)
     run.current++
     clearTimeout(timer.current)
   }
 },[v.id])
 const currentPreview=preview?.id===v.id?preview:undefined
 const duration=v.duration>=3600?Math.floor(v.duration/3600)+':'+String(Math.floor(v.duration/60)%60).padStart(2,'0')+':'+String(v.duration%60).padStart(2,'0'):Math.floor(v.duration/60)+':'+String(v.duration%60).padStart(2,'0')
 return <button className="thumbnail video-thumbnail" aria-label={'Watch '+v.title} onClick={()=>{stop();onWatch(v)}} onMouseEnter={start} onMouseLeave={stop} onBlur={stop}>
   <span className="thumb-placeholder" aria-hidden="true"><Play size={21}/></span>
   {v.image&&<img src={v.image} loading="lazy" alt=""/>}
   {currentPreview&&<video className="thumbnail-preview" data-playing={currentPreview.playing}
     src={currentPreview.url} muted autoPlay loop playsInline disablePictureInPicture aria-hidden="true"
     onPlaying={()=>setPreview(active=>active?.url===currentPreview.url?{...active,playing:true}:active)}
     onError={()=>{
       if(previewCache.get(v.id)?.url===currentPreview.url)previewCache.delete(v.id)
       stop()
     }}/>}
   {v.duration>0&&<span className="duration">{duration}</span>}
   {v.live&&<span className="live-badge">Live</span>}
   {!!v.scheduledAt&&!v.live&&<span className="live-badge scheduled-badge">Scheduled</span>}
   {checked&&v.date>checked&&<span className="new-badge">New</span>}
   {!!progress?.at&&<span className="progress" style={{width:Math.min(100,100*progress.at/progress.duration)+'%'}}/>}
 </button>
}
