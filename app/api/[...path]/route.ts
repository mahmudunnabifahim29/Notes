import {FileStorageFullError} from "@/lib/d1-file-store";
import {handleProfile} from "@/lib/profile";
import { currentUser, authMode, authCookie, isResearchOwner } from "@/lib/auth";
import { verifyFirebaseToken } from "@/lib/firebase-token";
import { normalizeTags } from "@/lib/note-organization";
import { EXAMPLES } from "@/lib/examples";
import { validateModel, FEATURES } from "@/lib/research-model";
import { db,bucket,uid,now,decodeNote,HttpError,json,user,admin,sameOrigin,body,readBytes,text,oneOf,consentId,researchCookie,cleanup,participant,track,ownedNote,activity,analytics } from "@/lib/server";
export const dynamic = "force-dynamic";
const CATEGORIES=["Personal","Learning","Projects","Research"],COLORS=["cream","yellow","lavender","rose","mint","blue"];
type Context={params:Promise<{path:string[]}>};
async function organization(b:Record<string,unknown>,ownerId:string,fallback?:Record<string,any>){
  const folderId=b.folderId===undefined?fallback?.folderId??null:b.folderId;
  if(folderId!==null){if(typeof folderId!=="string")throw new HttpError(400,"Choose a valid folder.");const folder=await db().prepare("SELECT id FROM folders WHERE id=? AND ownerId=?").bind(folderId,ownerId).first();if(!folder)throw new HttpError(404,"Folder not found. Choose another folder or Unfiled.");}
  let tags:string[];try{tags=normalizeTags(b.tags===undefined?fallback?.tags??[]:b.tags);}catch(e){throw new HttpError(400,(e as Error).message);}
  return {folderId,tags:JSON.stringify(tags)};
}
async function handle(req:Request,context:Context):Promise<Response> {
  try {
    const {path}=await context.params; const [resource,id,action]=path; const method=req.method;
    if(method!=="GET")sameOrigin(req);
    if(resource==="auth"&&id==="session"&&authMode()==="firebase") {
      if(method==="DELETE")return json({ok:true},200,{"Set-Cookie":authCookie(req)});
      if(method==="POST") {
        const b=await body(req);
        if(typeof b.token!=="string"||b.token.length>12000)throw new HttpError(400,"A Firebase ID token is required.");
        let verified;
        try { verified=await verifyFirebaseToken(b.token); }
        catch { throw new HttpError(401,"Please sign in with a verified email address."); }
        return json({ok:true},200,{"Set-Cookie":authCookie(req,b.token,verified.expiresAt)});
      }
    }
    if(resource==="profile"&&!action)return await handleProfile(req,id);
    if(resource==="session"&&method==="GET") {
      const u=await currentUser();
      // The first-user bootstrap is only for the legacy owner-private Sites runtime.
      if(u&&authMode()==="sites")await db().prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('research_owner',?)").bind(u.userId).run();
      const profile=u?await db().prepare("SELECT photoVersion FROM profiles WHERE ownerId=?").bind(u.userId).first<{photoVersion:string|null}>():null;
      return json({user:u?{name:u.fullName||u.displayName,email:u.email,photoVersion:profile?.photoVersion??null}:null,isAdmin:await isResearchOwner(u),authMode:authMode()});
    }
    if(resource==="folders") {
      const u=await user();
      if(!id&&method==="GET")return json({folders:(await db().prepare("SELECT id,name FROM folders WHERE ownerId=? ORDER BY name COLLATE NOCASE").bind(u.userId).all()).results});
      if(id){const folder=await db().prepare("SELECT id FROM folders WHERE id=? AND ownerId=?").bind(id,u.userId).first();if(!folder)throw new HttpError(404,"Folder not found.");}
      if((method==="POST"&&!id)||(method==="PATCH"&&id)){
        const b=await body(req);const name=typeof b.name==="string"?b.name.trim():"";
        if(!name||name.length>60||/[\r\n]/.test(name))throw new HttpError(400,"Folder names must be 1–60 characters without line breaks.");
        if(!id){const count=await db().prepare("SELECT COUNT(*) n FROM folders WHERE ownerId=?").bind(u.userId).first<{n:number}>();if((count?.n??0)>=50)throw new HttpError(400,"Up to 50 folders per account.");}
        const folderId=id??uid();
        const result=id?await db().prepare("UPDATE OR IGNORE folders SET name=? WHERE id=? AND ownerId=?").bind(name,id,u.userId).run():await db().prepare("INSERT OR IGNORE INTO folders (id,ownerId,name,createdAt) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM folders WHERE ownerId=?)<50").bind(folderId,u.userId,name,now(),u.userId).run();
        if(!result.meta.changes)throw new HttpError(409,"A folder with that name already exists.");
        return json({folder:{id:folderId,name}},id?200:201);
      }
      if(id&&method==="DELETE"){
        const version=now();
        await db().batch([
          db().prepare("UPDATE notes SET folderId=NULL,updatedAt=CASE WHEN updatedAt>=? THEN strftime('%Y-%m-%dT%H:%M:%fZ',updatedAt,'+0.001 seconds') ELSE ? END WHERE folderId=? AND ownerId=?").bind(version,version,id,u.userId),
          db().prepare("DELETE FROM folders WHERE id=? AND ownerId=?").bind(id,u.userId),
        ]);
        return json({ok:true});
      }
      throw new HttpError(404,"Endpoint not found.");
    }
    if(resource==="notes") {
      const u=await user();
      if(!id&&method==="GET"){const trash=new URL(req.url).searchParams.get("trash")==="1";return json({notes:(await db().prepare("SELECT n.*, (SELECT COUNT(*) FROM attachments a WHERE a.noteId=n.id) as attachmentCount FROM notes n WHERE ownerId=? AND ((?=1 AND deletedAt IS NOT NULL) OR (?=0 AND deletedAt IS NULL)) ORDER BY updatedAt DESC").bind(u.userId,trash?1:0,trash?1:0).all()).results.map(decodeNote)});}
      if(id==="starter"&&method==="POST") {
        const existing=await db().prepare("SELECT COUNT(*) as n FROM notes WHERE ownerId=?").bind(u.userId).first<{n:number}>();
        if((existing?.n||0)>0)throw new HttpError(409,"Example notes can be added to an empty workspace.");
        await db().batch(EXAMPLES.map(n=>db().prepare("INSERT INTO notes (id,ownerId,title,content,category,color,starred,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)").bind(uid(),u.userId,n.title,n.content,n.category,n.color,n.starred,now(),now())));
        return json({ok:true});
      }
      if(!id&&method==="POST") {
        const b=await body(req);
        if(b.clientId!==undefined&&(typeof b.clientId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(b.clientId)))throw new HttpError(400,"Invalid note creation identifier.");
        const noteId=b.clientId??uid();
        if(b.clientId){const existing=await db().prepare("SELECT id FROM notes WHERE id=? AND ownerId=?").bind(noteId,u.userId).first();if(existing)return json({note:await ownedNote(noteId,u.userId)});}
        const count=await db().prepare("SELECT COUNT(*) as n FROM notes WHERE ownerId=?").bind(u.userId).first<{n:number}>();
        if((count?.n||0)>=500)throw new HttpError(400,"This starter supports up to 500 notes per account.");
        const org=await organization(b,u.userId);
        const inserted=await db().prepare("INSERT OR IGNORE INTO notes (id,ownerId,title,content,category,color,folderId,tags,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(noteId,u.userId,text(b.title,120)||"Untitled note",typeof b.content==="string"?b.content.slice(0,100000):"",oneOf(b.category,CATEGORIES,"Personal"),oneOf(b.color,COLORS,"cream"),org.folderId,org.tags,now(),now()).run();
        const note=await ownedNote(noteId,u.userId);
        if(inserted.meta.changes)await track(req,"note_create");return json({note},inserted.meta.changes?201:200);
      }
      const n=await ownedNote(id,u.userId,true);
      if(action==="restore"&&method==="POST"){
        if(!n.deletedAt)return json({note:n});
        const b=await body(req),version=new Date(Math.max(Date.now(),Date.parse(n.updatedAt)+1)).toISOString();
        const restored=await db().prepare("UPDATE notes SET deletedAt=NULL,updatedAt=? WHERE id=? AND ownerId=? AND deletedAt IS NOT NULL AND purgePending=0 AND updatedAt=? RETURNING *").bind(version,id,u.userId,b.expectedUpdatedAt??n.updatedAt).first<Record<string,any>>();
        if(!restored)throw new HttpError(409,"This note changed or permanent deletion has started. Refresh Trash before continuing.");
        return json({note:decodeNote(restored)});
      }
      if(action==="purge"&&method==="DELETE"){
        if(!n.deletedAt)throw new HttpError(409,"Move this note to Trash before permanently deleting it.");
        // Claim deletion before touching R2. Restore cannot race with cleanup.
        const input=req.body?await body(req):{};
        const claimed=await db().prepare("UPDATE notes SET purgePending=1 WHERE id=? AND ownerId=? AND deletedAt IS NOT NULL AND updatedAt=? RETURNING id").bind(id,u.userId,input.expectedUpdatedAt??n.updatedAt).first();
        if(!claimed)throw new HttpError(409,"This note changed. Refresh Trash before deleting it.");
        const files=(await db().prepare("SELECT storageKey FROM attachments WHERE noteId=?").bind(id).all<{storageKey:string}>()).results;
        for(const file of files)await bucket().delete(file.storageKey);
        await db().prepare("DELETE FROM notes WHERE id=? AND ownerId=? AND purgePending=1").bind(id,u.userId).run();return json({ok:true});
      }
      if((!action&&method==="DELETE")||(action==="trash"&&method==="POST")){
        if(n.deletedAt)return json({ok:true});
        const b=action==="trash"?await body(req):{},version=new Date(Math.max(Date.now(),Date.parse(n.updatedAt)+1)).toISOString();
        const changed=await db().prepare("UPDATE notes SET deletedAt=?,shareToken=NULL,updatedAt=? WHERE id=? AND ownerId=? AND deletedAt IS NULL AND updatedAt=?").bind(now(),version,id,u.userId,b.expectedUpdatedAt??n.updatedAt).run();
        if(!changed.meta.changes)throw new HttpError(409,"This note changed in another tab. Reload it before moving it to Trash.");
        return json({ok:true});
      }
      if(n.deletedAt)throw new HttpError(404,"Note is in Trash. Restore it before editing or downloading attachments.");
      if(action&&!["share","attachments"].includes(action))throw new HttpError(404,"Endpoint not found.");
      if(action==="share"&&method==="POST") {
        const b=await body(req);const token=b.enabled===false?null:n.shareToken||uid().replaceAll("-","");
        const shared=await db().prepare("UPDATE notes SET shareToken=? WHERE id=? AND ownerId=? AND deletedAt IS NULL").bind(token,id,u.userId).run();if(!shared.meta.changes)throw new HttpError(409,"This note moved to Trash. Refresh your notes.");
        if(token)await track(req,"share");return json({shareToken:token});
      }
      if(action==="attachments"&&method==="POST") {
        if(Number(req.headers.get("content-length")||0)>6*1024*1024)throw new HttpError(413,"Choose a file smaller than 5 MB.");
        const contentType=req.headers.get("content-type")||"";
        if(!contentType.toLowerCase().startsWith("multipart/form-data"))throw new HttpError(400,"Please upload a file using the file picker.");
        let form:FormData;try{form=await new Response(await readBytes(req,6*1024*1024),{headers:{"Content-Type":contentType}}).formData();}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,"Invalid file upload.");}const file=form.get("file");
        if(!(file instanceof File)||file.size>5*1024*1024||file.size===0)throw new HttpError(400,"Choose a non-empty file up to 5 MB.");
        const ext=file.name.split(".").pop()?.toLowerCase()||"";
        const allowed:Record<string,string>={txt:"text/plain",md:"text/markdown",pdf:"application/pdf",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",csv:"text/csv"};
        if(!allowed[ext])throw new HttpError(400,"Supported files: PDF, TXT, MD, CSV, PNG, JPG and WebP.");
        const count=await db().prepare("SELECT COUNT(*) as n FROM attachments WHERE noteId=?").bind(id).first<{n:number}>();
        if((count?.n||0)>=10)throw new HttpError(400,"Up to 10 attachments per note.");
        const fileId=uid(),key=`notes/${u.userId}/${fileId}`;
        await bucket().put(key,await file.arrayBuffer(),{httpMetadata:{contentType:allowed[ext]}});
        try{const inserted=await db().prepare("INSERT INTO attachments (id,noteId,ownerId,filename,storageKey,mime,size,createdAt) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM notes WHERE id=? AND ownerId=? AND deletedAt IS NULL)").bind(fileId,id,u.userId,text(file.name,180),key,allowed[ext],file.size,now(),id,u.userId).run();if(!inserted.meta.changes)throw new HttpError(409,"This note moved to Trash. Restore it before attaching files.");}catch(e){await bucket().delete(key);throw e;}
        await track(req,"upload");return json({ok:true},201);
      }
      if(method==="GET")return json({note:n,attachments:(await db().prepare("SELECT id,filename,mime,size FROM attachments WHERE noteId=?").bind(id).all()).results});
      if(method==="PATCH") {
        const b=await body(req);
        const org=await organization(b,u.userId,n);
        if(b.expectedUpdatedAt!==undefined&&typeof b.expectedUpdatedAt!=="string")throw new HttpError(400,"Invalid note version.");
        const title=text(b.title,120,n.title)||"Untitled note",content=b.content===undefined?n.content:typeof b.content==="string"?b.content.slice(0,100000):"";
        const category=oneOf(b.category,CATEGORIES,n.category),color=oneOf(b.color,COLORS,n.color),starred=b.starred===undefined?n.starred:b.starred?1:0;
        // Retries of an already-applied save are harmless and don't inflate research.
        if(title===n.title&&content===n.content&&category===n.category&&color===n.color&&starred===n.starred&&org.folderId===n.folderId&&org.tags===JSON.stringify(n.tags))return json({note:n});
        const version=new Date(Math.max(Date.now(),Date.parse(n.updatedAt)+1)).toISOString();
        const updated=await db().prepare("UPDATE notes SET title=?,content=?,category=?,color=?,starred=?,folderId=?,tags=?,updatedAt=? WHERE id=? AND ownerId=? AND updatedAt=? AND deletedAt IS NULL RETURNING *").bind(title,content,category,color,starred,org.folderId,org.tags,version,id,u.userId,b.expectedUpdatedAt??n.updatedAt).first<Record<string,any>>();
        if(!updated)throw new HttpError(409,"This note changed in another tab. Download your draft, then reload the saved version before editing.");
        await track(req,"note_edit");return json({note:decodeNote(updated)});
      }

    }
    if(resource==="files"&&id) {
      const f=await db().prepare("SELECT a.*,n.shareToken,n.deletedAt FROM attachments a JOIN notes n ON n.id=a.noteId WHERE a.id=?").bind(id).first<Record<string,any>>();
      if(!f||f.deletedAt)throw new HttpError(404,"Attachment not found.");
      const u=await currentUser();const token=new URL(req.url).searchParams.get("share");
      const allowed=u?.userId===f.ownerId || (!!token && f.shareToken===token);
      if(method==="GET") {
        if(!allowed)throw new HttpError(404,"Attachment not found.");const object=await bucket().get(f.storageKey);if(!object)throw new HttpError(404,"Attachment not found.");
        const filename=String(f.filename).replace(/[\r\n"\\]/g,"_");
        return new Response(object.body,{headers:{"Content-Type":f.mime,"Content-Disposition":`attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(filename)}`,"X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store"}});
      }
      if(method==="DELETE") {if(u?.userId!==f.ownerId)throw new HttpError(403,"Only the note owner can delete an attachment.");await bucket().delete(f.storageKey);await db().prepare("DELETE FROM attachments WHERE id=?").bind(id).run();return json({ok:true});}
    }
    if(resource==="shared"&&id&&method==="GET") {
      const note=await db().prepare("SELECT id,title,content,category,color,updatedAt FROM notes WHERE shareToken=? AND deletedAt IS NULL").bind(id).first();if(!note)throw new HttpError(404,"This note is unavailable or its link was revoked.");
      const attachments=(await db().prepare("SELECT id,filename,mime,size FROM attachments WHERE noteId=?").bind((note as {id:string}).id).all()).results;return json({note,attachments});
    }
    if(resource==="research") {
      if(!id&&method==="GET") {const p=await participant(req);return json({consented:!!p,profile:p?{ageBand:p.ageBand,gender:p.gender,country:p.country,education:p.education,purpose:p.purpose,surveyed:p.surveyed}:null});}
      if(!id&&method==="POST") {
        const b=await body(req);if(b.consent!==true||b.adult!==true)throw new HttpError(400,"Research participation is optional and currently limited to adults 18+.");
        await cleanup();const previous=await participant(req);const pId=previous?String(previous.id):uid();const survey=b.survey===true;
        const cfCountry=text((req as Request&{cf?:{country?:string}}).cf?.country||req.headers.get("cf-ipcountry"),2,"Unknown");
        const geo=/^[A-Z]{2}$/.test(cfCountry)&&!["XX","T1"].includes(cfCountry)?cfCountry:"Unknown";
        const age=survey?oneOf(b.ageBand,["18–24","25–34","35–44","45–54","55–64","65+","Prefer not to say"]):"Unknown";
        const gender=survey?oneOf(b.gender,["Woman","Man","Non-binary","Self-described / another identity","Prefer not to say"]):"Unknown";
        const country=survey?(/^[A-Z]{2}$/.test(b.country||"")?b.country:oneOf(b.country,["Prefer not to say"])):"Unknown";
        const education=survey?oneOf(b.education,["School","Undergraduate","Postgraduate","Working professional","Other","Prefer not to say"]):"Unknown";
        const purpose=survey?oneOf(b.purpose,["Study","Work","Personal projects","Research","Other","Prefer not to say"]):"Unknown";
        const device=oneOf(b.device,["Mobile","Tablet","Desktop"],"Unknown"),language=/^[a-z]{2,3}$/.test(b.language||"")?b.language:"Unknown";
        if(previous)await db().prepare("UPDATE participants SET ageBand=?,gender=?,country=?,education=?,purpose=?,surveyed=?,lastSeen=? WHERE id=?").bind(age,gender,country,education,purpose,survey?1:0,now(),pId).run();
        else await db().prepare("INSERT INTO participants (id,consentVersion,ageBand,gender,country,geoCountry,education,purpose,device,language,surveyed,createdAt,lastSeen) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(pId,"2026-10-28",age,gender,country,geo,education,purpose,device,language,survey?1:0,now(),now()).run();
        return json({ok:true},200,{"Set-Cookie":researchCookie(req,pId)});
      }
      if(!id&&method==="DELETE") {const pId=consentId(req);if(pId)await db().prepare("DELETE FROM participants WHERE id=?").bind(pId).run();return json({ok:true},200,{"Set-Cookie":researchCookie(req,"",true)});}
      if(id==="event"&&method==="POST") {const b=await body(req);const kind=oneOf(b.kind,["page_view","note_view","time_spent"],"");if(!kind)throw new HttpError(400,"Unknown event.");await track(req,kind,kind==="time_spent"?Math.min(30,Math.max(0,Math.floor(Number(b.seconds)||0))):0);return json({ok:true});}
      if(id==="analytics"&&method==="GET") {await admin();return json(await analytics());}
      if(id==="export"&&method==="GET") {await admin();await cleanup();const rows=await activity();const csv=["research_id,"+FEATURES.join(","),...rows.map(r=>[r.research_id,...FEATURES.map(f=>r[f])].join(","))].join("\n");return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=noteatlas-activity.csv","Cache-Control":"no-store"}});}
      if(id==="model"&&method==="POST") {await admin();const b=await body(req);let model;try{model=validateModel(b);}catch(e){throw new HttpError(400,(e as Error).message);}await db().prepare("INSERT INTO settings (key,value) VALUES ('ml_model',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(model)).run();return json({ok:true});}
      if(id==="model"&&method==="DELETE") {await admin();await db().prepare("DELETE FROM settings WHERE key='ml_model'").run();return json({ok:true});}
    }
    throw new HttpError(404,"Endpoint not found.");
  }catch(e){if(e instanceof FileStorageFullError)return json({error:e.message},507);if(e instanceof HttpError)return json({error:e.message},e.status);console.error("API request failed",e instanceof Error?e.message:"Unknown error");return json({error:"Something went wrong. Please try again."},500);}
}
export const GET=handle;export const POST=handle;export const PATCH=handle;export const DELETE=handle;
