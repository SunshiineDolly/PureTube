import {useEffect,useRef,useState} from 'react'
import {Activity,Bookmark,Copy,Link2,MessageSquare,Play,Send,Trash2,Users,Video as VideoIcon} from 'lucide-react'
import {type ActivityPost,type PublicProfile,type SharedVideo,type WallPost,profileAvatars,profileThemes,useFriends} from './friends-network'
import {linkVideo,parseVideo} from './public-feeds'
import {profileName,type Library} from './library'
import {type Video,visible} from './domain'
import type {Shared} from './screens'

type Picks={pins:string[];playlists:string[];theme?:PublicProfile['theme'];avatar?:PublicProfile['avatar'];guestbook?:boolean;wall?:WallPost[];activity?:ActivityPost[]}
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
   theme:picks.theme,avatar:picks.avatar,guestbook:picks.guestbook,wall:picks.wall,activity:picks.activity,
   pins:picks.pins.filter(id=>data.favorites.includes(id)).slice(0,6).map(card),
   playlists:data.collections.filter(collection=>picks.playlists.includes(collection.name)).slice(0,8)
     .map(collection=>({name:collection.name,videos:collection.ids.slice(0,40).map(card)})),
 }
 function receiveWall(post:WallPost){
   setPicks(previous=>previous.wall?.some(p=>p.id===post.id)||!previous.guestbook?previous:{...previous,wall:[post,...previous.wall??[]].slice(0,20)})
 }
 return {profile,picks,setPicks,card,receiveWall}
}

function ProfileContent({profile,onVideo,onPlaylist}:{profile:PublicProfile;onVideo:(video:SharedVideo)=>void;onPlaylist:(name:string,videos:SharedVideo[])=>void}){
 return <div className="profile-public">
   <div className="profile-cover community-cover" data-profile-theme={profile.theme}><span className="profile-initial" aria-hidden="true">{profile.avatar||profile.name.slice(0,1).toUpperCase()}</span><div><h2>{profile.name}</h2>{profile.bio&&<p>{profile.bio}</p>}</div></div>
   <h3>Pinned favorites</h3>
   {profile.pins.length?<div className="profile-videos">{profile.pins.map(v=><button key={v.id} className="profile-video" onClick={()=>onVideo(v)}><img alt="" loading="lazy" src={'https://i.ytimg.com/vi/'+v.id+'/mqdefault.jpg'}/><span>{v.title}</span></button>)}</div>:<p className="meta">No pinned videos yet.</p>}
   <h3>Shared playlists</h3>
   {profile.playlists.length?<div className="profile-playlists">{profile.playlists.map(list=><button type="button" className="button" key={list.name} disabled={!list.videos.length} onClick={()=>onPlaylist(list.name,list.videos)}><Bookmark size={15}/> {list.name} <small>{list.videos.length} videos</small></button>)}</div>:<p className="meta">No shared playlists yet.</p>}
 </div>
}

function ActivityList({entries,onVideo,onRemove}:{entries:{post:ActivityPost;name:string;avatar?:string;own?:boolean}[];onVideo:(video:SharedVideo)=>void;onRemove?:(id:string)=>void}){
 return <div className="community-posts">{entries.map(({post,name,avatar,own})=><article key={name+post.id} className="community-post">
   <header><span className="friend-avatar" aria-hidden="true">{avatar||name.slice(0,1).toUpperCase()}</span><div><strong>{name}</strong><time dateTime={new Date(post.at).toISOString()}>{new Date(post.at).toLocaleString([], {dateStyle:'medium',timeStyle:'short'})}</time></div>
   {own&&onRemove&&<button className="icon" title="Delete post" aria-label="Delete post" onClick={()=>onRemove(post.id)}><Trash2 size={15}/></button>}</header>
   {post.text&&<p>{post.text}</p>}
   {post.video&&<button className="community-video" onClick={()=>onVideo(post.video!)}><img src={'https://i.ytimg.com/vi/'+post.video.id+'/mqdefault.jpg'} alt="" loading="lazy"/><span><Play size={15}/>{post.video.live?'Open stream':'Watch video'}<strong>{post.video.title}</strong></span></button>}
 </article>)}</div>
}

