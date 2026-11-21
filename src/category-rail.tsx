import {useEffect,useId,useRef,useState} from 'react'
import {BookOpen,Camera,ChevronDown,Film,Gamepad2,LayoutGrid,Leaf,Music,Palette,Plane,Shirt,Sparkles,Utensils,X} from 'lucide-react'
const icons:Record<string,typeof Music>={'Gaming':Gamepad2,'Vlogs':Camera,'Style & beauty':Sparkles,'Fashion':Shirt,'Home & lifestyle':Leaf,'Music':Music,'Anime':Film,'Learning':BookOpen,'Travel':Plane,'Food':Utensils,'Art & design':Palette}
const label=(name:string)=>name==='Style & beauty'?'Beauty':name==='Home & lifestyle'?'Lifestyle':name==='Learning'?'Study':name
export function CategoryRail({names,selected,onSelect}:{names:string[];selected:string;onSelect:(name:string)=>void}){
 const [position,setPosition]=useState<{left:number;top:number;width:number;maxHeight:number}>()
 const host=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),id=useId()
 const primary=names.slice(0,7)
 if(names.includes(selected)&&!primary.includes(selected))primary[primary.length-1]=selected
 useEffect(()=>{
  if(!position)return
  const outside=(e:PointerEvent)=>{if(!host.current?.contains(e.target as Node))setPosition(undefined)}
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();setPosition(undefined);trigger.current?.focus()}}
  const close=()=>setPosition(undefined)
  const scroll=(e:Event)=>{if(!panel.current?.contains(e.target as Node))close()}
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape)
  window.addEventListener('resize',close);document.addEventListener('scroll',scroll,true)
  panel.current?.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus({preventScroll:true})
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);window.removeEventListener('resize',close);document.removeEventListener('scroll',scroll,true)}
 },[position])
 function choose(name:string){onSelect(name);setPosition(undefined)}
 function toggle(){
  if(position){setPosition(undefined);return}
  const rect=trigger.current!.getBoundingClientRect(),width=Math.min(480,window.innerWidth-32),top=rect.bottom+8
  setPosition({left:Math.max(16,Math.min(rect.left,window.innerWidth-width-16)),top,width,maxHeight:Math.max(120,Math.min(440,window.innerHeight-top-16))})
 }
 return <div className="category-carousel" ref={host} role="group" aria-label="Video categories">
  <div className="category-track">{primary.map(name=>{
   const Icon=icons[name]
   return <button key={name} className="category-chip" aria-pressed={selected===name} onClick={()=>choose(name)}>{Icon&&<Icon size={16}/>}<span>{label(name)}</span></button>
  })}</div>
  {names.length>primary.length&&<button className="category-picker-trigger" ref={trigger} aria-expanded={!!position} aria-controls={position?id:undefined} aria-haspopup="dialog" onClick={toggle}><LayoutGrid size={16}/><span>All categories</span><ChevronDown size={14}/></button>}
  {position&&<div className="category-popover" ref={panel} id={id} role="dialog" aria-label="All categories" style={position}>
   <header><strong>Browse categories</strong><button className="icon" aria-label="Close categories" onClick={()=>{setPosition(undefined);trigger.current?.focus()}}><X size={16}/></button></header>
   <div className="category-menu-grid">{names.map(name=>{const Icon=icons[name];return <button key={name} aria-pressed={name===selected} onClick={()=>{choose(name);trigger.current?.focus()}}>{Icon?<Icon size={16}/>:<span className="category-menu-dot"/>}<span>{label(name)}</span></button>})}</div>
  </div>}
 </div>
}
