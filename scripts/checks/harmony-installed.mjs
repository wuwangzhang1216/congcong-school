// Run the actual install worker against a real verified site, mapping installed
// reads to that snapshot and isolating all receipts/staging in a temporary dir.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
const [siteArg,rawArg,reportArg]=process.argv.slice(2);
if(!siteArg||!rawArg||!reportArg)throw Error('Usage: harmony-installed.mjs <verified-site> <prepared-raw-site> <report>');
const site=path.resolve(siteArg),raw=path.resolve(rawArg),plan=JSON.parse(fs.readFileSync(path.join(raw,'harmony-manifest.json')));
const metadata=JSON.parse(fs.readFileSync(path.join(raw,'harmony-build.json'))),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'harmony-installed-'));
const installed=path.join(temporary,'cstf/assets',metadata.assetTag);
const reads=new Set();const descriptors=new Set();let downloadAttempts=0;
const source=fs.readFileSync(new URL('../../apps/harmony/entry/src/main/ets/workers/assetWorker.ts',import.meta.url),'utf8');
function mapped(p){if(p===installed)return site;if(p.startsWith(installed+'/'))return path.join(site,p.slice(installed.length+1));return p;}
const fileIo={OpenMode:{CREATE:1,TRUNC:2,WRITE_ONLY:4,READ_ONLY:8},
 accessSync:p=>fs.existsSync(mapped(p)),statSync:p=>fs.statSync(mapped(p)),
 mkdirSync(p){if(p===installed)return;assert(!p.startsWith(installed+'/'));fs.mkdirSync(p,{recursive:true});},
 openSync(p,mode){if(p.startsWith(installed+'/'))assert.equal(mode,8,'verified snapshot must stay read-only');const fd=fs.openSync(mapped(p),mode===8?'r':'w');descriptors.add(fd);if(p.startsWith(installed+'/'))reads.add(p);return {fd};},
 closeSync(fd){descriptors.delete(fd);fs.closeSync(fd);},
 readSync:(fd,buffer,options)=>fs.readSync(fd,new Uint8Array(buffer),0,options.length,options.offset),
 writeSync:(fd,buffer)=>fs.writeSync(fd,Buffer.from(buffer)),
 unlinkSync(p){assert(!p.startsWith(installed));fs.unlinkSync(p);},
 renameSync(a,b){assert(!a.startsWith(installed)&&!b.startsWith(installed));fs.renameSync(a,b);},
};
const sandbox={exports:{},require(name){
 if(name==='@kit.CoreFileKit')return {fileIo};
 if(name==='@kit.ArkTS')return {buffer:Buffer,worker:{workerPort:{postMessage(){}}}};
 if(name==='@kit.CryptoArchitectureKit')return {cryptoFramework:{createMd(){const h=createHash('sha256');return {updateSync:({data})=>h.update(data),digestSync:()=>({data:new Uint8Array(h.digest())}),update:async({data})=>h.update(data),digest:async()=>({data:new Uint8Array(h.digest())})};}}};
 return {};
}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
sandbox.downloadArchive=async()=>{downloadAttempts++;throw Error('Existing matching resources must never download');};
sandbox.extractArchive=async()=>{throw Error('Existing matching resources must never extract');};
try{
 await sandbox.installAssets({context:{filesDir:temporary,resourceManager:{getRawFileContent:async name=>fs.readFileSync(path.join(raw,name.replace('site/','')))}},assetTag:metadata.assetTag,manifestSha256:metadata.manifestSha256,assetBaseUrl:metadata.assetBaseUrl,allowInsecureHttp:metadata.allowInsecureHttp});
 assert.equal(reads.size,plan.packages.reduce((n,p)=>n+p.files,0));assert.equal(descriptors.size,0);
 assert.equal(fs.readFileSync(path.join(temporary,'cstf/.installed',metadata.assetTag,'complete'),'utf8'),metadata.manifestSha256);
 const report={status:'passed',assetTag:metadata.assetTag,packages:plan.packages.length,actualInstalledFilesSHA256:reads.size,downloadAttempts,hostAdapterOnly:true,nativeSDKVerified:false};
 fs.writeFileSync(reportArg,JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{for(const fd of descriptors)fs.closeSync(fd);fs.rmSync(temporary,{recursive:true,force:true});}
