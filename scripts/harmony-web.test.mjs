import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../apps/harmony/entry/src/main/ets/security/AudioPermissionGate.ts',import.meta.url),'utf8');
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:module.exports});
const {AudioPermissionGate}=module.exports;
const origin='https://cstf.invalid';
function request(url=origin,resources=['TYPE_AUDIO_CAPTURE']){
 const calls=[];return {calls,getOrigin:()=>url,getAccessibleResource:()=>resources,grant:r=>calls.push(['grant',...r]),deny:()=>calls.push(['deny'])};
}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}

test('only the exact classroom origin and audio requests reach the system permission dialog',async()=>{
 for(const url of ['http://cstf.invalid','https://cstf.invalid.evil','https://evil.invalid','null']){
  const r=request(url);await new AudioPermissionGate().request(r,origin,()=>assert.fail('must not ask system permission'));
  assert.deepEqual(r.calls,[['deny']]);
 }
 const r=request(origin,['TYPE_VIDEO_CAPTURE']);await new AudioPermissionGate().request(r,origin,()=>assert.fail());assert.deepEqual(r.calls,[['deny']]);
});
test('mixed resource requests grant only microphone, never camera',async()=>{
 const r=request(origin,['TYPE_AUDIO_CAPTURE','TYPE_VIDEO_CAPTURE']);await new AudioPermissionGate().request(r,origin,async()=>true);
 assert.deepEqual(r.calls,[['grant','TYPE_AUDIO_CAPTURE']]);
});
test('system denial and failure both deny the web request',async()=>{
 for(const fail of [false,true]){const r=request();await new AudioPermissionGate().request(r,origin,async()=>{if(fail)throw Error('permission service failed');return false;});assert.deepEqual(r.calls,[['deny']]);}
});
test('navigation cancels a pending request and a late OS grant cannot authorize it',async()=>{
 const gate=new AudioPermissionGate(),r=request(),d=deferred();const p=gate.request(r,origin,()=>d.promise);gate.cancel();d.resolve(true);await p;
 assert.deepEqual(r.calls,[['deny']]);
});
test('concurrent requests are denied and stale completion cannot clear a newer request',async()=>{
 const gate=new AudioPermissionGate(),old=request(),d=deferred();const p=gate.request(old,origin,()=>d.promise);
 const concurrent=request();await gate.request(concurrent,origin,()=>assert.fail());assert.deepEqual(concurrent.calls,[['deny']]);
 gate.cancel();const next=request(),e=deferred();const q=gate.request(next,origin,()=>e.promise);d.resolve(true);await p;
 const third=request();await gate.request(third,origin,()=>assert.fail());assert.deepEqual(third.calls,[['deny']]);
 e.resolve(true);await q;assert.deepEqual(old.calls,[['deny']]);assert.deepEqual(next.calls,[['grant','TYPE_AUDIO_CAPTURE']]);
});

test('application background invalidates pending audio grants',async()=>{
 const gate=new AudioPermissionGate(),r=request(),d=deferred();const pending=gate.request(r,origin,()=>d.promise);
 module.exports.cancelPendingAudioRequests();d.resolve(true);await pending;assert.deepEqual(r.calls,[['deny']]);
});
test('expired native requests cannot throw through page teardown',async()=>{
 const gate=new AudioPermissionGate(),r=request(),d=deferred();r.deny=()=>{throw Error('native request destroyed');};
 const pending=gate.request(r,origin,()=>d.promise);assert.doesNotThrow(()=>gate.cancel());d.resolve(true);await pending;assert.deepEqual(r.calls,[]);
});
