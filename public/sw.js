/*
 * 홈 화면에 설치한 앱(PWA)용 서비스 워커.
 * 화면 파일(HTML·JS·CSS·아이콘·글꼴)을 기기에 저장해 두어 인터넷이 끊겨도 앱이 열리게 한다.
 * 기록 데이터는 앱이 IndexedDB에 따로 저장·동기화하므로 /api 요청은 건드리지 않는다.
 */
const VERSION = 'v2'
const SHELL = `ma-shell-${VERSION}`
const ASSETS = `ma-assets-${VERSION}`
const PRECACHE = ['/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png']

const assetPaths = (html) => [...new Set([...html.matchAll(/\/assets\/[^"'\s)]+/g)].map((m) => m[0]))]

/** index.html과 그 화면이 쓰는 JS·CSS를 함께 저장한다 (처음 방문한 페이지는 서비스 워커를 거치지 않으므로) */
async function storeShell(res) {
  const html = await res.clone().text()
  await (await caches.open(SHELL)).put('/', res)
  const paths = assetPaths(html)
  const cache = await caches.open(ASSETS)
  await Promise.all(paths.map(async (p) => (await cache.match(p)) || cache.add(p)))
  await pruneAssets(paths)
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await (await caches.open(SHELL)).addAll(PRECACHE)
      const res = await fetch('/', { cache: 'no-cache' })
      if (res.ok) await storeShell(res)
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/** 새 배포 때 이전 해시의 파일이 계속 쌓이지 않도록, 새 index.html이 쓰는 파일만 남긴다 */
async function pruneAssets(paths) {
  const used = new Set(paths)
  if (!used.size) return
  const cache = await caches.open(ASSETS)
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname
    // 지연 로딩 조각(chunk)은 index.html에 안 나올 수 있으니 JS·CSS 진입 파일만 정리
    if (path.startsWith('/assets/index-') && !used.has(path)) await cache.delete(req)
  }
}

async function navigate(request) {
  try {
    const res = await fetch(request)
    if (res.ok) storeShell(res.clone()).catch(() => {})
    return res
  } catch {
    // 오프라인: 마지막으로 받은 화면으로 연다 (주소는 앱 라우터가 처리)
    return (await caches.match('/')) ?? Response.error()
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok) (await caches.open(ASSETS)).put(request, res.clone())
  return res
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  const net = fetch(request)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(request, res.clone())
      return res
    })
    .catch(() => hit)
  return hit ?? net
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return
    if (request.mode === 'navigate') return event.respondWith(navigate(request))
    if (url.pathname.startsWith('/assets/')) return event.respondWith(cacheFirst(request))
    return event.respondWith(staleWhileRevalidate(request, SHELL))
  }

  // 글꼴(Pretendard) CDN: 오프라인에서도 같은 글꼴로 보이도록
  if (url.hostname === 'cdn.jsdelivr.net') event.respondWith(staleWhileRevalidate(request, ASSETS))
})
