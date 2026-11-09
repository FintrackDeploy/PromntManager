# Detection Recall and NER Adaptation Implementation Plan

> **For agentic workers:** Follow this plan task by task. The primary agent executes inline; no subagents are used.

**Goal:** Improve detection recall for personal data and secrets, and adapt local Slovnet NER to education prompts without sending text off-device.

**Architecture:** Keep regex/data-based detectors authoritative for secrets, contact details, documents, and sensitive context. Warm-start the existing PER/LOC/ORG Slovnet CNN-CRF, train on deterministic synthetic education examples, export a versioned local model, and preserve the existing browser worker path.

**Tech Stack:** Existing Node.js tests and browser JavaScript analyzer; Python/PyTorch and Slovnet/Navec only for offline model training/export.

**Spec:** `docs/superpowers/specs/2026-11-09-detection-recall-design.md`

## Global Constraints

- User prompt text is never uploaded or stored; inference remains local in a Web Worker.
- NER remains limited to PER, LOC, ORG; structured personal data and secrets are handled by rules.
- Synthetic training/evaluation data is not an independent real-world quality estimate.
- Keep all pre-existing workspace changes intact; do not revert or overwrite them.
- Do not ship newly trained model weights unless they load in JS and do not regress protected holdouts.

## Review Focus

- Password values after multiword account descriptions: exact reproduction and nearby false-positive cases.
- Tokens and credentials in mixed punctuation, quotes, URLs, obfuscated forms, and multiple languages.
- Common words and fictional/public names that resemble personal names.
- Train/test leakage across both template families and entity names.
- Model export compatibility, worker cache version, download size, and execution time.

---

### Task 1: Pin down and expand secret/identifier coverage

**Files:**
- Modify: `tests/regress.js`
- Modify: `tests/sweep.js`
- Modify: `tests/extra.json`
- Modify: `assets/analyzer.js`

**Interfaces:** Keep `A.analyze(text, off, ext)` and the existing finding/category shape.

- [x] Add failing cases for multiword password context and safe instructional mentions.
- [x] Run targeted Node checks and confirm failures are the expected missing detections or false alarms.
- [x] Update detector patterns while retaining protected negative cases.
- [x] Run relevant detector/regression scripts; paired safe/risky cases pass.

### Task 2: Build a reproducible synthetic NER corpus

**Files:**
- Create: `tools/build-ner-corpus.js`
- Create: `training/ner/` (small source templates/config only; generated large files ignored)
- Modify: `.gitignore` only if generated weights/corpus need explicit ignores
- Test: `tests/ner-training.js`

**Interfaces:** Generator emits Slovnet-compatible JSON Lines: `{ "text": string, "spans": [[start, stop, "PER"|"LOC"|"ORG"]] }`.

- [x] Add deterministic corpus assertions for offsets, labels, seeded generation, and train/evaluation separation.
- [x] Run the corpus test RED before implementing the generator, then GREEN.
- [x] Generate synthetic school prompts, locations, and safe homonym examples.
- [x] Split by template family and entity identity; reserve a deterministic generated holdout.
- [x] Verify corpus size and keep generated corpus/model files ignored.

### Task 3: Fine-tune and export a versioned local NER model

**Files:**
- Create: `training/ner/train_ner.py`
- Modify: `tools/export_ner.py`
- Modify: `tests/load-ner.js` (allow a candidate model path during evaluation)

**Interfaces:** Training starts from existing PER/LOC/ORG weights, reads the generated corpus, writes a Slovnet-compatible package, then exports a new immutable binary (for example `ner-v3.bin`). Worker messages and JS `NER.findings(text)` remain unchanged.

- [x] Add and run warm-start and exporter CLI checks; round-trip candidate accepted by `assets/ner.js`.
- [x] Implement training with train/dev/holdout separation and frozen pretrained BatchNorm statistics.
- [x] Train and export a candidate to ignored `training/ner/model/`; preserve immutable runtime `ner-v2.bin`.
- [x] Compare baseline and candidate on synthetic holdout and Natasha fixtures. Holdout F1 remained 0.639; Natasha fixture remained 37/39, so the candidate was not activated in the app.
- [x] Check candidate size (about 8.7 MiB) and browser model compatibility.

### Task 4: Full verification and truthful release notes

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [x] Run `npm run test:all`, `npm run check`, `npm run format:check`, and `npm run release-check`.
- [x] Run Python warm-start/exporter checks and the training experiment in the project Python environment.
- [x] Inspect `git diff --check` and workspace status while preserving pre-existing user changes.
- [x] Report exact test/model metrics and note synthetic evaluation limits and the pending normative review warning from release-check.
