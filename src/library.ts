import {channelId, videoId} from './domain.ts'
import {readAccent,type Accent} from './palettes.ts'
export type Settings = {
  theme:'dark'|'light'; accent:Accent; collapsed:boolean; density:'compact'|'comfortable';
  keywords:string[]; blocked:string[]; history:boolean; progress:boolean;
  reminder:number; showTime:boolean; focus:boolean; tray:boolean; autoplay:boolean
}
export type Library = {
 version:1; profileName:string; settings:Settings; follows:string[]; groups:Record<string,string>; later:string[]; favorites:string[];
 collections:{name:string; ids:string[]}[]; history:Record<string,number>; progress:Record<string,{at:number;duration:number;updated:number}>;
 checked:Record<string,string>; interests:Record<string,number>; daily:{date:string;seconds:number}; liveReminders:Record<string,LiveReminder>;dismissed:string[]
}
export type LiveReminder={title:string;at:number}
export const defaults:Settings = {theme:'dark',accent:'rose',collapsed:false,density:'comfortable',keywords:[],blocked:[],history:true,progress:true,reminder:0,showTime:false,focus:false,tray:false,autoplay:true}
export const empty = ():Library => ({version:1,profileName:'',settings:{...defaults},follows:[],groups:{},later:[],favorites:[],collections:[],history:{},progress:{},checked:{},interests:{},daily:{date:'',seconds:0},liveReminders:{},dismissed:[]})
export const profileName=(value:unknown)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,48):''
const record = (v:unknown):Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string,unknown> : {}
const strings = (v:unknown, validate:(s:string)=>boolean = s=>s.length>0 && s.length<=256) => Array.isArray(v) ? [...new Set(v.filter((s):s is string=>typeof s==='string' && validate(s)))].slice(0,5000) : []
const finite = (v:unknown):v is number => typeof v==='number' && Number.isFinite(v) && v>=0
function entries<T>(v:unknown, id:(s:string)=>boolean, value:(x:unknown)=>x is T):Record<string,T> {
 return Object.fromEntries(Object.entries(record(v)).filter((e):e is [string,T]=>id(e[0]) && value(e[1])).slice(0,5000))
}
export function decode(raw:unknown):Library {
 const r = record(raw)
 if (r.version!==1) throw new Error('This is not a supported PureTube backup.')
 const s=record(r.settings), d=empty(), settings=d.settings
 const choices = {theme:['dark','light'],density:['compact','comfortable']} as const
 for (const k of Object.keys(choices) as (keyof typeof choices)[]) {
   if ((choices[k] as readonly unknown[]).includes(s[k])) Object.assign(settings,{[k]:s[k]})
 }
 settings.accent=readAccent(s.accent)
 for (const k of ['collapsed','history','progress','showTime','focus','tray','autoplay'] as const) {
   if (typeof s[k]==='boolean') settings[k]=s[k]
 }
 if (finite(s.reminder)) settings.reminder=Math.min(1440,Math.trunc(s.reminder))
 for (const k of ['keywords','blocked'] as const) if (Array.isArray(s[k])) settings[k]=strings(s[k],k==='blocked'?channelId:undefined)
 const progress = entries(r.progress, videoId, (x):x is Library['progress'][string] => {
   const y=record(x); return finite(y.at) && finite(y.duration) && y.duration>0 && y.at<=y.duration && finite(y.updated)
 })
 const daily=record(r.daily)
 return {...d,profileName:profileName(r.profileName),settings, follows:strings(r.follows,channelId), later:strings(r.later,videoId), favorites:strings(r.favorites,videoId),dismissed:strings(r.dismissed,videoId),
   groups:entries(r.groups,channelId,(x):x is string=>typeof x==='string' && x.length<=80),
   checked:entries(r.checked,channelId,(x):x is string=>typeof x==='string' && x.length<=32 && Number.isFinite(Date.parse(x))),
   collections:Array.isArray(r.collections)?r.collections.slice(0,200).flatMap(x=>{const c=record(x);return typeof c.name==='string' && c.name.trim() ? [{name:c.name.trim().slice(0,80),ids:strings(c.ids,videoId)}]:[]}):[],
   history:entries(r.history,videoId,finite),progress,interests:entries(r.interests,k=>/^[a-zA-Z &]{1,32}$/.test(k),finite),
   liveReminders:entries(r.liveReminders,videoId,(value):value is LiveReminder=>{const r=record(value);return typeof r.title==='string'&&r.title.length<=400&&finite(r.at)&&r.at>0&&r.at<4.5e12}),
   daily:typeof daily.date==='string' && finite(daily.seconds) ? {date:daily.date.slice(0,80),seconds:daily.seconds} : d.daily}
}
export const toggled = (ids:string[],id:string) => ids.includes(id)?ids.filter(x=>x!==id):[id,...ids]
