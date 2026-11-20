import {useEffect,useState,type RefObject} from 'react'
import {verifyVideoMetadata} from './creator-links'
import {visible,type Filters,type Video} from './domain'
import {cachedUpload} from './public-feeds'

const checked=new Map<string,{creator:Awaited<ReturnType<typeof verifyVideoMetadata>>;expires:number}>()

export function useFilteredVideos(videos:Video[],filters:Filters,viewport?:RefObject<HTMLElement|null>|false,renderLimit?:number){
 const fromFeed=(video:Video)=>{
   if(video.metadataComplete||!filters.keywords.length)return video
   const upload=cachedUpload(video.channelId,video.id)
   return upload?{...video,description:upload.description,metadataComplete:true}:video
 }
 const available=videos.map(fromFeed)
 const needsLookup=(video:Video)=>filters.keywords.length>0&&!video.metadataComplete||filters.blocked.length>0&&!video.channelId
 const needing=available.filter(v=>needsLookup(v)&&visible(v,filters))
 const knownIds=needing.filter(v=>v.channelId||!filters.blocked.length).map(v=>v.id)
 const unknownIds=needing.filter(v=>!v.channelId&&filters.blocked.length).map(v=>v.id)
 const key=viewport?knownIds.join(','):''
 const [near,setNear]=useState('')
 const [,redraw]=useState(0)
 const [retry,setRetry]=useState(0)
 useEffect(()=>{
   if(!viewport||!viewport.current||!key){setNear('');return}
   const eligible=new Set(key.split(',')),nearby=new Set<string>()
   const observer=new IntersectionObserver(entries=>{
     for(const entry of entries){
       const id=(entry.target as HTMLElement).dataset.videoId!
       if(entry.isIntersecting)nearby.add(id)
       else nearby.delete(id)
     }
     setNear([...nearby].join(','))
   },{rootMargin:'220px'})
   for(const node of viewport.current.querySelectorAll<HTMLElement>('[data-video-id]')){
     if(eligible.has(node.dataset.videoId!))observer.observe(node)
   }
   return ()=>observer.disconnect()
 },[viewport,key,renderLimit])
 const ids=viewport===false?'':[...new Set([
   ...(viewport?near.split(',').filter(id=>knownIds.includes(id)):knownIds.slice(0,8)),
   ...unknownIds.slice(0,8),
 ])].join(',')
 useEffect(()=>{
   if(!ids)return
   let mounted=true,timer:ReturnType<typeof setTimeout>|undefined
   const pending=ids.split(',').filter(id=>(checked.get(id)?.expires??0)<Date.now())
   async function worker(){
     while(mounted&&pending.length){
       const id=pending.shift()!
       try{
         const creator=await verifyVideoMetadata(id)
         checked.set(id,{creator,expires:Date.now()+10*60_000})
         if(checked.size>500)checked.delete(checked.keys().next().value!)
       }catch(error){
         if(/limiting|temporarily unavailable|could not reach/i.test(String(error))){
           if(mounted&&!timer)timer=setTimeout(()=>setRetry(value=>value+1),65_000)
           break
         }
       }
       if(mounted)redraw(value=>value+1)
     }
   }
   void Promise.all(Array.from({length:Math.min(2,pending.length)},worker))
   return ()=>{mounted=false;clearTimeout(timer)}
 },[ids,retry])
 return available.flatMap(v=>{
   if(!visible(v,filters))return []
   if(!needsLookup(v))return [v]
   const creator=checked.get(v.id)?.creator
   // Search often includes a title and channel but only a description snippet.
   // Keep clear candidates visible while the full description is checked.
   if(!creator)return filters.blocked.length&&!v.channelId?[]:[v]
   const full={...v,title:creator.title||v.title,description:creator.description??v.description,channelId:creator.id,metadataComplete:true}
   return visible(full,filters)?[full]:[]
 })
}
