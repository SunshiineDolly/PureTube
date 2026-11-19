import {unique,visible,type Video} from './domain.ts'
import {categoryFor} from './topics.ts'
import type {Library} from './library.ts'
export function nextVideos(current:Video,candidates:Video[],data:Library,played:string[]=[],related:string[]=[]){
 const topic=categoryFor(current),seen=new Set([current.id,...played])
 const words=(s:string)=>new Set(s.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)?.filter(w=>!['video','videos','with','this','that','from','have','your'].includes(w))??[])
 const currentWords=words(current.title)
 const score=(v:Video)=>(related.includes(v.id)?70-related.indexOf(v.id)/2:0)+Number(data.follows.includes(v.channelId))*40+Number(v.channelId===current.channelId)*35+Number(!!topic&&categoryFor(v)===topic)*45+Number(data.preferredTopics.includes(categoryFor(v)??''))*20+Math.min(4,[...words(v.title)].filter(w=>currentWords.has(w)).length)*12+(data.settings.history?Math.min(data.interests[categoryFor(v)??'']??0,20):0)

 const titles=new Set<string>(),buckets=new Map<string,Video[]>()
 for(const video of unique(candidates).filter(v=>!seen.has(v.id)&&!(data.settings.history&&data.history[v.id])&&!(data.settings.progress&&data.progress[v.id]?.at>0)&&!v.live&&!v.scheduledAt&&v.embeddable&&!data.dismissed.includes(v.id)&&visible(v,data.settings)).sort((a,b)=>score(b)-score(a))){
  const title=video.title.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()||video.id
  if(titles.has(title))continue;titles.add(title)
  const creator=video.channelId||video.channel;const group=buckets.get(creator)??[];if(group.length<4)group.push(video);buckets.set(creator,group)
 }
 const result:Video[]=[]
 for(let round=0;round<4;round++)for(const group of buckets.values())if(group[round]&&result.length<24)result.push(group[round])
 return result
}
