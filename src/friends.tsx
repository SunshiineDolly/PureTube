import {useEffect,useRef,useState} from 'react'
import {Bookmark,Copy,Link2,Send,Users,Video as VideoIcon} from 'lucide-react'
import {type PublicProfile,type SharedVideo,useFriends} from './friends-network'
import {linkVideo,parseVideo} from './public-feeds'
import {profileName,type Library} from './library'
import {type Video,visible} from './domain'
import type {Shared} from './screens'

type Picks={pins:string[];playlists:string[]}
const profileStorage='viddy-profile-picks-v1'
export function useProfile(data:Library){
 const [picks,setPicks]=useState<Picks>(()=>{
   try{return JSON.parse(localStorage.getItem(profileStorage)??'null')??{pins:[],playlists:[]}}catch{return {pins:[],playlists:[]}}
 })
 useEffect(()=>{try{localStorage.setItem(profileStorage,JSON.stringify(picks))}catch{}},[picks])
 const card=(id:string):SharedVideo=>{
   const v=data.savedVideos[id]
   return {id,title:v?.title??'YouTube video',live:v?.live}
 }
 const profile:PublicProfile={
   name:data.profileName||'Viddy viewer',bio:data.profileBio,
   pins:picks.pins.filter(id=>data.favorites.includes(id)).slice(0,6).map(card),
   playlists:data.collections.filter(collection=>picks.playlists.includes(collection.name)).slice(0,8)
     .map(collection=>({name:collection.name,videos:collection.ids.slice(0,40).map(card)})),
 }
 return {profile,picks,setPicks,card}
}

function ProfileContent({profile,onVideo,onPlaylist}:{profile:PublicProfile;onVideo:(video:SharedVideo)=>void;onPlaylist:(name:string,videos:SharedVideo[])=>void}){
 return <div className="profile-public">
   <div className="profile-cover"><span className="profile-initial" aria-hidden="true">{profile.name.slice(0,1).toUpperCase()}</span><div><h2>{profile.name}</h2>{profile.bio&&<p>{profile.bio}</p>}</div></div>
   <h3>Pinned favorites</h3>
   {profile.pins.length?<div className="profile-videos">{profile.pins.map(v=><button key={v.id} className="profile-video" onClick={()=>onVideo(v)}><img alt="" loading="lazy" src={'https://i.ytimg.com/vi/'+v.id+'/mqdefault.jpg'}/><span>{v.title}</span></button>)}</div>:<p className="meta">No pinned videos yet.</p>}
   <h3>Shared playlists</h3>
   {profile.playlists.length?<div className="profile-playlists">{profile.playlists.map(list=><button type="button" className="button" key={list.name} disabled={!list.videos.length} onClick={()=>onPlaylist(list.name,list.videos)}><Bookmark size={15}/> {list.name} <small>{list.videos.length} videos</small></button>)}</div>:<p className="meta">No shared playlists yet.</p>}
 </div>
}

