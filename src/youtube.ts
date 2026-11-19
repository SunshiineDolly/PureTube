import {invoke} from '@tauri-apps/api/core'
import {isShorts, seconds, newest, type Video, type Channel} from './domain'

type Snippet = {title?:string;description?:string;channelId?:string;channelTitle?:string;publishedAt?:string;thumbnails?:Record<string,{url:string}>}
type Item = {id:string|{videoId?:string};snippet?:Snippet;contentDetails?:{duration?:string;videoId?:string;relatedPlaylists?:{uploads?:string}}; status?:{embeddable?:boolean};statistics?:{viewCount?:string;likeCount?:string;subscriberCount?:string};brandingSettings?:{image?:{bannerExternalUrl?:string}};paidProductPlacementDetails?:{hasPaidProductPlacement?:boolean}}
type Page = {items?:Item[];nextPageToken?:string}
const requests = new Map<string,Promise<Page>>()
function api(endpoint:string,query:Record<string,string>,refresh=false) {
 const key=JSON.stringify([endpoint,query,refresh])
 const cached=requests.get(key)
 if(cached) return cached
 const request=invoke<Page>('youtube',{endpoint,query,refresh}).finally(()=>requests.delete(key))
 requests.set(key,request)
 return request
}
const image = (s:Snippet) => s.thumbnails?.high?.url || s.thumbnails?.medium?.url || s.thumbnails?.default?.url || ''
function asVideo(item:Item):Video {
 const s=item.snippet??{}, title=s.title??'', description=s.description??'', duration=seconds(item.contentDetails?.duration??'')
 return {id:String(item.id), title,description,channelId:s.channelId??'',channel:s.channelTitle??'',date:s.publishedAt??'',image:image(s),duration,views:item.statistics?.viewCount,likes:item.statistics?.likeCount,shorts:isShorts(title,description,duration),embeddable:item.status?.embeddable===true,paid:item.paidProductPlacementDetails?.hasPaidProductPlacement===true}
}
function asChannel(item:Item):Channel {
 const s=item.snippet??{}
 return {id:String(item.id),title:s.title??'',description:s.description??'',image:image(s),banner:item.brandingSettings?.image?.bannerExternalUrl??'',uploads:item.contentDetails?.relatedPlaylists?.uploads??'',subscribers:item.statistics?.subscriberCount}
}
const chunks = (xs:string[]) => Array.from({length:Math.ceil(xs.length/50)},(_,i)=>xs.slice(i*50,i*50+50))
export async function videos(ids:string[],refresh=false) {
 const out=(await Promise.all(chunks([...new Set(ids)]).map(ids=>api('videos',{part:'snippet,contentDetails,status,statistics,paidProductPlacementDetails',id:ids.join(',')},refresh)))).flatMap(p=>(p.items??[]).map(asVideo))
 const by=new Map(out.map(v=>[v.id,v]))
 return ids.flatMap(id=>{const v=by.get(id);return v?[v]:[]})
}
export async function channels(ids:string[],refresh=false) {
 return (await Promise.all(chunks([...new Set(ids)]).map(ids=>api('channels',{part:'snippet,contentDetails,brandingSettings,statistics',id:ids.join(',')},refresh)))).flatMap(p=>(p.items??[]).map(asChannel))
}
export async function channelByHandle(handle:string) {
 return (await api('channels',{part:'snippet,contentDetails,brandingSettings,statistics',forHandle:handle})).items?.map(asChannel)[0]
}
export type Query = {text:string;type:'video'|'channel';order:'relevance'|'date';duration:string}
export async function search(q:Query, token?:string) {
 const params:Record<string,string>={part:'snippet',q:q.text,type:q.type,order:q.order,maxResults:'24'}
 if(token) params.pageToken=token
 if(q.type==='video') Object.assign(params,{videoEmbeddable:'true',videoDuration:q.duration})
 const page=await api('search',params)
 const ids=(page.items??[]).flatMap(i=>typeof i.id==='string'?[i.id]:i.id.videoId?[i.id.videoId]:[])
 // Channel search uses id.channelId, while videos use id.videoId.
 const channelIds=(page.items??[]).flatMap(i=>typeof i.id==='object' && 'channelId' in i.id && typeof i.id.channelId==='string'?[i.id.channelId]:[])
 return {videos:q.type==='video'?await videos(ids):[],channels:q.type==='channel'?await channels(channelIds):[],next:page.nextPageToken}
}
export async function uploads(playlistId:string,token?:string,refresh=false) {
 if(!playlistId) return {items:[] as Video[],next:undefined}
 const page=await api('playlistItems',{part:'contentDetails',playlistId,maxResults:'24',...(token?{pageToken:token}:{})},refresh)
 return {items:(await videos((page.items??[]).flatMap(i=>i.contentDetails?.videoId?[i.contentDetails.videoId]:[]),refresh)).sort(newest),next:page.nextPageToken}
}
export async function playlists(channelId:string,token?:string) {
 const p=await api('playlists',{part:'snippet',channelId,maxResults:'24',...(token?{pageToken:token}:{})})
 return {items:(p.items??[]).map(i=>({id:String(i.id),title:i.snippet?.title??'',image:image(i.snippet??{})})),next:p.nextPageToken}
}

