'use strict';
// Общие функции интерфейса отдаются тренажёру через BP.ui; других глобальных переменных нет.
(function () {
  const { analyze, safeText, placeholders, CASES, CR, T, LV } = BP;
  const $ = (id) => document.getElementById(id),
    esc = (s) =>
      s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let off = new Set();
  // Пока нейросеть проверяет текст, уровень риска не опускается ниже уже подтверждённого.
  const ORD = { none: 0, review: 1, high: 2, critical: 3 };
  const stableLevel = (now, settled, pending) => (pending && settled && ORD[settled] > ORD[now] ? settled : now);
  let settled = null, // последний подтверждённый уровень
    finalFor = null; // текст, для которого нейросеть не ответила: показываем результат правил как окончательный
  const nnPending = (t) => !NN.failed && finalFor !== t && !(NN.ready && NN.cache.has(t));
  function safeHtml(t, fs) {
    let o = '',
      p = 0;
    const ph = placeholders(fs);
    for (const x of [...fs].sort((a, b) => a.s - b.s)) {
      const rp = ph.get(x);
      o +=
        esc(t.slice(p, x.s)) +
        (rp
          ? `<ins title="Было: ${esc(x.txt)}">${esc(rp)}</ins>`
          : `<mark class="keep" title="Требует ручной правки">${esc(x.txt)}</mark>`);
      p = x.e;
    }
    return o + esc(t.slice(p));
  }
  // Пояснения под вердиктом: проверка ещё не закончена или текст проверен не целиком.
  function notes(t, withOff, hasFindings) {
    if (!withOff) return '';
    let h = '';
    if (nnPending(t))
      h += `<p class="sub">${NN.ready ? 'Нейросеть ещё проверяет имена, организации и места: результат может стать строже.' : 'Нейросеть ещё не загружена: имена пока ищут только правила, результат может стать строже.'}</p>`;
    if (hasFindings && /(?:вымышленн\w*|учебн\w*\s+(?:пример|данн\w*)|синтетическ\w*\s+(?:пример|данн\w*))/i.test(t))
      h +=
        '<p class="sub">Пометка «вымышленный» не подтверждает, что данные обезличены: система проверяет сам текст и показывает найденные совпадения.</p>';
    if (t.length >= 10000)
      h += '<p class="sub">Проверены первые 10 000 символов текста: всё, что дальше, не анализировалось.</p>';
    return h;
  }
  const LIM = (BP.rules && BP.rules.limitations) || {};
  function render(t, box, withOff, opt) {
    opt = opt || {};
    const r = analyze(t, opt.clean ? new Set() : off, ext(t)),
      pending = withOff && nnPending(t),
      level = withOff ? stableLevel(r.level, settled, pending) : r.level,
      lv = LV[level],
      n = r.f.length;
    if (withOff) {
      if (!pending) settled = r.level;
      box.setAttribute('aria-busy', pending ? 'true' : 'false');
    }
    const first = !box.querySelector('.verdict');
    const brief = !!(opt && opt.brief);
    let h = '';
    const open = n === 0 || box.dataset.safe === '1';
    h += `<div class="verdict L-${level}${first ? ' fresh' : ''}"><h3>${lv[0]}${pending ? ' <span class="pill pill-blue prov">предварительно</span>' : ''}</h3><p>${lv[2]}</p>${notes(t, withOff, n > 0 || r.warns.length > 0)}</div>`;
    let p = 0,
      x = '';
    for (const m of r.f) {
      const jid = box.id + '-f-' + m.s + '-' + m.e;
      x +=
        esc(t.slice(p, m.s)) +
        `<mark class="m${m.cat[1]}" tabindex="0" role="button" data-jump="${jid}" title="${esc(T[m.ty][1])}">${esc(m.txt)}</mark>`;
      p = m.e;
    }
    h += `<div class="hl">${x + esc(t.slice(p))}</div>`;
    if (!brief) {
      const tools =
        n && box.id === 'res'
          ? '<p class="sub">Жёлтым отмечены замены. Красная рамка значит, что фрагмент нужно поправить вручную. Это не гарантия анонимности.</p><div class="row"><button class="btn btn-quiet" id="cp" type="button">Скопировать</button><button class="btn btn-quiet" id="dl" type="button">Скачать</button><button class="btn btn-quiet" id="pr" type="button">Печать</button></div>'
          : '';
      const safe = `<div class="safe">${n ? safeHtml(t, r.f) : 'Замен не требуется. Проверьте текст сами: анализатор мог пропустить данные.'}</div>${tools}`;
      h += `<button type="button" class="btn btn-primary mk-safe${open ? ' hidden' : ''}">Сформировать более безопасный вариант</button><div class="safe-block${open ? '' : ' shut'}">${safe}</div>`;
      if (n || r.warns.length) {
        h += '<div class="finds">';
        r.warns.forEach((w) => {
          h += `<details class="line"><summary><span class="bdg">${w[0]}</span> ${esc(w[1])}</summary><div class="line-body"><p>${esc(w[2])}</p><p>${esc(w[3])}</p>${LIM[w[0]] ? `<p class="lim">${esc(LIM[w[0]])}</p>` : ''}</div></details>`;
        });
        r.f.forEach((m) => {
          const i = T[m.ty],
            jid = box.id + '-f-' + m.s + '-' + m.e;
          h += `<details class="line" data-fid="${jid}"><summary><span class="bdg">${m.cat}</span> ${esc(i[1])}</summary><div class="line-body"><p><q>${esc(m.txt)}</q></p><p>${esc(i[2])}</p><p>${esc(i[3])}</p>${LIM[m.cat] ? `<p class="lim">${esc(LIM[m.cat])}</p>` : ''}<p class="src">${esc(m.src || 'правила')} · ${esc(m.conf)}</p>${withOff ? `<button class="btn btn-quiet sm" type="button" data-off="${m.s}-${m.e}">Это не риск</button>` : ''}</div></details>`;
        });
        h += '</div>';
      }
    }
    box.innerHTML = h;
    return r;
  }
  function run(keep) {
    if (!keep) settled = null;
    const t = $('inp').value;
    if (!t.trim()) {
      $('res').innerHTML = '<p class="sub">Введите текст запроса.</p>';
      return;
    }
    const r = render(t, $('res'), true);
    kickNn(t);
    const dl = $('dl');
    if (dl)
      dl.onclick = () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([safeText(t, r.f)], { type: 'text/plain;charset=utf-8' }));
        a.download = 'bezopasnyj-prompt.txt';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
      };
    const pr = $('pr');
    if (pr) pr.onclick = () => window.print();
    const cp = $('cp');
    if (cp)
      cp.onclick = () =>
        navigator.clipboard
          ? navigator.clipboard.writeText(safeText(t, r.f)).then(
              () => toast('Скопировано'),
              () => toast('Не удалось скопировать', 1)
            )
          : toast('Копирование недоступно', 1);
  }
  function onBox(e) {
    const box = e.currentTarget;
    const k = e.target.dataset && e.target.dataset.off;
    if (k && box.id === 'res') {
      off.add(k);
      run();
      return;
    }
    if (e.target.closest('.mk-safe')) {
      box.dataset.safe = '1';
      const b = box.querySelector('.mk-safe');
      if (b) b.classList.add('hidden');
      const s = box.querySelector('.safe-block');
      if (s) s.classList.remove('shut');
      return;
    }
    const jump = e.target.closest('[data-jump]');
    if (!jump) return;
    const el = box.querySelector('[data-fid="' + jump.getAttribute('data-jump') + '"]');
    if (!el) return;
    const d = el.closest('details');
    if (d) d.open = true;
    el.scrollIntoView({ block: 'nearest' });
  }
  $('go').onclick = () => {
    off = new Set();
    $('res').dataset.safe = '';
    run();
  };
  $('res').onclick = onBox;
  $('desk').onclick = onBox;
  const jumpKey = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-jump]')) {
      e.preventDefault();
      e.target.click();
    }
  };
  $('res').onkeydown = jumpKey;
  $('desk').onkeydown = jumpKey;
  $('clr').onclick = () => {
    $('inp').value = '';
    $('res').innerHTML = '';
    $('res').dataset.safe = '';
    off = new Set();
    $('cnt').textContent = '0 / 10000';
  };
  $('inp').oninput = () => {
    $('cnt').textContent = $('inp').value.length + ' / 10000';
  };
  $('inp').onkeydown = (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      off = new Set();
      run();
    }
  };
  function toast(m, err) {
    const d = document.createElement('div');
    d.className = 'toast' + (err ? ' err' : '');
    d.textContent = m;
    $('tw').appendChild(d);
    setTimeout(() => d.remove(), 3500);
  }
  const cp = (n) => {
    try {
      return String.fromCodePoint(n);
    } catch (e) {
      return '';
    }
  };
  const xmlText = (x) =>
    x
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<w:(?:br|cr)\/>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&#x([0-9a-f]+);/gi, (m, h) => cp(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (m, d) => cp(+d))
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  const UNZIP_LIMIT = 8e6;
  function unzipEntry(entry, budget) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let n = 0,
        stopped = false;
      const h = entry.internalStream('uint8array');
      h.on('data', (c) => {
        if (stopped) return;
        n += c.length;
        if (n > budget) {
          stopped = true;
          h.pause();
          reject(new Error('Документ слишком большой после распаковки'));
          return;
        }
        chunks.push(c);
      })
        .on('error', reject)
        .on('end', () => {
          if (stopped) return;
          const all = new Uint8Array(n);
          let o = 0;
          for (const c of chunks) {
            all.set(c, o);
            o += c.length;
          }
          resolve({ text: new TextDecoder('utf-8').decode(all), size: n });
        });
      h.resume();
    });
  }
  // Текстовые файлы бывают не только в UTF-8: старые .txt из Windows чаще всего в windows-1251, иногда UTF-16.
  // Если читать их как UTF-8, получится мусор, и анализатор «ничего не найдёт».
  function decodeText(buf) {
    const u = new Uint8Array(buf);
    if (u[0] === 0xff && u[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(u), enc: 'UTF-16' };
    if (u[0] === 0xfe && u[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(u), enc: 'UTF-16' };
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(u), enc: 'UTF-8' };
    } catch (e) {
      return { text: new TextDecoder('windows-1251').decode(u), enc: 'Windows-1251' };
    }
  }
  async function readFile(f) {
    if (f.size > 2e6) throw new Error('Файл больше 2 МБ');
    if (/\.(txt|md|csv)$/i.test(f.name)) {
      const d = decodeText(await f.arrayBuffer());
      if (d.enc !== 'UTF-8') toast('Кодировка файла: ' + d.enc);
      return d.text;
    }
    if (/\.docx$/i.test(f.name)) {
      const z = await JSZip.loadAsync(await f.arrayBuffer());
      // Основной текст, колонтитулы, сноски и комментарии: в них тоже бывают персональные данные.
      const names = Object.keys(z.files).filter((k) =>
        /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/.test(k)
      );
      if (!names.includes('word/document.xml')) throw new Error('Не удалось прочитать .docx');
      // Защита от «бомбы»: распаковываем потоком и обрываем, как только суммарный размер превысил лимит.
      // (Заявленный в архиве размер можно подделать, поэтому считаем реально распакованные байты.)
      let left = UNZIP_LIMIT;
      const parts = [];
      for (const k of names) {
        const r = await unzipEntry(z.file(k), left);
        left -= r.size;
        parts.push(xmlText(r.text));
      }
      return parts.join('\n');
    }
    throw new Error('Поддерживаются файлы .txt, .md, .csv и .docx');
  }
  $('up').onclick = () => $('fl').click();
  $('fl').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      let t = await readFile(f);
      if (t.length > 10000) {
        t = t.slice(0, 10000);
        toast('Текст обрезан до 10 000 символов');
      }
      $('inp').value = t;
      $('cnt').textContent = t.length + ' / 10000';
      off = new Set();
      run();
      toast('Файл прочитан локально');
    } catch (x) {
      toast(x.message || 'Не удалось прочитать файл', 1);
    }
  };

  // Нейросеть живёт в отдельном потоке (assets/ner-worker.js). Результаты кэшируются по тексту: «Это не риск» и повторные проверки мгновенны.
  const NN = { ready: false, loading: false, failed: false, w: null, cache: new Map(), pend: new Map(), seq: 0 };
  let runId = 0;
  function setNn(m, ok) {
    const e = $('nns');
    e.textContent = m;
    e.className = 'pill ' + (ok ? 'pill-green' : 'pill-blue');
  }
  function nnFail(msg) {
    NN.loading = false;
    NN.ready = false;
    NN.failed = true;
    for (const p of NN.pend.values()) p.res(null);
    NN.pend.clear();
    if (NN.w) {
      NN.w.terminate();
      NN.w = null;
    }
    setNn('Модель недоступна · работают правила');
    toast(msg || 'Модель не загружена: работают правила', 1);
  }
  // При первом визите страница ещё не под контролем Service Worker и модель не попадает в его кэш: кладём её туда сами,
  // чтобы офлайн-режим работал сразу. Это тот же файл с того же сайта (обычно берётся из HTTP-кэша браузера).
  function cacheModel() {
    if (!('caches' in window) || !/^https?:$/.test(location.protocol)) return;
    caches
      .open('bp-heavy-v1')
      .then((c) => c.match('assets/ner/ner-v2.bin').then((r) => r || c.add('assets/ner/ner-v2.bin')))
      .catch(() => {});
  }
  function nnStart() {
    if (NN.ready || NN.loading) return;
    NN.loading = true;
    NN.failed = false;
    setNn('Загрузка модели · около 9 МБ; правила уже работают');
    try {
      NN.w = new Worker('assets/ner-worker.js');
    } catch (e) {
      nnFail();
      return;
    }
    NN.w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress')
        setNn('Загрузка модели · ' + Math.min(99, Math.round((m.loaded / m.total) * 100)) + '%; правила работают');
      else if (m.type === 'ready') {
        NN.ready = true;
        NN.loading = false;
        cacheModel();
        setNn('Модель готова', 1);
        if ($('inp').value.trim()) run(true);
        nnFind(CASES[1][1]).then(() => paintDesk());
      } else if (m.type === 'error') nnFail();
      else if (m.type === 'skip' || m.type === 'found') {
        const p = NN.pend.get(m.id);
        if (!p) return;
        NN.pend.delete(m.id);
        if (m.type === 'found' && m.findings) {
          NN.cache.set(p.text, m.findings);
          if (NN.cache.size > 20) NN.cache.delete(NN.cache.keys().next().value);
          p.res(m.findings);
        } else p.res(null);
      }
    };
    NN.w.onerror = () => nnFail('Сбой нейросети: работают правила');
    NN.w.postMessage({ type: 'init' });
  }
  function nnFind(t) {
    if (NN.cache.has(t)) return Promise.resolve(NN.cache.get(t));
    if (!NN.ready || !NN.w) return Promise.resolve(null);
    return new Promise((res) => {
      const id = ++NN.seq;
      NN.pend.set(id, { text: t, res });
      NN.w.postMessage({ type: 'find', id, text: t });
    });
  }
  // Мгновенный доступ: результат нейросети, если он уже посчитан для этого текста.
  function ext(t) {
    return NN.ready && NN.cache.has(t) ? NN.cache.get(t) : null;
  }
  // Для тренажёра: дождаться локальной нейросети.
  async function extAsync(t) {
    if (!NN.ready) return null;
    try {
      return await nnFind(t);
    } catch (e) {
      return null;
    }
  }
  // После быстрой проверки правилами запускаем нейросеть и перерисовываем результат, когда она ответит.
  function kickNn(t) {
    const my = ++runId;
    if (!NN.ready || NN.cache.has(t)) return;
    setNn('Модель проверяет имена · правила уже проверили текст');
    nnFind(t).then((f) => {
      if (f && my === runId && $('inp').value === t) {
        setNn('Модель готова', 1);
        run(true);
      } else if (my === runId && !f && NN.ready) {
        setNn('Модель готова', 1);
        if ($('inp').value === t) {
          finalFor = t; // ответа не будет (запрос пропущен или сбой): не оставляем пометку «предварительно»
          run(true);
        }
      }
    });
  }
  // Модель запускается автоматически и остаётся включённой для анализатора и тренажёра.
  setTimeout(nnStart, 300);

  // ===== Навигация, методика, шаги тренажёра =====
  const PG = ['home', 'analyzer', 'trainer', 'method', 'about'],
    TT = { home: 'Главная', analyzer: 'Анализатор', trainer: 'Тренажёр', method: 'Методика', about: 'О проекте' };
  function show(p, push) {
    if (!PG.includes(p)) p = 'home';
    document.body.dataset.page = p;
    PG.forEach((x) => $('view-' + x).classList.toggle('hidden', x !== p));
    document.querySelectorAll('.navlinks [data-page]').forEach((b) => {
      const on = b.dataset.page === p;
      b.classList.toggle('active', on);
      on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
    });
    $('navlinks').classList.remove('open');
    $('menuToggle').setAttribute('aria-expanded', 'false');
    document.title = TT[p] + ': Безопасный промпт';
    if (push !== false && location.hash !== '#' + p) history.pushState(null, '', '#' + p);
    $('main').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('a[data-page], button[data-page]');
    if (b) {
      e.preventDefault();
      show(b.dataset.page);
    }
  });
  $('menuToggle').onclick = () => {
    const o = $('navlinks').classList.toggle('open');
    $('menuToggle').setAttribute('aria-expanded', o);
  };
  addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (h !== 'main') show(h, false);
  });
  function paintDesk() {
    const c = CASES[1],
      box = $('desk');
    if (!box || !c) return;
    $('deskTitle').textContent = c[0];
    box.dataset.safe = '1';
    render(c[1], box, false, { clean: true, brief: true });
  }
  $('deskOpen').onclick = () => {
    show('analyzer');
    $('inp').value = CASES[1][1];
    $('cnt').textContent = $('inp').value.length + ' / 10000';
    $('res').dataset.safe = '';
    off = new Set();
    run();
  };
  show(location.hash.slice(1) || 'home', false);
  paintDesk();
  const RES = {
    'Конспект занятия «Безопасный промпт»': [
      'Занятие «Безопасный промпт» (30 минут)',
      '<p class="sub">Черновик для педагога. Согласуйте с методистом учреждения образования.</p><ol class="st"><li><b>Разбор (5 мин).</b> Покажите на проекторе запрос с рисками и проверьте его вместе с группой в разделе «Анализатор».</li><li><b>Тренажёр (10 мин).</b> В парах отметьте критерии в кейсе и сравните с анализатором.</li><li><b>Переписываем (10 мин).</b> Составьте безопасную редакцию и проверьте её.</li><li><b>Рефлексия (5 мин).</b> Где анализатор ошибся и почему ответственность остаётся за человеком.</li></ol><p><b>Цели:</b> распознавать прямые и косвенные идентификаторы; минимизировать данные в запросе; критически оценивать результат проверки.</p>'
    ],
    'Карточки ситуационных задач': [
      'Карточки ситуационных задач',
      '<p class="sub">Кейсы в тренажёре собираются заново из вымышленных данных.</p><ol class="st"><li><b>Найди риски.</b> Отметьте в запросе фрагменты, которые нельзя отправлять в ИИ (3 уровня сложности).</li><li><b>Перепиши безопасно.</b> Обезличьте запрос и сохраните его цель, проверка делается анализатором.</li><li><b>Отправлять или нет?</b> Раунд из пяти ситуаций с объяснениями.</li></ol><button class="btn btn-primary" data-page="trainer">Открыть тренажёр →</button>'
    ],
    'Чек-лист перед отправкой': [
      'Чек-лист перед отправкой в ИИ',
      '<ol class="st"><li>Нужны ли ИИ имена, контакты и адреса для этой задачи?</li><li>Можно ли узнать человека по сочетанию деталей: школа, класс, место, редкое обстоятельство?</li><li>Есть ли сведения о здоровье, семье, социальном положении?</li><li>Не прошу ли я ИИ поставить диагноз или принять решение о человеке?</li><li>Есть ли у меня право передавать этот материал и куда уходит запрос?</li></ol>'
    ],
    'Памятка для родителей': [
      'ИИ и безопасность ребёнка',
      '<p class="sub">Черновик памятки.</p><ul><li>Не вводите в чат-боты имя, адрес, школу, фото и документы ребёнка.</li><li>Обсуждайте, зачем ИИ нужен и какие вопросы можно ему задавать.</li><li>Проверяйте ответы по надёжным источникам: ИИ может ошибаться.</li><li>Не используйте ИИ для оценки состояния здоровья и поведения ребёнка вместо специалиста.</li><li>Договоритесь в семье, какие сведения не передаются никому онлайн.</li></ul>'
    ],
    'Рекомендации для дошкольного образования': [
      'Дошкольное образование',
      '<p class="sub">Черновик рекомендаций.</p><ul><li>Работу с ИИ ведёт взрослый, дети не вводят данные самостоятельно.</li><li>Используйте обобщённые и вымышленные сюжеты вместо реальных детей и семей.</li><li>Объясняйте на примерах из игры, что личные «секреты» не рассказывают незнакомым.</li><li>Не передавайте ИИ фото, имена и сведения о воспитанниках.</li></ul>'
    ],
    'Нормативные ориентиры': [
      'Нормативные ориентиры',
      '<ul><li>Закон Республики Беларусь от 07.05.2021 № 99-З «О защите персональных данных».</li><li>Локальные акты и политика учреждения образования.</li></ul>'
    ]
  };
  document.addEventListener('click', (e) => {
    const r = e.target.closest('.resource-btn');
    if (r) {
      const [t, h] = RES[r.dataset.resource] || [r.dataset.resource, ''],
        d = $('resDetail');
      d.innerHTML =
        '<h2>' +
        t +
        '</h2>' +
        h +
        '<div class="button-row"><button class="btn btn-quiet" id="resClose">Закрыть</button></div>';
      d.classList.remove('hidden');
      d.focus();
      d.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (e.target.id === 'resClose') $('resDetail').classList.add('hidden');
    const f = e.target.closest('.tab');
    if (f) {
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === f));
      document
        .querySelectorAll('#resourceGrid .resource-card')
        .forEach((c) =>
          c.classList.toggle('hidden', f.dataset.filter !== 'all' && c.dataset.category !== f.dataset.filter)
        );
    }
  });

  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-ex]');
    if (c) {
      const t = CASES[+c.dataset.ex][1];
      $('inp').value = t;
      $('cnt').textContent = t.length + ' / 10000';
      off = new Set();
      run();
    }
  });

  // Офлайн-режим (PWA): работает только при размещении по http/https.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol))
    addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  BP.ui = { $, esc, toast, extAsync, stableLevel };
  const clip = document.querySelector('.ink');
  if (clip && typeof matchMedia === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches && clip.play)
    clip.play().catch(() => {});
})();
