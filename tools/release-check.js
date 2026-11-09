// node tools/release-check.js — проверка перед публикацией: нет заглушек, есть лицензия, версии согласованы.
// В `npm test` не входит: вызывайте вручную перед подачей на конкурс и публикацией.
const fs = require('fs'),
  path = require('path'),
  root = path.join(__dirname, '..');
const rd = (f) => fs.readFileSync(path.join(root, f), 'utf8'),
  fails = [],
  warns = [];
const html = rd('index.html');
if (/\[название организации\]|\[e-mail\]|заполнить перед публикацией/i.test(html))
  fails.push('index.html: остались заглушки владельца или контакта');
if (!fs.existsSync(path.join(root, 'LICENSE'))) fails.push('Нет файла LICENSE');
else if (/\[ПРАВООБЛАДАТЕЛЬ\]/.test(rd('LICENSE'))) fails.push('LICENSE: укажите правообладателя');
if (/ЗАПОЛНИТЬ/.test(rd('README.md'))) fails.push('README: остались поля ЗАПОЛНИТЬ');
const rules = JSON.parse(rd('assets/rules.json')),
  pkg = JSON.parse(rd('package.json'));
if (rules.rules_version !== pkg.version) fails.push('rules.json и package.json: разные версии');
if (!rules.normative_check || rules.normative_check.status !== 'проведена')
  warns.push('Нормативная сверка не завершена (см. NORMATIVE_CHECK.md)');
if (
  /FROM [^@\n]+\n/.test(
    rd('Dockerfile')
      .replace(/#.*\n/g, '\n')
      .replace(/(FROM [^\n@]+)\n/, '$1\n')
  ) &&
  !/@sha256:/.test(rd('Dockerfile').replace(/#.*/g, ''))
)
  warns.push('Dockerfile: образ закреплён по тегу, а не по digest');
for (const w of warns) console.log('Предупреждение: ' + w);
if (fails.length) {
  console.error('Перед публикацией:\n  - ' + fails.join('\n  - '));
  process.exit(1);
}
console.log('Проверка перед публикацией: ок');
