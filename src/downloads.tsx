import {useEffect,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {listen} from '@tauri-apps/api/event'
import {Download,FolderOpen,RotateCw,X} from 'lucide-react'
import {errorText,type Video} from './domain'
type Job={id:string;video_id:string;title:string;status:string;percent:number;message:string;file?:string;quality:number}
export function DownloadButton({video,disabled=false}:{video:Video;disabled?:boolean}){
 const [quality,setQuality]=useState(1080),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 return <div className="download-action"><select aria-label="Download quality" disabled={busy||disabled} value={quality} onChange={e=>setQuality(Number(e.target.value))}><option value={1080}>Up to 1080p</option><option value={720}>Up to 720p</option><option value={0}>Best available</option></select><button className="button" disabled={busy||disabled} title={disabled?'Downloads are available for completed videos':undefined} onClick={async()=>{setBusy(true);setMessage('');try{await invoke('download_video',{videoId:video.id,title:video.title,quality});setMessage('Added to Downloads.')}catch(e){setMessage(errorText(e))}finally{setBusy(false)}}}><Download size={16}/>{busy?'Adding…':'Download'}</button>{message&&<span role="status" className="meta">{message}</span>}</div>
}
export function DownloadsPage(){
 const [jobs,setJobs]=useState<Job[]>([]),[error,setError]=useState('')
 useEffect(()=>{void invoke<Job[]>('download_list').then(setJobs,e=>setError(errorText(e)));const off=listen<Job[]>('downloads-changed',e=>setJobs(e.payload));const timer=setInterval(()=>void invoke<Job[]>('download_list').then(setJobs,()=>{}),5000);return()=>{clearInterval(timer);void off.then(f=>f())}},[])
 const active=(j:Job)=>['preparing','downloading','merging'].includes(j.status)
 return <div className="downloads-page"><div className="heading"><div><h1>Downloads</h1><p>Your videos, saved to Downloads/PureTube.</p></div><button className="button" onClick={()=>void invoke('open_downloads').catch(e=>setError(errorText(e)))}><FolderOpen size={16}/> Open folder</button></div><p className="meta">The first download prepares the required tools automatically. Download videos you own or have permission to save. Restricted videos and live broadcasts aren’t supported.</p>
 {error&&<p className="notice" role="status">{error}</p>}
 {!jobs.length&&<div className="empty"><Download size={28}/><h2>Keep something for later</h2><p>Open a video and select Download to save a copy.</p></div>}
 <div className="download-list">{jobs.map(job=><article className="download-job" key={job.id}><img src={'https://i.ytimg.com/vi/'+job.video_id+'/mqdefault.jpg'} alt=""/><div><h2>{job.title}</h2><p className="meta" role="status">{job.message}{job.status==='downloading'?' '+Math.round(job.percent)+'%':''}</p>{active(job)&&<progress aria-label={'Download progress for '+job.title} max={100} value={job.status==='preparing'?undefined:job.percent}/>}</div>{active(job)?<button className="icon" aria-label={'Cancel download '+job.title} onClick={()=>void invoke('download_cancel',{id:job.id})}><X size={17}/></button>:job.status!=='complete'?<button className="button" onClick={()=>void invoke('download_video',{videoId:job.video_id,title:job.title,quality:job.quality}).then(()=>invoke<Job[]>('download_list')).then(setJobs,e=>setError(errorText(e)))}><RotateCw size={15}/> Retry</button>:<span className="download-complete">Saved</span>}</article>)}</div></div>
}
