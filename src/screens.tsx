import {useEffect,useRef,useState} from 'react'
import {Plus, RefreshCw,ListPlus,Bookmark,X} from 'lucide-react'
import {AutoMore,Empty,Loading,VideoGrid} from './components'
import {errorText,fillCreator,publicNewest,unique,uploadAge,videoId,visible,type Video} from './domain'
import {useFollowingPages} from './following'
import {useSavedVideos} from './saved-videos'
import {rememberVideo,toggled,type Library} from './library'
import {useResource} from './hooks'
import {linkVideo,parseChannel,publicFeed,REFRESH_MINUTES,type PublicFeeds} from './public-feeds'
import {selectUploads} from './feed'
import {useChannelCatalog} from './catalog'
import {CreatorAvatar} from './creator-avatar'
import {invoke} from '@tauri-apps/api/core'
import {FollowedLiveShelf,useFollowedLive,type FollowedLive} from './followed-live'
import {RandomWatch} from './random-watch-button'
import {useFilteredVideos} from './filtered-videos'

export type Shared = {data:Library;change:(fn:(d:Library)=>Library)=>void;playNext:(v:Video)=>void;enqueue:(v:Video)=>void;playPlaylist:(name:string,ids:string[],index?:number,first?:Video)=>void;watch:(v:Video)=>void;channel:(id:string)=>void;follow:(id:string)=>void;subscriptions:()=>void;discover:()=>void;feeds:PublicFeeds;followIds:string[];live:FollowedLive}
export function Grid({shared,items,isNew=false,extra}:{shared:Shared;items:Video[];isNew?:boolean;extra?:(v:Video)=>React.ReactNode}) {
 const {data,change,watch,channel}=shared
 const viewport=useRef<HTMLDivElement>(null)
 const matches=useFilteredVideos(items,data.settings,viewport)
 return <VideoGrid gridRef={viewport} onQueue={shared.enqueue} items={matches} extra={extra} onWatch={watch} onChannel={channel} progress={data.settings.progress?data.progress:undefined} later={data.later} checked={isNew?data.checked:undefined} onSave={id=>change(d=>{const video=matches.find(v=>v.id===id);return {...(video?rememberVideo(d,video):d),later:toggled(d.later,id)}})}/>
}
export function Heading({label,title,detail,children}:{label:string;title:string;detail:string;children?:React.ReactNode}) {
 return <div className="heading"><div>{label&&<p className="eyebrow">{label}</p>}<h1>{title}</h1>{detail&&<p>{detail}</p>}</div>{children&&<div className="heading-actions">{children}</div>}</div>
}
export function Notice({text}:{text:string}) {return <p className="notice" role="status">{text}</p>}

