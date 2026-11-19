import {useEffect,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {ArrowUpRight, Compass, Leaf, Plus, RefreshCw, Search, Users} from 'lucide-react'
import {ChannelGrid,Empty,Loading,More,VideoGrid,day} from './components'
import {channelId,errorText,newest,unique,videoId,visible,type Channel,type Video} from './domain'
import {toggled,type Library} from './library'
import {channelByHandle,channels,playlists,search,uploads,videos,type Query} from './youtube'
import {useResource} from './hooks'
import {linkVideo,parseChannel,publicFeed,REFRESH_MINUTES,type PublicFeeds} from './public-feeds'
import {selectUploads} from './feed'

export type Shared = {data:Library;change:(fn:(d:Library)=>Library)=>void;watch:(v:Video)=>void;channel:(id:string)=>void;follow:(id:string)=>void;keyReady:boolean;settings:()=>void;subscriptions:()=>void;feeds:PublicFeeds}
export function Grid({shared,items,isNew=false}:{shared:Shared;items:Video[];isNew?:boolean}) {
 const {data,change,watch,channel}=shared
 return <VideoGrid items={items.filter(v=>visible(v,data.settings))} onWatch={watch} onChannel={channel} settings={data.settings} progress={data.settings.progress?data.progress:undefined} later={data.later} checked={isNew?data.checked:undefined} onSave={id=>change(d=>({...d,later:toggled(d.later,id)}))}/>
}
export function Heading({label,title,detail,children}:{label:string;title:string;detail:string;children?:React.ReactNode}) {
 return <div className="heading"><div><p className="eyebrow">{label}</p><h1>{title}</h1><p>{detail}</p></div>{children&&<div className="heading-actions">{children}</div>}</div>
}
export function Connection({shared}:{shared:Shared}) {return <Empty title="Connect to YouTube" detail="Add your YouTube Data API key to browse and follow creators. Your local library works without a connection." action={<button className="button accent" onClick={shared.settings}>Open settings <ArrowUpRight size={15}/></button>}/>}
export function Notice({text}:{text:string}) {return <p className="notice" role="status">{text}</p>}

export function Quiet({shared}:{shared:Shared}) {
 const {data,change,feeds}=shared
 const [filter,setFilter]=useState(''),[days,setDays]=useState(0),[sort,setSort]=useState('new'),[limit,setLimit]=useState(24)
 const allowed=data.follows.filter(id=>!data.settings.blocked.includes(id))
 const selected=allowed.includes(filter)?filter:''
 const ids=selected?[selected]:allowed
 const states=ids.flatMap(id=>feeds.states[id]?[feeds.states[id]]:[])
 const items=selectUploads(states.flatMap(s=>s.feed?.videos??[]),data.settings,ids,days,sort==='old')
 const checks=states.flatMap(s=>s.error||!s.feed?[]:[s.feed.checkedAt])
 const failed=states.filter(s=>s.error)
 const stale=failed.some(s=>s.feed)
 return <><Heading label="QUIET MODE" title="Your feed" detail={'Recent uploads from followed creators. Checks every '+REFRESH_MINUTES+' minutes while PureTube is open.'}>
 <button className="button" onClick={shared.subscriptions}><Plus size={16}/> Follow a channel</button>
 {allowed.length>0&&<button className="button" disabled={feeds.busy} onClick={()=>{
   change(d=>({...d,checked:{...d.checked,...Object.fromEntries(allowed.flatMap(id=>{const at=feeds.states[id]?.feed?.checkedAt;return at?[[id,new Date(at).toISOString()]]:[]}))}}))
   feeds.refresh()
 }}><RefreshCw size={16} className={feeds.busy?'spin':undefined}/> Refresh</button>}</Heading>
 {!data.follows.length?<Empty title="A little quiet around here" detail="Add a channel ID, channel link, or feed link in Subscriptions. No API key is needed."/>:!allowed.length?<Empty title="No visible subscriptions" detail="Unblock a followed channel in Settings or add another channel."/>:
 <><div className="filter-row">
 <label>Channel <select value={selected} onChange={e=>{setFilter(e.target.value);setLimit(24)}}><option value="">All channels</option>{allowed.map(id=><option value={id} key={id}>{feeds.states[id]?.feed?.title??id}</option>)}</select></label>
 <label>Uploaded <select value={days} onChange={e=>{setDays(Number(e.target.value));setLimit(24)}}><option value={0}>Recent uploads</option><option value={1}>Past 24 hours</option><option value={7}>Past week</option><option value={30}>Past month</option></select></label>
 <label>Sort <select value={sort} onChange={e=>{setSort(e.target.value);setLimit(24)}}><option value="new">Newest first</option><option value="old">Oldest first</option></select></label>
 <span className="meta" role="status">{feeds.busy?'Checking for uploads...':checks.length?'Checked '+new Date(Math.max(...checks)).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):''}</span></div>
 {failed.length>0&&<Notice text={failed.length===1?failed[0].error+(stale?' Showing its last successful feed.':''):failed.length+' channels could not be refreshed.'+(stale?' Showing the last successful uploads where available.':'')}/>}
 {items.length?<Grid shared={shared} isNew items={items.slice(0,limit)}/>:feeds.busy?<Loading/>:<Empty title={failed.length===ids.length?'Feed unavailable':'No matching recent uploads'} detail={failed.length===ids.length?'Try Refresh when YouTube is reachable.':'Try a wider date range or change your content filters.'}/>}
 {items.length>limit&&<More busy={false} onClick={()=>setLimit(n=>n+24)}/>}</>}
 </>
}

