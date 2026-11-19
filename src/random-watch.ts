import {unique,visible,type Video} from './domain.ts'
import type {Library} from './library.ts'

export type RandomSurface='home'|'discover'|'following'
// Select creators first so a prolific uploader cannot dominate the shuffle.
export function randomVideo(items:Video[],data:Library,surface:RandomSurface,recent:readonly string[]=[],random= Math.random):Video|undefined{
 const eligible=unique(items).filter(v=>visible(v,data.settings)&&v.embeddable&&!v.live&&!v.scheduledAt&&!data.dismissed.includes(v.id)&&(surface!=='following'||data.follows.includes(v.channelId)))
 const unseen=eligible.filter(v=>!recent.includes(v.id)&&!(data.settings.history&&data.history[v.id])&&!(data.settings.progress&&data.progress[v.id]?.at>0))
 const fresh=eligible.filter(v=>!recent.includes(v.id))
 const pool=unseen.length?unseen:fresh.length?fresh:eligible
 if(!pool.length)return
 const pick=<T,>(values:T[])=>values[Math.min(values.length-1,Math.floor(Math.max(0,random())*values.length))]
 let candidates=pool
 if(surface==='discover'){
   const topic=pick([...new Set(pool.map(v=>v.category??'Other'))])
   candidates=pool.filter(v=>(v.category??'Other')===topic)
 }else if(surface==='home'){
   // The incoming Home pool is already personalized; softly favor its strongest matches.
   const weights=pool.map((v,i)=>1+3*(1-i/pool.length)+(data.settings.history?Math.min(6,Math.max(0,data.interests[v.category??'']??0)):0)+(data.preferredTopics.includes(v.category??'')?3:0)+(data.follows.includes(v.channelId)?2:0))
   let ticket=random()*weights.reduce((a,b)=>a+b,0)
   for(let i=0;i<pool.length;i++){ticket-=weights[i];if(ticket<=0)return pool[i]}
   return pool.at(-1)
 }
 const creator=pick([...new Set(candidates.map(v=>v.channelId))])
 return pick(candidates.filter(v=>v.channelId===creator))
}
