import {useEffect,useState} from 'react'
import {lookupCreator} from './creator-links'
import {rememberVideo,type Library} from './library'
import {linkVideo} from './public-feeds'
import type {Video} from './domain'
export function useSavedVideos(ids:string[],data:Library,change:(fn:(d:Library)=>Library)=>void,known:Map<string,Video>){
 const [busy,setBusy]=useState(false)
 const missing=ids.filter(id=>!data.savedVideos[id]&&!known.has(id)).slice(0,24).join(',')
 useEffect(()=>{
  if(!missing){setBusy(false);return}let active=true;const pending=missing.split(',');setBusy(true)
  async function worker(){while(active&&pending.length){const id=pending.shift()!;try{const creator=await lookupCreator(id);if(active)change(d=>rememberVideo(d,{...linkVideo(id),title:creator.title||'Video',channel:creator.name,channelId:creator.id,date:creator.date,live:creator.live,embeddable:creator.embeddable,duration:creator.duration??0,description:creator.description??'',views:creator.views,image:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg'}))}catch{}}}
  void Promise.all([worker(),worker(),worker()]).finally(()=>{if(active)setBusy(false)})
  return()=>{active=false}
 },[ids.join(',')])
 return busy
}
