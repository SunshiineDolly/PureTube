import {useCallback,useEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {errorText,unique,type Video} from './domain'

export type CatalogFilter='all'|'live'|'scheduled'|'latest'
type Cursor={token:string;version:string}
export type CatalogPage={items:Video[];next:Cursor|null}
type Page=CatalogPage
const requests=new Map<string,{task:Promise<Page>;at:number}>()
async function publicRequest<T>(request:()=>Promise<T>):Promise<T>{
 try{return await request()}
 catch(error){
  if(!/temporarily unavailable|Could not reach|Could not read|readable results|load the next page/.test(errorText(error)))throw error
  await new Promise(resolve=>setTimeout(resolve,1000))
  return request()
 }
}
export function requestChannel(id:string,tab:string,cursor:Cursor|null=null){return publicRequest(()=>invoke<Page>('channel_videos',{id,tab,cursor}))}
export function requestCatalog(query:string,filter:CatalogFilter,cursor:Cursor|null=null,force=false){
 const key=JSON.stringify([query,filter,cursor])
 const old=requests.get(key)
 if(!force&&old&&Date.now()-old.at<120_000)return old.task
 const task=publicRequest(()=>invoke<Page>('search_youtube',{query,filter,cursor})).catch(e=>{requests.delete(key);throw e})
 requests.set(key,{task,at:Date.now()})
 if(requests.size>60){const oldest=requests.keys().next();if(!oldest.done)requests.delete(oldest.value)}
 return task
}
type Load={key:string;page?:Page;error?:string;moreError?:string;loadingMore?:boolean}
const recent=new Map<string,Page>()
const checked=new Map<string,number>()
function remember(key:string,page:Page){
 recent.delete(key)
 recent.set(key,page)
 if(recent.size>25){const oldest=recent.keys().next();if(!oldest.done){recent.delete(oldest.value);checked.delete(oldest.value)}}
}

function usePages(command:'search_youtube'|'channel_videos',params:{query:string;filter:CatalogFilter}|{id:string;tab:string},enabled:boolean){
 const input=JSON.stringify(params)
 const [attempt,retry]=useState(0)
 const key=JSON.stringify([command,input,attempt])
 const [state,setState]=useState<Load>()
 const generation=useRef(0),inFlight=useRef(false)
 const tokens=useRef(new Set<string>())
 const load=useCallback((cursor:Cursor|null)=>{
   const params=JSON.parse(input)
   return command==='search_youtube'?requestCatalog(params.query,params.filter,cursor,attempt>0):requestChannel(params.id,params.tab,cursor)
 },[command,input,attempt])
 useEffect(()=>{
   const current=++generation.current
   tokens.current.clear()
   inFlight.current=false
   if(!enabled)return
   const cached=attempt===0?recent.get(key):undefined
   const request=cached?Promise.resolve(cached):load(null)
   request.then(page=>{
     if(generation.current!==current)return
     remember(key,page)
     if(!cached)checked.set(key,Date.now())
     setState({key,page})
   },error=>{if(generation.current===current)setState({key,error:errorText(error)})})
   return ()=>{generation.current++}
 },[key,load,enabled])
 useEffect(()=>{
   if(!enabled)return
   let active=true,working=false
   async function refresh(){
     const previous=recent.get(key)
     if(!previous||working)return
     working=true
     try{
       const page=await load(null)
       if(!active)return
       // Refresh metadata/new arrivals while keeping already-loaded results
       // and their continuation so Back and scrolling retain their place.
       const old=recent.get(key)??previous
       const freshIds=new Set(page.items.map(v=>v.id))
       const combined={items:[...page.items,...old.items.filter(v=>!freshIds.has(v.id))],next:old.next??page.next}
       remember(key,combined);checked.set(key,Date.now());setState({key,page:combined})
     }catch{/* Keep the last successful result set during a failed background refresh. */}
     finally{working=false}
   }
   void refresh()
   return ()=>{active=false}
 },[key,load,enabled])
 const active:Load|undefined=state?.key===key?state:recent.has(key)?{key,page:recent.get(key)}:undefined
 const next=enabled?active?.page?.next:undefined
 const more=useCallback(()=>{
   if(!next||inFlight.current)return
   inFlight.current=true
   const current=generation.current
   setState(s=>s?.key===key?{...s,loadingMore:true,moreError:undefined}:s)
   const request=async()=>{
     let page=await load(next)
     const visited=new Set([next.token])
     for(let skip=0;!page.items.length&&page.next&&!visited.has(page.next.token)&&skip<2;skip++){
       visited.add(page.next.token);page=await load(page.next)
     }
     return page
   }
   request().then(page=>{
     if(generation.current!==current)return
     tokens.current.add(next.token)
     const cursor=page.next&&!tokens.current.has(page.next.token)?page.next:null
     const previous=recent.get(key)
     const combined={items:unique([...(previous?.items??[]),...page.items]),next:cursor}
     remember(key,combined)
     setState({key,page:combined})
   },error=>{
     if(generation.current===current)setState(s=>s?.key===key?{...s,loadingMore:false,moreError:errorText(error)}:s)
   }).finally(()=>{if(generation.current===current)inFlight.current=false})
 },[next,key,load])
 return {items:active?.page?.items,error:active?.error,moreError:active?.moreError,hasMore:!!next,
   loadingMore:!!active?.loadingMore,more,reload:()=>retry(n=>n+1)}
}

export function useCatalog(query:string,filter:CatalogFilter,enabled=true){
 return usePages('search_youtube',{query,filter},enabled)
}
export function useChannelCatalog(id:string,tab:string,enabled=true){
 return usePages('channel_videos',{id,tab},enabled)
}
