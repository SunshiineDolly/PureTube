import {useEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {decode,empty,type Library,type Settings} from './library'
import {errorText} from './domain'

export function useLibrary() {
 const [data,setData]=useState<Library>(empty),[ready,setReady]=useState(false),[failed,setFailed]=useState(false),[error,setError]=useState('')
 const current=useRef(data), queue=useRef(Promise.resolve())
 useEffect(()=>{invoke<unknown>('load').then(raw=>{
   const initial=raw?decode(raw):empty()
   current.current=initial;setData(initial);setReady(true)
 }).catch(e=>{setError(errorText(e));setFailed(true)})},[])
 function change(fn:(previous:Library)=>Library) {
   const next=fn(current.current);current.current=next;setData(next)
   queue.current=queue.current.then(()=>{
     // Multiple rapid updates share the latest snapshot rather than writing
     // every intermediate copy of the full library.
     if(current.current!==next)return
     return invoke<void>('save',{data:next})
   }).then(()=>setError('')).catch(e=>setError(errorText(e)))
 }
 const setting=<K extends keyof Settings>(key:K,value:Settings[K])=>change(d=>({...d,settings:{...d.settings,[key]:value}}))
 return {data,ready,failed,error,change,setting}
}
export function useResource<T>(load:()=>Promise<T>,key:string) {
 const [result,setResult]=useState<{key:string;value?:T;error?:string}>()
 useEffect(()=>{let active=true;load().then(value=>{if(active)setResult({key,value})}).catch(e=>{if(active)setResult({key,error:errorText(e)})});return()=>{active=false}},[key])
 return result?.key===key?result:{key}
}
