// node tests/run.js — метрики по критериям (правила и правила + нейросеть) и проверки приватности кода.
const fs = require('fs'),
  path = require('path');
const A = require('../assets/analyzer.js');
global.T = A.T;
const NER = require('../assets/ner.js');
require('./load-ner.js')(NER);
const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_prompts.json'), 'utf8')),
  cats = ['C1', 'C2', 'C3', 'C4', 'C5', 'C7', 'C8'],
  fails = [];
function ev(nn) {
  const st = {};
  cats.forEach((c) => (st[c] = { tp: 0, fp: 0, fn: 0 }));
  let lvl = 0;
  const safe = [];
  for (const x of D) {
    const r = A.analyze(x.text, undefined, nn ? NER.findings(x.text) : null);
    for (const c of cats) {
      const g = r.cats.has(c),
        e = x.ideal_categories.includes(c);
      if (g && e) st[c].tp++;
      else if (g) st[c].fp++;
      else if (e) st[c].fn++;
    }
    if (r.level === x.ideal_level) lvl++;
    if (x.group === 'безопасный' && r.level !== 'none') safe.push(x.id);
  }
  let TP = 0,
    FP = 0,
    FN = 0;
  for (const c of cats) {
    TP += st[c].tp;
    FP += st[c].fp;
    FN += st[c].fn;
  }
  return { st, lvl, safe, P: TP / (TP + FP || 1), R: TP / (TP + FN || 1) };
}
const a = ev(false),
  b = ev(true),
  f = (n) => (n * 100).toFixed(0) + '%',
  pr = (s) => f(s.tp / (s.tp + s.fp || 1)) + ' / ' + f(s.tp / (s.tp + s.fn || 1));
console.log('Критерий  Правила (точн./полн.)  Правила + нейросеть');
for (const c of cats) console.log(c.padEnd(10) + pr(a.st[c]).padEnd(22) + pr(b.st[c]));
console.log(
  `Итого: правила ${f(a.P)}/${f(a.R)}, уровень ${a.lvl}/${D.length}; с нейросетью ${f(b.P)}/${f(b.R)}, уровень ${b.lvl}/${D.length}`
);
if (a.safe.length || b.safe.length)
  console.log('Ложная тревога на безопасных: правила', a.safe.join(',') || '-', 'нейросеть', b.safe.join(',') || '-');
if (a.R < 0.8) fails.push('Полнота правил ниже 80%');
if (b.R < a.R - 0.001) fails.push('Нейросеть снизила полноту');
if (b.safe.length) fails.push('Нейросеть дала ложную тревогу на безопасном: ' + b.safe.join(','));
const ban = /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB)\b|document\.cookie/;
for (const fn of ['analyzer.js', 'ner.js', 'app.js', 'trainer.js'])
  if (ban.test(fs.readFileSync(path.join(__dirname, '..', 'assets', fn), 'utf8')))
    fails.push('Запрещённый API в ' + fn);
{
  // Воркер может читать только файл модели с того же сайта: один вызов fetch с литеральным относительным путём, без отправки данных.
  const w = fs.readFileSync(path.join(__dirname, '..', 'assets', 'ner-worker.js'), 'utf8'),
    calls = w.match(/\bfetch\s*\(([^)]*)\)/g) || [];
  if (calls.length !== 1 || calls[0].replace(/\s/g, '') !== "fetch('ner/ner-v2.bin')")
    fails.push("ner-worker.js: допустим единственный fetch('ner/ner-v2.bin'), найдено: " + calls.join(' | '));
  if (ban.test(w.replace(/\bfetch\s*\([^)]*\)/g, ''))) fails.push('Запрещённый API в ner-worker.js');
  if (/method\s*:|body\s*:/.test(w)) fails.push('ner-worker.js: запрос не должен ничего отправлять');
  const app = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8'),
    wk = app.match(/new Worker\(([^)]*)\)/g) || [];
  if (wk.length !== 1 || !/assets\/ner-worker\.js/.test(wk[0]))
    fails.push('app.js: допустим единственный Worker assets/ner-worker.js');
}
const walk = (d) =>
  fs
    .readdirSync(d, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? ['vendor', 'fonts', 'ner'].includes(e.name)
          ? []
          : walk(path.join(d, e.name))
        : [path.join(d, e.name)]
    );
const root = path.join(__dirname, '..');
for (const fp of [...walk(path.join(root, 'assets')), path.join(root, 'index.html')].filter((x) =>
  /\.(html|css|js)$/.test(x)
)) {
  const s = fs.readFileSync(fp, 'utf8'),
    m = s.match(/https?:\/\/(?!www\.w3\.org)[^\s"')]+/g);
  if (m) fails.push('Внешняя ссылка в ' + path.relative(root, fp) + ': ' + m[0]);
  if (fp.endsWith('.html') && /\sstyle="/.test(s)) fails.push('Inline-стиль в ' + path.relative(root, fp));
}
if (fails.length) {
  console.error('\nОШИБКИ:\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log('Приватность кода: ок (нет сети, хранилищ, внешних ссылок и inline-стилей)');
