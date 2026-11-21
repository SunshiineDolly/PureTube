import type {Video} from './domain.ts'
import type {CatalogPage} from './catalog.ts'
export const liveTopics=[['Gaming','gaming'],['Music','music concert'],['News','news'],['Travel & IRL','walking tour travel'],['Nature','wildlife nature'],['Sports','sports'],['Food','cooking'],['Chat & podcasts','podcast talk'],['Space','space telescope'],['Art & study','drawing study'],['Technology','technology coding'],['Animals','animals aquarium'],['Fitness','fitness workout'],['Events','events festival'],['Learning','education lecture'],['International','international world']] as const
export type Mode='live'|'scheduled'
export type Source={topic:string;query:string;channel?:string;next:CatalogPage['next'];loaded:boolean;head:Video[];tail:Video[];tailAt:number;visited?:Set<string>;failedAt?:number}
const eventChannels=[
 ['Sports','@NFL'],['Gaming','@capcomfighters'],['Space','@NASA'],['News','@CBCNews'],
 ['Sports','@FIDE_chess'],['Space','@NASASpaceflight'],['Music','@KEXP'],['Learning','@Harvard'],
 ['Gaming','@lolesports'],['News','@unitednations'],['Animals','@montereybayaquarium'],
 ['Sports','@NHL'],['Music','@WFMT'],['Space','@EuropeanSpaceAgency'],['News','@PBSNewsHour'],
 ['Events','@TheKennedyCenter'],['Art & study','@britishmuseum'],['Fitness','@YogaWithAdriene'],
] as const

export function makeSources(mode:Mode,category:string,follows:string[]):Source[]{
 const topics=category?liveTopics.filter(([name])=>name===category):liveTopics
 const variants=mode==='scheduled'?['upcoming live','live event scheduled','livestream premiere']:['live stream','live now','livestream']
 const searches=variants.flatMap((suffix,index)=>topics.map(([topic,query])=>({
   topic,
   query:mode==='scheduled'&&topic==='Gaming'&&index===0?'vtuber upcoming live':query+' '+suffix,
   loaded:false,next:null,head:[],tail:[],tailAt:0,
 })))
 if(mode==='live')return searches
 const creator=(topic:string,channel:string):Source=>({topic,channel,query:'',loaded:false,next:null,head:[],tail:[],tailAt:0})
 const listings=eventChannels.filter(([topic])=>!category||category===topic).map(([topic,channel])=>creator(topic,channel))
 const followed=category?[]:follows.map(id=>creator('Following',id))
 return [...listings.slice(0,6),...followed.slice(0,2),...searches.slice(0,2),
   ...listings.slice(6),...searches.slice(2),...followed.slice(2)]
}
