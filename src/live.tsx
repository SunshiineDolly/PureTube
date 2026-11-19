import {useEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {Bell} from 'lucide-react'
import type {Library} from './library'
import type {Video} from './domain'

type LiveStatus='live'|'waiting'|'ended'|'unknown'
const pending=new Map<string,Promise<LiveStatus>>()
function checkLive(id:string){
 let task=pending.get(id)
 if(!task){task=invoke<LiveStatus>('live_status',{id}).catch(()=> 'unknown' as const).finally(()=>pending.delete(id));pending.set(id,task)}
 return task
}

export function useScheduledStatus(id:string,at?:number|null){
 const [status,setStatus]=useState<LiveStatus>('waiting')
 useEffect(()=>{
   if(!at)return
   let active=true
   const poll=()=>{if(Date.now()>=at)void checkLive(id).then(s=>{if(active&&s!=='unknown')setStatus(s)})}
   poll()
   const timer=setInterval(poll,15_000)
   return ()=>{active=false;clearInterval(timer)}
 },[id,at])
 return status
}

export function useLiveReminders(data:Library,change:(fn:(d:Library)=>Library)=>void,ready:boolean){
 const [alerts,setAlerts]=useState<{id:string;title:string}[]>([])
 const current=useRef({data,change})
 current.current={data,change}
 useEffect(()=>{
   if(!ready)return
   let active=true,running=false,offset=0
   async function poll(){
     if(running)return
     const now=Date.now()
     const entries=Object.entries(current.current.data.liveReminders).filter(([,r])=>r.at<=now)
     if(!entries.length)return
     running=true
     try{
       const batch=entries.slice(offset%entries.length).concat(entries.slice(0,offset%entries.length)).slice(0,5)
       offset+=batch.length
       const results=await Promise.all(batch.map(async ([id,r])=>({id,title:r.title,status:now-r.at>86_400_000?'ended':await checkLive(id)})))
       if(!active)return
       const recent=results.filter(r=>(r.status==='live'||r.status==='ended')&&current.current.data.liveReminders[r.id])
       if(!recent.length)return
       setAlerts(list=>[...list,...recent.filter(r=>r.status==='live'&&!list.some(a=>a.id===r.id))].slice(-8))
       current.current.change(d=>{
         const liveReminders={...d.liveReminders}
         recent.forEach(r=>delete liveReminders[r.id])
         return {...d,liveReminders}
       })
     }finally{running=false}
   }
   void poll()
   const timer=setInterval(()=>void poll(),15_000)
   window.addEventListener('focus',poll)
   return ()=>{active=false;clearInterval(timer);window.removeEventListener('focus',poll)}
 },[ready])
 return {alerts,dismiss:(id:string)=>setAlerts(a=>a.filter(item=>item.id!==id))}
}

export function ScheduledDetails({video,data,change,status='waiting'}:{video:Video;data:Library;change:(fn:(d:Library)=>Library)=>void;status?:LiveStatus}){
 const [now,setNow]=useState(Date.now)
 const at=video.scheduledAt
 useEffect(()=>{if(!at||status!=='waiting')return;const timer=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(timer)},[at,status])
 if(!at||status!=='waiting')return null
 const seconds=Math.ceil(Math.max(0,at-now)/1000),d=Math.floor(seconds/86400),h=Math.floor(seconds/3600)%24,m=Math.floor(seconds/60)%60,s=seconds%60
 const count=d>0?`${d}d ${h}h ${m}m`:h>0?`${h}h ${m}m ${s}s`:`${m}m ${s}s`
 const saved=!!data.liveReminders[video.id]
 function toggle(){
   if(!at)return
   change(d=>{
     const liveReminders={...d.liveReminders}
     if(liveReminders[video.id])delete liveReminders[video.id]
     else liveReminders[video.id]={title:video.title.slice(0,400),at}
     return {...d,liveReminders}
   })
 }
 return <div className="schedule-details">
   <div><strong>{seconds>0?'Starts in '+count:'Waiting for the creator to go live'}</strong><time dateTime={new Date(at).toISOString()}>{new Date(at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}</time></div>
   <button className="button" aria-pressed={saved} onClick={toggle}><Bell size={15}/>{saved?'Reminder set':'Remind me'}</button>
 </div>
}
