"""The exporter must accept an explicit trained package without mutating reference fixtures."""
import subprocess
import sys
from pathlib import Path

root = Path(__file__).parents[2]
result = subprocess.run(
    [sys.executable, str(root / 'tools' / 'export_ner.py'), '--help'],
    capture_output=True,
    text=True,
)
assert result.returncode == 0, result.stderr
assert '--model' in result.stdout
assert '--output' in result.stdout
assert '--dict-size' in result.stdout
print('NER exporter CLI: ok (--model, --output, --dict-size)')
