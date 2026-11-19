import {channelId} from './domain.ts'

export const MAX_SUBSCRIPTIONS_BYTES=4*1024*1024
export function parseSubscriptions(csv:string):string[] {
 const result=new Set<string>()
 let cells:string[]=[], cell='', quoted=false, closed=false
 function pushCell() {if(cells.length<2)cells.push(cell.trim());cell='';closed=false}
 function pushRow() {
   pushCell()
   const [id,url]=cells
   if(channelId(id??''))result.add(id)
   else if(url) {
     try {
       const parsed=new URL(url)
       const match=/^\/channel\/(UC[\w-]{22})\/?$/.exec(parsed.pathname)
       if(parsed.protocol==='https:'&&['www.youtube.com','youtube.com','m.youtube.com'].includes(parsed.hostname)&&match)result.add(match[1])
     } catch { /* header or invalid URL */ }
   }
   cells=[]
 }
 for(let i=csv.charCodeAt(0)===0xfeff?1:0;i<csv.length;i++){
   const ch=csv[i]
   if(quoted){
     if(ch==='"'){
       if(csv[i+1]==='"'){cell+='"';i++}
       else {quoted=false;closed=true}
     } else cell+=ch
   } else if(ch===',')pushCell()
   else if(ch==='\n'||ch==='\r'){
     pushRow()
     if(ch==='\r'&&csv[i+1]==='\n')i++
   } else if(ch==='"'&&!cell&&!closed)quoted=true
   else if(closed&&!/\s/.test(ch))throw Error('This CSV has a malformed quoted field.')
   else if(!closed)cell+=ch
 }
 if(quoted)throw Error('This CSV ends inside a quoted field.')
 if(cell||cells.length)pushRow()
 if(!result.size)throw Error('No channel IDs found. Choose the subscriptions CSV from your extracted YouTube Takeout archive.')
 return [...result]
}
export function mergeSubscriptions(existing:string[], incoming:string[], blocked:string[]) {
 const seen=new Set(existing), excluded=new Set(blocked)
 const added=incoming.filter(id=>{
   if(seen.has(id)||excluded.has(id))return false
   seen.add(id);return true
 })
 return {follows:[...existing,...added],added:added.length}
}
