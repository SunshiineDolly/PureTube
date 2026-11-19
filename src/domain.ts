export const videoId = (s: string) => /^[\w-]{11}$/.test(s)
export const channelId = (s: string) => /^UC[\w-]{22}$/.test(s)
export type CreatorCredit={id:string;name:string;image?:string}
export type Video = {id:string; title:string; description:string; channelId:string; channel:string; channelImage?:string; creators?:CreatorCredit[]; date:string; publishedLabel?:string; image:string; duration:number; category?:string; live?:boolean; scheduledAt?:number|null; views?:string; likes?:string; shorts:boolean; embeddable:boolean; paid:boolean}
export type Channel = {id:string; title:string; description:string; image:string; banner:string; uploads:string; subscribers?:string}
export function fillCreator(video:Video,name:string,image?:string):Video {
 const channel=video.channel&&video.channel!=='Creator'?video.channel:name
 return {...video,channel,channelImage:video.channelImage||image,creators:video.creators?.map(c=>c.id===video.channelId&&(!c.name||c.name==='Creator')?{...c,name:channel,image:c.image||image}:c)}
}
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
const ageUnits:Record<string,number>={s:1,sec:1,second:1,m:60,min:60,minute:60,h:3600,hr:3600,hour:3600,d:86400,day:86400,w:604800,wk:604800,week:604800,mo:2592000,month:2592000,y:31536000,yr:31536000,year:31536000}
export function uploadAge(v:Video){
 if(v.date){const time=Date.parse(v.date);if(Number.isFinite(time))return (Date.now()-time)/1000}
 const match=v.publishedLabel?.toLowerCase().match(/([\d,]+)\s*(s|sec|second|m|min|minute|h|hr|hour|d|day|w|wk|week|mo|month|y|yr|year)s?\s+ago\b/)
 return match?Number(match[1].replaceAll(',',''))*ageUnits[match[2]]:Number.MAX_SAFE_INTEGER
}
export const publicNewest=(a:Video,b:Video)=>uploadAge(a)-uploadAge(b)
export function errorText(e:unknown) { return e instanceof Error ? e.message : String(e) }
export function unique<T extends {id:string}>(items:T[]) { return [...new Map(items.map(i=>[i.id,i])).values()] }
