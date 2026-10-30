// Exercise the real save queue without browser/network dependencies.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../lib/note-autosave.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {NoteAutosave}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const original={id:'saved-note',title:'Original',content:'Text',category:'Personal',color:'cream',starred:0,shareToken:null,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};}
function serverNote(request,index=1){const {expectedUpdatedAt,clientId,...fields}=request.payload;return {...original,...fields,id:clientId??original.id,updatedAt:`2026-01-01T00:00:0${index}.000Z`};}

test('debounces rapid edits and leaves untouched/anonymous-style previews unwritten',async()=>{
 const calls=[];const writer=async r=>{calls.push(r);return serverNote(r);};
 const untouched=new NoteAutosave({...original,id:'new',title:'',content:''},writer,()=>{},10);
 await wait(30);assert.equal(calls.length,0);untouched.dispose();
 const queue=new NoteAutosave(original,writer,()=>{},10);
 queue.update({content:'One'});queue.update({content:'Two'});queue.update({content:'Last'});
 await wait(50);assert.equal(calls.length,1);assert.equal(calls[0].payload.content,'Last');assert.equal(queue.state.dirty,false);queue.dispose();
});

test('one creation in flight, newer keystrokes follow with the returned version',async()=>{
 const calls=[],pending=deferred();
 const queue=new NoteAutosave({...original,id:'new',title:'',content:''},async r=>{calls.push(r);return calls.length===1?pending.promise:serverNote({...r,payload:{...r.payload,clientId:calls[0].payload.clientId}},2);},()=>{},100000);
 queue.update({content:'First'});const first=queue.save();
 queue.update({content:'Typed during request'});assert.equal(queue.save(),first);assert.equal(calls.length,1);
 pending.resolve(serverNote(calls[0]));assert.equal(await first,true);
 assert.equal(calls.length,2);assert.equal(calls[1].method,'PATCH');assert.equal(calls[1].payload.content,'Typed during request');assert.equal(calls[1].payload.expectedUpdatedAt,'2026-01-01T00:00:01.000Z');
 assert.equal(queue.state.draft.content,'Typed during request');assert.equal(queue.state.saving,false);queue.dispose();
});

test('lost create response reuses its identifier and reconciles text without duplicates',async()=>{
 const calls=[];let saved;
 const queue=new NoteAutosave({...original,id:'new',title:'',content:''},async r=>{
  calls.push(r);if(calls.length===1){saved=serverNote(r);throw new Error('Connection lost after server wrote');}
  if(r.method==='POST')return saved;
  return {...serverNote(r,2),id:saved.id};
 },()=>{},100000);
 queue.update({content:'Initial'});assert.equal(await queue.save(),false);assert.equal(queue.state.dirty,true);
 queue.update({content:'Newer draft'});assert.equal(await queue.save(),true);
 assert.equal(calls[0].payload.clientId,calls[1].payload.clientId);assert.equal(calls[2].method,'PATCH');assert.equal(calls[2].payload.content,'Newer draft');
 assert.equal(queue.state.draft.id,saved.id);assert.equal(queue.state.draft.content,'Newer draft');queue.dispose();
});

test('conflicts retain the draft and block writes until explicit reload',async()=>{
 let calls=0;const queue=new NoteAutosave(original,async r=>{calls++;throw Object.assign(new Error('Changed elsewhere'),{status:409});},()=>{},10);
 queue.update({content:'Keep my draft'});assert.equal(await queue.save(),false);
 assert.equal(queue.state.conflict,true);assert.equal(queue.state.draft.content,'Keep my draft');
 queue.update({content:'Still my draft'});await wait(30);await queue.save();assert.equal(calls,1);
 queue.replace({...original,content:'Latest from server',updatedAt:'2026-01-01T00:00:03.000Z'});
 assert.equal(queue.state.conflict,false);assert.equal(queue.state.dirty,false);queue.dispose();
});

test('failed saves pause automatic retries; manual retry preserves whitespace',async()=>{
 let calls=0;const queue=new NoteAutosave(original,async r=>{if(++calls===1)throw new Error('Offline');return serverNote(r);},()=>{},10);
 queue.update({content:'  indented\n\n'});assert.equal(await queue.save(),false);
 await wait(30);assert.equal(calls,1);assert.equal(queue.state.draft.content,'  indented\n\n');
 assert.equal(await queue.save(),true);assert.equal(queue.state.draft.content,'  indented\n\n');queue.dispose();
});

test('confirmation pause cancels pending autosave and resumes on keep writing',async()=>{
 let calls=0;const queue=new NoteAutosave(original,async r=>{calls++;return serverNote(r);},()=>{},10);
 queue.update({content:'Draft'});queue.pause();await wait(30);assert.equal(calls,0);
 queue.resume();await wait(30);assert.equal(calls,1);queue.dispose();
});

test('unmount cancels scheduled work and leaves in-flight newer edits unwritten',async()=>{
 let calls=0;const pending=deferred();const queue=new NoteAutosave(original,async()=>{calls++;return pending.promise;},()=>{},100000);
 queue.update({content:'Sent'});const saving=queue.save();queue.update({content:'Not sent'});queue.dispose();pending.resolve({...original,content:'Sent'});await saving;
 assert.equal(calls,1);assert.equal(queue.state.draft.content,'Not sent');
});


test('folder and tag changes are saved without sending stale sharing or star fields',async()=>{
 const requests=[];
 const queue=new NoteAutosave({...original,folderId:null,tags:[]},async r=>{requests.push(r);return serverNote(r);},()=>{},100000);
 queue.update({folderId:'folder-1',tags:['study']});await queue.save();
 assert.equal(requests[0].payload.folderId,'folder-1');assert.deepEqual(requests[0].payload.tags,['study']);
 assert.ok(!('starred' in requests[0].payload)&&!('shareToken' in requests[0].payload));
 assert.equal(queue.state.dirty,false);queue.dispose();
});
