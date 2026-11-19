import {useState} from 'react'
import {RefreshCw} from 'lucide-react'
import {useLiveBrowse,liveTopics} from './live-browse'
import {Grid,Heading,Notice,type Shared} from './screens'
import {AutoMore,Empty,Loading} from './components'
import {FollowedLiveShelf} from './followed-live'
import {reminderVideos,ScheduledDetails} from './live'
import {visible} from './domain'
import {useFilteredVideos} from './filtered-videos'
export function LiveBrowser({shared,mode,onMode,onSearch}:{shared:Shared;mode:'live'|'scheduled';onMode?:(v:'live'|'scheduled')=>void;onSearch?:(q:string)=>void}){
 const [category,setCategory]=useState(''),[draft,setDraft]=useState(''),browse=useLiveBrowse(mode,category,shared.followIds)
 const videos=useFilteredVideos(browse.items.filter(v=>visible(v,shared.data.settings)&&(mode!=='scheduled'||!shared.data.liveReminders[v.id])),shared.data.settings)
 return <div className="live-browser"><Heading label="ON AIR" title="Live streams" detail="Find something happening now, or something worth waiting for."><button className="button" disabled={browse.busy} onClick={browse.refresh}><RefreshCw size={15}/> Refresh</button></Heading><FollowedLiveShelf shared={shared}/><div className="live-mode-tabs">{(['live','scheduled'] as const).map(value=><button className="category-chip" aria-pressed={mode===value} key={value} onClick={()=>onMode?.(value)}>{value==='live'?'Live now':'Scheduled'}</button>)}</div><form className="row search-banner" onSubmit={e=>{e.preventDefault();if(draft.trim())onSearch?.(draft.trim())}}><input aria-label="Search live streams" placeholder="Search all public live streams" value={draft} onChange={e=>setDraft(e.target.value)}/><button className="button accent">Find streams</button></form>{mode==='scheduled'&&<ScheduledReminders shared={shared}/>}<div className="live-category-track" aria-label="Live categories">{['',...liveTopics.map(t=>t[0])].map(name=><button className="category-chip" key={name} aria-pressed={category===name} onClick={()=>{if(name===category)browse.refresh?.();else setCategory(name)}}>{name||'All streams'}</button>)}</div>{browse.error&&!videos.length&&<Notice text={browse.error}/>}<section aria-label={mode==='live'?'Live now videos':'Scheduled videos'}>{videos.length?<Grid shared={shared} items={videos} extra={mode==='scheduled'?v=><ScheduledDetails video={v} data={shared.data} change={shared.change}/>:undefined}/>:browse.busy||browse.hasMore?<Loading/>:<Empty title={mode==='live'?'No live streams returned':'No scheduled streams returned'} detail="Try another category or search for a creator."/>}<AutoMore enabled={browse.hasMore} busy={browse.busy} onReach={()=>void browse.more()}/></section></div>
}

export function ScheduledReminders({shared}:{shared:Shared}){
 const videos=reminderVideos(shared.data)
 return <section className="scheduled-reminders" aria-label="Your reminders">
   <h2>Your reminders</h2>
   {videos.length?<Grid shared={shared} items={videos} extra={v=><ScheduledDetails video={v} data={shared.data} change={shared.change}/>}/>:<p className="meta">Choose Remind me on a scheduled stream to keep it here.</p>}
 </section>
}
