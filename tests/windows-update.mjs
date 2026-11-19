import assert from 'node:assert/strict'
import {spawn,spawnSync,execFileSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {setTimeout as wait} from 'node:timers/promises'
import net from 'node:net'

// Installs the bootstrap release for the current Windows user, then waits for
// a newer signed release and exercises the real Settings update action.
// Intentionally retains the installed app and the user's existing library.
const installer=resolve(process.argv[2])
const expected=process.argv[3]
assert.ok(existsSync(installer)&&/^\d+\.\d+\.\d+$/.test(expected))
const installDirectory=join(process.env.LOCALAPPDATA,'Programs','PureTube')
const installed=spawnSync(installer,['/S','/D='+installDirectory],{stdio:'ignore',timeout:90000})
assert.equal(installed.status,0,'bootstrap installation must succeed')
const location=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PureTube').InstallLocation"],{encoding:'utf8',windowsHide:true}).trim().replace(/^"|"$/g,'')
assert.equal(location.toLowerCase(),installDirectory.toLowerCase(),'the permanent installation must use the requested directory')
assert.ok(location&&existsSync(join(location,'puretube.exe')),'installed executable must exist')
const exe=join(location,'puretube.exe')
const server=net.createServer().listen(0,'127.0.0.1')
await new Promise(ok=>server.once('listening',ok))
const port=server.address().port
await new Promise(ok=>server.close(ok))
const child=spawn(exe,[],{stdio:'ignore',env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port='+port}})
let ws,seq=0
async function eventually(task,timeout=30000){const until=Date.now()+timeout;let last;while(Date.now()<until){try{const result=await task();if(result)return result}catch(e){last=e}await wait(300)}throw Error('Update test timed out'+(last?': '+last.message:''))}
async function connect(){
 const target=await eventually(async()=>{const response=await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(1500)});return (await response.json()).find(p=>p.type==='page'&&p.url.includes('tauri.localhost'))},60000)
 ws=new WebSocket(target.webSocketDebuggerUrl)
 await new Promise((ok,no)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',no,{once:true})})
}
function call(method,params={}){const id=++seq;return new Promise((ok,no)=>{const socket=ws;const timer=setTimeout(()=>{socket.removeEventListener('message',receive);no(Error('CDP timed out: '+method))},25000);function receive(e){const message=JSON.parse(e.data);if(message.id!==id)return;clearTimeout(timer);socket.removeEventListener('message',receive);message.error?no(Error(message.error.message)):ok(message.result)}socket.addEventListener('message',receive);socket.send(JSON.stringify({id,method,params}))})}
async function value(expression){const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??expression);return result.result.value}
const invoke=(name,args={})=>value(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(name)},${JSON.stringify(args)})`)
const snapshot=()=>value(`window.__TAURI_INTERNALS__.invoke('load').then(d=>Object.fromEntries(['follows','later','favorites','collections','profileName','settings'].map(k=>[k,d[k]])))`)
try{
 await connect()
 await eventually(()=>value('!!document.querySelector(".sidebar")'))
 const before=await snapshot()
 const oldVersion=await invoke('plugin:app|version')
 assert.notEqual(oldVersion,expected)
 assert.equal(await invoke('update_configured'),true)
 const offered=await invoke('update_check')
 assert.ok(offered===null||offered.version===expected,'the public feed must offer the expected newer release or the current bootstrap')
 console.log('Installed signed PureTube '+oldVersion+'; its public update feed is configured.')
 console.log('Waiting for signed PureTube '+expected+' to be published...')
 const deadline=Date.now()+20*60_000
 let release
 while(Date.now()<deadline){release=await invoke('update_check');if(release?.version===expected)break;await wait(10000)}
 assert.equal(release?.version,expected,'the newer signed release must be offered')
 await value(`document.querySelector('.sidebar [aria-label="Settings"]').click()`)
 await eventually(()=>value(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Check for updates'&&!b.disabled)`))
 await value(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Check for updates').click()`)
 await eventually(()=>value(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Update and restart'&&!b.disabled)`))
 // WebView2 handles native confirm dialogs outside the CDP Page domain.
 // Simulate the already-authorized user acceptance, retaining its message.
 await value(`window.confirm=message=>{window.__updateConfirmation=message;return true}`)
 let sawProgress=false
 await value(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Update and restart').click()`)
 const confirmation=await value('window.__updateConfirmation')
 const until=Date.now()+150000
 while(child.exitCode===null&&Date.now()<until){try{sawProgress ||= await value('!!document.querySelector(".update-progress")')}catch{}await wait(100)}
 assert.ok(confirmation?.includes(expected),'the update action must request confirmation for the offered version')
 assert.notEqual(child.exitCode,null,'the bootstrap app must exit for installation')
 assert.equal(sawProgress,true,'Settings must show update download progress')
 ws.close()
 await connect()
 await eventually(async()=>await invoke('plugin:app|version')===expected,60000)
 await eventually(()=>value('!!document.querySelector(".sidebar")'))
 assert.deepEqual(await snapshot(),before,'the update must preserve follows, library, profile, and settings')
 assert.equal(await invoke('update_configured'),true)
 assert.equal(await invoke('update_check'),null,'the installed update must recognize it is current')
 const count=Number(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`@(Get-Process puretube -ErrorAction SilentlyContinue | Where-Object Path -eq '${exe.replaceAll("'","''")}').Count`],{encoding:'utf8',windowsHide:true}).trim())
 assert.equal(count,1,'the updater must restart exactly one app instance')
 console.log('Updated '+oldVersion+' → '+expected+' through Settings: progress displayed, signature verified, automatic restart succeeded, personal data preserved, one app instance running.')
}finally{ws?.close()}
