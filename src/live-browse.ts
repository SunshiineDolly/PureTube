import {useEffect,useRef,useState} from 'react'
import {requestCatalog,type CatalogPage} from './catalog'
import {type Video} from './domain'
import {mixLive} from './live-mix'

export const liveTopics=[['Gaming','gaming'],['Music','music concert'],['News','news'],['Travel & IRL','walking tour travel'],['Nature','wildlife nature'],['Sports','sports'],['Food','cooking'],['Chat & podcasts','podcast talk'],['Space','space telescope'],['Art & study','drawing study'],['Technology','technology coding'],['Animals','animals aquarium'],['Fitness','fitness workout'],['Events','events festival'],['Learning','education lecture'],['International','international world']] as const
type Mode='live'|'scheduled'
type Source={topic:string;query:string;next:CatalogPage['next'];loaded:boolean;head:Video[];tail:Video[];tailAt:number}

function makeSources(mode:Mode,category:string):Source[]{
 const topics=category?liveTopics.filter(([name])=>name===category):liveTopics
 const variants=mode==='scheduled'?['upcoming live','live event scheduled','livestream premiere']:['live stream','live now','livestream']
 return variants.flatMap((suffix,index)=>topics.map(([topic,query])=>({
   topic,
   query:mode==='scheduled'&&topic==='Gaming'&&index===0?'vtuber upcoming live':query+' '+suffix,
   loaded:false,next:null,head:[],tail:[],tailAt:0,
 })))
}

type View={key:string;items:Video[];busy:boolean;hasMore:boolean;error:string}
export function useLiveBrowse(mode:Mode,category:string){
 const key=mode+':'+category
 const [view,setView]=useState<View>({key,items:[],busy:true,hasMore:true,error:''})
 const actions=useRef({more:()=>{},refresh:()=>{}})
 useEffect(()=>{
   const sources=makeSources(mode,category)
   let active=true,working=false,refreshIndex=0,moreIndex=0
   const items=()=>mixLive(sources.flatMap(s=>[...s.head,...(Date.now()-s.tailAt<180_000?s.tail:[])]),mode,category)
   const available=()=>sources.some(s=>!s.loaded||s.next)
   const render=(busy:boolean,error='')=>{
     if(active)setView({key,items:items(),busy,hasMore:available(),error})
   }
   async function load(source:Source,fresh:boolean){
     const cursor=fresh?null:source.next
     const page=await requestCatalog(source.query,mode,cursor,fresh)
     if(!active)return
     const rows=page.items.map(v=>({...v,category:source.topic}))
     if(cursor){
       if(Date.now()-source.tailAt>=180_000)source.tail=[]
       source.tail.push(...rows)
       source.tailAt=Date.now()
       source.next=page.next?.token!==cursor.token?page.next:null
     }else{
       source.head=rows
       if(!source.loaded)source.next=page.next
     }
     source.loaded=true
   }
   async function batch(list:Source[],fresh:boolean){
     const results=await Promise.allSettled(list.map(source=>load(source,fresh)))
     for(let i=0;i<list.length;i++){
       if(results[i].status==='rejected'&&!fresh)list[i].loaded=true
       if(results[i].status==='rejected'&&!fresh)list[i].next=null
     }
     return results.some(r=>r.status==='fulfilled')
   }
   async function more(){
     if(!active||working||!available())return
     working=true;render(true)
     try{
       const untouched=sources.filter(s=>!s.loaded)
       const continuations=sources.filter(s=>s.next)
       const start=moreIndex++%Math.max(1,continuations.length)
       const next=[...untouched.slice(0,3),...continuations.slice(start).concat(continuations.slice(0,start)).slice(0,1)]
       await batch(next,false)
     }finally{working=false;render(false)}
   }
   async function refresh(initial=false){
     if(!active||working)return
     working=true
     if(initial)render(true)
     try{
       const loaded=sources.filter(s=>s.loaded)
       const candidates=loaded.length?loaded:sources
       const start=refreshIndex%candidates.length,size=initial?(category?3:8):4
       const group=candidates.slice(start).concat(candidates.slice(0,start)).slice(0,size)
       refreshIndex+=group.length
       const worked=await batch(group,true)
       render(false,!worked&&!items().length?'Could not refresh streams. Try again in a moment.':'')
     }finally{working=false}
   }
   actions.current={more:()=>void more(),refresh:()=>void refresh()}
   void refresh(true)
   const timer=setInterval(()=>{if(!document.hidden)void refresh()},30_000)
   const focus=()=>void refresh()
   window.addEventListener('focus',focus)
   return ()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focus)}
 },[key,mode,category])
 const current=view.key===key?view:{items:[],busy:true,hasMore:true,error:''}
 return {...current,more:()=>actions.current.more(),refresh:()=>actions.current.refresh()}
}
