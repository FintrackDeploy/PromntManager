// Офлайн-кэш только файлов самого приложения. Текст пользователя в кэш и в сеть не попадает.
// Версия кэша приложения берётся из package.json (проверяет tests/deploy.js). Тяжёлые неизменные файлы
// (модель, шрифты, библиотека) лежат в отдельном кэше H и не скачиваются заново при выходе новой версии.
const V = 'bp-1.7.0',
  H = 'bp-heavy-v1';
const A = [
  './',
  'index.html',
  '404.html',
  'assets/style.css',
  'assets/fonts.css',
  'assets/rules.js',
  'assets/analyzer.js',
  'assets/ner.js',
  'assets/ner-worker.js',
  'assets/app.js',
  'assets/trainer.js',
  'assets/icon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/logo-seal.png',
  'assets/logo-mark.png',
  'manifest.webmanifest'
];
// Неизменные тяжёлые файлы (шрифты, библиотека) кладём в кэш сразу при установке. Модель (9 МБ) туда добавляет страница
// после загрузки (см. cacheModel в app.js), чтобы не скачивать её дважды.
const HV = [
  'assets/vendor/jszip.min.js',
  'assets/fonts/old-standard-tt-cyrillic-700-normal.woff2',
  'assets/fonts/old-standard-tt-cyrillic-400-italic.woff2',
  'assets/fonts/old-standard-tt-cyrillic-400-normal.woff2',
  'assets/fonts/old-standard-tt-latin-400-normal.woff2',
  'assets/fonts/old-standard-tt-latin-700-normal.woff2',
  'assets/fonts/onest-cyrillic-wght-normal.woff2',
  'assets/fonts/onest-latin-wght-normal.woff2'
];
const heavy = (u) => /\/assets\/(ner|fonts|vendor)\//.test(new URL(u).pathname);
const store = (name, req, res) => {
  if (res.ok && res.status === 200 && new URL(req.url).origin === location.origin) {
    const c = res.clone();
    caches.open(name).then((k) => k.put(req, c));
  }
  return res;
};
self.addEventListener('install', (e) =>
  e.waitUntil(
    Promise.all([caches.open(V).then((c) => c.addAll(A)), caches.open(H).then((c) => c.addAll(HV))]).then(() =>
      self.skipWaiting()
    )
  )
);
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((k) => Promise.all(k.filter((x) => x.startsWith('bp-') && x !== V && x !== H).map((x) => caches.delete(x))))
      .then(() => self.clients.claim())
  )
);
self.addEventListener('fetch', (e) => {
  const q = e.request;
  if (q.method !== 'GET' || new URL(q.url).origin !== location.origin) return;
  if (heavy(q.url)) {
    // Тяжёлые файлы: сначала кэш.
    e.respondWith(caches.match(q).then((r) => r || fetch(q).then((x) => store(H, q, x))));
  } else {
    // Страницы, стили, скрипты: сначала сеть (обновления видны сразу), без сети — кэш, для переходов — главная страница.
    e.respondWith(
      fetch(q)
        .then((x) => store(V, q, x))
        .catch(() =>
          caches
            .match(q, { ignoreSearch: true })
            .then((r) => r || (q.mode === 'navigate' ? caches.match('index.html') : null))
            .then((r) => r || Response.error())
        )
    );
  }
});
