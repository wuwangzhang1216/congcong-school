import { common } from "@kit.AbilityKit";
import { cryptoFramework } from "@kit.CryptoArchitectureKit";
import { fileIo } from "@kit.CoreFileKit";
import { request, zlib } from "@kit.BasicServicesKit";
import { http } from "@kit.NetworkKit";
import { buffer, MessageEvents, worker } from "@kit.ArkTS";

interface WorkerInput {
  context: common.UIAbilityContext;
  assetBaseUrl: string;
  assetTag: string;
  manifestSha256: string;
  allowInsecureHttp: boolean;
}

interface InventorySpec {
  name: string;
  bytes: number;
  sha256: string;
}
interface ReleaseAsset {
  name: string;
  kind: string;
  directory: string;
  bytes: number;
  sha256: string;
  url: string;
  inventory: InventorySpec;
  files: number;
  uncompressedBytes: number;
}
interface ReleaseManifest {
  schema: number;
  tag: string;
  shellSha256: string;
  packages: ReleaseAsset[];
}
interface InventoryRow {
  path: string;
  bytes: number;
  sha256: string;
}

const workerPort = worker.workerPort;

workerPort.onmessage = async (event: MessageEvents): Promise<void> => {
  const input = event.data as WorkerInput;
  try {
    await installAssets(input);
    workerPort.postMessage({ type: "complete" });
  } catch (error) {
    workerPort.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

async function installAssets(input: WorkerInput): Promise<void> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input.assetTag)) throw new Error('非法安装版本');
  const manifest = await embeddedText(input.context, 'harmony-manifest.json');
  if (await sha256Text(manifest) !== input.manifestSha256) throw new Error('HAP 资源计划校验失败');
  const parsed = JSON.parse(manifest) as ReleaseManifest;
  validatePlan(parsed, input);
  const root = `${input.context.filesDir}/cstf`;
  const staging = `${root}/staging/${input.assetTag}`;
  const installedRoot = `${root}/assets/${input.assetTag}`;
  const markerDir = `${root}/.installed/${input.assetTag}`;
  makeDirectory(staging);makeDirectory(installedRoot);makeDirectory(markerDir);
  // A previous failed repair must not leave a completion receipt behind.
  removeIfExists(`${markerDir}/complete`);
  const totalBytes = parsed.packages.reduce((sum: number, a: ReleaseAsset) => sum + a.bytes, 0);
  let completedBytes = 0;
  for (const asset of parsed.packages) {
    workerPort.postMessage({type: 'progress', assetName: `${asset.name} 校验中`, fraction: completedBytes / totalBytes});
    const inventoryText = await embeddedText(input.context, asset.inventory.name);
    if (buffer.from(inventoryText, 'utf-8').length !== asset.inventory.bytes ||
      await sha256Text(inventoryText) !== asset.inventory.sha256) throw new Error('逐文件清单校验失败');
    const rows = readInventory(inventoryText, asset);
    const target = asset.directory === '.' ? installedRoot : `${installedRoot}/${asset.directory}`;
    const marker = `${markerDir}/${asset.name}.complete`;
    if (!filesMatch(target, rows)) {
      removeIfExists(marker);
      const archivePath = `${staging}/${asset.name}`;
      const reusable = fileExists(archivePath) && fileIo.statSync(archivePath).size === asset.bytes && sha256File(archivePath) === asset.sha256;
      if (!reusable) {
        removeIfExists(archivePath);
        await downloadArchive(input.context, asset.url, archivePath, asset.name, completedBytes, totalBytes, asset.bytes);
        if (fileIo.statSync(archivePath).size !== asset.bytes || sha256File(archivePath) !== asset.sha256) {
          removeIfExists(archivePath);throw new Error(`${asset.name} 大小或 SHA-256 不匹配`);
        }
      }
      workerPort.postMessage({type: 'progress', assetName: `${asset.name} 解压中`, fraction: completedBytes / totalBytes});
      makeDirectory(target);
      await extractArchive(archivePath, target, asset.name);
      if (!filesMatch(target, rows)) throw new Error(`${asset.name} 解压后逐文件校验失败`);
      removeIfExists(archivePath);
    }
    writeReceipt(marker, asset.sha256);
    completedBytes += asset.bytes;
    workerPort.postMessage({type: 'progress', assetName: asset.name, fraction: completedBytes / totalBytes});
  }
  writeReceipt(`${markerDir}/complete`, input.manifestSha256);
}

