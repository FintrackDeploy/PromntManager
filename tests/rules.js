// node tests/rules.js — проверка assets/rules.json (данные, которые правят методисты): структура, регулярные выражения,
// дубликаты и соответствие собранному assets/rules.js.
const fs = require('fs'),
  path = require('path'),
  cp = require('child_process');
const root = path.join(__dirname, '..');
const R = JSON.parse(fs.readFileSync(path.join(root, 'assets/rules.json'), 'utf8')),
  fails = [];
const chk = (c, m) => c || fails.push(m);

chk(R.schema === 1, 'rules.json: неизвестная версия схемы');
chk(/^\d+\.\d+\.\d+$/.test(R.rules_version), 'rules.json: rules_version должен иметь вид 1.2.3');
chk(/^\d{4}-\d{2}-\d{2}$/.test(R.rules_date), 'rules.json: rules_date должен иметь вид ГГГГ-ММ-ДД');
chk(
  R.rules_version === require('../package.json').version,
  'rules.json: rules_version не совпадает с версией в package.json'
);

for (const [k, t] of Object.entries(R.types)) {
  chk(R.criteria[t.criterion], `тип ${k}: неизвестный критерий ${t.criterion}`);
  for (const f of ['title', 'why', 'advice'])
    chk(typeof t[f] === 'string' && t[f].length >= 3, `тип ${k}: пустое поле ${f}`);
  chk(
    t.placeholder === null || (typeof t.placeholder === 'string' && /^\[.+\]$/.test(t.placeholder)),
    `тип ${k}: placeholder должен быть null или «[...]»`
  );
}
for (const [k, l] of Object.entries(R.levels)) {
  chk(/^#[0-9a-f]{6}$/i.test(l.color), `уровень ${k}: цвет не в формате #rrggbb`);
  chk(l.label && l.text, `уровень ${k}: пустые поля`);
}
chk(
  Object.keys(R.levels).join() === 'critical,high,review,none',
  'levels: ожидается порядок critical, high, review, none'
);
chk(R.cases.length >= 8 && R.cases.every((c) => c.title && c.text), 'cases: нужно не менее 8 заполненных примеров');

for (const [k, list] of Object.entries(R.dict)) {
  chk(Array.isArray(list) && list.length > 0, `dict.${k}: должен быть непустым массивом`);
  const seen = new Set();
  for (const w of list) {
    chk(typeof w === 'string' && w.trim() === w && w.length > 0, `dict.${k}: пустой элемент или лишние пробелы «${w}»`);
    chk(!seen.has(w), `dict.${k}: дубликат «${w}»`);
    seen.add(w);
    try {
      new RegExp(w, 'iu');
    } catch (e) {
      fails.push(`dict.${k}: некорректное регулярное выражение «${w}»`);
    }
  }
}
// Типы из rules.json должны использоваться анализатором, а типы анализатора — быть описаны.
const A = require('../assets/analyzer.js');
const used = new Set();
for (const t of ['Иван Петров, паспорт MC1234567, ivan@mail.ru, +375 29 123-45-67'])
  for (const f of A.analyze(t).f) used.add(f.ty);
chk(
  [...used].every((u) => R.types[u]),
  'анализатор вернул тип, которого нет в rules.json'
);

const b = cp.spawnSync(process.execPath, [path.join(root, 'tools/build-rules.js'), '--check'], { encoding: 'utf8' });
chk(b.status === 0, 'assets/rules.js не соответствует rules.json: выполните npm run build:rules');

if (fails.length) {
  console.error('rules.json: ОШИБКИ\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log(
  `rules.json: ок (версия ${R.rules_version}, ${Object.keys(R.types).length} типов, ${Object.keys(R.dict).length} словарей, rules.js синхронен)`
);
