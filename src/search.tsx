import {LiveBrowser,ScheduledReminders} from './live-browser'
import {useState} from 'react'
import {AutoMore,Empty,Loading} from './components'
import {RecentFeed} from './discover'
import {Grid,Heading,Notice,type Shared} from './screens'
import {publicNewest,visible} from './domain'
import {useCatalog,type CatalogFilter} from './catalog'
import {ScheduledDetails} from './live'
import {FollowedLiveShelf} from './followed-live'

const filters=[['latest','Newest first'],['all','Relevance'],['feeds','Recent uploads']] as const
export type SearchSource='latest'|'all'|'feeds'
export function SearchPage({query,shared,liveOnly=false,selectedSource,onSourceChange,mode='live',liveQuery='',onLiveQuery,onMode}:{query:string;shared:Shared;liveOnly?:boolean;selectedSource?:SearchSource;onSourceChange?:(source:SearchSource)=>void;mode?:'live'|'scheduled';liveQuery?:string;onLiveQuery?:(q:string)=>void;onMode?:(mode:'live'|'scheduled')=>void}){
 const source:CatalogFilter|'feeds'=liveOnly?mode:selectedSource??'latest'
 const [draft,setDraft]=useState(liveQuery)
 const effective=liveOnly?liveQuery||(mode==='scheduled'?'upcoming live stream':query):query
 const catalog=useCatalog(effective,source==='feeds'?'latest':source,source!=='feeds'&&(!liveOnly||!!liveQuery))
 const matches=catalog.items?.filter(v=>visible(v,shared.data.settings))
 if(source==='latest')matches?.sort(publicNewest)
 if(source==='scheduled')matches?.sort((a,b)=>(a.scheduledAt??Infinity)-(b.scheduledAt??Infinity))
 if(liveOnly&&!liveQuery)return <LiveBrowser shared={shared} mode={mode} onMode={onMode} onSearch={onLiveQuery}/>
 return <div className="studio-discover">
   <Heading label={liveOnly?'ON AIR':'SEARCH'} title={liveOnly?'Live streams':'Search results'} detail={liveOnly?'Find a public stream and watch it here.':`Videos matching “${query}”`}/>
   {liveOnly&&<><button className="button" onClick={()=>onLiveQuery?.('')}>Browse all streams</button><FollowedLiveShelf shared={shared}/></>}
   {liveOnly?<><div className="row search-banner" aria-label="Live filters">{(['live','scheduled'] as const).map(value=><button className="category-chip" key={value} aria-pressed={mode===value} onClick={()=>onMode?.(value)}>{value==='live'?'Live now':'Scheduled'}</button>)}</div><form className="row search-banner" onSubmit={e=>{e.preventDefault();onLiveQuery?.(draft.trim())}}>
     <input aria-label="Search live streams" placeholder="Try lofi radio, gaming, or news" maxLength={256} value={draft} onChange={e=>setDraft(e.target.value)}/>
     <button className="button accent">Find streams</button><button type="button" className="button" onClick={catalog.reload}>Refresh results</button>
   </form></>:<div className="row wrap search-banner" aria-label="Search source">
     {filters.map(([key,label])=><button key={key} className="category-chip" aria-pressed={source===key} onClick={()=>onSourceChange?.(key)}>{label}</button>)}
   </div>}
   {liveOnly&&mode==='scheduled'&&<ScheduledReminders shared={shared}/>}{source==='feeds'?<RecentFeed shared={shared} query={query}/>:
    catalog.error?<><Notice text={catalog.error}/><button className="button" onClick={catalog.reload}>Try again</button></>:
    !matches?<Loading/>:<section className="studio-shelf" aria-label="Matching videos">
    {matches.length?<Grid shared={shared} items={matches} extra={source==='scheduled'?v=><ScheduledDetails video={v} data={shared.data} change={shared.change}/>:undefined}/>:!catalog.hasMore?<Empty title={source==='live'?'No live streams found':source==='scheduled'?'No scheduled streams found':'No matching videos'} detail="Try a different search or a different filter."/>:null}
    <AutoMore enabled={catalog.hasMore} revision={catalog.cursor} busy={catalog.loadingMore} error={catalog.moreError} onReach={catalog.more}/></section>}
 </div>
}
