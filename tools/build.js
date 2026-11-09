// node tools/build.js: собирает папку dist/ со всеми файлами сайта (и только с ними). Используется в CI для публикации.
const fs = require('fs'),
  path = require('path'),
  site = require('./site-files.js');
const root = path.join(__dirname, '..'),
  out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const f of [...site.pages, ...site.hosting]) fs.copyFileSync(path.join(root, f), path.join(out, f));
for (const d of site.dirs) fs.cpSync(path.join(root, d), path.join(out, d), { recursive: true });
console.log('dist/ собран: ' + [...site.pages, ...site.hosting, ...site.dirs.map((d) => d + '/')].join(', '));
