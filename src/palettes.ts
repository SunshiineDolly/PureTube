export const accents=['rose','lilac','cherry','jade'] as const
export type Accent=typeof accents[number]
export type Mode='dark'|'light'
export const palettes={
 dark:{rose:'Rose Noir',lilac:'Lilac Dusk',cherry:'Cherry Cola',jade:'Pearl & Jade'},
 light:{rose:'Rose Petal',lilac:'Lilac Mist',cherry:'Cherry Cream',jade:'Jade Porcelain'},
} satisfies Record<Mode,Record<Accent,string>>

export function readAccent(value:unknown):Accent {
 if(value==='blue')return 'lilac'
 if(value==='peach')return 'cherry'
 return accents.includes(value as Accent)?value as Accent:'rose'
}
