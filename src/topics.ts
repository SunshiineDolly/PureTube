export const topics = [
 {name:'Style & beauty',code:'26',ids:['UCuYx81nzzz4OFQrhbKDzTng','UCIsbLox_y9dCIMLd8tdC6qg']},
 {name:'Fashion',code:'',ids:[]},
 {name:'Music',code:'10',ids:['UC4eYXhJI4-7wSWc8UNRwD4A','UC3I2GFN_F8WudD_2jUZbojA']},
 {name:'Food',code:'',ids:['UCbpMy0Fg74eXXkvxJrtEn3w','UCJFp8uSYCjXOMnkUyb3CQ3Q']},
 {name:'Film',code:'1',ids:['UC2-BeLxzUBSs0uSrmzWhJuQ']},
 {name:'Gaming',code:'20',ids:['UC0fDG3byEcMtbOqPMymDNbw','UCqJ-Xo29CKyLTjn6z2XwYAw']},
 {name:'Vlogs',code:'',ids:[]},
 {name:'Anime',code:'',ids:[]},
 {name:'Home & lifestyle',code:'',ids:[]},
 {name:'Travel',code:'19',ids:['UC4ijq8Cg-8zQKx8OH12dUSw']},
 {name:'Crafts & DIY',code:'',ids:[]},
 {name:'Books',code:'',ids:[]},
 {name:'Wellness',code:'',ids:[]},
 {name:'Comedy',code:'23',ids:['UCqFzWxSCi39LnW1JKFR3efg']},
 {name:'Art & design',code:'',ids:['UCHu2KNu6TtJ0p4hpSW7Yv7Q']},
 {name:'Sports',code:'17',ids:['UCWJ2lWNubArHWmf3FIHbfcQ']},
 {name:'News',code:'',ids:[]},
 {name:'Documentaries',code:'',ids:[]},
 {name:'Technology',code:'28',ids:['UCBJycsmduvYEL83R_U4JriQ','UC_x5XG1OV2P6uZZ5FSM9Ttw']},
 {name:'Space',code:'',ids:['UCLA_DiR1FfKNvjuUpBHmylQ']},
 {name:'Learning',code:'27',ids:['UCsooa4yRKGN_zEE8iknghZA','UCX6b17PVsYBQ0ip5gyeme-Q']},
] as const
import type {Video} from './domain.ts'
export const categoryFor=(v:Video)=>topics.find(t=>(t.ids as readonly string[]).includes(v.channelId))?.name
 ?? topics.find(t=>t.name===v.category||t.code&&t.code===v.category)?.name
 ?? inferTopic(v.title+' '+v.description.slice(0,500))

function inferTopic(value:string){
 const text=value.toLowerCase()
 const hints:[string,RegExp][]=[
   ['Gaming',/\b(gameplay|gaming|playthrough|lets? play|gta|minecraft|nintendo|fortnite)\b/],
   ['Style & beauty',/\b(gyaru|makeup|outfit|fashion|skincare|beauty)\b/],
   ['Food',/\b(recipe|cooking|baking|kitchen|chef|street food)\b/],
   ['Music',/\b(music|acoustic|concert|guitar|piano|album|singing)\b/],
   ['Travel',/\b(travel|tokyo|kyoto|seoul|tourism|walking tour)\b/],
   ['Art & design',/\b(sketch|painting|drawing|graphic design|illustration)\b/],
   ['Technology',/\b(technology|programming|coding|software|computer|smartphone)\b/],
   ['Learning',/\b(science|history|explained|educational|mathematics|physics)\b/],
   ['Vlogs',/\b(vlog|day in my life|weekend)\b/],
 ]
 return hints.find(([,pattern])=>pattern.test(text))?.[0]
}

const topicQueries:Record<string,string>={
 'Style & beauty':'style makeup beauty routines',
 'Food':'cooking recipes and baking',
 'Vlogs':'daily life vlog',
 'Anime':'anime reviews and recommendations',
 'Gaming':'gaming gameplay walkthrough',
 'Home & lifestyle':'home decor and lifestyle',
 'Art & design':'art and graphic design',
 'Learning':'educational explainer',
}
export const topicQuery=(name:string)=>topicQueries[name]??name
export function rankedTopics(interests:Record<string,number>) {
 return [...topics].sort((a,b)=>(interests[b.name]??0)-(interests[a.name]??0))
}
export function mixByTopic<T>(buckets:readonly (readonly T[])[],limit?:number):T[] {
 const out:T[]=[]
 const rounds=Math.max(0,...buckets.map(bucket=>bucket.length))
 for(let i=0;i<rounds;i++){
   for(const bucket of buckets){
     if(i<bucket.length)out.push(bucket[i])
     if(limit!==undefined&&out.length>=limit)return out
   }
 }
 return out
}
