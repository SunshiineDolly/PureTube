import {useCallback,useEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {decode,empty,type Library,type Settings} from './library'
import {errorText} from './domain'
import type {CloudLibrary} from './account-library'

export function useLibrary() {
 const [data,setData]=useState<Library>(empty),[ready,setReady]=useState(false),[failed,setFailed]=useState(false),[error,setError]=useState('')
 const current=useRef(data), queue=useRef(Promise.resolve())
 useEffect(()=>{invoke<unknown>('load').then(raw=>{
   const initial=raw?decode(raw):empty()
   current.current=initial;setData(initial);setReady(true)
 }).catch(e=>{setError(errorText(e));setFailed(true)})},[])
 const change=useCallback((fn:(previous:Library)=>Library, cloud?:{id:string;base:CloudLibrary})=>{
   const next=fn(current.current)
   if(current.current===next&&!cloud)return queue.current
   current.current=next;setData(next)
   const saved=queue.current.then(()=>{
     // Multiple rapid updates share the latest snapshot rather than writing
     // every intermediate copy of the full library.
     if(current.current!==next&&!cloud)return
     return invoke<void>('save',{data:next,cloud})
   }).then(()=>setError(''))
   queue.current=saved.catch(e=>setError(errorText(e)))
   return saved
 },[])
 const setting=<K extends keyof Settings>(key:K,value:Settings[K])=>change(d=>({...d,settings:{...d.settings,[key]:value}}))
 const read=useCallback(()=>current.current,[])
 return {data,ready,failed,error,change,setting,read}
}
export function useResource<T>(load:()=>Promise<T>,key:string) {
 const [result,setResult]=useState<{key:string;value?:T;error?:string}>()
 useEffect(()=>{let active=true;load().then(value=>{if(active)setResult({key,value})}).catch(e=>{if(active)setResult({key,error:errorText(e)})});return()=>{active=false}},[key])
 return result?.key===key?result:{key}
}
