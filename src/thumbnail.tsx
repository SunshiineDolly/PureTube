import {useEffect,useRef,useState} from 'react'
import {Play} from 'lucide-react'
import type {Video} from './domain'
import {lookupCreator} from './creator-links'

let stopCurrent:(()=>void)|undefined
export function Thumbnail({video:v,onWatch,progress,checked}:{video:Video;onWatch:(v:Video)=>void;progress?:{at:number;duration:number};checked?:string}){
 const [preview,setPreview]=useState(false)
 const [restricted,setRestricted]=useState(false),hovered=useRef(false)
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
 const stop=useRef(()=>{})
 stop.current=()=>{hovered.current=false;clearTimeout(timer.current);setPreview(false)}
 function start(){
   if(v.scheduledAt||!v.embeddable||!matchMedia('(hover:hover)').matches||matchMedia('(prefers-reduced-motion:reduce)').matches)return
   hovered.current=true
   timer.current=setTimeout(()=>{
     void lookupCreator(v.id).then(creator=>{if(!hovered.current)return;if(!creator.embeddable){setRestricted(true);return}
     stopCurrent?.()
     const close=()=>stop.current()
     stopCurrent=close
     setPreview(true)
     },()=>{})
   },750)
 }
 useEffect(()=>{
   const hidden=()=>{if(document.hidden)stop.current()}
   document.addEventListener('visibilitychange',hidden)
   return ()=>{document.removeEventListener('visibilitychange',hidden);clearTimeout(timer.current);stop.current=()=>{}}
 },[])
 const params=new URLSearchParams({autoplay:'1',mute:'1',controls:'0',rel:'0',playsinline:'1',origin:location.origin})
 const duration=v.duration>=3600?Math.floor(v.duration/3600)+':'+String(Math.floor(v.duration/60)%60).padStart(2,'0')+':'+String(v.duration%60).padStart(2,'0'):Math.floor(v.duration/60)+':'+String(v.duration%60).padStart(2,'0')
 return <button className="thumbnail" aria-label={'Watch '+v.title} onClick={()=>{stop.current();onWatch(v)}} onMouseEnter={start} onMouseLeave={()=>stop.current()} onBlur={()=>stop.current()}>
   <span className="thumb-placeholder" aria-hidden="true"><Play size={21}/></span>
   {v.image&&<img src={v.image} loading="lazy" alt=""/>}
   {preview&&<iframe className="thumbnail-preview" src={'https://www.youtube.com/embed/'+v.id+'?'+params} title="Muted video preview" tabIndex={-1} aria-hidden="true" allow="autoplay; encrypted-media" referrerPolicy="strict-origin-when-cross-origin"/>}
   {preview&&<span className="preview-label">Muted preview</span>}
   {restricted&&<span className="preview-label">Original YouTube player</span>}
   {v.duration>0&&<span className="duration">{duration}</span>}
   {v.live&&<span className="live-badge">Live</span>}
   {!!v.scheduledAt&&!v.live&&<span className="live-badge scheduled-badge">Scheduled</span>}
   {checked&&v.date>checked&&<span className="new-badge">New</span>}
   {!!progress?.at&&<span className="progress" style={{width:Math.min(100,100*progress.at/progress.duration)+'%'}}/>}
 </button>
}
