import type {PlaylistQueue} from './playlist-queue'
export function moveQueue(queue:PlaylistQueue,from:number,to:number):PlaylistQueue{
 if(from<0||to<0||from>=queue.ids.length||to>=queue.ids.length)return queue
 const current=queue.ids[queue.index],ids=[...queue.ids];ids.splice(to,0,ids.splice(from,1)[0])
 return {...queue,ids,index:ids.indexOf(current)}
}
export function removeQueue(queue:PlaylistQueue,index:number):PlaylistQueue|undefined{
 if(index<0||index>=queue.ids.length)return queue
 const current=queue.ids[queue.index],ids=queue.ids.filter((_,i)=>i!==index)
 if(!ids.length)return
 return {...queue,ids,index:ids.includes(current)?ids.indexOf(current):Math.min(index,ids.length-1)}
}
