import {useState} from 'react'
import {UserRound} from 'lucide-react'
import type {ViddyAccount} from './use-account'

export function AccountSettings({account}: {account: ViddyAccount}) {
 const [email, setEmail] = useState('')
 const [code, setCode] = useState('')
 const [sent, setSent] = useState('')
 const [create, setCreate] = useState(false)

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
       <button className="button" disabled={account.busy} onClick={() => {setSent(''); setCode(''); void account.signOut()}}>Sign out</button>
     </div>
   </> : account.configured && (sent ? <form onSubmit={async event => {
     event.preventDefault()
     if (await account.verify(sent, code.trim())) {setSent(''); setCode('')}
   }}>
     <p>Copy the sign-in link from the email sent to {sent} and paste it here. If your email contains a code, enter that instead. Signing in merges this device’s library with your account.</p>
     <label>Sign-in link or code <input autoComplete="one-time-code" spellCheck={false} maxLength={2048} required value={code} onChange={event => setCode(event.target.value)}/></label>
     <div className="row wrap">
       <button className="button accent" disabled={account.busy}>Sign in</button>
       <button type="button" className="button" disabled={account.busy} onClick={() => void account.sendCode(sent, create)}>Resend email</button>
       <button type="button" className="button" disabled={account.busy} onClick={() => {setSent(''); setCode('')}}>Change email</button>
     </div>
   </form> : <form onSubmit={async event => {
     event.preventDefault()
     const address = email.trim()
     if (await account.sendCode(address, create)) setSent(address)
   }}>
     <label>Email address <input type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)}/></label>
     <div className="row wrap">
       <button className="button accent" disabled={account.busy}>{create ? 'Send sign-up email' : 'Send sign-in email'}</button>
       <button type="button" className="button" disabled={account.busy} onClick={() => setCreate(!create)}>{create ? 'I have an account' : 'Create an account'}</button>
     </div>
     <p>Sign in by email each time you open Viddy. Your local library stays available offline.</p>
   </form>)}
 </section>
}
