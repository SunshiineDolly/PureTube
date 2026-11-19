import test from 'node:test'
import assert from 'node:assert/strict'
import {isShorts,seconds,visible,newest,type Video} from '../src/domain.ts'
import {decode,empty,type Library} from '../src/library.ts'

const id='K7g81Bq_jS4', creator='UC_x5XG1OV2P6uZZ5FSM9Ttw'
const base:Video={id,title:'A short video essay',description:'A look at the early internet',channelId:creator,channel:'Creator',date:'2025-03-02T14:00:00Z',image:'',duration:47,shorts:false,paid:false,embeddable:true}
const filters={keywords:[],blocked:[]}

test('keeps ordinary short videos; recognizes a creator Shorts tag',()=>{
 assert.equal(seconds('PT49S'),49)
 assert.equal(seconds('P1DT1H2M3S'),90123)
 assert.equal(isShorts(base.title,base.description,47),false)
 assert.equal(isShorts('A quick look #YouTubeShorts','',170),true)
 assert.equal(isShorts('A quick look','Watch #shorts',180),true)
 assert.equal(isShorts('A long essay','A discussion of #shorts',900),false)
 assert.equal(visible(base,filters),true)
 assert.equal(visible({...base,shorts:true},filters),false)
})
test('applies keyword, channel, and disclosed paid placement filters',()=>{
 assert.equal(visible(base,{...filters,keywords:[' EARLY INTERNET ']}),false)
 assert.equal(visible(base,{...filters,keywords:['ＳＨＯＲＴ']}),false)
 assert.equal(visible(base,{...filters,keywords:['','   ']}),true)
 assert.equal(visible(base,{...filters,blocked:[creator]}),false)
 assert.equal(visible({...base,paid:true},filters),false)
})
test('feed comparator sorts across separate upload sources by publication date',()=>{
 const old={...base,id:'9oOQcJBNXv0',date:'2024-12-25T16:00:00Z'}
 const recent={...base,id:'nOMiQlh9hao',date:'2026-10-07T07:45:00Z'}
 assert.deepEqual([old,recent,base].sort(newest).map(v=>v.id),[recent.id,base.id,old.id])
})
test('a personal backup round-trips without storing any API metadata or key',()=>{
 const library:Library={...empty(),follows:[creator],groups:{[creator]:'Learning'},later:[id],favorites:[id],collections:[{name:'Research',ids:[id]}],history:{[id]:15},progress:{[id]:{at:10,duration:50,updated:15}}}
 assert.deepEqual(decode(JSON.parse(JSON.stringify(library))),library)
})
test('invalid backup versions and unsafe or malformed imported data are rejected or stripped',()=>{
 assert.throws(()=>decode({version:10}),/not a supported/)
 const result=decode(JSON.parse('{"version":1,"settings":{"theme":"bad","history":"yes","blocked":["bad"]},"later":["K7g81Bq_jS4","K7g81Bq_jS4","bad"],"history":{"__proto__":8},"progress":{"K7g81Bq_jS4":{"at":60,"duration":50,"updated":25}},"apiKey":"remove"}'))
 assert.equal(result.settings.theme,'dark')
 assert.equal(result.settings.history,true)
 assert.deepEqual(result.later,[id])
 assert.deepEqual(result.settings.blocked,[])
 assert.deepEqual(result.history,{})
 assert.deepEqual(result.progress,{})
 assert.equal('apiKey' in result,false)
})


test('public feed combines followed creators newest first, deduplicates and filters',async()=>{
 const {selectUploads}=await import('../src/feed.ts')
 const second='UC8butISFwT-Wl7EV0hUK0BQ'
 const newer={...base,id:'nOMiQlh9hao',date:'2025-03-03T08:00:00.000Z',channelId:second}
 const shorts={...base,id:'9oOQcJBNXv0',date:'2025-03-03T07:00:00.000Z',shorts:true}
 const unrelated={...base,id:'2L2oVWKnB8M',channelId:'UC-lHJZR3Gqxm24_Vd_AJ5Yw'}
 const inputs=[base,newer,shorts,unrelated,newer]
 assert.deepEqual(selectUploads(inputs,filters,[creator,second],0).map(v=>v.id),[newer.id,base.id])
 assert.deepEqual(selectUploads(inputs,filters,[creator,second],1,false,Date.parse('2025-03-04T00:00:00Z')).map(v=>v.id),[newer.id])
 assert.deepEqual(selectUploads(inputs,{...filters,blocked:[second]},[creator,second],0).map(v=>v.id),[base.id])
})

test('reads a Takeout subscriptions CSV with BOM, escaped quotes, and localized headers',async()=>{
 const {parseSubscriptions}=await import('../src/subscription-import.ts')
 const other='UCBJycsmduvYEL83R_U4JriQ'
 const csv='\ufeffIdentifiant,URL,Titre\r\n"'+creator+'","https://www.youtube.com/channel/'+creator+'","A ""quoted"", name"\r\n,https://youtube.com/channel/'+other+',"Title over\r\ntwo lines"\r\n'+creator+',,Duplicate\r\n'
 assert.deepEqual(parseSubscriptions(csv),[creator,other])
 assert.throws(()=>parseSubscriptions('ID,URL\r\n,https://example.com/channel/'+creator),/No channel IDs/)
 assert.throws(()=>parseSubscriptions('"unterminated'),/quoted field/)
})
test('import merges subscriptions without replacing follows or adding blocked channels',async()=>{
 const {mergeSubscriptions}=await import('../src/subscription-import.ts')
 const existing='UC-lHJZR3Gqxm24_Vd_AJ5Yw', blocked='UCBJycsmduvYEL83R_U4JriQ'
 const result=mergeSubscriptions([existing],[blocked,creator,creator,existing],[blocked])
 assert.deepEqual(result,{follows:[existing,creator],added:1})
 assert.equal(mergeSubscriptions(result.follows,[creator],[blocked]).added,0)
})
