import {Shuffle} from 'lucide-react'
import type {Video} from './domain'
import type {Shared} from './screens'
import {randomVideo,type RandomSurface} from './random-watch'

const recent:Record<RandomSurface,string[]>={home:[],discover:[],following:[]}
export function RandomWatch({items,shared,surface}:{items:Video[];shared:Shared;surface:RandomSurface}){
 const available=randomVideo(items,shared.data,surface,recent[surface],()=>0)
 return <button className="button random-watch" disabled={!available} title={surface==='following'?'Play a random video from channels you follow':surface==='home'?'Play a surprise picked for your interests':'Explore a random video across topics'} onClick={()=>{
   const video=randomVideo(items,shared.data,surface,recent[surface])
   if(video){recent[surface]=[...recent[surface],video.id].slice(-100);shared.watch(video)}
 }}><Shuffle size={16}/> Random watch</button>
}
