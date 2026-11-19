import {useId} from 'react'
export function BrandMark(){
 const id=useId().replaceAll(':','')
 return <svg className="brand-symbol" width="43" height="43" viewBox="0 0 64 64" aria-hidden="true">
 <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop stopColor="currentColor" stopOpacity=".45"/><stop offset=".5" stopColor="currentColor"/><stop offset="1" stopColor="currentColor" stopOpacity=".65"/></linearGradient></defs>
 <path d="M17 8c-6-3-10 1-9 7l6 39c1 6 6 8 11 4L54 35c5-4 5-9-1-12Z" fill={`url(#${id})`} stroke="currentColor" strokeWidth="1.2"/>
 <path d="M21 20 42 31 24 44Z" fill="var(--bg)" fillOpacity=".85"/>
 <path d="M9 37C-8 55 36 49 55 30c10-11 5-15-1-13 10 0 2 13-16 21C20 47 3 46 9 37Z" fill="currentColor"/>
 <path d="M47 2c0 7-2 9-8 10 6 1 8 3 8 9 1-6 3-8 9-9-6-1-8-3-9-10Z" fill="currentColor"/>
 </svg>
}
export function BrandLockup(){return <><BrandMark/><span className="brand-name">Viddy</span></>}
