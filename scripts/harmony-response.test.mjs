import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const text=readFileSync(new URL('../apps/harmony/entry/src/main/ets/web/OfflineWeb.ets',import.meta.url),'utf8').replace('@Component','').replace('export struct OfflineWeb','export class OfflineWeb');
const compiled=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({broken=false}={}){
 const closed=[],files=new Map([[1,Buffer.from('0123456789')],[100,Buffer.from('prefix!HTMLtrailer')]]);
 const fs={OpenMode:{READ_ONLY:1},openSync(path){assert.equal(path,'/private/cstf/assets/fixture/audio/a.mp3');return {fd:1};},statSync:()=>({size:10}),
  readSync(fd,target,{offset,length}){if(broken)return 0;const data=files.get(fd).subarray(offset,offset+length);new Uint8Array(target).set(data);return data.length;},closeSync:fd=>closed.push(fd)};
 class Response {
  headers={};setNetErrorCode(code){this.code=code;}setStatus(status){this.status=status;}setStatusText(text){this.text=text;}setMimeType(mime){this.mime=mime;}setEncoding(encoding){this.encoding=encoding;}setHeaderByName(k,v){this.headers[k]=v;}
 }
 const context={filesDir:'/private',resourceManager:{getRawFdSync(path){assert(['site/index.html','site/book/g1up/index.html','site/book/g1up/index.txt'].includes(path));return {fd:100,offset:7,length:4};},closeRawFdSync:path=>closed.push(path)}};
 const exports={};vm.runInNewContext(compiled,{exports,getContext:()=>context,require(name){
  if(name==='@kit.CoreFileKit')return {fileIo:fs};if(name==='@kit.ArkTS')return {buffer:Buffer};
  if(name==='@ohos.web.netErrorList')return {WebNetErrorList:{NET_OK:0,ERR_FAILED:-2}};
  if(name==='@kit.ArkWeb')return {webview:{WebSchemeHandlerResponse:Response,WebviewController:class{},WebSchemeHandler:class{}}};
  if(name.includes('AssetConfig'))return {WEB_ORIGIN:'https://cstf.invalid'};
  if(name.includes('AudioPermissionGate'))return {AudioPermissionGate:class{cancel(){}}};return {};
 }});
 const web=new exports.OfflineWeb();web.assetTag='fixture';
 async function request(path,range,method='GET'){
  const result={responses:[],chunks:[],finished:false,failed:false};
  const request={getRequestUrl:()=>path.startsWith('https:')?path:'https://cstf.invalid'+path,getRequestMethod:()=>method,getHeader:()=>range?[{headerKey:'Range',headerValue:range}]:[]};
  const handler={didReceiveResponse:r=>result.responses.push(r),didReceiveResponseBody:b=>result.chunks.push(Buffer.from(b)),didFinish:()=>result.finished=true,didFail:()=>result.failed=true};
  await web.respond(context,request,handler);return {...result,body:Buffer.concat(result.chunks),response:result.responses[0]};
 }
 return {request,closed,exports};
}
test('MP3 full and byte-range responses preserve bytes and MIME',async()=>{
 for(const [range,status,expected] of [[undefined,200,'0123456789'],['bytes=2-5',206,'2345'],['bytes=-3',206,'789'],['bytes=7-',206,'789'],['bytes=7-99',206,'789']]){
  const f=fixture(),r=await f.request('/audio/a.mp3',range);assert.equal(r.response.status,status);assert.equal(r.response.mime,'audio/mpeg');assert.equal(r.body.toString(),expected);assert.equal(r.response.headers['Content-Length'],String(expected.length));assert.deepEqual(f.closed,[1]);
 }
});
test('rawfile offsets, deep routes and Next RSC payloads are honored',async()=>{
 for(const path of ['/','/book/g1up/','/book/g1up','/book/g1up/index.txt']){
  const f=fixture(),r=await f.request(path);assert.equal(r.body.toString(),'HTML');assert.equal(r.response.status,200);assert.equal(f.closed.length,1);
  if(path.endsWith('.txt'))assert.equal(r.response.mime,'text/x-component');
 }
});
test('invalid ranges return 416 and the total file length',async()=>{
 for(const range of ['bytes=-','bytes=-0','bytes=10-','bytes=5-2','bytes=0-1,4-5','bytes=999999999999999999999-']){
  const f=fixture(),r=await f.request('/audio/a.mp3',range);assert.equal(r.response.status,416);assert.equal(r.response.headers['Content-Range'],'bytes */10');assert.deepEqual(f.closed,[1]);
 }
});
test('HEAD sends no body and POST is rejected',async()=>{
 const f=fixture(),r=await f.request('/audio/a.mp3',undefined,'HEAD');assert.equal(r.response.status,200);assert.equal(r.body.length,0);assert.equal(r.response.headers['Content-Length'],'10');assert.deepEqual(f.closed,[1]);
 assert.equal((await fixture().request('/audio/a.mp3',undefined,'POST')).response.status,405);
});
test('foreign origins and encoded traversal never open local files',async()=>{
 for(const path of ['https://cstf.invalid.evil/audio/a.mp3','/%2e%2e/secret','/audio/%5csecret','/audio/%00secret']){
  const f=fixture(),r=await f.request(path);assert([400,404].includes(r.response.status));assert.deepEqual(f.closed,[]);
 }
});
test('truncated bodies fail once and close handles, never send a second response',async()=>{
 const f=fixture({broken:true}),r=await f.request('/audio/a.mp3');assert.equal(r.responses.length,1);assert(r.failed);assert(!r.finished);assert.deepEqual(f.closed,[1]);
});

test('legacy UI Opus URLs resolve to verified MP3 siblings with MP3 MIME',async()=>{const r=await fixture().request('/audio/a.opus');assert.equal(r.response.status,200);assert.equal(r.response.mime,'audio/mpeg');assert.equal(r.body.toString(),'0123456789');});

test('HEAD range errors do not send a body',async()=>{const r=await fixture().request('/audio/a.mp3','bytes=99-','HEAD');assert.equal(r.response.status,416);assert.equal(r.body.length,0);});
