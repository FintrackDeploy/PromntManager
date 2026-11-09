// node tests/all.js — запускает все проверки подряд и печатает сводку (в отличие от цепочки &&, не останавливается на первой ошибке).
const { spawnSync } = require('child_process'),
  path = require('path');
const T = [
  ['данные правил (rules.json)', 'rules.js'],
  ['метрики и приватность', 'run.js'],
  ['нейросеть (сверка с Natasha)', 'ner.js'],
  ['тренажёр', 'trainer.js'],
  ['независимый набор', 'holdout.js'],
  ['слепой набор', 'holdout.js', 'blind.json'],
  ['дополнительный набор', 'extra.js'],
  ['регрессия 1.6', 'regress.js'],
  ['имена и языки (ru/be/en)', 'names.js'],
  ['устойчивость к искажениям', 'fuzz.js'],
  ['детекторы', 'detect.js'],
  ['широкий прогон', 'sweep.js'],
  ['официальные кейсы КОИ', 'koi.js'],
  ['время работы', 'perf.js'],
  ['Service Worker', 'sw.js'],
  ['развёртывание', 'deploy.js']
];
const res = [];
for (const [name, ...args] of T) {
  const p = spawnSync(process.execPath, [path.join(__dirname, args[0]), ...args.slice(1)], { encoding: 'utf8' });
  process.stdout.write(p.stdout || '');
  if (p.status) process.stdout.write(p.stderr || '');
  res.push([name, p.status === 0]);
}
console.log('\nСводка: ' + res.filter((r) => r[1]).length + ' из ' + res.length + ' проверок пройдено');
for (const [n, ok] of res) if (!ok) console.log('  ПРОВАЛ: ' + n);
process.exit(res.every((r) => r[1]) ? 0 : 1);
