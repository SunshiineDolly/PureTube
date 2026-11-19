import {useEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {errorText} from './domain'

type Update={version:string;notes?:string|null}
export function useUpdates(enabled:boolean) {
 const [configured,setConfigured]=useState<boolean>(),[release,setRelease]=useState<Update|null>(),[busy,setBusy]=useState<'checking'|'installing'|''>('')
 const [message,setMessage]=useState('')
 const active=useRef(false)
 async function perform(phase:'checking'|'installing',task:()=>Promise<void>,silent=false) {
   if(active.current)return
   active.current=true;setBusy(phase)
   if(!silent)setMessage('')
   try{await task()}
   catch(e){if(!silent)setMessage(errorText(e))}
   finally{active.current=false;setBusy('')}
 }
 async function check(silent=false) {
   await perform('checking',async()=>{setRelease(await invoke<Update|null>('update_check'));setMessage('')},silent)
 }
 useEffect(()=>{
   if(!enabled)return
   let mounted=true
   invoke<boolean>('update_configured').then(value=>{
     if(!mounted)return
     setConfigured(value)
     if(value)void check(true)
   }).catch(e=>{if(mounted){setConfigured(false);setMessage(errorText(e))}})
   return()=>{mounted=false}
 },[enabled])
 useEffect(()=>{
   if(!configured)return
   const timer=setInterval(()=>void check(true),6*60*60_000)
   return()=>clearInterval(timer)
 },[configured])
 return {configured,release,busy,message,check,
   install:()=>release?perform('installing',async()=>{await invoke('update_install',{version:release.version})}):Promise.resolve()
 }
}
export type AppUpdates=ReturnType<typeof useUpdates>
