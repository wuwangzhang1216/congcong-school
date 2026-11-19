import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source=readFileSync(new URL('../apps/web/src/app/layout.tsx',import.meta.url),'utf8');
const template=source.split('const bootScript = `')[1].split('`;')[0];
test('the real Web bootstrap preserves PWA registration online and disables it only for native offline origin',()=>{
 for(const [hostname,production,expected] of [['cstf.invalid',true,0],['classroom.example',true,1],['classroom.example',false,0]]){
  let registered=0;
  const code=template.replace('${LEARNER_BOOT_SCRIPT}','').replace('${process.env.NODE_ENV === "production"}',String(production));
  vm.runInNewContext(code,{learnerKey:k=>k,localStorage:{getItem:()=>null},window:{location:{hostname},matchMedia:()=>({matches:false}),addEventListener:(type,fn)=>fn()},navigator:{serviceWorker:{register:()=>{registered++;return Promise.resolve();}}}});
  assert.equal(registered,expected,hostname);
 }
});
