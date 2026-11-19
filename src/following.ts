import {useRef,useState} from 'react'
import {requestChannel,type CatalogPage} from './catalog'
import {errorText,type Video} from './domain'
const pages=new Map<string,CatalogPage>()
export function useFollowingPages(ids:string[]){
 const [revision,update]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const running=useRef(false),index=useRef(0)
 void revision
 async function more(){
  if(running.current||!ids.length)return
  const ordered=ids.map((_,i)=>ids[(index.current+i)%ids.length])
  const id=ordered.find(id=>!pages.has(id)||pages.get(id)?.next)
  if(!id)return
  index.current=(ids.indexOf(id)+1)%ids.length;running.current=true;setBusy(true);setError('')
  try{
   const old=pages.get(id)
   const page=await requestChannel(id,'videos',old?.next??null)
   pages.set(id,{items:[...(old?.items??[]),...page.items].filter(v=>v.channelId===id),next:page.next?.token===old?.next?.token?null:page.next})
   update(n=>n+1)
  }catch(e){setError(errorText(e))}finally{running.current=false;setBusy(false)}
 }
 return {items:ids.flatMap(id=>pages.get(id)?.items??[]) as Video[],busy,error,more,hasMore:ids.some(id=>!pages.has(id)||!!pages.get(id)?.next),reset:()=>{ids.forEach(id=>pages.delete(id));update(n=>n+1)}}
}
