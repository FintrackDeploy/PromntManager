# Сторонние компоненты
| Компонент | Где | Лицензия |
|---|---|---|
| Natasha / Slovnet NER (веса и архитектура) | `assets/ner/ner-v2.bin`, `assets/ner.js` | MIT (`assets/ner/LICENSE-Natasha.txt`) |
| Navec (эмбеддинги, словарь сокращён до 60 000 слов) | `assets/ner/ner-v2.bin` | MIT |
| JSZip | `assets/vendor/jszip.min.js` | MIT или GPL-3.0 на выбор (текст в `assets/vendor`) |
| Old Standard TT, Onest | `assets/fonts` | SIL OFL 1.1 |
| jsdom (только для `npm run test:dom`, в сборку не входит) | devDependency | MIT |

**Проверить перед публикацией:** условия лицензий обучающих данных, на которых получены веса Slovnet/Navec (новостные корпуса), и допустимость распространения весов в составе вашего проекта. Здесь указаны лицензии кода и опубликованных моделей по данным проекта Natasha; юридическую проверку это не заменяет.
