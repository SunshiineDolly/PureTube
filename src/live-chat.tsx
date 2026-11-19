import {useState} from 'react'
import {MessageSquare,RefreshCw,X} from 'lucide-react'

export function LiveChat({id}:{id:string}){
 const [open,setOpen]=useState(true),[attempt,retry]=useState(0)
 const params=new URLSearchParams({v:id,embed_domain:location.hostname})
 if(document.documentElement.dataset.theme==='dark')params.set('dark_theme','1')
 if(!open)return <aside className="live-chat-closed"><button className="button" onClick={()=>setOpen(true)}><MessageSquare size={16}/> Show live chat</button></aside>
 return <aside className="live-chat" aria-label="Live chat">
   <header><h2><MessageSquare size={16}/> Live chat <span className="view-only">View only</span></h2><div className="row"><button className="icon small" title="Reload chat" aria-label="Reload live chat" onClick={()=>retry(n=>n+1)}><RefreshCw size={15}/></button><button className="icon small" title="Hide chat" aria-label="Hide live chat" onClick={()=>setOpen(false)}><X size={16}/></button></div></header>
   <iframe key={id+'-'+attempt} src={'https://www.youtube.com/live_chat?'+params} title="YouTube live chat" sandbox="allow-scripts allow-same-origin" referrerPolicy="strict-origin-when-cross-origin"/>
   <p>Live messages · Reading only</p>
 </aside>
}
