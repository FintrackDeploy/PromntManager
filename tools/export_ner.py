"""Export a Slovnet NER package to the compact browser model container."""
import argparse
import gzip
import json
import os
import struct
import tarfile
from pathlib import Path

import natasha
import numpy as np
from navec import Navec

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SIZE = 60000
DEFAULT_OUTPUT = ROOT / 'assets' / 'ner' / 'ner-v2.bin'
NAVEC_NAME = 'navec_news_v1_1B_250K_300d_100q.tar'


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('legacy_dict_size', nargs='?', type=int, help='legacy positional dictionary size')
    parser.add_argument('--dict-size', type=int, default=None, help='number of Navec vocabulary rows to retain')
    parser.add_argument('--model', type=Path, help='Slovnet model package tar (defaults to Natasha news NER)')
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT, help='output browser binary path')
    return parser


def read_vocab(package, name):
    return gzip.decompress(package.extractfile(f'vocabs/{name}.gz').read()).decode('utf-8').split('\n')


def export_model(model_path, output_path, dict_size=DEFAULT_SIZE):
    base = Path(natasha.__file__).resolve().parent / 'data'
    navec_path = base / 'emb' / NAVEC_NAME
    nav = Navec.load(str(navec_path))
    # The training package uses the same full Navec word order as the inference package.
    package = tarfile.open(model_path)
    try:
        model = json.load(package.extractfile('model.json'))
        words = read_vocab(package, 'word')
        shapes = read_vocab(package, 'shape')
        tags = read_vocab(package, 'tag')
        if words != nav.vocab.words:
            raise ValueError('Model word vocabulary differs from the bundled Navec model')
        if not 1 < dict_size <= len(words):
            raise ValueError(f'dict-size must be between 2 and {len(words)}')
        counts = np.array(nav.vocab.counts[: len(words)])
        keep = sorted(np.argsort(-counts, kind='stable')[: dict_size - 1].tolist())
        rows = keep + [nav.vocab.unk_id]
        compact_words = [words[i] for i in keep] + ['<unk>']
        blobs, arrays, offset = [], {}, 0

        def add(name, array, dtype):
            nonlocal offset
            value = np.ascontiguousarray(array, dtype=dtype)
            blob = value.tobytes()
            arrays[name] = {'off': offset, 'shape': list(value.shape)}
            blobs.append(blob)
            offset += len(blob)

        def model_array(desc):
            return np.frombuffer(
                package.extractfile(f"arrays/{desc['array']}.bin").read(),
                dtype=desc['dtype'],
            ).reshape(desc['shape'])

        add('idx', nav.pq.indexes[rows], 'uint8')
        add('codes', nav.pq.codes, 'float32')
        add('shape_emb', model_array(model['emb']['shape']['weight']), 'float32')
        for i, layer in enumerate(model['encoder']['layers']):
            add(f'cw{i}', model_array(layer['conv']['weight']), 'float32')
            add(f'cb{i}', model_array(layer['conv']['bias']), 'float32')
            for source, target in (('weight', 'g'), ('bias', 'bi'), ('mean', 'm'), ('std', 's')):
                add(f'{target}{i}', model_array(layer['norm'][source]), 'float32')
        add('hw', model_array(model['head']['proj']['weight']), 'float32')
        add('hb', model_array(model['head']['proj']['bias']), 'float32')
        add('trans', model_array(model['head']['crf']['transitions']), 'float32')
        header = json.dumps(
            {'words': compact_words, 'shapes': shapes, 'tags': tags, 'arrays': arrays, 'layers': len(model['encoder']['layers'])},
            ensure_ascii=False,
        ).encode('utf-8')
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(struct.pack('<I', len(header)) + header + b''.join(blobs))
        return output_path.stat().st_size
    finally:
        package.close()


def main(argv=None):
    args = build_parser().parse_args(argv)
    dict_size = args.dict_size or args.legacy_dict_size or DEFAULT_SIZE
    model_path = args.model or (Path(natasha.__file__).resolve().parent / 'data' / 'model' / 'slovnet_ner_news_v1.tar')
    size = export_model(model_path, args.output, dict_size)
    print(f'слов: {dict_size}, байт: {size}, файл: {args.output}')


if __name__ == '__main__':
    main()
