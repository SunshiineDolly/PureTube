import {createRoot} from 'react-dom/client'
import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {listen} from '@tauri-apps/api/event'
import {Download,PictureInPicture2} from 'lucide-react'
import {DownloadButton,DownloadsPage} from './downloads'
import {MiniPlayer} from './mini-player'
import {useUpNext,UpNext} from './up-next'
import {ArrowLeft, Bookmark, Clock3, Compass, History, House, Maximize, Menu, Minimize, Moon, Radio, Settings as Gear, Sun, UserRound, Users, X, Heart, Share2} from 'lucide-react'
import {clock,day,Empty,Loading} from './components'
import {Preferences} from './settings'
import {Heading,Quiet,Subscriptions,ChannelPage,LibraryPage,Notice,type ChannelTab,type Shared} from './screens'
import {PlayerFrame} from './player'
import {useLibrary} from './hooks'
import {channelId,errorText,visible,type Video} from './domain'
import {linkVideo,parseVideo,usePublicFeeds} from './public-feeds'
import {toggled} from './library'
import {Discover,RecommendationFeed} from './discover'
import {useUpdates} from './updates'
import {categoryFor} from './topics'
import {SearchPage,type SearchSource} from './search'
import {Profile} from './profile'
import {BrandMark} from './brand'
import {CreatorAvatar} from './creator-avatar'
import {SearchBar} from './search-bar'
import {WindowControls} from './window-controls'
import {ScheduledDetails,useLiveReminders,useScheduledStatus} from './live'
import {CreatorByline,useWatchCreator} from './creator-links'
import {useFollowedLive} from './followed-live'
import {LiveChat} from './live-chat'
import './styles.css'
import './studio.css'

