import {D1FileStore} from "./d1-file-store";
import { env } from "cloudflare:workers";
import { currentUser, isResearchOwner } from "./auth";
import { FEATURES, predictCluster, type Activity, type ResearchModel } from "./research-model";
export function db() { if (!env.DB) throw new Error("Database unavailable."); return env.DB; }
export function bucket() { if(env.FILE_STORAGE==="d1")return new D1FileStore(db()); if (!env.BUCKET) throw new Error("File storage unavailable."); return env.BUCKET; }
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export class HttpError extends Error { constructor(public status:number, message:string) { super(message); } }
export function json(data:unknown, status=200, headers:HeadersInit={}) { return Response.json(data, {status,headers:{"Cache-Control":"no-store",...headers}}); }
export async function user() { const u=await currentUser(); if(!u) throw new HttpError(401,"Sign in to save your notes."); return u; }
export async function admin() { const u=await user(); if(!await isResearchOwner(u)) throw new HttpError(403,"Only the research owner can view this dashboard."); return u; }
export function sameOrigin(req:Request) { const origin=req.headers.get("origin"); if(req.headers.get("sec-fetch-site")==="cross-site" || (origin && new URL(origin).host !== new URL(req.url).host && new URL(origin).host !== req.headers.get("host"))) throw new HttpError(403,"This action must come from this website."); }
export async function readBytes(req:Request, limit:number) {
  if(Number(req.headers.get("content-length")||0)>limit)throw new HttpError(413,"Request is too large.");
  const reader=req.body?.getReader(); if(!reader)return new Uint8Array();
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new HttpError(413,"Request is too large.");}chunks.push(value);}
  const result=new Uint8Array(size);let offset=0;for(const c of chunks){result.set(c,offset);offset+=c.byteLength;}return result;
}
export async function body(req:Request) {
  const raw=new TextDecoder().decode(await readBytes(req,300000));
  try{const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error();return parsed;}catch{throw new HttpError(400,"Please send a JSON object.");}
}
export const text = (v:unknown, max:number, fallback="") => typeof v==="string" ? v.trim().slice(0,max) : fallback;
export const oneOf = (v:unknown, values:string[], fallback="Unknown") => typeof v==="string" && values.includes(v) ? v : fallback;
export function consentId(req:Request) { const value=req.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith("na_research="))?.split("=")[1]; return value && /^[a-f0-9-]{36}$/.test(value) ? value : null; }
export function researchCookie(req:Request,id:string,clear=false) { return `na_research=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear?0:90*86400}${new URL(req.url).protocol==="https:"?"; Secure":""}`; }
export async function cleanup() { const date=new Date(Date.now()-90*86400000).toISOString(); await db().batch([db().prepare("DELETE FROM events WHERE createdAt < ?").bind(date),db().prepare("DELETE FROM participants WHERE createdAt < ?").bind(date)]); }
export async function participant(req:Request) { const id=consentId(req); if(!id)return null; return db().prepare("SELECT * FROM participants WHERE id=? AND createdAt>=?").bind(id,new Date(Date.now()-90*86400000).toISOString()).first<Record<string,string|number>>(); }
export async function track(req:Request,kind:string,seconds=0) { const p=await participant(req); if(!p)return; const recent=await db().prepare("SELECT COUNT(*) as n FROM events WHERE participantId=? AND createdAt>?").bind(p.id,new Date(Date.now()-3600000).toISOString()).first<{n:number}>(); if((recent?.n||0)>=180)return; await db().batch([db().prepare("INSERT INTO events (id,participantId,kind,seconds,createdAt) VALUES (?,?,?,?,?)").bind(uid(),p.id,kind,seconds,now()),db().prepare("UPDATE participants SET lastSeen=? WHERE id=?").bind(now(),p.id)]); }
export function decodeNote(note:Record<string,any>):Record<string,any>&{tags:string[];folderId:string|null} { return {...note,tags:typeof note.tags==="string"?JSON.parse(note.tags):note.tags??[],folderId:note.folderId??null}; }
export async function ownedNote(id:string,ownerId:string,includeTrash=false) { const note=await db().prepare("SELECT * FROM notes WHERE id=? AND ownerId=?").bind(id,ownerId).first<Record<string,any>>(); if(!note||(!includeTrash&&note.deletedAt))throw new HttpError(404,"Note not found."); return decodeNote(note); }
export async function activity():Promise<Activity[]> {
  const from=new Date(Date.now()-30*86400000).toISOString();
  const result=await db().prepare(`SELECT p.id as research_id,
    SUM(CASE WHEN e.kind='page_view' THEN 1 ELSE 0 END) as page_views,
    SUM(CASE WHEN e.kind='note_view' THEN 1 ELSE 0 END) as note_views,
    SUM(CASE WHEN e.kind='note_create' THEN 1 ELSE 0 END) as creates,
    SUM(CASE WHEN e.kind='note_edit' THEN 1 ELSE 0 END) as edits,
    SUM(CASE WHEN e.kind='upload' THEN 1 ELSE 0 END) as uploads,
    SUM(CASE WHEN e.kind='share' THEN 1 ELSE 0 END) as shares,
    COALESCE(SUM(e.seconds),0) as active_seconds,
    COUNT(DISTINCT substr(e.createdAt,1,10)) as active_days
    FROM participants p LEFT JOIN events e ON e.participantId=p.id AND e.createdAt>=?
    WHERE p.lastSeen>=? GROUP BY p.id ORDER BY p.id`).bind(from,from).all<Activity>();
  return result.results;
}
export async function analytics() {
  await cleanup(); const from=new Date(Date.now()-30*86400000).toISOString();
  const people=(await db().prepare("SELECT * FROM participants WHERE lastSeen>=?").bind(from).all<Record<string,any>>()).results;
  const totals=(await db().prepare("SELECT kind,COUNT(*) as n,COALESCE(SUM(seconds),0) as seconds FROM events WHERE createdAt>=? GROUP BY kind").bind(from).all<{kind:string;n:number;seconds:number}>()).results;
  const total=(kind:string)=>totals.find(x=>x.kind===kind)?.n||0;
  const breakdown=(field:string,surveyOnly=false)=>{
    const counts=new Map<string,number>(); for(const p of people.filter(p=>!surveyOnly||p.surveyed)) counts.set(p[field],(counts.get(p[field])||0)+1);
    let hidden=0; const rows:{label:string;count:number}[]=[];
    for(const [label,count] of counts) {if(count<5)hidden+=count;else rows.push({label,count});} rows.sort((a,b)=>b.count-a.count);
    if(hidden) rows.push({label:"Small groups (combined)",count:hidden}); return rows;
  };
  const recordedDays=(await db().prepare("SELECT substr(createdAt,1,10) as day,COUNT(*) as views FROM events WHERE kind='page_view' AND createdAt>=? GROUP BY day ORDER BY day").bind(from).all<{day:string;views:number}>()).results;
  const daily=Array.from({length:31},(_,i)=>{const day=new Date(Date.now()-(30-i)*86400000).toISOString().slice(0,10);return {day,views:recordedDays.find(d=>d.day===day)?.views||0};});
  const rows=await activity(); const stored=await db().prepare("SELECT value FROM settings WHERE key='ml_model'").first<{value:string}>();
  const model:ResearchModel|null=stored?JSON.parse(stored.value):null;
  const groups=model?model.centroids.map((_,i)=>{const assigned=rows.filter(r=>predictCluster(r,model)===i);return {label:`Group ${i+1}`,count:assigned.length,meanViews:assigned.length?Math.round(assigned.reduce((s,r)=>s+r.page_views+r.note_views,0)/assigned.length):0};}):[];
  const safe=groups.filter(g=>g.count>=5); const small=groups.filter(g=>g.count<5).reduce((s,g)=>s+g.count,0); if(small)safe.push({label:"Small groups (combined)",count:small,meanViews:0});
  return {browsers:people.length,surveys:people.filter(p=>p.surveyed).length,pageViews:total("page_view"),noteViews:total("note_view"),activeMinutes:Math.round(totals.reduce((s,x)=>s+x.seconds,0)/60),actions:total("note_create")+total("note_edit")+total("upload")+total("share"),countries:breakdown("country",true),geoCountries:breakdown("geoCountry"),age:breakdown("ageBand",true),gender:breakdown("gender",true),education:breakdown("education",true),purpose:breakdown("purpose",true),devices:breakdown("device"),languages:breakdown("language"),daily,model:model?{training_source:model.training_source,trained_samples:model.trained_samples,silhouette_train:model.silhouette_train,silhouette_holdout:model.silhouette_holdout,clusters:model.centroids.length}:null,groups:safe,features:FEATURES};
}
