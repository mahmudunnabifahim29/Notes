import {Buffer} from 'node:buffer';

// Avoids an R2 subscription while preserving authenticated attachment/photo APIs.
// A 512 KiB chunk becomes ~683 KiB of base64, below D1's 2 MB row limit.
export class FileStorageFullError extends Error {}
const CHUNK_SIZE=512*1024;
export class D1FileStore {
 constructor(private database:D1Database){}
 async put(key:string,value:ArrayBuffer|Uint8Array,options?:{httpMetadata?:{contentType:string}}){
  const bytes=value instanceof Uint8Array?Buffer.from(value.buffer as ArrayBuffer,value.byteOffset,value.byteLength):Buffer.from(value);
  if(bytes.byteLength>5*1024*1024)throw new Error('Files must be 5 MB or smaller.');
  const statements=[
   this.database.prepare('DELETE FROM file_objects WHERE key=?').bind(key),
   this.database.prepare('INSERT INTO file_objects (key,size,mime,createdAt) VALUES (?,?,?,?)').bind(key,bytes.byteLength,options?.httpMetadata?.contentType??'application/octet-stream',new Date().toISOString()),
  ];
  for(let offset=0,ordinal=0;offset<bytes.byteLength;offset+=CHUNK_SIZE,ordinal++){
   statements.push(this.database.prepare('INSERT INTO file_chunks (objectKey,ordinal,data) VALUES (?,?,?)').bind(key,ordinal,bytes.subarray(offset,offset+CHUNK_SIZE).toString('base64')));
  }
  // Batch is transactional: quota failure preserves an existing object/version.
  try{await this.database.batch(statements);}catch(error){if(error instanceof Error&&error.message.includes('NoteAtlas file storage is full'))throw new FileStorageFullError('Shared file storage is full. Permanently delete unused files or pictures before uploading.');throw error;}
 }
 async get(key:string){
  const row=await this.database.prepare('SELECT size,mime FROM file_objects WHERE key=?').bind(key).first<{size:number;mime:string}>();
  if(!row)return null;
  const database=this.database;let ordinal=0,remaining=row.size;
  const body=new ReadableStream<Uint8Array>({
   async pull(controller){
    if(remaining===0){controller.close();return;}
    try{const chunk=await database.prepare('SELECT data FROM file_chunks WHERE objectKey=? AND ordinal=?').bind(key,ordinal++).first<{data:string}>();
     if(!chunk)throw new Error('Stored file chunk is unavailable.');
     const bytes=Buffer.from(chunk.data,'base64');if(!bytes.length||bytes.length>remaining)throw new Error('Stored file chunk is invalid.');
     remaining-=bytes.length;controller.enqueue(bytes);if(remaining===0)controller.close();
    }catch(error){controller.error(error);}
   },
  });
  return {body,httpMetadata:{contentType:row.mime}};
 }
 async delete(key:string){await this.database.prepare('DELETE FROM file_objects WHERE key=?').bind(key).run();}
}
