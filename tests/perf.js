// node tests/perf.js — бюджет времени: правила не должны «подвисать» на враждебных входах максимальной длины (10 000 символов).
const A = require('../assets/analyzer.js');
global.T = A.T;
const n = 10000,
  rep = (s, k) => s.repeat(Math.ceil(k / s.length)).slice(0, k);
const C = {
  'a.a.a.': rep('a.', n),
  'x@a.a.a.': 'x@' + rep('a.', n),
  цифры: rep('1', n),
  'цифры через пробел': rep('1 ', n),
  'pass + токен': 'pass ' + rep('a1', n),
  'ул.': rep('ул. ', n),
  'Ул Ул': rep('Ул Ул ', n),
  'Минск, А': rep('Минск, А ', n),
  Заглавные: rep('Аб Вг Де ', n),
  имена: rep('Иван Петров ', n),
  'телефон 1': rep('телефон 1 ', n),
  '1-2-3': rep('1-2-3-', n),
  '@@@': rep('@', n),
  'sk-': rep('sk-', n),
  'ИНН 1': rep('ИНН 1 ', n),
  'ученик А': rep('ученик А ', n),
  'токен в ссылке': rep('https://x.by/?token=', n),
  невидимые: rep('a\u200b', n),
  'широкие цифры': rep('１', n),
  смесь: rep('aа', n)
};
const LIMIT = +process.env.PERF_LIMIT_MS || 400;
let worst = ['', 0];
const bad = [];
for (const [k, v] of Object.entries(C)) {
  const t = Date.now();
  A.analyze(v);
  const d = Date.now() - t;
  if (d > worst[1]) worst = [k, d];
  if (d > LIMIT) bad.push(`${k}: ${d} мс`);
}
console.log(`Время правил на 10 000 символов: худший случай «${worst[0]}» ${worst[1]} мс (лимит ${LIMIT} мс)`);
if (bad.length) {
  console.error('Слишком медленно: ' + bad.join('; '));
  process.exit(1);
}
