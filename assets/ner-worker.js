'use strict';
// Нейросеть работает в отдельном потоке, чтобы интерфейс не зависал на длинных текстах.
// Сеть здесь используется один раз: прочитать файл модели с того же сайта. Текст пользователя в сеть не передаётся.
importScripts('rules.js', 'analyzer.js', 'ner.js');
const NER = BP.NER;
// Размер файла модели в байтах (проверяется tests/deploy.js). Нужен для индикатора загрузки: при сжатии на сервере
// заголовок Content-Length показывает размер сжатых данных, а читаем мы уже распакованные.
const MODEL_BYTES = 9092267;
let job = null,
  busy = false;

async function load() {
  const r = await fetch('ner/ner-v2.bin');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const total = MODEL_BYTES;
  let buf;
  if (r.body) {
    const rd = r.body.getReader(),
      parts = [];
    let got = 0;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      parts.push(value);
      got += value.length;
      postMessage({ type: 'progress', loaded: Math.min(got, total * 0.99), total });
    }
    buf = new Uint8Array(got);
    let o = 0;
    for (const p of parts) {
      buf.set(p, o);
      o += p.length;
    }
  } else {
    buf = new Uint8Array(await r.arrayBuffer());
  }
  NER.init(buf);
}

function work() {
  if (!job) return;
  const j = job;
  job = null;
  busy = true;
  let f = null;
  try {
    f = NER.findings(j.text);
  } catch (e) {
    f = null;
  }
  busy = false;
  postMessage({ type: 'found', id: j.id, findings: f });
}

onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    try {
      await load();
      postMessage({ type: 'ready' });
    } catch (x) {
      postMessage({ type: 'error', message: String((x && x.message) || x) });
    }
  } else if (m.type === 'find') {
    // Если запросы идут быстрее, чем считает модель, считаем только последний: остальные пропускаем.
    if (job) postMessage({ type: 'skip', id: job.id });
    job = m;
    if (!busy) setTimeout(work, 0);
  }
};
