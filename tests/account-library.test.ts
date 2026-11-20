import assert from 'node:assert/strict'
import test from 'node:test'
import {cloudLibrary, emptyCloudLibrary, mergeCloudLibrary} from '../src/account-library.ts'
import {empty} from '../src/library.ts'

const first = 'vWG8Exo0QQ4'
const second = 'jNQXAC9IVRw'

test('first sign-in keeps existing Windows and Mac library entries', () => {
 const windows = cloudLibrary({...empty(), profileName:'Viddy viewer', history:{[first]:100}, favorites:[first], collections:[{name:'Saved',ids:[first]}]})
 const mac = cloudLibrary({...empty(), history:{[second]:200}, later:[second], collections:[{name:'Saved',ids:[second]}]})
 const merged = mergeCloudLibrary(emptyCloudLibrary(), mac, windows)
 assert.equal(merged.profileName,'Viddy viewer')
 assert.deepEqual(merged.history,{[first]:100,[second]:200})
 assert.deepEqual(merged.favorites,[first])
 assert.deepEqual(merged.later,[second])
 assert.deepEqual(merged.collections,[{name:'Saved',ids:[second,first]}])
})

test('sync preserves removals and resolves concurrent progress by timestamp', () => {
 const base = {...emptyCloudLibrary(), favorites:[first], history:{[first]:100},
   progress:{[first]:{at:5,duration:80,updated:100}}}
 const local = {...base, favorites:[], history:{},
   progress:{[first]:{at:20,duration:80,updated:200}}}
 const remote = {...base, favorites:[second,first], history:{[first]:100,[second]:170},
   progress:{[first]:{at:30,duration:80,updated:300}}}
 const merged = mergeCloudLibrary(base,local,remote)
 assert.deepEqual(merged.favorites,[second])
 assert.deepEqual(merged.history,{[second]:170})
 assert.equal(merged.progress[first].at,30)
})

test('the device keeps its own settings and local recommendation data', () => {
 const device = empty()
 device.settings.theme = 'light'
 device.viewing[first] = {seconds:20,at:100}
 const cloud = cloudLibrary(device)
 assert.equal('settings' in cloud,false)
 assert.equal('viewing' in cloud,false)
})
