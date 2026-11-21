import {test} from 'node:test'
import assert from 'node:assert/strict'
import {previewFrames} from '../src/preview-frames.ts'
test('preview sheets advance across rows and sheets and reject external images',()=>{
 const spec='https://i.ytimg.com/sb/video/storyboard3_L$L/$N.jpg?sqp=public|160#90#55#5#5#2000#M$M#signature'
 const frames=previewFrames(spec)!
 assert.equal(frames.count,55);assert.equal(frames.frame(6).x,25);assert.equal(frames.frame(6).y,25)
 assert.ok(frames.frame(26).url.includes('/M1.jpg'));assert.ok(frames.frame(0).url.includes('sigh=signature'))
 assert.equal(previewFrames(spec.replace('i.ytimg.com','example.com')),undefined)
 assert.equal(previewFrames('broken'),undefined)
})
