export const videoId = (s: string) => /^[\w-]{11}$/.test(s)
export const channelId = (s: string) => /^UC[\w-]{22}$/.test(s)
export type Video = {id:string; title:string; description:string; channelId:string; channel:string; date:string; image:string; duration:number; views?:string; likes?:string; shorts:boolean; embeddable:boolean; paid:boolean}
export type Channel = {id:string; title:string; description:string; image:string; banner:string; uploads:string; subscribers?:string}
export type Filters = {keywords:string[]; blocked:string[]}
export const seconds = (value:string) => {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value)
  return m ? Number(m[1]||0)*86400+Number(m[2]||0)*3600+Number(m[3]||0)*60+Number(m[4]||0) : 0
}
export function isShorts(title:string, description:string, duration:number) {
  return /(?:^|\s)#(?:youtubeshorts|shorts)\b/i.test(title)
    || (duration > 0 && duration <= 180 && /(?:^|\s)#(?:youtubeshorts|shorts)\b/i.test(description))
}
export function visible(v:Video, f:Filters) {
  const haystack = (v.title+' '+v.description).normalize('NFKC').toLowerCase()
  return !v.shorts && !v.paid && !f.blocked.includes(v.channelId) && !f.keywords.some(k => k.trim() && haystack.includes(k.trim().normalize('NFKC').toLowerCase()))
}
export const newest = (a:Video,b:Video) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)
export function errorText(e:unknown) { return e instanceof Error ? e.message : String(e) }
export function unique<T extends {id:string}>(items:T[]) { return [...new Map(items.map(i=>[i.id,i])).values()] }
