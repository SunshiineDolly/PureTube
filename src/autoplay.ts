import {unique,visible,type Video} from './domain.ts'
import {categoryFor} from './topics.ts'
import type {Library} from './library.ts'
export function nextVideos(current:Video,candidates:Video[],data:Library,played:string[]=[]){
 const topic=categoryFor(current),seen=new Set([current.id,...played])
 const score=(v:Video)=>Number(data.follows.includes(v.channelId))*100+Number(v.channelId===current.channelId)*45+Number(!!topic&&categoryFor(v)===topic)*30+(data.settings.history?Math.min(data.interests[categoryFor(v)??'']??0,20)-Number(!!data.history[v.id])*80:0)
 return unique(candidates).filter(v=>!seen.has(v.id)&&!v.live&&!v.scheduledAt&&v.embeddable&&!data.dismissed.includes(v.id)&&visible(v,data.settings)).sort((a,b)=>score(b)-score(a)).slice(0,24)
}
