import {useRef} from 'react'
import {BookOpen,Camera,ChevronLeft,ChevronRight,Film,Gamepad2,Leaf,Music,Palette,Plane,Shirt,Sparkles,Utensils} from 'lucide-react'
const icons:Record<string,typeof Music>={'Gaming':Gamepad2,'Vlogs':Camera,'Style & beauty':Sparkles,'Fashion':Shirt,'Home & lifestyle':Leaf,'Music':Music,'Anime':Film,'Learning':BookOpen,'Travel':Plane,'Food':Utensils,'Art & design':Palette}
export function CategoryRail({names,selected,onSelect}:{names:string[];selected:string;onSelect:(name:string)=>void}){
 const rail=useRef<HTMLDivElement>(null)
 return <div className="category-carousel">
 <button className="icon carousel-arrow" aria-label="Previous categories" onClick={()=>rail.current?.scrollBy({left:-420,behavior:'smooth'})}><ChevronLeft size={18}/></button>
 <div className="category-track" ref={rail} aria-label="Video categories">{names.map(name=>{
   const Icon=icons[name]
   return <button key={name} className="category-chip" aria-pressed={selected===name} onClick={()=>onSelect(name)}>{Icon&&<Icon size={18}/>}<span>{name==='Style & beauty'?'Beauty':name==='Home & lifestyle'?'Lifestyle':name==='Learning'?'Study':name}</span></button>
 })}</div>
 <button className="icon carousel-arrow" aria-label="Next categories" onClick={()=>rail.current?.scrollBy({left:420,behavior:'smooth'})}><ChevronRight size={18}/></button>
 </div>
}
