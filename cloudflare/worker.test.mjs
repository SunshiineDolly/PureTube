import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createService,digest,validRedirect,validateLibrary} from './worker.mjs';

const sample=()=>({version:1,profileName:'Viddy',profileBio:'',profileEmoji:'',groups:{},follows:[],later:[],favorites:[],collections:[],history:{},progress:{},savedVideos:{}});
function fixture({tokenRedirect=false,identityRedirect=false}={}) {
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
 function prepare(query) {
   const stmt=sql.prepare(query); let args=[];
   return {bind(...values){args=values;return this},async first(){return stmt.get(...args)??null},async run(){return {meta:{changes:Number(stmt.run(...args).changes)}}}};
 }
 const env={DB:{prepare,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}},DISCORD_CLIENT_ID:'1234567890123456',DISCORD_CLIENT_SECRET:'test-only-secret'};
 let discordUser='1234567890123456';
 const service=createService(async (url,options)=>{
   // Workers supports manual/follow, and throws before sending redirect:error.
   assert.equal(options.redirect,'manual');
   if(url.endsWith('/oauth2/token')) {assert.equal(options.body.get('client_secret'),env.DISCORD_CLIENT_SECRET);return tokenRedirect?new Response(null,{status:302,headers:{Location:'https://untrusted.example'}}):Response.json({access_token:'discord-test-token'})}
   assert.equal(url,'https://discord.com/api/v10/users/@me');
   assert.equal(options.headers.Authorization,'Bearer discord-test-token');
   return identityRedirect?new Response(null,{status:302,headers:{Location:'https://untrusted.example'}}):Response.json({id:discordUser,username:'test-user',global_name:'Viddy test'});
 });
 async function call(path,method='GET',data,token) {
   return service.fetch(new Request('https://viddy-sync.example'+path,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),'CF-Connecting-IP':'192.0.2.1'},...(data?{body:JSON.stringify(data)}:{})}),env);
 }
 async function begin(id='1234567890123456') {
   discordUser=id;
   const verifier='v'.repeat(43);
   const redirect='http://127.0.0.1:12345/viddy-auth/'+'r'.repeat(22);
   const response=await call('/v1/auth/start','POST',{redirect_uri:redirect,code_challenge:await digest(verifier)});
   assert.equal(response.status,200);
   const authorize=new URL((await response.json()).url);
   assert.equal(authorize.searchParams.get('scope'),'identify');
   const path='/oauth/discord/callback?state='+authorize.searchParams.get('state')+'&code=discord-code';
   const callback=await call(path);
   if(tokenRedirect||identityRedirect)return callback;
   assert.equal(callback.status,302);
   const target=new URL(callback.headers.get('Location'));
   assert.equal(target.origin,'http://127.0.0.1:12345');
   return {code:target.searchParams.get('code'),code_verifier:verifier,path};
 }
 async function login(id) {
   const ticket=await begin(id);
   const response=await call('/v1/auth/exchange','POST',ticket);
   assert.equal(response.status,200);
   return (await response.json()).token;
 }
 return {sql,env,call,begin,login};
}

test('redirects allow only a random path on IPv4 loopback with explicit port',()=>{
 assert(validRedirect('http://127.0.0.1:1234/viddy-auth/'+'x'.repeat(22)));
 for(const value of ['https://evil.example','http://localhost:1234/viddy-auth/'+'x'.repeat(22),'http://127.0.0.1:1234/viddy-auth/short','http://127.0.0.1:1234/viddy-auth/'+'x'.repeat(22)+'?code=bad']) assert(!validRedirect(value));
 assert(validateLibrary(sample()));
 assert(!validateLibrary({...sample(),groups:[]}));
 assert(!validateLibrary({...sample(),token:'secret'}));
});

test('desktop PKCE prevents intercepted tickets, replay, and state reuse',async()=>{
 const f=fixture();const ticket=await f.begin();
 assert.equal((await f.call('/v1/auth/exchange','POST',{...ticket,code_verifier:'w'.repeat(43)})).status,401);
 const response=await f.call('/v1/auth/exchange','POST',ticket);
 const session=await response.json();
 assert.equal(response.status,200);assert.equal(session.identity.id,'discord:1234567890123456');
 assert.equal((await f.call('/v1/auth/exchange','POST',ticket)).status,401);
 assert.equal((await f.call(ticket.path)).status,400);
 const stored=f.sql.prepare('SELECT * FROM sessions').get();
 assert.notEqual(stored.token_hash,session.token);
 assert.equal(stored.token_hash,await digest(session.token));
 assert.equal(JSON.stringify(stored).includes('test-only-secret'),false);
 f.sql.close();
});

