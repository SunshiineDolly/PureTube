import {useEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
const photos=new Map<string,{task:Promise<string|null>;expires:number}>()
let activeRequests=0
const waiting:(()=>void)[]=[]
function limitedPhoto(id:string){return new Promise<string|null>((resolve,reject)=>{const run=()=>{activeRequests++;void invoke<string|null>('creator_photo',{id}).then(resolve,reject).finally(()=>{activeRequests--;waiting.shift()?.()})};if(activeRequests<3)run();else waiting.push(run)})}
function requestPhoto(id:string){
 const cached=photos.get(id);if(cached&&cached.expires>Date.now())return cached.task
 const entry={task:Promise.resolve<string|null>(null),expires:Date.now()+20000}
 entry.task=limitedPhoto(id).catch(()=>null).then(photo=>{entry.expires=Date.now()+(photo?6*60*60_000:4000);return photo})
 photos.set(id,entry);if(photos.size>300)photos.delete(photos.keys().next().value!)
 return entry.task
}
export function CreatorAvatar({id,name,src}:{id:string;name:string;src?:string}){
 const host=useRef<HTMLSpanElement>(null),lastRetry=useRef(0)
 const [visible,setVisible]=useState(false),[photo,setPhoto]=useState<{id:string;src:string|null}>(),[failed,setFailed]=useState(''),[attempt,setAttempt]=useState(0)
 const provided=src&&src!==failed?src:undefined
 const image=provided||(photo?.id===id?photo.src:undefined)
 useEffect(()=>{setPhoto(undefined);setFailed('');setAttempt(0)},[id,src])
 useEffect(()=>{if(!host.current)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect()}} ,{rootMargin:'180px'});observer.observe(host.current);return()=>observer.disconnect()},[id])
 useEffect(()=>{
  if(!visible||!id||provided||attempt>=4)return
  let active=true,timer:ReturnType<typeof setTimeout>|undefined
  void requestPhoto(id).then(src=>{if(!active)return;if(src)setPhoto({id,src});else timer=setTimeout(()=>{photos.delete(id);setAttempt(n=>n+1)},1500*2**attempt)})
  return()=>{active=false;clearTimeout(timer)}
 },[id,provided,visible,attempt])
 useEffect(()=>{const retry=()=>{if(image||Date.now()-lastRetry.current<30000)return;lastRetry.current=Date.now();photos.delete(id);setAttempt(0)};window.addEventListener('online',retry);window.addEventListener('focus',retry);return()=>{window.removeEventListener('online',retry);window.removeEventListener('focus',retry)}},[id,image])
 return <span className="creator-dot" ref={host} aria-hidden="true">{image?<img key={id+attempt+image} alt="" src={image} loading="lazy" onError={()=>{setFailed(image);setPhoto(undefined);photos.delete(id);setAttempt(n=>n+1)}}/>:Array.from(name)[0]?.toUpperCase()}</span>
}
