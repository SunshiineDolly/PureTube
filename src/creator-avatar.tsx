import {useEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'

const photos=new Map<string,Promise<string|null>>()
let activeRequests=0
const waiting:(()=>void)[]=[]
function limitedPhoto(id:string){
 return new Promise<string|null>((resolve,reject)=>{
   const run=()=>{
     activeRequests++
     void invoke<string|null>('creator_photo',{id}).then(resolve,reject).finally(()=>{
       activeRequests--
       waiting.shift()?.()
     })
   }
   if(activeRequests<3)run();else waiting.push(run)
 })
}
function requestPhoto(id:string){
 let pending=photos.get(id)
 if(!pending){
   pending=limitedPhoto(id).catch(()=>{
     photos.delete(id)
     return null
   })
   photos.set(id,pending)
   if(photos.size>250){const oldest=photos.keys().next();if(!oldest.done)photos.delete(oldest.value)}
 }
 return pending
}
export function CreatorAvatar({id,name,src}:{id:string;name:string;src?:string}){
 const host=useRef<HTMLSpanElement>(null)
 const [photo,setPhoto]=useState<{id:string;src:string|null}>()
 const [failed,setFailed]=useState('')
 useEffect(()=>{
   if(src||!id||!host.current)return
   let active=true
   const observer=new IntersectionObserver(entries=>{
     if(!entries.some(e=>e.isIntersecting))return
     observer.disconnect()
     void requestPhoto(id).then(src=>{if(active)setPhoto({id,src})})
   },{rootMargin:'100px'})
   observer.observe(host.current)
   return ()=>{active=false;observer.disconnect()}
 },[id,src])
 const image=src||(photo?.id===id?photo.src:undefined)
 return <span className="creator-dot" ref={host} aria-hidden="true">{image&&image!==failed?<img alt="" src={image} loading="lazy" onError={()=>setFailed(image)}/>:Array.from(name)[0]?.toUpperCase()}</span>
}
