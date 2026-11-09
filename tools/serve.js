// Локальный сервер без зависимостей: node tools/serve.js [порт]. Слушает только 127.0.0.1 и отдаёт те же заголовки безопасности, что _headers.
// Ничего не пишет на диск и не принимает данные: только чтение файлов проекта.
const http = require('http'),
  fs = require('fs'),
  path = require('path');
const site = require('./site-files.js');
const root = path.join(__dirname, '..'),
  port = +process.argv[2] || +process.env.PORT || 8080;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.bin': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8'
};
const H = {};
for (const l of fs.readFileSync(path.join(root, '_headers'), 'utf8').split('\n/sw.js')[0].split('\n').slice(1)) {
  const m = l.match(/^\s+([\w-]+):\s*(.+)$/);
  if (m) H[m[1]] = m[2];
}
http
  .createServer((q, r) => {
    if (q.method !== 'GET' && q.method !== 'HEAD') {
      r.writeHead(405).end();
      return;
    }
    let p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.normalize(path.join(root, p));
    // Отдаём только файлы сайта: страницы, манифест, sw.js, robots.txt и assets/. Служебные файлы проекта (package.json, tests, .git) недоступны.
    const rel = path.relative(root, f).split(path.sep).join('/');
    const ok = f.startsWith(root + path.sep) && (site.pages.includes(rel) || rel.startsWith('assets/'));
    fs.stat(ok ? f : '', (e, st) => {
      if (e || !st.isFile()) {
        r.writeHead(404, { ...H, 'Content-Type': MIME['.html'] });
        fs.createReadStream(path.join(root, '404.html')).pipe(r);
        return;
      }
      r.writeHead(200, {
        ...H,
        'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
        'Content-Length': st.size
      });
      if (q.method === 'HEAD') r.end();
      else fs.createReadStream(f).pipe(r);
    });
  })
  .listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port));
