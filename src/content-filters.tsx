import {useEffect,useState} from 'react'
import {invoke} from '@tauri-apps/api/core'
import {Search,ShieldBan,X} from 'lucide-react'
import {CreatorAvatar} from './creator-avatar'
import {parseChannel} from './public-feeds'
import type {Settings} from './library'

type Match={id:string;name:string;handle?:string;image?:string}
export function ContentFilters({settings,onKeywords,onBlocked}:{settings:Settings;onKeywords:(values:string[])=>void;onBlocked:(values:string[])=>void}){
 const [phrase,setPhrase]=useState(''),[query,setQuery]=useState(''),[selected,setSelected]=useState<Match[]>([])
 const [search,setSearch]=useState<{term:string;items:Match[];error?:string}>()
 const [names,setNames]=useState<Record<string,string>>(()=>{
   try{return JSON.parse(localStorage.getItem('viddy-blocked-channel-names')??'{}')??{}}catch{return {}}
 })
 const term=query.trim(),direct=parseChannel(term)
 useEffect(()=>{
   if(term.length<2||direct)return
   let active=true
   const timer=setTimeout(()=>{
     void invoke<Match[]>('search_creators',{query:term}).then(
       items=>{if(active)setSearch({term,items})},
       ()=>{if(active)setSearch({term,items:[],error:'Could not find channels right now. Try again or paste a channel ID.'})},
     )
   },350)
   return ()=>{active=false;clearTimeout(timer)}
 },[term,direct])
 function block(){
   const chosen=direct?[{id:direct,name:direct}]:selected
   if(!chosen.length)return
   const updated={...names,...Object.fromEntries(chosen.map(ch=>[ch.id,ch.name]))}
   setNames(updated)
   try{localStorage.setItem('viddy-blocked-channel-names',JSON.stringify(updated))}catch{}
   onBlocked([...new Set([...settings.blocked,...chosen.map(ch=>ch.id)])])
   setSelected([]);setQuery('');setSearch(undefined)
 }
 return <section className="filter-settings">
   <h2><ShieldBan/> Content filters</h2>
   <div className="filter-group"><h3>Words and phrases</h3><p>Hide videos when a match appears in the title or description.</p>
   <form className="filter-input-row" onSubmit={e=>{
     e.preventDefault()
     const value=phrase.trim().replace(/\s+/g,' ')
     if(value&&!settings.keywords.some(k=>k.normalize('NFKC').toLowerCase()===value.normalize('NFKC').toLowerCase())){
       onKeywords([...settings.keywords,value]);setPhrase('')
     }
   }}><input aria-label="Word or phrase to block" placeholder="Add a word or phrase" maxLength={256} value={phrase} onChange={e=>setPhrase(e.target.value)}/>
   <button className="button" disabled={!phrase.trim()}>Add</button></form>
   <div className="chips">{settings.keywords.map(value=><button className="chip" key={value} aria-label={'Unblock phrase '+value} onClick={()=>onKeywords(settings.keywords.filter(k=>k!==value))}>{value}<X size={13}/></button>)}</div></div>
   <div className="filter-group"><h3>Creators</h3><p>Search by name or handle, then select the creators to block.</p>
   <form className="filter-input-row" onSubmit={e=>{e.preventDefault();block()}}>
     <label className="filter-search"><Search size={16}/><input aria-label="Find a creator to block" placeholder="Search channels or paste a channel link" value={query} maxLength={256} onChange={e=>{setQuery(e.target.value);setSelected([])}}/></label>
     <button className="button accent" disabled={!direct&&!selected.length}>{selected.length?'Block selected ('+selected.length+')':'Block'}</button>
   </form>
   {term.length>=2&&!direct&&<div className="filter-results">
     {search?.term!==term?<p role="status">Finding channels…</p>:search.error?<p role="status">{search.error}</p>:search.items.length?search.items.map(ch=>{
       const blocked=settings.blocked.includes(ch.id)
       return <label key={ch.id} className="filter-result"><CreatorAvatar id={ch.id} name={ch.name} src={ch.image}/><span><strong>{ch.name}</strong><small>{blocked?'Blocked':ch.handle||ch.id}</small></span>
       <input type="checkbox" disabled={blocked} checked={blocked||selected.some(x=>x.id===ch.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,ch]:old.filter(x=>x.id!==ch.id))}/></label>
     }):<p role="status">No matching channels.</p>}
   </div>}
   <div className="chips">{settings.blocked.map(id=><button className="chip" key={id} aria-label={'Unblock '+(names[id]||id)} onClick={()=>onBlocked(settings.blocked.filter(x=>x!==id))}>{names[id]||id}<X size={13}/></button>)}</div></div>
 </section>
}