test('Discord redirects are rejected without following them or creating sessions',async()=>{
 for(const option of [{tokenRedirect:true},{identityRedirect:true}]) {
  const f=fixture(option);
  const response=await f.begin();
  assert.equal(response.status,502);
  assert.equal(response.headers.get('Location'),null);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM users').get().n,0);
  f.sql.close();
 }
});

test('library reads are private and compare-and-swap prevents lost device writes',async()=>{
 const f=fixture();const pc=await f.login();const mac=await f.login();const other=await f.login('9999999999999999');
 assert.equal((await f.call('/v1/library')).status,401);
 assert.equal(await (await f.call('/v1/library')).json().then(x=>x.error!==undefined),true);
 const data={...sample(),favorites:['jNQXAC9IVRw'],groups:{channel:'Music'}};
 assert.equal(await (await f.call('/v1/library','PUT',{revision:0,data},pc)).json(),true);
 assert.equal(await (await f.call('/v1/library','GET',undefined,other)).json(),null);
 const remote=await (await f.call('/v1/library','GET',undefined,mac)).json();
 assert.deepEqual(remote,{revision:1,data});
 assert.equal(await (await f.call('/v1/library','PUT',{revision:0,data:sample()},mac)).json(),false);
 assert.equal(await (await f.call('/v1/library','PUT',{revision:1,data:sample()},mac)).json(),true);
 assert.equal(await (await f.call('/v1/library','PUT',{revision:1,data},pc)).json(),false);
 assert.equal(await (await f.call('/v1/library?revision=2','GET',undefined,pc)).json(),null);
 assert.equal(f.sql.prepare('SELECT bytes FROM storage_usage').get().bytes,Buffer.byteLength(JSON.stringify(sample())));
 f.sql.close();
});

test('sessions survive time passage; logout revokes only the current device',async()=>{
 const f=fixture();const pc=await f.login();const mac=await f.login();
 f.sql.prepare('UPDATE sessions SET created_at=0').run();
 assert.equal((await f.call('/v1/session','GET',undefined,pc)).status,200);
 assert.equal((await f.call('/v1/logout','POST',undefined,pc)).status,200);
 assert.equal((await f.call('/v1/session','GET',undefined,pc)).status,401);
 assert.equal((await f.call('/v1/session','GET',undefined,mac)).status,200);
 f.sql.close();
});

test('expired tickets and states are rejected',async()=>{
 const f=fixture();const ticket=await f.begin();
 f.sql.exec('UPDATE login_codes SET expires_at=0');
 assert.equal((await f.call('/v1/auth/exchange','POST',ticket)).status,401);
 f.sql.close();
});

test('free storage cap rolls back a write and preserves the prior cloud library',async()=>{
 const f=fixture();const token=await f.login();const data=sample();
 await f.call('/v1/library','PUT',{revision:0,data},token);
 f.sql.exec('UPDATE storage_usage SET bytes=200000000');
 const response=await f.call('/v1/library','PUT',{revision:1,data:{...data,profileBio:'more bytes'}},token);
 assert.equal(response.status,503);
 assert.deepEqual(await (await f.call('/v1/library','GET',undefined,token)).json(),{revision:1,data});
 assert.equal(f.sql.prepare('SELECT bytes FROM storage_usage').get().bytes,200000000);
 f.sql.close();
});

test('size limits and sign-in throttling fail safely without returning credentials',async()=>{
 const f=fixture();const token=await f.login();
 const huge={...sample(),profileBio:'a'.repeat(1_060_000)};
 assert.equal((await f.call('/v1/library','PUT',{revision:0,data:huge},token)).status,413);
 for(let i=0;i<19;i++) await f.call('/v1/auth/start','POST',{redirect_uri:'http://127.0.0.1:1234/viddy-auth/'+'r'.repeat(22),code_challenge:'a'.repeat(43)});
 const throttled=await f.call('/v1/auth/start','POST',{redirect_uri:'http://127.0.0.1:1234/viddy-auth/'+'r'.repeat(22),code_challenge:'a'.repeat(43)});
 assert.equal(throttled.status,429);
 delete f.env.DISCORD_CLIENT_SECRET;
 assert.equal((await (await f.call('/health')).json()).discordConfigured,false);
 f.sql.close();
});
