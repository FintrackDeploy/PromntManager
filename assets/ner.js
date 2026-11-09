'use strict';
// Снаружи доступен только BP.NER (в браузере и воркере) или module.exports (в Node).
(function () {
  /* Нейросеть Slovnet NER (проект Natasha, MIT): эмбеддинги Navec (PQ) + формы слов → 3 свёрточных слоя → CRF.
   Перенос на JS: вывод только на CPU, без сети. Веса: assets/ner/ner-v2.bin (tools/export_ner.py). */
  const NER = (() => {
    const PS = new Set([...'!#$%&()[]\\/*+,.:;<=>?@^_{|}~-‐−‒⁃–—―`"\'«»„“ʼʻ”№…']);
    const up = (s) => s === s.toUpperCase() && s !== s.toLowerCase(),
      lo = (s) => s === s.toLowerCase() && s !== s.toUpperCase();
    const title = (w) => w.length > 1 && up(w[0]) && lo(w.slice(1));
    function outline(w) {
      if (w.length === 1) return up(w) ? 'X' : 'x';
      if (up(w)) return 'XX';
      if (lo(w)) return 'xx';
      if (title(w)) return 'Xx';
      if (w.includes('-')) {
        const [l, r] = [w.slice(0, w.indexOf('-')), w.slice(w.indexOf('-') + 1)];
        if (title(l) && title(r)) return 'Xx-Xx';
      }
      return 'OTHER';
    }
    function shape(w) {
      let t = 'OTHER';
      if (/^[а-яёіў]+/i.test(w)) t = 'RU';
      else if (/^[a-z]+/i.test(w)) t = 'EN';
      else if (/^[+-]?\d+/.test(w)) t = 'NUM';
      else if (PS.has(w[0])) t = 'PUNCT';
      if (t === 'RU' || t === 'EN') return t + '_' + outline(w);
      if (t === 'PUNCT') return 'PUNCT_' + (w.length > 1 || !PS.has(w) ? 'OTHER' : w);
      return t;
    }
    const TOK = /[A-Za-zА-Яа-яЁёІіЎў]+(?:-[A-Za-zА-Яа-яЁёІіЎў]+)*|\d+(?:[.,]\d+)?|[^\sA-Za-zА-Яа-яЁёІіЎў\d]/g;
    const SEP = /(?<=[а-яёa-z]{3,}[.!?…])\s+(?=[А-ЯЁA-Z])|\n+/g;
    let H = null,
      W = null,
      SH = null,
      P = {},
      api = { ready: false };
    const ZC = new Map(),
      SC = new Map();
    function init(src) {
      const b =
        typeof src === 'string'
          ? typeof Buffer !== 'undefined'
            ? Buffer.from(src, 'base64')
            : Uint8Array.from(atob(src), (c) => c.charCodeAt(0))
          : src;
      const u = new Uint8Array(b.buffer ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) : b),
        hl = new DataView(u.buffer).getUint32(0, true);
      H = JSON.parse(new TextDecoder().decode(u.subarray(4, 4 + hl)));
      const blob = u.subarray(4 + hl);
      for (const [k, a] of Object.entries(H.arrays)) {
        const n = a.shape.reduce((x, y) => x * y, 1);
        P[k] = k === 'idx' ? blob.slice(a.off, a.off + n) : new Float32Array(blob.slice(a.off, a.off + n * 4).buffer);
      }
      for (let l = 0; l < H.layers; l++) {
        const w = P['cw' + l],
          O = P['cb' + l].length,
          cin = w.length / (O * 3),
          t = new Float32Array(w.length);
        for (let o = 0; o < O; o++)
          for (let c = 0; c < cin; c++) for (let k = 0; k < 3; k++) t[(o * 3 + k) * cin + c] = w[(o * cin + c) * 3 + k];
        P['cw' + l] = t;
      }
      W = new Map(H.words.map((w, i) => [w, i]));
      SH = new Map(H.shapes.map((s, i) => [s, i]));
      api.ready = true;
    }
    // Скалярное произведение с четырьмя накопителями: отдельная маленькая функция хорошо оптимизируется JIT.
    function dot(w, wo, x, xo, n) {
      let a = 0,
        b = 0,
        c = 0,
        d = 0,
        i = 0;
      for (; i + 3 < n; i += 4) {
        a += w[wo + i] * x[xo + i];
        b += w[wo + i + 1] * x[xo + i + 1];
        c += w[wo + i + 2] * x[xo + i + 2];
        d += w[wo + i + 3] * x[xo + i + 3];
      }
      for (; i < n; i++) a += w[wo + i] * x[xo + i];
      return a + b + c + d;
    }
    function run(words) {
      const n = words.length,
        C = 330,
        X = new Float32Array(n * C),
        unk = H.words.length - 1,
        sh = SH,
        oth = sh.get('OTHER');
      const ZK = new Array(n);
      words.forEach((w, i) => {
        const r = W.has(w.toLowerCase()) ? W.get(w.toLowerCase()) : unk,
          s = sh.has(shape(w)) ? sh.get(shape(w)) : oth;
        ZK[i] = r * 1024 + s;
        for (let q = 0; q < 100; q++) {
          const o = (q * 256 + P.idx[r * 100 + q]) * 3;
          X[i * C + q * 3] = P.codes[o];
          X[i * C + q * 3 + 1] = P.codes[o + 1];
          X[i * C + q * 3 + 2] = P.codes[o + 2];
        }
        for (let d = 0; d < 30; d++) X[i * C + 300 + d] = P.shape_emb[s * 30 + d];
      });
      // Слой 0: вклад слова в три позиции ядра считается один раз и кэшируется (слова и знаки препинания повторяются).
      const O0 = P.cb0.length,
        w0 = P.cw0,
        Z = new Array(n);
      for (let i = 0; i < n; i++) {
        const key = ZK[i];
        let z = ZC.get(key);
        if (!z) {
          z = new Float32Array(3 * O0);
          for (let k = 0; k < 3; k++)
            for (let o = 0; o < O0; o++) z[k * O0 + o] = dot(w0, (o * 3 + k) * C, X, i * C, C);
          if (ZC.size >= 6000) ZC.clear();
          ZC.set(key, z);
        }
        Z[i] = z;
      }
      let cur = new Float32Array(n * O0),
        cin = O0;
      for (let i = 0; i < n; i++)
        for (let o = 0; o < O0; o++) {
          let a = P.cb0[o];
          if (i > 0) a += Z[i - 1][o];
          a += Z[i][O0 + o];
          if (i < n - 1) a += Z[i + 1][2 * O0 + o];
          a = a > 0 ? a : 0;
          cur[i * O0 + o] = ((a - P.m0[o]) / P.s0[o]) * P.g0[o] + P.bi0[o];
        }
      for (let l = 1; l < H.layers; l++) {
        const w = P['cw' + l],
          b = P['cb' + l],
          g = P['g' + l],
          bi = P['bi' + l],
          m = P['m' + l],
          s = P['s' + l],
          O = b.length,
          out = new Float32Array(n * O);
        for (let i = 0; i < n; i++)
          for (let o = 0; o < O; o++) {
            let a = b[o];
            if (i > 0) a += dot(w, o * 3 * cin, cur, (i - 1) * cin, cin);
            a += dot(w, (o * 3 + 1) * cin, cur, i * cin, cin);
            if (i < n - 1) a += dot(w, (o * 3 + 2) * cin, cur, (i + 1) * cin, cin);
            a = a > 0 ? a : 0;
            out[i * O + o] = ((a - m[o]) / s[o]) * g[o] + bi[o];
          }
        cur = out;
        cin = O;
      }
      const T = P.hb.length,
        E = new Float32Array(n * T);
      for (let i = 0; i < n; i++)
        for (let t = 0; t < T; t++) {
          let a = P.hb[t];
          for (let c = 0; c < cin; c++) a += cur[i * cin + c] * P.hw[c * T + t];
          E[i * T + t] = a;
        }
      let sc = Float32Array.from(E.subarray(0, T));
      const hist = [];
      for (let i = 1; i < n; i++) {
        const ns = new Float32Array(T),
          ix = new Int32Array(T);
        for (let j = 0; j < T; j++) {
          let best = -1e30,
            bk = 0;
          for (let k = 0; k < T; k++) {
            const v = sc[k] + P.trans[k * T + j];
            if (v > best) {
              best = v;
              bk = k;
            }
          }
          ns[j] = best + E[i * T + j];
          ix[j] = bk;
        }
        sc = ns;
        hist.push(ix);
      }
      let bt = 0;
      for (let t = 1; t < T; t++) if (sc[t] > sc[bt]) bt = t;
      const tags = [bt];
      for (let i = hist.length - 1; i >= 0; i--) {
        bt = hist[i][bt];
        tags.push(bt);
      }
      tags.reverse();
      const pr = tags.map((t, i) => {
        let mx = -1e30;
        for (let k = 0; k < T; k++) mx = Math.max(mx, E[i * T + k]);
        let z = 0;
        for (let k = 0; k < T; k++) z += Math.exp(E[i * T + k] - mx);
        return Math.exp(E[i * T + t] - mx) / z;
      });
      return { tg: tags.map((t) => H.tags[t]), pr };
    }
    function spans(text) {
      if (!api.ready) return [];
      const res = [],
        cuts = [0];
      let m;
      SEP.lastIndex = 0;
      while ((m = SEP.exec(text))) {
        cuts.push(m.index, m.index + m[0].length);
      }
      cuts.push(text.length);
      for (let c = 0; c < cuts.length; c += 2) {
        const st = cuts[c],
          seg = text.slice(st, cuts[c + 1]),
          toks = [];
        TOK.lastIndex = 0;
        let x;
        while ((x = TOK.exec(seg))) toks.push([st + x.index, st + x.index + x[0].length, x[0]]);
        if (!toks.length) continue;
        const words = toks.map((t) => t[2]),
          ck = words.join('\u0001');
        let o = SC.get(ck);
        if (!o) {
          o = run(words);
          if (SC.size >= 3000) SC.clear();
          SC.set(ck, o);
        }
        const tg = o.tg;
        let cur = null;
        tg.forEach((t, i) => {
          const [bio, ty] = t.split('-');
          if (bio === 'B' || (bio === 'I' && (!cur || cur[2] !== ty))) {
            if (cur) res.push(cur);
            cur = [toks[i][0], toks[i][1], ty];
            cur.p = o.pr[i];
          } else if (bio === 'I') {
            cur[1] = toks[i][1];
            cur.p = Math.min(cur.p, o.pr[i]);
          } else {
            if (cur) res.push(cur);
            cur = null;
          }
        });
        if (cur) res.push(cur);
      }
      return res;
    }
    const MAP = { PER: 'NAME', LOC: 'LOC', ORG: 'ORG' };
    // Таблица типов берётся из analyzer.js: в воркере она лежит в BP.T, в Node подключаем модуль сами.
    const tbl = () => (typeof module !== 'undefined' ? require('./analyzer.js').T : BP.T);
    // Модель обучена на новостях: слово-команда в начале запроса («Составь…») иногда принимается за имя. Отсекаем такие находки.
    const IMP = new Set(
      'составь составьте объясни объясните напиши напишите подготовь подготовьте помоги помогите позвони определи придумай сравни реши приведи сделай создай расскажи подскажи проверь оцени поставь дай найди перечисли опиши предложи сформулируй перепиши переведи измени исправь проанализируй разработай подбери выбери запиши раскажы расскажы падрыхтуй растлумач напішы складзі дапамажы патлумач параўнай прыдумай выпішы пералічы апішы передай передайте перадай перадайце загрузи загрузите отправь отправьте вставь вставьте'.split(
        ' '
      )
    );
    // Одиночное «имя» принимаем, только если слово похоже на фамилию или стоит после слов вроде «ученик», «коллега».
    const SUF = /(?:ов|ев|ёв|ин|ын|ск(?:ий|ая|ого|ой|им)|цк(?:ий|ая)|ук|юк|енко|ич|вна)(?:а|у|ым|ой|е|ом|ем|ых|ы|ю)?$/i,
      CTX =
        /(?:ученик[а-я]*|ученица|ученицу|учитель[а-я]*|коллег[а-я]*|мама|папа|мать|отец|зовут|гражданин[а-я]*|господин|госпожа)\s+$/i;
    // Предлог или союз на конце находки («Раскажы пра») — признак ошибки модели: имён и мест так не бывает.
    const PREP = /(?:^|\s)(?:пра|про|для|без|над|под|при|об|обо|от|из|на|по|за|до|с|со|в|во|у|к|ко|о|і|и|ў|а|да)$/i;
    const okSpan = (t, s, e, ty) => {
      const w = t.slice(s, e);
      if (w.replace(/[^A-Za-zА-Яа-яЁё]/g, '').length < 2 || IMP.has(w.split(/\s+/)[0].toLowerCase()) || PREP.test(w))
        return false;
      return !(ty === 'PER' && !/\s/.test(w) && !SUF.test(w) && !CTX.test(t.slice(Math.max(0, s - 25), s)));
    };
    // Модель иногда приклеивает глагол-команду к имени («Передай Святославу…»). Команду отрезаем, имя оставляем.
    const clip = (text, s, e, ty) => {
      if (ty !== 'PER') return [s, e];
      const w = text.slice(s, e),
        first = w.split(/\s+/)[0];
      if (!IMP.has(first.toLowerCase()) || !/\s/.test(w)) return [s, e];
      const rest = w.slice(first.length).match(/^\s*(\S[\s\S]*)$/);
      return rest ? [s + w.length - rest[1].length, e] : [s, e];
    };
    function findings(text) {
      return spans(text)
        .map(([s, e, ty]) => [...clip(text, s, e, ty), ty])
        .filter(([s, e, ty]) => s < e && okSpan(text, s, e, ty))
        .map(([s, e, t]) => ({
          s,
          e,
          ty: MAP[t],
          cat: tbl()[MAP[t]][0],
          conf: 'средняя',
          txt: text.slice(s, e),
          src: 'нейросеть'
        }));
    }
    Object.assign(api, { init, spans, findings });
    return api;
  })();
  if (typeof module !== 'undefined') module.exports = NER;
  else (globalThis.BP = globalThis.BP || {}).NER = NER;
})();
