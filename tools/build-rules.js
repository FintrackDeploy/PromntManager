// node tools/build-rules.js — собирает assets/rules.js из assets/rules.json.
// rules.json — единственный источник данных для проверки (его правят методисты); rules.js нужен браузеру и воркеру:
// из него данные читаются тегом <script> без сетевых запросов, поэтому работает и при открытии файла с диска (file://).
const fs = require('fs'),
  path = require('path');
const dir = path.join(__dirname, '..', 'assets');
const json = JSON.parse(fs.readFileSync(path.join(dir, 'rules.json'), 'utf8'));
const out =
  '// Сгенерировано из rules.json командой `npm run build:rules`. Не править вручную.\n' +
  'globalThis.BP = Object.assign(globalThis.BP || {}, { rules: ' +
  JSON.stringify(json) +
  ' });\n';
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(path.join(dir, 'rules.js')) ? fs.readFileSync(path.join(dir, 'rules.js'), 'utf8') : '';
  if (cur !== out) {
    console.error('assets/rules.js не соответствует rules.json: выполните npm run build:rules');
    process.exit(1);
  }
  console.log('rules.js соответствует rules.json');
} else {
  fs.writeFileSync(path.join(dir, 'rules.js'), out);
  console.log('rules.js собран (' + out.length + ' байт)');
}
