import {useState} from 'react'
import {Bookmark,Clock3,UserRound,Users} from 'lucide-react'
import {Heading,Notice,type Shared} from './screens'
import {profileName} from './library'

export function Profile({shared,following,library,later}:{shared:Shared;following:()=>void;library:()=>void;later:()=>void}){
 const {data,change}=shared
 const [name,setName]=useState(data.profileName),[saved,setSaved]=useState(false)
 return <>
  <Heading label="ON THIS PC" title="Your profile" detail="Make PureTube yours. Your profile doesn't need an online account."/>
  <section className="local-profile">
   <div className="local-profile-identity"><span className="local-avatar">{data.profileName?Array.from(data.profileName)[0]?.toUpperCase():<UserRound size={25}/>}</span>
   <div><h2>{data.profileName||'Personal profile'}</h2><p className="meta">Follows, watch history, and saved videos stay in this library.</p></div></div>
   <form className="row wrap profile-name-form" onSubmit={e=>{e.preventDefault();const value=profileName(name);change(d=>({...d,profileName:value}));setName(value);setSaved(true)}}>
    <label>Display name <input maxLength={48} value={name} onChange={e=>{setSaved(false);setName(e.target.value)}} placeholder="Optional name"/></label>
    <button className="button accent" disabled={profileName(name)===data.profileName}>Save name</button>
   </form>
   {saved&&<Notice text="Profile saved on this PC."/>}
  </section>
  <div className="profile-shortcuts">
   <button className="button" onClick={following}><Users size={18}/> Following <span>{data.follows.length}</span></button>
   <button className="button" onClick={later}><Clock3 size={18}/> Watch Later <span>{data.later.length}</span></button>
   <button className="button" onClick={library}><Bookmark size={18}/> Library</button>
  </div>
  <button className="button" onClick={shared.subscriptions}>Add or manage channels</button>
 </>
}
