/**
 * 聪聪学堂 Service Worker（critic-7）
 *
 * 策略：
 *   - 壳层（导航请求 / manifest / 图标）：网络优先，失败回缓存 —— 离线也能进入上次访问过的页面
 *   - 课程数据 JSON（/data/**）与 TTS 音频（/audio/**）：stale-while-revalidate
 *     —— 先用缓存秒开，后台悄悄刷新
 *   - 静态构建产物（/_next/static/**，内容寻址不变）：缓存优先
 *
 * next 静态导出（output: "export"）下手写注册即可，注册脚本在 layout.tsx。
 */

const VERSION = "v3";
const SHELL_CACHE = `ctsf-shell-${VERSION}-jingtong-v1.8.3`;
const DATA_CACHE = `ctsf-data-${VERSION}-jingtong-v1.8.3`;
const STATIC_CACHE = `ctsf-static-${VERSION}`;

const SHELL_PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_PRECACHE))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", event => {
  const keep = new Set([SHELL_CACHE, DATA_CACHE, STATIC_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** stale-while-revalidate：缓存秒回 + 后台刷新 */
async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(res => {
      if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

/** 网络优先，失败回缓存（导航壳层） */
async function networkFirst(cacheName, request, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw e;
  }
}

/** 缓存优先（内容寻址的静态产物） */
async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
  return res;
}

self.addEventListener("fetch", event => {
  const { request } = event;
  // Let the browser handle byte ranges directly. Cache API cannot store 206
  // responses, and a cached full response must not replace a requested range.
  if (request.method !== "GET" || request.headers.has("range")) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Review explicitly asks for current lesson JSON. An SW cache must not defeat
  // this request and resurrect an invalid historical answer.
  if (request.cache === "no-store") {
    event.respondWith(fetch(request));
    return;
  }

  // 课程 JSON 与音频：stale-while-revalidate
  if (url.pathname.startsWith("/data/") || url.pathname.startsWith("/audio/")) {
    event.respondWith(staleWhileRevalidate(DATA_CACHE, request));
    return;
  }

  // 内容寻址静态产物：缓存优先
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(STATIC_CACHE, request));
    return;
  }

  // 页面导航（壳层）：网络优先，离线回缓存 / 首页兜底
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(SHELL_CACHE, request, "/"));
    return;
  }

  // 其余同源静态资源（manifest / 图标 / 字体等）：SWR
  event.respondWith(staleWhileRevalidate(SHELL_CACHE, request));
});
