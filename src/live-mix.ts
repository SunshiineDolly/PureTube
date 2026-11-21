import {unique,type Video} from './domain.ts'
export function mixLive(items:Video[],mode:'live'|'scheduled',category:string){
 const genres=new Map<string,Map<string,Video[]>>()
 for(const v of unique(items)){
   if(mode==='live'?!v.live:(!v.scheduledAt&&!v.upcoming)||v.live)continue
   const genre=category||v.category||'Other',creators=genres.get(genre)??new Map<string,Video[]>(),creator=v.channelId||v.channel||v.id
   creators.set(creator,[...(creators.get(creator)??[]),v]);genres.set(genre,creators)
 }
 function roundRobin(buckets:Video[][]){const result:Video[]=[];for(let i=0;i<Math.max(0,...buckets.map(b=>b.length));i++)for(const bucket of buckets)if(bucket[i])result.push(bucket[i]);return result}
 const mixed=roundRobin([...genres.values()].map(creators=>roundRobin([...creators.values()])))
 return mode==='scheduled'?mixed.sort((a,b)=>(a.scheduledAt??Infinity)-(b.scheduledAt??Infinity)):mixed
}
