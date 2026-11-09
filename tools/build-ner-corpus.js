// Build deterministic synthetic Slovnet NER examples. Every entity in this corpus is invented for model training.
'use strict';

const fs = require('fs'),
  path = require('path');

const SPLITS = {
  train: {
    people: [
      ['Алина', 'Белозёрова'],
      ['Дарья', 'Ветлицкая'],
      ['Кирилл', 'Гордеев'],
      ['Тимур', 'Дубовский'],
      ['Ева', 'Ермакова'],
      ['Павел', 'Журавлёв'],
      ['Илья', 'Зорин'],
      ['Вера', 'Калиновская'],
      ['Эмма', 'Лескова'],
      ['Леонид', 'Мироненко'],
      ['Ксения', 'Новикова'],
      ['Роман', 'Орлов']
    ],
    locations: ['Минск', 'Гродно', 'Брест', 'Витебск', 'Гомель'],
    organizations: ['Гимназия «Север»', 'СШ «Вектор»', 'Лицей «Горизонт»', 'Школа «Спектр»'],
    templates: ['tr-recommendation', 'tr-student', 'tr-message', 'tr-context', 'tr-teacher', 'tr-meeting'],
    negativeTemplate: 'tr-safe'
  },
  dev: {
    people: [
      ['Яна', 'Баранович'],
      ['Виталий', 'Волкович'],
      ['Ангелина', 'Горностаева'],
      ['Фёдор', 'Дементьев'],
      ['Злата', 'Ершова'],
      ['Олег', 'Жилин']
    ],
    locations: ['Могилёв', 'Полоцк'],
    organizations: ['Школа «Лад»', 'Лицей «Ритм»'],
    templates: ['dv-observation', 'dv-letter'],
    negativeTemplate: 'dv-safe'
  },
  holdout: {
    people: [
      ['Marina', 'Barker'],
      ['Artem', 'Miller'],
      ['Elvira', 'Sidorova'],
      ['Matvey', 'Wilson'],
      ['Lilia', 'Anderson'],
      ['Nazar', 'Thomas'],
      ['Ulyana', 'Kovalenko'],
      ['Yaroslav', 'Brown']
    ],
    locations: ['Лида', 'Мозырь', 'Орша'],
    organizations: ['Гимназия «Маяк»', 'Школа «Круг»', 'Центр «Парус»'],
    templates: ['ho-consultation', 'ho-description'],
    negativeTemplate: 'ho-safe'
  }
};

const TEMPLATE_TEXT = {
  'tr-recommendation': 'Подготовь рекомендации ученику {{person}} из {{organization}} в городе {{location}}.',
  'tr-student': 'Ученица {{person}} учится в {{organization}}; составь ей план занятий в {{location}}.',
  'tr-message': 'Составь сообщение учителю {{person}} из {{organization}}, расположенной в {{location}}.',
  'tr-context': 'Вымышленный пример: {{person}}, {{organization}}, город {{location}}. Найди совпадения.',
  'tr-teacher': 'Для педагога {{person}} из {{organization}} подготовь заметку о поездке в {{location}}.',
  'tr-meeting': 'Пригласи {{person}} на встречу в {{organization}} города {{location}}.',
  'dv-observation': 'Опиши учебный случай: {{person}} посещает {{organization}} в {{location}}.',
  'dv-letter': 'Напиши письмо для {{person}}, классного руководителя {{organization}} из {{location}}.',
  'ho-consultation': 'Подбери нейтральную консультацию для {{person}} из учреждения {{organization}} ({{location}}).',
  'ho-description': 'Составь краткое описание учебного примера: {{person}}; {{organization}}; {{location}}.',
  'tr-safe': 'Объясни разницу между словом «Максимум», романом «Вера» и городом из задачи без поиска людей.',
  'dv-safe': 'Составь план урока о романе «Вера» и максимальном балле за задание.',
  'ho-safe': 'Объясни, что слово «Маринад» не является именем человека в примере о фотосинтезе.'
};

function person(split, i) {
  const [first, last] = split.people[i % split.people.length];
  return `${first} ${last}`;
}

function render(templateId, values) {
  const template = TEMPLATE_TEXT[templateId];
  const spans = [];
  let text = '',
    cursor = 0,
    m;
  const re = /\{\{(person|location|organization)\}\}/g;
  while ((m = re.exec(template))) {
    text += template.slice(cursor, m.index);
    const value = values[m[1]],
      start = text.length,
      end = start + value.length,
      type = m[1] === 'person' ? 'PER' : m[1] === 'location' ? 'LOC' : 'ORG';
    text += value;
    spans.push([start, end, type]);
    cursor = m.index + m[0].length;
  }
  text += template.slice(cursor);
  return { text, spans };
}

function makeSplit(key, count) {
  const split = SPLITS[key],
    rows = [];
  for (let t = 0; t < split.templates.length; t++) {
    const templateId = split.templates[t];
    for (let i = 0; i < count; i++) {
      rows.push(
        render(templateId, {
          person: person(split, i),
          location: split.locations[(i * 3 + t) % split.locations.length],
          organization: split.organizations[(i * 5 + t) % split.organizations.length]
        })
      );
    }
  }
  rows.push(render(split.negativeTemplate, {}));
  return rows;
}

function buildCorpus() {
  return {
    train: makeSplit('train', 100),
    dev: makeSplit('dev', 60),
    holdout: makeSplit('holdout', 60),
    templates: {
      train: SPLITS.train.templates,
      dev: SPLITS.dev.templates,
      holdout: SPLITS.holdout.templates
    }
  };
}

function writeCorpus(dir = path.join(__dirname, '..', 'training', 'ner', 'generated')) {
  const corpus = buildCorpus();
  fs.mkdirSync(dir, { recursive: true });
  for (const split of ['train', 'dev', 'holdout']) {
    fs.writeFileSync(path.join(dir, `${split}.jsonl`), corpus[split].map((x) => JSON.stringify(x)).join('\n') + '\n');
  }
  return corpus;
}

if (require.main === module) {
  const c = writeCorpus(process.argv[2]);
  console.log(`NER corpus: ${c.train.length} train, ${c.dev.length} dev, ${c.holdout.length} holdout`);
}

module.exports = { buildCorpus, writeCorpus };
