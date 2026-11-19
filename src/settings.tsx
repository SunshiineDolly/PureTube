import {useEffect,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {Palette,SlidersHorizontal,Shield,Monitor,Download,Upload,Trash2,PlaySquare} from 'lucide-react'
import {errorText} from './domain'
import {parseChannel} from './public-feeds'
import {decode,empty,type Library,type Settings} from './library'
type SetSetting=<K extends keyof Settings>(key:K,value:Settings[K])=>void
function Toggle({label,value,onChange}:{label:string;value:boolean;onChange:(v:boolean)=>void}) {return <label className="toggle"><span>{label}</span><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/></label>}
function TextList({label,values,onChange}:{label:string;values:string[];onChange:(v:string[])=>void}) {
 const [text,setText]=useState('')
 return <div className="setting-stack"><form className="row" onSubmit={e=>{e.preventDefault();const v=text.trim();if(v&&!values.includes(v)){onChange([...values,v]);setText('')}}}><input aria-label={label} placeholder={label} maxLength={256} value={text} onChange={e=>setText(e.target.value)}/><button className="button" disabled={!text.trim()}>Add</button></form><div className="chips">{values.map(v=><button className="chip" key={v} aria-label={'Remove '+v} onClick={()=>onChange(values.filter(x=>x!==v))}>{v} &times;</button>)}</div></div>
}
export function Preferences({data,setting,change}:{data:Library;setting:SetSetting;change:(fn:(d:Library)=>Library)=>void}) {
 const s=data.settings,[message,setMessage]=useState(''),[autostart,setAutostart]=useState(false),[blocked,setBlocked]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{invoke<boolean>('startup',{enabled:null}).then(setAutostart).catch(e=>setMessage(errorText(e)))},[])
 async function action(fn:()=>Promise<void>) {setBusy(true);setMessage('');try{await fn()}catch(e){setMessage(errorText(e))}finally{setBusy(false)}}
 const toggle=(k:'collapsed'|'history'|'progress'|'showTime'|'focus'|'tray',label:string)=><Toggle label={label} value={s[k]} onChange={v=>setting(k,v)}/>
 return <div className="settings">
 {message&&<p className="notice sticky" role="status">{message}</p>}
 <section><h2><Palette/> Appearance</h2><label>Theme <select value={s.theme} onChange={e=>setting('theme',e.target.value as Settings['theme'])}><option value="dark">Dark</option><option value="light">Light</option></select></label>
 <label>Accent <select value={s.accent} onChange={e=>setting('accent',e.target.value as Settings['accent'])}><option value="mint">Mint</option><option value="blue">Blue</option><option value="peach">Peach</option></select></label>
 <label>Thumbnail density <select value={s.density} onChange={e=>setting('density',e.target.value as Settings['density'])}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>{toggle('collapsed','Collapse sidebar')}</section>
 <section><h2><SlidersHorizontal/> Content filters</h2>
 <p>Blocked phrases match titles and descriptions, ignoring case.</p>
 <TextList label="Block a word or phrase" values={s.keywords} onChange={v=>setting('keywords',v)}/> <form className="row" onSubmit={e=>{e.preventDefault();void action(async()=>{const id=parseChannel(blocked);if(!id) throw new Error('Enter a valid channel ID or channel link.');setting('blocked',[...new Set([...s.blocked,id])]);setBlocked('')})}}><input aria-label="Channel to block" placeholder="Block a channel by ID or link" value={blocked} onChange={e=>setBlocked(e.target.value)}/><button className="button" disabled={busy||!blocked.trim()}>Block</button></form>
 <div className="chips">{s.blocked.map(id=><button className="chip" key={id} aria-label={'Unblock '+id} onClick={()=>setting('blocked',s.blocked.filter(x=>x!==id))}>{id} &times;</button>)}</div>
 <p>Shorts links and creator tags are filtered where available. Untagged Shorts can slip through, especially in public feeds. Public feeds do not identify paid product placement.</p>
 </section>
 <section><h2><PlaySquare/> Playback</h2><p>Autoplay is off. Use the YouTube player's keyboard controls while it's focused. YouTube may show ads and related videos inside its player.</p>
 {toggle('focus','Open videos in Focus Player')}{toggle('progress','Track playback progress')}{toggle('showTime','Show viewing time this session')}
 <label>Daily viewing reminder (minutes; 0 disables) <input type="number" min="0" max="1440" value={s.reminder} onChange={e=>setting('reminder',Math.min(1440,Math.max(0,Math.floor(Number(e.target.value)||0))))}/></label>
 </section>
 <section><h2><Shield/> Privacy and library</h2>{toggle('history','Track watch history')}<p>Follows, watch history, progress, collections, and preferences are kept on this PC. Google receives requests for public feeds, thumbnails, and playback. PureTube reads the subscriptions CSV locally.</p>
 <div className="row wrap">{([['terms','YouTube Terms of Service'],['privacy','Google Privacy Policy']] as const).map(([page,label])=><button className="button" key={page} onClick={()=>void action(()=>invoke('open_info',{page}))}>{label}</button>)}</div>
 <div className="row wrap"><button className="button" disabled={busy} onClick={()=>void action(async()=>{if(await invoke('export_library',{data}))setMessage('Library backup saved.')})}><Download size={16}/> Export backup</button>
 <button className="button" disabled={busy} onClick={()=>void action(async()=>{const imported=await invoke<unknown>('import_library');if(!imported)return;const decoded=decode(imported);if(!confirm('Replace your current PureTube library and preferences with this backup?'))return;change(()=>decoded);setMessage('Library imported.')})}><Upload size={16}/> Import backup</button>
 <button className="button" onClick={()=>{if(confirm('Clear all watch history?'))change(d=>({...d,history:{}}))}}><Trash2 size={16}/> Clear history</button>
 <button className="button" onClick={()=>{if(confirm('Clear all saved playback positions?'))change(d=>({...d,progress:{}}))}}>Clear progress</button>
 <button className="button danger" onClick={()=>{if(confirm('Reset the local library and all preferences?'))change(()=>empty())}}>Reset local data</button></div></section>
 <section><h2><Monitor/> Desktop</h2><Toggle label="Launch on Windows startup" value={autostart} onChange={v=>void action(async()=>setAutostart(await invoke<boolean>('startup',{enabled:v})))}/>{toggle('tray','Minimize to the system tray')}<p>PureTube remembers the window's position and size. Pin it from the Start Menu or taskbar. Install a newer trusted release to update.</p></section>
 </div>
}
