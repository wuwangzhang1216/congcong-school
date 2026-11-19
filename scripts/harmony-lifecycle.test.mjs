import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const compiled=ts.transpileModule(readFileSync(new URL('../apps/harmony/entry/src/main/ets/services/AssetInstaller.ets',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({postFails=false}={}){
 const tasks=[],exports={};
 class Worker{terminated=0;constructor(){tasks.push(this);}postMessage(input){if(postFails)throw Error('cannot serialize');this.input=input;}terminate(){this.terminated++;this.onexit?.();}}
 vm.runInNewContext(compiled,{exports,require(name){
  if(name==='@kit.ArkTS')return {worker:{ThreadWorker:Worker}};
  if(name==='@kit.CoreFileKit')return {fileIo:{readTextSync:()=> 'hash',accessSync:()=>true}};
  if(name.includes('AssetConfig'))return {loadPreparedAssets:async()=>({assetTag:'v182',manifestSha256:'hash',assetBaseUrl:'',allowInsecureHttp:false})};return {};
 }});
 return {installer:new exports.AssetInstaller(),tasks};
}
test('thread completion terminates once and ignores stale exit and duplicate messages',async()=>{
 const {installer,tasks}=fixture();await installer.prepare({});const p=installer.install({},()=>{});tasks[0].onmessage({data:{type:'complete'}});await p;
 tasks[0].onmessage({data:{type:'complete'}});assert.equal(tasks[0].terminated,1);assert(await installer.isInstalled({filesDir:'/files'}));
});
test('cancel, worker errors, early exit and serialization failure reject and release threads',async()=>{
 for(const mode of ['cancel','error','exit','post']){
  const {installer,tasks}=fixture({postFails:mode==='post'});await installer.prepare({});const p=installer.install({},()=>{});
  if(mode==='cancel')installer.cancel();if(mode==='error')tasks[0].onerror({message:'worker failed'});if(mode==='exit')tasks[0].onexit();
  await assert.rejects(p);assert.equal(tasks[0].terminated,1);
 }
});
test('concurrent installs are rejected and callbacks after cancellation are ignored',async()=>{
 const {installer,tasks}=fixture();await installer.prepare({});let progress=0;const p=installer.install({},()=>progress++);
 await assert.rejects(installer.install({},()=>{}),/正在进行/);installer.cancel();await assert.rejects(p);
 tasks[0].onmessage({data:{type:'progress',fraction:1}});assert.equal(progress,0);
 const q=installer.install({},()=>{});tasks[1].onmessage({data:{type:'complete'}});await q;assert.equal(tasks.length,2);
});
