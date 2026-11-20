import {UserRound} from 'lucide-react'
import type {ViddyAccount} from './use-account'

export function AccountSettings({account}: {account: ViddyAccount}) {
 return <section>
   <h2><UserRound/> Viddy account</h2>
   <p>Sync your profile, watch history, and saved videos across your PC and Mac.</p>
   {account.problem && <p className="notice" role="alert">{account.problem}</p>}
   {account.user ? <>
     <p>Signed in as {account.user.display_name}</p>
     <p role="status">{account.busy ? 'Syncing…' : account.message}</p>
     <div className="row wrap">
       <button className="button" disabled={account.busy} onClick={() => void account.syncNow()}>Sync now</button>
       <button className="button" disabled={account.busy} onClick={() => void account.signOut()}>Log out</button>
     </div>
   </> : account.pending ? <>
     <p role="status">Finish signing in with Discord in your browser, then return to Viddy.</p>
     <button className="button" disabled={account.busy} onClick={() => void account.cancel()}>Cancel</button>
   </> : <>
     <button className="button accent" disabled={account.busy || !account.restored} onClick={() => void account.signIn()}>Continue with Discord</button>
     <p>Your local library will merge with your Discord account. You’ll stay signed in when you close Viddy.</p>
   </>}
 </section>
}
