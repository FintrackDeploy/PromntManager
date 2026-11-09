// node tests/ner-training.js — проверяет генерацию корпуса и отсутствие утечки между сплитами.
const assert = require('assert/strict');
let buildCorpus;
try {
  ({ buildCorpus } = require('../tools/build-ner-corpus.js'));
} catch (_) {}

assert.equal(typeof buildCorpus, 'function', 'build-ner-corpus exports buildCorpus()');
const a = buildCorpus(),
  b = buildCorpus();
assert.deepEqual(a, b, 'corpus generation is deterministic');
assert.ok(a.train.length >= 500, 'training set is large enough for an experiment');
assert.ok(a.dev.length >= 100, 'dev set exists');
assert.ok(a.holdout.length >= 100, 'holdout set exists');
assert.deepEqual(
  a.templates.train.filter((x) => a.templates.dev.includes(x) || a.templates.holdout.includes(x)),
  [],
  'training templates do not occur in evaluation splits'
);
assert.deepEqual(
  a.templates.dev.filter((x) => a.templates.holdout.includes(x)),
  [],
  'dev and holdout templates are disjoint'
);

function entities(rows) {
  const out = new Set();
  for (const row of rows) {
    assert.equal(typeof row.text, 'string');
    for (const [start, end, type] of row.spans) {
      assert.ok(start >= 0 && end > start && end <= row.text.length, `valid UTF-16 span in: ${row.text}`);
      assert.ok(['PER', 'LOC', 'ORG'].includes(type), `supported entity class: ${type}`);
      out.add(row.text.slice(start, end));
    }
  }
  return out;
}

const trainEntities = entities(a.train),
  devEntities = entities(a.dev),
  holdoutEntities = entities(a.holdout);
for (const x of trainEntities) assert.ok(!devEntities.has(x) && !holdoutEntities.has(x), `no entity leakage: ${x}`);
for (const x of devEntities) assert.ok(!holdoutEntities.has(x), `no dev/holdout entity leakage: ${x}`);
assert.ok(['PER', 'LOC', 'ORG'].every((tag) => a.train.some((row) => row.spans.some((s) => s[2] === tag))));
assert.ok(
  a.train.every((row) => Object.keys(row).sort().join(',') === 'spans,text'),
  'rows match Slovnet JSONL schema'
);
console.log(`NER corpus generator: ok (${a.train.length} train, ${a.dev.length} dev, ${a.holdout.length} holdout)`);
