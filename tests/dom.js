// node tests/dom.js — сквозная проверка интерфейса в jsdom (нужен dev-пакет jsdom: npm i -D jsdom).
// Запускает настоящие app.js, trainer.js и ner-worker.js (воркер выполняется в изолированном vm с теми же сообщениями, что в браузере).
let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (e) {
  console.error('Нужен jsdom: npm i -D jsdom');
  process.exit(2);
}
const fs = require('fs'),
  path = require('path'),
  vm = require('vm'),
  root = path.join(__dirname, '..'),
  A = (f) => path.join(root, 'assets', f),
  fails = [];
const ok = (c, m) => {
  if (!c) fails.push(m);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
  url: 'http://localhost/',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const w = dom.window;
w.__xss = 0;
const requests = [];
// Воркер: тот же файл ner-worker.js, fetch читает файл модели с диска и записывается в requests.
w.Worker = class {
  constructor(url) {
    requests.push('worker:' + url);
    const self = this,
      ctx = {
        console,
        setTimeout,
        Uint8Array,
        Float32Array,
        Math,
        JSON,
        Map,
        Set,
        Promise,
        String,
        Array,
        Object,
        Error,
        Number,
        TextDecoder
      };
    ctx.postMessage = (m) => setTimeout(() => self.onmessage && self.onmessage({ data: m }), 0);
    ctx.importScripts = (...f) =>
      f.forEach((x) => vm.runInContext(fs.readFileSync(A(x), 'utf8'), ctx, { filename: x }));
    ctx.fetch = async (u) => {
      requests.push('fetch:' + u);
      const b = fs.readFileSync(A(u));
      return {
        ok: true,
        status: 200,
        headers: { get: () => String(b.length) },
        body: null,
        arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length)
      };
    };
    vm.createContext(ctx);
    this.ctx = ctx;
    vm.runInContext(fs.readFileSync(A('ner-worker.js'), 'utf8'), ctx, { filename: 'ner-worker.js' });
  }
  postMessage(m) {
    setTimeout(() => this.ctx.onmessage({ data: m }), 0);
  }
  terminate() {}
};
// В jsdom нет event.source у postMessage, на котором строится полифил setImmediate в JSZip (в браузерах он работает).
w.setImmediate = (f, ...a) => setTimeout(f, 0, ...a);
w.clearImmediate = clearTimeout;
// В jsdom у File/Blob нет text() и arrayBuffer(), а в окне нет TextDecoder (в браузерах всё это есть).
w.TextDecoder = TextDecoder;
w.Blob.prototype.arrayBuffer = w.File.prototype.arrayBuffer = function () {
  return new Promise((res, rej) => {
    const r = new w.FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsArrayBuffer(this);
  });
};
w.Blob.prototype.text = w.File.prototype.text = function () {
  return this.arrayBuffer().then((b) => new TextDecoder().decode(b));
};
w.HTMLElement.prototype.scrollIntoView = () => {};
w.scrollTo = () => {};
// Скрипты выполняются по отдельности, как отдельные теги <script>, и могут общаться только через BP.
const keysBefore = new Set(Object.getOwnPropertyNames(w));
for (const f of ['vendor/jszip.min.js', 'rules.js', 'analyzer.js', 'app.js', 'trainer.js'])
  w.eval(fs.readFileSync(A(f), 'utf8'));
