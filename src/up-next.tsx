import {useEffect,useState,useRef} from 'react'
import {Play,X,ListPlus,Check} from 'lucide-react'
import {invoke} from '@tauri-apps/api/core'
import {requestCatalog,requestChannel,type CatalogPage} from './catalog'
import {nextVideos} from './autoplay'
import {categoryFor,topicQuery,rankedTopics,topics} from './topics'
import {fillCreator,errorText,type Video} from './domain'
import type {Library} from './library'
import {AutoMore} from './components'
const playedThisSession=new Set<string>()
type Source={query?:string;channel?:string;next:CatalogPage['next']}
export function useUpNext(current:Video,data:Library,followed:Video[]=[],played:string[]=[]){
 const [found,setFound]=useState<Video[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[pages,setPages]=useState(0)
 const related=useRef<string[]>([]),sources=useRef<Source[]>([]),generation=useRef(0),working=useRef(false),offset=useRef(0),empty=useRef(0),fallback=useRef(0),order=useRef<string[]>([])
 const latest=useRef({current,data});latest.current={current,data}
 const load=(s:Source)=>s.channel?requestChannel(s.channel,'videos',s.next):requestCatalog(s.query!,'all',s.next)
 useEffect(()=>{
  const run=++generation.current;setFound([]);related.current=[];sources.current=[];working.current=false;offset.current=0;empty.current=0;fallback.current=0;order.current=[];setPages(0);setError('')
  if(!current.id||current.title==='YouTube video')return
  playedThisSession.add(current.id);setBusy(true)
  const topic=categoryFor(current),learned=data.settings.history?rankedTopics(data.interests).filter(t=>data.interests[t.name]>0).map(t=>t.name):[]
  const queries=[topic?topicQuery(topic):(current.channel+' '+current.title).slice(0,140),topicQuery(data.preferredTopics[0]??learned[0]??topic??'Documentaries')]
  const initial:Source[]=[...new Set(queries)].map(query=>({query,next:null}))
  if(current.channelId)initial.push({channel:current.channelId,next:null})
  const other=data.follows.filter(id=>id!==current.channelId);if(other.length)initial.push({channel:other[Math.floor(Date.now()/300000)%other.length],next:null})
  sources.current=initial
  const append=(items:Video[])=>{if(generation.current===run)setFound(old=>[...new Map([...old,...items.map(v=>v.channelId===current.channelId?fillCreator(v,current.channel,current.channelImage):v)].map(v=>[v.id,v])).values()])}
  const requests=initial.map(s=>load(s).then(page=>{if(generation.current!==run)return;s.next=page.next;append(page.items)}))
  requests.push(invoke<Video[]>('related_videos',{id:current.id}).then(items=>{if(generation.current!==run)return;related.current=items.map(v=>v.id);append(items)}))
  void Promise.allSettled(requests).then(results=>{if(generation.current===run){setBusy(false);if(results.every(r=>r.status==='rejected'))setError('Could not load recommendations. Try again.')}})
  return()=>{generation.current++}
 },[current.id,current.channelId])
 async function more(){
  if(working.current||busy)return;working.current=true;setBusy(true);setError('');const run=generation.current
  if(!order.current.length)order.current=nextVideos(current,[...followed,...found],data,[...played,...playedThisSession],related.current,Infinity).map(v=>v.id)
  try{
   const list=sources.current;let source=list.find((s,i)=>i>=offset.current&&s.next)??list.find(s=>s.next)
   if(!source){const seed=[...current.id].reduce((n,c)=>n+c.charCodeAt(0),0),index=fallback.current++,topic=topics[(seed+index)%topics.length].name;source={query:topicQuery(topic)+(Math.floor(index/topics.length)%2?' recent videos':' videos'),next:null};list.push(source)}
   offset.current=(list.indexOf(source)+1)%Math.max(1,list.length)
   let added:Video[]=[]
   for(let skip=0;skip<3;skip++){
    const oldToken=source.next?.token,page=await load(source);if(run!==generation.current)return
    if(oldToken)setPages(n=>n+1);source.next=page.next?.token===oldToken?null:page.next;added.push(...page.items)
    const fresh=nextVideos(latest.current.current,added,latest.current.data,[...played,...playedThisSession],related.current,Infinity)
    if(fresh.length||!source.next)break
   }
   const existing=new Set([...found,...followed].map(v=>v.id));const novel=nextVideos(current,added,data,[...played,...playedThisSession],related.current,Infinity).filter(v=>!existing.has(v.id));empty.current=novel.length?0:empty.current+1;setFound(old=>[...new Map([...old,...added].map(v=>[v.id,v])).values()])
   if(empty.current>=3)setError('No new matches from these sources yet. Try again for another topic.')
  }catch(e){if(run===generation.current)setError(errorText(e))}finally{if(run===generation.current){working.current=false;setBusy(false)}}
 }
 const ranked=nextVideos(current,[...followed,...found],data,[...played,...playedThisSession],related.current,Infinity)
 const positions=new Map(order.current.map((id,i)=>[id,i]));if(order.current.length){for(const v of ranked)if(!positions.has(v.id)){positions.set(v.id,order.current.length);order.current.push(v.id)}ranked.sort((a,b)=>positions.get(a.id)!-positions.get(b.id)!)}
 return {videos:ranked,more,busy,error,pages}
}
export function UpNext({videos,autoplay,ended,onToggle,onWatch,onQueue,queued=[],onMore,busy=false,error='',queueActive=false,pages=0}:{pages?:number;queueActive?:boolean;queued?:string[];onQueue?:(v:Video)=>void;onMore?:()=>Promise<void>;busy?:boolean;error?:string;videos:Video[];autoplay:boolean;ended:boolean;onToggle:()=>void;onWatch:(v:Video)=>void}){
 const [limit,setLimit]=useState(8)
 const [cancelled,setCancelled]=useState(false),[seconds,setSeconds]=useState(8)
 const next=videos[0]
 useEffect(()=>{setSeconds(8);setCancelled(false)},[ended,next?.id,autoplay])
 useEffect(()=>{
  if(!ended||!autoplay||cancelled||!next)return
  if(seconds===0){onWatch(next);return}
  const timer=setTimeout(()=>setSeconds(n=>n-1),1000);return()=>clearTimeout(timer)
 },[ended,autoplay,cancelled,next?.id,seconds])
 return <section className="up-next" aria-label="Up next" data-continuation-pages={pages}><div className="row"><h2>Up next</h2>{queueActive?<span className="meta">Queue plays first</span>:<label className="autoplay-toggle"><input type="checkbox" checked={autoplay} onChange={onToggle}/> Autoplay</label>}</div>
 {ended&&autoplay&&!cancelled&&next&&<div className="autoplay-countdown" role="status"><span>Playing next in {seconds}s</span><button className="button" onClick={()=>onWatch(next)}><Play size={14}/> Play now</button><button className="icon" aria-label="Cancel autoplay" onClick={()=>setCancelled(true)}><X size={17}/></button></div>}
 <div className="up-next-list">{videos.slice(0,limit).map(v=><div className="up-next-item" key={v.id} data-video-id={v.id}><button className="up-next-card" onClick={()=>onWatch(v)}><img src={v.image} alt="" loading="lazy"/><span><strong>{v.title}</strong><small>{v.channel}</small></span></button>{onQueue&&<button className="icon small up-next-queue" aria-label={queued.includes(v.id)?v.title+' is queued':'Add '+v.title+' to queue'} title={queued.includes(v.id)?'Queued':'Add to queue'} disabled={queued.includes(v.id)} onClick={()=>onQueue(v)}>{queued.includes(v.id)?<Check size={15}/>:<ListPlus size={15}/>}</button>}</div>)}</div>
 {!next&&<p className="meta">{busy?'Finding unwatched videos…':'Scroll for more unwatched videos.'}</p>}
 {(onMore||videos.length>limit)&&<AutoMore enabled={true} busy={busy} error={error} onReach={()=>{if(videos.length>limit)setLimit(n=>n+8);else if(onMore)void onMore().then(()=>setLimit(n=>n+8))}}/>}
 </section>
}
