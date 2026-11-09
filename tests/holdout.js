// node tests/holdout.js — независимый набор: полнота и точность по критериям (правила и правила + нейросеть).
const fs = require('fs'),
  path = require('path');
const A = require('../assets/analyzer.js');
global.T = A.T;
const NER = require('../assets/ner.js');
require('./load-ner.js')(NER);
const D = JSON.parse(
    fs.readFileSync(path.join(__dirname, process.argv.find((a) => a.endsWith('.json')) || 'holdout.json'), 'utf8')
  ),
  C = ['C1', 'C2', 'C3', 'C4', 'C7', 'C8'];
function ev(nn, show) {
  let tp = 0,
    fp = 0,
    fn = 0;
  const bad = [];
  for (const x of D) {
    const r = A.analyze(x.text, undefined, nn ? NER.findings(x.text) : null),
      g = C.filter((c) => r.cats.has(c)),
      e = x.cats.filter((c) => C.includes(c));
    g.forEach((c) => (e.includes(c) ? tp++ : (fp++, bad.push(`${x.id} лишний ${c}`))));
    e.forEach((c) => g.includes(c) || (fn++, bad.push(`${x.id} пропущен ${c}`)));
  }
  if (show) console.log(bad.join(' | '));
  return { P: tp / (tp + fp || 1), R: tp / (tp + fn || 1), tp, fp, fn };
}
const f = (n) => (n * 100).toFixed(0) + '%',
  a = ev(false),
  b = ev(true, process.argv[2] === '-v');
console.log(
  `Независимый набор (${D.length}): правила точность ${f(a.P)} полнота ${f(a.R)} | с нейросетью точность ${f(b.P)} полнота ${f(b.R)} (tp ${b.tp}, fp ${b.fp}, fn ${b.fn})`
);
if (b.R < 0.9 || b.P < 0.9) {
  process.exitCode = 1;
}
