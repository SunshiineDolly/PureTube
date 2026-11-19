import {useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {Download, ExternalLink, Plus, RefreshCw, Users} from 'lucide-react'
import {Empty,Loading,More,VideoGrid} from './components'
import {errorText,videoId,visible,type Video} from './domain'
import {toggled,type Library} from './library'
import {useResource} from './hooks'
import {linkVideo,parseChannel,publicFeed,REFRESH_MINUTES,type PublicFeeds} from './public-feeds'
import {selectUploads} from './feed'
import {MAX_SUBSCRIPTIONS_BYTES,mergeSubscriptions,parseSubscriptions} from './subscription-import'

export type Shared = {data:Library;change:(fn:(d:Library)=>Library)=>void;watch:(v:Video)=>void;channel:(id:string)=>void;follow:(id:string)=>void;subscriptions:()=>void;feeds:PublicFeeds}
export function Grid({shared,items,isNew=false}:{shared:Shared;items:Video[];isNew?:boolean}) {
 const {data,change,watch,channel}=shared
 return <VideoGrid items={items.filter(v=>visible(v,data.settings))} onWatch={watch} onChannel={channel} progress={data.settings.progress?data.progress:undefined} later={data.later} checked={isNew?data.checked:undefined} onSave={id=>change(d=>({...d,later:toggled(d.later,id)}))}/>
}
export function Heading({label,title,detail,children}:{label:string;title:string;detail:string;children?:React.ReactNode}) {
 return <div className="heading"><div><p className="eyebrow">{label}</p><h1>{title}</h1><p>{detail}</p></div>{children&&<div className="heading-actions">{children}</div>}</div>
}
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

export function Subscriptions({shared}:{shared:Shared}) {
 const {data,change,channel,follow,feeds}=shared
 const [lookup,setLookup]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[group,setGroup]=useState('')
 const [imported,setImported]=useState('')
 const importInput=useRef<HTMLInputElement>(null)
 const ids=data.follows.filter(id=>!data.settings.blocked.includes(id))
 async function importCsv(file:File) {
   setError('');setImported('');setBusy(true)
   try {
     if(file.size>MAX_SUBSCRIPTIONS_BYTES)throw Error('This CSV is larger than 4 MB.')
     const incoming=parseSubscriptions(await file.text())
     change(d=>{
       const result=mergeSubscriptions(d.follows,incoming,d.settings.blocked)
       if(result.follows.length>5000)throw Error('PureTube supports up to 5,000 followed channels.')
       setImported(result.added?`Added ${result.added} ${result.added===1?'channel':'channels'} to Subscriptions.`:'No new channels. Already followed or blocked channels were skipped.')
       return result.added?{...d,follows:result.follows}:d
     })
   } catch(e){setError(errorText(e))} finally{setBusy(false)}
 }
 async function add() {
   setBusy(true);setError('')
   try{const id=parseChannel(lookup)
     if(!id)throw new Error('Use a UC channel ID, a /channel/ link, or a feed URL. On YouTube, open the channel’s About panel and select Share channel > Copy channel ID.')
     if(data.settings.blocked.includes(id))throw new Error('Unblock this channel in Settings before following.')
     if(!data.follows.includes(id)){await publicFeed(id);follow(id)}
     setLookup('')
   }catch(e){setError(errorText(e))}finally{setBusy(false)}
 }
 return <><Heading label="YOUR CREATORS" title="Subscriptions" detail="Follow creators locally and see their latest uploads in your feed."/>
 <details className="import-panel"><summary>Import YouTube subscriptions</summary>
 <p className="description">In Google Takeout, select YouTube and YouTube Music, limit the export to subscriptions, and download and extract the archive. Then choose its subscriptions CSV here. Existing follows stay in place.</p>
 <div className="row wrap import-actions"><button className="button" onClick={()=>invoke('open_info',{page:'takeout'}).catch(e=>setError(errorText(e)))}><ExternalLink size={16}/> Open Google Takeout</button>
 <button className="button accent" disabled={busy} onClick={()=>importInput.current?.click()}><Download size={16}/> Import CSV</button>
 <input ref={importInput} type="file" accept=".csv,text/csv" aria-label="YouTube subscriptions CSV" hidden onChange={e=>{const selected=e.currentTarget.files?.[0];e.currentTarget.value='';if(selected)void importCsv(selected)}}/></div></details>
 {imported&&<Notice text={imported}/>}
 <form className="filter-row" onSubmit={e=>{e.preventDefault();void add()}}><input aria-label="Channel ID or link" placeholder="Channel ID or link" value={lookup} onChange={e=>setLookup(e.target.value)}/><button className="button" disabled={busy||!lookup.trim()}><Plus size={16}/> {busy?'Checking...':'Follow'}</button>
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
export function LibraryPage({shared,kind}:{shared:Shared;kind:'library'|'later'|'history'}) {
 const {data,change,watch}=shared
 const [tab,setTab]=useState('continue'),[name,setName]=useState(''),[limit,setLimit]=useState(24)
 const collection=tab.startsWith('collection:')?data.collections[Number(tab.slice(11))]:undefined
 const ids=kind==='later'?data.later:kind==='history'?Object.keys(data.history).sort((a,b)=>data.history[b]-data.history[a]):tab==='favorites'?data.favorites:collection?collection.ids:data.settings.progress?Object.keys(data.progress).filter(id=>data.progress[id].at>0&&data.progress[id].at<data.progress[id].duration-5).sort((a,b)=>data.progress[b].updated-data.progress[a].updated):[]
 const page=ids.slice(0,limit)
 const loadedMap=new Map(Object.values(shared.feeds.states).flatMap(state=>state.feed?.videos??[]).map(v=>[v.id,v]))
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
 {!page.length?<Empty title="Nothing saved here yet" detail={kind==='history'?'Videos appear when playback starts and history tracking is enabled.':'Save a video or start watching to fill this shelf.'}/>:
 <><div className="list">{page.map(id=>{
   if(!videoId(id))return null
   const v=loadedMap.get(id)
   const filtered=v&&!visible(v,data.settings)
   if(filtered)return null
   return <div key={id} className="list-row">{v?.image&&<img className="list-thumb" src={v.image} alt=""/>}<div className="grow">{v?<button className="video-title" onClick={()=>watch(v)}>{v.title}</button>:<button className="video-title" onClick={()=>watch(linkVideo(id))}>Open saved video ({id})</button>}<div className="meta">{v?.channel??'Saved video ID / details unavailable'}</div></div><button className="button" onClick={()=>remove(id)}>Remove</button></div>
 })}</div>{page.every(id=>{const v=loadedMap.get(id);return v&&!visible(v,data.settings)})&&<Empty title="Saved entries are hidden by your filters" detail="Change your filters in Settings to see these entries."/>}{ids.length>limit&&<More busy={false} onClick={()=>setLimit(n=>n+24)}/>}</>}
 </>
}
