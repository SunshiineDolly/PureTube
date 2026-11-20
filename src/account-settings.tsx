import {useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {UserRound} from 'lucide-react'
import {errorText} from './domain'
import type {ViddyAccount} from './use-account'

type Mode = 'create' | 'login' | 'key'

export function AccountSettings({account}: {account: ViddyAccount}) {
 const [mode, setMode] = useState<Mode>()
 const [email, setEmail] = useState('')
 const [key, setKey] = useState('')
 const [migrationKey, setMigrationKey] = useState('')
 const [saved, setSaved] = useState(false)
 const [keyError, setKeyError] = useState('')
 const sent = account.pendingEmail
 const create = sent ? account.creatingAccount : mode === 'create'

 async function addKey() {
   setKeyError('')
   try {
     setMigrationKey(await invoke<string>('account_generate_key'))
     setSaved(false)
   } catch (error) {
     setKeyError(errorText(error))
   }
 }

 return <section>
   <h2><UserRound/> Viddy account</h2>
   <p>Sync your profile, watch history, and saved videos across devices.</p>
   {account.configured === false && <p>Account sync is unavailable in this build.</p>}
   {keyError && <p className="notice" role="alert">{keyError}</p>}
   {account.problem && <p className="notice" role="alert">{account.problem}</p>}
   {account.user ? <>
     <p>{account.user.private_key ? 'Signed in with your account key' : 'Signed in as ' + account.user.email}</p>
     <p role="status">{account.busy ? 'Working…' : account.message}</p>
     <div className="row wrap">
       <button className="button" disabled={account.busy} onClick={() => void account.syncNow()}>Sync now</button>
       <button className="button" disabled={account.busy} onClick={() => {
         setMode(undefined)
         setMigrationKey('')
         void account.signOut()
       }}>Log out</button>
     </div>
     {!account.user.private_key && <details>
       <summary>Account key options</summary>
       {migrationKey ? <form onSubmit={async event => {
         event.preventDefault()
         if (await account.useKey(migrationKey, 'attach')) setMigrationKey('')
       }}>
         <label>Your account key <input value={migrationKey} readOnly onFocus={event => event.currentTarget.select()}/></label>
         <p>Save this key privately. It gives access to your synced library.</p>
         <label><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)}/> I saved my key</label>
         <button className="button" disabled={!saved || account.busy}>Link key to this account</button>
       </form> : <button className="button" disabled={account.busy} onClick={() => void addKey()}>Add an account key</button>}
     </details>}
   </> : account.configured && (sent ? <>
     <p role="status">Check your inbox at <strong>{sent}</strong>. Open the email link on this device while Viddy is running.</p>
     <div className="row wrap">
       <button className="button" disabled={account.busy} onClick={() => void account.sendEmail(sent, create)}>Resend email</button>
       <button className="button" disabled={account.busy} onClick={() => void account.cancelEmail()}>Change email</button>
     </div>
   </> : mode === 'key' ? <form onSubmit={async event => {
     event.preventDefault()
     if (await account.useKey(key, 'identify')) setKey('')
   }}>
     <label>Account key <input type="password" autoComplete="off" maxLength={80} required value={key} onChange={event => setKey(event.target.value)}/></label>
     <div className="row wrap">
       <button className="button accent" disabled={account.busy}>Log in with key</button>
       <button type="button" className="button" disabled={account.busy} onClick={() => {setKey(''); setMode(undefined)}}>Back</button>
     </div>
   </form> : mode ? <form onSubmit={event => {
     event.preventDefault()
     void account.sendEmail(email.trim(), create)
   }}>
     <h3>{create ? 'Create account' : 'Log in'}</h3>
     <label>Email address <input type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)}/></label>
     <div className="row wrap">
       <button className="button accent" disabled={account.busy}>{account.busy ? 'Sending…' : 'Email me a link'}</button>
       <button type="button" className="button" disabled={account.busy} onClick={() => setMode(undefined)}>Back</button>
     </div>
   </form> : <>
     <div className="row wrap">
       <button className="button accent" onClick={() => setMode('create')}>Create account</button>
       <button className="button" onClick={() => setMode('login')}>Log in</button>
     </div>
     <button className="button" onClick={() => setMode('key')}>Use an existing account key</button>
   </>)}
 </section>
}
