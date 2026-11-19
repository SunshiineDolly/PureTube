// Count wall time only between confirmed playing states. Seeking doesn't
// affect this clock, and duration is not required (live streams can report 0).
export function playbackClock(start:number){
 let last=start,playing=false
 return {
   advance(now:number,next=playing){
     if(!Number.isFinite(now))return 0
     const seconds=playing?Math.max(0,now-last)/1000:0
     last=now
     playing=next
     return seconds
   },
 }
}
