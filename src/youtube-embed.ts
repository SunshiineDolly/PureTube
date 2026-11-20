import {invoke} from '@tauri-apps/api/core'
import {isMac} from './platform'

let embedPort: Promise<number> | undefined

export async function configureYouTubeFrame(frame: HTMLIFrameElement, id: string, params: URLSearchParams) {
 const url = new URL('https://www.youtube.com/embed/' + id)
 url.search = params.toString()
 frame.referrerPolicy = 'strict-origin-when-cross-origin'
 frame.src = url.href

 if (isMac && location.protocol === 'tauri:') {
   embedPort ??= invoke<number>('youtube_embed_port').catch(error => {
     embedPort = undefined
     throw error
   })
   const port = await embedPort
   const redirect = new URL(`http://127.0.0.1:${port}/youtube`)
   redirect.searchParams.set('target', url.href)
   // Keep the YouTube URL in src so the IFrame API knows where to send messages.
   frame.srcdoc = `<!doctype html><meta http-equiv="refresh" content="0;url=${redirect.href}">`
 }
}
