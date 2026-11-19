import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomVideo} from '../src/random-watch.ts'
import {empty} from '../src/library.ts'
import type {Video} from '../src/domain.ts'
const video=(n:number,channelId='followed',category='Gaming'):Video=>({id:String(n).padStart(11,'0'),title:'Video '+n,channelId,channel:channelId,category,description:'',date:'',image:'',duration:600,shorts:false,embeddable:true,paid:false})
test('Following random watch never escapes follows, including when all followed picks were watched',()=>{
 const data=empty();data.follows=['followed'];const own=video(1),other=video(2,'stranger');data.history[own.id]=Date.now()
 for(const r of [0,.3,.9,.999])assert.equal(randomVideo([other,own],data,'following',[own.id],()=>r)?.id,own.id)
 assert.equal(randomVideo([other],data,'following'),undefined)
})
test('random watch excludes restricted, Shorts, live, scheduled, dismissed and blocked picks',()=>{
 const data=empty();data.settings.blocked=['blocked'];data.dismissed=[video(7).id]
 const items=[{...video(1),shorts:true},{...video(2),live:true},{...video(3),scheduledAt:Date.now()+1000},{...video(4),embeddable:false},{...video(5),paid:true},video(6,'blocked'),video(7),video(8)]
 for(const surface of ['home','discover','following'] as const){data.follows=['followed'];assert.equal(randomVideo(items,data,surface)?.id,video(8).id)}
})
test('unwatched videos beat started, watched and recently shuffled videos',()=>{
 const data=empty(),items=[video(1),video(2),video(3),video(4)];data.history[items[0].id]=Date.now();data.progress[items[1].id]={at:20,duration:600,updated:Date.now()}
 for(const surface of ['home','discover'] as const)assert.equal(randomVideo(items,data,surface,[items[2].id],()=>0)?.id,items[3].id)
})
test('Discover balances topics and Following balances creators despite unequal upload counts',()=>{
 const data=empty();data.follows=['followed','other'];const items=[...Array.from({length:30},(_,n)=>video(n)),video(50,'other','Food')]
 assert.equal(randomVideo(items,data,'discover',[],()=>.75)?.category,'Food')
 assert.equal(randomVideo(items,data,'following',[],()=>.75)?.channelId,'other')
})
