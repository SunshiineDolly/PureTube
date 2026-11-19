import {useEffect,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {Palette,SlidersHorizontal,Shield,Monitor,Download,Upload,Trash2,PlaySquare,RefreshCw} from 'lucide-react'
import {errorText} from './domain'
import {parseChannel} from './public-feeds'
import {decode,empty,type Library,type Settings} from './library'
import type {AppUpdates} from './updates'
import {accents,palettes,paletteStyle} from './palettes'
import {resetRecommendationMemory} from './use-recommendations'
type SetSetting=<K extends keyof Settings>(key:K,value:Settings[K])=>void
function Toggle({label,value,onChange}:{label:string;value:boolean;onChange:(v:boolean)=>void}) {return <label className="toggle"><span>{label}</span><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/></label>}
function TextList({label,values,onChange}:{label:string;values:string[];onChange:(v:string[])=>void}) {
 const [text,setText]=useState('')
 return <div className="setting-stack"><form className="row" onSubmit={e=>{e.preventDefault();const v=text.trim();if(v&&!values.includes(v)){onChange([...values,v]);setText('')}}}><input aria-label={label} placeholder={label} maxLength={256} value={text} onChange={e=>setText(e.target.value)}/><button className="button" disabled={!text.trim()}>Add</button></form><div className="chips">{values.map(v=><button className="chip" key={v} aria-label={'Remove '+v} onClick={()=>onChange(values.filter(x=>x!==v))}>{v} &times;</button>)}</div></div>
}
export function Preferences({data,setting,change,updates}:{data:Library;setting:SetSetting;change:(fn:(d:Library)=>Library)=>void;updates:AppUpdates}) {
 const s=data.settings,[message,setMessage]=useState(''),[autostart,setAutostart]=useState(false),[blocked,setBlocked]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{invoke<boolean>('startup',{enabled:null}).then(setAutostart).catch(e=>setMessage(errorText(e)))},[])
 async function action(fn:()=>Promise<void>) {setBusy(true);setMessage('');try{await fn()}catch(e){setMessage(errorText(e))}finally{setBusy(false)}}
 const toggle=(k:'collapsed'|'history'|'progress'|'showTime'|'focus'|'tray'|'autoplay'|'intro'|'themedCursor',label:string)=><Toggle label={label} value={s[k]} onChange={v=>setting(k,v)}/>
 return <div className="settings">
 {message&&<p className="notice sticky" role="status">{message}</p>}
 <section><h2><Palette/> Appearance</h2><label>Theme <select value={s.theme} onChange={e=>setting('theme',e.target.value as Settings['theme'])}><option value="dark">Dark</option><option value="light">Light</option></select></label>
 <div className="palette-options" role="group" aria-label="Color palette">{accents.map(accent=><button key={accent} type="button" className="palette-option" data-theme={s.theme} data-accent={accent} style={paletteStyle(s.theme,accent)} aria-pressed={s.accent===accent} onClick={()=>setting('accent',accent)}><span className="palette-preview" aria-hidden="true"><i/><i/><i/></span>{palettes[s.theme][accent]}</button>)}</div>
 <label>Thumbnail density <select value={s.density} onChange={e=>setting('density',e.target.value as Settings['density'])}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>{toggle('collapsed','Collapse sidebar')}{toggle('themedCursor','Use Viddy’s themed cursor')}{toggle('intro','Play the Viddy intro on launch')}<button className="button" disabled={!s.intro} onClick={()=>window.dispatchEvent(new Event('viddy-intro'))}>Preview intro</button></section>
 <section><h2><SlidersHorizontal/> Content filters</h2>
 <p>Blocked phrases match titles and descriptions, ignoring case.</p>
 <TextList label="Block a word or phrase" values={s.keywords} onChange={v=>setting('keywords',v)}/> <form className="row" onSubmit={e=>{e.preventDefault();void action(async()=>{const id=parseChannel(blocked);if(!id) throw new Error('Enter a valid channel ID or channel link.');setting('blocked',[...new Set([...s.blocked,id])]);setBlocked('')})}}><input aria-label="Channel to block" placeholder="Block a channel by ID or link" value={blocked} onChange={e=>setBlocked(e.target.value)}/><button className="button" disabled={busy||!blocked.trim()}>Block</button></form>
 <div className="chips">{s.blocked.map(id=><button className="chip" key={id} aria-label={'Unblock '+id} onClick={()=>setting('blocked',s.blocked.filter(x=>x!==id))}>{id} &times;</button>)}</div>
 <p>Viddy excludes Shorts that YouTube identifies in its public results, links, or creator tags.</p>
 </section>
 <section><h2><PlaySquare/> Playback</h2><p>Videos start when selected. Use the player’s controls for playback or fullscreen. YouTube may show ads and related videos inside its player.</p>
 {toggle('autoplay','Autoplay recommendations after a video ends')}{toggle('focus','Open videos in Focus Player')}{toggle('progress','Track playback progress')}{toggle('showTime','Show viewing time this session')}
 <label>Daily viewing reminder (minutes; 0 disables) <input type="number" min="0" max="1440" value={s.reminder} onChange={e=>setting('reminder',Math.min(1440,Math.max(0,Math.floor(Number(e.target.value)||0))))}/></label>
 </section>
 <section><h2><Shield/> Privacy and library</h2>{toggle('history','Track watch history')}<p>Follows, watch history, progress, collections, and preferences are kept on this PC. Google receives requests for public search, feeds, thumbnails, and playback.</p>
 <div className="row wrap">{([['terms','YouTube Terms of Service'],['privacy','Google Privacy Policy']] as const).map(([page,label])=><button className="button" key={page} onClick={()=>void action(()=>invoke('open_info',{page}))}>{label}</button>)}</div>
 <div className="row wrap"><button className="button" disabled={busy} onClick={()=>void action(async()=>{if(await invoke('export_library',{data}))setMessage('Library backup saved.')})}><Download size={16}/> Export backup</button>
 <button className="button" disabled={busy} onClick={()=>void action(async()=>{const imported=await invoke<unknown>('import_library');if(!imported)return;const decoded=decode(imported);if(!confirm('Replace your current Viddy library and preferences with this backup?'))return;change(()=>decoded);setMessage('Library imported.')})}><Upload size={16}/> Import backup</button>
 <button className="button" onClick={()=>{if(confirm('Clear all watch history and category preferences?')){resetRecommendationMemory();change(d=>({...d,history:{},interests:{},savedVideos:Object.fromEntries(Object.entries(d.savedVideos).filter(([id])=>d.later.includes(id)||d.favorites.includes(id)||d.collections.some(c=>c.ids.includes(id))))}))}}}><Trash2 size={16}/> Clear history</button>
 <button className="button" onClick={()=>{resetRecommendationMemory();change(d=>({...d,interests:{},dismissed:[]}));setMessage('Recommendation preferences reset.')}}>Reset recommendations</button>
 <button className="button" onClick={()=>{if(confirm('Clear all saved playback positions?'))change(d=>({...d,progress:{}}))}}>Clear progress</button>
 <button className="button danger" onClick={()=>{if(confirm('Reset the local library and all preferences?')){resetRecommendationMemory();change(()=>empty())}}}>Reset local data</button></div></section>
 <section><h2><Monitor/> Desktop</h2><Toggle label="Launch on Windows startup" value={autostart} onChange={v=>void action(async()=>setAutostart(await invoke<boolean>('startup',{enabled:v})))}/>{toggle('tray','Minimize to the system tray')}<p>Viddy remembers the window's position and size. Pin it from the Start Menu or taskbar. Install a newer trusted release to update.</p></section>
 <section><h2><RefreshCw/> App updates</h2>
 {updates.version&&<p className="meta">Viddy {updates.version}{updates.lastChecked?' · Checked '+new Date(updates.lastChecked).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):''}</p>}
 <p role="status">{updates.message|| (updates.configured===false?'Updates are unavailable in this test build.':updates.busy==='installing'?updates.progress?.event==='installing'?'Installing the update. Viddy will restart automatically.':updates.progress?.event==='verifying'?'Verifying the update signature...':updates.progress?.event==='downloading'&&updates.progress.total?'Downloading update · '+Math.min(100,Math.round(updates.progress.downloaded/updates.progress.total*100))+'%':'Downloading the signed update...':updates.busy==='checking'?'Checking for updates...':updates.release?'Viddy '+updates.release.version+' is ready to install.':updates.release===null?'You’re up to date.':'Viddy checks for updates automatically.')}</p>
 {updates.busy==='installing'&&<progress className="update-progress" aria-label="Update download progress" max={updates.progress?.event==='downloading'?updates.progress.total??undefined:undefined} value={updates.progress?.event==='downloading'&&updates.progress.total?updates.progress.downloaded:undefined}/>}
 {updates.release?.notes&&<details><summary>Release notes</summary><p className="description">{updates.release.notes}</p></details>}
 {!!updates.configured&&<div className="row wrap"><button className="button" disabled={!!updates.busy} onClick={()=>void updates.check()}>Check for updates</button>
 {updates.release&&<button className="button accent" disabled={!!updates.busy} onClick={()=>{if(confirm('Update to Viddy '+updates.release?.version+' and restart? Your follows, library, and preferences will be kept.'))void updates.install()}}>Update and restart</button>}</div>}</section>
 </div>
}
