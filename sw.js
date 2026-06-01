const CACHE_NAME = 'phrase-viewer-v4';
const SHELL_URLS = ['./index.html', './manifest.json'];

// WAL-311: 事前生成音声(mp3)をインストール時にプリキャッシュ→オフライン・全画面で確実に鳴る
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE_NAME);
    await c.addAll(SHELL_URLS);
    try {
      const m = await fetch('./audio/manifest.json').then(r => r.json());
      const urls = [];
      for (const lang of Object.keys(m)) for (const id of m[lang]) urls.push('./audio/' + lang + '/' + id + '.mp3');
      await Promise.all(urls.map(u => c.add(u).catch(() => {})));
    } catch (err) { /* 音声未配置でもShellは動く */ }
  })());
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('supabase.co')) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const clone = r.clone();
      caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
