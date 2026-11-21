import {useEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {Bell} from 'lucide-react'
import {rememberVideo,type Library} from './library'
import {linkVideo} from './public-feeds'
import type {Video} from './domain'
import {useCountdownClock} from './countdown-clock'

type LiveStatus='live'|'waiting'|'ended'|'unknown'
type StreamStatus={status:LiveStatus;start?:string}
const pending=new Map<string,Promise<StreamStatus>>()
export function checkLive(id:string){
 let task=pending.get(id)
 if(!task){task=invoke<StreamStatus>('live_status',{id,details:true}).catch(()=>({status:'unknown' as const})).finally(()=>pending.delete(id));pending.set(id,task)}
 return task
}

export function useScheduledStatus(id:string,at?:number|null,upcoming=false){
 const [checked,setChecked]=useState<{id:string;status:LiveStatus}>({id,status:'waiting'})
 useEffect(()=>{
   if(!at&&!upcoming)return
   let active=true
   const poll=()=>{if(!at||Date.now()>=at-60_000)void checkLive(id).then(({status})=>{if(active&&status!=='unknown')setChecked({id,status})})}
   poll()
   const timer=setInterval(poll,15_000)
   return ()=>{active=false;clearInterval(timer)}
 },[id,at,upcoming])
 return checked.id===id?checked.status:'waiting'
}

export function useLiveReminders(data:Library,change:(fn:(d:Library)=>Library)=>void,ready:boolean){
 const [alerts,setAlerts]=useState<{id:string;title:string}[]>([])
 const current=useRef({data,change})
 current.current={data,change}
 useEffect(()=>{
   if(!ready)return
   let active=true,running=false,offset=0
   const checked=new Map<string,number>()
   async function poll(){
     if(running)return
     const now=Date.now()
     const entries=Object.entries(current.current.data.liveReminders).filter(([id,r])=>
       now-(checked.get(id)??0)>=(r.at<=now+60_000&&r.at>=now-3600_000?14_000:120_000))
     if(!entries.length)return
     running=true
     try{
       const batch=entries.slice(offset%entries.length).concat(entries.slice(0,offset%entries.length)).slice(0,5)
       offset+=batch.length
       const results=await Promise.all(batch.map(async ([id,r])=>{
         checked.set(id,now)
         return {id,reminder:r,...await checkLive(id)}
       }))
       if(!active)return
       const recent=results.filter(r=>current.current.data.liveReminders[r.id]===r.reminder)
       const finished=recent.filter(r=>r.status==='live'||r.status==='ended')
       const moved=recent.flatMap(r=>{
         const at=Date.parse(r.start??'')
         return r.status==='waiting'&&Number.isFinite(at)&&at!==r.reminder.at?[{...r,at}]:[]
       })
       if(!finished.length&&!moved.length)return
       setAlerts(list=>[...list,...finished.filter(r=>r.status==='live'&&!list.some(a=>a.id===r.id)).map(r=>({id:r.id,title:r.reminder.title}))].slice(-8))
       current.current.change(d=>{
         const liveReminders={...d.liveReminders}
         finished.forEach(r=>{if(liveReminders[r.id]===r.reminder)delete liveReminders[r.id]})
         moved.forEach(r=>{if(liveReminders[r.id]===r.reminder)liveReminders[r.id]={...r.reminder,at:r.at}})
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

export function reminderVideos(data:Library):Video[]{
 return Object.entries(data.liveReminders).map(([id,reminder])=>({
   ...linkVideo(id),...data.savedVideos[id],title:reminder.title,scheduledAt:reminder.at,live:false,
   image:data.savedVideos[id]?.image||'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg',
 })).sort((a,b)=>a.scheduledAt-b.scheduledAt)
}

export function ScheduledDetails({video,data,change,status='waiting'}:{video:Video;data:Library;change:(fn:(d:Library)=>Library)=>void;status?:LiveStatus}){
 const at=data.liveReminders[video.id]?.at??video.scheduledAt
 const now=useCountdownClock(at)
 if(status!=='waiting')return null
 if(!at)return video.upcoming?<div className="schedule-details"><strong>Start time not posted yet</strong></div>:null
 const seconds=Math.ceil(Math.max(0,at-now)/1000),d=Math.floor(seconds/86400),h=Math.floor(seconds/3600)%24,m=Math.floor(seconds/60)%60,s=seconds%60
 const count=d>0?`${d}d ${h}h ${m}m`:h>0?`${h}h ${m}m ${s}s`:`${m}m ${s}s`
 const saved=!!data.liveReminders[video.id]
 function toggle(){
   if(!at)return
   change(d=>{
     const liveReminders={...d.liveReminders}
     if(liveReminders[video.id])delete liveReminders[video.id]
     else liveReminders[video.id]={title:video.title.slice(0,400),at}
     return {...(liveReminders[video.id]?rememberVideo(d,video):d),liveReminders}
   })
 }
 return <div className="schedule-details">
   <div><strong>{seconds>0?'Starts in '+count:'Waiting for the creator to go live'}</strong><time dateTime={new Date(at).toISOString()}>{new Date(at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}</time></div>
   <button className="button" aria-pressed={saved} onClick={toggle}><Bell size={15}/>{saved?'Reminder set':'Remind me'}</button>
 </div>
}