type Name='home'|'discover'|'following'|'profile'|'subscriptions'|'library'|'later'|'history'|'settings'|'downloads'
type Route={name:Name}|{name:'search';query:string;source?:SearchSource}|{name:'live';query?:string;mode?:'live'|'scheduled'}|{name:'channel';id:string;tab?:ChannelTab}|{name:'watch';video:Video}
const nav = [{id:'home',name:'Home',Icon:House},{id:'discover',name:'Discover',Icon:Compass},{id:'following',name:'Following',Icon:Users},{id:'live',name:'Live',Icon:Radio},{id:'profile',name:'Your profile',Icon:UserRound},{id:'subscriptions',name:'Manage follows',Icon:Users},{id:'library',name:'Library',Icon:Bookmark},{id:'later',name:'Watch Later',Icon:Clock3},{id:'history',name:'History',Icon:History},{id:'settings',name:'Settings',Icon:Gear}] as const
const localDate=()=>new Date().toLocaleDateString('en-CA')
function App() {
 const {data,ready,failed,error,change,setting}=useLibrary(), s=data.settings
 const [route,setRoute]=useState<Route>({name:'home'}), routes=useRef<{route:Route;text:string;scroll:number}[]>([])
 const restoreScroll=useRef(0)
 const [notice,setNotice]=useState(''),[reminder,setReminder]=useState('')
 const [text,setText]=useState('')
 const [floating,setFloating]=useState<{video:Video;start:number}|null>(null),[returned,setReturned]=useState<{id:string;start:number}>()
 const [focus,setFocus]=useState(false),[theater,setTheater]=useState(false),[session,setSession]=useState(0)
 const searchRef=useRef<HTMLInputElement>(null),main=useRef<HTMLElement>(null),dataRef=useRef(data)
 dataRef.current=data
 const updates=useUpdates(ready)
 const liveAlerts=useLiveReminders(data,change,ready)
 const followIds=data.follows
 const feeds=usePublicFeeds(ready?followIds.filter(id=>!s.blocked.includes(id)):[])
 const followedLive=useFollowedLive(ready?followIds.filter(id=>!s.blocked.includes(id)):[])
 useEffect(()=>{document.documentElement.dataset.theme=s.theme;document.documentElement.dataset.accent=s.accent},[s.theme,s.accent])
 useEffect(()=>{
   const key=(e:KeyboardEvent)=>{
     if(e.key==='Escape'&&focus){setFocus(false);return}
     if(e.key.toLowerCase()==='k'&&e.ctrlKey){e.preventDefault();searchRef.current?.focus()}
   }
   window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
 },[focus])
 useLayoutEffect(()=>{
   if(main.current)main.current.scrollTop=restoreScroll.current
   restoreScroll.current=0
 },[route])
 function go(next:Route) {
   if(next.name===route.name&&next.name!=='search'&&next.name!=='watch'&&next.name!=='channel')return
   routes.current.push({route,text:route.name==='search'?route.query:text,scroll:main.current?.scrollTop??0})
   restoreScroll.current=0
   setRoute(next);setNotice('');setFocus(next.name==='watch'&&s.focus);setTheater(false)
 }
 function back() {
   const entry=routes.current.pop()
   restoreScroll.current=entry?.scroll??0
   setRoute(entry?.route??{name:'home'});setText(entry?.text??'');setFocus(false);setTheater(false);setNotice('')
 }
 function submit(value:string) {
   const term=value.trim()
   if(!term)return
   const link=parseVideo(term)
   if(link?.shorts){setNotice('Shorts are not available in PureTube.');return}
   if(!link){
     if(/^https?:\/\//i.test(term)){setNotice('Paste a valid YouTube video link.');return}
     go({name:'search',query:term})
     return
   }
   const match=Object.values(feeds.states).flatMap(state=>state.feed?.videos??[]).find(v=>v.id===link.id)
   const v={...(match??linkVideo(link.id)),shorts:link.shorts||!!match?.shorts,live:link.live||!!match?.live}
   if(!visible(v,s))setNotice('This video is hidden by your filters.')
   else go({name:'watch',video:v})
 }
 const shared:Shared={data,change,feeds,followIds,live:followedLive,watch:v=>{if(floating)void invoke('close_player');go({name:'watch',video:v})},channel:id=>go({name:'channel',id}),follow:id=>{if(channelId(id))change(d=>({...d,follows:toggled(d.follows,id)}))},subscriptions:()=>go({name:'subscriptions'}),discover:()=>go({name:'discover'})}
 const noteSample=(id:string,position:number,duration:number,elapsed:number,live=false)=>{
   if(!Number.isFinite(elapsed)||elapsed<0)return
   const settings=dataRef.current.settings
   const saveProgress=settings.progress&&!live&&Number.isFinite(position)&&Number.isFinite(duration)&&duration>0
   if(!saveProgress && !settings.reminder)return
   const today=localDate()
   const old=dataRef.current.daily.date===today?dataRef.current.daily.seconds:0
   if(settings.reminder && old<settings.reminder*60 && old+elapsed>=settings.reminder*60)setReminder('You’ve reached your daily viewing reminder. Take a break whenever you’re ready.')
   change(d=>{
     const nextProgress=saveProgress?{...d.progress,[id]:{at:Math.min(duration,Math.max(0,position)),duration,updated:Date.now()}}:d.progress
     return {...d,progress:nextProgress,daily:settings.reminder?{date:today,seconds:(d.daily.date===today?d.daily.seconds:0)+elapsed}:d.daily}
   })
 }
 useEffect(()=>{
  const subscriptions=[
   listen<{video:Video;position:number;duration:number;elapsed:number;started:boolean}>('player-sample',({payload:p})=>{
    if(p.started&&dataRef.current.settings.history)change(d=>{const topic=categoryFor(p.video);return {...d,history:{...d.history,[p.video.id]:Date.now()},interests:topic?{...d.interests,[topic]:(d.interests[topic]??0)+1}:d.interests}})
    if(!p.started){noteSample(p.video.id,p.position,p.duration,p.elapsed,!!p.video.live);setSession(s=>s+p.elapsed);setFloating(old=>old?{...old,start:p.position}:old)}
   }),
   listen<Video>('player-video',({payload:video})=>{setFloating({video,start:0});setRoute(old=>old.name==='watch'?{name:'watch',video}:old)}),
   listen<boolean>('player-autoplay',({payload:enabled})=>change(d=>({...d,settings:{...d.settings,autoplay:enabled}}))),
   listen<{video:Video;start:number}>('player-closed',({payload:p})=>{setReturned({id:p.video.id,start:p.start??0});setFloating(null)})
  ];return()=>{subscriptions.forEach(off=>void off.then(f=>f()))}
 },[])
 const navActive=route.name
 const liveChannels=followIds.filter(id=>!!followedLive.states[id]?.video&&!followedLive.states[id]?.error)
 const sidebarFollows=[...liveChannels,...followIds.filter(id=>!liveChannels.includes(id))]
 return <div className={'app '+(s.collapsed?'collapsed ':'')+(focus?'focus ':'')+(s.density==='compact'?'compact':'')}>
 <header className="top" data-tauri-drag-region><div className="header-brand" data-tauri-drag-region>{!focus&&<button className="icon top-menu" aria-label={s.collapsed?'Expand sidebar':'Collapse sidebar'} aria-expanded={!s.collapsed} disabled={!ready} onClick={()=>setting('collapsed',!s.collapsed)}><Menu size={23}/></button>}<button className="brand" aria-label="PureTube Home" onClick={()=>go({name:'home'})}><BrandMark/><span>PureTube<sup aria-hidden="true">✦</sup></span></button></div>
 <div className="header-center" data-tauri-drag-region>{focus?<div className="focus-bar"><span>Focus Player</span><button className="button" onClick={()=>setFocus(false)}><Minimize size={16}/> Exit focus</button></div>:
 <SearchBar inputRef={searchRef} ready={ready} text={text} setText={setText} submit={submit}/>}</div>
 <div className="header-actions">{!focus&&<>
 <button className="icon theme" aria-label={'Switch to '+(s.theme==='dark'?'light':'dark')+' theme'} disabled={!ready} onClick={()=>setting('theme',s.theme==='dark'?'light':'dark')}>{s.theme==='dark'?<Sun size={19}/>:<Moon size={19}/>}</button>
 {updates.release&&<button className="button accent" onClick={()=>go({name:'settings'})}>Update available</button>}
 <button className="profile-chip" aria-label="Open local profile" onClick={()=>go({name:'profile'})}>{data.profileName?Array.from(data.profileName)[0].toUpperCase():<UserRound size={19}/>}</button></>}
 <WindowControls/></div>
 </header>
 {!focus&&<aside className="sidebar"><nav aria-label="Main navigation">{nav.filter(item=>["home","discover","following","live"].includes(item.id)).map(({id,name,Icon})=><button title={name} className={navActive===id?'selected':''} aria-current={navActive===id?'page':undefined} aria-label={name} key={id} onClick={()=>go({name:id})}><Icon size={19}/><span>{name}</span>{id==='live'&&liveChannels.length>0&&<span className="nav-live-count">{liveChannels.length}</span>}</button>)}</nav>
 <div className="sidebar-section"><p className="sidebar-section-label">You</p><nav aria-label="Your library">{nav.filter(item=>["profile","library","later","history"].includes(item.id)).map(({id,name,Icon})=><button title={name} className={navActive===id?'selected':''} aria-current={navActive===id?'page':undefined} aria-label={name} key={id} onClick={()=>go({name:id})}><Icon size={19}/><span>{name}</span>{id==='live'&&liveChannels.length>0&&<span className="nav-live-count">{liveChannels.length}</span>}</button>)}<button aria-label="Downloads" className={route.name==='downloads'?'selected':''} onClick={()=>go({name:'downloads'})}><Download size={19}/><span>Downloads</span></button></nav></div>
 <div className="sidebar-section"><nav aria-label="Manage PureTube">{nav.filter(item=>["subscriptions","settings"].includes(item.id)).map(({id,name,Icon})=><button title={name} className={navActive===id?'selected':''} aria-current={navActive===id?'page':undefined} aria-label={name} key={id} onClick={()=>go({name:id})}><Icon size={19}/><span>{name}</span>{id==='live'&&liveChannels.length>0&&<span className="nav-live-count">{liveChannels.length}</span>}</button>)}</nav></div>
 {!s.collapsed&&followIds.length>0&&<nav className="sidebar-follows" aria-label="Followed creators"><p>Following</p>{sidebarFollows.slice(0,5).map(id=>{const name=feeds.states[id]?.feed?.title??id;const broadcast=followedLive.states[id];const liveNow=broadcast?.video&&!broadcast.error;return <button key={id} title={liveNow?name+' — live now':name} onClick={()=>go({name:'channel',id})}><CreatorAvatar id={id} name={name}/><span className="follow-name">{name}</span>{liveNow&&<span className="sidebar-live">LIVE</span>}</button>})}{followIds.length>5&&<button onClick={()=>go({name:'subscriptions'})}><span>Show all follows</span></button>}</nav>}
 <div className="sidebar-footer">{s.showTime&&<p title="Playback time since PureTube opened" data-session-seconds={Math.floor(session)}><Clock3 size={16}/><span>{clock(session)} this session</span></p>}
 <span className="sidebar-flourish" aria-hidden="true">✧</span></div></aside>}
 <main ref={main} className="content" id="main-content">
 {(route.name==='channel'||route.name==='watch')&&!focus&&<button className="back" onClick={back}><ArrowLeft size={16}/> Back</button>}
 {(error||notice)&&<Notice text={error||notice}/>}
 {reminder&&<div className="notice row" role="status"><div className="grow">{reminder}</div><button className="icon small" aria-label="Dismiss reminder" onClick={()=>setReminder('')}><X size={15}/></button></div>}
 {liveAlerts.alerts.map(({id,title})=><div className="notice row wrap" role="status" key={id}><div className="grow"><strong>Now live:</strong> {title}</div><button className="button accent" onClick={()=>{liveAlerts.dismiss(id);go({name:'watch',video:{...linkVideo(id),title,live:true}})}}>Watch live</button><button className="icon small" aria-label="Dismiss live reminder" onClick={()=>liveAlerts.dismiss(id)}><X size={15}/></button></div>)}
 {failed?<Empty title="Could not load your local library" detail="Restart PureTube after checking your Windows app data permissions."/>:!ready?<Loading/>:
 route.name==='home'?<RecommendationFeed shared={shared} surface="home"/>:
 route.name==='discover'?<Discover shared={shared}/>:
 route.name==='following'?<Quiet shared={shared}/>:
 route.name==='live'?<SearchPage key="live" shared={shared} query="lofi radio" liveOnly liveQuery={route.query} mode={route.mode} onLiveQuery={query=>setRoute({...route,query})} onMode={mode=>setRoute({...route,mode})}/>:
 route.name==='search'?<SearchPage key={route.query} shared={shared} query={route.query} selectedSource={route.source} onSourceChange={source=>setRoute({...route,source})}/>:
 route.name==='profile'?<Profile shared={shared} following={()=>go({name:'following'})} later={()=>go({name:'later'})} library={()=>go({name:'library'})}/>:
 route.name==='downloads'?<DownloadsPage/>:
 route.name==='settings'?<><Heading label="PREFERENCES" title="Settings" detail="Make PureTube work the way you want."/><Preferences data={data} setting={setting} change={change} updates={updates}/></>:
 route.name==='subscriptions'?<Subscriptions shared={shared}/>:
 route.name==='channel'?<ChannelPage key={route.id} shared={shared} id={route.id} tab={route.tab} setTab={tab=>setRoute({...route,tab})}/>:
 route.name==='watch'?<Watch key={route.video.id} video={route.video} shared={shared} focus={focus} theater={theater} setFocus={setFocus} setTheater={setTheater} onSample={noteSample} onElapsed={seconds=>setSession(s=>s+seconds)} popped={floating?.video.id===route.video.id} returned={returned?.id===route.video.id?returned.start:undefined} onPopout={async(video,start)=>{await invoke('open_player',{payload:{video,start,theme:s.theme,accent:s.accent,autoplay:s.autoplay}});setFloating({video,start})}}/>:<LibraryPage key={route.name} shared={shared} kind={route.name}/>}
 {!focus&&route.name!=='settings'&&<footer className="attribution"><button aria-label="Developed with YouTube; open YouTube" onClick={()=>invoke('open_info',{page:'youtube'}).catch(e=>setNotice(errorText(e)))}><img src={s.theme==='dark'?new URL('./youtube-light.png',import.meta.url).href:new URL('./youtube-dark.png',import.meta.url).href} alt="Developed with YouTube"/></button></footer>}
 </main></div>
}

function Watch({video:v,shared,focus,theater,setFocus,setTheater,onSample,onElapsed,popped,returned,onPopout}:{video:Video;shared:Shared;focus:boolean;theater:boolean;setFocus:(v:boolean)=>void;setTheater:(v:boolean)=>void;onSample:(id:string,p:number,d:number,t:number,live?:boolean)=>void;onElapsed:(seconds:number)=>void;popped:boolean;returned?:number;onPopout:(video:Video,start:number)=>Promise<void>}) {
 const {data,change,follow,channel}=shared
 const [collection,setCollection]=useState('')
 const [share,setShare]=useState(false)
 const [shareStatus,setShareStatus]=useState('')
 const [ended,setEnded]=useState(false),[popoutError,setPopoutError]=useState('')
 const playerPosition=useRef<()=>number>(()=>0)
 const status=useScheduledStatus(v.id,v.scheduledAt)
 const checked=useWatchCreator(v.id,true)
 const uploader=checked.creator
 const creatorVideo=uploader?{...v,channelId:uploader.id,channel:uploader.name,date:v.date||uploader.date,title:v.title==='YouTube video'?uploader.title||v.title:v.title}:v
 const live=uploader?uploader.live:!!v.live||status==='live'
 const next=useUpNext(creatorVideo,data,Object.values(shared.feeds.states).flatMap(s=>s.feed?.videos??[]).filter(v=>!Object.values(shared.live.states).some(s=>!s.error&&s.video?.id===v.id)))
 const waiting=!!v.scheduledAt&&status==='waiting'&&!v.live
 const shareUrl='https://www.youtube.com/watch?v='+v.id
 async function copyLink(){
   try{await navigator.clipboard.writeText(shareUrl);setShare(false);setShareStatus('Link copied.')}
   catch{setShareStatus('Couldn’t copy automatically. Select the link and copy it.')}
 }
 if(!visible(creatorVideo,data.settings))return <Empty title="Video hidden" detail="This video matches one of your content filters."/>
 const later=data.later.includes(v.id),fav=data.favorites.includes(v.id)
 const progress=data.settings.progress?data.progress[v.id]:undefined
 const start=returned??(progress&&progress.at<progress.duration-5?progress.at:0)
 return <div className={'watch '+(live&&!focus?'with-live-chat ':'')+(theater?'theater':'')}>
 <div className="watch-media-layout"><div className="watch-media">
 {popped?<div className="popped-placeholder"><PictureInPicture2 size={36}/><p>Playing in your mini player</p><button className="button" onClick={()=>void invoke('close_player')}>Bring back here</button></div>:waiting?<div className="scheduled-watch">{v.image&&<img src={v.image} alt=""/>}<ScheduledDetails video={v} data={data} change={change}/></div>:
 (uploader?.embeddable??v.embeddable)?<PlayerFrame id={v.id} live={live} start={live||checked.loading?0:start} onController={getter=>{playerPosition.current=getter}} onEnded={()=>setEnded(true)} onElapsed={onElapsed} onSample={(p,d,t)=>onSample(v.id,p,d,t,live)} onPlay={()=>{if(data.settings.history)change(d=>{const topic=categoryFor(v);return {...d,history:{...d.history,[v.id]:Date.now()},interests:topic?{...d.interests,[topic]:(d.interests[topic]??0)+1}:d.interests}})}}/>:<Notice text="YouTube does not allow this video to be embedded."/>}
 </div>{live&&!focus&&<LiveChat key={v.id} id={v.id}/>}</div>
 {!focus&&<><div className="row wrap watch-actions">
 <button className="button" onClick={()=>setFocus(true)}><Maximize size={16}/> Focus Player</button>
 <button className="button" aria-pressed={theater} onClick={()=>setTheater(!theater)}>{theater?'Exit theater':'Theater mode'}</button>
 <button className="button" aria-expanded={share} onClick={()=>{setShare(!share);setShareStatus('')}}><Share2 size={16}/> Share</button>
 <button className="button" disabled={popped||waiting} onClick={()=>void onPopout({...creatorVideo,live},live?0:playerPosition.current()).catch(e=>setPopoutError(errorText(e)))}><PictureInPicture2 size={16}/> Pop out</button>
 <DownloadButton video={creatorVideo} disabled={live||waiting}/>
 </div>
 {popoutError&&<Notice text={popoutError}/>}
 {share&&<div className="row wrap share-panel" onKeyDown={e=>{if(e.key==='Escape')setShare(false)}}><label>Video link <input readOnly value={shareUrl} onFocus={e=>e.currentTarget.select()}/></label><button className="button accent" onClick={()=>void copyLink()}>Copy link</button><button className="icon" aria-label="Close share" onClick={()=>setShare(false)}><X size={16}/></button></div>}
 {shareStatus&&<p className="meta" role="status">{shareStatus}</p>}
 <h1>{creatorVideo.title}</h1>
 <div className="row wrap channel-meta">{creatorVideo.channelId&&<CreatorAvatar id={creatorVideo.channelId} name={creatorVideo.channel} src={creatorVideo.creators?.[0]?.image||creatorVideo.channelImage}/>}
 <CreatorByline video={creatorVideo} onChannel={channel}/>
 {creatorVideo.channelId&&<button className="button" onClick={()=>follow(creatorVideo.channelId)}>{data.follows.includes(creatorVideo.channelId)?'Unfollow':'Follow'}</button>}
 <button className="button" aria-pressed={later} onClick={()=>change(d=>({...d,later:toggled(d.later,v.id)}))}><Clock3 size={16}/> {later?'Saved for later':'Watch Later'}</button>
 <button className="button" aria-pressed={fav} onClick={()=>change(d=>({...d,favorites:toggled(d.favorites,v.id)}))}><Heart size={16}/> {fav?'Favorited':'Favorite'}</button></div>
 {(creatorVideo.date||v.publishedLabel)&&<p className="meta">{day(creatorVideo.date)||v.publishedLabel}</p>}
 {data.collections.length>0&&<form className="row watch-actions" onSubmit={e=>{e.preventDefault();if(collection==='')return;change(d=>({...d,collections:d.collections.map((c,i)=>i===Number(collection)?{...c,ids:[...new Set([v.id,...c.ids])]}:c)}));setCollection('')}}><select aria-label="Collection" value={collection} onChange={e=>setCollection(e.target.value)}><option value="">Select a collection</option>{data.collections.map((c,i)=><option value={i} key={i}>{c.name}{c.ids.includes(v.id)?' (saved)':''}</option>)}</select><button disabled={collection===''} className="button">Add to collection</button></form>}
 {v.description&&<details><summary>Video description</summary><p className="description">{v.description}</p></details>}
 <p className="meta">Played by YouTube. The embedded player may show ads or related videos.</p></>}
 {!live&&!waiting&&!popped&&<UpNext videos={next} autoplay={data.settings.autoplay} ended={ended} onToggle={()=>change(d=>({...d,settings:{...d.settings,autoplay:!d.settings.autoplay}}))} onWatch={shared.watch}/>}
 </div>
}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('mini')?<MiniPlayer/>:<App/>)
