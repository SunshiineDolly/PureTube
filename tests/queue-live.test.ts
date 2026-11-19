import {test} from 'node:test'
import assert from 'node:assert/strict'
import {moveQueue,removeQueue} from '../src/queue-edit.ts'
import {mixLive} from '../src/live-mix.ts'
import type {Video} from '../src/domain.ts'
test('queue edits retain the playing item and choose a neighbor when it is removed',()=>{
 const q={name:'Queue',ids:['a','b','c'],index:1,repeat:false}
 const moved=moveQueue(q,0,2);assert.deepEqual(moved.ids,['b','c','a']);assert.equal(moved.index,0)
 assert.equal(removeQueue(q,0)?.index,0)
 assert.deepEqual(removeQueue(q,1)?.ids,['a','c']);assert.equal(removeQueue(q,1)?.index,1)
 assert.equal(removeQueue({...q,ids:['a'],index:0},0),undefined)
 assert.deepEqual(q.ids,['a','b','c'])
})
test('All streams interleaves categories even when Gaming has many more creators',()=>{
 const v=(n:number,category:string):Video=>({id:String(n),category,channelId:'creator'+n,channel:'Creator',title:'Video',description:'',date:'',image:'',duration:0,shorts:false,paid:false,embeddable:true,live:true})
 const items=[...Array.from({length:20},(_,n)=>v(n,'Gaming')),v(21,'Music'),v(22,'Nature'),v(23,'News')]
 assert.deepEqual(mixLive(items,'live','').slice(0,4).map(v=>v.category),['Gaming','Music','Nature','News'])
 assert.ok(mixLive(items.filter(v=>v.category==='Gaming'),'live','Gaming').every(v=>v.category==='Gaming'))
})
