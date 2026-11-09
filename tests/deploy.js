// node tests/deploy.js — согласованность файлов развёртывания: версия кэша, список предзагрузки, CSP во всех местах, иконки, модель.
const fs = require('fs'),
  path = require('path'),
  root = path.join(__dirname, '..'),
  rd = (f) => fs.readFileSync(path.join(root, f), 'utf8'),
  fails = [];
const pkg = JSON.parse(rd('package.json')),
  sw = rd('sw.js');
const v = (sw.match(/const V = '([^']+)'/) || [])[1];
if (v !== 'bp-' + pkg.version) fails.push(`sw.js: версия кэша ${v} не совпадает с package.json (${pkg.version})`);
const list = (sw.match(/const A = \[([^\]]+)\]/) || [, ''])[1].match(/'([^']+)'/g) || [];
for (const f of list.map((x) => x.slice(1, -1)).filter((x) => x !== './'))
  if (!fs.existsSync(path.join(root, f))) fails.push('sw.js: нет файла ' + f);
if (!/'index\.html'/.test(sw) || !/'404\.html'/.test(sw)) fails.push('sw.js: в предзагрузке нет index.html/404.html');
// CSP: meta в index.html и 404.html, _headers и nginx.conf должны совпадать (кроме frame-ancestors, который в meta не работает)
const norm = (s) =>
  new Set(
    s
      .split(';')
      .map((x) => x.trim())
      .filter((x) => x && !x.startsWith('frame-ancestors'))
  );
const idx = (rd('index.html').match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1];
const hdr = (rd('_headers').match(/Content-Security-Policy: (.+)/) || [])[1],
  ngx = (rd('deploy/nginx.conf').match(/Content-Security-Policy "([^"]+)"/) || [])[1];
if (!idx || !hdr || !ngx) fails.push('Не найдена CSP в index.html, _headers или nginx.conf');
else {
  const a = [...norm(idx)].sort().join(';');
  if (a !== [...norm(hdr)].sort().join(';')) fails.push('CSP в index.html и _headers различаются');
  if (a !== [...norm(ngx)].sort().join(';')) fails.push('CSP в index.html и nginx.conf различаются');
  for (const need of [
    "default-src 'none'",
    "script-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "base-uri 'none'",
    "form-action 'none'"
  ])
    if (!norm(idx).has(need)) fails.push('В CSP нет ' + need);
  if (/unsafe-|\*|https?:/.test(idx)) fails.push('В CSP есть небезопасный источник');
}
const m404 = rd('404.html');
if (!/default-src 'none'/.test(m404)) fails.push('404.html без CSP');
// манифест и иконки
const man = JSON.parse(rd('manifest.webmanifest'));
for (const i of man.icons) if (!fs.existsSync(path.join(root, i.src))) fails.push('manifest: нет иконки ' + i.src);
if (!man.icons.some((i) => i.sizes === '192x192') || !man.icons.some((i) => i.sizes === '512x512'))
  fails.push('manifest: нужны PNG 192 и 512');
if (!/apple-touch-icon/.test(rd('index.html'))) fails.push('index.html: нет apple-touch-icon');
// модель и воркер согласованы
const mdl = path.join(root, 'assets/ner/ner-v2.bin');
if (!fs.existsSync(mdl) || fs.statSync(mdl).size < 1e6) fails.push('Нет файла модели assets/ner/ner-v2.bin');
if (!/ner\/ner-v2\.bin/.test(rd('assets/ner-worker.js'))) fails.push('ner-worker.js не ссылается на ner-v2.bin');
if (!/serviceWorker\.register\('sw\.js'\)/.test(rd('assets/app.js')))
  fails.push('app.js не регистрирует Service Worker');
if (/assets\/ner\.js/.test(rd('index.html'))) fails.push('index.html: ner.js не должен грузиться в главном потоке');
// тяжёлые файлы предзагрузки, размер модели для индикатора, единый список файлов сайта
const hv = (sw.match(/const HV = \[([^\]]+)\]/) || [, ''])[1].match(/'([^']+)'/g) || [];
if (!hv.length) fails.push('sw.js: нет списка HV (предзагрузка шрифтов и библиотеки)');
for (const f of hv.map((x) => x.slice(1, -1)))
  if (!fs.existsSync(path.join(root, f))) fails.push('sw.js: нет файла ' + f);
for (const f of fs.readdirSync(path.join(root, 'assets/fonts')).filter((x) => x.endsWith('.woff2')))
  if (!hv.includes("'assets/fonts/" + f + "'")) fails.push('sw.js: шрифт ' + f + ' не в списке HV');
const mb = +(rd('assets/ner-worker.js').match(/const MODEL_BYTES = (\d+)/) || [])[1];
if (mb !== fs.statSync(mdl).size)
  fails.push('ner-worker.js: MODEL_BYTES (' + mb + ') не равен размеру модели (' + fs.statSync(mdl).size + ')');
const site = require('../tools/site-files.js'),
  docker = rd('Dockerfile');
for (const f of site.pages) if (!docker.includes(f)) fails.push('Dockerfile не копирует ' + f);
for (const d of site.dirs)
  if (!new RegExp('COPY ' + d + ' ').test(docker)) fails.push('Dockerfile не копирует ' + d + '/');
for (const f of site.pages) if (!fs.existsSync(path.join(root, f))) fails.push('tools/site-files.js: нет файла ' + f);
if (fails.length) {
  console.error('Развёртывание: ОШИБКИ\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log('Развёртывание: ок (версия кэша, предзагрузка, CSP в 4 местах, иконки, модель, Service Worker)');
