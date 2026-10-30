// Signed test tokens use ephemeral keys served only inside an isolated Worker.
// No Firebase accounts, network requests, or real/local database records are used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {generateKeyPair, exportJWK, SignJWT} from 'jose';
const require=createRequire(fs.realpathSync(new URL('../node_modules/wrangler/package.json',import.meta.url)));
const {Miniflare}=require('miniflare');
const {privateKey,publicKey}=await generateKeyPair('RS256');
const jwk={...await exportJWK(publicKey),kid:'isolated-test-key',alg:'RS256',use:'sig'};
const base=new URL('../dist/server/',import.meta.url).pathname;
const files=fs.readdirSync(base,{recursive:true}).filter(p=>p.endsWith('.js')).map(p=>({type:'ESModule',path:base+p}));
const ownerEmail='owner@example.test';
const mf=new Miniflare({modules:[{type:'ESModule',path:base+'index.js'},...files.filter(p=>p.path!==base+'index.js')],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],cf:false,bindings:{AUTH_MODE:'firebase',RESEARCH_OWNER_EMAIL:ownerEmail},outboundService:async request=>{
 assert.equal(request.url,'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
 return new Response(JSON.stringify({keys:[jwk]}),{headers:{'Content-Type':'application/json'}});
}});
let checks=0;
async function token(claims={},options={}){
 return new SignJWT({email:'visitor@example.test',email_verified:true,auth_time:Math.floor(Date.now()/1000),...claims})
 .setProtectedHeader({alg:'RS256',kid:jwk.kid}).setIssuer(options.issuer??'https://securetoken.google.com/notes-42ff9')
 .setAudience(options.audience??'notes-42ff9').setSubject(options.subject??'visitor')
 .setIssuedAt().setExpirationTime(options.expiration??'1h').sign(options.key??privateKey);
}
async function call(path,method='GET',body,headers={},status=200){
 const response=await mf.dispatchFetch(`https://test.local/api/${path}`,{method,headers:{...headers,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json();assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(data)}`);checks++;
 return {data,response};
}
async function session(jwt){
 const {response}=await call('auth/session','POST',{token:jwt});
 const raw=response.headers.get('set-cookie');
 assert.match(raw,/HttpOnly/);assert.match(raw,/Secure/);assert.match(raw,/SameSite=Lax/);checks+=3;
 return {cookie:raw.split(';')[0]};
}
try{
 const db=await mf.getD1Database('DB');
 const migrationDir=new URL('../drizzle/',import.meta.url);
 const sql=fs.readdirSync(migrationDir).filter(name=>name.endsWith('.sql')).sort().map(name=>fs.readFileSync(new URL(name,migrationDir),'utf8')).join('\n--> statement-breakpoint\n');
 for(const s of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 const insecure=await mf.dispatchFetch('http://test.local/api/session',{redirect:'manual'});
 assert.equal(insecure.status,308);assert.equal(insecure.headers.get('location'),'https://test.local/api/session');checks++;
 const forged={'oai-authenticated-user-id':'attacker','oai-authenticated-user-email':ownerEmail};
 assert.equal((await call('session','GET',undefined,forged)).data.user,null);
 await call('notes','POST',{title:'Forged'},forged,401);
 await call('research/analytics','GET',undefined,forged,401);
 await call('profile','GET',undefined,forged,401);
 await call('profile/photo','GET',undefined,forged,401);
 await call('auth/session','POST',{token:'fake'}, {},401);
 await call('auth/session','POST',{token:await token({email_verified:false,email:ownerEmail})},{},401);
 await call('auth/session','POST',{token:await token({}, {audience:'other-project'})},{},401);
 await call('auth/session','POST',{token:await token({}, {issuer:'https://attacker.test'})},{},401);
 await call('auth/session','POST',{token:await token({}, {expiration:'-1s'})},{},401);
 await call('auth/session','POST',{token:await token({auth_time:Math.floor(Date.now()/1000)+3600})},{},401);
 const wrongKey=(await generateKeyPair('RS256')).privateKey;
 await call('auth/session','POST',{token:await token({}, {key:wrongKey})},{},401);
 await call('auth/session','POST',{token:await token()},{origin:'https://attacker.test'},403);
 const visitor=await session(await token());
 const visitorProfile=(await call('profile','GET',undefined,visitor)).data.profile;
 await call('profile','PATCH',{phone:'+880 1700 000000',addressLine1:'Firebase private address',expectedUpdatedAt:visitorProfile.updatedAt},visitor);

 assert.equal((await call('session','GET',undefined,visitor)).data.isAdmin,false);
 assert.equal(await db.prepare("SELECT * FROM settings WHERE key='research_owner'").first(),null,'Public first signup cannot bootstrap an owner');checks++;
 const created=(await call('notes','POST',{title:'Private Firebase note'},visitor,201)).data.note;
 const renamedVisitor=await session(await token({name:'Updated Visitor'}));
 assert.equal((await call('session','GET',undefined,renamedVisitor)).data.user.name,'Updated Visitor');checks++;
 await call(`notes/${created.id}`,'GET',undefined,renamedVisitor);
 const pretendingOwner=await session(await token({name:'Research owner'}));
 assert.equal((await call('session','GET',undefined,pretendingOwner)).data.isAdmin,false,'Display names do not confer owner privileges');checks++;

 assert.equal((await db.prepare('SELECT COUNT(*) n FROM participants').first()).n,0,'Login does not enroll research');checks++;
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM events').first()).n,0);checks++;
 const owner=await session(await token({email:ownerEmail},{subject:'owner'}));
 assert.equal((await call('profile','GET',undefined,owner)).data.profile.addressLine1,'');checks++;

 assert.equal((await call('session','GET',undefined,owner)).data.isAdmin,true);
 await call('research/analytics','GET',undefined,owner);
 await call('research/analytics','GET',undefined,visitor,403);
 await call(`notes/${created.id}`,'GET',undefined,owner,404);
 await call(`notes/${created.id}`,'GET',undefined,visitor);
 const logout=await call('auth/session','DELETE',undefined,visitor);
 assert.match(logout.response.headers.get('set-cookie'),/Max-Age=0/);checks++;
 const expired={cookie:`na_auth=${await token({}, {expiration:'-1s'})}`};
 await call('notes','GET',undefined,expired,401);
 await call('research/analytics','GET',undefined,{cookie:'na_auth=fake'},401);
 console.log(`Passed ${checks} Firebase authentication and isolation checks.`);
}finally{await mf.dispose();}
