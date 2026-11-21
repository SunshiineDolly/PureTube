import {test} from 'node:test'
import assert from 'node:assert/strict'
import {animatedPreviewUrl,previewFrames} from '../src/preview-frames.ts'
test('preview sheets advance across rows and sheets and reject external images',()=>{
 const spec='https://i.ytimg.com/sb/video/storyboard3_L$L/$N.jpg?sqp=public|160#90#55#5#5#2000#M$M#signature'
 const frames=previewFrames(spec)!
 assert.equal(frames.count,55);assert.equal(frames.frame(6).x,25);assert.equal(frames.frame(6).y,25)
 assert.ok(frames.frame(26).url.includes('/M1.jpg'));assert.ok(frames.frame(0).url.includes('sigh=signature'))
 assert.equal(previewFrames(spec.replace('i.ytimg.com','example.com')),undefined)
 assert.equal(previewFrames('broken'),undefined)
})

test('animated preview URLs stay on the video’s official image path',()=>{
 const id='jNQXAC9IVRw',url='https://i.ytimg.com/an_webp/'+id+'/mqdefault_6s.webp?du=3000'
 assert.equal(animatedPreviewUrl(id,url),url)
 for(const unsafe of [url.replace('https:','http:'),url.replace('i.ytimg.com','example.com'),url.replace(id,'aaaaaaaaaaa'),url.replace('i.ytimg.com','user@i.ytimg.com'),url.replace('i.ytimg.com','i.ytimg.com:444'),'broken'])assert.equal(animatedPreviewUrl(id,unsafe),undefined)
 assert.equal(animatedPreviewUrl('../bad',url),undefined)
})
