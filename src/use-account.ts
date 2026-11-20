import {useCallback, useEffect, useRef, useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {errorText} from './domain'
import {cloudLibrary, emptyCloudLibrary, mergeCloudLibrary, readCloudLibrary, sameCloudLibrary, sameVideo, type CloudLibrary} from './account-library'
import type {Library} from './library'

type Identity = {id: string; email: string}
type Snapshot = {revision: number; data: unknown}
type Binding = {id: string; base: CloudLibrary}
type SignIn = {identity: Identity; base: unknown}
type Change = (update: (previous: Library) => Library, cloud?: Binding) => Promise<void>

export function useAccount(ready: boolean, read: () => Library, change: Change) {
 const [configured, setConfigured] = useState<boolean>()
 const [user, setUser] = useState<Identity>()
 const [pendingEmail, setPendingEmail] = useState('')
 const [emailAttempt, setEmailAttempt] = useState(0)
 const [busy, setBusy] = useState(false)
 const [message, setMessage] = useState('')
 const [problem, setProblem] = useState('')
 const working = useRef(false)
 const binding = useRef<Binding | undefined>(undefined)
 const knownRevision = useRef<number | undefined>(undefined)

 useEffect(() => {
   void invoke<boolean>('account_configured').then(setConfigured, () => setConfigured(false))
 }, [])

 const run = useCallback(async (action: () => Promise<void>) => {
   if (working.current) return false
   working.current = true
   setBusy(true)
   setProblem('')
   try {
     await action()
     return true
   } catch (error) {
     setProblem(errorText(error))
     return false
   } finally {
     working.current = false
     setBusy(false)
   }
 }, [])

 const sync = useCallback(async () => {
   const active = binding.current
   if (!active) return
   const local = cloudLibrary(read())
   for (let attempt = 0; attempt < 4; attempt++) {
     const snapshot = await invoke<Snapshot | null>('account_read', {knownRevision: knownRevision.current})
     const revision = snapshot?.revision ?? knownRevision.current ?? 0
     const remote = snapshot ? readCloudLibrary(snapshot.data) : revision ? active.base : emptyCloudLibrary()
     const merged = mergeCloudLibrary(active.base, local, remote)
     const needsWrite = !revision || !sameCloudLibrary(merged, remote)
     if (needsWrite && !await invoke<boolean>('account_write', {revision, data: merged})) {
       knownRevision.current = undefined
       continue
     }
     if (sameCloudLibrary(active.base, merged) && sameCloudLibrary(local, merged)) {
       knownRevision.current = revision + Number(needsWrite)
       setMessage('Library is up to date.')
       return
     }
     const nextBinding = {id: active.id, base: merged}
     await change(current => {
       const latest = cloudLibrary(current)
       const next = mergeCloudLibrary(local, latest, merged)
       if (sameCloudLibrary(latest, next)) return current
       const savedVideos = Object.fromEntries(Object.entries(next.savedVideos).map(([id, saved]) =>
         [id, sameVideo(latest.savedVideos[id], saved) ? current.savedVideos[id] : saved]))
       return {...current, ...next, savedVideos}
     }, nextBinding)
     binding.current = nextBinding
     knownRevision.current = revision + Number(needsWrite)
     setMessage('Library synced at ' + new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}))
     return
   }
   throw new Error('The library changed on another device. Try syncing again.')
 }, [read, change])

 const syncNow = useCallback(() => run(sync), [run, sync])
 useEffect(() => {
   if (!user || !ready) return
   void syncNow()
   const refresh = () => { void syncNow() }
   const timer = window.setInterval(refresh, 30_000)
   window.addEventListener('focus', refresh)
   window.addEventListener('online', refresh)
   return () => {
     window.clearInterval(timer)
     window.removeEventListener('focus', refresh)
     window.removeEventListener('online', refresh)
   }
 }, [user, ready, syncNow])

 const acceptSignIn = useCallback(async ({identity, base}: SignIn) => {
   try {
     binding.current = {id: identity.id, base: base ? readCloudLibrary(base) : emptyCloudLibrary()}
     setUser(identity)
     setPendingEmail('')
     setMessage('')
     setProblem('')
   } catch (error) {
     await invoke('account_sign_out')
     throw error
   }
 }, [])

 useEffect(() => {
   if (!pendingEmail || user) return
   let stopped = false
   let timer: number
   async function poll() {
     try {
       const result = await invoke<SignIn | null>('account_poll')
       if (result) {
         await acceptSignIn(result)
         return
       }
       if (!stopped) timer = window.setTimeout(poll, 750)
     } catch (error) {
       if (!stopped) setProblem(errorText(error))
     }
   }
   timer = window.setTimeout(poll, 750)
   return () => { stopped = true; window.clearTimeout(timer) }
 }, [pendingEmail, emailAttempt, user, acceptSignIn])

 function sendEmail(email: string) {
   return run(async () => {
     await invoke<void>('account_send_code', {email})
     setPendingEmail(email)
     setEmailAttempt(attempt => attempt + 1)
   })
 }

 function cancelEmail() {
   return run(async () => {
     await invoke<void>('account_cancel')
     setPendingEmail('')
   })
 }

 function verify(email: string, code: string) {
   return run(async () => acceptSignIn(await invoke<SignIn>('account_verify', {email, code})))
 }

 function signOut() {
   return run(async () => {
     await invoke('account_sign_out')
     binding.current = undefined
     knownRevision.current = undefined
     setUser(undefined)
     setMessage('')
   })
 }

 return {configured, user, busy, message, problem, pendingEmail, sendEmail, cancelEmail, verify, signOut, syncNow}
}

export type ViddyAccount = ReturnType<typeof useAccount>
