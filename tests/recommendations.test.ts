import {test} from 'node:test'
import assert from 'node:assert/strict'
import {appendRecommendations,rankRecommendations,recommendationPlan} from '../src/recommendations.ts'
import {empty} from '../src/library.ts'
import type {Video} from '../src/domain.ts'

const video=(n:number,creator='creator-'+n):Video=>({
 id:String(n).padStart(11,'0'),title:'Video '+n,description:'',channelId:creator,channel:creator,date:'',image:'',duration:120,category:n%2?'Gaming':'Food',shorts:false,paid:false,embeddable:true,
})
test('recommendations suppress watched, dismissed, Shorts, live, and the other page’s picks',()=>{
 const data=empty(),items=Array.from({length:9},(_,n)=>video(n))
 data.history[items[0].id]=Date.now();data.dismissed=[items[1].id]
 items[2].shorts=true;items[3].live=true;items[4].scheduledAt=Date.now()+10000
 const result=rankRecommendations(items,data,{},1,new Set([items[5].id]))
 assert.deepEqual(new Set(result.map(v=>v.id)),new Set(items.slice(6).map(v=>v.id)))
})
test('new candidates outrank recently displayed candidates and repeated creators are capped',()=>{
 const items=[video(1),video(2),video(3,'repeat'),video(4,'repeat'),video(5,'repeat')]
 const seen={[items[0].id]:Date.now()}
 const result=rankRecommendations(items,empty(),seen,1,new Set())
 assert.equal(result.at(-1)?.id,items[0].id)
 assert.equal(result.filter(v=>v.channelId==='repeat').length,2)
 const appended=appendRecommendations(result,[video(6,'repeat'),{...video(7),title:items[1].title}])
 assert.equal(appended.filter(v=>v.channelId==='repeat').length,2)
 assert.equal(appended.filter(v=>v.title===items[1].title).length,1)
})
test('a new mix rotates query sources while retaining a learned interest',()=>{
 const data=empty();data.interests.Gaming=12
 const first=recommendationPlan(data,'home',104)
 const second=recommendationPlan(data,'home',105)
 assert.equal(new Set(first.map(s=>s.topic)).size,4)
 assert.ok(first.some(s=>s.topic==='Gaming'))
 assert.notDeepEqual(first.map(s=>s.query),second.map(s=>s.query))
 assert.notDeepEqual(first.map(s=>s.query),recommendationPlan(data,'discover',104).map(s=>s.query))
})
