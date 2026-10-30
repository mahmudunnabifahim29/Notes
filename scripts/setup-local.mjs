// Local development only. Builds the app and applies unapplied local D1 migrations.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=fileURLToPath(new URL("../",import.meta.url));
function run(args){
 const result=spawnSync(process.execPath,args,{cwd:root,stdio:"inherit"});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status??1);
}
run([path.join(root,"scripts/run-framework.mjs"),"build"]);
const configPath=path.join(root,"dist/server/wrangler.json");
const config=JSON.parse(readFileSync(configPath,"utf8"));
const database=config.d1_databases?.find(d=>d.binding==="DB");
if(!database)throw new Error("Build output did not declare the local DB binding.");
database.migrations_dir=path.join(root,"drizzle");
const localConfig=path.join(root,"dist/server/wrangler.local.json");
writeFileSync(localConfig,JSON.stringify(config,null,2)+"\n");
run(["--import",path.join(root,"scripts/sites-env.mjs"),path.join(root,"node_modules/wrangler/bin/wrangler.js"),
 "d1","migrations","apply","DB","--local","--config",localConfig,
 "--persist-to",path.join(root,".wrangler/state")]);
console.log("Local setup complete. Run pnpm dev, then open the localhost URL it prints.");
