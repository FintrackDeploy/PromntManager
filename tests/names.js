// node tests/names.js [файл.json] [-v] — имена и языки: сравнивает «только правила» и «правила + нейросеть» на tests/names.json
// (русский, белорусский, английский; опасные запросы и безопасные «ловушки» вроде «Надежда на лучшее»).
// Набор составлен разработчиком после аудита 1.6 и не использовался при написании исходных правил.
const fs = require('fs'),
  path = require('path');
const A = require('../assets/analyzer.js');
const NER = require('../assets/ner.js');
require('./load-ner.js')(NER);
const one = process.argv.find((a) => a.endsWith('.json'));
const D = (one ? [one] : ['names.json', 'names_blind.json']).flatMap((f) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'))
);
const verbose = process.argv.includes('-v');
const MIN = { ru: 0.9, be: 0.85, en: 0.85 }; // минимальные доли верных ответов на язык (правила + нейросеть)
const res = {},
  nm = {}; // доля найденных именно имён (а не любых признаков) по языкам
const fails = [];
for (const x of D) {
  for (const mode of ['rules', 'nn']) {
    const r = A.analyze(x.text, undefined, mode === 'nn' ? NER.findings(x.text) : null),
      hit = r.level !== 'none',
      o = ((res[x.lang] = res[x.lang] || {})[mode] = res[x.lang][mode] || { tp: 0, fp: 0, fn: 0, tn: 0 });
    if (x.flag && x.name) {
      const q = (nm[x.lang] = nm[x.lang] || { rules: [0, 0], nn: [0, 0] })[mode];
      q[1]++;
      if (
        r.f.some((f) => f.cat === 'C1' && ['NAME'].includes(f.ty) && f.txt.toLowerCase().includes(x.name.toLowerCase()))
      )
        q[0]++;
      else verbose && console.log(`  ИМЯ НЕ НАЙДЕНО [${mode}] «${x.name}» в: ${x.text}`);
    }
    if (hit && x.flag) o.tp++;
    else if (hit) (o.fp++, verbose && console.log(`  ЛОЖНО [${mode}] ${x.text}`));
    else if (x.flag) (o.fn++, verbose && console.log(`  ПРОПУСК [${mode}] ${x.text}`));
    else o.tn++;
  }
}
for (const [lang, m] of Object.entries(res)) {
  const row = (o) => {
    const n = o.tp + o.fp + o.fn + o.tn;
    return {
      p: o.tp + o.fp ? o.tp / (o.tp + o.fp) : 1,
      r: o.tp + o.fn ? o.tp / (o.tp + o.fn) : 1,
      acc: (o.tp + o.tn) / n,
      ...o
    };
  };
  const a = row(m.rules),
    b = row(m.nn),
    pc = (v) => Math.round(v * 100) + '%';
  console.log(
    `${lang}: правила точн. ${pc(a.p)} полн. ${pc(a.r)} (ложных ${a.fp}, пропусков ${a.fn}) | +нейросеть точн. ${pc(b.p)} полн. ${pc(b.r)} (ложных ${b.fp}, пропусков ${b.fn})`
  );
  if (a.acc < MIN[lang]) fails.push(`${lang}: только правила, верных ответов ${pc(a.acc)} < ${pc(MIN[lang])}`);
  if (b.acc < MIN[lang]) fails.push(`${lang}: правила + нейросеть, верных ответов ${pc(b.acc)} < ${pc(MIN[lang])}`);
}
for (const [lang, q] of Object.entries(nm)) {
  const pc = (a) => Math.round((100 * a[0]) / a[1]) + '% (' + a[0] + ' из ' + a[1] + ')';
  console.log(`${lang}: имя человека найдено — правила ${pc(q.rules)}, правила + нейросеть ${pc(q.nn)}`);
  if (q.nn[0] / q.nn[1] < 0.85) fails.push(`${lang}: имя находится слишком редко с нейросетью`);
  if (q.rules[0] / q.rules[1] < 0.7) fails.push(`${lang}: имя находится слишком редко без нейросети`);
}
if (fails.length) {
  console.error('Имена и языки: ОШИБКИ\n  ' + fails.join('\n  '));
  process.exit(1);
}
