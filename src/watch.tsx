import {PlaylistPlayer,type PlaylistQueue} from './playlist-queue'
import {useEffect,useRef,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {Clock3,Heart,Share2,PictureInPicture2,Maximize,X,Play,BookmarkPlus} from 'lucide-react'
import {PlayerFrame} from './player'
import {CreatorAvatar} from './creator-avatar'
import {CreatorByline,useWatchCreator} from './creator-links'
import {DownloadButton} from './downloads'
import {VideoComments} from './comments'
import {useUpNext,UpNext} from './up-next'
import {ScheduledDetails,useScheduledStatus} from './live'
import {LiveChat} from './live-chat'
import {Empty,day} from './components'
import {Notice,type Shared} from './screens'
import {categoryFor} from './topics'
import {rememberVideo,toggled} from './library'
import {errorText,visible,type Video} from './domain'
type Props={playlist?:PlaylistQueue;onQueueWatch:(index:number)=>void;onQueueClose:()=>void;onQueueRepeat:()=>void;docked?:boolean;onRestore:()=>void;onStop:()=>void;video:Video;shared:Shared;focus:boolean;theater:boolean;setFocus:(v:boolean)=>void;setTheater:(v:boolean)=>void;onSample:(id:string,p:number,d:number,t:number,live?:boolean)=>void;onElapsed:(seconds:number)=>void;popped:boolean;returned?:number;onPopout:(video:Video,start:number)=>Promise<void>}
export function Watch({playlist,onQueueWatch,onQueueClose,onQueueRepeat,docked=false,onRestore,onStop,video:v,shared,focus,theater,setFocus,setTheater,onSample,onElapsed,popped,returned,onPopout}:Props){
 const {data,change,follow,channel}=shared
 const [newPlaylist,setNewPlaylist]=useState('')
 const [collection,setCollection]=useState(''),[share,setShare]=useState(false),[message,setMessage]=useState(''),[ended,setEnded]=useState(false),[restricted,setRestricted]=useState(false),[opening,setOpening]=useState(false)
 const [showQueue,setShowQueue]=useState(false)
 const playerPosition=useRef<()=>number>(()=>0)
 const status=useScheduledStatus(v.id,v.scheduledAt),checked=useWatchCreator(v.id,true),uploader=checked.creator
 const video=uploader?{...v,channelId:uploader.id,channel:uploader.name,date:v.date||uploader.date,title:v.title==='YouTube video'?uploader.title||v.title:v.title,description:v.description||uploader.description||'',views:v.views||uploader.views,duration:v.duration||uploader.duration||0}:v
 const live=status==='live'||(uploader?uploader.live:!!v.live),waiting=!!v.scheduledAt&&status==='waiting'&&!live
 const allowed=!restricted&&(uploader?.embeddable??v.embeddable)
 const next=useUpNext(video,data,Object.values(shared.feeds.states).flatMap(s=>s.feed?.videos??[]).filter(v=>!Object.values(shared.live.states).some(s=>!s.error&&s.video?.id===v.id)))
 useEffect(()=>{if(uploader&&data.settings.history)change(d=>rememberVideo(d,video))},[uploader?.id,uploader?.title,uploader?.date])
 function played(){if(data.settings.history)change(d=>{const topic=categoryFor(video);return {...rememberVideo(d,video),history:{...d.history,[v.id]:Date.now()},interests:topic?{...d.interests,[topic]:(d.interests[topic]??0)+1}:d.interests}})}
 async function original(){setOpening(true);setMessage('');try{await invoke('original_player',{id:v.id,dark:data.settings.theme==='dark'})}catch(e){setMessage(errorText(e))}finally{setOpening(false)}}
 if(!visible(video,data.settings))return <Empty title="Video hidden" detail="This video matches one of your content filters."/>
 const later=data.later.includes(v.id),fav=data.favorites.includes(v.id),progress=data.settings.progress?data.progress[v.id]:undefined
 const start=returned??(progress&&progress.at<progress.duration-5?progress.at:0)
 return <div className={'watch '+(live&&!focus?'with-live-chat ':'')+(theater?'theater':'')+(docked?' watch-docked':'')+(showQueue?' dock-queue-open':'')+(popped?' watch-popped':'')}>
 <div className="watch-media-layout">{docked&&<div className="dock-header"><button onClick={onRestore} title="Return to video">{video.title}</button><button className="icon" aria-label="Show queue" onClick={()=>{if(!playlist)shared.enqueue(video);setShowQueue(playlist?!showQueue:true)}}>☷</button><button className="icon" aria-label="Close mini player" onClick={onStop}><X size={16}/></button></div>}<div className="watch-media">
 {popped?<div className="popped-placeholder"><PictureInPicture2 size={36}/><p>Playing in your mini player</p><button className="button" onClick={()=>void invoke('close_player')}>Bring back here</button></div>:waiting?<div className="scheduled-watch">{v.image&&<img src={v.image} alt=""/>}<ScheduledDetails video={v} data={data} change={change}/></div>:allowed?<PlayerFrame id={v.id} live={live} start={live||checked.loading?0:start} onController={getter=>{playerPosition.current=getter}} onRestricted={()=>setRestricted(true)} onEnded={()=>setEnded(true)} onElapsed={onElapsed} onSample={(p,d,t)=>onSample(v.id,p,d,t,live)} onPlay={played}/>:<div className="original-player-card"><img src={v.image||'https://i.ytimg.com/vi/'+v.id+'/hqdefault.jpg'} alt=""/><div><span className="eyebrow">ORIGINAL YOUTUBE PLAYER</span><h2>This video plays on YouTube’s own player</h2><p>The creator limits embedded playback. Open the original watch page in a Viddy window.</p><button className="button accent" disabled={opening} onClick={()=>void original()}><Play size={17}/>{opening?'Opening…':'Play in Viddy'}</button></div></div>}
 </div>{live&&!focus&&<LiveChat key={v.id} id={v.id}/>}</div>
 {!focus&&!docked&&<><div className="watch-view-controls"><span>Player</span><button onClick={()=>shared.enqueue(video)}>Queue</button><button aria-label="Focus Player" onClick={()=>setFocus(true)}><Maximize size={14}/> Focus</button><button aria-pressed={theater} onClick={()=>setTheater(!theater)}>{theater?'Exit theater':'Theater mode'}</button><button disabled={popped||waiting||!allowed} onClick={()=>void onPopout({...video,live},live?0:playerPosition.current()).catch(e=>setMessage(errorText(e)))}><PictureInPicture2 size={14}/> Pop out</button></div>
 <section className="watch-overview"><h1>{video.title}</h1><div className="watch-identity-row"><div className="watch-creator">{video.channelId&&<CreatorAvatar id={video.channelId} name={video.channel} src={video.creators?.[0]?.image||video.channelImage}/>}<div><CreatorByline video={video} onChannel={channel}/><p className="watch-video-meta">{[video.views,day(video.date)||video.publishedLabel].filter(Boolean).join(' · ')}</p></div>{video.channelId&&<button className={'button '+(!data.follows.includes(video.channelId)?'accent':'')} onClick={()=>follow(video.channelId)}>{data.follows.includes(video.channelId)?'Following':'Follow'}</button>}</div><div className="watch-actions watch-social-actions"><button className="button" aria-pressed={later} onClick={()=>change(d=>({...rememberVideo(d,video),later:toggled(d.later,v.id)}))}><Clock3 size={15}/>{later?'Saved for later':'Watch later'}</button><button className="button" aria-label={fav?'Remove favorite':'Favorite'} title="Favorite" aria-pressed={fav} onClick={()=>change(d=>({...rememberVideo(d,video),favorites:toggled(d.favorites,v.id)}))}><Heart size={16}/></button><button className="button" aria-expanded={share} onClick={()=>{setShare(!share);setMessage('')}}><Share2 size={15}/> Share</button><DownloadButton video={video} disabled={live||waiting}/></div></div>
 {share&&<div className="share-panel row wrap" onKeyDown={e=>{if(e.key==='Escape')setShare(false)}}><label>Video link<input readOnly value={'https://www.youtube.com/watch?v='+v.id} onFocus={e=>e.currentTarget.select()}/></label><button className="button accent" onClick={()=>void navigator.clipboard.writeText('https://www.youtube.com/watch?v='+v.id).then(()=>{setShare(false);setMessage('Link copied.')},()=>setMessage('Select the link and copy it.'))}>Copy link</button><button className="icon" aria-label="Close share" onClick={()=>setShare(false)}><X size={16}/></button></div>}
 {message&&<Notice text={message}/>}
 <div className="watch-details-row">{video.description&&<details className="watch-description"><summary>Description</summary><p className="description">{video.description}</p></details>}{<details className="collection-saver"><summary><BookmarkPlus size={15}/> Save to playlist</summary><form className="row wrap" onSubmit={e=>{e.preventDefault();if(newPlaylist.trim()){const name=newPlaylist.trim();if(data.collections.some(c=>c.name===name)||data.collections.length>=200)return;change(d=>({...rememberVideo(d,video),collections:[...d.collections,{name,ids:[v.id]}]}));setNewPlaylist('');setMessage('Playlist created.');return}if(collection==='')return;change(d=>({...rememberVideo(d,video),collections:d.collections.map((c,i)=>i===Number(collection)?{...c,ids:[...new Set([...c.ids,v.id])]}:c)}));setCollection('');setMessage('Saved to playlist.')}}><select aria-label="Playlist" value={collection} onChange={e=>setCollection(e.target.value)}><option value="">Choose playlist</option>{data.collections.map((c,i)=><option value={i} key={i}>{c.name}{c.ids.includes(v.id)?' · saved':''}</option>)}</select><input aria-label="New playlist name" placeholder="Or create a new playlist" maxLength={80} value={newPlaylist} onChange={e=>setNewPlaylist(e.target.value)}/><button className="button" disabled={collection===''&&!newPlaylist.trim()}>Save</button></form></details>}</div></section></>}
 <div className={'watch-bottom-grid '+(focus?'focus-bottom':'')}>
 {!focus&&!docked&&!live&&!waiting&&<VideoComments key={v.id} id={v.id} onChannel={channel}/>}
 {playlist&&!popped&&<aside className="watch-playlist"><PlaylistPlayer queue={playlist} data={data} ended={ended} onWatch={onQueueWatch} onClose={()=>{onQueueClose();setShowQueue(false)}} onRepeat={onQueueRepeat}/></aside>}
 {!playlist&&!live&&!waiting&&!popped&&<aside className="watch-recommendations"><UpNext videos={next} autoplay={data.settings.autoplay} ended={ended} onToggle={()=>change(d=>({...d,settings:{...d.settings,autoplay:!d.settings.autoplay}}))} onWatch={docked?shared.playNext:shared.watch}/></aside>}
 </div>{!focus&&!docked&&<p className="player-attribution">Playback provided by YouTube.</p>}
 </div>
}
