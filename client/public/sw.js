/* CWW service worker — الواجهة تعمل دون اتصال، أما الـ API والسوكت فمن الشبكة دائماً */
const VERSION = 'cww-v5';
const SHELL = ['/', '/index.html', '/offline.html', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting(); // تفعيل النسخة الجديدة فوراً دون انتظار إغلاق التبويبات القديمة
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'cww-fonts').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // خطوط Google: stale-while-revalidate
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open('cww-fonts').then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  if (url.origin !== self.location.origin) return;                        // فيديوهات وصور خارجية
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;

  // التنقل: الشبكة أولاً ثم الواجهة المخزنة ثم صفحة عدم الاتصال
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(async () => (await caches.match('/index.html')) || caches.match('/offline.html')));
    return;
  }

  // ملفات Vite ذات الأسماء المشفّرة وبقية الثوابت: المخزن أولاً
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/'))) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});

// ---- الإشعارات ----
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: 'CWW', body: e.data?.text() }; }
  const isCall = data.type === 'call';
  e.waitUntil(self.registration.showNotification(data.title || 'CWW', {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || data.type || 'cww',
    renotify: true,
    requireInteraction: !!data.requireInteraction,
    vibrate: isCall ? [300, 150, 300, 150, 300] : [120],
    dir: 'rtl',
    lang: 'ar',
    data: { url: data.url || '/' },
    actions: isCall ? [{ action: 'open', title: 'رد' }] : [],
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
      for (const c of list) {
        if ('focus' in c) { await c.focus(); if ('navigate' in c) c.navigate(target).catch(() => {}); return; }
      }
      return self.clients.openWindow(target);
    })
  );
});