export function Discover({shared,query,setQuery}:{shared:Shared;query:Query;setQuery:(q:Query)=>void}) {
 const {data,keyReady}=shared
 const key=JSON.stringify([keyReady,query])
 const [results,setResults]=useState<{key:string;videos:Video[];channels:Channel[];next?:string;error?:string}>()
 const [busy,setBusy]=useState(false),[moreError,setMoreError]=useState('')
 const [browserError,setBrowserError]=useState('')
 const r=results?.key===key?results:undefined
 useEffect(()=>{
   if(!query.text || !keyReady)return
   let active=true;setMoreError('')
   search(query).then(page=>{if(active)setResults({key,...page})}).catch(e=>{if(active)setResults({key,videos:[],channels:[],error:errorText(e)})})
   return()=>{active=false}
 },[key])
 async function more() {
   if(!r?.next||busy)return
   setBusy(true);setMoreError('')
   try{const p=await search(query,r.next);setResults(prev=>prev?.key===key?{key,next:p.next,videos:unique([...prev.videos,...p.videos]),channels:unique([...prev.channels,...p.channels])}:prev)}
   catch(e){setMoreError(errorText(e))}finally{setBusy(false)}
 }
 const cs=r?.channels.filter(c=>!data.settings.blocked.includes(c.id) && !data.settings.keywords.some(k=>(c.title+' '+c.description).toLowerCase().includes(k.toLowerCase())))??[]
 const vs=r?.videos.filter(v=>visible(v,data.settings))??[]
 return <><Heading label="DISCOVER MODE" title={query.text?'Search results':'Find something worth watching'} detail={query.text?'Results for "'+query.text+'"':'Search YouTube or pick one of your topics.'}/>
 {!query.text?<div className="discover-landing"><Compass size={30}/><h2>Your topics</h2><div className="chips">{data.settings.topics.map(topic=><button key={topic} className="chip" onClick={()=>setQuery({...query,text:topic,type:'video'})}>{topic} <ArrowUpRight size={15}/></button>)}</div><button className="button" onClick={shared.settings}>Edit topics</button></div>:
 !keyReady?<>{browserError&&<Notice text={browserError}/>}<Empty title="Search in your browser" detail="You can paste a video link back into PureTube to watch it. Add an optional API key if you want search results and content filters inside the app." action={<div className="row wrap"><button className="button accent" onClick={()=>invoke('open_search',{query:query.text}).catch(e=>setBrowserError(errorText(e)))}>Search on YouTube <ArrowUpRight size={15}/></button><button className="button" onClick={shared.settings}>Set up in-app search</button></div>}/></>:
 <><div className="filter-row"><label>Type <select value={query.type} onChange={e=>setQuery({...query,type:e.target.value as Query['type']})}><option value="video">Videos</option><option value="channel">Channels</option></select></label>
 <label>Order <select value={query.order} onChange={e=>setQuery({...query,order:e.target.value as Query['order']})}><option value="relevance">YouTube relevance</option><option value="date">Newest</option></select></label>
 {query.type==='video'&&<label>Length <select value={query.duration} onChange={e=>setQuery({...query,duration:e.target.value})}><option value="any">Any length</option><option value="short">Under 4 minutes</option><option value="medium">4 to 20 minutes</option><option value="long">Over 20 minutes</option></select></label>}</div>
 {!r?<Loading/>:r.error?<Notice text={r.error}/>:<>{vs.length>0&&<Grid shared={shared} items={vs}/>}
 {cs.length>0&&<ChannelGrid items={cs} settings={data.settings} follows={data.follows} onFollow={shared.follow} onOpen={shared.channel}/>}
 {!vs.length&&!cs.length&&<Empty title="No matching results on this page" detail={r.next?'Load more or change your search filters.':'Try a different search or change your filters.'}/>}
 {moreError&&<Notice text={moreError}/>} {r.next&&<More busy={busy} onClick={()=>void more()}/>}</>}</>}
 </>
}

