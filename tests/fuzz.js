// node tests/fuzz.js — устойчивость: те же риски в искажённой записи (регистр, невидимые символы, «широкие» цифры, окружение).
const A = require('../assets/analyzer.js');
global.T = A.T;
const B = [
  ['email', 'ivan.petrov@mail.by', 'C1'],
  ['phone', '+375 29 123-45-67', 'C1'],
  ['phone8', '8 029 765-43-21', 'C1'],
  ['pid', '3120892A045PB1', 'C1'],
  ['passport', 'паспорт МР 1234567', 'C1'],
  ['card', '4111 1111 1111 1111', 'C1'],
  ['dob', 'родился 5 сентября 2015', 'C1'],
  ['plate', '1234 АВ-7', 'C1'],
  ['vk', 'vk.com/id12345678', 'C1'],
  ['pwd', 'пароль Qwerty!2024', 'C7'],
  ['key', 'sk-test1234567890abcdef12', 'C7'],
  ['diag', 'диагноз — СДВГ', 'C3'],
  ['family', 'родители развелись', 'C4'],
  ['name', 'Иван Петров', 'C1'],
  ['cred', 'login saddsa pass asdasd', 'C7'],
  ['obf', 'ivan собака mail точка by', 'C1']
];
const M = {
  обычно: (s) => s,
  'в тексте': (s) => 'Составь письмо. ' + s + '. Спасибо.',
  ЗАГЛАВНЫМИ: (s) => s.toUpperCase(),
  строчными: (s) => s.toLowerCase(),
  'невидимые символы': (s) => [...s].join('\u200b'),
  'широкие цифры': (s) => s.replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0xfee0))
};
let tot = 0,
  ok = 0;
const bad = [];
for (const [m, f] of Object.entries(M))
  for (const [n, s, c] of B) {
    tot++;
    const r = A.analyze(f(s));
    if (r.cats.has(c)) ok++;
    else bad.push(`${m} / ${n}`);
  }
console.log(`Устойчивость к искажениям: ${ok} из ${tot}` + (bad.length ? '\nНе найдено: ' + bad.join('; ') : ''));
if (ok / tot < 0.9) process.exit(1);