export function Quiet({shared}:{shared:Shared}) {
 const {data,change,feeds}=shared
 const [filter,setFilter]=useState(''),[days,setDays]=useState(0),[sort,setSort]=useState('new'),[limit,setLimit]=useState(24)
 const allowed=shared.followIds.filter(id=>!data.settings.blocked.includes(id))
 const selected=allowed.includes(filter)?filter:''
 const ids=selected?[selected]:allowed
 const archive=useFollowingPages(ids)
 const states=ids.flatMap(id=>feeds.states[id]?[feeds.states[id]]:[])
 const liveIds=new Set(Object.values(shared.live.states).flatMap(s=>s.video?[s.video.id]:[]))
 const items=unique([...archive.items.map(v=>fillCreator(v,feeds.states[v.channelId]?.feed?.title??v.channel)),...states.flatMap(s=>s.feed?.videos??[])]).filter(v=>ids.includes(v.channelId)&&!v.live&&!v.scheduledAt&&!liveIds.has(v.id)&&visible(v,data.settings)&&(days===0||uploadAge(v)<=days*86400)).sort((a,b)=>sort==='old'?publicNewest(b,a):publicNewest(a,b))
 const checks=states.flatMap(s=>s.error||!s.feed?[]:[s.feed.checkedAt])
 const failed=states.filter(s=>s.error)
 const stale=failed.some(s=>s.feed)
 return <><FollowedLiveShelf shared={shared}/><Heading label="" title="Following" detail={'Recent uploads from followed creators. Checks every '+REFRESH_MINUTES+' minutes while Viddy is open.'}>
 <RandomWatch items={items} shared={shared} surface="following"/>
 <button className="button" onClick={shared.subscriptions}><Plus size={16}/> Follow a channel</button>
 {allowed.length>0&&<button className="button" disabled={feeds.busy} onClick={()=>{
   change(d=>({...d,checked:{...d.checked,...Object.fromEntries(allowed.flatMap(id=>{const at=feeds.states[id]?.feed?.checkedAt;return at?[[id,new Date(at).toISOString()]]:[]}))}}))
   archive.reset();feeds.refresh()
   shared.live.refresh()
 }}><RefreshCw size={16} className={feeds.busy?'spin':undefined}/> Refresh</button>}</Heading>
 {!shared.followIds.length?<Notice text={'Add channels to build your personal feed. Your follows stay on this PC.'}/>:!allowed.length?<Empty title="No visible subscriptions" detail="Unblock a followed channel in Settings or add another channel."/>:
 <><div className="filter-row">
 <label>Channel <select value={selected} onChange={e=>{setFilter(e.target.value);setLimit(24)}}><option value="">All channels</option>{allowed.map(id=><option value={id} key={id}>{feeds.states[id]?.feed?.title??id}</option>)}</select></label>
 <label>Uploaded <select value={days} onChange={e=>{setDays(Number(e.target.value));setLimit(24)}}><option value={0}>All uploads</option><option value={1}>Past 24 hours</option><option value={7}>Past week</option><option value={30}>Past month</option></select></label>
 <label>Sort <select value={sort} onChange={e=>{setSort(e.target.value);setLimit(24)}}><option value="new">Newest first</option><option value="old">Oldest first</option></select></label>
 <span className="meta" role="status">{feeds.busy?'Checking for uploads...':checks.length?'Checked '+new Date(Math.max(...checks)).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):''}</span></div>
 {failed.length>0&&<Notice text={failed.length===1?failed[0].error+(stale?' Showing its last successful feed.':''):failed.length+' channels could not be refreshed.'+(stale?' Showing the last successful uploads where available.':'')}/>}
 {items.length?<Grid shared={shared} isNew items={items.slice(0,limit)}/>:feeds.busy?<Loading/>:<Empty title={failed.length===ids.length?'Feed unavailable':'No matching recent uploads'} detail={failed.length===ids.length?'Try Refresh when YouTube is reachable.':'Try a wider date range or change your content filters.'}/>}
 <AutoMore enabled={items.length>limit||archive.hasMore} revision={limit} busy={archive.busy} error={archive.error} onReach={()=>{if(items.length>limit)setLimit(n=>n+24);else void archive.more().then(()=>setLimit(n=>n+24))}}/></>}
 </>
}

export function Subscriptions({shared}:{shared:Shared}) {
 const {data,channel,follow,feeds}=shared
 type Match={id:string;name:string;handle?:string;image?:string}
 const [lookup,setLookup]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0)
 const [search,setSearch]=useState<{term:string;items:Match[];error?:string}>()
 const term=lookup.trim(),direct=parseChannel(term)
 const ids=shared.followIds.filter(id=>!data.settings.blocked.includes(id))
 useEffect(()=>{
   if(term.length<2||direct)return
   let active=true
   const timer=setTimeout(()=>{
     void invoke<Match[]>('search_creators',{query:term}).then(
       items=>{if(active)setSearch({term,items})},
       e=>{if(active)setSearch({term,items:[],error:errorText(e)})},
     )
   },350)
   return()=>{active=false;clearTimeout(timer)}
 },[term,direct,retry])
 async function add(id=direct,verified=false) {
   if(!id)return
   setBusy(true);setError('')
   try{
     if(data.settings.blocked.includes(id))throw new Error('Unblock this channel in Settings before following.')
     if(!data.follows.includes(id)){if(!verified)await publicFeed(id);follow(id)}
     if(!verified)setLookup('')
   }catch(e){setError(errorText(e))}finally{setBusy(false)}
 }
 const searching=term.length>=2&&!direct
 return <><Heading label="YOUR CREATORS" title="Manage channels" detail="Find creators by name or handle, then follow them to build your feed."/>
 <form className="filter-row channel-search-form" onSubmit={e=>{e.preventDefault();if(direct)void add();else{setSearch(undefined);setRetry(n=>n+1)}}}>
   <input aria-label="Find channels to follow" placeholder="Channel name, @handle, ID or link" maxLength={256} autoComplete="off" value={lookup} onChange={e=>{setLookup(e.target.value);setError('')}}/>
   <button className="button" disabled={busy||term.length<2}>{direct?<Plus size={16}/>:null}{busy?'Checking…':direct?'Follow':'Search'}</button>
 </form>
 {error&&<Notice text={error}/>}
 {searching&&<section className="channel-search-results" aria-label="Channel search results" aria-busy={search?.term!==term}>
   <h2>Matching channels</h2>
   {search?.term!==term?<p className="meta" role="status">Finding channels…</p>:search.error?<><Notice text={search.error}/><button className="button" onClick={()=>{setSearch(undefined);setRetry(n=>n+1)}}>Try again</button></>:search.items.length?<div className="list">{search.items.map(ch=>{
     const followed=data.follows.includes(ch.id),blocked=data.settings.blocked.includes(ch.id)
     return <div className="list-row" key={ch.id}><CreatorAvatar id={ch.id} name={ch.name} src={ch.image}/><div className="grow"><button className="video-title" onClick={()=>channel(ch.id)}>{ch.name}</button><div className="meta">{ch.handle||ch.id}</div></div><button className="button" disabled={busy||followed||blocked} aria-label={(followed?'Following ':blocked?'Blocked ':'Follow ')+ch.name} onClick={()=>void add(ch.id,true)}>{followed?'Following':blocked?'Blocked':'Follow'}</button></div>
   })}</div>:<p className="meta" role="status">No matching channels. Try another name or @handle.</p>}
 </section>}
 {!ids.length?<Empty title="No visible subscriptions" detail="Search for a channel name or @handle above, or paste a channel ID or link."/>:
 <div className="list">{ids.map(id=>{
   const c=feeds.states[id]?.feed
   return <div className="list-row" key={id}><CreatorAvatar id={id} name={c?.title??id}/><div className="grow"><button className="video-title" onClick={()=>channel(id)}>{c?.title??id}</button><div className="meta">{c?'Last checked '+new Date(c.checkedAt).toLocaleString():feeds.states[id]?.error??'Waiting for first check'}</div></div><button className="button" onClick={()=>follow(id)}>{'Unfollow'}</button></div>
 })}</div>}
 </>
}

