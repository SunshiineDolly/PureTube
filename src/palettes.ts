import type {CSSProperties} from 'react'
export const accents=['rose','lilac','cherry','jade','lagoon','citrus','rosewood','sky'] as const
export type Accent=typeof accents[number]
export type Mode='dark'|'light'
export const palettes={dark:{rose:'Chocolate Rose',lilac:'Lilac Dusk',cherry:'Cherry Cola',jade:'Velvet Olive',lagoon:'Lagoon Night',citrus:'Citrus Evening',rosewood:'Rosewood',sky:'Midnight Buttercup'},light:{rose:'Neapolitan',lilac:'Water Lily',cherry:'Strawberry Cream',jade:'Meadow Mauve',lagoon:'Crystal Lagoon',citrus:'Melon Sorbet',rosewood:'Salmon & Mauve',sky:'Buttercup Sky'}} satisfies Record<Mode,Record<Accent,string>>
type Colors={bg:string;panel:string;raised:string;hover:string;border:string;text:string;sub:string;muted:string;wash:string;a:string;ink:string}
const light=(bg:string,panel:string,a:string,text:string,border:string,wash:string):Colors=>({bg,panel,raised:bg,hover:panel,border,text,sub:`color-mix(in srgb, ${text} 82%, ${bg})`,muted:`color-mix(in srgb, ${text} 70%, ${bg})`,wash,a,ink:bg})
const dark=(bg:string,panel:string,a:string,text:string,border:string,wash:string):Colors=>({bg,panel,raised:panel,hover:wash,border,text,sub:`color-mix(in srgb, ${text} 82%, ${bg})`,muted:`color-mix(in srgb, ${text} 70%, ${bg})`,wash,a,ink:bg})
export const themeColors:Record<Mode,Record<Accent,Colors>>={
 light:{
 rose:light('#FCF7E9','#F6E4DF','#89546B','#604734','#DCC4BC','#F0C5D4'),
 lilac:light('#F8F4FB','#E9E2F2','#715486','#493B55','#CEBEDB','#D6C7E8'),
 cherry:light('#FFF5EE','#F6D8D6','#B43B50','#633A38','#DFA9AC','#E9A1AF'),
 jade:light('#F3F0E5','#E8DED4','#626941','#494A35','#CBC7AB','#C2C4A0'),
 lagoon:light('#F0F9F5','#D7EBE4','#287578','#345454','#A7CDC5','#A7DAD5'),
 citrus:light('#FBF4DD','#F1E8B8','#8A5B24','#514D28','#D2C48F','#D5D587'),
 rosewood:light('#F5E5DC','#DCC0B8','#80514D','#614536','#C5A39C','#C69FA6'),
 sky:light('#FBF6E5','#E7EAD9','#416B84','#3E5361','#BDD0CF','#B6D1DE')},
 dark:{
 rose:dark('#1C1318','#2A1D23','#E8AFBF','#F4E5DF','#50363F','#52313E'),
 lilac:dark('#191621','#262231','#CBB4E6','#EEE5F5','#464054','#443650'),
 cherry:dark('#241316','#351C21','#EB9DA9','#FCE2DB','#60393F','#66313E'),
 jade:dark('#1B2018','#2A2D23','#CDD2A3','#EEE9DC','#484C36','#444C30'),
 lagoon:dark('#132322','#1C3331','#A8DBD3','#E2F1E8','#34524D','#2D514B'),
 citrus:dark('#252216','#353020','#EAC477','#F5ECD5','#5C5232','#5F552B'),
 rosewood:dark('#241A18','#352723','#DEB2A6','#F4E3D9','#61483F','#604339'),
 sky:dark('#19232A','#25343F','#C7DFE8','#F4ECD5','#42596A','#3D5260')}
}
export function paletteStyle(mode:Mode,accent:Accent):CSSProperties{return Object.fromEntries(Object.entries(themeColors[mode][accent]).map(([key,value])=>['--'+key,value])) as CSSProperties}
export function applyPalette(mode:Mode,accent:Accent){document.documentElement.dataset.theme=mode;document.documentElement.dataset.accent=accent;Object.entries(themeColors[mode][accent]).forEach(([key,value])=>document.documentElement.style.setProperty('--'+key,value));document.documentElement.style.colorScheme=mode}
export function readAccent(value:unknown):Accent{if(value==='blue')return 'lilac';if(value==='peach')return 'cherry';return accents.includes(value as Accent)?value as Accent:'rose'}
