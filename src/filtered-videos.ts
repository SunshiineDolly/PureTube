import {useEffect,useState} from 'react'
import {verifyVideoMetadata} from './creator-links'
import {visible,type Filters,type Video} from './domain'
import {cachedUpload} from './public-feeds'

const checked=new Map<string,{creator:Awaited<ReturnType<typeof verifyVideoMetadata>>;expires:number}>()

export function useFilteredVideos(videos:Video[],filters:Filters){
 const fromFeed=(video:Video)=>{
   if(video.metadataComplete||!filters.keywords.length)return video
   const upload=cachedUpload(video.channelId,video.id)
   return upload?{...video,description:upload.description,metadataComplete:true}:video
 }
 const available=videos.map(fromFeed)
 const needsLookup=(video:Video)=>filters.keywords.length>0&&!video.metadataComplete||filters.blocked.length>0&&!video.channelId
 const ids=[...new Set(available.filter(v=>needsLookup(v)&&visible(v,filters)).map(v=>v.id))].join(',')
 const [,redraw]=useState(0)
 const [retry,setRetry]=useState(0)
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
   if(!creator)return []
   const full={...v,title:creator.title||v.title,description:creator.description??v.description,channelId:creator.id,metadataComplete:true}
   return visible(full,filters)?[full]:[]
 })
}
