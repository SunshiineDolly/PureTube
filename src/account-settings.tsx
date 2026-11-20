import {useState} from 'react'
import {UserRound} from 'lucide-react'
import type {ViddyAccount} from './use-account'

export function AccountSettings({account}: {account: ViddyAccount}) {
 const [email, setEmail] = useState('')
 const [code, setCode] = useState('')
 const sent = account.pendingEmail

 return <section>
   <h2><UserRound/> Viddy account</h2>
   <p>Sync your profile, watch history, resume positions, follows, favorites, Watch Later, and playlists between your devices.</p>
   {account.configured === false && <p>Account sync is unavailable in this build.</p>}
   {account.problem && <p className="notice" role="alert">{account.problem}</p>}
   {account.user ? <>
     <p>Signed in as {account.user.email}</p>
     <p role="status">{account.busy ? 'Syncing library…' : account.message}</p>
     <div className="row wrap">
       <button className="button" disabled={account.busy} onClick={() => void account.syncNow()}>Sync now</button>
       <button className="button" disabled={account.busy} onClick={() => {setCode(''); void account.signOut()}}>Sign out</button>
     </div>
   </> : account.configured && (sent ? <>
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
     <p>Use the same email on each device. Your first sign-in creates your account and merges your saved items.</p>
   </form>)}
 </section>
}
