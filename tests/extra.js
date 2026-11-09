// node tests/extra.js — дополнительный набор (tests/extra.json): новые примеры, не использовавшиеся при подборе правил,
// плюс проверка безопасной редакции: после замен анализатор не должен находить в тексте новых рисков.
// Набор составлял разработчик, поэтому это не независимая оценка (см. README, раздел «Качество»).
const fs = require('fs'),
  path = require('path');
const A = require('../assets/analyzer.js');
global.T = A.T;
const NER = require('../assets/ner.js');
require('./load-ner.js')(NER);
const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'extra.json'), 'utf8')),
  fails = [];
let tp = 0,
  fp = 0,
  fn = 0,
  catMiss = 0;
for (const x of D) {
  const r = A.analyze(x.text, undefined, NER.findings(x.text)),
    hit = r.level !== 'none';
  if (hit && x.flag) tp++;
  else if (hit) {
    fp++;
    fails.push('Ложное срабатывание [' + r.level + ']: ' + x.text);
  } else if (x.flag) {
    fn++;
    fails.push('Пропуск: ' + x.text);
  }
  for (const c of x.cats) if (!r.cats.has(c)) (catMiss++, fails.push('Нет критерия ' + c + ': ' + x.text));
  // Тревожные признаки (CRISIS) редакцией не убираются: их нужно показывать человеку, а не скрывать.
  if (hit && !r.f.some((f) => f.ty === 'CRISIS')) {
    const safe = A.safeText(x.text, r.f),
      r2 = A.analyze(safe, undefined, NER.findings(safe));
    // Допустимо «review» (например, остался контекст), но «high» и выше после редакции означают утечку.
    if (['high', 'critical'].includes(r2.level))
      fails.push('Безопасная редакция всё ещё рискованна [' + r2.level + ']: ' + safe);
  }
}
console.log(
  `Дополнительный набор (${D.length}): найдено ${tp}, ложных ${fp}, пропусков ${fn}, не хватает критериев ${catMiss}`
);
if (fails.length) {
  console.error('ОШИБКИ:\n  ' + fails.join('\n  '));
  process.exit(1);
}
