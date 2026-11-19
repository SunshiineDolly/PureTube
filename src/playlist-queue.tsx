import {useEffect,useState} from 'react'
import {SkipBack,SkipForward,Repeat,ListVideo,X,Play} from 'lucide-react'
import type {Video} from './domain'
import type {Library} from './library'
import {linkVideo} from './public-feeds'
export type PlaylistQueue={name:string;ids:string[];index:number;repeat:boolean}
export function PlaylistPlayer({queue,data,ended,onWatch,onClose,onRepeat}:{queue:PlaylistQueue;data:Library;ended:boolean;onWatch:(index:number)=>void;onClose:()=>void;onRepeat:()=>void}){
 const [cancelled,setCancelled]=useState(false),[seconds,setSeconds]=useState(5)
 const next=queue.index+1<queue.ids.length?queue.index+1:queue.repeat?0:-1
 useEffect(()=>{setCancelled(false);setSeconds(5)},[ended,queue.index])
 useEffect(()=>{if(!ended||cancelled||next<0)return;if(seconds===0){onWatch(next);return}const timer=setTimeout(()=>setSeconds(n=>n-1),1000);return()=>clearTimeout(timer)},[ended,cancelled,next,seconds])
 return <section className="playlist-player" aria-label="Playlist queue"><header><div><ListVideo size={18}/><span><strong>{queue.name}</strong><small>{queue.index+1} / {queue.ids.length}</small></span></div><button className="icon" aria-label="Close playlist queue" onClick={onClose}><X size={16}/></button></header><div className="playlist-transport"><button className="icon" aria-label="Previous playlist video" disabled={queue.index===0&&!queue.repeat} onClick={()=>onWatch(queue.index?queue.index-1:queue.ids.length-1)}><SkipBack size={17}/></button><button className="icon" aria-label="Next playlist video" disabled={next<0} onClick={()=>onWatch(next)}><SkipForward size={17}/></button><button className="icon" aria-label="Repeat playlist" aria-pressed={queue.repeat} onClick={onRepeat}><Repeat size={17}/></button><span>Playing in order</span></div>
 {ended&&next>=0&&!cancelled&&<div className="playlist-advance" role="status"><span>Next video in {seconds}s</span><button onClick={()=>setCancelled(true)}>Cancel</button></div>}{ended&&next<0&&<p className="meta playlist-end">You’ve reached the end of this playlist.</p>}
 <div className="playlist-queue-list">{queue.ids.map((id,index)=>{const v=data.savedVideos[id]??linkVideo(id);return <button key={id} className={index===queue.index?'playing':''} aria-current={index===queue.index?'true':undefined} onClick={()=>onWatch(index)}><span>{index===queue.index?<Play size={12}/>:index+1}</span><img src={'https://i.ytimg.com/vi/'+id+'/mqdefault.jpg'} alt="" loading="lazy"/><span><strong>{v.title==='YouTube video'?'Video '+(index+1):v.title}</strong><small>{v.channel}</small></span></button>})}</div></section>
}
