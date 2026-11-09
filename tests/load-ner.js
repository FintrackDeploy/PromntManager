// Общий загрузчик модели для тестов: читает бинарный файл так же, как это делает ner-worker.js в браузере.
const fs = require('fs'),
  path = require('path');
module.exports = (NER, modelPath = path.join(__dirname, '../assets/ner/ner-v2.bin')) => {
  NER.init(fs.readFileSync(modelPath));
  return NER;
};