export type ChannelTab='home'|'videos'|'streams'|'about'
export function ChannelPage({shared,id,tab='home',setTab}:{shared:Shared;id:string;tab?:ChannelTab;setTab:(tab:ChannelTab)=>void}) {
 const {data,feeds,follow}=shared
 const [limit,setLimit]=useState(18)
 const stored=feeds.states[id]
 const blocked=data.settings.blocked.includes(id)
 const direct=useResource(()=>stored||blocked?Promise.resolve(undefined):publicFeed(id),JSON.stringify([id,!!stored,blocked]))
 const feed=stored?.feed??direct.value
 type CreatorProfile={title:string;description:string;photo:string;banner:string;details:string[];shelves:{title:string;videos:Video[]}[]}
 const profile=useResource(()=>blocked?Promise.resolve(undefined):invoke<CreatorProfile>('channel_profile',{id}),JSON.stringify([id,blocked]))
 const creator=profile.value
 const publicTab=useChannelCatalog(id,tab,!blocked&&(tab==='videos'||tab==='streams'))
 const channelLive=useFollowedLive(!blocked&&!shared.followIds.includes(id)?[id]:[])
 const liveCheck=shared.followIds.includes(id)?shared.live.states[id]:channelLive.states[id]
 const broadcast=liveCheck?.video&&!liveCheck.error&&visible(liveCheck.video,data.settings)?liveCheck.video:undefined
 if(blocked)return <Empty title="Channel blocked" detail="Manage blocked channels in Settings."/>
 const title=creator?.title??feed?.title??'Channel'
 const items=publicTab.items?.map(v=>v.channelId===id?fillCreator(v,title,creator?.photo):v).filter(v=>v.id!==broadcast?.id&&!v.live&&visible(v,data.settings)).sort(publicNewest)
 const shelves=creator?.shelves.map(s=>({...s,videos:s.videos.filter(v=>v.id!==broadcast?.id&&visible(v,data.settings))})).filter(s=>s.videos.length>0)??[]
 const issue=publicTab.error
 return <section className="creator-page">
 <header className="creator-header">
   {creator?.banner&&<img className="creator-banner" src={creator.banner} alt=""/>}
   <div className={'creator-identity '+(broadcast?'creator-is-live':'')}><CreatorAvatar id={id} name={title} src={creator?.photo}/>
     <div className="grow"><h1>{title} {broadcast&&<span className="creator-live-label">LIVE NOW</span>}</h1>{!!creator?.details.length&&<p className="creator-details">{creator.details.join('  ·  ')}</p>}
     {creator?.description&&<button className="creator-bio" onClick={()=>setTab('about')}>{creator.description.split('\n')[0]} <strong>More</strong></button>}</div>
     <button className="button accent" onClick={()=>follow(id)}>{data.follows.includes(id)?'Unfollow':'Follow'}</button>
   </div>
 </header>
 {broadcast&&<section className="creator-broadcast" aria-label="This creator is live">
   <button className="thumbnail" aria-label={'Watch live: '+title} onClick={()=>shared.watch(broadcast)}>
     <img src={broadcast.image} alt=""/><span className="live-badge">LIVE NOW</span>
   </button>
   <div><p className="on-air"><i/> Streaming now</p><h2>{broadcast.title}</h2><p>Watch the live broadcast with chat in Viddy.</p>
   <button className="button accent" onClick={()=>shared.watch(broadcast)}>Watch live</button></div>
 </section>}
 <div className="creator-tabs" aria-label="Channel tabs">{([['home','Home'],['videos','Videos'],['streams','Past streams'],['about','About']] as const).map(([value,label])=><button aria-pressed={tab===value} key={value} onClick={()=>setTab(value)}>{label}</button>)}</div>
 {tab==='home'?(shelves.length?shelves.map(({title,videos},i)=><section className="studio-shelf" key={i}><h2>{title}</h2><Grid shared={shared} items={videos}/></section>):
   !creator&&!profile.error?<Loading/>:feed?.videos.length?<section className="studio-shelf"><h2>Recent uploads</h2><Grid shared={shared} items={feed.videos.filter(v=>!v.live).slice(0,limit)}/><AutoMore enabled={feed.videos.length>limit} revision={limit} onReach={()=>setLimit(n=>n+18)}/></section>:
   <Empty title="No featured videos" detail="Select Videos to see this creator’s public uploads."/>):
 tab==='about'?<div className="creator-about"><h2>About {title}</h2>{creator?.description?<p>{creator.description}</p>:<p>{profile.error??'No public description.'}</p>}</div>:
 <>{issue&&<><Notice text={issue}/><button className="button" onClick={publicTab.reload}>Try again</button></>}
 {items?.length?<Grid shared={shared} items={items}/>:!items&&!issue?<Loading/>:!issue&&!publicTab.hasMore?<Empty title="No public videos to show" detail="Try another channel tab or check your content filters."/>:null}
 <AutoMore enabled={publicTab.hasMore} revision={publicTab.cursor} busy={publicTab.loadingMore} error={publicTab.moreError} onReach={publicTab.more}/></>}
 </section>
}
export function LibraryPage({shared,kind}:{shared:Shared;kind:'library'|'later'|'history'}) {
 const {data,change,watch}=shared
 const [tab,setTab]=useState('favorites'),[name,setName]=useState(''),[limit,setLimit]=useState(24),[historyTab,setHistoryTab]=useState<'all'|'unfinished'|'finished'>('all')
 const collection=tab.startsWith('collection:')?data.collections[Number(tab.slice(11))]:undefined
 const incomplete=(id:string)=>{const p=data.progress[id];return !!p&&p.at>0&&p.at<p.duration-5&&!data.savedVideos[id]?.live}
 const unfinished=historyTab==='unfinished'
 const finished=(id:string)=>{const p=data.progress[id];return !!p&&p.duration>0&&p.at>=p.duration-5&&!data.savedVideos[id]?.live}
 const ids=kind==='later'?data.later:kind==='history'?(unfinished?[...new Set([...Object.keys(data.history),...Object.keys(data.progress)])].filter(incomplete):historyTab==='finished'?Object.keys(data.progress).filter(finished):Object.keys(data.history)).sort((a,b)=>unfinished?(data.progress[b]?.updated??0)-(data.progress[a]?.updated??0):data.history[b]-data.history[a]):tab==='favorites'?data.favorites:collection?collection.ids:[]
 const page=ids.slice(0,limit)
 const loadedMap=new Map([...Object.values(data.savedVideos),...Object.values(shared.feeds.states).flatMap(state=>state.feed?.videos??[])].map(v=>[v.id,v]))
 const loading=useSavedVideos(page,data,change,loadedMap)
 function remove(id:string) {
   change(d=>{
     if(kind==='later')return {...d,later:d.later.filter(i=>i!==id)}
     if(kind==='history')return {...d,history:Object.fromEntries(Object.entries(d.history).filter(([k])=>k!==id)),progress:Object.fromEntries(Object.entries(d.progress).filter(([k])=>k!==id))}
     if(tab==='favorites')return {...d,favorites:d.favorites.filter(i=>i!==id)}
     if(collection)return {...d,collections:d.collections.map((c,i)=>i===Number(tab.slice(11))?{...c,ids:c.ids.filter(i=>i!==id)}:c)}
     return {...d,progress:Object.fromEntries(Object.entries(d.progress).filter(([k])=>k!==id))}
   })
 }
 return <><Heading label="ON THIS DEVICE" title={kind==='library'?'Library':kind==='later'?'Watch Later':'History'} detail={kind==='history'?'Videos you have played in Viddy.':'Make a little room for the videos you want to keep.'}>{kind==='history'&&<button className="button" disabled={!Object.keys(data.history).length&&!Object.keys(data.progress).length} onClick={()=>{if(confirm('Clear all watched, unfinished and finished video history?'))change(d=>({...d,history:{},progress:{},viewing:{},interests:{}}))}}>Clear history</button>}</Heading>
 {kind==='history'&&<div className="history-tabs" role="group" aria-label="History view"><button aria-pressed={historyTab==='all'} onClick={()=>{setHistoryTab('all');setLimit(24)}}>All watched</button><button aria-pressed={unfinished} onClick={()=>{setHistoryTab('unfinished');setLimit(24)}}>Unfinished videos</button><button aria-pressed={historyTab==='finished'} onClick={()=>{setHistoryTab('finished');setLimit(24)}}>Finished videos</button></div>}
 {kind==='library'&&<div className="filter-row"><label>Shelf <select value={tab} onChange={e=>{setTab(e.target.value);setLimit(24)}}><option value="favorites">Favorites</option>{data.collections.map((c,i)=><option key={i} value={'collection:'+i}>{c.name}</option>)}</select></label>
 <form className="row" onSubmit={e=>{e.preventDefault();const title=name.trim();if(title&&!data.collections.some(c=>c.name===title)){const i=data.collections.length;change(d=>({...d,collections:[...d.collections,{name:title,ids:[]}]}));setName('');setTab('collection:'+i)}}}><input aria-label="New collection name" placeholder="New collection" maxLength={80} value={name} onChange={e=>setName(e.target.value)}/><button className="button" disabled={!name.trim()||data.collections.length>=200}><Plus size={16}/> Create</button></form>
 {collection&&<button className="button" onClick={()=>{if(confirm('Delete this collection?')){change(d=>({...d,collections:d.collections.filter((_,i)=>i!==Number(tab.slice(11)))}));setTab('favorites')}}}>Delete collection</button>}</div>}
 {!page.length?<Empty title="Nothing saved here yet" detail={kind==='history'?'Videos appear when playback starts and history tracking is enabled.':'Save a video or start watching to fill this shelf.'}/>:
 <><div className="list">{page.map(id=>{
   if(!videoId(id))return null
   const v=loadedMap.get(id)
   const filtered=v&&!visible(v,data.settings)
   if(filtered)return null
   return <div key={id} className="list-row"><img className="list-thumb" src={v?.image||'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg'} alt="" loading="lazy"/><div className="grow"><button className="video-title" onClick={()=>watch(v??linkVideo(id))}>{v?.title||(loading?'Loading video details…':'Saved video — details unavailable')}</button><div className="meta">{v?.channel||'YouTube video'}{kind==='history'&&data.progress[id]&&!v?.live?' · '+Math.round(100*data.progress[id].at/data.progress[id].duration)+'% watched':''}</div></div><div className="video-action-icons"><button className="icon" title="Add to queue" aria-label="Add to queue" onClick={()=>shared.enqueue(v??linkVideo(id))}><ListPlus size={16}/></button>{kind!=='later'&&<button className="icon" title="Watch later" aria-label="Watch later" aria-pressed={data.later.includes(id)} onClick={()=>change(d=>({...d,later:toggled(d.later,id)}))}><Bookmark size={16}/></button>}<button className="icon" title="Remove" aria-label="Remove video" onClick={()=>remove(id)}><X size={16}/></button></div></div>
 })}</div>{page.every(id=>{const v=loadedMap.get(id);return v&&!visible(v,data.settings)})&&<Empty title="Saved entries are hidden by your filters" detail="Change your filters in Settings to see these entries."/>}<AutoMore enabled={ids.length>limit} revision={limit} onReach={()=>setLimit(n=>n+24)}/></>}
 </>
}
