import {test} from 'node:test'
import assert from 'node:assert/strict'
import {playbackClock} from '../src/playback-clock.ts'

test('session time advances each second of playback independently of media duration',()=>{
 const clock=playbackClock(0)
 assert.equal(clock.advance(1000,false),0)
 assert.equal(clock.advance(2000,true),0)
 assert.equal(clock.advance(3000),1)
 assert.equal(clock.advance(4000),1)
 assert.equal(clock.advance(4500,false),.5)
 assert.equal(clock.advance(9000,false),0)
 assert.equal(clock.advance(10000,true),0)
 assert.equal(clock.advance(11000),1)
})
test('delayed background ticks do not lose seconds or double count a flush',()=>{
 const clock=playbackClock(0)
 clock.advance(0,true)
 assert.equal(clock.advance(30000),30)
 assert.equal(clock.advance(30000),0)
 assert.equal(clock.advance(31000,false),1)
 assert.equal(clock.advance(60000,false),0)
})