export function FriendsPage({shared,account,network,attachment,onClearAttachment}:{shared:Shared;account:ReturnType<typeof useProfile>;network:ReturnType<typeof useFriends>;attachment?:SharedVideo;onClearAttachment:()=>void}){
 const [friendId,setFriendId]=useState(''),[view,setView]=useState<'about'|'messages'>('messages')
 const [draft,setDraft]=useState(''),[code,setCode]=useState(''),[shareLink,setShareLink]=useState('')
 const [notice,setNotice]=useState(''),[editing,setEditing]=useState(false)
 const [name,setName]=useState(shared.data.profileName),[bio,setBio]=useState(shared.data.profileBio)
 const messageList=useRef<HTMLDivElement>(null)
 const friends=Object.values(network.book.friends)
 const friend=network.book.friends[friendId]
 const messages=network.book.messages[friendId]??[]
 const online=network.online.includes(friendId)
 const pending=network.signal
 useEffect(()=>{if(attachment){setView('messages');if(!friendId&&network.online[0])setFriendId(network.online[0])}},[attachment,network.online,friendId])
 useEffect(()=>{if(messageList.current)messageList.current.scrollTop=messageList.current.scrollHeight},[friendId,view,messages.length])
 const convert=(item:SharedVideo):Video=>({...linkVideo(item.id),...shared.data.savedVideos[item.id],title:item.title,live:item.live})
 const open=(item:SharedVideo)=>shared.watch(convert(item))
 function playList(name:string,videos:SharedVideo[]){
   const permitted=videos.map(convert).filter(v=>!v.live&&visible(v,shared.data.settings))
   if(!permitted.length)return
   shared.change(d=>({...d,savedVideos:{...d.savedVideos,...Object.fromEntries(permitted.map(v=>[v.id,v]))}}))
   shared.playPlaylist('Queue',permitted.map(v=>v.id),0,permitted[0])
 }
 function submit(){
   const link=parseVideo(shareLink.trim())
   if(shareLink.trim()&&(!link||link.shorts)){setNotice('Paste a regular YouTube video or live link.');return}
   const media=attachment??(link?{...account.card(link.id),live:link.live}:undefined)
   if(!draft.trim()&&!media)return
   if(network.send(friendId,draft,media)){setDraft('');setShareLink('');onClearAttachment();setNotice('')}
   else setNotice('Connect to this friend before sending.')
 }
 return <div className="friends-page">
   <div className="heading"><div><h1>Profile & friends</h1><p>Share the videos you love with people you invite.</p></div></div>
   <div className="friends-layout">
     <aside className="friends-list">
       <h2><Users size={18}/> Friends</h2>
       <button className={'button '+(!friend?'accent':'')} onClick={()=>setFriendId('')}>My profile</button>
       {friends.map(person=><button className={'friend-entry '+(friendId===person.id?'selected':'')} key={person.id} onClick={()=>{setFriendId(person.id);setDraft('');setNotice('');setView(attachment?'messages':'about')}}>
         <span className="friend-avatar">{person.name.slice(0,1).toUpperCase()}</span><span>{person.name}<small>{network.online.includes(person.id)?'Connected':'Offline'}</small></span>
       </button>)}
       <details className="friend-connect" open={pending?true:undefined}>
         <summary>Connect with a friend</summary>
         <p>Exchange an invite and a reply code. Messages send while both copies of Viddy are connected.</p>
         {network.message&&<p role="status">{network.message}</p>}
         {pending?<><label>{pending.kind==='invite'?'Your invite':'Your reply'}<input readOnly value={pending.code} onFocus={e=>e.currentTarget.select()}/></label>
           <button className="button" onClick={()=>void navigator.clipboard.writeText(pending.code).then(()=>setNotice('Code copied.'),()=>setNotice('Select the code and copy it.'))}><Copy size={15}/> Copy code</button>
           {pending.kind==='invite'&&<form onSubmit={e=>{e.preventDefault();void network.exchange('connect',code.trim())}}><input aria-label="Friend reply code" placeholder="Paste reply code" value={code} maxLength={32000} onChange={e=>setCode(e.target.value)}/><button className="button accent" disabled={network.busy||!code.trim()}>Connect</button></form>}
           <button className="button" disabled={network.busy} onClick={()=>{network.cancel();setCode('')}}>Cancel</button>
         </>:<><button className="button accent" disabled={network.busy} onClick={()=>{setCode('');void network.exchange('invite')}}>Create friend invite</button>
           <form onSubmit={e=>{e.preventDefault();void network.exchange('reply',code.trim())}}><input aria-label="Friend invite code" placeholder="Paste friend invite" value={code} maxLength={32000} onChange={e=>setCode(e.target.value)}/><button className="button" disabled={network.busy||!code.trim()}>Create reply</button></form></>}
       </details>
     </aside>
     <section className="friends-main">
       {notice&&<p className="notice" role="status">{notice}</p>}
       {attachment&&<p className="meta">Sharing {attachment.title}. Select a connected friend. <button className="button" onClick={onClearAttachment}>Cancel share</button></p>}
       {!friend?<><div className="friends-toolbar"><h2>My profile</h2><button className="button" onClick={()=>setEditing(!editing)}>{editing?'Close editor':'Edit profile'}</button></div>
         <ProfileContent profile={account.profile} onVideo={open} onPlaylist={playList}/>
         {editing&&<section className="profile-editor">
           <form onSubmit={e=>{e.preventDefault();shared.change(d=>({...d,profileName:profileName(name),profileBio:bio.trim().slice(0,250)}));setNotice('Profile saved.')}}>
             <label>Display name<input value={name} maxLength={48} onChange={e=>setName(e.target.value)}/></label>
             <label>Bio<textarea value={bio} maxLength={250} onChange={e=>setBio(e.target.value)}/></label>
             <button className="button accent">Save profile</button>
           </form>
           <fieldset><legend>Pin up to six favorites</legend>
             {shared.data.favorites.length?shared.data.favorites.map(id=><label key={id}><input type="checkbox" checked={account.picks.pins.includes(id)} disabled={account.picks.pins.length>=6&&!account.picks.pins.includes(id)} onChange={e=>account.setPicks(p=>({...p,pins:e.target.checked?[...p.pins,id]:p.pins.filter(v=>v!==id)}))}/>{account.card(id).title}</label>):<p className="meta">Favorite a video to pin it here.</p>}
           </fieldset>
           <fieldset><legend>Show on your public profile</legend>
             {shared.data.collections.length?shared.data.collections.map(list=><label key={list.name}><input type="checkbox" checked={account.picks.playlists.includes(list.name)} disabled={account.picks.playlists.length>=8&&!account.picks.playlists.includes(list.name)} onChange={e=>account.setPicks(p=>({...p,playlists:e.target.checked?[...p.playlists,list.name]:p.playlists.filter(v=>v!==list.name)}))}/>{list.name}</label>):<p className="meta">Create a playlist in your Library to share it here.</p>}
           </fieldset>
           <p className="meta">Only the details above are shared with connected friends.</p>
         </section>}
       </>:<><div className="friends-toolbar"><h2>{friend.name}</h2><div className="row wrap"><button className="button" aria-pressed={view==='about'} onClick={()=>setView('about')}>Profile</button><button className="button" aria-pressed={view==='messages'} onClick={()=>setView('messages')}>Messages</button><button className="button" onClick={()=>{if(confirm('Remove this friend and the conversation on this PC?')){network.forget(friendId);setFriendId('')}}}>Remove</button></div></div>
         {view==='about'?<ProfileContent profile={friend} onVideo={open} onPlaylist={playList}/>:<>
           <div className="friend-messages" ref={messageList} aria-label="Conversation">
             {messages.length?messages.map(m=><article className={m.own?'own':''} key={m.id}>{m.text&&<p>{m.text}</p>}{m.video&&<button className="button" onClick={()=>open(m.video!)}><VideoIcon size={16}/>{m.video.live?'Watch live':'Watch video'} · {m.video.title}</button>}</article>):<p className="meta">Start with a message or a video.</p>}
           </div>
           <form className="friend-compose" onSubmit={e=>{e.preventDefault();submit()}}>
             <input aria-label="Message" placeholder={online?'Write a message':'Friend is offline'} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={1000} disabled={!online}/>
             {!attachment&&<label><Link2 size={15}/><input aria-label="YouTube video or live link" placeholder="Optional video or live link" value={shareLink} maxLength={500} onChange={e=>setShareLink(e.target.value)} disabled={!online}/></label>}
             <button className="button accent" disabled={!online||(!draft.trim()&&!shareLink.trim()&&!attachment)}><Send size={15}/> Send</button>
           </form>
         </>}
       </>}
     </section>
   </div>
 </div>
}
