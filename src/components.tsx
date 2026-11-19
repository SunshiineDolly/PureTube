import {Play, ExternalLink, Clock3, Heart, Plus, UserRound, PlaySquare, LoaderCircle} from 'lucide-react'
import type {Video} from './domain'
export const day = (date:string) => date && Number.isFinite(Date.parse(date)) ? new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric'}).format(new Date(date)) : ''
export const clock = (s:number) => {const t=Math.max(0,Math.floor(s));return t>=3600 ? Math.floor(t/3600)+':'+String(Math.floor(t/60)%60).padStart(2,'0')+':'+String(t%60).padStart(2,'0') : Math.floor(t/60)+':'+String(t%60).padStart(2,'0')}
export function Empty({title,detail,action}:{title:string;detail:string;action?:React.ReactNode}) {
 return <div className="empty"><span className="empty-icon"><PlaySquare size={24}/></span><h2>{title}</h2><p>{detail}</p>{action}</div>
}
export function Loading(){return <><span className="sr-only" role="status">Loading</span><div className="video-grid">{Array.from({length:6},(_,i)=><div key={i} className="skeleton"/>)}</div></>}
export function More({busy,onClick}:{busy:boolean;onClick:()=>void}){return <div className="more"><button className="button" disabled={busy} onClick={onClick}>{busy?<LoaderCircle size={16} className="spin"/>:<Plus size={16}/>} Load more</button></div>}
export function VideoGrid({items,onWatch,onChannel,progress,later,onSave,checked}:{items:Video[];onWatch:(v:Video)=>void;onChannel:(id:string)=>void;progress?:Record<string,{at:number;duration:number}>;later?:string[];onSave?:(id:string)=>void;checked?:Record<string,string>}) {
 return <div className="video-grid">{items.map(v=><article className="card" key={v.id}>
   <button className="thumbnail" onClick={()=>onWatch(v)} aria-label={'Watch '+v.title}>
     {v.image?<img src={v.image} loading="lazy" alt=""/>:<Play size={30}/>}
     {v.duration>0&&<span className="duration">{clock(v.duration)}</span>}
     {checked?.[v.channelId] && v.date>checked[v.channelId]&&<span className="new-badge">New</span>}
     {!!progress?.[v.id]?.at&&<span className="progress" style={{width:Math.min(100,100*progress[v.id].at/progress[v.id].duration)+'%'}}/>}
   </button>
   <div className="card-body"><button className="video-title" onClick={()=>onWatch(v)}>{v.title}</button>
   {onSave&&<button className={'icon small '+(later?.includes(v.id)?'active':'')} title={later?.includes(v.id)?'Remove from Watch Later':'Save to Watch Later'} aria-label={later?.includes(v.id)?'Remove from Watch Later':'Save to Watch Later'} aria-pressed={later?.includes(v.id)} onClick={()=>onSave(v.id)}><Clock3 size={15}/></button>}</div>
   <button className="byline" onClick={()=>onChannel(v.channelId)}>{v.channel}</button>
   <p className="meta">{day(v.date)}</p>
 </article>)}</div>
}
export function Avatar({src}:{src:string}) {return <span className="avatar">{src?<img src={src} alt="" loading="lazy"/>:<UserRound size={22}/>}</span>}
export {ExternalLink, Clock3, Heart}
