const CACHE_NAME = 'reference-library-v2';

/*
 * 所有 URL 都相对于 sw.js 所在目录解析。
 * 因此项目部署在 /reference-library/ 时，不会错误指向站点根目录。
 */
const APP_SHELL = [
  new URL('./', self.location).href,
  new URL('./index.html', self.location).href,
  new URL('./manifest.json', self.location).href,
  new URL('./icon.svg', self.location).href
];

const INDEX_URL = new URL('./index.html', self.location).href;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);

  // 不缓存 Crossref、GitHub、GitLab、Gitee 等跨域 API 请求。
  if (requestUrl.origin !== self.location.origin) return;

  // 页面导航：网络优先；离线时返回项目内缓存的 index.html。
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(INDEX_URL, response.clone());
          }
          return response;
        } catch {
          return (
            (await caches.match(request)) ||
            (await caches.match(INDEX_URL)) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  // 同源静态资源：缓存优先，并在后台刷新缓存。
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);

      const networkPromise = fetch(request)
        .then(async response => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      return cached || (await networkPromise) || Response.error();
    })()
  );
});
