"""Offline fine-tuning entry point for the local Slovnet NER model."""

import json
import struct
from pathlib import Path

import numpy as np


def load_browser_weights(path):
    """Read the compact JS model container and expose named arrays for warm-starting Slovnet."""
    data = Path(path).read_bytes()
    if len(data) < 4:
        raise ValueError('Model file is truncated before its header length')
    header_size = struct.unpack_from('<I', data, 0)[0]
    header_end = 4 + header_size
    if header_end > len(data):
        raise ValueError('Model file is truncated inside its header')
    header = json.loads(data[4:header_end].decode('utf-8'))
    arrays = {}
    for name, meta in header['arrays'].items():
        dtype = np.uint8 if name == 'idx' else np.dtype('<f4')
        size = int(np.prod(meta['shape']))
        start = header_end + meta['off']
        end = start + size * np.dtype(dtype).itemsize
        if end > len(data):
            raise ValueError(f'Model array {name!r} is truncated')
        arrays[name] = np.frombuffer(data, dtype=dtype, count=size, offset=start).reshape(meta['shape']).copy()
    return header, arrays


def read_jsonl(path):
    from slovnet.markup import SpanMarkup
    from slovnet.span import Span
    from slovnet.token import tokenize

    rows = []
    for line in Path(path).read_text(encoding='utf-8').splitlines():
        row = json.loads(line)
        spans = [Span(*span) for span in row['spans']]
        markup = SpanMarkup(row['text'], spans)
        bio = markup.to_bio(list(tokenize(row['text'])))
        bio.text = row['text']
        rows.append(bio)
    return rows


def build_model(package_path, navec, weights_path):
    import tarfile
    import torch
    from slovnet.exec.pack import Pack
    from slovnet.model.tag import TagEncoder
    from slovnet.model.emb import NavecEmbedding, Embedding, WordShapeEmbedding
    from slovnet.model.tag import NER, NERHead
    from slovnet.vocab import Vocab

    header, arrays = load_browser_weights(weights_path)
    with Pack(package_path) as pack:
        model_spec = pack.load_model(__import__('slovnet.exec.model', fromlist=['NER']).NER)
        shapes = pack.load_vocab('shape')
        tags = pack.load_vocab('tag')
        words = pack.load_vocab('word')
    shape_dim = arrays['shape_emb'].shape[1]
    shape = Embedding(len(shapes), shape_dim, shapes.pad_id)
    shape.weight.data.copy_(torch.from_numpy(arrays['shape_emb']))
    emb = WordShapeEmbedding(NavecEmbedding(navec), shape)
    dims = [int(layer.conv.weight.shape[0]) for layer in model_spec.encoder.layers]
    kernel = int(model_spec.encoder.layers[0].conv.padding * 2 + 1)
    encoder = TagEncoder(emb.dim, dims, kernel)
    net = NER(emb, encoder, NERHead(dims[-1], len(tags)))
    state = net.state_dict()
    for i in range(len(dims)):
        for source, target in ((f'cw{i}', f'encoder.layers.{i}.conv.weight'), (f'cb{i}', f'encoder.layers.{i}.conv.bias'),
                               (f'g{i}', f'encoder.layers.{i}.norm.weight'), (f'bi{i}', f'encoder.layers.{i}.norm.bias'),
                               (f'm{i}', f'encoder.layers.{i}.norm.running_mean')):
            state[target] = torch.from_numpy(arrays[source])
        std = arrays[f's{i}']
        state[f'encoder.layers.{i}.norm.running_var'] = torch.from_numpy((std * std - 1e-5).clip(min=0))
    state['head.proj.weight'] = torch.from_numpy(arrays['hw'].T.copy())
    state['head.proj.bias'] = torch.from_numpy(arrays['hb'])
    state['head.crf.transitions'] = torch.from_numpy(arrays['trans'])
    net.load_state_dict(state)
    return net, words, shapes, tags


def save_package(net, words, shapes, tags, output):
    from slovnet.exec.pack import DumpPack, Meta

    arrays, model = net.to_exec().strip_navec().separate_arrays()
    with DumpPack(output) as pack:
        pack.dump_meta(Meta('bezopasny_prompt_ner_finetuned_v1'))
        pack.dump_model(model)
        pack.dump_arrays(arrays)
        pack.dump_vocab(words, 'word')
        pack.dump_vocab(shapes, 'shape')
        pack.dump_vocab(tags, 'tag')


