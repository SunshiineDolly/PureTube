import {useEffect,useRef,useState} from 'react'
import {requestCatalog,type CatalogPage} from './catalog'
import {errorText,type Video} from './domain'
import {appendRecommendations,recommendationPlan,rankRecommendations,type Surface} from './recommendations'
import type {Library} from './library'

type Source={topic:string;query:string;filter:'all'|'latest';next:CatalogPage['next']}
type Feed={items:Video[];sources:Source[];seed:number;at:number;error?:string;busy:boolean;moreError?:string}
const sessions=new Map<Surface,Feed>()
export const recommendationIds=(surface:Surface)=>new Set(sessions.get(surface)?.items.map(v=>v.id)??[])
const exposures:Record<string,number>={}
let loaded=false,saveTimer:ReturnType<typeof setTimeout>|undefined
export function resetRecommendationMemory(){
 sessions.clear()
 Object.keys(exposures).forEach(id=>delete exposures[id])
 clearTimeout(saveTimer)
 try{localStorage.removeItem('puretube-recommendation-exposure')}catch{}
}
function loadExposures(){
 if(loaded)return
 loaded=true
 try{
   const stored:unknown=JSON.parse(localStorage.getItem('puretube-recommendation-exposure')??'{}')
   if(stored&&typeof stored==='object')for(const [id,at]of Object.entries(stored)){
     if(/^[\w-]{11}$/.test(id)&&typeof at==='number'&&Date.now()-at<7*86_400_000)exposures[id]=at
   }
 }catch{}
}
function saveExposure(){
 clearTimeout(saveTimer)
 saveTimer=setTimeout(()=>{
   const entries=Object.entries(exposures).sort((a,b)=>b[1]-a[1]).slice(0,800)
   try{localStorage.setItem('puretube-recommendation-exposure',JSON.stringify(Object.fromEntries(entries)))}catch{}
 },500)
}

