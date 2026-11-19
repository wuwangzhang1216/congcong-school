import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadWorker(fileIo, zlib = {}, cryptoFramework = {}) {
  const source = readFileSync(new URL("../apps/harmony/entry/src/main/ets/workers/assetWorker.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const sandbox = {
    exports: {},
    require(name) {
      if (name === "@kit.CryptoArchitectureKit") return { cryptoFramework };
      if (name === "@kit.CoreFileKit") return { fileIo };
      if (name === "@kit.BasicServicesKit") return { zlib };
      if (name === "@kit.ArkTS") return { buffer: Buffer, worker: { workerPort: { postMessage() {} } } };
      return {};
    },
  };
  vm.runInNewContext(outputText, sandbox);
  return sandbox;
}

test("fileExists preserves true and false access results and handles exceptions", () => {
  const worker = loadWorker({
    accessSync(filePath) {
      if (filePath === "/error") throw new Error("ENOENT");
      return filePath === "/present";
    },
  });
  assert.equal(worker.fileExists("/present"), true);
  assert.equal(worker.fileExists("/missing"), false);
  assert.equal(worker.fileExists("/error"), false);
});

test("removeIfExists only unlinks existing archives", () => {
  const removed = [];
  const worker = loadWorker({
    accessSync: (filePath) => filePath === "/present.zip",
    unlinkSync: (filePath) => removed.push(filePath),
  });
  worker.removeIfExists("/missing.zip");
  worker.removeIfExists("/present.zip");
  assert.deepEqual(removed, ["/present.zip"]);
});

test("makeDirectory propagates failure unless the directory already exists", () => {
  const mkdirError = new Error("permission denied");
  const worker = loadWorker({
    accessSync: (directory) => directory === "/existing",
    mkdirSync(_directory, recursive) {
      assert.equal(recursive, true);
      throw mkdirError;
    },
  });
  assert.doesNotThrow(() => worker.makeDirectory("/existing"));
  assert.throws(
    () => worker.makeDirectory("/missing"),
    (error) => error === mkdirError,
  );
});

test('installation markers also handle short writes and close on failure', () => {
  for (const limit of [2,0,-1]) {
    const written=[],closed=[];
    const worker=loadWorker({
      OpenMode:{CREATE:1,TRUNC:2,WRITE_ONLY:4},openSync:()=>({fd:12}),
      writeSync(fd,data){if(limit<=0)return limit;const part=Buffer.from(data).subarray(0,limit);written.push(part);return part.length;},
      closeSync:fd=>closed.push(fd),
    });
    if(limit>0){worker.writeTextFile('/marker','安装完成');assert.equal(Buffer.concat(written).toString(),'安装完成');}
    else assert.throws(()=>worker.writeTextFile('/marker','installed'));
    assert.deepEqual(closed,[12]);
  }
});

test('only ZIP extraction reaches the SDK, with errors propagated',async()=>{
 const calls=[];const worker=loadWorker({}, {decompressFile:async(...args)=>calls.push(args)});
 await worker.extractArchive('/cache/audio.zip','/private/audio','audio.zip');assert.equal(calls.length,1);assert.equal(calls[0][1],'/private/audio');
 await assert.rejects(worker.extractArchive('/cache/audio.tar.gz','/private/audio','audio.tar.gz'));assert.equal(calls.length,1);
 const broken=loadWorker({}, {decompressFile:async()=>{throw Error('SDK extraction failed');}});await assert.rejects(broken.extractArchive('/a.zip','/b','a.zip'),/SDK extraction failed/);
});
test('hashing closes descriptors even if digest creation or file stat fails',()=>{
 for(const failure of ['digest','stat']){
  const closed=[];const worker=loadWorker({OpenMode:{READ_ONLY:1},openSync:()=>({fd:12}),statSync(){throw Error('stat failed');},closeSync:fd=>closed.push(fd)}, {}, {createMd(){if(failure==='digest')throw Error('digest failed');return {};}});
  assert.throws(()=>worker.sha256File('/file'));assert.deepEqual(closed,[12]);
 }
});
