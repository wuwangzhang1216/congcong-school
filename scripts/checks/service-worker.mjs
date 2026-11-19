import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const handlers = new Map();
let fetches = 0;
let writes = 0;
const quotaErrors = [];
const unhandled = error => quotaErrors.push(error);
process.on('unhandledRejection', unhandled);
const cached = new Response('cached full body');
runInNewContext(readFileSync(new URL('../../apps/web/public/sw.js', import.meta.url), 'utf8'), {
  self: { location: { origin: 'https://classroom.example' }, addEventListener: (name, handler) => handlers.set(name, handler) },
  caches: { open: async () => ({
    match: async () => cached.clone(),
    put: () => { writes++; return Promise.reject(new Error('Storage quota exceeded')); },
  }) },
  fetch: async () => { fetches++; return new Response('fresh body'); },
  URL,
  Response,
});
const handler = handlers.get('fetch');
assert.equal(typeof handler, 'function');
let intercepted = false;
handler({ request: new Request('https://classroom.example/audio/voice.mp3', { headers: { Range: 'bytes=0-31' } }),
  respondWith: () => { intercepted = true; } });
assert.equal(intercepted, false, 'Range requests must reach the network, without full cached audio substitution');
assert.equal(fetches, 0);
assert.equal(writes, 0);
let result;
handler({ request: new Request('https://classroom.example/data/index.json'), respondWith: promise => { result = promise; } });
assert.equal(await (await result).text(), 'cached full body');
await new Promise(resolve => setImmediate(resolve));
assert.equal(fetches, 1, 'Cached data must still refresh in the background');
assert.equal(writes, 1);
handler({ request: new Request('https://classroom.example/data/books/g1up/lessons/g1up-u6-kp2.json', { cache: 'no-store' }), respondWith: promise => { result = promise; } });
assert.equal(await (await result).text(), 'fresh body', 'review reconciliation must not grade stale cached lesson JSON');
assert.equal(fetches, 2);
assert.equal(writes, 1, 'explicit fresh loads must not re-enter the stale cache');
assert.deepEqual(quotaErrors, [], 'Storage quota failures must not cause unhandled rejections');
process.off('unhandledRejection', unhandled);

// An upgrade must not serve the old catalog from a previously populated data
// cache. Content-addressed app assets can stay cached across the transition.
const upgradeHandlers = new Map();
const cacheContents = new Map([
  ['ctsf-data-v3-five-four-v1.8.0', new Response('old catalog: 84')],
  ['ctsf-shell-v3-numeric-input-v1.8.2', new Response('old shell')],
  ['ctsf-static-v3', new Response('existing hashed asset')],
]);
let claimed = false;
runInNewContext(readFileSync(new URL('../../apps/web/public/sw.js', import.meta.url), 'utf8'), {
  self: {
    location: { origin: 'https://classroom.example' },
    addEventListener: (name, fn) => upgradeHandlers.set(name, fn),
    clients: { claim: async () => { claimed = true; } },
  },
  caches: {
    keys: async () => [...cacheContents.keys()],
    delete: async name => cacheContents.delete(name),
    open: async name => ({
      match: async () => cacheContents.get(name)?.clone(),
      put: async (_, response) => { cacheContents.set(name, response); },
    }),
  },
  fetch: async () => new Response('new catalog: 85'),
  URL, Response,
});
let activation;
upgradeHandlers.get('activate')({ waitUntil: p => { activation = p; } });
await activation;
assert.equal(claimed, true);
assert.equal(cacheContents.has('ctsf-static-v3'), true);
assert.equal(cacheContents.has('ctsf-data-v3-five-four-v1.8.0'), false);
upgradeHandlers.get('fetch')({ request: new Request('https://classroom.example/data/index.json'), respondWith: p => { result = p; } });
assert.equal(await (await result).text(), 'new catalog: 85');
console.log('PASS: byte ranges bypass cache; data refreshes; review loads are fresh; quota errors handled; upgrade replaces the old catalog while preserving hashed assets.');
