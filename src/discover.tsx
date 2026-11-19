import {useState} from 'react'
import {Play,RefreshCw} from 'lucide-react'
import {AutoMore,Empty,Loading} from './components'
import {Grid,Heading,Notice,type Shared} from './screens'
import {usePublicFeeds} from './public-feeds'
import {newest,publicNewest,unique,visible} from './domain'
import {mixByTopic,rankedTopics,topicQuery,topics} from './topics'
import {useCatalog} from './catalog'
import {CreatorAvatar} from './creator-avatar'
import {FollowedLiveShelf} from './followed-live'
import {recommendationIds,useRecommendations} from './use-recommendations'
import type {Surface} from './recommendations'
import {CategoryRail} from './category-rail'

export function RecommendationFeed({shared,surface}:{shared:Shared;surface:Surface}){
 const {feed,target,refresh,more,hasMore}=useRecommendations(surface,shared.data)
 const [topic,setTopic]=useState('All')
 const railTopics=['All','Gaming','Vlogs','Style & beauty','Fashion','Home & lifestyle','Music','Anime','Learning','Travel',...topics.map(t=>t.name).filter(name=>!['Gaming','Vlogs','Style & beauty','Fashion','Home & lifestyle','Music','Anime','Learning','Travel'].includes(name))]
 const videos=feed?.items.filter(v=>!shared.data.dismissed.includes(v.id)&&visible(v,shared.data.settings)&&(!shared.data.settings.history||!shared.data.history[v.id]))
 return <div className="studio-discover recommendations" ref={target}>
   {surface==='home'&&<div className="heading home-browse-heading"><h1 className="sr-only">Home</h1><CategoryRail names={railTopics} selected={topic} onSelect={setTopic}/><button className="button new-mix-button" disabled={feed?.busy} onClick={refresh}><RefreshCw size={16} className={feed?.busy?'spin':undefined}/> New mix</button></div>}
   {surface==='home'&&<FollowedLiveShelf shared={shared}/>}
   {surface==='discover'&&<div className="row recommendation-toolbar"><p>Explore beyond your usual creators.</p><button className="button" disabled={feed?.busy} onClick={refresh}><RefreshCw size={16}/> New mix</button></div>}
   {topic==='All'?<>
   {!videos?.length&&feed?.busy?<Loading/>:videos?.length?<section className="studio-shelf" aria-label="Recommended videos"><Grid shared={shared} items={videos} extra={v=><div className="recommendation-reason"><span>{v.category}</span><button title="Remove this recommendation" onClick={()=>shared.change(d=>({...d,dismissed:[...new Set([...d.dismissed,v.id])].slice(-5000)}))}>Not interested</button></div>}/></section>:feed?.error?<><Notice text={feed.error}/><button className="button" onClick={refresh}>Try again</button></>:<Empty title="Time for something new" detail="Refresh the mix for new topics and creators." action={<button className="button" onClick={refresh}>New mix</button>}/>}
   <AutoMore enabled={hasMore} busy={!!feed?.busy} error={feed?.moreError} onReach={()=>void more()}/></>:<TopicCatalog key={topic} topic={topic} shared={shared} exclude={[]}/>}
 </div>
}

const starterIds=topics.flatMap(t=>[...t.ids])

