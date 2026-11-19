import {newest,unique,visible,type Filters,type Video} from './domain.ts'
export function selectUploads(videos:Video[], filters:Filters, allowed:string[], days:number, oldest=false, now=Date.now()) {
 const channels=new Set(allowed)
 const after=days?new Date(now-days*86400000).toISOString():''
 const sorted=unique(videos.filter(v=>!v.live&&channels.has(v.channelId)&&v.date>=after&&visible(v,filters))).sort(newest)
 return oldest?sorted.reverse():sorted
}
