import {Play, ExternalLink, Clock3, Heart, Plus, UserRound, PlaySquare, LoaderCircle, Bookmark, ListPlus} from 'lucide-react'
import type {Video} from './domain'
import {memo,startTransition,useCallback,useEffect,useRef} from 'react'
import {CreatorAvatar} from './creator-avatar'
import {CreatorByline,creditList} from './creator-links'
import {Thumbnail} from './thumbnail'
const dateFormat=new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric'})
export const day = (date:string) => date && Number.isFinite(Date.parse(date)) ? dateFormat.format(new Date(date)) : ''
export const clock = (s:number) => {const t=Math.max(0,Math.floor(s));return t>=3600 ? Math.floor(t/3600)+':'+String(Math.floor(t/60)%60).padStart(2,'0')+':'+String(t%60).padStart(2,'0') : Math.floor(t/60)+':'+String(t%60).padStart(2,'0')}
export function Empty({title,detail,action}:{title:string;detail:string;action?:React.ReactNode}) {
 return <div className="empty"><span className="empty-icon"><PlaySquare size={24}/></span><h2>{title}</h2><p>{detail}</p>{action}</div>
}
export function Loading(){return <><span className="sr-only" role="status">Loading</span><div className="video-grid">{Array.from({length:6},(_,i)=><div key={i} className="skeleton"/>)}</div></>}
export function AutoMore({enabled,busy=false,onReach,error,revision}:{enabled:boolean;busy?:boolean;onReach:()=>void;error?:string;revision?:number|string}){
 const sentinel=useRef<HTMLDivElement>(null)
 const pending=useRef(onReach)
 pending.current=onReach
 useEffect(()=>{
   if(!enabled||busy||error||!sentinel.current)return
   const node=sentinel.current
   let armed=true
   const observer=new IntersectionObserver(entries=>{
     if(!armed||!entries.some(e=>e.isIntersecting))return
     armed=false;observer.disconnect()
     startTransition(()=>pending.current())
   },{root:node.closest('.content'),rootMargin:'0px 0px 1000px'})
   observer.observe(node)
   return ()=>{armed=false;observer.disconnect()}
 },[enabled,busy,error,revision])
 if(!enabled&&!error)return null
 return <div className="more auto-more" ref={sentinel} data-scroll-sentinel role="status">{busy?<><LoaderCircle className="spin" size={16}/> Loading videos…</>:error?<><span>{error}</span><button className="button" onClick={onReach}>Try again</button></>:null}</div>
}
type CardActions={onWatch:(v:Video)=>void;onChannel:(id:string)=>void;onSave?:(id:string)=>void;onQueue?:(v:Video)=>void}
type CardProps=CardActions&{video:Video;progress?:{at:number;duration:number};checked?:string;saved:boolean;extra?:(v:Video)=>React.ReactNode}
const VideoCard=memo(function VideoCard({video:v,onWatch,onChannel,progress,checked,saved,onSave,onQueue,extra}:CardProps){
 const owner=creditList(v)[0]
 return <article className="card" data-video-id={v.id} data-channel-id={v.channelId}>
   <Thumbnail video={v} onWatch={onWatch} progress={progress} checked={checked}/>
   <div className="video-meta-row">{v.channel&&<CreatorAvatar id={owner?.id??v.channelId} name={owner?.name??v.channel} src={owner?.image||v.channelImage}/>}<div className="video-details">
    <div className="card-body"><button className="video-title" onClick={()=>onWatch(v)}>{v.title}</button>
    {onQueue&&<button className="icon small" title="Add to queue" aria-label={"Add "+v.title+" to queue"} onClick={()=>onQueue(v)}><ListPlus size={15}/></button>}
    {onSave&&<button className={'icon small '+(saved?'active':'')} title={saved?'Remove from Watch Later':'Save to Watch Later'} aria-label={saved?'Remove from Watch Later':'Save to Watch Later'} aria-pressed={saved} onClick={()=>onSave(v.id)}><Bookmark size={15}/></button>}</div>
    <CreatorByline video={v} onChannel={onChannel}/>
    {(v.views||v.date||v.publishedLabel)&&<p className="meta">{[v.views,day(v.date)||v.publishedLabel].filter(Boolean).join(' · ')}</p>}
   </div></div>{extra?.(v)}
 </article>
})
export function VideoGrid({items,onWatch,onChannel,progress,later,onSave,onQueue,checked,extra,gridRef}:CardActions&{items:Video[];progress?:Record<string,{at:number;duration:number}>;later?:string[];checked?:Record<string,string>;extra?:CardProps['extra'];gridRef?:React.Ref<HTMLDivElement>}) {
 const actions=useRef({onWatch,onChannel,onSave,onQueue})
 actions.current={onWatch,onChannel,onSave,onQueue}
 const watch=useCallback((v:Video)=>actions.current.onWatch(v),[])
 const channel=useCallback((id:string)=>actions.current.onChannel(id),[])
 const save=useCallback((id:string)=>actions.current.onSave?.(id),[])
 const queue=useCallback((v:Video)=>actions.current.onQueue?.(v),[])
 const saved=new Set(later)
 return <div className="video-grid" ref={gridRef}>{items.map(v=><VideoCard key={v.id} video={v} onWatch={watch} onChannel={channel} onSave={onSave?save:undefined} onQueue={onQueue?queue:undefined} saved={saved.has(v.id)} progress={progress?.[v.id]} checked={checked?.[v.channelId]} extra={extra}/>)}</div>
}
export function Avatar({src}:{src:string}) {return <span className="avatar">{src?<img src={src} alt="" loading="lazy"/>:<UserRound size={22}/>}</span>}
export {ExternalLink, Clock3, Heart}
