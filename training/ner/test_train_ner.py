"""Small contract tests for converting the browser model into Slovnet training weights."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import train_ner

load_browser_weights = getattr(train_ner, 'load_browser_weights', None)
assert callable(load_browser_weights), 'train_ner exposes load_browser_weights()'

root = Path(__file__).parents[2]
header, arrays = load_browser_weights(root / 'assets' / 'ner' / 'ner-v2.bin')
assert header['layers'] == 3
assert header['tags'] == ['<pad>', 'O', 'B-PER', 'I-PER', 'B-LOC', 'I-LOC', 'B-ORG', 'I-ORG']
assert arrays['shape_emb'].shape == (66, 30)
assert arrays['cw0'].shape == (256, 330, 3)
assert arrays['trans'].shape == (8, 8)
print('NER warm-start weights: ok (3 layers, PER/LOC/ORG BIO tags)')
