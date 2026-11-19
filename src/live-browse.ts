import {useEffect,useRef,useState} from 'react'
import {requestCatalog,type CatalogPage} from './catalog'
import {type Video,errorText} from './domain'
import {mixLive} from './live-mix'
export const liveTopics=[['Gaming','gaming'],['Music','music concert'],['News','news'],['Chat & podcasts','podcast talk'],['Food','cooking'],['Nature','wildlife nature'],['Space','space telescope'],['Art & study','drawing study']] as const
const cache=new Map<string,{items:Video[];at:number}>()
type Source={topic:string;query:string;next:CatalogPage['next']}
export function useLiveBrowse(mode:'live'|'scheduled',category:string){
 const key=mode+category,[state,setState]=useState<{key:string;items:Video[];busy:boolean;error:string}>({key,items:cache.get(key)?.items??[],busy:true,error:''}),[revision,setRevision]=useState(0)
 const generation=useRef(0),sources=useRef<Source[]>([]),working=useRef(false),offset=useRef(0),empty=useRef(0)
 const mix=(items:Video[])=>mixLive(items,mode,category)
 useEffect(()=>{
  const run=++generation.current;working.current=false;offset.current=0;empty.current=0
  const picked=category?liveTopics.filter(t=>t[0]===category):liveTopics
  const upcoming:Record<string,string>={'Gaming':'vtuber upcoming live','Music':'music upcoming live','News':'upcoming press conference live','Chat & podcasts':'hololive upcoming live chat','Food':'cooking upcoming live','Nature':'wildlife upcoming live','Space':'NASA upcoming live launch','Art & study':'study upcoming live'}
  const list=picked.map(([label,query])=>({topic:label,query:mode==='scheduled'?upcoming[label]:query+' live stream',next:null as CatalogPage['next']}));sources.current=list
  const existing=cache.get(key);setState({key,items:existing?.items??[],busy:true,error:''})
  const pool:Video[]=[];let pending=list.length,success=0
  for(const source of list)void (async()=>{let page=await requestCatalog(source.query,mode,null,revision>0);for(let i=0;!page.items.length&&page.next&&i<2;i++)page=await requestCatalog(source.query,mode,page.next);return page})().then(page=>{if(run!==generation.current)return;success++;source.next=page.next;pool.push(...page.items.map(v=>({...v,category:source.topic})));const items=mix(pool);cache.set(key,{items,at:Date.now()});setState({key,items,busy:pending>1,error:''})},e=>{if(run===generation.current&&!success)setState(s=>({...s,error:errorText(e)}))}).finally(()=>{pending--;if(!pending&&run===generation.current)setState(s=>({...s,busy:false,error:success?'':s.error}))})
  return()=>{generation.current++}
 },[key,revision])
 useEffect(()=>{const t=setInterval(()=>{if(!document.hidden&&!working.current&&!state.busy)setRevision(n=>n+1)},60000);return()=>clearInterval(t)},[key,state.busy])
 async function more(){if(working.current||state.busy)return;const available=sources.current.filter(s=>s.next);if(!available.length){setRevision(n=>n+1);return}if(state.error)empty.current=0;working.current=true;const run=generation.current;const source=available[offset.current++%available.length];setState(s=>({...s,busy:true,error:''}));try{let page=await requestCatalog(source.query,mode,source.next);for(let i=0;!page.items.length&&page.next&&i<2;i++)page=await requestCatalog(source.query,mode,page.next);if(run!==generation.current)return;source.next=page.next;setState(s=>{const items=mix([...s.items,...page.items.map(v=>({...v,category:source.topic}))]);cache.set(key,{items,at:Date.now()});empty.current=items.length>s.items.length?0:empty.current+1;return {...s,items,busy:false,error:empty.current>=3?'No additional streams returned. Try another category or refresh.':''}})}catch(e){if(run===generation.current)setState(s=>({...s,busy:false,error:errorText(e)}))}finally{if(run===generation.current)working.current=false}}
 return {items:state.key===key?state.items:[],busy:state.key!==key||state.busy,error:state.key===key?state.error:'',more,hasMore:sources.current.some(s=>s.next),refresh:()=>setRevision(n=>n+1)}
}
