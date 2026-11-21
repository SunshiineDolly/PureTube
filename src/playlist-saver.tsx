import {useState} from 'react'
import {BookmarkPlus,ChevronDown,Plus} from 'lucide-react'
import {rememberVideo,type Library} from './library'
import type {Video} from './domain'

export function PlaylistSaver({video,data,change,onSaved}:{video:Video;data:Library;change:(update:(d:Library)=>Library)=>void;onSaved:(message:string)=>void}){
 const [creating,setCreating]=useState(!data.collections.length),[name,setName]=useState(''),[selected,setSelected]=useState(data.collections[0]?.name??''),[error,setError]=useState('')
 const playlist=data.collections.find(c=>c.name===selected),saved=playlist?.ids.includes(video.id)
 function create(){
   const title=name.trim()
   if(!title){setError('Enter a playlist name.');return}
   if(data.collections.some(c=>c.name.toLocaleLowerCase()===title.toLocaleLowerCase())){setError('A playlist with that name already exists.');return}
   if(data.collections.length>=200){setError('You can have up to 200 playlists.');return}
   change(d=>({...rememberVideo(d,video),collections:[...d.collections,{name:title,ids:[video.id]}]}))
   setSelected(title);setName('');setCreating(false);setError('');onSaved('Created “'+title+'” and saved this video.')
 }
 function save(){
   if(!playlist)return
   change(d=>({...rememberVideo(d,video),collections:d.collections.map(c=>c.name===selected?{...c,ids:saved?c.ids.filter(id=>id!==video.id):[...new Set([...c.ids,video.id])]}:c)}))
   onSaved(saved?'Removed from “'+selected+'”.':'Saved to “'+selected+'”.')
 }
 return <details className="collection-saver"><summary><BookmarkPlus size={16}/><span>Save to playlist</span><ChevronDown size={16} className="details-chevron"/></summary>
  <div className="playlist-saver-body">{creating?<form onSubmit={e=>{e.preventDefault();create()}}>
   <label className="playlist-field">New playlist name<input aria-label="New playlist name" placeholder="e.g. Weekend watching" maxLength={80} value={name} onChange={e=>{setName(e.target.value);setError('')}}/></label>
   {error&&<p className="playlist-feedback" role="alert">{error}</p>}
   <div className="playlist-saver-actions">{data.collections.length>0&&<button type="button" className="button" onClick={()=>{setCreating(false);setError('')}}>Cancel</button>}<button className="button accent" disabled={!name.trim()||data.collections.length>=200}>Create and save</button></div>
  </form>:<form onSubmit={e=>{e.preventDefault();save()}}>
   <label className="playlist-field">Playlist<select aria-label="Playlist" value={playlist?selected:''} onChange={e=>setSelected(e.target.value)}><option value="" disabled>Choose a playlist</option>{data.collections.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select></label>
   <p className="playlist-feedback" role="status">{saved?'This video is saved in this playlist.':'Choose where to keep this video.'}</p>
   <div className="playlist-saver-actions"><button type="button" className="button playlist-new" disabled={data.collections.length>=200} onClick={()=>{setCreating(true);setError('')}}><Plus size={15}/>New playlist</button><button className={'button '+(saved?'':'accent')} disabled={!playlist}>{saved?'Remove from playlist':'Add to playlist'}</button></div>
  </form>}</div>
 </details>
}