export function FriendsPage({shared,account,network,attachment,onClearAttachment}:{shared:Shared;account:ReturnType<typeof useProfile>;network:ReturnType<typeof useFriends>;attachment?:SharedVideo;onClearAttachment:()=>void}){
 const [friendId,setFriendId]=useState(''),[view,setView]=useState<'activity'|'about'|'wall'|'messages'>('activity')
 const [draft,setDraft]=useState(''),[code,setCode]=useState(''),[shareLink,setShareLink]=useState('')
 const [postDraft,setPostDraft]=useState(''),[postLink,setPostLink]=useState(''),[wallDraft,setWallDraft]=useState('')
 const [notice,setNotice]=useState(''),[editing,setEditing]=useState(false)
 const [name,setName]=useState(shared.data.profileName),[bio,setBio]=useState(shared.data.profileBio)
 const messageList=useRef<HTMLDivElement>(null)
 const friends=Object.values(network.book.friends)
 const friend=network.book.friends[friendId]
 const messages=network.book.messages[friendId]??[]
 const online=network.online.includes(friendId)
 const pending=network.signal
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
 function publish(){
   const link=parseVideo(postLink.trim())
   if(postLink.trim()&&(!link||link.shorts)){setNotice('Paste a regular YouTube video or live link.');return}
   const video=attachment??(link?{...account.card(link.id),live:link.live}:undefined)
   if(!postDraft.trim()&&!video)return
   const post={id:crypto.randomUUID(),at:Date.now(),text:postDraft.trim(),video}
   account.setPicks(p=>({...p,activity:[post,...p.activity??[]].slice(0,20)}))
   setPostDraft('');setPostLink('');setNotice('Posted to your friends’ activity.');onClearAttachment()
 }
 const profile=friend??account.profile
 const activity=(friend?[friend]:[account.profile,...friends]).flatMap(person=>(person.activity??[]).map(post=>({post,name:person.name,avatar:person.avatar,own:person===account.profile}))).sort((a,b)=>b.post.at-a.post.at)
 const removePost=(id:string)=>account.setPicks(p=>({...p,activity:p.activity?.filter(post=>post.id!==id)}))
 const removeWall=(id:string)=>account.setPicks(p=>({...p,wall:p.wall?.filter(post=>post.id!==id)}))
 function switchTo(next:typeof view){setView(next);setNotice('')}
 return <div className="friends-page">
   <div className="heading"><div><h1>Community</h1></div></div>
   <div className="friends-layout">
     <aside className="friends-list">
       <h2><Users size={18}/> Friends</h2>
       <button className={'button '+(!friend&&view==='activity'?'accent':'')} onClick={()=>{setFriendId('');switchTo('activity')}}><Activity size={16}/> Friends’ activity</button>
       <button className={'button '+(!friend&&view!=='activity'?'accent':'')} onClick={()=>{setFriendId('');switchTo('about')}}>My profile</button>
       {friends.map(person=><button className={'friend-entry '+(friendId===person.id?'selected':'')} key={person.id} onClick={()=>{setFriendId(person.id);setDraft('');setWallDraft('');switchTo(attachment?'messages':'about')}}>
         <span className="friend-avatar">{person.avatar||person.name.slice(0,1).toUpperCase()}</span><span>{person.name}<small>{network.online.includes(person.id)?'Connected':'Offline'}</small></span>
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
       {attachment&&<div className="community-attachment"><VideoIcon size={16}/><strong>{attachment.title}</strong><button className="button" onClick={onClearAttachment}>Remove attachment</button></div>}
       <div className="friends-toolbar"><h2>{friend?.name??(view==='activity'?'Friends’ activity':'My profile')}</h2><div className="row wrap community-tabs">
         <button className="button" aria-pressed={view==='activity'} onClick={()=>switchTo('activity')}>Activity</button>
         <button className="button" aria-pressed={view==='about'} onClick={()=>switchTo('about')}>Profile</button>
         <button className="button" aria-pressed={view==='wall'} onClick={()=>switchTo('wall')}>Guestbook</button>
         {friend&&<button className="button" aria-pressed={view==='messages'} onClick={()=>switchTo('messages')}><MessageSquare size={14}/> Messages</button>}
       </div></div>
       {view==='activity'&&<>
         {!friend&&<form className="community-compose" onSubmit={e=>{e.preventDefault();publish()}}>
           <textarea aria-label="Activity post" placeholder="Share something with friends" value={postDraft} maxLength={500} onChange={e=>setPostDraft(e.target.value)}/>
           {!attachment&&<input aria-label="Activity video link" placeholder="Optional YouTube video or live link" value={postLink} maxLength={500} onChange={e=>setPostLink(e.target.value)}/>}
           <button className="button accent" disabled={!postDraft.trim()&&!postLink.trim()&&!attachment}><Send size={15}/> Post</button>
         </form>}
         {activity.length?<ActivityList entries={activity} onVideo={open} onRemove={removePost}/>:<p className="meta">No activity yet.</p>}
       </>}
       {view==='wall'&&<>
         {friend&&profile.guestbook&&<form className="community-compose" onSubmit={e=>{e.preventDefault();if(network.signWall(friendId,wallDraft)){setWallDraft('');setNotice('Signature sent.')}else setNotice('Connect to this friend before signing.')}}>
           <textarea aria-label="Guestbook signature" placeholder={online?'Leave a note for your friend':'Friend is offline'} maxLength={500} value={wallDraft} onChange={e=>setWallDraft(e.target.value)} disabled={!online}/>
           <button className="button accent" disabled={!online||!wallDraft.trim()}><Send size={15}/> Sign guestbook</button>
         </form>}
         {!profile.guestbook&&<p className="meta">Guestbook is closed.</p>}
         {profile.wall?.length?<ActivityList entries={profile.wall.map(post=>({post,name:post.author,own:!friend}))} onVideo={open} onRemove={removeWall}/>:<p className="meta">No entries yet.</p>}
       </>}
       {view==='about'&&<>
         <div className="community-profile-actions">{friend?<button className="button" onClick={()=>{if(confirm('Remove this friend and the conversation on this PC?')){network.forget(friendId);setFriendId('');switchTo('activity')}}}>Remove friend</button>:<button className="button" onClick={()=>setEditing(!editing)}>{editing?'Close editor':'Edit profile'}</button>}</div>
         <ProfileContent profile={profile} onVideo={open} onPlaylist={playList}/>
         {!friend&&editing&&<section className="profile-editor">
           <form onSubmit={e=>{e.preventDefault();shared.change(d=>({...d,profileName:profileName(name),profileBio:bio.trim().slice(0,250)}));setNotice('Profile saved.')}}>
             <label>Display name<input value={name} maxLength={48} onChange={e=>setName(e.target.value)}/></label>
             <label>Bio<textarea value={bio} maxLength={250} onChange={e=>setBio(e.target.value)}/></label>
             <button className="button accent">Save profile</button>
           </form>
           <fieldset><legend>Customize your profile</legend>
             <label>Cover palette <select value={account.picks.theme??'Viddy'} onChange={e=>{const theme=profileThemes.find(t=>t===e.target.value);account.setPicks(p=>({...p,theme}))}}>{profileThemes.map(theme=><option key={theme}>{theme}</option>)}</select></label>
             <div className="profile-emoji-options">{profileAvatars.map(avatar=><button type="button" key={avatar} aria-label={avatar?'Avatar '+avatar:'Use initials'} aria-pressed={(account.picks.avatar??'')===avatar} onClick={()=>account.setPicks(p=>({...p,avatar}))}>{avatar||'Aa'}</button>)}</div>
             <label><input type="checkbox" checked={!!account.picks.guestbook} onChange={e=>account.setPicks(p=>({...p,guestbook:e.target.checked}))}/> Let connected friends sign my guestbook</label>
           </fieldset>
           <fieldset><legend>Pin up to six favorites</legend>
             {shared.data.favorites.length?shared.data.favorites.map(id=><label key={id}><input type="checkbox" checked={account.picks.pins.includes(id)} disabled={account.picks.pins.length>=6&&!account.picks.pins.includes(id)} onChange={e=>account.setPicks(p=>({...p,pins:e.target.checked?[...p.pins,id]:p.pins.filter(v=>v!==id)}))}/>{account.card(id).title}</label>):<p className="meta">Favorite a video to pin it here.</p>}
           </fieldset>
           <fieldset><legend>Show on your public profile</legend>
             {shared.data.collections.length?shared.data.collections.map(list=><label key={list.name}><input type="checkbox" checked={account.picks.playlists.includes(list.name)} disabled={account.picks.playlists.length>=8&&!account.picks.playlists.includes(list.name)} onChange={e=>account.setPicks(p=>({...p,playlists:e.target.checked?[...p.playlists,list.name]:p.playlists.filter(v=>v!==list.name)}))}/>{list.name}</label>):<p className="meta">Create a playlist in your Library to share it here.</p>}
           </fieldset>
           <p className="meta">Only the details above are shared with connected friends.</p>
         </section>}
       </>}
       {friend&&view==='messages'&&<>
           <div className="friend-messages" ref={messageList} aria-label="Conversation">
             {messages.length?messages.map(m=><article className={m.own?'own':''} key={m.id}>{m.text&&<p>{m.text}</p>}{m.video&&<button className="button" onClick={()=>open(m.video!)}><VideoIcon size={16}/>{m.video.live?'Watch live':'Watch video'} · {m.video.title}</button>}</article>):<p className="meta">Start with a message or a video.</p>}
           </div>
           <form className="friend-compose" onSubmit={e=>{e.preventDefault();submit()}}>
             <input aria-label="Message" placeholder={online?'Write a message':'Friend is offline'} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={1000} disabled={!online}/>
             {!attachment&&<label><Link2 size={15}/><input aria-label="YouTube video or live link" placeholder="Optional video or live link" value={shareLink} maxLength={500} onChange={e=>setShareLink(e.target.value)} disabled={!online}/></label>}
             <button className="button accent" disabled={!online||(!draft.trim()&&!shareLink.trim()&&!attachment)}><Send size={15}/> Send</button>
           </form>
       </>}
     </section>
   </div>
 </div>
}
