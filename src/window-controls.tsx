import {useEffect,useState} from 'react'
import {getCurrentWindow} from '@tauri-apps/api/window'
import {Minus,Square,Copy,X} from 'lucide-react'

const windowHandle=getCurrentWindow()
export function WindowControls(){
 const [maximized,setMaximized]=useState(false)
 useEffect(()=>{
   let active=true
   const sync=()=>void windowHandle.isMaximized().then(value=>{if(active)setMaximized(value)},()=>{})
   sync()
   const cleanup=windowHandle.onResized(sync)
   return ()=>{active=false;void cleanup.then(unlisten=>unlisten(),()=>{})}
 },[])
 return <div className="window-controls" aria-label="Window controls">
   <button className="window-control" aria-label="Minimize window" title="Minimize" onClick={()=>void windowHandle.minimize().catch(()=>{})}><Minus size={16}/></button>
   <button className="window-control" aria-label={maximized?'Restore window':'Maximize window'} title={maximized?'Restore':'Maximize'} onClick={()=>void windowHandle.toggleMaximize().catch(()=>{})}>{maximized?<Copy size={14}/>:<Square size={14}/>}</button>
   <button className="window-control window-close" aria-label="Close window" title="Close" onClick={()=>void windowHandle.close().catch(()=>{})}><X size={17}/></button>
 </div>
}
