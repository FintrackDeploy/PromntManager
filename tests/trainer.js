// node tests/trainer.js — кейсы тренажёра: анализатор должен находить каждый заложенный риск, а образец решения проходить проверку.
const A = require('../assets/analyzer.js');
global.T = A.T;
global.analyze = A.analyze;
global.CR = A.CR;
const TR = require('../assets/trainer.js');
let tot = 0,
  miss = 0;
const bad = new Set();
for (let l = 1; l <= 3; l++)
  for (let n = 0; n < 300; n++) {
    const c = TR.gen(l),
      text = c.parts.map((p) => p[0]).join(''),
      r = A.analyze(text);
    let pos = 0;
    for (const p of c.parts) {
      const s = pos,
        e = pos + p[0].length;
      pos = e;
      if (!p[1]) continue;
      tot++;
      if (!r.f.some((x) => x.s < e && x.e > s)) {
        miss++;
        bad.add(`L${l} ${p[1]}: «${p[0].trim()}»`);
      }
    }
    const ex = TR.exemplar(c),
      rr = A.analyze(ex);
    if (rr.f.some((x) => ['C1', 'C3', 'C4', 'C7'].includes(x.cat)) || rr.cats.has('C8') || !c.keep.test(ex))
      bad.add(`образец L${l}: ${ex}`);
  }
console.log(`Тренажёр: заложено рисков ${tot}, анализатор не нашёл ${miss}`);
if (bad.size) {
  console.error([...bad].slice(0, 8).join('\n'));
  process.exit(1);
}
