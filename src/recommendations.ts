import {unique,visible,type Video} from './domain.ts'
import {rankedTopics,topicQuery,topics} from './topics.ts'
import type {Library} from './library.ts'

export type Surface='home'|'discover'
export function hash(value:string){
 let h=2166136261
 for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619)
 return h>>>0
}
const alternatives:Record<string,string[]>={
 'Style & beauty':['personal style outfit ideas','japanese street fashion','skincare routine makeup tutorial'],
 'Gaming':['new games gameplay review','cozy games lets play','gaming challenge funny moments'],
 'Music':['live studio music performance','new music acoustic session','music production behind the scenes'],
 'Food':['cooking recipes from around the world','food travel street food','home cooking baking recipes'],
 'Travel':['travel diary hidden places','walking tour travel documentary','a weekend in japan vlog'],
 'Learning':['how things work explained','history science educational documentary','interesting ideas explained'],
 'Home & lifestyle':['apartment tour interior design','a peaceful day at home','home organization makeover'],
 'Art & design':['artist studio creative process','sketchbook art tutorial','graphic design process'],
 'Vlogs':['weekend in my life vlog','daily life japan vlog','a day in my life'],
}
export function recommendationPlan(data:Library,surface:Surface,seed:number){
 const ranked=rankedTopics(data.settings.history?data.interests:{})
 const preferred=ranked.filter(t=>(data.interests[t.name]??0)>0).slice(0,5)
 const shuffled=[...topics].sort((a,b)=>hash(surface+seed+a.name)-hash(surface+seed+b.name))
 const chosen=unique([
   ...(preferred.length?[{...preferred[seed%preferred.length],id:preferred[seed%preferred.length].name}]:[]),
   ...shuffled.map(t=>({...t,id:t.name})),
 ]).slice(0,4)
 return chosen.map((t,index)=>{
   const options=alternatives[t.name]??[topicQuery(t.name),topicQuery(t.name)+' documentary',topicQuery(t.name)+' ideas']
   return {topic:t.name,query:options[(seed+index)%options.length],filter:(index%2===0?'all':'latest') as 'all'|'latest'}
 })
}

export function rankRecommendations(items:Video[],data:Library,seen:Record<string,number>,seed:number,excluded:Set<string>,limit=48){
 const now=Date.now(),watched=data.settings.history?data.history:{}
 const candidates=unique(items).filter(v=>!v.live&&!v.scheduledAt&&!excluded.has(v.id)&&!data.dismissed.includes(v.id)&&!watched[v.id]&&visible(v,data.settings))
 const score=(v:Video)=>{
   const exposure=seen[v.id]??0
   const penalty=exposure?Math.max(0,1-(now-exposure)/86_400_000)*1000:0
   const affinity=v.category?Math.min(data.interests[v.category]??0,15):0
   const label=v.publishedLabel?.toLowerCase()??''
   const fresh=/\b(?:\d+\s*(?:h|hr|hour|d|day|w|wk|week)s?)\s+ago\b/.test(label)?18:0
   return hash(seed+v.id)%100+affinity+fresh-penalty
 }
 candidates.sort((a,b)=>score(b)-score(a))
 const counts=new Map<string,number>(),titles=new Set<string>(),result:Video[]=[]
 for(const video of candidates){
   const creator=video.channelId||video.channel
   const title=video.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()
   if((counts.get(creator)??0)>=2||titles.has(title))continue
   counts.set(creator,(counts.get(creator)??0)+1);titles.add(title);result.push(video)
   if(result.length>=limit)break
 }
 // Interleave topics so the first row doesn't consist of one genre.
 const output:Video[]=[]
 while(result.length){
   const index=result.findIndex(v=>!output.length||v.category!==output.at(-1)?.category)
   output.push(...result.splice(index<0?0:index,1))
 }
 return output
}

export function appendRecommendations(existing:Video[],incoming:Video[],limit=150){
 const counts=new Map<string,number>(),ids=new Set<string>(),titles=new Set<string>()
 const result:Video[]=[]
 for(const v of [...existing,...incoming]){
   const creator=v.channelId||v.channel
   const title=v.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()
   if(ids.has(v.id)||titles.has(title)||(counts.get(creator)??0)>=2)continue
   ids.add(v.id);titles.add(title);counts.set(creator,(counts.get(creator)??0)+1);result.push(v)
   if(result.length>=limit)break
 }
 return result
}
