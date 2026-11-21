import {useEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {requestCatalog} from './catalog'
import {type Video} from './domain'
import {mixLive} from './live-mix'
import {checkLive} from './live'

import {makeSources,type Mode,type Source} from './live-sources'
export {liveTopics} from './live-sources'
type Status={checked:number;remove:boolean;start?:number}
const sessions=new Map<string,{sources:Source[];statuses:Map<string,Status>}>()
const started=new Map<string,{video:Video;at:number}>()

type View={key:string;items:Video[];busy:boolean;hasMore:boolean;error:string;moreError:string;revision:number}
export function useLiveBrowse(mode:Mode,category:string,followIds:string[]){
 const followedKey=mode==='scheduled'?followIds.join(','):''
 const key=JSON.stringify([mode,category,followedKey])
 const [view,setView]=useState<View>({key,items:[],busy:true,hasMore:true,error:'',moreError:'',revision:0})
 const actions=useRef({more:()=>{},refresh:()=>{}})
 useEffect(()=>{
   const cached=sessions.get(key)
   const sources=cached?.sources.map(s=>({...s,head:[...s.head],tail:[...s.tail],visited:new Set(s.visited)}))??makeSources(mode,category,followedKey?followedKey.split(','):[])
   let active=true,working=false,checkingSchedule=false,refreshIndex=0,moreIndex=0,revision=0,moreError=''
   const statuses=new Map<string,Status>(cached?.statuses)
   const items=()=>{
     const now=Date.now()
     const rows=sources.flatMap(s=>[...s.head,...(now-s.tailAt<180_000?s.tail:[])])
     if(mode==='live'){
       for(const [id,item] of started){if(now-item.at>180_000)started.delete(id);else if(!category||item.video.category===category)rows.push(item.video)}
       return mixLive(rows.filter(v=>{const s=statuses.get(v.id);return !s?.remove||now-s.checked>90_000}),mode,category)
     }
     const upcoming=rows.flatMap(video=>{
       const state=statuses.get(video.id)
       if(state?.remove)return []
       const start=state&&now-state.checked<60_000?state.start??video.scheduledAt:video.scheduledAt
       if(start&&start<now-7_200_000)return []
       return [{...video,scheduledAt:start}]
     }).sort((a,b)=>(a.scheduledAt??Infinity)-(b.scheduledAt??Infinity))
     return mixLive(upcoming,mode,category)
   }
   const available=()=>sources.some(s=>!s.loaded||s.next)
   const render=(busy:boolean,error='')=>{
     if(active){
       sessions.delete(key);sessions.set(key,{sources,statuses})
       if(sessions.size>12)sessions.delete(sessions.keys().next().value!)
       setView({key,items:items(),busy,hasMore:available(),error,moreError,revision:++revision})
     }
   }
   async function load(source:Source,fresh:boolean){
     const cursor=fresh?null:source.next
     const page=source.channel
       ?{items:await invoke<Video[]>('scheduled_channel',{channel:source.channel}),next:null}
       :await requestCatalog(source.query,mode,cursor,fresh)
     if(!active)return
     const rows=page.items.map(v=>({...v,category:source.topic}))
     if(cursor){
       if(Date.now()-source.tailAt>=180_000)source.tail=[]
       const ids=new Set(source.tail.map(v=>v.id))
       source.tail.push(...rows.filter(v=>!ids.has(v.id)))
       source.tailAt=Date.now()
       source.visited??=new Set();source.visited.add(cursor.token)
       source.next=page.next&&!source.visited.has(page.next.token)?page.next:null
     }else{
       source.head=rows
       if(!source.loaded||!source.tailAt||Date.now()-source.tailAt>=180_000){
         source.tail=[];source.tailAt=0;source.visited=new Set();source.next=page.next
       }
     }
     source.loaded=true;source.failedAt=undefined
   }
   async function updateSchedule(){
     if(!active||checkingSchedule)return
     const now=Date.now()
     const due=items().filter(v=>mode==='live'||!v.scheduledAt||v.scheduledAt<=now+60_000)
       .filter(v=>now-(statuses.get(v.id)?.checked??0)>=(mode==='live'?60_000:v.scheduledAt?25_000:180_000)).slice(0,5)
     if(!due.length)return
     checkingSchedule=true
     try{
       await Promise.all(due.map(async video=>{
         const previous=statuses.get(video.id)
         const result=await checkLive(video.id)
         if(!active)return
         const start=Date.parse(result.start??'')
         if(mode==='scheduled'&&result.status==='live')started.set(video.id,{video:{...video,live:true,upcoming:false,scheduledAt:undefined},at:now})
         if(result.status==='ended')started.delete(video.id)
         statuses.set(video.id,{checked:now,remove:mode==='live'?result.status==='waiting'||result.status==='ended':result.status==='live'||result.status==='ended',
           start:result.status==='waiting'&&Number.isFinite(start)?start:previous?.start})
       }))
     }finally{checkingSchedule=false}
   }
   async function batch(list:Source[],fresh:boolean){
     const results=await Promise.allSettled(list.map(source=>load(source,fresh)))
     for(let i=0;i<list.length;i++){
       if(results[i].status==='rejected')list[i].failedAt=Date.now()
     }
     return results.some(r=>r.status==='fulfilled')
   }
   async function more(){
     if(!active||working||!available())return
     working=true;moreError='';render(true)
     try{
       const ready=sources.filter(s=>!s.failedAt||Date.now()-s.failedAt>=30_000)
       const eligible=ready.some(s=>!s.loaded||s.next)?ready:sources
       const untouched=eligible.filter(s=>!s.loaded)
       const continuations=eligible.filter(s=>s.next)
       const start=moreIndex++%Math.max(1,continuations.length)
       const next=[...untouched.slice(0,3),...continuations.slice(start).concat(continuations.slice(0,start)).slice(0,1)]
       if(!await batch(next,false))moreError='Could not load more streams. Your current results are saved. Try again.'
     }finally{working=false;render(false)}
   }
   async function refresh(initial=false){
     if(!active||working)return
     working=true
     if(initial)render(!cached)
     let error=''
     try{
       const loaded=sources.filter(s=>s.loaded)
       const candidates=loaded.length?loaded:sources
       if(!candidates.length){render(false);return}
       const start=refreshIndex%candidates.length,size=initial?(category?4:10):mode==='scheduled'?7:4
       const rolling=candidates.slice(start).concat(candidates.slice(0,start))
       const hot=mode==='scheduled'&&!initial?candidates.filter(source=>source.head.length&&source.channel).slice(0,3):[]
       const group=[...new Set([...hot,...rolling])].slice(0,size)
       refreshIndex+=group.length
       const worked=await batch(group,true)
       if(!worked&&!items().length)error='Could not refresh streams. Try again in a moment.'
       if(worked)moreError=''
       void updateSchedule().then(()=>{if(!working)render(false,error)},()=>{})
     }finally{working=false;render(false,error)}
   }
   actions.current={more:()=>void more(),refresh:()=>void refresh()}
   void refresh(true)
   const timer=setInterval(()=>{if(!document.hidden)void refresh()},30_000)
   const focus=()=>void refresh()
   window.addEventListener('focus',focus)
   return ()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focus)}
 },[key,mode,category,followedKey])
 const current=view.key===key?view:{items:[],busy:true,hasMore:true,error:'',moreError:'',revision:0}
 return {...current,more:()=>actions.current.more(),refresh:()=>actions.current.refresh()}
}
