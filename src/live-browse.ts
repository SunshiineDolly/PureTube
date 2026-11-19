import {useEffect,useRef,useState} from 'react'
import {requestCatalog,type CatalogPage} from './catalog'
import {type Video,errorText} from './domain'
import {mixLive} from './live-mix'
export const liveTopics=[['Gaming','gaming'],['Music','music concert'],['News','news'],['Travel & IRL','walking tour travel'],['Nature','wildlife nature'],['Sports','sports'],['Food','cooking'],['Chat & podcasts','podcast talk'],['Space','space telescope'],['Art & study','drawing study'],['Technology','technology coding'],['Animals','animals aquarium'],['Fitness','fitness workout'],['Events','events festival'],['Learning','education lecture'],['International','international world']] as const
const cache=new Map<string,{items:Video[];at:number}>()
type Source={topic:string;query:string;next:CatalogPage['next'];loaded:boolean}
export function useLiveBrowse(mode:'live'|'scheduled',category:string){
 const key=mode+':'+category,[state,setState]=useState<{key:string;items:Video[];busy:boolean;error:string}>({key,items:cache.get(key)?.items??[],busy:true,error:''}),[revision,setRevision]=useState(0)
 const generation=useRef(0),sources=useRef<Source[]>([]),working=useRef(false),offset=useRef(0),empty=useRef(0),round=useRef(0)
 const mix=(items:Video[])=>mixLive(items,mode,category)
 async function load(source:Source,force=false){let page=await requestCatalog(source.query,mode,source.next,force);for(let i=0;!page.items.length&&page.next&&i<2;i++)page=await requestCatalog(source.query,mode,page.next);return page}
 useEffect(()=>{
  const run=++generation.current;working.current=false;offset.current=0;empty.current=0;round.current=0
  const picked=category?liveTopics.filter(t=>t[0]===category):liveTopics
  const upcoming:Record<string,string>={'Gaming':'vtuber upcoming live','Music':'music upcoming live','News':'upcoming press conference live','Chat & podcasts':'hololive upcoming live chat','Space':'NASA upcoming live launch','Art & study':'study upcoming live'}
  const list:Source[]=picked.map(([topic,query])=>({topic,query:mode==='scheduled'?(upcoming[topic]??query+' upcoming live'):query+' live stream',next:null,loaded:false}));sources.current=list
  setState({key,items:cache.get(key)?.items??[],busy:true,error:''})
  const pool:Video[]=[],initial=list.slice(0,category?1:8);let pending=initial.length,success=0
  for(const source of initial){source.loaded=true;void load(source,revision>0).then(page=>{if(run!==generation.current)return;success++;source.next=page.next;pool.push(...page.items.map(v=>({...v,category:source.topic})));const items=mix(pool);cache.set(key,{items,at:Date.now()});setState({key,items,busy:pending>1,error:''})},e=>{if(run===generation.current&&!success)setState(s=>({...s,error:errorText(e)}))}).finally(()=>{pending--;if(!pending&&run===generation.current)setState(s=>({...s,busy:false,error:success?'':s.error}))})}
  return()=>{generation.current++}
 },[key,revision])
 useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden&&!working.current&&!state.busy)setRevision(n=>n+1)},60000);return()=>clearInterval(timer)},[key,state.busy])
 async function more(){
  if(working.current||state.busy)return
  if(state.error)empty.current=0
  working.current=true;const run=generation.current
  let source=sources.current.find(s=>!s.loaded)
  if(!source){const available=sources.current.filter(s=>s.next);source=available[offset.current++%Math.max(1,available.length)]}
  if(!source){const picked=category?liveTopics.filter(t=>t[0]===category):liveTopics,index=round.current++,[topic,query]=picked[index%picked.length];source={topic,query:query+(mode==='scheduled'?' upcoming live':[' live now',' livestream',' streaming now'][Math.floor(index/picked.length)%3]),next:null,loaded:false};sources.current.push(source)}
  source.loaded=true;setState(s=>({...s,busy:true,error:''}))
  try{const page=await load(source);if(run!==generation.current)return;source.next=page.next;setState(s=>{const items=mix([...s.items,...page.items.map(v=>({...v,category:source!.topic}))]);cache.set(key,{items,at:Date.now()});empty.current=items.length>s.items.length?0:empty.current+1;return {...s,items,busy:false,error:empty.current>=3?'No more results from these sources yet. Try another category or search.':''}})}catch(e){if(run===generation.current)setState(s=>({...s,busy:false,error:errorText(e)}))}finally{if(run===generation.current)working.current=false}
 }
 return {items:state.key===key?state.items:[],busy:state.key!==key||state.busy,error:state.key===key?state.error:'',more,hasMore:state.key===key&&state.items.length>0&&(sources.current.some(s=>!s.loaded||s.next)||empty.current<3),refresh:()=>setRevision(n=>n+1)}
}