async function embeddedText(context: common.UIAbilityContext, name: string): Promise<string> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) throw new Error('非法内置资源名');
  const bytes = await context.resourceManager.getRawFileContent(`site/${name}`);
  if (bytes.byteLength > 64 * 1024 * 1024) throw new Error('内置清单超出大小限制');
  return buffer.from(bytes).toString('utf-8');
}

function validatePlan(plan: ReleaseManifest, input: WorkerInput): void {
  if (plan.schema !== 1 || plan.tag !== input.assetTag || !/^[a-f0-9]{64}$/.test(plan.shellSha256) ||
    !Array.isArray(plan.packages) || plan.packages.length === 0) throw new Error('安装计划版本不匹配');
  const names: string[] = [];
  const kinds: string[] = [];
  for (const a of plan.packages) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/.test(a.name) || names.includes(a.name) ||
      !/^[a-f0-9]{64}$/.test(a.sha256) || !Number.isSafeInteger(a.bytes) || a.bytes <= 0 ||
      !Number.isSafeInteger(a.files) || a.files <= 0 || !Number.isSafeInteger(a.uncompressedBytes) || a.uncompressedBytes < 0 ||
      !a.inventory || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.files\.jsonl$/.test(a.inventory.name) ||
      !/^[a-f0-9]{64}$/.test(a.inventory.sha256) || !Number.isSafeInteger(a.inventory.bytes) ||
      a.inventory.bytes <= 0 || a.inventory.bytes > 64 * 1024 * 1024) throw new Error('非法分包元数据');
    if (!((a.kind === 'audio-web' && a.directory === '.') ||
      (['data', 'story-images', 'textbook-pages'].includes(a.kind) && a.directory === a.kind))) throw new Error('非法资源目的目录');
    if (input.assetBaseUrl.length > 0) {
      const base = normalizeBaseUrl(input.assetBaseUrl, input.allowInsecureHttp);
      if (a.url !== `${base}/${a.name}`) throw new Error('分包不属于所配置镜像');
    } else if (!/^https:\/\/github\.com\/wuwangzhang1216\/(congcong-school|ChinaTextbookStudyFree)\/releases\/download\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/.test(a.url) || !a.url.endsWith('/' + a.name)) {
      throw new Error('非法发布下载地址');
    }
    names.push(a.name);kinds.push(a.kind);
  }
  if (!['audio-web', 'data', 'story-images', 'textbook-pages'].every((kind: string) => kinds.includes(kind))) throw new Error('资源类型不完整');
}

function readInventory(text: string, asset: ReleaseAsset): InventoryRow[] {
  const rows: InventoryRow[] = [];
  const names: Set<string> = new Set<string>();
  let bytes = 0;
  for (const line of text.split('\n')) {
    if (line.length === 0) continue;
    const row = JSON.parse(line) as InventoryRow;
    if (!row.path || row.path.startsWith('/') || row.path.includes('\\') || row.path.includes(':') || row.path.includes('\0') ||
      row.path.split('/').some((part: string) => part === '..' || part === '.' || part.length === 0) || names.has(row.path) ||
      !Number.isSafeInteger(row.bytes) || row.bytes < 0 || !/^[a-f0-9]{64}$/.test(row.sha256)) throw new Error('非法归档成员');
    if (asset.kind === 'audio-web' && !(row.path.startsWith('audio/') && row.path.endsWith('.mp3'))) throw new Error('音频成员必须为 MP3');
    names.add(row.path);rows.push(row);bytes += row.bytes;
  }
  if (rows.length !== asset.files || bytes !== asset.uncompressedBytes) throw new Error('文件清单不完整');
  return rows;
}

function filesMatch(root: string, rows: InventoryRow[]): boolean {
  for (const row of rows) {
    const path = `${root}/${row.path}`;
    if (!fileExists(path) || fileIo.statSync(path).size !== row.bytes || sha256File(path) !== row.sha256) return false;
  }
  return true;
}

function writeReceipt(path: string, value: string): void {
  const temporary = `${path}.tmp`;
  writeTextFile(temporary, value);
  fileIo.renameSync(temporary, path);
}

