# NER training data

The committed corpus source lives in `tools/build-ner-corpus.js`. It creates deterministic invented Russian and English people, school names, and Belarusian locations with exact span offsets. Train, dev, and holdout use disjoint entity strings and template families.

Generate Slovnet-compatible JSONL files with:

```sh
node tools/build-ner-corpus.js
```

Generated corpora and model artifacts are ignored by Git. They contain only synthetic examples; their metrics are not independent estimates of real-world quality.

## Fine-tuning experiment

On Intel macOS with Python 3.11 or 3.12, create an environment from this directory's `pyproject.toml`, install its dependencies, then run:

```sh
node tools/build-ner-corpus.js
python training/ner/train_ner.py --epochs 8 --lr 0.000001
python tools/export_ner.py --model training/ner/model/slovnet_ner_finetuned.tar --output training/ner/model/finetuned.bin
```

The trainer warm-starts from the bundled browser weights, freezes pretrained BatchNorm running statistics, and reports entity precision, recall, and F1 on dev and holdout splits. The current experiment reached dev F1 0.999, while holdout F1 stayed at 0.639 (same as baseline); the candidate preserved the existing Natasha fixture check at 37/39 entities. Because this corpus is generated from templates, these scores do not measure real-world recall. Keep the candidate separate until an independently labeled holdout shows a clear gain without extra false positives.
