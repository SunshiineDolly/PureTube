import {createRoot} from 'react-dom/client'
import {useEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {ArrowLeft, ArrowUpRight, Bookmark, Clock3, History, House, Maximize, Minimize, Moon, PanelLeftClose, PanelLeftOpen, Play, Link2, Settings as Gear, Sun, Users, X, Heart} from 'lucide-react'
import {Avatar,clock,Empty,Loading} from './components'
import {Preferences} from './settings'
import {Heading,Quiet,Subscriptions,ChannelPage,LibraryPage,Notice,type Shared} from './screens'
import {PlayerFrame} from './player'
import {useLibrary} from './hooks'
import {channelId,errorText,visible,type Video} from './domain'
import {linkVideo,parseVideo,usePublicFeeds} from './public-feeds'
import {toggled} from './library'
import './styles.css'

type Name='home'|'subscriptions'|'library'|'later'|'history'|'settings'
type Route={name:Name}|{name:'channel';id:string}|{name:'watch';video:Video}
const nav = [{id:'home',name:'Home',Icon:House},{id:'subscriptions',name:'Subscriptions',Icon:Users},{id:'library',name:'Library',Icon:Bookmark},{id:'later',name:'Watch Later',Icon:Clock3},{id:'history',name:'History',Icon:History},{id:'settings',name:'Settings',Icon:Gear}] as const
const localDate=()=>new Date().toLocaleDateString('en-CA')
function App() {
 const {data,ready,failed,error,change,setting}=useLibrary(), s=data.settings
 const [route,setRoute]=useState<Route>({name:'home'}), routes=useRef<Route[]>([])
 const [notice,setNotice]=useState(''),[reminder,setReminder]=useState('')
 const [text,setText]=useState('')
 const [focus,setFocus]=useState(false),[theater,setTheater]=useState(false),[session,setSession]=useState(0)
 const searchRef=useRef<HTMLInputElement>(null),main=useRef<HTMLElement>(null),dataRef=useRef(data)
 dataRef.current=data
 const feeds=usePublicFeeds(ready?data.follows.filter(id=>!s.blocked.includes(id)):[])
 useEffect(()=>{document.documentElement.dataset.theme=s.theme;document.documentElement.dataset.accent=s.accent},[s.theme,s.accent])
 useEffect(()=>{
   const key=(e:KeyboardEvent)=>{
     if(e.key==='Escape'&&focus){setFocus(false);return}
     if(e.key.toLowerCase()==='k'&&e.ctrlKey){e.preventDefault();searchRef.current?.focus()}
   }
   window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
 },[focus])
 function go(next:Route) {routes.current.push(route);setRoute(next);setNotice('');setFocus(next.name==='watch'&&s.focus);setTheater(false);main.current?.scrollTo(0,0)}
 function back() {setRoute(routes.current.pop()??{name:'home'});setFocus(false);setTheater(false);setNotice('');main.current?.scrollTo(0,0)}
 function submit() {
   const term=text.trim()
   if(!term)return
   const link=parseVideo(term)
   if(link?.shorts){setNotice('Shorts links are hidden in PureTube.');return}
   if(!link){setNotice('Paste a valid YouTube video link.');return}
   const v=Object.values(feeds.states).flatMap(state=>state.feed?.videos??[]).find(v=>v.id===link.id)??linkVideo(link.id)
   if(!visible(v,s))setNotice('This video is hidden by your filters.')
   else go({name:'watch',video:v})
 }
 const shared:Shared={data,change,feeds,watch:v=>go({name:'watch',video:v}),channel:id=>go({name:'channel',id}),follow:id=>{if(channelId(id))change(d=>({...d,follows:toggled(d.follows,id)}))},subscriptions:()=>go({name:'subscriptions'})}
 const noteSample=(id:string,position:number,duration:number,elapsed:number)=>{
   if(!Number.isFinite(position)||!Number.isFinite(duration)||duration<=0||!Number.isFinite(elapsed))return
   const settings=dataRef.current.settings
   if(elapsed>0)setSession(v=>v+elapsed)
   if(!settings.progress && !settings.reminder)return
   const today=localDate()
   const old=dataRef.current.daily.date===today?dataRef.current.daily.seconds:0
   if(settings.reminder && old<settings.reminder*60 && old+elapsed>=settings.reminder*60)setReminder('You’ve reached your daily viewing reminder. Take a break whenever you’re ready.')
   change(d=>{
     const nextProgress=settings.progress?{...d.progress,[id]:{at:Math.min(duration,Math.max(0,position)),duration,updated:Date.now()}}:d.progress
     return {...d,progress:nextProgress,daily:settings.reminder?{date:today,seconds:(d.daily.date===today?d.daily.seconds:0)+elapsed}:d.daily}
   })
 }
 const navActive=route.name
 return <div className={'app '+(s.collapsed?'collapsed ':'')+(focus?'focus ':'')+(s.density==='compact'?'compact':'')}>
 <header className="top"><button className="brand" aria-label="PureTube Home" onClick={()=>go({name:'home'})}><span className="brand-mark"><Play size={15} fill="currentColor"/></span> PureTube</button>
 {focus?<div className="focus-bar"><span>Focus Player</span><button className="button" onClick={()=>setFocus(false)}><Minimize size={16}/> Exit focus</button></div>:
 <><form className="searchbar" onSubmit={e=>{e.preventDefault();submit()}}><Link2 size={18}/><input disabled={!ready} ref={searchRef} value={text} onChange={e=>setText(e.target.value)} maxLength={256} placeholder="Paste a YouTube video link" aria-label="YouTube video link"/>{text&&<button type="button" className="icon small" aria-label="Clear video link" onClick={()=>{setText('')}}><X size={15}/></button>}<kbd>Ctrl K</kbd></form>
 <button className="icon theme" aria-label={'Switch to '+(s.theme==='dark'?'light':'dark')+' theme'} disabled={!ready} onClick={()=>setting('theme',s.theme==='dark'?'light':'dark')}>{s.theme==='dark'?<Sun size={19}/>:<Moon size={19}/>}</button>
 <button className="icon top-settings" aria-label="Settings" onClick={()=>go({name:'settings'})}><Gear size={19}/></button></>}
 </header>
 {!focus&&<aside className="sidebar"><p className="sidebar-label">WORKSPACE</p><nav aria-label="Main navigation">{nav.map(({id,name,Icon})=><button title={name} className={navActive===id?'selected':''} aria-current={navActive===id?'page':undefined} aria-label={name} key={id} onClick={()=>go({name:id})}><Icon size={19}/><span>{name}</span></button>)}</nav>
 <div className="sidebar-footer">{s.showTime&&<p title={'Session viewing time '+clock(session)}><Clock3 size={16}/><span>{clock(session)} this session</span></p>}
 <button className="icon" title={s.collapsed?'Expand sidebar':'Collapse sidebar'} aria-label={s.collapsed?'Expand sidebar':'Collapse sidebar'} disabled={!ready} onClick={()=>setting('collapsed',!s.collapsed)}>{s.collapsed?<PanelLeftOpen size={19}/>:<PanelLeftClose size={19}/>}</button></div></aside>}
 <main ref={main} className="content" id="main-content">
 {(route.name==='channel'||route.name==='watch')&&!focus&&<button className="back" onClick={back}><ArrowLeft size={16}/> Back</button>}
 {(error||notice)&&<Notice text={error||notice}/>}
 {reminder&&<div className="notice row" role="status"><div className="grow">{reminder}</div><button className="icon small" aria-label="Dismiss reminder" onClick={()=>setReminder('')}><X size={15}/></button></div>}
 {failed?<Empty title="Could not load your local library" detail="Restart PureTube after checking your Windows app data permissions."/>:!ready?<Loading/>:
 route.name==='home'?<Quiet shared={shared}/>:
 route.name==='settings'?<><Heading label="PREFERENCES" title="Settings" detail="Make PureTube work the way you want."/><Preferences data={data} setting={setting} change={change}/></>:
 route.name==='subscriptions'?<Subscriptions shared={shared}/>:
 route.name==='channel'?<ChannelPage key={route.id} shared={shared} id={route.id}/>:
 route.name==='watch'?<Watch key={route.video.id} video={route.video} shared={shared} focus={focus} theater={theater} setFocus={setFocus} setTheater={setTheater} onSample={noteSample}/>:<LibraryPage key={route.name} shared={shared} kind={route.name}/>}
 {!focus&&route.name!=='settings'&&<footer className="attribution"><button aria-label="Developed with YouTube; open YouTube" onClick={()=>invoke('open_info',{page:'youtube'}).catch(e=>setNotice(errorText(e)))}><img src={s.theme==='dark'?new URL('./youtube-light.png',import.meta.url).href:new URL('./youtube-dark.png',import.meta.url).href} alt="Developed with YouTube"/></button></footer>}
 </main></div>
}

function Watch({video:v,shared,focus,theater,setFocus,setTheater,onSample}:{video:Video;shared:Shared;focus:boolean;theater:boolean;setFocus:(v:boolean)=>void;setTheater:(v:boolean)=>void;onSample:(id:string,p:number,d:number,t:number)=>void}) {
 const {data,change,follow,channel}=shared
 const [error,setError]=useState(''),[collection,setCollection]=useState('')
 if(!visible(v,data.settings))return <Empty title="Video hidden" detail="This video matches one of your content filters."/>
 const later=data.later.includes(v.id),fav=data.favorites.includes(v.id)
 const progress=data.settings.progress?data.progress[v.id]:undefined
 const start=progress&&progress.at<progress.duration-5?progress.at:0
 return <div className={'watch '+(theater?'theater':'')}>
 {v.embeddable?<PlayerFrame id={v.id} start={start} onSample={(p,d,t)=>onSample(v.id,p,d,t)} onPlay={()=>{if(data.settings.history)change(d=>({...d,history:{...d.history,[v.id]:Date.now()}}))}}/>:<Notice text="YouTube does not allow this video to be embedded."/>}
 {error&&<Notice text={error}/>}
 {!focus&&<><div className="row wrap watch-actions">
 <button className="button" onClick={()=>setFocus(true)}><Maximize size={16}/> Focus Player</button>
 <button className="button" aria-pressed={theater} onClick={()=>setTheater(!theater)}>{theater?'Exit theater':'Theater mode'}</button>
 <button className="button" onClick={()=>invoke('open_video',{id:v.id}).catch(e=>setError(errorText(e)))}>Open on YouTube <ArrowUpRight size={15}/></button></div>
 <h1>{v.title}</h1>
 {!v.channelId&&<p className="meta">This link was opened directly. PureTube could not check its channel or keywords because no feed metadata is available.</p>}
 <div className="row wrap channel-meta">{v.channelId&&<><Avatar src=""/><button className="video-title" onClick={()=>channel(v.channelId)}>{v.channel}</button><button className="button accent" onClick={()=>follow(v.channelId)}>{data.follows.includes(v.channelId)?'Unfollow':'Follow'}</button></>}
 <button className="button" aria-pressed={later} onClick={()=>change(d=>({...d,later:toggled(d.later,v.id)}))}><Clock3 size={16}/> {later?'Saved for later':'Watch Later'}</button>
 <button className="button" aria-pressed={fav} onClick={()=>change(d=>({...d,favorites:toggled(d.favorites,v.id)}))}><Heart size={16}/> {fav?'Favorited':'Favorite'}</button></div>
 {data.collections.length>0&&<form className="row watch-actions" onSubmit={e=>{e.preventDefault();if(collection==='')return;change(d=>({...d,collections:d.collections.map((c,i)=>i===Number(collection)?{...c,ids:[...new Set([v.id,...c.ids])]}:c)}));setCollection('')}}><select aria-label="Collection" value={collection} onChange={e=>setCollection(e.target.value)}><option value="">Select a collection</option>{data.collections.map((c,i)=><option value={i} key={i}>{c.name}{c.ids.includes(v.id)?' (saved)':''}</option>)}</select><button disabled={collection===''} className="button">Add to collection</button></form>}
 {v.description&&<details><summary>Video description</summary><p className="description">{v.description}</p></details>}
 <p className="meta">Played by YouTube. The embedded player may show ads or related videos.</p></>}
 {focus&&!v.embeddable&&<button className="button" onClick={()=>invoke('open_video',{id:v.id}).catch(e=>setError(errorText(e)))}>Open on YouTube <ArrowUpRight size={15}/></button>}
 </div>
}
createRoot(document.getElementById('root')!).render(<App/>)
