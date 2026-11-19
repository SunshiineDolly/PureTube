import {useEffect,useRef,useState} from 'react'
type Player = {destroy():void;getCurrentTime():number;getDuration():number;getPlayerState():number}
type Events = {onReady:()=>void;onError:(e:{data:number})=>void;onStateChange:(e:{data:number})=>void}
declare global { interface Window { YT?:{Player:new (frame:HTMLIFrameElement, config:{events:Events})=>Player};onYouTubeIframeAPIReady?:()=>void } }
let api:Promise<NonNullable<Window['YT']>>|undefined
function playerApi() {
 return api??=new Promise((resolve,reject)=>{
   if(window.YT?.Player) {resolve(window.YT);return}
   const script=document.createElement('script')
   const timer=setTimeout(()=>{script.remove();reject(new Error('The YouTube player could not be initialized.'))},12000)
   window.onYouTubeIframeAPIReady=()=>{clearTimeout(timer);if(window.YT) resolve(window.YT)}
   script.src='https://www.youtube.com/iframe_api'
   script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('The YouTube player could not be loaded.'))}
   document.head.appendChild(script)
 }).catch(e=>{api=undefined;throw e}) as Promise<NonNullable<Window['YT']>>
}
export function PlayerFrame({id,start,onSample,onPlay}:{id:string;start:number;onSample:(position:number,duration:number,playing:number)=>void;onPlay:()=>void}) {
 const mount=useRef<HTMLDivElement>(null), callbacks=useRef({onSample,onPlay})
 const initial=useRef(start)
 const [error,setError]=useState('')
 callbacks.current={onSample,onPlay}
 useEffect(()=>{
   const host=mount.current!
   const frame=document.createElement('iframe')
   frame.title='YouTube video player'
   frame.allow='encrypted-media; fullscreen; picture-in-picture'
   frame.allowFullscreen=true
   frame.referrerPolicy='strict-origin-when-cross-origin'
   const params=new URLSearchParams({autoplay:'0',controls:'1',enablejsapi:'1',origin:location.origin,rel:'0',playsinline:'1',start:String(Math.floor(initial.current))})
   frame.src='https://www.youtube.com/embed/'+id+'?'+params
   let closed=false, player:Player|undefined, ready=false, last=performance.now(), played=false, timed=0, lastPosition=-1
   const sample=(force=false)=>{
     const now=performance.now()
     if(ready && player) {
       const playing=player.getPlayerState()===1
       if(playing) timed+=Math.min((now-last)/1000,6)
       const position=player.getCurrentTime(), duration=player.getDuration()
       if(duration>0 && (force || timed>=8 || (playing && Math.abs(position-lastPosition)>=8))) {
         callbacks.current.onSample(position,duration,timed)
         lastPosition=position;timed=0
       }
     }
     last=now
   }
   host.appendChild(frame)
   const timer=setInterval(sample,1000)
   playerApi().then(YT=>{
     if(closed) return
     player=new YT.Player(frame,{events:{
       onReady:()=>{ready=true},
       onStateChange:e=>{
         if(e.data===1 && !played) {played=true;callbacks.current.onPlay()}
         if(e.data===0 || e.data===2) sample(true)
         last=performance.now()
       },
       onError:e=>setError(e.data===153?'YouTube did not accept this player identity. Open the video in your browser.':[101,150].includes(e.data)?'The creator has disabled embedded playback.':e.data===100?'This video is unavailable or private.':'YouTube could not play this video here.')
     }})
   }).catch(e=>{if(!closed) setError(String(e.message??e))})
   const flush=()=>{if(played) sample(true)}
   window.addEventListener('pagehide',flush)
   return ()=>{closed=true;window.removeEventListener('pagehide',flush);clearInterval(timer);flush();player?.destroy();host.replaceChildren()}
 },[id])
 return <><div className="player" ref={mount}/>{error&&<p role="status" className="notice">{error}</p>}</>
}
