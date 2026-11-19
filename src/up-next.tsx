import {useEffect,useState,useRef} from 'react'
import {Play,X} from 'lucide-react'
import {invoke} from '@tauri-apps/api/core'
import {requestCatalog,requestChannel} from './catalog'
import {nextVideos} from './autoplay'
import {categoryFor,topicQuery,rankedTopics} from './topics'
import {fillCreator,type Video} from './domain'
import type {Library} from './library'
const playedThisSession=new Set<string>()

export function useUpNext(current:Video,data:Library,followed:Video[]=[],played:string[]=[]){
 const [found,setFound]=useState<Video[]>([]),related=useRef<string[]>([])
 useEffect(()=>{
  let active=true;setFound([]);related.current=[]
  if(!current.id||current.title==='YouTube video')return
  playedThisSession.add(current.id)
  const topic=categoryFor(current)
  const learned=data.settings.history?rankedTopics(data.interests).filter(t=>data.interests[t.name]>0).map(t=>t.name):[]
  const queries=[topic?topicQuery(topic):(current.channel+' '+current.title).slice(0,140),topicQuery(data.preferredTopics[0]??learned[0]??topic??'Documentaries')]
  const requests=queries.map(q=>requestCatalog(q,'all'))
  requests.push(invoke<Video[]>('related_videos',{id:current.id}).then(items=>{if(active)related.current=items.map(v=>v.id);return {items,next:null}}))
  if(current.channelId)requests.push(requestChannel(current.channelId,'videos'))
  const other=data.follows.filter(id=>id!==current.channelId)
  if(other.length)requests.push(requestChannel(other[Math.floor(Date.now()/300000)%other.length],'videos'))
  for(const task of requests)void task.then(page=>{if(active)setFound(old=>[...old,...page.items.map(v=>v.channelId===current.channelId?fillCreator(v,current.channel,current.channelImage):v)])},()=>{})
  return()=>{active=false}
 },[current.id,current.channelId])
 return nextVideos(current,[...followed,...found],data,[...played,...playedThisSession],related.current)
}
export function UpNext({videos,autoplay,ended,onToggle,onWatch}:{videos:Video[];autoplay:boolean;ended:boolean;onToggle:()=>void;onWatch:(v:Video)=>void}){
 const [limit,setLimit]=useState(8)
 const [cancelled,setCancelled]=useState(false),[seconds,setSeconds]=useState(8)
 const next=videos[0]
 useEffect(()=>{setSeconds(8);setCancelled(false)},[ended,next?.id,autoplay])
 useEffect(()=>{
  if(!ended||!autoplay||cancelled||!next)return
  if(seconds===0){onWatch(next);return}
  const timer=setTimeout(()=>setSeconds(n=>n-1),1000);return()=>clearTimeout(timer)
 },[ended,autoplay,cancelled,next?.id,seconds])
 return <section className="up-next" aria-label="Up next"><div className="row"><h2>Up next</h2><label className="autoplay-toggle"><input type="checkbox" checked={autoplay} onChange={onToggle}/> Autoplay</label></div>
 {ended&&autoplay&&!cancelled&&next&&<div className="autoplay-countdown" role="status"><span>Playing next in {seconds}s</span><button className="button" onClick={()=>onWatch(next)}><Play size={14}/> Play now</button><button className="icon" aria-label="Cancel autoplay" onClick={()=>setCancelled(true)}><X size={17}/></button></div>}
 {next?<><div className="up-next-list">{videos.slice(0,limit).map(v=><button className="up-next-card" key={v.id} onClick={()=>onWatch(v)}><img src={v.image} alt=""/><span><strong>{v.title}</strong><small>{v.channel}</small></span></button>)}</div>{videos.length>limit&&<button className="text-button more-recommendations" onClick={()=>setLimit(n=>n+8)}>More recommendations</button>}</>:<p className="meta">Finding unwatched videos from your creators and interests…</p>}
 </section>
}
