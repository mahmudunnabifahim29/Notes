import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// Deployment IDs may come from CI variables or an ignored local config. Production
// never falls back to the starter's placeholder DB or original Sites identity.
export function readProductionConfig() {
 let local={};
 try{local=JSON.parse(readFileSync(new URL('../.sites-runtime/cloudflare-production.json',import.meta.url),'utf8'));}
 catch(error){if(error.code!=='ENOENT')throw error;}
 const accountId=process.env.CLOUDFLARE_ACCOUNT_ID||local.accountId;
 const databaseId=process.env.NOTEATLAS_D1_DATABASE_ID||local.databaseId;
 const fileStorage=process.env.NOTEATLAS_FILE_STORAGE||local.fileStorage||"d1";
 if(!["d1","r2"].includes(fileStorage))throw new Error("Choose d1 or r2 file storage.");
 const bucketName=process.env.NOTEATLAS_R2_BUCKET||local.bucketName;
 const name=process.env.NOTEATLAS_WORKER_NAME||local.workerName||'noteatlas';
 if(!/^[a-f0-9]{32}$/i.test(accountId??''))throw new Error('Set CLOUDFLARE_ACCOUNT_ID or accountId in .sites-runtime/cloudflare-production.json.');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(databaseId??'')||databaseId==='00000000-0000-4000-8000-000000000000')throw new Error('Configure the real independent D1 database ID before deployment.');
 if(fileStorage==="r2"&&!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucketName??''))throw new Error('Configure NOTEATLAS_R2_BUCKET or bucketName for independent attachment storage.');
 if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name))throw new Error('Use a lowercase Worker name with letters, numbers and hyphens.');
 return {
  name,account_id:accountId,workers_dev:true,preview_urls:false,
  d1_databases:[{binding:'DB',database_name:'noteatlas-db',database_id:databaseId,migrations_dir:fileURLToPath(new URL('../drizzle',import.meta.url))}],
  vars:{FILE_STORAGE:fileStorage},
  r2_buckets:fileStorage==="d1"?[]:[{binding:'BUCKET',bucket_name:bucketName}],
 };
}
