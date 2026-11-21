import {useSyncExternalStore} from 'react'

const listeners=new Set<()=>void>()
let timer:ReturnType<typeof setInterval>|undefined
function subscribe(listener:()=>void){
 listeners.add(listener)
 timer??=setInterval(()=>listeners.forEach(notify=>notify()),1000)
 return ()=>{listeners.delete(listener);if(!listeners.size){clearInterval(timer);timer=undefined}}
}

export function useCountdownClock(at?:number|null){
 // One clock serves every scheduled card; distant events only rerender each minute.
 const snapshot=()=>{const now=Date.now(),interval=(at??0)-now>86_400_000?60_000:1000;return Math.floor(now/interval)*interval}
 return useSyncExternalStore(subscribe,snapshot,snapshot)
}
