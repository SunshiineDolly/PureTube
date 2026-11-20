import {decode, empty, type Library} from './library.ts'

function pick(library: Library) {
 const {version, profileName, profileBio, profileEmoji, follows, groups, later, favorites, collections, history, progress, savedVideos} = library
 return {version, profileName, profileBio, profileEmoji, follows, groups, later, favorites, collections, history, progress, savedVideos}
}

export type CloudLibrary = ReturnType<typeof pick>

export const cloudLibrary = (library: Library) => readCloudLibrary(pick(library))

export const emptyCloudLibrary = () => cloudLibrary(empty())

export function readCloudLibrary(raw: unknown): CloudLibrary {
 return pick(decode(raw))
}

function equal(a: unknown, b: unknown): boolean {
 if (a === b) return true
 if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
 if (Array.isArray(a) !== Array.isArray(b)) return false
 const left = Object.entries(a)
 const right = b as Record<string, unknown>
 return left.length === Object.keys(right).length &&
   left.every(([key, value]) => Object.hasOwn(right, key) && equal(value, right[key]))
}

export const sameVideo = equal

export const sameCloudLibrary = (a: CloudLibrary, b: CloudLibrary) => equal(a, b)

function mergeRecord<T>(base: Record<string, T>, local: Record<string, T>, remote: Record<string, T>,
                        resolve: (local: T, remote: T, base: T | undefined) => T = local => local): Record<string, T> {
 const ids = new Set([...Object.keys(local), ...Object.keys(remote)])
 return Object.fromEntries([...ids].flatMap(id => {
   const before = Object.hasOwn(base, id) ? base[id] : undefined
   const here = Object.hasOwn(local, id) ? local[id] : undefined
   const there = Object.hasOwn(remote, id) ? remote[id] : undefined
   const value = equal(here, before) ? there : equal(there, before) || here === undefined || there === undefined
     ? here : resolve(here, there, before)
   return value === undefined ? [] : [[id, value]]
 }))
}

function mergeList(base: string[], local: string[], remote: string[]): string[] {
 if (equal(base, local)) return remote
 if (equal(base, remote)) return local
 const previous = new Set(base)
 const here = new Set(local)
 const there = new Set(remote)
 return [...new Set([...local, ...remote])].filter(id => !previous.has(id) || (here.has(id) && there.has(id)))
}

export function mergeCloudLibrary(base: CloudLibrary, local: CloudLibrary, remote: CloudLibrary): CloudLibrary {
 const playlists = (data: CloudLibrary) => Object.fromEntries(data.collections.map(({name, ids}) => [name, ids]))
 const collections = mergeRecord(playlists(base), playlists(local), playlists(remote),
   (here, there, before) => mergeList(before ?? [], here, there))
 return readCloudLibrary({
   version: 1,
   profileName: local.profileName === base.profileName ? remote.profileName : local.profileName,
   profileBio: local.profileBio === base.profileBio ? remote.profileBio : local.profileBio,
   profileEmoji: local.profileEmoji === base.profileEmoji ? remote.profileEmoji : local.profileEmoji,
   follows: mergeList(base.follows, local.follows, remote.follows),
   groups: mergeRecord(base.groups, local.groups, remote.groups),
   later: mergeList(base.later, local.later, remote.later),
   favorites: mergeList(base.favorites, local.favorites, remote.favorites),
   collections: Object.entries(collections).map(([name, ids]) => ({name, ids})),
   history: mergeRecord(base.history, local.history, remote.history, (here, there) => Math.max(here, there)),
   progress: mergeRecord(base.progress, local.progress, remote.progress, (here, there) => here.updated >= there.updated ? here : there),
   savedVideos: mergeRecord(base.savedVideos, local.savedVideos, remote.savedVideos),
 })
}
