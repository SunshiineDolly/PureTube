import {test} from 'node:test'
import assert from 'node:assert/strict'
import {nextVideos} from '../src/autoplay.ts'
import {empty,decode} from '../src/library.ts'
import type {Video} from '../src/domain.ts'
import {fillCreator} from '../src/domain.ts'
const video=(id:string,channelId='creator',category='Gaming'):Video=>({id,title:id,channelId,channel:channelId,category,description:'',date:'',image:'',duration:60,embeddable:true,shorts:false,paid:false})
test('autoplay favors followed and related creators without replaying the current or queued history',()=>{
 const data=empty();data.follows=['followed'];const current=video('current0000')
 const followed=video('followed000','followed'),related=video('related0000','new-creator'),other=video('other000000','other','Food')
 const result=nextVideos(current,[other,related,followed,current,followed],data,['other000000'])
 assert.deepEqual(result.map(v=>v.id),[followed.id,related.id])
})
test('autoplay excludes Shorts, live, scheduled, unembeddable, blocked and dismissed videos',()=>{
 const data=empty(),items=Array.from({length:7},(_,i)=>video('candidate0'+i,'creator'+i))
 items[0].shorts=true;items[1].live=true;items[2].scheduledAt=Date.now()+10000;items[3].embeddable=false;data.settings.blocked=['creator4'];data.dismissed=[items[5].id]
 assert.deepEqual(nextVideos(video('current0000'),items,data).map(v=>v.id),[items[6].id])
})
test('autoplay preference survives library decoding and old profiles get the new setting',()=>{
 const data=empty();data.settings.autoplay=false
 assert.equal(decode(data).settings.autoplay,false)
 const old=JSON.parse(JSON.stringify(data));delete old.settings.autoplay
 assert.equal(decode(old).settings.autoplay,true)
})
test('older channel cards recover the known creator name without overwriting collaborator credits',()=>{
 const item=video('older000000','followed');item.channel='';item.creators=[{id:'followed',name:''},{id:'collaborator',name:'Guest creator'}]
 const result=fillCreator(item,'Followed creator','https://example.com/avatar.png')
 assert.equal(result.channel,'Followed creator')
 assert.equal(result.creators?.[0].name,'Followed creator')
 assert.equal(result.creators?.[1].name,'Guest creator')
})
