import {RefreshCw} from 'lucide-react'
import {useEffect,useRef,useState} from 'react'
import {playbackClock} from './playback-clock'
type Player = {destroy():void;getCurrentTime():number;getDuration():number;getPlayerState():number;loadVideoById(id:string):void;seekTo(position:number,allow:boolean):void}
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
export function PlayerFrame({id,start,live=false,onSample,onPlay,onElapsed,onEnded,onController,onRestricted,sampleInterval=8}:{id:string;start:number;live?:boolean;onSample:(position:number,duration:number,playing:number)=>void;onPlay:()=>void;onElapsed:(seconds:number)=>void;onEnded?:()=>void;onController?:(position:()=>number)=>void;onRestricted?:()=>void;sampleInterval?:number}) {
 const mount=useRef<HTMLDivElement>(null), callbacks=useRef({onSample,onPlay,onElapsed,onEnded,onController,onRestricted})
 const initial=useRef(start)
 const resume=useRef(start),seekWhenReady=useRef(()=>{})
 resume.current=start
 useEffect(()=>{seekWhenReady.current()},[start])
 const [error,setError]=useState('')
 const [liveState,setLiveState]=useState<'connecting'|'playing'|'paused'|'buffering'|'ended'>('connecting')
 const jump=useRef<()=>void>(()=>{})
 callbacks.current={onSample,onPlay,onElapsed,onEnded,onController,onRestricted}
 useEffect(()=>{
   const host=mount.current!
   const frame=document.createElement('iframe')
   frame.title='YouTube video player'
   frame.allow='autoplay; encrypted-media; fullscreen; picture-in-picture'
   frame.allowFullscreen=true
   frame.referrerPolicy='strict-origin-when-cross-origin'
   const params=new URLSearchParams({autoplay:'1',controls:'1',enablejsapi:'1',origin:location.origin,rel:'0',playsinline:'1'})
   if(!live&&initial.current>0)params.set('start',String(Math.floor(initial.current)))
   frame.src='https://www.youtube.com/embed/'+id+'?'+params
   let closed=false, player:Player|undefined, ready=false, played=false, timed=0, lastPosition=-1
   const clock=playbackClock(performance.now())
   const count=(playing?:boolean)=>{
     const elapsed=clock.advance(performance.now(),playing)
     timed+=elapsed
     if(elapsed>0)callbacks.current.onElapsed(elapsed)
   }
   let bufferedAt=0,pausedAt=0,hiddenAt=0,lastJump=-Infinity,ended=false
   let resumed=initial.current>0
   seekWhenReady.current=()=>{
     if(!live&&ready&&player&&!resumed&&resume.current>0&&player.getCurrentTime()<5){
       resumed=true;player.seekTo(resume.current,true)
     }
   }
   const goLive=(manual=false)=>{
     if(closed||!live||!ready||!player||ended||(!manual&&Date.now()-lastJump<30_000))return
     lastJump=Date.now();bufferedAt=0;pausedAt=0;setLiveState('connecting')
     player.loadVideoById(id)
   }
   jump.current=()=>goLive(true)
   const sample=(force=false)=>{
     if(ready && player) {
       const playing=player.getPlayerState()===1
       if(force)count();else count(playing)
       if(live&&bufferedAt&&Date.now()-bufferedAt>14_000&&!document.hidden)goLive()
       const position=player.getCurrentTime(), duration=player.getDuration()
       if(force || timed>=sampleInterval || (duration>0&&playing&&Math.abs(position-lastPosition)>=sampleInterval)) {
         callbacks.current.onSample(position,duration,timed)
         lastPosition=position;timed=0
       }
     }
   }
   host.appendChild(frame)
   const timer=setInterval(sample,1000)
   playerApi().then(YT=>{
     if(closed) return
     player=new YT.Player(frame,{events:{
       onReady:()=>{ready=true;sample();callbacks.current.onController?.(()=>player?.getCurrentTime()??0);seekWhenReady.current()},
       onStateChange:e=>{
         if(closed)return
         count(e.data===1)
         if(e.data===1 && !played) {played=true;callbacks.current.onPlay()}
         if(live){
           if(e.data===1){
             if(pausedAt&&Date.now()-pausedAt>12_000){goLive();pausedAt=0;return}
             pausedAt=0;bufferedAt=0;setLiveState('playing')
           }else if(e.data===2){pausedAt=Date.now();bufferedAt=0;setLiveState('paused')}
           else if(e.data===3){bufferedAt||=Date.now();setLiveState('buffering')}
           else if(e.data===0){ended=true;setLiveState('ended')}
         }
         if(e.data===0 || e.data===2) sample(true)
         if(e.data===0&&!live)callbacks.current.onEnded?.()
       },
       onError:e=>{if(closed)return;count(false);if([101,150].includes(e.data))callbacks.current.onRestricted?.();setError(e.data===153?'YouTube couldn’t play this video in Viddy. Try another result.':[101,150].includes(e.data)?'The creator has disabled embedded playback.':e.data===100?'This video is unavailable or private.':'YouTube could not play this video here.')}
     }})
   }).catch(e=>{if(!closed) setError(String(e.message??e))})
   const flush=()=>{if(played) sample(true)}
   const visibility=()=>{
     if(document.hidden){hiddenAt=Date.now();return}
     if(hiddenAt&&Date.now()-hiddenAt>18_000&&player?.getPlayerState()!==2)goLive()
     hiddenAt=0
   }
   if(live)document.addEventListener('visibilitychange',visibility)
   window.addEventListener('pagehide',flush)
   return ()=>{closed=true;jump.current=()=>{};seekWhenReady.current=()=>{};document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',flush);clearInterval(timer);flush();player?.destroy();host.replaceChildren()}
 },[id,live])
 return <><div className="player" ref={mount}/>{live&&!error&&<div className="live-control row">
   <span role="status">{liveState==='ended'?'Stream ended':liveState==='paused'?'Paused':liveState==='buffering'?'Buffering live stream…':liveState==='playing'?'Live stream':'Connecting to live stream…'}</span>
   {liveState!=='ended'&&<button className="button" title="Reconnect to the current live position" onClick={()=>jump.current()}><RefreshCw size={14}/> Resync live</button>}
 </div>}{error&&<p role="status" className="notice">{error}</p>}</>
}