function normalizeBaseUrl(value: string, allowInsecureHttp: boolean): string {
  const normalized = value.trim().replace(/\/+$/, "");
  const match = /^(https?):\/\/([^\/:?#@]+)(?::[0-9]{1,5})?(?:\/[^?#]*)?$/i.exec(normalized);
  if (!match) throw new Error("资源下载地址无效。");
  const scheme = match[1].toLowerCase();
  const hostname = match[2].toLowerCase();
  if (scheme !== "https" && !(allowInsecureHttp && scheme === "http")) {
    throw new Error("资源下载地址必须使用 HTTPS。");
  }
  if (scheme === "http" && !isPrivateIPv4(hostname)) {
    throw new Error("测试模式下的 HTTP 地址只能指向本机或私有局域网 IPv4 地址。");
  }
  return normalized;
}

function isPrivateIPv4(host: string): boolean {
  if (!/^(0|[1-9][0-9]{0,2})(\.(0|[1-9][0-9]{0,2})){3}$/.test(host)) return false;
  const octets = host.split(".").map((part: string) => Number(part));
  if (octets.length !== 4 || octets.some((part: number) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

async function downloadManifest(baseUrl: string): Promise<string> {
  const client = http.createHttp();
  try {
    const response = await client.request(`${baseUrl}/manifest.json`, {
      method: http.RequestMethod.GET,
      connectTimeout: 30000,
      readTimeout: 60000,
      expectDataType: http.HttpDataType.STRING,
    });
    if (response.responseCode < 200 || response.responseCode >= 300 || typeof response.result !== "string") {
      throw new Error(`无法获取资源清单（HTTP ${response.responseCode}）。`);
    }
    return response.result;
  } finally {
    client.destroy();
  }
}

async function downloadArchive(
  context: common.UIAbilityContext,
  url: string,
  destination: string,
  assetName: string,
  completedBytes: number,
  totalBytes: number,
  assetBytes: number,
): Promise<void> {
  const task = await request.downloadFile(context, { url, filePath: destination });
  await new Promise<void>((resolve, reject) => {
    task.on("progress", (received: number, _total: number) => {
      const fraction = totalBytes === 0 ? 0 : (completedBytes + Math.min(received, assetBytes)) / totalBytes;
      workerPort.postMessage({ type: "progress", assetName, fraction });
    });
    task.on("complete", () => resolve());
    task.on("fail", (error) => reject(new Error(`${assetName} 下载失败：${JSON.stringify(error)}`)));
  });
}

async function extractArchive(archivePath: string, targetDirectory: string, assetName: string): Promise<void> {
  if (!assetName.endsWith('.zip')) throw new Error('只支持经过验证的 ZIP 分包');
  await zlib.decompressFile(archivePath, targetDirectory, {});
}

async function sha256Text(value: string): Promise<string> {
  const encoded = buffer.from(value, "utf-8");
  const data = new Uint8Array(encoded.length);
  for (let index = 0; index < encoded.length; index++) {
    data[index] = encoded[index];
  }
  const digest = cryptoFramework.createMd("SHA256");
  await digest.update({ data });
  return bytesToHex((await digest.digest()).data);
}

function writeTextFile(filePath: string, value: string): void {
  const file = fileIo.openSync(filePath, fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC | fileIo.OpenMode.WRITE_ONLY);
  try {
    const encoded = buffer.from(value, "utf-8");
    const bytes = new Uint8Array(encoded.length);
    for (let index = 0; index < encoded.length; index++) bytes[index] = encoded[index];
    let written = 0;
    while (written < bytes.length) {
      const count = fileIo.writeSync(file.fd, bytes.buffer.slice(written));
      if (count <= 0 || count > bytes.length - written) throw new Error(`安装标记写入失败：${filePath}`);
      written += count;
    }
  } finally {
    fileIo.closeSync(file.fd);
  }
}

function sha256File(filePath: string): string {
  const file = fileIo.openSync(filePath, fileIo.OpenMode.READ_ONLY);
  try {
    const digest = cryptoFramework.createMd("SHA256");
    const fileSize = fileIo.statSync(filePath).size;
    const chunkSize = 1024 * 1024;
    let position = 0;
    while (position < fileSize) {
      const length = Math.min(chunkSize, fileSize - position);
      const chunk = new ArrayBuffer(length);
      const read = fileIo.readSync(file.fd, chunk, { offset: position, length });
      if (read <= 0) throw new Error(`读取校验文件失败：${filePath}`);
      digest.updateSync({ data: new Uint8Array(chunk, 0, read) });
      position += read;
    }
    return bytesToHex(digest.digestSync().data);
  } finally {
    fileIo.closeSync(file.fd);
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte: number) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function makeDirectory(directory: string): void {
  try {
    fileIo.mkdirSync(directory, true);
  } catch (error) {
    if (!fileExists(directory)) throw error;
  }
}

function fileExists(filePath: string): boolean {
  try {
    return fileIo.accessSync(filePath);
  } catch (_error) {
    return false;
  }
}

function removeIfExists(filePath: string): void {
  if (fileExists(filePath)) fileIo.unlinkSync(filePath);
}
