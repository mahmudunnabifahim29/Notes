import {db,bucket,uid,now,HttpError,json,user,body,readBytes} from "./server";
import {PROFILE_LIMITS,type PrivateProfile} from "./profile-fields";
function present(row:Record<string,unknown>):PrivateProfile {
 return {...Object.fromEntries(Object.keys(PROFILE_LIMITS).map(key=>[key,row[key]??""])),updatedAt:row.updatedAt,photoVersion:row.photoVersion??null} as PrivateProfile;
}
async function ownProfile(ownerId:string){
 await db().prepare("INSERT OR IGNORE INTO profiles (ownerId,updatedAt) VALUES (?,?)").bind(ownerId,now()).run();
 return (await db().prepare("SELECT * FROM profiles WHERE ownerId=?").bind(ownerId).first<Record<string,any>>())!;
}
function values(input:Record<string,unknown>,old:Record<string,unknown>){
 const result:Record<string,string>={};
 for(const key of Object.keys(input))if(key!=="expectedUpdatedAt"&&!Object.hasOwn(PROFILE_LIMITS,key))throw new HttpError(400,"Unknown profile field.");
 for(const [key,limit] of Object.entries(PROFILE_LIMITS)){
  const value=input[key]===undefined?old[key]??"":input[key];
  if(typeof value!=="string"||value.length>limit)throw new HttpError(400,`${key} must be text with at most ${limit} characters.`);
  result[key]=value.trim();
 }
 if(result.phone&&!/^[+\d\s().-]{3,40}$/.test(result.phone))throw new HttpError(400,"Use a phone number with country code, digits, spaces, or parentheses.");
 if(result.website){let url:URL;try{url=new URL(result.website);}catch{throw new HttpError(400,"Use a full https:// or http:// website address.");}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new HttpError(400,"Use a public http:// or https:// website address without credentials.");}
 return result;
}
function imageMime(data:Uint8Array){
 if(data.length>=8&&[137,80,78,71,13,10,26,10].every((b,i)=>data[i]===b))return "image/png";
 if(data.length>=3&&data[0]===255&&data[1]===216&&data[2]===255)return "image/jpeg";
 if(data.length>=12&&new TextDecoder().decode(data.slice(0,4))==="RIFF"&&new TextDecoder().decode(data.slice(8,12))==="WEBP")return "image/webp";
 throw new HttpError(400,"Choose a PNG, JPEG, or WebP image. SVG and other formats are not accepted.");
}
export async function handleProfile(req:Request,id?:string){
 const u=await user();
 if(id&&id!=="photo")throw new HttpError(404,"Endpoint not found.");
 const row=await ownProfile(u.userId);
 if(!id){
  if(req.method==="GET")return json({profile:present(row)});
  if(req.method==="PATCH"){
   const input=await body(req);const data=values(input,row);
   if(typeof input.expectedUpdatedAt!=="string")throw new HttpError(400,"Reload your profile before saving.");
   const version=new Date(Math.max(Date.now(),Date.parse(row.updatedAt)+1)).toISOString();
   const keys=Object.keys(PROFILE_LIMITS);
   const saved=await db().prepare(`UPDATE profiles SET ${keys.map(key=>`${key}=?`).join(',')},updatedAt=? WHERE ownerId=? AND updatedAt=? RETURNING *`).bind(...keys.map(key=>data[key]),version,u.userId,input.expectedUpdatedAt).first<Record<string,unknown>>();
   if(!saved)throw new HttpError(409,"Your profile changed in another tab. Reload this page before saving; copy any unsaved details first.");
   return json({profile:present(saved)});
  }
 } else {
  if(req.method==="GET"){
   if(!row.photoKey)throw new HttpError(404,"No profile picture.");
   const object=await bucket().get(row.photoKey);if(!object)throw new HttpError(404,"No profile picture.");
   return new Response(object.body,{headers:{"Content-Type":row.photoMime,"Content-Disposition":"inline","X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store"}});
  }
  if(req.method==="POST"){
   if(!req.headers.get('content-type')?.startsWith('multipart/form-data'))throw new HttpError(400,"Choose a picture using the file picker.");
   let form:FormData;try{form=await new Response(await readBytes(req,3*1024*1024),{headers:{'Content-Type':req.headers.get('content-type')!}}).formData();}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,"Invalid picture upload.");}
   const file=form.get('file');if(!(file instanceof File)||!file.size||file.size>2*1024*1024)throw new HttpError(400,"Choose a picture up to 2 MB.");
   const data=new Uint8Array(await file.arrayBuffer()),mime=imageMime(data),version=uid(),key=`profiles/${u.userId}/${version}`;
   await bucket().put(key,data,{httpMetadata:{contentType:mime}});
   try{
    // Remove the prior object before committing its replacement, so storage
    // failures leave a retriable reference instead of an untracked old picture.
    if(row.photoKey)await bucket().delete(row.photoKey);
    const updated=await db().prepare("UPDATE profiles SET photoKey=?,photoMime=?,photoVersion=? WHERE ownerId=? AND photoKey IS ?").bind(key,mime,version,u.userId,row.photoKey).run();
    if(!updated.meta.changes)throw new HttpError(409,"Your picture changed in another tab. Reload before uploading again.");
   }catch(e){await bucket().delete(key);throw e;}
   return json({photoVersion:version});
  }
  if(req.method==="DELETE"){
   if(row.photoKey)await bucket().delete(row.photoKey);
   const updated=await db().prepare("UPDATE profiles SET photoKey=NULL,photoMime=NULL,photoVersion=NULL WHERE ownerId=? AND photoKey IS ?").bind(u.userId,row.photoKey).run();
   if(!updated.meta.changes)throw new HttpError(409,"Your picture changed in another tab. Reload before removing it.");
   return json({photoVersion:null});
  }
 }
 throw new HttpError(404,"Endpoint not found.");
}
