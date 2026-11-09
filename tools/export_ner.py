"""Экспорт Slovnet NER (Natasha) в компактный файл для браузера.
Нужны: pip install natasha. Запуск: python tools/export_ner.py [размер_словаря]"""
import base64, gzip, json, os, struct, sys, tarfile
import numpy as np, natasha
from navec import Navec
K = int(sys.argv[1]) if len(sys.argv) > 1 else 60000
base = os.path.dirname(natasha.__file__) + '/data/'
nav = Navec.load(base + 'emb/navec_news_v1_1B_250K_300d_100q.tar')
t = tarfile.open(base + 'model/slovnet_ner_news_v1.tar')
m = json.load(t.extractfile('model.json'))
rd = lambda n: gzip.decompress(t.extractfile(f'vocabs/{n}.gz').read()).decode().split('\n')
words, shapes, tags = rd('word'), rd('shape'), rd('tag')
assert words == nav.vocab.words
cnt = np.array(nav.vocab.counts[:250000])
keep = sorted(np.argsort(-cnt, kind='stable')[:K - 1].tolist())
rows = keep + [nav.vocab.unk_id]
kw = [words[i] for i in keep] + ['<unk>']
blob, arr, off = [], {}, 0
def add(name, a, dt):
    global off
    a = np.ascontiguousarray(a, dtype=dt); b = a.tobytes()
    arr[name] = {'off': off, 'shape': list(a.shape)}; blob.append(b); off += len(b)
A = lambda d: np.frombuffer(t.extractfile(f"arrays/{d['array']}.bin").read(), dtype=d['dtype']).reshape(d['shape'])
add('idx', nav.pq.indexes[rows], 'uint8'); add('codes', nav.pq.codes, 'float32')
add('shape_emb', A(m['emb']['shape']['weight']), 'float32')
for i, L in enumerate(m['encoder']['layers']):
    add(f'cw{i}', A(L['conv']['weight']), 'float32'); add(f'cb{i}', A(L['conv']['bias']), 'float32')
    for k, n in (('weight', 'g'), ('bias', 'bi'), ('mean', 'm'), ('std', 's')): add(f'{n}{i}', A(L['norm'][k]), 'float32')
add('hw', A(m['head']['proj']['weight']), 'float32'); add('hb', A(m['head']['proj']['bias']), 'float32')
add('trans', A(m['head']['crf']['transitions']), 'float32')
h = json.dumps({'words': kw, 'shapes': shapes, 'tags': tags, 'arrays': arr, 'layers': len(m['encoder']['layers'])}, ensure_ascii=False).encode()
data = struct.pack('<I', len(h)) + h + b''.join(blob)
out = os.path.join(os.path.dirname(__file__), '..', 'assets', 'ner', 'ner-v2.bin')
open(out, 'wb').write(data)  # бинарный файл; при смене модели переименуйте в ner-v3.bin (ner-worker.js, sw.js, тесты)
print('слов:', len(kw), 'байт:', len(data), 'файл:', os.path.getsize(out))
# эталон: ответы Natasha для проверки переноса
from natasha import Segmenter, NewsEmbedding, NewsNERTagger, Doc
seg, tg = Segmenter(), NewsNERTagger(NewsEmbedding())
texts = [x['text'] for x in json.load(open(os.path.join(os.path.dirname(__file__), '..', 'tests', 'test_prompts.json')))]
texts += ['Иван Петров живёт в Казани и работает в Яндексе.', 'Директор гимназии № 4 города Гродно Мария Ивановна Козлова приняла решение.', 'Президент России встретился с министром обороны Беларуси в Минске.']
ref = []
for x in texts:
    d = Doc(x); d.segment(seg); d.tag_ner(tg)
    ref.append({'text': x, 'spans': [[s.start, s.stop, s.type] for s in d.spans]})
json.dump(ref, open(os.path.join(os.path.dirname(__file__), '..', 'tests', 'ner_reference.json'), 'w'), ensure_ascii=False)
print('эталонных текстов:', len(ref))
