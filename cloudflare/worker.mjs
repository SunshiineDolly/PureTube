// Viddy account service. No email, Discord messages, servers, or bot access.
const encoder = new TextEncoder();
const MAX_BODY = 1050000;
const MAX_LIBRARY = 1000000;
const MAX_PENDING = 1000;
const LIBRARY_KEYS = new Set(['version','profileName','profileBio','profileEmoji','groups','follows','later','favorites','collections','history','progress','savedVideos']);
const headers = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
class Failure extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const json = (value, status=200) => new Response(JSON.stringify(value), {status,headers:{...headers,'Content-Type':'application/json'}});
const fail = (status, message) => {throw new Failure(status, message)};
const now = () => Math.floor(Date.now()/1000);
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
export const digest = async value => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));
export function validRedirect(value) {
  try {
    const u = new URL(value);
    return u.protocol==='http:' && u.hostname==='127.0.0.1' && Number(u.port)>0 && !u.username && !u.password && !u.search && !u.hash && /^\/viddy-auth\/[A-Za-z0-9_-]{20,80}$/.test(u.pathname);
  } catch {return false}
}
export function validateLibrary(data) {
  if(!data || Array.isArray(data) || typeof data!=='object' || data.version!==1 || Object.keys(data).some(k=>!LIBRARY_KEYS.has(k))) return false;
  if(encoder.encode(JSON.stringify(data)).length>MAX_LIBRARY) return false;
  for(const key of ['profileName','profileBio','profileEmoji']) if(typeof data[key]!=='string') return false;
  for(const key of ['follows','later','favorites','collections']) if(!Array.isArray(data[key])) return false;
  for(const key of ['groups','history','progress','savedVideos']) if(!data[key] || typeof data[key]!=='object' || Array.isArray(data[key])) return false;
  return true;
}
async function body(request, limit=MAX_BODY) {
  if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) fail(415,'Send JSON data.');
  if(Number(request.headers.get('Content-Length'))>limit) fail(413,'This library is too large to sync. Your local copy is safe.');
  const reader=request.body?.getReader();
  if(!reader) fail(400,'Missing request data.');
  const chunks=[]; let size=0;
  try {
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();fail(413,'This library is too large to sync. Your local copy is safe.')}chunks.push(value)}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes));
  } catch(error) {if(error instanceof Failure)throw error;fail(400,'Invalid JSON data.')}
}
const configured = env => /^\d{16,22}$/.test(env.DISCORD_CLIENT_ID??'') && !!env.DISCORD_CLIENT_SECRET;
async function throttle(request, db) {
  const key=await digest(request.headers.get('CF-Connecting-IP')??'unknown');
  const t=now();
  await db.prepare('DELETE FROM auth_limits WHERE started_at < ?').bind(t-600).run();
  const row=await db.prepare('INSERT INTO auth_limits(client_hash,started_at,attempts) VALUES(?,?,1) ON CONFLICT(client_hash) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(key,t).first();
  if(row.attempts>20) fail(429,'Too many sign-in attempts. Please wait a few minutes.');
}
async function start(request, env, origin) {
  if(!configured(env))fail(503,'Discord sign-in is not configured for Viddy yet.');
  const input=await body(request,2048);
  if(!validRedirect(input.redirect_uri) || !/^[A-Za-z0-9_-]{43}$/.test(input.code_challenge??''))fail(400,'Invalid desktop sign-in request.');
  await throttle(request,env.DB);
  const t=now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM oauth_states WHERE expires_at < ?').bind(t),
    env.DB.prepare('DELETE FROM login_codes WHERE expires_at < ?').bind(t)
  ]);
  const state=random();
  const result=await env.DB.prepare('INSERT INTO oauth_states(state_hash,challenge,redirect_uri,expires_at) SELECT ?,?,?,? WHERE (SELECT count(*) FROM oauth_states) < ?').bind(await digest(state),input.code_challenge,input.redirect_uri,t+600,MAX_PENDING).run();
  if(!result.meta.changes)fail(503,'Sign-in is busy. Please try again shortly.');
  const url=new URL('https://discord.com/oauth2/authorize');
  url.search=new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,response_type:'code',redirect_uri:origin+'/oauth/discord/callback',scope:'identify',state}).toString();
  return json({url:url.href});
}
async function callback(url,env,origin,fetcher) {
  if(!configured(env))fail(503,'Discord sign-in is not configured for Viddy yet.');
  const state=url.searchParams.get('state');
  const code=url.searchParams.get('code');
  if(!state || !/^[A-Za-z0-9_-]{43}$/.test(state))fail(400,'This sign-in request is unavailable. Return to Viddy and try again.');
  const pending=await env.DB.prepare('DELETE FROM oauth_states WHERE state_hash=? AND expires_at>=? RETURNING challenge,redirect_uri').bind(await digest(state),now()).first();
  if(!pending || !validRedirect(pending.redirect_uri))fail(400,'This sign-in request expired. Return to Viddy and try again.');
  if(url.searchParams.has('error') || !code || code.length>512)fail(400,'Discord sign-in was cancelled. Return to Viddy.');
  const tokenResponse=await fetcher('https://discord.com/api/oauth2/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},redirect:'manual',
    body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:origin+'/oauth/discord/callback'})
  });
  if(!tokenResponse.ok)fail(502,'Discord could not finish sign-in. Return to Viddy and try again.');
  const token=await tokenResponse.json();
  if(typeof token.access_token!=='string')fail(502,'Discord returned an invalid sign-in response.');
  const identityResponse=await fetcher('https://discord.com/api/v10/users/@me',{headers:{Authorization:'Bearer '+token.access_token},redirect:'manual'});
  if(!identityResponse.ok)fail(502,'Discord could not verify this account.');
  const identity=await identityResponse.json();
  if(!/^\d{16,22}$/.test(identity.id??'') || typeof identity.username!=='string')fail(502,'Discord returned an invalid account.');
  const name=String(identity.global_name||identity.username).slice(0,100);
  const id='discord:'+identity.id;
  const ticket=random();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users(id,display_name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name').bind(id,name),
    env.DB.prepare('INSERT INTO login_codes(code_hash,user_id,challenge,expires_at) VALUES(?,?,?,?)').bind(await digest(ticket),id,pending.challenge,now()+120)
  ]);
  const redirect=new URL(pending.redirect_uri);redirect.searchParams.set('code',ticket);
  return new Response(null,{status:302,headers:{...headers,Location:redirect.href}});
}
async function exchange(request,env) {
  const input=await body(request,2048);
  if(!/^[A-Za-z0-9_-]{43}$/.test(input.code??'') || !/^[A-Za-z0-9._~-]{43,128}$/.test(input.code_verifier??''))fail(400,'Invalid sign-in response.');
  const row=await env.DB.prepare('DELETE FROM login_codes WHERE code_hash=? AND challenge=? AND expires_at>=? RETURNING user_id').bind(await digest(input.code),await digest(input.code_verifier),now()).first();
  if(!row)fail(401,'This sign-in request expired. Please sign in again.');
  const user=await env.DB.prepare('SELECT id,display_name FROM users WHERE id=?').bind(row.user_id).first();
  if(!user)fail(401,'This account is unavailable.');
  const token=random();
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,created_at) VALUES(?,?,?)').bind(await digest(token),user.id,now()).run();
  return json({token,identity:user});
}
async function authorize(request,env) {
  const bearer=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if(!bearer)fail(401,'Please sign in with Discord.');
  const hash=await digest(bearer);
  const user=await env.DB.prepare('SELECT u.id,u.display_name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?').bind(hash).first();
  if(!user)fail(401,'This device was signed out. Please sign in again.');
  return {user,hash};
}
export function createService(fetcher=fetch) {
  return {async fetch(request,env) {
    try {
      const url=new URL(request.url);const route=request.method+' '+url.pathname;
      if(route==='GET /health')return json({service:'viddy-sync',version:1,discordConfigured:configured(env)});
      if(!env.DB)fail(503,'Viddy sync is not configured yet.');
      if(route==='POST /v1/auth/start')return await start(request,env,url.origin);
      if(route==='GET /oauth/discord/callback')return await callback(url,env,url.origin,fetcher);
      if(route==='POST /v1/auth/exchange')return await exchange(request,env);
      if(!['GET /v1/session','POST /v1/logout','GET /v1/library','PUT /v1/library'].includes(route))return json({error:'Not found.'},404);
      const {user,hash}=await authorize(request,env);
      if(route==='GET /v1/session')return json(user);
      if(route==='POST /v1/logout'){await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(hash).run();return json(true)}
      if(route==='GET /v1/library') {
        const row=await env.DB.prepare('SELECT revision,data FROM libraries WHERE user_id=?').bind(user.id).first();
        if(!row || String(row.revision)===url.searchParams.get('revision'))return json(null);
        return json({revision:row.revision,data:JSON.parse(row.data)});
      }
      const input=await body(request);
      if(!Number.isSafeInteger(input.revision) || input.revision<0 || !validateLibrary(input.data))fail(400,'The library format or size is unsupported. Your local library is safe.');
      const data=JSON.stringify(input.data);
      const result=input.revision===0
        ? await env.DB.prepare('INSERT OR IGNORE INTO libraries(user_id,revision,data) VALUES(?,1,?)').bind(user.id,data).run()
        : await env.DB.prepare('UPDATE libraries SET data=?,revision=revision+1 WHERE user_id=? AND revision=?').bind(data,user.id,input.revision).run();
      return json(result.meta.changes===1);
    } catch(error) {
      if(error instanceof Failure)return json({error:error.message},error.status);
      // Never log request bodies, Discord tokens, app tokens, or OAuth codes.
      return json({error:'Sync is temporarily unavailable or has reached its free capacity. Your local library is safe.'},503);
    }
  }};
}
export default createService();
