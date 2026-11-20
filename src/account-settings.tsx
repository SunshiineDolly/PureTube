import {useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {errorText} from './domain'
import {UserRound} from 'lucide-react'
import type {ViddyAccount} from './use-account'

export function AccountSettings({account}: {account: ViddyAccount}) {
 const [email, setEmail] = useState('')
 const [code, setCode] = useState('')
 const sent = account.pendingEmail
 const [key, setKey] = useState('')
 const [newKey, setNewKey] = useState('')
 const [saved, setSaved] = useState(false)
 const [keyError, setKeyError] = useState('')
 async function generate() {
   setKeyError('')
   try { setNewKey(await invoke<string>('account_generate_key')); setSaved(false) }
   catch (error) { setKeyError(errorText(error)) }
 }
 const keySetup = newKey && <form onSubmit={async event => {
   event.preventDefault()
   if (await account.useKey(newKey, account.user ? 'attach' : 'create')) setNewKey('')
 }}>
   <label>Your private account key <input value={newKey} readOnly onFocus={event => event.currentTarget.select()}/></label>
   <p>Save this key in a password manager. Use it to sign in on another device. Anyone with the key can access your synced library.</p>
   <label><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)}/> I saved my key</label>
   <div className="row wrap">
     <button className="button accent" disabled={!saved || account.busy}>{account.user ? 'Link key to this account' : 'Create account'}</button>
     <button type="button" className="button" disabled={account.busy} onClick={() => setNewKey('')}>Cancel</button>
   </div>
 </form>

 return <section>
   <h2><UserRound/> Viddy account</h2>
   <p>Sync your profile, watch history, resume positions, follows, favorites, Watch Later, and playlists between your devices.</p>
   {account.configured === false && <p>Account sync is unavailable in this build.</p>}
   {keyError && <p className="notice" role="alert">{keyError}</p>}
   {account.problem && <p className="notice" role="alert">{account.problem}</p>}
   {account.user ? <>
     <p>{account.user.private_key ? "Signed in with your private key" : "Signed in as " + account.user.email}</p>
     {!account.user.private_key && (keySetup || <button className="button" disabled={account.busy} onClick={() => void generate()}>Add a private key</button>)}
     <p role="status">{account.busy ? 'Syncing library…' : account.message}</p>
     <div className="row wrap">
       <button className="button" disabled={account.busy} onClick={() => void account.syncNow()}>Sync now</button>
       <button className="button" disabled={account.busy} onClick={() => {setCode(''); setNewKey(''); void account.signOut()}}>Sign out</button>
     </div>
   </> : account.configured && <>
     <p>Create an account without an email address. Your private key lets you recover the account and sign in on your other devices.</p>
     {keySetup || <>
       <button className="button accent" disabled={account.busy} onClick={() => void generate()}>Create a private account</button>
       <form onSubmit={async event => {
         event.preventDefault()
         if (await account.useKey(key, 'identify')) setKey('')
       }}>
         <label>Account key <input type="password" autoComplete="off" maxLength={80} required value={key} onChange={event => setKey(event.target.value)}/></label>
         <button className="button" disabled={account.busy}>Sign in with key</button>
       </form>
     </>}
     <details open={sent ? true : undefined}>
       <summary>Sign in to an existing email account</summary>
     {sent ? <>
     <p role="status">Check {sent} for an email from Viddy. Open the link on this device while Viddy is running.</p>
     <div className="row wrap">
       <button type="button" className="button" disabled={account.busy} onClick={() => {setCode(''); void account.sendEmail(sent)}}>Resend email</button>
       <button type="button" className="button" disabled={account.busy} onClick={() => {setCode(''); void account.cancelEmail()}}>Change email</button>
     </div>
     <details>
       <summary>Enter an email code instead</summary>
       <form onSubmit={async event => {
         event.preventDefault()
         if (await account.verify(sent, code.trim())) setCode('')
       }}>
         <label>Email code <input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,10}" maxLength={10} required value={code} onChange={event => setCode(event.target.value)}/></label>
         <button className="button" disabled={account.busy}>Sign in</button>
       </form>
     </details>
   </> : <form onSubmit={event => {
     event.preventDefault()
     void account.sendEmail(email.trim())
   }}>
     <label>Email address <input type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)}/></label>
     <button className="button accent" disabled={account.busy}>{account.busy ? 'Sending…' : 'Continue with email'}</button>
   </form>}
     </details>
   </>}
 </section>
}
