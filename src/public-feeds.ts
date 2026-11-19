import {useEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {channelId,errorText,isShorts,newest,unique,videoId,type Video} from './domain'

const atom='http://www.w3.org/2005/Atom'
const yt='http://www.youtube.com/xml/schemas/2015'
const media='http://search.yahoo.com/mrss/'
export const REFRESH_MINUTES=5
const refreshMs=REFRESH_MINUTES*60_000
export type PublicFeed={id:string;title:string;videos:Video[];checkedAt:number}
export type FeedState={feed?:PublicFeed;error?:string}
const webHosts=['youtube.com','www.youtube.com','m.youtube.com']

export function parseChannel(value:string) {
 const text=value.trim()
 if(channelId(text))return text
 try {
   const url=new URL(text)
   if(url.protocol!=='https:'||!webHosts.includes(url.hostname))return
   const id=url.pathname.startsWith('/channel/')?url.pathname.split('/')[2]:
     ['/feeds/videos.xml','/xml/feeds/videos.xml'].includes(url.pathname)?url.searchParams.get('channel_id'):null
   return id&&channelId(id)?id:undefined
 } catch {return undefined}
}
export function parseVideo(value:string):{id:string;shorts:boolean;live:boolean}|undefined {
 try {
   const url=new URL(value.trim())
   if(url.protocol!=='https:')return
   const [,kind,pathId]=url.pathname.split('/')
   const shorts=webHosts.includes(url.hostname)&&kind==='shorts'
   const id=url.hostname==='youtu.be'?kind:webHosts.includes(url.hostname)?kind==='watch'?url.searchParams.get('v'):['shorts','live','embed'].includes(kind)?pathId:null:null
   return id&&videoId(id)?{id,shorts,live:webHosts.includes(url.hostname)&&kind==='live'}:undefined
 } catch {return undefined}
}
export const linkVideo=(id:string):Video=>({id,title:'YouTube video',description:'',channelId:'',channel:'',date:'',image:'',duration:0,shorts:false,paid:false,embeddable:true})
const child=(parent:Element, ns:string, name:string)=>Array.from(parent.children).find(e=>e.namespaceURI===ns&&e.localName===name)
const field=(parent:Element,ns:string,name:string)=>child(parent,ns,name)?.textContent?.trim()??''
export function parseFeed(document:Document,id:string):PublicFeed {
 const root=document.documentElement
 if(root.namespaceURI!==atom||root.localName!=='feed')throw Error('YouTube returned an unreadable public feed.')
 const feedId=field(root,yt,'channelId')
 if(feedId!==id&&'UC'+feedId!==id)throw Error('YouTube returned a feed for a different channel.')
 const title=field(root,atom,'title')||id
 const items=Array.from(root.children).flatMap(entry=>{
   if(entry.namespaceURI!==atom||entry.localName!=='entry'||field(entry,yt,'channelId')!==id)return []
   const video=field(entry,yt,'videoId'),name=field(entry,atom,'title'),date=Date.parse(field(entry,atom,'published'))
   if(!videoId(video)||!name||!Number.isFinite(date))return []
   const link=Array.from(entry.children).find(e=>e.namespaceURI===atom&&e.localName==='link'&&e.getAttribute('rel')==='alternate')?.getAttribute('href')
   const group=child(entry,media,'group')
   const description=group?field(group,media,'description'):''
   const views=group?Array.from(group.getElementsByTagNameNS(media,'statistics'))[0]?.getAttribute('views'):null
   const shorts=!!(link&&parseVideo(link)?.shorts)||isShorts(name,description,0)||/(?:^|\s)#(?:youtubeshorts|shorts)\b/i.test(description)
   return [{...linkVideo(video),title:name,description,metadataComplete:!!(group&&child(group,media,'description'))&&!/…$/.test(description),views:views?Number(views).toLocaleString()+' views':undefined,channelId:id,channel:title,date:new Date(date).toISOString(),image:'https://i.ytimg.com/vi/'+video+'/hqdefault.jpg',shorts,live:!!link&&/youtube\.com\/live\//i.test(link)}]
 })
 return {id,title,videos:unique(items).sort(newest),checkedAt:Date.now()}
}
const recentlyFetched=new Map<string,PublicFeed>()
export const cachedUpload=(channel:string,id:string)=>recentlyFetched.get(channel)?.videos.find(v=>v.id===id&&v.metadataComplete)
const inflight=new Map<string,Promise<PublicFeed>>()
export function publicFeed(id:string,force=false) {
 const pending=inflight.get(id)
 if(pending)return pending
 const cached=recentlyFetched.get(id)
 if(!force&&cached&&Date.now()-cached.checkedAt<60_000)return Promise.resolve(cached)
 const request=invoke<string>('public_feed',{id}).then(xml=>{
   const feed=parseFeed(new DOMParser().parseFromString(xml,'application/xml'),id)
   if(recentlyFetched.size>=200&&!recentlyFetched.has(id))recentlyFetched.delete(recentlyFetched.keys().next().value!)
   recentlyFetched.set(id,feed)
   return feed
 }).finally(()=>inflight.delete(id))
 inflight.set(id,request)
 return request
}
export function usePublicFeeds(ids:string[]) {
 const [states,setStates]=useState<Record<string,FeedState>>({})
 const [busy,setBusy]=useState(false)
 const task=useRef<(force?:boolean)=>void>(()=>{})
 const key=JSON.stringify(ids)
 useEffect(()=>{
   let active=true, working=false, last=0
   setStates(previous=>Object.fromEntries(ids.filter(id=>previous[id]).map(id=>[id,previous[id]])))
   setBusy(false)
   async function update(force=false) {
     if(!active||working||!ids.length)return
     working=true;last=Date.now();setBusy(true)
     try {
       for(let offset=0;active&&offset<ids.length;offset+=5) {
         const batch=ids.slice(offset,offset+5)
         await Promise.all(batch.map(async id=>{
           try {const feed=await publicFeed(id,force);if(active)setStates(previous=>({...previous,[id]:{feed}}))}
           catch(e) {if(active)setStates(previous=>({...previous,[id]:{...previous[id],error:errorText(e)}}))}
         }))
       }
     } finally {working=false;if(active)setBusy(false)}
   }
   const check=()=>{if(Date.now()-last>=refreshMs)void update()}
   task.current=update
   void update()
   const timer=setInterval(check,refreshMs)
   window.addEventListener('focus',check)
   return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',check)}
 },[key])
 return {states,busy,refresh:()=>task.current(true)}
}
export type PublicFeeds=ReturnType<typeof usePublicFeeds>
