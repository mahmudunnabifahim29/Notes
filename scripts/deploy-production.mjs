import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readProductionConfig} from './production-config.mjs';

readProductionConfig(); // Fail before any build, migration or upload if incomplete.
const root=fileURLToPath(new URL('../',import.meta.url));
function run(args){const r=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,NOTEATLAS_DEPLOY:'1'},stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1);}
run(['scripts/run-framework.mjs','build']);
const wrangler=['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js'];
// Uses only the explicit independent production bindings, never the local store.
run([...wrangler,'d1','migrations','apply','DB','--remote','--config','dist/server/wrangler.json']);
run([...wrangler,'deploy','--config','dist/server/wrangler.json']);