export function RecentFeed({shared,query='',home=false}:{shared:Shared;query?:string;home?:boolean}){
 const [limit,setLimit]=useState(24)
 const starter=usePublicFeeds(starterIds.filter(id=>!shared.data.settings.blocked.includes(id)))
 const followed=shared.followIds.flatMap(id=>shared.feeds.states[id]?.feed?.videos??[])
 const publicItems=starterIds.flatMap(id=>starter.states[id]?.feed?.videos??[])
 const q=query.toLocaleLowerCase()
 const liveIds=new Set(Object.values(shared.live.states).flatMap(s=>s.video?[s.video.id]:[]))
 const allows=(v:typeof publicItems[number])=>!v.live&&!liveIds.has(v.id)&&visible(v,shared.data.settings)&&(!q||[v.title,v.channel,v.description].join(' ').toLocaleLowerCase().includes(q))
 const items=home?unique(mixByTopic(topics.map(({ids})=>(ids as readonly string[]).flatMap(id=>starter.states[id]?.feed?.videos??[]).filter(allows).sort(newest)))):
   unique([...publicItems,...followed]).filter(allows).sort(newest)
 const busy=starter.busy||(!home&&shared.feeds.busy)
 return <div className="studio-discover">
 {home&&<Heading label="" title="Home" detail="A rotating mix of recent uploads across genres."><button className="button" onClick={starter.refresh} disabled={busy}><RefreshCw size={16}/> Refresh</button></Heading>}
 {home&&<FollowedLiveShelf shared={shared}/>}
 <section className="studio-shelf">{!home&&<div className="starter-heading"><h2>Matching recent uploads</h2></div>}
 {items.length?<Grid shared={shared} items={items.slice(0,limit)}/>:busy?<Loading/>:<Empty title="No matching recent uploads" detail={home?'Try Refresh or visit Discover for more to watch.':'Try another search.'}/>}
 <AutoMore enabled={items.length>limit} onReach={()=>setLimit(n=>n+24)}/>
 </section></div>
}

export function Discover({shared}:{shared:Shared}){
 const [picked,setPicked]=useState('For you')
 const ordered=rankedTopics(shared.data.settings.history?shared.data.interests:{})
 const topic=picked
 const homeCreators=starterIds
 return <div className="studio-discover discover-page"><Heading label="" title="Discover" detail="Find your next favorite creator."/>
 <CategoryRail names={['For you',...ordered.map(t=>t.name)]} selected={topic} onSelect={setPicked}/>
 {topic==='For you'?<RecommendationFeed shared={shared} surface="discover"/>:<TopicCatalog key={topic} topic={topic} shared={shared} exclude={homeCreators}/>}
 </div>
}

function TopicCatalog({topic,shared,exclude}:{topic:string;shared:Shared;exclude:readonly string[]}){
 const catalog=useCatalog(topicQuery(topic),'latest')
 const skipped=new Set(exclude)
 const homeIds=recommendationIds('home')
 const videos=catalog.items?.filter(v=>!homeIds.has(v.id)&&!skipped.has(v.channelId)&&!shared.data.dismissed.includes(v.id)&&visible(v,shared.data.settings)).sort(publicNewest).map(v=>({...v,category:topic}))
 const lead=videos?.[0]
 return <section className="studio-shelf topic-catalog" aria-label={`${topic} videos`}>
   {catalog.error?<><Notice text={catalog.error}/><button className="button" onClick={catalog.reload}>Try again</button></>:
    !videos?<Loading/>:lead?<><article className="topic-feature">
       <button className="thumbnail" aria-label={'Watch '+lead.title} onClick={()=>shared.watch(lead)}><img src={lead.image} alt=""/></button>
       <div className="topic-feature-copy">
         <p className="eyebrow">{topic}</p><h2>{lead.title}</h2>
         <div className="row"><CreatorAvatar id={lead.channelId} name={lead.channel} src={lead.channelImage}/><span>{lead.channel}{lead.publishedLabel?' · '+lead.publishedLabel:''}</span></div>
         <button className="button accent" onClick={()=>shared.watch(lead)}><Play size={15}/> Watch now</button>
       </div>
     </article>
     {videos.length>1&&<><div className="starter-heading"><h2>More in {topic}</h2><span className="meta">Newest first</span></div><Grid shared={shared} items={videos.slice(1)}/></>}</>:!catalog.hasMore?<Empty title="No additional results" detail="Try another topic or search for something more specific."/>:null}
   <AutoMore enabled={catalog.hasMore} busy={catalog.loadingMore} error={catalog.moreError} onReach={catalog.more}/>
 </section>
}
