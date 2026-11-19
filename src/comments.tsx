import {useEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {MessageCircle,ThumbsUp,CheckCircle2,Pin,ChevronDown,ChevronUp} from 'lucide-react'
import {AutoMore} from './components'
import {errorText,channelId} from './domain'
type Cursor={token:string;version:string;videoId:string}
type Comment={id:string;author:string;channelId:string;avatar:string;text:string;published:string;likes:string;verified:boolean;creator:boolean;pinned:string;replyLabel:string;replyCursor:Cursor|null}
type Page={items:Comment[];next:Cursor|null;sorts:Partial<Record<'top'|'newest',Cursor>>;count:string;unavailable:boolean;message?:string}
const cache=new Map<string,Page>()
async function request(id:string,cursor:Cursor|null,sort:string){
 return invoke<Page>('video_comments',{id,cursor,sort})
}
function CommentRow({comment:c,id,onChannel}:{comment:Comment;id:string;onChannel:(id:string)=>void}){
 const [expanded,setExpanded]=useState(false),[open,setOpen]=useState(false),[replies,setReplies]=useState<Comment[]>([]),[next,setNext]=useState(c.replyCursor),[busy,setBusy]=useState(false),[error,setError]=useState('')
 async function more(){if(busy||!next)return;setBusy(true);setError('');try{const page=await request(id,next,'top');setReplies(old=>[...new Map([...old,...page.items].map(v=>[v.id,v])).values()]);setNext(page.next)}catch(e){setError(errorText(e))}finally{setBusy(false)}}
 return <article className="comment-row" data-comment-id={c.id}><div className="comment-avatar">{c.avatar?<img src={c.avatar} alt="" loading="lazy"/>:<span>{Array.from(c.author)[0]}</span>}</div><div className="comment-body">
 {c.pinned&&<p className="comment-pin"><Pin size={12}/>{c.pinned}</p>}
 <div className="comment-byline"><button disabled={!channelId(c.channelId)} onClick={()=>onChannel(c.channelId)}>{c.author}</button>{c.verified&&<CheckCircle2 size={12}/>} {c.creator&&<span className="creator-tag">Creator</span>}<time>{c.published}</time></div>
 <p className={'comment-text '+(!expanded?'collapsed-text':'')}>{c.text}</p>{c.text.length>350&&<button className="text-button" onClick={()=>setExpanded(!expanded)}>{expanded?'Show less':'Read more'}</button>}
 <div className="comment-details">{c.likes&&<span><ThumbsUp size={13}/>{c.likes}</span>}{c.replyCursor&&<button className="comment-replies-toggle" aria-expanded={open} onClick={()=>{setOpen(!open);if(!open&&!replies.length)void more()}}>{open?<ChevronUp size={14}/>:<ChevronDown size={14}/>} {c.replyLabel||'View replies'}</button>}</div>
 {open&&<div className="comment-replies">{replies.map(reply=><CommentRow key={reply.id} comment={reply} id={id} onChannel={onChannel}/>)}{busy&&<p className="meta">Loading replies…</p>}{error&&<p role="status" className="meta">{error}</p>}{next&&!busy&&<button className="text-button" onClick={()=>void more()}>{error?'Try replies again':'More replies'}</button>}</div>}
 </div></article>
}
export function VideoComments({id,onChannel,onOriginal}:{id:string;onChannel:(id:string)=>void;onOriginal:()=>void}){
 const section=useRef<HTMLElement>(null),running=useRef(false),generation=useRef(0)
 const [active,setActive]=useState(false),[sort,setSort]=useState<'top'|'newest'>('top'),[page,setPage]=useState<Page>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0)
 useEffect(()=>{const node=section.current;if(!node)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setActive(true);observer.disconnect()}},{rootMargin:'180px'});observer.observe(node);return()=>observer.disconnect()},[])
 useEffect(()=>{
  if(!active)return;const run=++generation.current,key=id+sort;const cached=cache.get(key);if(cached&&retry===0){setPage(cached);setBusy(false);setError('');return}
  setBusy(true);setError('');setPage(undefined)
  void request(id,null,sort).then(result=>{if(generation.current===run){
    if(result.items.length&&!result.message){cache.set(key,result);if(cache.size>45)cache.delete(cache.keys().next().value!)}
    setPage(result)
  }},e=>{if(generation.current===run)setError(errorText(e))}).finally(()=>{if(generation.current===run)setBusy(false)})
  return()=>{generation.current++}
 },[id,active,sort,retry])
 async function more(){if(!page?.next||running.current)return;const run=generation.current;running.current=true;setBusy(true);setError('');try{const result=await request(id,page.next,sort);if(run!==generation.current)return;const combined={...page,items:[...new Map([...page.items,...result.items].map(v=>[v.id,v])).values()],next:result.next?.token===page.next.token?null:result.next};cache.set(id+sort,combined);setPage(combined)}catch(e){if(run===generation.current)setError(errorText(e))}finally{running.current=false;if(run===generation.current)setBusy(false)}}
 return <section className="video-comments" ref={section} aria-label="Video comments"><header><div><h2><MessageCircle size={19}/> Comments</h2><span className="meta">{page?.count||'Read the conversation'}</span></div><select aria-label="Sort comments" value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="top">Top comments</option><option value="newest">Newest first</option></select></header>
 {!active&&<p className="meta">Comments load here as you scroll.</p>}{busy&&!page&&<div className="comment-loading" role="status">Loading comments…</div>}
 {page?.unavailable?<p className="comments-empty" role="status">{page.message}</p>:page?.items.length?<div className="comment-list">{page.items.map(comment=><CommentRow key={comment.id} comment={comment} id={id} onChannel={onChannel}/>)}</div>:page&&!busy?<p className="comments-empty">No public comments were returned for this video.</p>:null}
 {!!page?.message&&!page.unavailable&&<p className="meta" role="status">{page.message}</p>}
 {(error||page&&!page.items.length)&&<div className="comments-empty"><p role="status">{error}</p><div className="row wrap"><button className="button" disabled={busy} onClick={()=>setRetry(n=>n+1)}>Retry comments</button><button className="button" onClick={onOriginal}>Open YouTube comments</button></div></div>}
 {page&&<AutoMore enabled={!!page.next} busy={busy} error={error} onReach={()=>void more()}/>}
 </section>
}
