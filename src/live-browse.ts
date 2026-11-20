import {useEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {requestCatalog,type CatalogPage} from './catalog'
import {type Video} from './domain'
import {mixLive} from './live-mix'
import {checkLive} from './live'

export const liveTopics=[['Gaming','gaming'],['Music','music concert'],['News','news'],['Travel & IRL','walking tour travel'],['Nature','wildlife nature'],['Sports','sports'],['Food','cooking'],['Chat & podcasts','podcast talk'],['Space','space telescope'],['Art & study','drawing study'],['Technology','technology coding'],['Animals','animals aquarium'],['Fitness','fitness workout'],['Events','events festival'],['Learning','education lecture'],['International','international world']] as const
type Mode='live'|'scheduled'
type Source={topic:string;query:string;channel?:string;next:CatalogPage['next'];loaded:boolean;head:Video[];tail:Video[];tailAt:number}

const eventChannels=[
 ['Sports','@NFL'],['Gaming','@capcomfighters'],['Space','@NASA'],['News','@CBCNews'],
 ['Sports','@FIDE_chess'],['Space','@NASASpaceflight'],['Music','@KEXP'],['Learning','@Harvard'],
 ['Gaming','@lolesports'],['News','@unitednations'],['Animals','@montereybayaquarium'],
 ['Sports','@NHL'],['Music','@WFMT'],['Space','@EuropeanSpaceAgency'],['News','@PBSNewsHour'],
 ['Events','@TheKennedyCenter'],['Art & study','@britishmuseum'],['Fitness','@YogaWithAdriene'],
] as const

function makeSources(mode:Mode,category:string,follows:string[]):Source[]{
 const topics=category?liveTopics.filter(([name])=>name===category):liveTopics
 const variants=mode==='scheduled'?['upcoming live','live event scheduled','livestream premiere']:['live stream','live now','livestream']
 const searches=variants.flatMap((suffix,index)=>topics.map(([topic,query])=>({
   topic,
   query:mode==='scheduled'&&topic==='Gaming'&&index===0?'vtuber upcoming live':query+' '+suffix,
   loaded:false,next:null,head:[],tail:[],tailAt:0,
 })))
 if(mode==='live')return searches
 const creator=(topic:string,channel:string):Source=>({topic,channel,query:'',loaded:false,next:null,head:[],tail:[],tailAt:0})
 const listings=eventChannels.filter(([topic])=>!category||category===topic).map(([topic,channel])=>creator(topic,channel))
 const followed=category?[]:follows.map(id=>creator('Following',id))
 return [...listings.slice(0,6),...followed.slice(0,2),...searches.slice(0,2),
   ...listings.slice(6),...searches.slice(2),...followed.slice(2)]
}

type View={key:string;items:Video[];busy:boolean;hasMore:boolean;error:string}
export function useLiveBrowse(mode:Mode,category:string,followIds:string[]){
 const key=mode+':'+category
 const followedKey=mode==='scheduled'?followIds.slice(0,30).join(','):''
 const [view,setView]=useState<View>({key,items:[],busy:true,hasMore:true,error:''})
 const actions=useRef({more:()=>{},refresh:()=>{}})
 useEffect(()=>{
   const sources=makeSources(mode,category,followedKey?followedKey.split(','):[])
   let active=true,working=false,checkingSchedule=false,refreshIndex=0,moreIndex=0
   const statuses=new Map<string,{checked:number;remove:boolean;start?:number}>()
   const items=()=>{
     const now=Date.now()
     const rows=sources.flatMap(s=>[...s.head,...(now-s.tailAt<180_000?s.tail:[])])
     if(mode==='live')return mixLive(rows,mode,category)
     const upcoming=rows.flatMap(video=>{
       const state=statuses.get(video.id)
       if(state?.remove)return []
       const start=state?.start??video.scheduledAt
       if(start&&start<now-7_200_000)return []
       return [{...video,scheduledAt:start}]
     }).sort((a,b)=>(a.scheduledAt??Infinity)-(b.scheduledAt??Infinity))
     return mixLive(upcoming,mode,category)
   }
   const available=()=>sources.some(s=>!s.loaded||s.next)
   const render=(busy:boolean,error='')=>{
     if(active)setView({key,items:items(),busy,hasMore:available(),error})
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
       source.tail.push(...rows)
       source.tailAt=Date.now()
       source.next=page.next?.token!==cursor.token?page.next:null
     }else{
       source.head=rows
       if(!source.loaded||!source.tailAt)source.next=page.next
     }
     source.loaded=true
   }
   async function updateSchedule(){
     if(mode!=='scheduled'||!active||checkingSchedule)return
     const now=Date.now()
     const due=items().filter(v=>!v.scheduledAt||v.scheduledAt<=now+60_000)
       .filter(v=>now-(statuses.get(v.id)?.checked??0)>=(v.scheduledAt?25_000:180_000)).slice(0,5)
     if(!due.length)return
     checkingSchedule=true
     try{
       await Promise.all(due.map(async video=>{
         const previous=statuses.get(video.id)
         const result=await checkLive(video.id)
         if(!active)return
         const start=Date.parse(result.start??'')
         statuses.set(video.id,{checked:now,remove:result.status==='live'||result.status==='ended',
           start:result.status==='waiting'&&Number.isFinite(start)?start:previous?.start})
       }))
     }finally{checkingSchedule=false}
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
       void updateSchedule().then(()=>{if(!working&&mode==='scheduled')render(false,error)},()=>{})
     }finally{working=false;render(false,error)}
   }
   actions.current={more:()=>void more(),refresh:()=>void refresh()}
   void refresh(true)
   const timer=setInterval(()=>{if(!document.hidden)void refresh()},30_000)
   const focus=()=>void refresh()
   window.addEventListener('focus',focus)
   return ()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focus)}
 },[key,mode,category,followedKey])
 const current=view.key===key?view:{items:[],busy:true,hasMore:true,error:''}
 return {...current,more:()=>actions.current.more(),refresh:()=>actions.current.refresh()}
}
