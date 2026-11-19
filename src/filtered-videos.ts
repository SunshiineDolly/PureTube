import {useEffect,useState} from 'react'
import {lookupCreator} from './creator-links'
import {visible,type Filters,type Video} from './domain'

const checked=new Map<string,{creator:Awaited<ReturnType<typeof lookupCreator>>;expires:number}>()

export function useFilteredVideos(videos:Video[],filters:Filters){
 const needsLookup=(video:Video)=>filters.keywords.length>0||filters.blocked.length>0&&!video.channelId
 const ids=[...new Set(videos.filter(v=>needsLookup(v)&&visible(v,filters)).map(v=>v.id))].join(',')
 const [,redraw]=useState(0)
 useEffect(()=>{
   if(!ids)return
   let mounted=true
   const pending=ids.split(',').filter(id=>(checked.get(id)?.expires??0)<Date.now())
   async function worker(){
     while(mounted&&pending.length){
       const id=pending.shift()!
       try{
         const creator=await lookupCreator(id)
         checked.set(id,{creator,expires:Date.now()+10*60_000})
         if(checked.size>500)checked.delete(checked.keys().next().value!)
       }catch{}
       if(mounted)redraw(value=>value+1)
     }
   }
   void Promise.all(Array.from({length:Math.min(4,pending.length)},worker))
   return ()=>{mounted=false}
 },[ids])
 return videos.flatMap(v=>{
   if(!visible(v,filters))return []
   if(!needsLookup(v))return [v]
   const creator=checked.get(v.id)?.creator
   if(!creator)return []
   const full={...v,title:creator.title||v.title,description:creator.description??v.description,channelId:creator.id}
   return visible(full,filters)?[full]:[]
 })
}
