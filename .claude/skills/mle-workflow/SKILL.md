---
name: mle-workflow
description: Structured ML development and evaluation for TERRA. Use when planning, building, training, evaluating, or comparing any machine-learning model or data-driven predictor (yield, soil moisture, anomaly detection, NDVI, rotation outcomes), or when reporting model performance.
---

# ML workflow

Follow these steps in order. Record each experiment in `docs/ai-ml/EXPERIMENTS.md` (template there).

## 1. Frame
- State the question, the target variable, and who uses the prediction.
- Name the ground truth. If none exists, stop and say so: without labels there is no evaluation.
- Check `docs/ai-ml/CONTEXT.md`: is the data real or demo? Demo data can test the pipeline, never the science.

## 2. Baseline first
- Measure a trivial baseline (climatology mean, persistence, last value, existing rule in
  `lib/science/detect.ts`) before any model.
- A model is only worth keeping if it beats the baseline on held-out data by a margin that matters.

## 3. Data
- Record source, product/version, date range, spatial unit, and preprocessing.
- Split without leakage: **by time** (train on earlier, test on later) and **by field** when
  generalising across fields. Never random-split daily time series.
- Note resolution mismatches (e.g. a 9 km SMAP cell vs one plot) as limits, not footnotes.

## 4. Evaluate
- Pick metrics **before** running and say why (MAE/RMSE in physical units for regression;
  precision/recall for rare anomalies, not accuracy).
- Report uncertainty: spread across folds, seasons, or seeds — not one number.
- Check failure cases: dry vs wet seasons, each field, extremes.

## 5. Reproduce
- Fix seeds (`lib/rng.ts`), record commit hash and exact command.
- Someone else must be able to rerun it and get the same numbers.

## 6. Record
- `docs/ai-ml/EXPERIMENTS.md`: copy numbers from the actual output. If it was not run, write "not run".
- Lasting conclusions → `docs/ai-ml/FINDINGS.md` via the `findings-maintainer` skill.
- Choices that constrain future work → `docs/ai-ml/DECISIONS.md`.

## Never
- Report a metric you did not compute in this session or cannot point to in a saved output.
- Tune on the test set, or present demo-data results as field performance.
- Add a framework or model class when a simpler one has not been measured first.
