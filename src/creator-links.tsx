import {useEffect,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {channelId,errorText,type CreatorCredit,type Video} from './domain'

type WatchCreator=CreatorCredit&{title:string;date:string;live:boolean;upcoming?:boolean;embeddable:boolean;description?:string;views?:string;duration?:number;storyboard?:string;subscribers?:string}
const lookedUp=new Map<string,{task:Promise<WatchCreator>;expires:number}>()
export function lookupCreator(id:string){
 const cached=lookedUp.get(id)
 let task=cached&&cached.expires>Date.now()?cached.task:undefined
 if(!task){
   task=invoke<WatchCreator>('watch_creator',{id}).then(creator=>{
     if(!channelId(creator.id))throw Error('YouTube didn’t return a public creator.')
     const cached=lookedUp.get(id);if(cached)cached.expires=Date.now()+(creator.live||creator.upcoming?25_000:6*60*60_000)
     return creator
   }).catch(e=>{lookedUp.delete(id);throw e})
   lookedUp.set(id,{task,expires:Date.now()+30_000})
   if(lookedUp.size>120){const oldest=lookedUp.keys().next();if(!oldest.done)lookedUp.delete(oldest.value)}
 }
 return task
}
export function useWatchCreator(id:string,enabled:boolean){
 const [state,setState]=useState<{id:string;creator?:WatchCreator;error?:string}>()
 useEffect(()=>{
   if(!enabled)return
   let active=true
   const update=()=>{void lookupCreator(id).then(creator=>{if(active)setState({id,creator})},e=>{if(active)setState(s=>s?.id===id&&s.creator?s:{id,error:errorText(e)})})}
   update()
   const timer=setInterval(update,45_000)
   return ()=>{active=false;clearInterval(timer)}
 },[id,enabled])
 return {creator:state?.id===id?state.creator:undefined,loading:enabled&&state?.id!==id,error:state?.id===id?state.error:undefined}
}
export function creditList(v:Video){
 return v.creators?.length?v.creators:channelId(v.channelId)?[{id:v.channelId,name:v.channel||'Creator',image:v.channelImage}]:[]
}
export function CreatorByline({video,onChannel}:{video:Video;onChannel:(id:string)=>void}){
 const credits=creditList(video)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[resolved,setResolved]=useState<CreatorCredit>()
 const metric=(label:string)=>/^\d[\d.,]*\s*[KMB]?(?:\s+views)?$/i.test(label.trim())||label==='Creator'
 useEffect(()=>{if(!credits.some(c=>metric(c.name)))return;let active=true;void lookupCreator(video.id).then(c=>{if(active)setResolved(c)},()=>{});return()=>{active=false}},[video.id])
 return <div className="byline">
   {credits.length?credits.map((original,i)=>{const credit=resolved&&resolved.id===original.id?resolved:original;return <span key={credit.id}>{i>0?' · ':''}<button type="button" onClick={()=>onChannel(credit.id)}>{credit.name}</button></span>}):
   <button type="button" disabled={busy} onClick={()=>{
     setBusy(true);setError('')
     void lookupCreator(video.id).then(c=>onChannel(c.id),e=>setError(errorText(e))).finally(()=>setBusy(false))
   }}>{busy?'Finding creator…':video.channel||'Creator'}</button>}
   {error&&<span className="creator-link-error" role="status">{error}</span>}
 </div>
}
