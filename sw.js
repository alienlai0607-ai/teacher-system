// 布拉克星球 KPI 系統 — Service Worker
// 策略：網路優先（避免舊快取問題），離線時才用快取備援
const CACHE = 'bp-kpi-v1';
const SHELL = ['/index.html', '/shared/style.css', '/shared/icons/icon-192.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // 只處理 GET
  if (!req.url.startsWith(self.location.origin)) return;  // 不攔外部(Apps Script/Drive)
  // 網路優先：拿到就更新快取；失敗才回快取（離線備援）
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req))
  );
});
