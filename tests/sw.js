// node tests/sw.js — логика Service Worker на моках: предзагрузка, раздельные кэши, стратегии, офлайн.
const fs = require('fs'),
  vm = require('vm'),
  path = require('path'),
  src = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8'),
  fails = [];
const stores = {},
  listeners = {};
let online = true;
const log = [];
class Res {
  constructor(b, o = {}) {
    this.body = b;
    this.ok = (o.status || 200) < 400;
    this.status = o.status || 200;
  }
  clone() {
    return this;
  }
  static error() {
    return new Res('ERR', { status: 599 });
  }
}
const key = (q) => (typeof q === 'string' ? new URL(q, 'https://s.test/').href : q.url);
const cache = (n) => (
  (stores[n] = stores[n] || new Map()),
  {
    put: async (q, r) => {
      stores[n].set(key(q), r);
    },
    addAll: async (l) => {
      l.forEach((u) => stores[n].set(key(u), new Res('pre:' + u)));
    }
  }
);
const caches = {
  open: async (n) => cache(n),
  keys: async () => Object.keys(stores),
  delete: async (n) => {
    delete stores[n];
    return true;
  },
  match: async (q) => {
    for (const m of Object.values(stores)) {
      const r = m.get(key(q)) || m.get(key(q).split('?')[0]);
      if (r) return r;
    }
    return undefined;
  }
};
const self_ = {
  addEventListener: (t, f) => {
    listeners[t] = f;
  },
  skipWaiting: async () => {},
  clients: { claim: async () => {} },
  location: new URL('https://s.test/')
};
const ctx = {
  self: self_,
  caches,
  location: self_.location,
  URL,
  Response: Res,
  fetch: async (q) => {
    log.push('net:' + q.url);
    if (!online) throw new Error('offline');
    return new Res('net:' + q.url);
  }
};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const wait = async (type, ev) => {
  if (type === 'fetch' && !ev.request) ev = { request: ev };
  let p;
  ev.waitUntil = (x) => {
    p = x;
  };
  ev.respondWith = (x) => {
    p = x;
  };
  listeners[type](ev);
  return p;
};
const req = (u, mode = 'no-cors') => ({ url: 'https://s.test' + u, method: 'GET', mode });
(async () => {
  await wait('install', {});
  const V = Object.keys(stores).find((k) => k.startsWith('bp-') && !k.includes('heavy'));
  if (!V || !stores[V].size) fails.push('предзагрузка пуста');
  stores['bp-old'] = new Map();
  stores['bp-heavy-v1'] = stores['bp-heavy-v1'] || new Map();
  stores['other'] = new Map();
  await wait('activate', {});
  if (stores['bp-old']) fails.push('старый кэш приложения не удалён');
  if (!stores['bp-heavy-v1']) fails.push('кэш тяжёлых файлов удалён при обновлении');
  if (!stores['other']) fails.push('чужой кэш удалён');
  // модель: первый раз из сети, дальше только из кэша
  let r = await wait('fetch', req('/assets/ner/ner-v2.bin'));
  if (!/^net:/.test(r.body)) fails.push('модель не из сети при первом запросе');
  log.length = 0;
  online = false;
  r = await wait('fetch', req('/assets/ner/ner-v2.bin'));
  if (log.length) fails.push('модель из кэша должна отдаваться без сети');
  if (!stores['bp-heavy-v1'].size) fails.push('модель не попала в кэш тяжёлых файлов');
  // страница офлайн; переход на неизвестный адрес — главная; ненужные ресурсы — ошибка
  r = await wait('fetch', req('/assets/app.js'));
  if (!/^pre:/.test(r.body)) fails.push('app.js офлайн должен отдаваться из предзагрузки');
  r = await wait('fetch', req('/nope', 'navigate'));
  if (!/index\.html/.test(r.body)) fails.push('офлайн-переход должен вести на index.html');
  r = await wait('fetch', req('/unknown.css'));
  if (r.status !== 599) fails.push('неизвестный ресурс офлайн должен давать ошибку');
  // не кэшируем ошибки, чужие источники и не-GET
  online = true;
  ctx.fetch = async () => new Res('x', { status: 500 });
  const before = stores[V].size;
  await wait('fetch', req('/boom.js'));
  if (stores[V].size !== before) fails.push('кэшируется ответ с ошибкой');
  let handled = false;
  listeners.fetch({
    request: { url: 'https://evil.test/a', method: 'GET' },
    respondWith: () => {
      handled = true;
    }
  });
  listeners.fetch({
    request: { ...req('/x'), method: 'POST' },
    respondWith: () => {
      handled = true;
    }
  });
  if (handled) fails.push('чужие запросы и не-GET не должны перехватываться');
  if (fails.length) {
    console.error('Service Worker: ОШИБКИ\n  ' + fails.join('\n  '));
    process.exit(1);
  }
  console.log('Service Worker: ок (предзагрузка, раздельные кэши, офлайн, не кэширует ошибки и чужие запросы)');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