export function Subscriptions({shared}:{shared:Shared}) {
 const {data,keyReady,change,channel,follow,feeds}=shared
 const [lookup,setLookup]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[group,setGroup]=useState('')
 const ids=data.follows.filter(id=>!data.settings.blocked.includes(id))
 async function add() {
   setBusy(true);setError('')
   try{const value=lookup.trim();const handle=/^(?:https:\/\/(?:www\.)?youtube\.com\/)?(@[^/?# ]+)/i.exec(value)?.[1]
     const id=parseChannel(value)??(keyReady&&handle?(await channelByHandle(handle))?.id:undefined)
     if(!id)throw new Error('Use a UC channel ID, a /channel/ link, or a feed URL. On YouTube, open the channel’s About panel and select Share channel > Copy channel ID.')
     if(data.settings.blocked.includes(id))throw new Error('Unblock this channel in Settings before following.')
     if(!data.follows.includes(id)){await publicFeed(id);follow(id)}
     setLookup('')
   }catch(e){setError(errorText(e))}finally{setBusy(false)}
 }
 return <><Heading label="YOUR CREATORS" title="Subscriptions" detail="Follow and organize creators locally, without signing into YouTube."/>
 <form className="filter-row" onSubmit={e=>{e.preventDefault();void add()}}><input aria-label="Channel ID or link" placeholder={keyReady?'Channel ID, link, or @handle':'Channel ID or link'} value={lookup} onChange={e=>setLookup(e.target.value)}/><button className="button" disabled={busy||!lookup.trim()}><Plus size={16}/> {busy?'Checking...':'Follow'}</button>
 <label>Group <select value={group} onChange={e=>setGroup(e.target.value)}><option value="">All groups</option>{[...new Set(Object.values(data.groups).filter(Boolean))].sort().map(g=><option key={g}>{g}</option>)}</select></label></form>
 {error&&<Notice text={error}/>}
 {!ids.length?<Empty title="No visible subscriptions" detail="Paste a YouTube channel ID or channel feed link. On YouTube, open the channel’s About panel, then choose Share channel and Copy channel ID."/>:
 <div className="list">{ids.filter(id=>!group||data.groups[id]===group).map(id=>{
   const c=feeds.states[id]?.feed
   return <div className="list-row" key={id}><Users size={20}/><div className="grow"><button className="video-title" onClick={()=>channel(id)}>{c?.title??id}</button><div className="meta">{c?'Last checked '+new Date(c.checkedAt).toLocaleString():feeds.states[id]?.error??'Waiting for first check'}</div></div><input aria-label={'Group for '+(c?.title??id)} placeholder="Group name" maxLength={80} key={id+':'+(data.groups[id]??'')} defaultValue={data.groups[id]??''} onBlur={e=>{const name=e.target.value.trim();if(name!==(data.groups[id]??''))change(d=>({...d,groups:{...d.groups,[id]:name}}))}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/><button className="button" onClick={()=>follow(id)}>Unfollow</button></div>
 })}</div>}
 </>
}

export function ChannelPage({shared,id}:{shared:Shared;id:string}) {
 return shared.keyReady?<ApiChannelPage shared={shared} id={id}/>:<PublicChannelPage shared={shared} id={id}/>
}
function PublicChannelPage({shared,id}:{shared:Shared;id:string}) {
 const {data,feeds,follow}=shared
 const [reload,setReload]=useState(0)
 const stored=feeds.states[id]
 const direct=useResource(()=>stored||data.settings.blocked.includes(id)?Promise.resolve(undefined):publicFeed(id,reload>0),JSON.stringify([id,!!stored,data.settings.blocked.includes(id),reload]))
 const feed=stored?.feed??direct.value
 if(data.settings.blocked.includes(id))return <Empty title="Channel blocked" detail="Manage blocked channels in Settings."/>
 if(!feed&&(stored?.error||direct.error))return <><Notice text={stored?.error??direct.error??''}/><button className="button" onClick={()=>stored?feeds.refresh():setReload(n=>n+1)}>Retry</button></>
 if(!feed)return <Loading/>
 return <><Heading label="YOUTUBE CHANNEL" title={feed.title} detail="Recent public uploads.">
 <button className="button accent" onClick={()=>follow(id)}>{data.follows.includes(id)?'Unfollow':'Follow'}</button></Heading>
 {stored?.error&&<Notice text={stored.error+' Showing the last successful feed.'}/>}
 {feed.videos.some(v=>visible(v,data.settings))?<Grid shared={shared} items={feed.videos}/>:<Empty title="No matching recent uploads" detail="This channel may have no recent public uploads, or your filters may be hiding them."/>}</>
}
function ApiChannelPage({shared,id}:{shared:Shared;id:string}) {
 const {data,keyReady}=shared
 const c=useResource(()=>keyReady?channels([id]).then(a=>a[0]??null):Promise.resolve(null),id+':'+keyReady)
 const [tab,setTab]=useState<'uploads'|'playlists'>('uploads')
 const [vs,setVs]=useState<{items:Video[];next?:string}>()
 const [ps,setPs]=useState<Awaited<ReturnType<typeof playlists>>>()
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const channel=c.value
 useEffect(()=>{
   if(!channel||data.settings.blocked.includes(id)|| (tab==='uploads'?vs:ps)) return
   let active=true
   setError('')
   const task=tab==='uploads'?uploads(channel.uploads).then(p=>{if(active)setVs(p)}):playlists(id).then(p=>{if(active)setPs(p)})
   task.catch(e=>{if(active)setError(errorText(e))})
   return()=>{active=false}
 },[tab,channel,id,data.settings.blocked])
 async function more() {
   setBusy(true);setError('')
   try{if(tab==='uploads'&&vs?.next&&channel){const p=await uploads(channel.uploads,vs.next);setVs({items:unique([...vs.items,...p.items]).sort(newest),next:p.next})}
   if(tab==='playlists'&&ps?.next){const p=await playlists(id,ps.next);setPs({items:unique([...ps.items,...p.items]),next:p.next})}}
   catch(e){setError(errorText(e))}finally{setBusy(false)}
 }
 if(data.settings.blocked.includes(id))return <Empty title="Channel blocked" detail="Manage blocked channels in Settings."/>
 if(!keyReady)return <Connection shared={shared}/>
 if(c.error)return <Notice text={c.error}/>
 if(channel===null)return <Empty title="Channel unavailable" detail="YouTube did not return a public channel for this ID."/>
 if(!channel)return <Loading/>
 return <>{channel.banner&&<img className="channel-banner" src={channel.banner} alt=""/>}
 <div className="channel-heading">{channel.image&&<img src={channel.image} alt=""/>}<Heading label="YOUTUBE CHANNEL" title={channel.title} detail={data.settings.subscribers&&channel.subscribers?new Intl.NumberFormat().format(Number(channel.subscribers))+' subscribers':'Browse uploads from this creator.'}><button className="button accent" onClick={()=>shared.follow(id)}>{data.follows.includes(id)?'Unfollow':'Follow'}</button></Heading></div>
 {channel.description&&<details><summary>About this channel</summary><p className="description">{channel.description}</p></details>}
 <div className="filter-row"><button className={'button '+(tab==='uploads'?'accent':'')} onClick={()=>{setError('');setTab('uploads')}}>Uploads</button><button className={'button '+(tab==='playlists'?'accent':'')} onClick={()=>{setError('');setTab('playlists')}}>Playlists</button></div>
 {error&&<Notice text={error}/>}
 {tab==='uploads'?(vs?<>{vs.items.some(v=>visible(v,data.settings))?<Grid shared={shared} items={vs.items}/>:<Empty title="No matching uploads" detail="The available videos on this page may be hidden by your filters."/>}{vs.next&&<More busy={busy} onClick={()=>void more()}/>}</>:!error&&<Loading/>):
 ps?<>{ps.items.length?<div className="list">{ps.items.map(p=><Playlist key={p.id} title={p.title} id={p.id} shared={shared}/>)}</div>:<Empty title="No public playlists" detail="This channel has not published any playlists."/>}{ps.next&&<More busy={busy} onClick={()=>void more()}/>}</>:!error&&<Loading/>}
 </>
}
function Playlist({title,id,shared}:{title:string;id:string;shared:Shared}) {
 const [expanded,setExpanded]=useState(false),[state,setState]=useState<{items:Video[];next?:string}>(),[busy,setBusy]=useState(false),[error,setError]=useState('')
 async function load(next?:string) {
   setBusy(true);setError('')
   try{const p=await uploads(id,next);setState(x=>({items:unique([...(next?x?.items??[]:[]),...p.items]),next:p.next}))}
   catch(e){setError(errorText(e))}finally{setBusy(false)}
 }
 return <details onToggle={e=>{const open=e.currentTarget.open;setExpanded(open);if(open&&!state&&!busy)void load()}}><summary>{title}</summary>{expanded&&<div className="playlist">{error&&<Notice text={error}/>} {state?<>{state.items.some(v=>visible(v,shared.data.settings))?<Grid shared={shared} items={state.items}/>:<p className="meta">No matching videos on this page.</p>}{state.next&&<More busy={busy} onClick={()=>void load(state.next)}/>}</>:busy&&<Loading/>}</div>}</details>
}

export function LibraryPage({shared,kind}:{shared:Shared;kind:'library'|'later'|'history'}) {
 const {data,change,keyReady,watch}=shared
 const [tab,setTab]=useState('continue'),[name,setName]=useState(''),[limit,setLimit]=useState(24)
 const collection=tab.startsWith('collection:')?data.collections[Number(tab.slice(11))]:undefined
 const ids=kind==='later'?data.later:kind==='history'?Object.keys(data.history).sort((a,b)=>data.history[b]-data.history[a]):tab==='favorites'?data.favorites:collection?collection.ids:data.settings.progress?Object.keys(data.progress).filter(id=>data.progress[id].at>0&&data.progress[id].at<data.progress[id].duration-5).sort((a,b)=>data.progress[b].updated-data.progress[a].updated):[]
 const page=ids.slice(0,limit)
 const loaded=useResource(()=>keyReady?videos(page):Promise.resolve([]),JSON.stringify([keyReady,page]))
 const loadedMap=new Map([...Object.values(shared.feeds.states).flatMap(state=>state.feed?.videos??[]),...(loaded.value??[])].map(v=>[v.id,v]))
 function remove(id:string) {
   change(d=>{
     if(kind==='later')return {...d,later:d.later.filter(i=>i!==id)}
     if(kind==='history')return {...d,history:Object.fromEntries(Object.entries(d.history).filter(([k])=>k!==id))}
     if(tab==='favorites')return {...d,favorites:d.favorites.filter(i=>i!==id)}
     if(collection)return {...d,collections:d.collections.map((c,i)=>i===Number(tab.slice(11))?{...c,ids:c.ids.filter(i=>i!==id)}:c)}
     return {...d,progress:Object.fromEntries(Object.entries(d.progress).filter(([k])=>k!==id))}
   })
 }
 return <><Heading label="ON THIS DEVICE" title={kind==='library'?'Library':kind==='later'?'Watch Later':'History'} detail={kind==='history'?'Videos you have played in PureTube.':'Make a little room for the videos you want to keep.'}/>
 {kind==='library'&&<div className="filter-row"><label>Shelf <select value={tab} onChange={e=>{setTab(e.target.value);setLimit(24)}}><option value="continue">Continue watching</option><option value="favorites">Favorites</option>{data.collections.map((c,i)=><option key={i} value={'collection:'+i}>{c.name}</option>)}</select></label>
 <form className="row" onSubmit={e=>{e.preventDefault();const title=name.trim();if(title&&!data.collections.some(c=>c.name===title)){const i=data.collections.length;change(d=>({...d,collections:[...d.collections,{name:title,ids:[]}]}));setName('');setTab('collection:'+i)}}}><input aria-label="New collection name" placeholder="New collection" maxLength={80} value={name} onChange={e=>setName(e.target.value)}/><button className="button" disabled={!name.trim()||data.collections.length>=200}><Plus size={16}/> Create</button></form>
 {collection&&<button className="button" onClick={()=>{if(confirm('Delete this collection?')){change(d=>({...d,collections:d.collections.filter((_,i)=>i!==Number(tab.slice(11)))}));setTab('continue')}}}>Delete collection</button>}</div>}
 {loaded.error&&<Notice text={loaded.error}/>}
 {!page.length?<Empty title="Nothing saved here yet" detail={kind==='history'?'Videos appear when playback starts and history tracking is enabled.':'Save a video or start watching to fill this shelf.'}/>:
 <><div className="list">{page.map(id=>{
   if(!videoId(id))return null
   const v=loadedMap.get(id)
   const filtered=v&&!visible(v,data.settings)
   if(filtered)return null
   return <div key={id} className="list-row">{v?.image&&<img className="list-thumb" src={v.image} alt=""/>}<div className="grow">{v?<button className="video-title" onClick={()=>watch(v)}>{v.title}</button>:!keyReady?<button className="video-title" onClick={()=>watch(linkVideo(id))}>Open saved video ({id})</button>:<span>{id}</span>}<div className="meta">{v?.channel??(keyReady&&!loaded.value&&!loaded.error?'Loading video details':'Saved video ID / details unavailable')}</div></div><button className="button" onClick={()=>remove(id)}>Remove</button></div>
 })}</div>{loaded.value?.length===page.length && loaded.value.every(v=>!visible(v,data.settings))&&<Empty title="Saved entries are hidden by your filters" detail="Change your filters in Settings to see these entries."/>}{ids.length>limit&&<More busy={false} onClick={()=>setLimit(n=>n+24)}/>}</>}
 </>
}
export {Leaf,Search}