def entity_metrics(net, rows, words, shapes, tags):
    import torch
    from slovnet.bio import bio_spans
    from slovnet.shape import word_shape
    from slovnet.token import find_tokens

    correct = predicted = expected = 0
    net.eval()
    with torch.no_grad():
        for row in rows:
            tokens = list(find_tokens(row.text, row.words))
            if not tokens:
                continue
            word_ids = torch.tensor([[words.encode(token.text.lower()) for token in tokens]], dtype=torch.long)
            shape_ids = torch.tensor([[shapes.encode(word_shape(token.text)) for token in tokens]], dtype=torch.long)
            emissions = net(word_ids, shape_ids)
            pred_ids = net.head.crf.decode(emissions)[0].tolist()
            pred = {(s.start, s.stop, s.type) for s in bio_spans(tokens, [tags.decode(i) for i in pred_ids])}
            gold = {(s.start, s.stop, s.type) for s in bio_spans(tokens, row.tags)}
            correct += len(pred & gold)
            predicted += len(pred)
            expected += len(gold)
    precision = correct / predicted if predicted else 0
    recall = correct / expected if expected else 0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0
    return {'precision': precision, 'recall': recall, 'f1': f1, 'correct': correct, 'predicted': predicted, 'expected': expected}


def train(data_dir, package_path, navec_path, base_weights, output, epochs=3, lr=2e-5, seed=20261109):
    import random
    import torch
    from navec import Navec
    from slovnet.encoders.tag import TagTrainEncoder
    from slovnet.loss import masked_flatten_cross_entropy

    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    navec = Navec.load(str(navec_path))
    net, words, shapes, tags = build_model(package_path, navec, base_weights)
    train_rows = read_jsonl(Path(data_dir) / 'train.jsonl')
    dev_rows = read_jsonl(Path(data_dir) / 'dev.jsonl')
    holdout_rows = read_jsonl(Path(data_dir) / 'holdout.jsonl')
    baseline = entity_metrics(net, holdout_rows, words, shapes, tags)
    print(f'holdout baseline: P={baseline["precision"]:.3f} R={baseline["recall"]:.3f} F1={baseline["f1"]:.3f} ({baseline["correct"]}/{baseline["expected"]})')
    encoder = TagTrainEncoder(words, shapes, tags, seq_len=128, batch_size=8, shuffle_size=32)
    optimizer = torch.optim.AdamW(net.parameters(), lr=lr)
    for epoch in range(epochs):
        net.train()
        # Preserve pretrained inference statistics: this synthetic corpus is too small to recalibrate BN.
        for layer in net.encoder.layers:
            layer.norm.eval()
        losses = []
        for batch in encoder(train_rows):
            pred = net(batch.input.word_id, batch.input.shape_id, batch.input.word_id == words.pad_id)
            mask = batch.target != tags.pad_id
            loss = net.head.crf(pred, batch.target, mask)
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(net.parameters(), 1.0)
            optimizer.step()
            losses.append(float(loss.detach()))
        dev = entity_metrics(net, dev_rows, words, shapes, tags)
        print(f'epoch {epoch + 1}/{epochs}: loss={np.mean(losses):.4f}; dev F1={dev["f1"]:.3f}')
    net.eval()
    final = entity_metrics(net, holdout_rows, words, shapes, tags)
    print(f'holdout fine-tuned: P={final["precision"]:.3f} R={final["recall"]:.3f} F1={final["f1"]:.3f} ({final["correct"]}/{final["expected"]})')
    save_package(net, words, shapes, tags, output)
    (Path(output).with_suffix('.metrics.json')).write_text(json.dumps({'baseline': baseline, 'fine_tuned': final}, ensure_ascii=False, indent=2) + '\n')
    return output


if __name__ == '__main__':
    import argparse
    import natasha
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, default=Path(__file__).parent / 'generated')
    parser.add_argument('--package', type=Path, default=Path(natasha.__file__).resolve().parent / 'data/model/slovnet_ner_news_v1.tar')
    parser.add_argument('--weights', type=Path, default=Path(__file__).resolve().parents[2] / 'assets/ner/ner-v2.bin')
    parser.add_argument('--output', type=Path, default=Path(__file__).parent / 'model/slovnet_ner_finetuned.tar')
    parser.add_argument('--epochs', type=int, default=3)
    parser.add_argument('--lr', type=float, default=2e-5)
    args = parser.parse_args()
    navec_path = Path(natasha.__file__).resolve().parent / 'data/emb/navec_news_v1_1B_250K_300d_100q.tar'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    train(args.data, args.package, navec_path, args.weights, args.output, args.epochs, args.lr)
