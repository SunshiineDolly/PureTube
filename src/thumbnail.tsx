import {useEffect,useRef,useState} from 'react'
import {Play} from 'lucide-react'
import type {Video} from './domain'
import {invoke} from '@tauri-apps/api/core'
const previewCache=new Map<string,{url:string;at:number}>()
let preparing=0
async function smoothPreview(id:string){const cached=previewCache.get(id);if(cached&&Date.now()-cached.at<15*60_000)return cached.url;if(preparing>=2)throw Error('Preview busy');preparing++;try{const url=await invoke<string>('preview_stream',{id});previewCache.set(id,{url,at:Date.now()});if(previewCache.size>60)previewCache.delete(previewCache.keys().next().value!);return url}finally{preparing--}}


let stopCurrent:(()=>void)|undefined
export function Thumbnail({video:v,onWatch,progress,checked}:{video:Video;onWatch:(v:Video)=>void;progress?:{at:number;duration:number};checked?:string}){
 const [preview,setPreview]=useState(false)
 const [previewUrl,setPreviewUrl]=useState('')
 const hovered=useRef(false)
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
 const stop=useRef(()=>{})
 stop.current=()=>{hovered.current=false;clearTimeout(timer.current);setPreview(false)}
 function start(){
   if(v.scheduledAt||!v.embeddable||!matchMedia('(hover:hover)').matches||matchMedia('(prefers-reduced-motion:reduce)').matches)return
   hovered.current=true
   timer.current=setTimeout(()=>{
     if(!hovered.current)return
     stopCurrent?.()
     const close=()=>stop.current()
     stopCurrent=close
     void smoothPreview(v.id).then(url=>{if(hovered.current){setPreviewUrl(url);setPreview(true)}},()=>{})

   },750)
 }
 useEffect(()=>{
   const hidden=()=>{if(document.hidden)stop.current()}
   document.addEventListener('visibilitychange',hidden)
   return ()=>{document.removeEventListener('visibilitychange',hidden);clearTimeout(timer.current);stop.current=()=>{}}
 },[])
 const duration=v.duration>=3600?Math.floor(v.duration/3600)+':'+String(Math.floor(v.duration/60)%60).padStart(2,'0')+':'+String(v.duration%60).padStart(2,'0'):Math.floor(v.duration/60)+':'+String(v.duration%60).padStart(2,'0')
 return <button className="thumbnail" aria-label={'Watch '+v.title} onClick={()=>{stop.current();onWatch(v)}} onMouseEnter={start} onMouseLeave={()=>stop.current()} onBlur={()=>stop.current()}>
   <span className="thumb-placeholder" aria-hidden="true"><Play size={21}/></span>
   {v.image&&<img src={v.image} loading="lazy" alt=""/>}
   {preview&&<video className="thumbnail-preview" src={previewUrl} muted autoPlay loop playsInline onError={()=>setPreview(false)} aria-hidden="true"/>}
   {v.duration>0&&<span className="duration">{duration}</span>}
   {v.live&&<span className="live-badge">Live</span>}
   {!!v.scheduledAt&&!v.live&&<span className="live-badge scheduled-badge">Scheduled</span>}
   {checked&&v.date>checked&&<span className="new-badge">New</span>}
   {!!progress?.at&&<span className="progress" style={{width:Math.min(100,100*progress.at/progress.duration)+'%'}}/>}
 </button>
}