export function useRecommendations(surface:Surface,data:Library){
 const [feed,setFeed]=useState<Feed|undefined>(()=>sessions.get(surface))
 const [iteration,setIteration]=useState(0)
 const nextSource=useRef(0)
 const emptyBatches=useRef(0)
 const current=useRef(data),generation=useRef(0),working=useRef(false)
 current.current=data
 const sessionRef=useRef(feed);sessionRef.current=feed
 function store(next:Feed){sessions.set(surface,next);sessionRef.current=next;setFeed(next)}
 const other=()=>new Set(sessions.get(surface==='home'?'discover':'home')?.items.map(v=>v.id)??[])
 useEffect(()=>{
   loadExposures()
   const cached=sessions.get(surface)
   if(iteration===0&&cached&&!cached.busy&&cached.items.length&&Date.now()-cached.at<5*60_000){setFeed(cached);return}
   let active=true
   const run=++generation.current
   const seed=(cached?.seed??Math.floor(Date.now()/1000))+1
   const plan=recommendationPlan(current.current,surface,seed)
   emptyBatches.current=0
   const prior=new Set(cached?.items.map(v=>v.id)??[])
   const seen={...exposures}
   // A manual refresh should not immediately return the previous screen,
   // even if the pointer never intersected its cards.
   if(iteration>0)prior.forEach(id=>{seen[id]=Date.now()})
   const sources:Source[]=plan.map(p=>({...p,next:null}))
   store({items:cached?.items??[],sources,seed,at:Date.now(),busy:true})
   let pending=plan.length,successes=0
   const pool:Video[]=[]
   for(const [index,source] of plan.entries()){
     void requestCatalog(source.query,source.filter,null,iteration>0).then(page=>{
       if(!active||generation.current!==run)return
       successes++;sources[index]={...source,next:page.next}
       pool.push(...page.items.map(v=>({...v,category:source.topic})))
       const items=rankRecommendations(pool,current.current,seen,seed,other(),48,surface)
       // Keep already-visible cards in place while the other requests finish.
       const displayed=successes===1?[]:sessionRef.current?.items??[]
       store({items:appendRecommendations(displayed,items,60),sources:[...sources],seed,at:Date.now(),busy:pending>1})
     },error=>{
       if(active&&generation.current===run&&successes===0)store({...sessionRef.current!,error:errorText(error),busy:pending>1})
     }).finally(()=>{
       pending--
       if(active&&generation.current===run&&pending===0)store({...sessionRef.current!,items:successes?rankRecommendations(pool,current.current,seen,seed,other(),90,surface):sessionRef.current!.items,busy:false,error:successes?undefined:sessionRef.current?.error})
     })
   }
   return ()=>{active=false;generation.current++}
 },[surface,iteration])
 const activeFeed=feed
 async function more(){
   if(working.current||!activeFeed||activeFeed.busy)return
   const order=activeFeed.sources.map((_,i)=>(nextSource.current+i)%activeFeed.sources.length)
   let sourceIndex=order.find(i=>activeFeed.sources[i].next)??-1
   let base=activeFeed
   if(sourceIndex<0){
     const seed=activeFeed.seed+1
     const fresh=recommendationPlan(current.current,surface,seed).map(source=>({...source,next:null}))
     base={...activeFeed,seed,sources:fresh};sourceIndex=0
   }
   nextSource.current=(sourceIndex+1)%activeFeed.sources.length
   const source=base.sources[sourceIndex]
   working.current=true
   const run=generation.current
   store({...base,busy:true,moreError:undefined})
   try{
     let page=await requestCatalog(source.query,source.filter,source.next)
     const existing=new Set(sessionRef.current?.items.map(v=>v.id)??[])
     const exclusions=new Set([...other(),...existing])
     let candidates=rankRecommendations(page.items.map(v=>({...v,category:source.topic})),current.current,exposures,base.seed,exclusions,30,surface)
     for(let skip=0;!candidates.length&&page.next&&skip<2;skip++){
       const cursor=page.next
       page=await requestCatalog(source.query,source.filter,cursor)
       candidates=rankRecommendations(page.items.map(v=>({...v,category:source.topic})),current.current,exposures,base.seed,exclusions,30)
       if(page.next?.token===cursor.token){page={...page,next:null};break}
     }
     if(generation.current!==run)return
     const latest=sessionRef.current!
     const sources=[...latest.sources]
     sources[sourceIndex]={...source,next:page.next?.token===source.next?.token?null:page.next}
     const items=appendRecommendations(latest.items,candidates)
     emptyBatches.current=items.length===latest.items.length?emptyBatches.current+1:0
     store({...latest,items,sources,busy:false,moreError:emptyBatches.current>=4?'No new matches in this mix. Choose another category or try a new mix.':undefined})
   }catch(error){if(generation.current===run)store({...sessionRef.current!,busy:false,moreError:errorText(error)})}
   finally{working.current=false}
 }
 const target=useRef<HTMLDivElement>(null)
 useEffect(()=>{
   if(!target.current)return
   const observer=new IntersectionObserver(entries=>{
     for(const entry of entries){
       if(!entry.isIntersecting)continue
       const id=(entry.target as HTMLElement).dataset.videoId
       if(id){exposures[id]=Date.now();if(current.current.settings.history)saveExposure()}
       observer.unobserve(entry.target)
     }
   },{threshold:.6})
   target.current.querySelectorAll('[data-video-id]').forEach(node=>observer.observe(node))
   return ()=>observer.disconnect()
 },[feed?.items])
 useEffect(()=>{
   const timer=setInterval(()=>{
     const cached=sessions.get(surface)
     if(!document.hidden&&cached&&!cached.busy&&Date.now()-cached.at>5*60_000)setIteration(n=>n+1)
   },30_000)
   return ()=>clearInterval(timer)
 },[surface])
 return {feed,target,refresh:()=>setIteration(n=>n+1),more,hasMore:!!feed&&!feed.error}
}
