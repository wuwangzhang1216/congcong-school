import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const source = readFileSync(new URL('../apps/harmony/entry/src/main/ets/workers/assetWorker.ts',import.meta.url),'utf8');
const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){
 const content=new Map(),raw=new Map(),downloads=[],extracted=[],messages=[],fds=new Map();let descriptor=1;
 const members=new Map(),packages=[];
 for(const [kind,directory,path,value] of [['audio-web','.','audio/aa/a.mp3','audio'],['data','data','index.json','{}'],['story-images','story-images','a.png','image'],['textbook-pages','textbook-pages','a.jpg','page']]){
  const name=kind+'.zip',bytes=Buffer.from(value),archive=Buffer.from('zip '+name);
  const inventory=Buffer.from(JSON.stringify({path,bytes:bytes.length,sha256:sha(bytes)})+'\n');raw.set(name+'.files.jsonl',inventory);
  const item={name,kind,directory,bytes:archive.length,sha256:sha(archive),url:'https://github.com/wuwangzhang1216/congcong-school/releases/download/v1.8.0-web-resources/'+name,inventory:{name:name+'.files.jsonl',bytes:inventory.length,sha256:sha(inventory)},files:1,uncompressedBytes:bytes.length};
  packages.push(item);members.set(name,{path,bytes,archive});
 }
 const plan={schema:1,tag:'fixture-abc',shellSha256:'a'.repeat(64),packages};
 const context={filesDir:'/files',resourceManager:{getRawFileContent:async name=>raw.get(name.replace('site/',''))}};
 const input={context,assetTag:plan.tag,manifestSha256:'',assetBaseUrl:'',allowInsecureHttp:false};
 function updatePlan(){const text=Buffer.from(JSON.stringify(plan));raw.set('harmony-manifest.json',text);input.manifestSha256=sha(text);}
 updatePlan();
 const fs={OpenMode:{CREATE:1,TRUNC:2,WRITE_ONLY:4,READ_ONLY:8},
  accessSync:path=>content.has(path),mkdirSync(){},unlinkSync:path=>content.delete(path),
  statSync:path=>{if(!content.has(path))throw Error('ENOENT');return {size:content.get(path).length};},
  openSync(path,mode){if(mode!==8)content.set(path,Buffer.alloc(0));else if(!content.has(path))throw Error('ENOENT');const fd=descriptor++;fds.set(fd,{path,position:0});return {fd};},
  closeSync:fd=>fds.delete(fd),
  writeSync(fd,data){const f=fds.get(fd),chunk=Buffer.from(data).subarray(0,2);content.set(f.path,Buffer.concat([content.get(f.path),chunk]));return chunk.length;},
  readSync(fd,buffer,{offset,length}){const bytes=content.get(fds.get(fd).path).subarray(offset,offset+length);new Uint8Array(buffer).set(bytes);return bytes.length;},
  renameSync(a,b){content.set(b,content.get(a));content.delete(a);},
 };
 const sandbox={exports:{},require(name){
  if(name==='@kit.CoreFileKit')return {fileIo:fs};
  if(name==='@kit.ArkTS')return {buffer:Buffer,worker:{workerPort:{postMessage:m=>messages.push(m)}}};
  if(name==='@kit.CryptoArchitectureKit')return {cryptoFramework:{createMd(){const h=createHash('sha256');return {updateSync:({data})=>h.update(data),digestSync:()=>({data:new Uint8Array(h.digest())}),update:async({data})=>h.update(data),digest:async()=>({data:new Uint8Array(h.digest())})};}}};
  return {};
 }};
 vm.runInNewContext(compiled,sandbox);
 sandbox.downloadArchive=async(context,url,destination,name)=>{downloads.push(url);content.set(destination,members.get(name).archive);};
 sandbox.extractArchive=async(archive,target,name)=>{extracted.push(name);const m=members.get(name);content.set(target+'/'+m.path,m.bytes);};
 return {worker:sandbox,input,plan,updatePlan,raw,content,downloads,extracted,members,fds,fs};
}

test('fresh split ZIP install checks actual member hashes before atomic completion receipt',async()=>{
 const f=fixture();await f.worker.installAssets(f.input);
 assert.equal(f.downloads.length,4);assert.equal(f.extracted.length,4);assert(f.downloads.every(url=>url.includes('/v1.8.0-web-resources/')));
 assert.equal(f.content.get('/files/cstf/.installed/fixture-abc/complete').toString(),f.input.manifestSha256);assert.equal(f.fds.size,0);
});
test('retry reuses intact installed files, repairs missing files, never trusts marker existence alone',async()=>{
 const f=fixture();await f.worker.installAssets(f.input);f.downloads.length=0;f.extracted.length=0;
 await f.worker.installAssets(f.input);assert.equal(f.downloads.length,0);
 f.content.delete('/files/cstf/assets/fixture-abc/audio/aa/a.mp3');await f.worker.installAssets(f.input);
 assert.equal(f.downloads.length,1);assert.equal(f.extracted[0],'audio-web.zip');
});
test('verified cached archives are reused after interrupted extraction',async()=>{
 const f=fixture();const extract=f.worker.extractArchive;f.worker.extractArchive=async()=>{throw Error('interrupted');};
 await assert.rejects(f.worker.installAssets(f.input),/interrupted/);assert(!f.content.has('/files/cstf/.installed/fixture-abc/complete'));
 f.worker.extractArchive=extract;f.downloads.length=0;await f.worker.installAssets(f.input);assert.equal(f.downloads.length,3);
});
test('wrong manifest, foreign URLs, missing kinds and path traversal fail before extraction',async()=>{
 for(const mutate of [f=>{f.input.manifestSha256='b'.repeat(64);},f=>{f.plan.packages[0].url='https://evil.invalid/audio-web.zip';f.updatePlan();},f=>{f.plan.packages.pop();f.updatePlan();},f=>{
  const a=f.plan.packages[0],text=Buffer.from(JSON.stringify({path:'../escape.mp3',bytes:5,sha256:'a'.repeat(64)})+'\n');f.raw.set(a.inventory.name,text);a.inventory.bytes=text.length;a.inventory.sha256=sha(text);f.updatePlan();
 }]){const f=fixture();mutate(f);await assert.rejects(f.worker.installAssets(f.input));assert.equal(f.extracted.length,0);}
});
test('corrupt download or corrupt extracted member cannot produce a success receipt',async()=>{
 for(const mode of ['download','extraction']){const f=fixture();
  if(mode==='download')f.worker.downloadArchive=async(ctx,url,path)=>f.content.set(path,Buffer.from('bad'));
  else f.worker.extractArchive=async(archive,target)=>f.content.set(target+'/audio/aa/a.mp3',Buffer.from('wrong'));
  await assert.rejects(f.worker.installAssets(f.input));assert(!f.content.has('/files/cstf/.installed/fixture-abc/complete'));
 }
});
test('public HTTP mirrors are rejected while explicit private LAN mirror routing is allowed',async()=>{
 const f=fixture();f.input.assetBaseUrl='http://192.168.1.20:8787';f.input.allowInsecureHttp=true;
 for(const a of f.plan.packages)a.url=f.input.assetBaseUrl+'/'+a.name;f.updatePlan();await f.worker.installAssets(f.input);
 const bad=fixture();bad.input.assetBaseUrl='http://public.example:8787';bad.input.allowInsecureHttp=true;
 for(const a of bad.plan.packages)a.url=bad.input.assetBaseUrl+'/'+a.name;bad.updatePlan();await assert.rejects(bad.worker.installAssets(bad.input));
});
