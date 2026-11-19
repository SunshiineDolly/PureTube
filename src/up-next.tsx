import {useEffect,useState} from 'react'
import {Play,X} from 'lucide-react'
import {requestCatalog,requestChannel} from './catalog'
import {nextVideos} from './autoplay'
import {categoryFor,topicQuery} from './topics'
import {fillCreator,type Video} from './domain'
import type {Library} from './library'
const playedThisSession=new Set<string>()

export function useUpNext(current:Video,data:Library,followed:Video[]=[],played:string[]=[]){
 const [found,setFound]=useState<Video[]>([])
 useEffect(()=>{
  let active=true;setFound([])
  if(!current.id)return
  playedThisSession.add(current.id)
  const topic=categoryFor(current)
  const queries=[topicQuery(topic??'Vlogs'),(current.channel||current.title.slice(0,70))+' videos']
  const requests=queries.map(q=>requestCatalog(q,'all'))
  if(current.channelId)requests.push(requestChannel(current.channelId,'videos'))
  for(const task of requests)void task.then(page=>{if(active)setFound(old=>[...old,...page.items.map(v=>v.channelId===current.channelId?fillCreator(v,current.channel,current.channelImage):v)])},()=>{})
  return()=>{active=false}
 },[current.id,current.channelId])
 return nextVideos(current,[...followed,...found],data,[...played,...playedThisSession])
}
export function UpNext({videos,autoplay,ended,onToggle,onWatch}:{videos:Video[];autoplay:boolean;ended:boolean;onToggle:()=>void;onWatch:(v:Video)=>void}){
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
 {next?<div className="up-next-list">{videos.slice(0,4).map(v=><button className="up-next-card" key={v.id} onClick={()=>onWatch(v)}><img src={v.image} alt=""/><span><strong>{v.title}</strong><small>{v.channel}</small></span></button>)}</div>:<p className="meta">Finding more videos from your creators and interests…</p>}
 </section>
}
