import {useEffect,useId,useState,type RefObject} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {Search,X} from 'lucide-react'

export function SearchBar({inputRef,ready,text,setText,submit}:{inputRef:RefObject<HTMLInputElement|null>;ready:boolean;text:string;setText:(text:string)=>void;submit:(text:string)=>void}){
 const [open,setOpen]=useState(false),[active,setActive]=useState(-1)
 const [result,setResult]=useState<{query:string;items:string[]}>()
 const listId=useId(),query=text.trim()
 const items=open&&result?.query===query?result.items:[]
 useEffect(()=>{
   if(!ready||!open||query.length<2||/^(?:https?:|www\.|youtu\.be\/)/i.test(query))return
   let mounted=true
   const timer=setTimeout(()=>{invoke<string[]>('youtube_suggestions',{query}).then(items=>{if(mounted)setResult({query,items})},()=>{})},235)
   return ()=>{mounted=false;clearTimeout(timer)}
 },[query,open,ready])
 function choose(value:string,search=true){
   setText(value);setOpen(false);setActive(-1)
   if(search)submit(value)
 }
 return <form className="searchbar" role="search" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget)){setOpen(false);setActive(-1)}}} onSubmit={e=>{e.preventDefault();choose(items[active]??text)}}>
   <Search size={18}/>
   <input disabled={!ready} ref={inputRef} value={text} onChange={e=>{setText(e.target.value);setOpen(true);setActive(-1)}}
     onFocus={()=>setOpen(true)} onClick={()=>setOpen(true)} maxLength={256} placeholder="Search" aria-label="Search or paste a YouTube link"
     role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={!!items.length} aria-controls={items.length?listId:undefined} aria-activedescendant={items[active]?listId+'-'+active:undefined}
     onKeyDown={e=>{
       if(e.key==='Escape'){e.stopPropagation();setOpen(false);setActive(-1)}
       if(e.key==='ArrowDown'||e.key==='ArrowUp'){
         if(!items.length){setOpen(true);return}
         e.preventDefault()
         setActive(i=>e.key==='ArrowDown'?(i+1)%items.length:i<=0?items.length-1:i-1)
       }
       if(e.key==='Tab'&&items[active])choose(items[active],false)
     }}/>
   {text&&<button type="button" className="icon small" aria-label="Clear search" onClick={()=>{choose('',false);inputRef.current?.focus()}}><X size={15}/></button>}
   <button type="submit" className="search-submit" disabled={!ready||!text.trim()}><Search size={21}/><span className="sr-only">Search</span></button>
   {!!items.length&&<ul id={listId} role="listbox" aria-label="Search suggestions" className="search-suggestions">
     {items.map((item,i)=><li key={i} id={listId+'-'+i} role="option" aria-selected={active===i} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(item)}><Search size={15}/>{item}</li>)}
   </ul>}
 </form>
}
