import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function hash(file) {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}
export async function createAssetServer(directory) {
  const root = path.resolve(directory);
  const plan = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  if (plan.schema !== 1 || !Array.isArray(plan.packages) || !plan.packages.length) throw Error('Invalid prepared Harmony manifest');
  const files = new Map([['manifest.json', null]]);
  for (const entry of plan.packages) {
    for (const metadata of [entry, entry.inventory]) {
      if (!metadata || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(metadata.name) || files.has(metadata.name)) throw Error('Invalid/duplicate asset name');
      files.set(metadata.name, metadata);
    }
  }
  for (const [name, metadata] of files) {
    const file = path.join(root, name), info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) throw Error(`Not a regular asset: ${name}`);
    if (metadata && (info.size !== metadata.bytes || await hash(file) !== metadata.sha256)) throw Error(`Asset SHA-256 mismatch: ${name}`);
  }
  return createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }).end();return; }
    const name = (request.url ?? '').slice(1);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) { response.writeHead(400).end();return; }
    if (!files.has(name)) { response.writeHead(404).end();return; }
    try {
      const file = path.join(root, name), info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink()) throw Error('Not a regular asset');
      response.writeHead(200, { 'Content-Length': info.size, 'Content-Type': name.endsWith('.zip') ? 'application/zip' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      if (request.method === 'HEAD') response.end();
      else { const stream = createReadStream(file);stream.on('error', () => response.destroy());response.on('close', () => stream.destroy());stream.pipe(response); }
    } catch { response.writeHead(404).end(); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== '--directory') throw Error('Usage: npm run harmony:assets-server -- --directory <prepared-assets>');
    const server = await createAssetServer(args[1]);
    const port = Number(process.env.HARMONY_ASSET_PORT ?? 8787);
    server.listen(port, '0.0.0.0', () => console.log(`Harmony LAN test server: port ${port}; directory ${path.resolve(args[1])}. Keep this server on a private LAN.`));
  } catch (error) { console.error(error.message);process.exitCode = 1; }
}
