import {Play, ExternalLink, Clock3, Heart, Plus, UserRound, PlaySquare, LoaderCircle, Bookmark, ListPlus} from 'lucide-react'
import type {Video} from './domain'
import {useEffect,useRef} from 'react'
import {CreatorAvatar} from './creator-avatar'
import {CreatorByline,creditList} from './creator-links'
import {Thumbnail} from './thumbnail'
export const day = (date:string) => date && Number.isFinite(Date.parse(date)) ? new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric'}).format(new Date(date)) : ''
export const clock = (s:number) => {const t=Math.max(0,Math.floor(s));return t>=3600 ? Math.floor(t/3600)+':'+String(Math.floor(t/60)%60).padStart(2,'0')+':'+String(t%60).padStart(2,'0') : Math.floor(t/60)+':'+String(t%60).padStart(2,'0')}
export function Empty({title,detail,action}:{title:string;detail:string;action?:React.ReactNode}) {
 return <div className="empty"><span className="empty-icon"><PlaySquare size={24}/></span><h2>{title}</h2><p>{detail}</p>{action}</div>
}
export function Loading(){return <><span className="sr-only" role="status">Loading</span><div className="video-grid">{Array.from({length:6},(_,i)=><div key={i} className="skeleton"/>)}</div></>}
export function AutoMore({enabled,busy=false,onReach,error}:{enabled:boolean;busy?:boolean;onReach:()=>void;error?:string}){
 const sentinel=useRef<HTMLDivElement>(null)
 useEffect(()=>{
   if(!enabled||busy||error||!sentinel.current)return
   const node=sentinel.current,scroller=node.closest('.content');let fired=false
   const reach=()=>{if(fired)return;fired=true;observer.disconnect();onReach()}
   const check=()=>{if(!node.getClientRects().length)return;const bounds=node.getBoundingClientRect(),bottom=scroller?.getBoundingClientRect().bottom??innerHeight;if(bounds.top<=bottom+420)reach()}
   const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))reach()},{rootMargin:'420px'})
   observer.observe(node);scroller?.addEventListener('scroll',check,{passive:true});window.addEventListener('resize',check);check()
   return ()=>{observer.disconnect();scroller?.removeEventListener('scroll',check);window.removeEventListener('resize',check)}
 },[enabled,busy,onReach,error])
 if(!enabled&&!error)return null
 return <div className="more auto-more" ref={sentinel} data-scroll-sentinel role="status">{busy?<><LoaderCircle className="spin" size={16}/> Loading videos…</>:error?<><span>{error}</span><button className="button" onClick={onReach}>Try again</button></>:null}</div>
}
export function VideoGrid({items,onWatch,onChannel,progress,later,onSave,onQueue,checked,extra,gridRef}:{items:Video[];onWatch:(v:Video)=>void;onChannel:(id:string)=>void;progress?:Record<string,{at:number;duration:number}>;later?:string[];onSave?:(id:string)=>void;onQueue?:(v:Video)=>void;checked?:Record<string,string>;extra?:(v:Video)=>React.ReactNode;gridRef?:React.Ref<HTMLDivElement>}) {
 return <div className="video-grid" ref={gridRef}>{items.map(v=>{const owner=creditList(v)[0];return <article className="card" data-video-id={v.id} data-channel-id={v.channelId} key={v.id}>
   <Thumbnail video={v} onWatch={onWatch} progress={progress?.[v.id]} checked={checked?.[v.channelId]}/>
   <div className="video-meta-row">{v.channel&&<CreatorAvatar id={owner?.id??v.channelId} name={owner?.name??v.channel} src={owner?.image||v.channelImage}/>}<div className="video-details">
    <div className="card-body"><button className="video-title" onClick={()=>onWatch(v)}>{v.title}</button>
    {onQueue&&<button className="icon small" title="Add to queue" aria-label={"Add "+v.title+" to queue"} onClick={()=>onQueue(v)}><ListPlus size={15}/></button>}
    {onSave&&<button className={'icon small '+(later?.includes(v.id)?'active':'')} title={later?.includes(v.id)?'Remove from Watch Later':'Save to Watch Later'} aria-label={later?.includes(v.id)?'Remove from Watch Later':'Save to Watch Later'} aria-pressed={later?.includes(v.id)} onClick={()=>onSave(v.id)}><Bookmark size={15}/></button>}</div>
    <CreatorByline video={v} onChannel={onChannel}/>
    {(v.views||v.date||v.publishedLabel)&&<p className="meta">{[v.views,day(v.date)||v.publishedLabel].filter(Boolean).join(' · ')}</p>}
   </div></div>{extra?.(v)}
 </article>})}</div>
}
export function Avatar({src}:{src:string}) {return <span className="avatar">{src?<img src={src} alt="" loading="lazy"/>:<UserRound size={22}/>}</span>}
export {ExternalLink, Clock3, Heart}
