// node tests/ner.js — сверка JS-версии нейросети с эталоном Natasha (Python).
const fs = require('fs'),
  path = require('path');
global.T = { NAME: ['C1'], LOC: ['C2'], ORG: ['C2'] };
const NER = require('../assets/ner.js');
require('./load-ner.js')(NER);
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'ner_reference.json'), 'utf8'));
let tot = 0,
  hit = 0,
  extra = 0;
for (const r of ref) {
  const g = NER.spans(r.text).map((x) => x.join('|')),
    e = r.spans.map((x) => x.join('|'));
  e.forEach((s) => {
    tot++;
    if (g.includes(s)) hit++;
  });
  extra += g.filter((s) => !e.includes(s)).length;
}
console.log(`Сверка с Natasha: найдено ${hit} из ${tot} эталонных сущностей, лишних ${extra}`);
if (hit / tot < 0.9) {
  console.error('Совпадение ниже 90%');
  process.exit(1);
}
const kept = ref.reduce((n, r) => n + r.spans.filter((s) => NER.findings(r.text).some((f) => f.s === s[0] && f.e === s[1])).length, 0);
const leaked = [];
for (const r of ref)
  for (const f of NER.findings(r.text)) {
    const w = f.txt.split(/\s+/)[0].toLowerCase();
    if (
      'составь объясни напиши подготовь позвони сравни реши сделай расскажи передай передайте загрузи отправь вставь'.split(' ').includes(w)
    )
      leaked.push(f.txt);
  }
const order = 'Передай Святославу Кондратьеву пакет с характеристикой.';
const ord = NER.findings(order);
if (ord.some((f) => /^передай/i.test(f.txt))) leaked.push(ord.map((f) => f.txt).join(' | '));
if (!ord.some((f) => /Кондратьев/i.test(f.txt))) leaked.push('нет фамилии Кондратьев');
console.log(`После фильтра команд: сохранено ${kept} из ${tot} эталонных сущностей`);
if (leaked.length) {
  console.error('Команда прошла как сущность: ' + leaked.join(' | '));
  process.exit(1);
}