const leaked = Object.getOwnPropertyNames(w).filter((k) => !keysBefore.has(k) && !['BP', 'JSZip'].includes(k));
if (leaked.length) {
  console.error('Лишние глобальные переменные: ' + leaked.join(', '));
  process.exit(1);
}
if (!w.BP || !w.BP.analyze || !w.BP.ui || !w.BP.rules || !w.BP.TR) {
  console.error('BP собран не полностью: ' + Object.keys(w.BP || {}).join(','));
  process.exit(1);
}
const $ = (id) => w.document.getElementById(id);
(function () {
  ok($('nns').getAttribute('role') === 'status', 'Статус модели не объявлен как статус для вспомогательных технологий');
  ok(/правила/i.test($('nns').textContent), 'До загрузки модели не объяснено, что правила уже работают');
})();
(async () => {
  // 1. нейросеть загрузилась в воркере
  for (let i = 0; i < 200 && !/готова/.test($('nns').textContent); i++) await sleep(100);
  ok(/готова/.test($('nns').textContent), 'Нейросеть не загрузилась: ' + $('nns').textContent);
  ok($('nns').getAttribute('aria-live') === 'polite', 'Статус модели не объявлен через aria-live');
  ok(
    requests.filter((r) => r.startsWith('fetch:')).join() === 'fetch:ner/ner-v2.bin',
    'Сетевые запросы воркера: ' + requests.join(',')
  );
  // 2. проверка текста: правила сразу, нейросеть догоняет
  const text =
    'Составь характеристику ученика Алесь Мельнік, 8 «Б» класа гімназіі №4, хварэе на дыябет. Живёт на проспекте Независимости 45, кв. 12. Тел. 29 1234567. Лукашенко подписал указ.';
  $('inp').value = text;
  $('go').click();
  await sleep(50);
  const marks = () => [...$('res').querySelectorAll('.hl mark')].map((m) => m.textContent);
  let m = marks();
  ok(
    m.some((x) => /Мельнік/.test(x)),
    'Не найдено имя «Мельнік» целиком: ' + m.join(' | ')
  );
  ok(
    m.some((x) => /Независимости 45/.test(x)),
    'Не найден адрес в предложном падеже'
  );
  ok(
    m.some((x) => /29 1234567/.test(x)),
    'Не найден телефон без кода'
  );
  ok(
    m.some((x) => /дыябет/.test(x)),
    'Не найдено здоровье на белорусском'
  );
  ok(!m.some((x) => /Лукашенко/.test(x)), '«Лукашенко» помечен как частное лицо');
  ok(
    /Мельн\]|\[/.test($('res').querySelector('.safe').textContent) &&
      !/ік[\s,.]/.test($('res').querySelector('.safe').textContent),
    'В безопасном варианте остался хвост фамилии'
  );
  $('inp').value = 'Вымышленный пример: ученик Алексей Смирнов из школы №12 в Минске болеет астмой.';
  $('go').click();
  await sleep(400);
  ok(
    /Пометка «вымышленный» не подтверждает/.test($('res').textContent),
    'Не объяснено, почему анализируются помеченные вымышленными данные'
  );
  // 2б. модель включена автоматически: правила дают результат сразу, модель дополняет его без мерцания уровня
  {
    const sl = w.BP.ui.stableLevel;
    ok(sl('review', 'high', true) === 'high', 'stableLevel: при ожидании нейросети уровень не должен падать');
    ok(sl('critical', 'high', true) === 'critical', 'stableLevel: более высокий уровень правил должен сохраняться');
    ok(sl('review', 'high', false) === 'review', 'stableLevel: без ожидания показывается фактический уровень');
    ok(sl('none', null, true) === 'none', 'stableLevel: без подтверждённого уровня ничего не удерживается');
    ok(!$('live') && !$('nn'), 'В интерфейсе остались удалённые переключатели проверки');
    ok(
      requests.filter((r) => r.startsWith('worker:')).length === 1,
      'Локальная модель не запустилась автоматически ровно один раз'
    );
    $('inp').value = 'Ученик Артём Сидоров из 7Б живёт в Гродно, мама работает в ГАИ';
    $('go').click();
    const first = $('res').querySelector('.verdict');
    ok(first, 'Нет вердикта после проверки');
    ok(/предварительно/.test($('res').textContent), 'Нет пометки «предварительно», пока нейросеть проверяет текст');
    for (let i = 0; i < 100 && /предварительно/.test($('res').textContent); i++) await sleep(50);
    ok(!/предварительно/.test($('res').textContent), 'Пометка «предварительно» не исчезла после ответа нейросети');
    ok($('res').getAttribute('aria-busy') === 'false', 'aria-busy не сброшен');
    // Изменение текста не запускает устаревший режим проверки при каждом вводе.
    $('inp').value += ' и сестра Лена';
    $('inp').oninput();
    await sleep(500);
    ok(!$('res').querySelector('.verdict.fresh'), 'Ввод текста запустил проверку без нажатия кнопки');
  }
  // 3. XSS: пользовательский ввод не становится разметкой
  $('inp').value =
    '<img src=x onerror="window.__xss=1"> <script>window.__xss=2</script> Иван Иванов "><svg onload=window.__xss=3>';
  $('go').click();
  await sleep(400);
  ok(
    !$('res').querySelector('.hl img, .hl script, .hl svg, .safe img, .safe script, .safe svg'),
    'Ввод превратился в HTML-элементы'
  );
  ok(w.__xss === 0, 'Выполнился внедрённый код');
  // 4. .docx: основной текст, колонтитул, числовые сущности, защита от распаковки
  const JSZip = require(path.join(root, 'assets/vendor/jszip.min.js'));
  const mk = async (files) => {
    const z = new JSZip();
    for (const [k, v] of Object.entries(files)) z.file(k, v);
    return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  };
  const P = (t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
  let buf = await mk({
    'word/document.xml': `<w:document><w:body>${P('Тело &#1048;ван')}</w:body></w:document>`,
    'word/footer1.xml': `<w:ftr>${P('Колонтитул +375 29 111-22-33')}</w:ftr>`
  });
  // Обработчик вызываем напрямую и ждём его завершения (в jsdom нет настоящего выбора файла).
  const up2 = async (b, name) => {
    const f = new w.File([b], name);
    await $('fl').onchange({ target: { files: [f], value: '' } });
  };
  const up = async (b) => {
    const f = new w.File([b], 'a.docx');
    await $('fl').onchange({ target: { files: [f], value: '' } });
  };
  await up(buf);
  ok(
    /Тело Иван/.test($('inp').value) && /Колонтитул \+375 29 111-22-33/.test($('inp').value),
    'Текст .docx (тело/колонтитул/&#...;) прочитан неверно: ' + $('inp').value.slice(0, 80)
  );
  $('inp').value = '';
  buf = await mk({ 'word/document.xml': '<w:document>' + 'A'.repeat(9e6) + '</w:document>' });
  ok(buf.length < 2e6, 'тестовая «бомба» не сжалась');
  await up(buf);
  ok($('inp').value === '', 'Документ с огромным распакованным размером не должен загружаться');
  // 4а. текстовый файл в windows-1251 (частый случай для старых .txt) читается правильно, а не мусором
  const cp1251 = (str) =>
    Buffer.from(
      [...str].map((c) => {
        const n = c.charCodeAt(0);
        return n >= 0x410 && n <= 0x44f
          ? n - 0x410 + 0xc0
          : n === 0x401
            ? 0xa8
            : n === 0x451
              ? 0xb8
              : n < 128
                ? n
                : 0x3f;
      })
    );
  $('inp').value = '';
  await up2(cp1251('Ученик Иван Петров, диагноз астма'), 'a.txt');
  ok(
    /Ученик Иван Петров, диагноз астма/.test($('inp').value),
    'Файл windows-1251 прочитан неверно: ' + $('inp').value.slice(0, 60)
  );
  ok(
    /нашёл|Иван/.test($('res').textContent) && /Имя или ФИО|Здоровье/.test($('res').textContent),
    'После чтения windows-1251 анализ не нашёл риски'
  );
  // 4б. пояснение «нейросеть ещё проверяет» и «текст обрезан» показываются в вердикте
  $('inp').value = 'x'.repeat(10000);
  $('go').click();
  await sleep(30);
  ok(/первые 10 000 символов/.test($('res').textContent), 'Нет пояснения об обрезке текста');
  // 5. история: переход между разделами добавляет запись, «Назад» возвращает
  const h0 = w.history.length;
  const link = [...w.document.querySelectorAll('#navlinks a')].find(
    (a) => a.getAttribute('href') !== location.hash && /^#/.test(a.getAttribute('href'))
  );
  if (link) {
    link.click();
    await sleep(50);
    ok(w.history.length > h0, 'Переход по разделу не добавил запись в историю');
  }
  // 6. тренажёр ждёт нейросеть и не падает
  ok(!!$('t2chk') && typeof $('t2chk').onclick === 'function', 'Кнопка проверки тренажёра не подключена');
  if (fails.length) {
    console.error('DOM-проверка: ОШИБКИ\n  ' + fails.join('\n  '));
    process.exit(1);
  }
  console.log('DOM-проверка: ок (воркер, поиск, XSS, .docx, история)');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
