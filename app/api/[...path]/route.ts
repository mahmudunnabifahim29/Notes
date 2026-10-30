import { getChatGPTUser } from "@/app/chatgpt-auth";
import { EXAMPLES } from "@/lib/examples";
import { validateModel, FEATURES } from "@/lib/research-model";
import { db,bucket,uid,now,HttpError,json,user,admin,sameOrigin,body,readBytes,text,oneOf,consentId,researchCookie,cleanup,participant,track,ownedNote,activity,analytics } from "@/lib/server";
export const dynamic = "force-dynamic";
const CATEGORIES=["Personal","Learning","Projects","Research"],COLORS=["cream","yellow","lavender","rose","mint","blue"];
type Context={params:Promise<{path:string[]}>};
async function handle(req:Request,context:Context):Promise<Response> {
  try {
    const {path}=await context.params; const [resource,id,action]=path; const method=req.method;
    if(method!=="GET")sameOrigin(req);
    if(resource==="session"&&method==="GET") {
      const u=await getChatGPTUser();
      // New Sites are owner-private. The first signed-in owner initializes research ownership.
      if(u)await db().prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('research_owner',?)").bind(u.userId).run();
      const owner=await db().prepare("SELECT value FROM settings WHERE key='research_owner'").first<{value:string}>();
      return json({user:u?{name:u.fullName||u.displayName,email:u.email}:null,isAdmin:!!u&&owner?.value===u.userId});
    }
    if(resource==="notes") {
      const u=await user();
      if(!id&&method==="GET")return json({notes:(await db().prepare("SELECT n.*, (SELECT COUNT(*) FROM attachments a WHERE a.noteId=n.id) as attachmentCount FROM notes n WHERE ownerId=? ORDER BY updatedAt DESC").bind(u.userId).all()).results});
      if(id==="starter"&&method==="POST") {
        const existing=await db().prepare("SELECT COUNT(*) as n FROM notes WHERE ownerId=?").bind(u.userId).first<{n:number}>();
        if((existing?.n||0)>0)throw new HttpError(409,"Example notes can be added to an empty workspace.");
        await db().batch(EXAMPLES.map(n=>db().prepare("INSERT INTO notes (id,ownerId,title,content,category,color,starred,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)").bind(uid(),u.userId,n.title,n.content,n.category,n.color,n.starred,now(),now())));
        return json({ok:true});
      }
      if(!id&&method==="POST") {
        const b=await body(req);const noteId=uid();const count=await db().prepare("SELECT COUNT(*) as n FROM notes WHERE ownerId=?").bind(u.userId).first<{n:number}>();
        if((count?.n||0)>=500)throw new HttpError(400,"This starter supports up to 500 notes per account.");
        await db().prepare("INSERT INTO notes (id,ownerId,title,content,category,color,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)").bind(noteId,u.userId,text(b.title,120)||"Untitled note",text(b.content,100000),oneOf(b.category,CATEGORIES,"Personal"),oneOf(b.color,COLORS,"cream"),now(),now()).run();
        await track(req,"note_create");return json({note:await ownedNote(noteId,u.userId)},201);
      }
      const n=await ownedNote(id,u.userId);
      if(action==="share"&&method==="POST") {
        const b=await body(req);const token=b.enabled===false?null:n.shareToken||uid().replaceAll("-","");
        await db().prepare("UPDATE notes SET shareToken=? WHERE id=? AND ownerId=?").bind(token,id,u.userId).run();
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
        try{await db().prepare("INSERT INTO attachments (id,noteId,ownerId,filename,storageKey,mime,size,createdAt) VALUES (?,?,?,?,?,?,?,?)").bind(fileId,id,u.userId,text(file.name,180),key,allowed[ext],file.size,now()).run();}catch(e){await bucket().delete(key);throw e;}
        await track(req,"upload");return json({ok:true},201);
      }
      if(method==="GET")return json({note:n,attachments:(await db().prepare("SELECT id,filename,mime,size FROM attachments WHERE noteId=?").bind(id).all()).results});
      if(method==="PATCH") {
        const b=await body(req);
        await db().prepare("UPDATE notes SET title=?,content=?,category=?,color=?,starred=?,updatedAt=? WHERE id=? AND ownerId=?").bind(text(b.title,120,n.title)||"Untitled note",b.content===undefined?n.content:text(b.content,100000),oneOf(b.category,CATEGORIES,n.category),oneOf(b.color,COLORS,n.color),b.starred===undefined?n.starred:b.starred?1:0,now(),id,u.userId).run();
        await track(req,"note_edit");return json({note:await ownedNote(id,u.userId)});
      }
      if(method==="DELETE") {
        const files=(await db().prepare("SELECT storageKey FROM attachments WHERE noteId=?").bind(id).all<{storageKey:string}>()).results;
        for(const f of files)await bucket().delete(f.storageKey);
        await db().prepare("DELETE FROM notes WHERE id=? AND ownerId=?").bind(id,u.userId).run();return json({ok:true});
      }
    }
    if(resource==="files"&&id) {
      const f=await db().prepare("SELECT a.*,n.shareToken FROM attachments a JOIN notes n ON n.id=a.noteId WHERE a.id=?").bind(id).first<Record<string,any>>();
      if(!f)throw new HttpError(404,"Attachment not found.");
      const u=await getChatGPTUser();const token=new URL(req.url).searchParams.get("share");
      const allowed=u?.userId===f.ownerId || (!!token && f.shareToken===token);
      if(method==="GET") {
        if(!allowed)throw new HttpError(404,"Attachment not found.");const object=await bucket().get(f.storageKey);if(!object)throw new HttpError(404,"Attachment not found.");
        const filename=String(f.filename).replace(/[\r\n"\\]/g,"_");
        return new Response(object.body,{headers:{"Content-Type":f.mime,"Content-Disposition":`attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(filename)}`,"X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store"}});
      }
      if(method==="DELETE") {if(u?.userId!==f.ownerId)throw new HttpError(403,"Only the note owner can delete an attachment.");await bucket().delete(f.storageKey);await db().prepare("DELETE FROM attachments WHERE id=?").bind(id).run();return json({ok:true});}
    }
    if(resource==="shared"&&id&&method==="GET") {
      const note=await db().prepare("SELECT id,title,content,category,color,updatedAt FROM notes WHERE shareToken=?").bind(id).first();if(!note)throw new HttpError(404,"This note is unavailable or its link was revoked.");
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
  }catch(e){if(e instanceof HttpError)return json({error:e.message},e.status);console.error("API request failed",e instanceof Error?e.message:"Unknown error");return json({error:"Something went wrong. Please try again."},500);}
}
export const GET=handle;export const POST=handle;export const PATCH=handle;export const DELETE=handle;
