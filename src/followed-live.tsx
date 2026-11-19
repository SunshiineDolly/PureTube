import {useEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {Radio,RefreshCw} from 'lucide-react'
import {errorText,visible,type Video} from './domain'
import {CreatorAvatar} from './creator-avatar'
import type {Shared} from './screens'

type Check={video:Video|null;checked:number;error?:string}
export function useFollowedLive(ids:string[]){
 const [states,setStates]=useState<Record<string,Check>>({})
 const [busy,setBusy]=useState(false)
 const updateRef=useRef<()=>void>(()=>{})
 const key=JSON.stringify(ids)
 useEffect(()=>{
   let active=true,working=false,last=0,offset=0
   setStates(previous=>Object.fromEntries(ids.filter(id=>previous[id]).map(id=>[id,previous[id]])))
   async function update(){
     if(!active||working)return
     working=true;last=Date.now();setBusy(true)
     const currentIds=ids.slice(offset).concat(ids.slice(0,offset)).slice(0,30)
     offset=ids.length?(offset+currentIds.length)%ids.length:0
     try{
       for(let n=0;active&&n<currentIds.length;n+=3){
         await Promise.all(currentIds.slice(n,n+3).map(async id=>{
           try{
             const video=await invoke<Video|null>('channel_live',{id})
             if(active)setStates(s=>({...s,[id]:{video,checked:Date.now()}}))
           }catch(e){if(active)setStates(s=>({...s,[id]:{video:s[id]?.video??null,checked:s[id]?.checked??0,error:errorText(e)}}))}
         }))
       }
     }finally{working=false;if(active)setBusy(false)}
   }
   updateRef.current=()=>void update()
   void update()
   const timer=setInterval(()=>{if(!document.hidden)void update()},45_000)
   const focus=()=>{if(Date.now()-last>15_000)void update()}
   window.addEventListener('focus',focus)
   return ()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focus)}
 },[key])
 return {states,busy,refresh:()=>updateRef.current()}
}
export type FollowedLive=ReturnType<typeof useFollowedLive>

export function FollowedLiveShelf({shared}:{shared:Shared}){
 const streams=Object.values(shared.live.states).flatMap(check=>check.video&&!check.error?[check.video]:[])
   .filter(v=>visible(v,shared.data.settings))
 if(!streams.length)return null
 return <section className="followed-live" aria-label="Live from your follows">
   <div className="starter-heading"><h2><Radio size={18}/> Live from your follows <span>{streams.length}</span></h2>
   <button className="icon" aria-label="Refresh followed live streams" disabled={shared.live.busy} onClick={shared.live.refresh}><RefreshCw size={15}/></button></div>
   <div className="followed-live-track">{streams.map(v=><button className="followed-live-card" key={v.id} aria-label={'Watch live: '+v.channel} onClick={()=>shared.watch(v)}>
     <img src={v.image} alt=""/>
     <div><span className="on-air"><i/> LIVE NOW</span><strong>{v.channel}</strong><span className="live-card-title">{v.title}</span></div>
     <CreatorAvatar id={v.channelId} name={v.channel}/>
   </button>)}</div>
 </section>
}
