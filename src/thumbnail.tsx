import {useEffect,useRef,useState} from 'react'
import {Play} from 'lucide-react'
import type {Video} from './domain'
import {lookupCreator} from './creator-links'
import {previewFrames} from './preview-frames'


let stopCurrent:(()=>void)|undefined
export function Thumbnail({video:v,onWatch,progress,checked}:{video:Video;onWatch:(v:Video)=>void;progress?:{at:number;duration:number};checked?:string}){
 const [preview,setPreview]=useState(false)
 const [frames,setFrames]=useState<ReturnType<typeof previewFrames>>(),[frame,setFrame]=useState(0)
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
     if(v.previewImage?.startsWith('https://i.ytimg.com/an_webp/')){setFrames(undefined);setPreview(true);return}
     void lookupCreator(v.id).then(c=>{if(!hovered.current||!c.embeddable)return;const frames=previewFrames(c.storyboard??'');setFrames(frames);setFrame(0);setPreview(true)},()=>{})

   },750)
 }
 useEffect(()=>{
   const hidden=()=>{if(document.hidden)stop.current()}
   document.addEventListener('visibilitychange',hidden)
   return ()=>{document.removeEventListener('visibilitychange',hidden);clearTimeout(timer.current);stop.current=()=>{}}
 },[])
 useEffect(()=>{if(!preview||!frames)return;const interval=setInterval(()=>setFrame(f=>(f+1)%frames.count),450);return()=>clearInterval(interval)},[preview,frames])
 const tile=frames?.frame(frame)
 const duration=v.duration>=3600?Math.floor(v.duration/3600)+':'+String(Math.floor(v.duration/60)%60).padStart(2,'0')+':'+String(v.duration%60).padStart(2,'0'):Math.floor(v.duration/60)+':'+String(v.duration%60).padStart(2,'0')
 return <button className="thumbnail" aria-label={'Watch '+v.title} onClick={()=>{stop.current();onWatch(v)}} onMouseEnter={start} onMouseLeave={()=>stop.current()} onBlur={()=>stop.current()}>
   <span className="thumb-placeholder" aria-hidden="true"><Play size={21}/></span>
   {v.image&&<img src={v.image} loading="lazy" alt=""/>}
   {preview&&tile&&<span className="thumbnail-preview storyboard-preview" style={{backgroundImage:`url("${tile.url}")`,backgroundSize:`${tile.cols*100}% ${tile.rows*100}%`,backgroundPosition:`${tile.x}% ${tile.y}%`}}><img src={tile.url} alt="" hidden onError={()=>setPreview(false)}/></span>}
   {preview&&!tile&&<img className="thumbnail-preview" src={v.previewImage||'https://i.ytimg.com/an_webp/'+v.id+'/mqdefault_6s.webp'} alt="" onError={()=>setPreview(false)}/>}{preview&&<span className="preview-label">Preview</span>}
   {v.duration>0&&<span className="duration">{duration}</span>}
   {v.live&&<span className="live-badge">Live</span>}
   {!!v.scheduledAt&&!v.live&&<span className="live-badge scheduled-badge">Scheduled</span>}
   {checked&&v.date>checked&&<span className="new-badge">New</span>}
   {!!progress?.at&&<span className="progress" style={{width:Math.min(100,100*progress.at/progress.duration)+'%'}}/>}
 </button>
}
