import {useEffect,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {KeyRound,Palette,SlidersHorizontal,Shield,Monitor,Download,Upload,Trash2,PlaySquare} from 'lucide-react'
import {channelId,errorText} from './domain'
import {channelByHandle} from './youtube'
import {decode,empty,type Library,type Settings} from './library'
type SetSetting=<K extends keyof Settings>(key:K,value:Settings[K])=>void
function Toggle({label,value,onChange}:{label:string;value:boolean;onChange:(v:boolean)=>void}) {return <label className="toggle"><span>{label}</span><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/></label>}
function TextList({label,values,onChange}:{label:string;values:string[];onChange:(v:string[])=>void}) {
 const [text,setText]=useState('')
 return <div className="setting-stack"><form className="row" onSubmit={e=>{e.preventDefault();const v=text.trim();if(v&&!values.includes(v)){onChange([...values,v]);setText('')}}}><input aria-label={label} placeholder={label} maxLength={256} value={text} onChange={e=>setText(e.target.value)}/><button className="button" disabled={!text.trim()}>Add</button></form><div className="chips">{values.map(v=><button className="chip" key={v} aria-label={'Remove '+v} onClick={()=>onChange(values.filter(x=>x!==v))}>{v} &times;</button>)}</div></div>
}
export function Preferences({data,setting,change,keyReady,onKey}:{data:Library;setting:SetSetting;change:(fn:(d:Library)=>Library)=>void;keyReady:boolean;onKey:(value:boolean)=>void}) {
 const s=data.settings,[key,setKey]=useState(''),[message,setMessage]=useState(''),[autostart,setAutostart]=useState(false),[blocked,setBlocked]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{invoke<boolean>('startup',{enabled:null}).then(setAutostart).catch(e=>setMessage(errorText(e)))},[])
 async function action(fn:()=>Promise<void>) {setBusy(true);setMessage('');try{await fn()}catch(e){setMessage(errorText(e))}finally{setBusy(false)}}
 const toggle=(k:'collapsed'|'quietSession'|'views'|'likes'|'subscribers'|'history'|'progress'|'showTime'|'focus'|'tray',label:string)=><Toggle label={label} value={s[k]} onChange={v=>setting(k,v)}/>
 return <div className="settings">
 {message&&<p className="notice sticky" role="status">{message}</p>}
 <section><h2><KeyRound/> Optional YouTube API key</h2><p>Quiet Mode and video links work without a key. Add a YouTube Data API v3 key for in-app search and more channel details. PureTube stores your key in Windows Credential Manager.</p>
 <form className="row" onSubmit={e=>{e.preventDefault();void action(async()=>{await invoke('set_key',{key});setKey('');onKey(true);setMessage('API key saved. Try searching in Discover.')})}}><input type="password" autoComplete="off" aria-label="YouTube API key" placeholder={keyReady?'API key saved':'Paste your API key'} value={key} onChange={e=>setKey(e.target.value)}/><button className="button accent" disabled={busy||!key.trim()}>Save key</button>{keyReady&&<button className="button" type="button" disabled={busy} onClick={()=>void action(async()=>{await invoke('set_key',{key:''});onKey(false);setMessage('API key removed.')})}>Remove key</button>}</form>
 </section>
 <section><h2><Palette/> Appearance</h2><label>Theme <select value={s.theme} onChange={e=>setting('theme',e.target.value as Settings['theme'])}><option value="dark">Dark</option><option value="light">Light</option></select></label>
 <label>Accent <select value={s.accent} onChange={e=>setting('accent',e.target.value as Settings['accent'])}><option value="mint">Mint</option><option value="blue">Blue</option><option value="peach">Peach</option></select></label>
 <label>Thumbnail density <select value={s.density} onChange={e=>setting('density',e.target.value as Settings['density'])}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>{toggle('collapsed','Collapse sidebar')}</section>
 <section><h2><SlidersHorizontal/> Browsing and filters</h2><label>Startup mode <select value={s.startup} onChange={e=>setting('startup',e.target.value as Settings['startup'])}><option value="remember">Remember last mode</option><option value="quiet">Always Quiet</option></select></label>
 {toggle('quietSession','Quiet Session: hide Discover')}
 <p>Topics appear in Discover. Blocked phrases match titles and descriptions, ignoring case.</p><TextList label="Add a topic" values={s.topics} onChange={v=>setting('topics',v)}/><TextList label="Block a word or phrase" values={s.keywords} onChange={v=>setting('keywords',v)}/>
 <form className="row" onSubmit={e=>{e.preventDefault();void action(async()=>{const v=blocked.trim();const id=channelId(v)?v:v.startsWith('@')?(await channelByHandle(v))?.id:undefined;if(!id) throw new Error('Enter a valid channel ID or @handle.');setting('blocked',[...new Set([...s.blocked,id])]);setBlocked('')})}}><input aria-label="Channel to block" placeholder="Block a channel by ID or @handle" value={blocked} onChange={e=>setBlocked(e.target.value)}/><button className="button" disabled={busy||!blocked.trim()}>Block</button></form>
 <div className="chips">{s.blocked.map(id=><button className="chip" key={id} aria-label={'Unblock '+id} onClick={()=>setting('blocked',s.blocked.filter(x=>x!==id))}>{id} &times;</button>)}</div>
 <p>Shorts links and creator tags are filtered where available. Untagged Shorts can slip through, especially in public feeds. Paid product placement is filtered when the Data API supplies that information.</p>
 {toggle('views','Show view counts')}{toggle('likes','Show like counts')}{toggle('subscribers','Show subscriber counts')}
 </section>
 <section><h2><PlaySquare/> Playback</h2><p>Autoplay is off. Use the YouTube player's keyboard controls while it's focused. YouTube may show ads and related videos inside its player.</p>
 {toggle('focus','Open videos in Focus Player')}{toggle('progress','Track playback progress')}{toggle('showTime','Show viewing time this session')}
 <label>Daily viewing reminder (minutes; 0 disables) <input type="number" min="0" max="1440" value={s.reminder} onChange={e=>setting('reminder',Math.min(1440,Math.max(0,Math.floor(Number(e.target.value)||0))))}/></label>
 </section>
 <section><h2><Shield/> Privacy and library</h2>{toggle('history','Track watch history')}<p>Follows, watch history, progress, collections, and preferences are kept on this PC. Backups never include the API key. Google receives requests for searches, public metadata, thumbnails, and playback.</p>
 <div className="row wrap">{([['terms','YouTube Terms of Service'],['privacy','Google Privacy Policy']] as const).map(([page,label])=><button className="button" key={page} onClick={()=>void action(()=>invoke('open_info',{page}))}>{label}</button>)}</div>
 <div className="row wrap"><button className="button" disabled={busy} onClick={()=>void action(async()=>{if(await invoke('export_library',{data}))setMessage('Library backup saved.')})}><Download size={16}/> Export backup</button>
 <button className="button" disabled={busy} onClick={()=>void action(async()=>{const imported=await invoke<unknown>('import_library');if(!imported)return;const decoded=decode(imported);if(!confirm('Replace your current PureTube library and preferences with this backup?'))return;change(()=>decoded);setMessage('Library imported.')})}><Upload size={16}/> Import backup</button>
 <button className="button" onClick={()=>{if(confirm('Clear all watch history?'))change(d=>({...d,history:{}}))}}><Trash2 size={16}/> Clear history</button>
 <button className="button" onClick={()=>{if(confirm('Clear all saved playback positions?'))change(d=>({...d,progress:{}}))}}>Clear progress</button>
 <button className="button danger" onClick={()=>{if(confirm('Reset the local library and all preferences? Your API key will remain saved.'))change(()=>empty())}}>Reset local data</button></div></section>
 <section><h2><Monitor/> Desktop</h2><Toggle label="Launch on Windows startup" value={autostart} onChange={v=>void action(async()=>setAutostart(await invoke<boolean>('startup',{enabled:v})))}/>{toggle('tray','Minimize to the system tray')}<p>PureTube remembers the window's position and size. Pin it from the Start Menu or taskbar. Install a newer trusted release to update.</p></section>
 </div>
}

