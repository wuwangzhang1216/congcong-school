import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createAssetServer} from './harmony-assets-server.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
async function fixture(t){
 const dir=await mkdtemp(path.join(os.tmpdir(),'harmony-server-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const zip=Buffer.from('zip fixture'),inv=Buffer.from('{}\n');
 await writeFile(path.join(dir,'audio.zip'),zip);await writeFile(path.join(dir,'audio.zip.files.jsonl'),inv);
 const plan={schema:1,packages:[{name:'audio.zip',bytes:zip.length,sha256:sha(zip),inventory:{name:'audio.zip.files.jsonl',bytes:inv.length,sha256:sha(inv)}}]};
 await writeFile(path.join(dir,'manifest.json'),JSON.stringify(plan));return {dir,plan,zip};
}
test('LAN server serves only verified allowlisted assets, with HEAD and method restrictions',async t=>{
 const {dir,zip}=await fixture(t),server=await createAssetServer(dir);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 const get=await fetch(base+'/audio.zip');assert.equal(get.status,200);assert.deepEqual(Buffer.from(await get.arrayBuffer()),zip);assert.equal(get.headers.get('content-type'),'application/zip');
 const head=await fetch(base+'/audio.zip',{method:'HEAD'});assert.equal((await head.arrayBuffer()).byteLength,0);assert.equal(head.headers.get('content-length'),String(zip.length));
 assert.equal((await fetch(base+'/private.json')).status,404);assert.equal((await fetch(base+'/%2e%2e%2fprivate.json')).status,400);assert.equal((await fetch(base+'/audio.zip',{method:'POST'})).status,405);
});
test('server refuses corrupt archives and symlinked assets at startup',async t=>{
 const {dir}=await fixture(t);await writeFile(path.join(dir,'audio.zip'),'bad');await assert.rejects(createAssetServer(dir),/mismatch/);
 await rm(path.join(dir,'audio.zip'));await symlink(path.join(dir,'manifest.json'),path.join(dir,'audio.zip'));await assert.rejects(createAssetServer(dir),/regular asset/);
});
