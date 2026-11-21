import {isMac} from './platform'
import {verifyVideoMetadata} from './creator-links'
import {animatedPreviewUrl,previewFrames} from './preview-frames'
import {configureYouTubeFrame} from './youtube-embed'
import {useEffect,useRef,useState} from 'react'
import {Play} from 'lucide-react'
import type {Video} from './domain'
import {clock} from './components'
import {playerApi} from './player'

function MotionPreview({video,delay=0}:{video:Video;delay?:number}){
 const [failed,setFailed]=useState(false),[ready,setReady]=useState(false)
 const [tile,setTile]=useState<ReturnType<NonNullable<ReturnType<typeof previewFrames>>['frame']>>()
 const animated=!failed?animatedPreviewUrl(video.id,video.previewImage):undefined
 useEffect(()=>{
  if(animated)return
  let active=true,timer:ReturnType<typeof setInterval>|undefined
  const images=new Map<string,HTMLImageElement>()
  let current:ReturnType<NonNullable<ReturnType<typeof previewFrames>>['frame']>|undefined
  const start=setTimeout(()=>{
   void verifyVideoMetadata(video.id).then(metadata=>{
    if(!active)return
    const frames=previewFrames(metadata.storyboard??'')
    if(!frames)return
    const first=Math.min(frames.count-1,Math.floor(frames.count*.12)),length=Math.min(24,frames.count-first)
    let index=0
    const draw=()=>{
     if(!active)return
     try{current=frames.frame(first+index++%length)}catch{clearInterval(timer);return}
     const frame=current
     let image=images.get(frame.url)
     if(image?.complete&&image.naturalWidth){setTile(frame);return}
     if(!image){
      image=new Image();images.set(frame.url,image)
      image.onload=()=>{if(active&&current?.url===frame.url)setTile(current)}
      image.onerror=()=>{if(active)clearInterval(timer)}
      image.src=frame.url
     }
    }
    draw();timer=setInterval(draw,650)
   }).catch(()=>{})
  },delay)
  return()=>{active=false;clearTimeout(start);clearInterval(timer);images.forEach(image=>{image.onload=null;image.onerror=null})}
 },[video.id,animated,delay])
 if(animated)return <span className="thumbnail-motion-preview" data-ready={ready} aria-hidden="true"><img src={animated} alt="" onLoad={()=>setReady(true)} onError={()=>{setReady(false);setFailed(true)}}/></span>
 if(!tile)return null
 return <span className="thumbnail-motion-preview" data-ready="true" data-preview-frame={tile.x+':'+tile.y} aria-hidden="true"><span style={{backgroundImage:'url('+JSON.stringify(tile.url)+')',backgroundSize:tile.cols*100+'% '+tile.rows*100+'%',backgroundPosition:tile.x+'% '+tile.y+'%'}}/></span>
}

function YouTubePreview({id,onPlaying}:{id:string;onPlaying:(playing:boolean)=>void}){
 const mount=useRef<HTMLSpanElement>(null)
 const [playing,setPlaying]=useState(false)
 useEffect(()=>{
   const host=mount.current!
   let disposed=false
   let player:InstanceType<NonNullable<Window['YT']>['Player']>|undefined
   const frame=document.createElement('iframe')
   frame.title='Muted YouTube preview'
   frame.tabIndex=-1
   frame.allow='autoplay; encrypted-media'
   const params=new URLSearchParams({
     autoplay:'1',mute:'1',controls:'0',playsinline:'1',rel:'0',
     enablejsapi:'1',origin:location.origin,cc_load_policy:'0',
   })
   void configureYouTubeFrame(frame,id,params).then(()=>{
     if(disposed)return
     host.appendChild(frame)
     return playerApi()
   }).then(YT=>{
     if(disposed||!YT)return
     player=new YT.Player(frame,{events:{
       onReady:()=>{if(!disposed){player?.mute();player?.playVideo()}},
       onStateChange:({data})=>{
         if(disposed)return
         if(data===1){setPlaying(true);onPlaying(true)}
         if(data===0){setPlaying(false);onPlaying(false)}
       },
       onError:()=>{if(!disposed){setPlaying(false);onPlaying(false)}},
     }})
   }).catch(()=>{})
   return ()=>{disposed=true;player?.destroy();host.replaceChildren()}
 },[id,onPlaying])
 return <span ref={mount} className="thumbnail-preview" data-playing={playing} aria-hidden="true"/>
}

function HoverPreview({video}:{video:Video}){
 const [playing,setPlaying]=useState(false)
 return <>{!playing&&<MotionPreview video={video} delay={isMac?0:2500}/>} {!isMac&&<YouTubePreview id={video.id} onPlaying={setPlaying}/>}</>
}

export function Thumbnail({video:v,onWatch,progress,checked}:{video:Video;onWatch:(v:Video)=>void;progress?:{at:number;duration:number};checked?:string}){
 const [previewId,setPreviewId]=useState<string>()
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
 const stop=()=>{
   clearTimeout(timer.current)
   setPreviewId(undefined)
 }
 function start(){
   if(v.live||v.upcoming||v.scheduledAt||v.paid||!v.embeddable)return
   if(!matchMedia('(hover:hover)').matches||matchMedia('(prefers-reduced-motion:reduce)').matches)return
   clearTimeout(timer.current)
   timer.current=setTimeout(()=>setPreviewId(v.id),450)
 }
 useEffect(()=>{
   const hidden=()=>{if(document.hidden)stop()}
   document.addEventListener('visibilitychange',hidden)
   window.addEventListener('blur',stop)
   return ()=>{
     document.removeEventListener('visibilitychange',hidden)
     window.removeEventListener('blur',stop)
     clearTimeout(timer.current)
   }
 },[v.id])
 return <button className="thumbnail video-thumbnail" aria-label={'Watch '+v.title} onClick={()=>{stop();onWatch(v)}} onMouseEnter={start} onMouseLeave={stop} onBlur={stop}>
   <span className="thumb-placeholder" aria-hidden="true"><Play size={21}/></span>
   {v.image&&<img src={v.image} loading="lazy" decoding="async" alt=""/>}
   {previewId===v.id&&<HoverPreview key={v.id} video={v}/>}
   {v.duration>0&&<span className="duration">{clock(v.duration)}</span>}
   {v.live&&<span className="live-badge">Live</span>}
   {!!(v.scheduledAt||v.upcoming)&&!v.live&&<span className="live-badge scheduled-badge">Scheduled</span>}
   {checked&&v.date>checked&&<span className="new-badge">New</span>}
   {!!progress?.at&&<span className="progress" style={{width:Math.min(100,100*progress.at/progress.duration)+'%'}}/>}
 </button>
}
