// node tests/koi.js — официальные кейсы T01–T08 из положения проекта (КОИ).
const fs = require('fs'),
  path = require('path');
const A = require('../assets/analyzer.js');
const spec = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../КОИ/Проект /rules_and_test_cases_v1.json'), 'utf8')
);
const id = {
  C1_DIRECT_IDENTIFIERS: 'C1',
  C2_INDIRECT_IDENTIFICATION: 'C2',
  C3_HEALTH_AND_PSYCHOLOGICAL: 'C3',
  C4_FAMILY_AND_SOCIAL: 'C4',
  C5_DATA_MINIMIZATION: 'C5',
  C6_EXTERNAL_TRANSFER: 'C6',
  C7_INFORMATION_AND_COPYRIGHT: 'C7',
  C8_RESPONSIBLE_AI_USE: 'C8'
};
const lvl = { no_obvious_high_risk: 'none', review: 'review', high: 'high', critical: 'critical' };
const bad = [];
for (const c of spec.test_cases) {
  const r = A.analyze(c.text),
    want = c.expected_criteria.map((x) => id[x]).sort(),
    got = [...r.cats].sort(),
    level = lvl[c.expected_level];
  if (r.level !== level || want.join() !== got.join())
    bad.push(
      `${c.id}: ожидалось ${level} ${want.join(',') || '—'}, получено ${r.level} ${got.join(',') || '—'} [${r.f.map((x) => x.ty + ':' + x.txt).join(' | ')}]`
    );
}
console.log(`Официальные кейсы КОИ: ${spec.test_cases.length - bad.length} из ${spec.test_cases.length}`);
if (bad.length) {
  console.error(bad.join('\n'));
  process.exit(1);
}
