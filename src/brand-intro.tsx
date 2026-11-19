import {useEffect,useState} from 'react'
import {BrandMark} from './brand'
export function BrandIntro({enabled}:{enabled:boolean}){
 const [visible,setVisible]=useState(false),[run,setRun]=useState(0)
 useEffect(()=>{const replay=()=>setRun(n=>n+1);window.addEventListener('viddy-intro',replay);return()=>window.removeEventListener('viddy-intro',replay)},[])
 useEffect(()=>{if(!enabled||matchMedia('(prefers-reduced-motion: reduce)').matches){setVisible(false);return}setVisible(true);const timer=setTimeout(()=>setVisible(false),1250);return()=>clearTimeout(timer)},[enabled,run])
 return visible?<div key={run} className="brand-intro" aria-label="Starting Viddy" role="status"><div className="intro-glow"/><div className="intro-lockup"><BrandMark/><span>Viddy<sup>✦</sup></span><i/></div></div>:null
}
