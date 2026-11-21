import {BookOpen,Camera,Film,Gamepad2,Leaf,Music,Palette,Plane,Shirt,Sparkles,Utensils} from 'lucide-react'
const icons:Record<string,typeof Music>={'Gaming':Gamepad2,'Vlogs':Camera,'Style & beauty':Sparkles,'Fashion':Shirt,'Home & lifestyle':Leaf,'Music':Music,'Anime':Film,'Learning':BookOpen,'Travel':Plane,'Food':Utensils,'Art & design':Palette}
const label=(name:string)=>name==='Style & beauty'?'Beauty':name==='Home & lifestyle'?'Lifestyle':name==='Learning'?'Study':name
export function CategoryRail({names,selected,onSelect}:{names:string[];selected:string;onSelect:(name:string)=>void}){
 const primary=names.slice(0,7)
 if(names.includes(selected)&&!primary.includes(selected))primary[primary.length-1]=selected
 const remaining=names.filter(name=>!primary.includes(name))
 return <div className="category-carousel" role="group" aria-label="Video categories">
  <div className="category-track">{primary.map(name=>{
   const Icon=icons[name]
   return <button key={name} className="category-chip" aria-pressed={selected===name} onClick={()=>onSelect(name)}>{Icon&&<Icon size={17}/>}<span>{label(name)}</span></button>
  })}</div>
  {remaining.length>0&&<select className="category-more-select" aria-label="More categories" value="" onChange={e=>onSelect(e.target.value)}><option value="" disabled>More categories</option>{remaining.map(name=><option value={name} key={name}>{label(name)}</option>)}</select>}
 </div>
}
