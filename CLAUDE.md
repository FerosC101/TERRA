@AGENTS.md

# TERRA — Claude Code guide

Agricultural discovery and crop-rotation intelligence app (Next.js + TypeScript).
Workflow: Observe → Discover → Investigate → Understand → Experiment → Adapt.
Read `README.md` for structure and `docs/ai-ml/CONTEXT.md` for current state before starting work.

## Commands

```bash
npm run dev     # http://localhost:3000
npm run build
npm run lint
npm test                       # Vitest unit tests (**/*.test.ts)
npm run experiment:discovery   # E-001 → experiments/E-001/results.json
npm run experiment:e002        # E-002 → experiments/E-002/results.json
npm run experiment:e003        # E-003 → experiments/E-003/results.json
npm run experiment:e004        # E-004 → experiments/E-004/results.json
npm run discovery:lipa         # engine on the real Lipa pipeline record (docs/Data Pipeline)
npm run water:lipa             # daily crop water balance on the real Lipa weather (crop calendar assumed)
npm run export:graphs          # CSVs for notebooks/terra-graphs.ipynb
```

## Context files

| File | Holds | Update when |
|---|---|---|
| `docs/ai-ml/CONTEXT.md` | Current state, data sources, known limits | The state of the project changes |
| `docs/ai-ml/DECISIONS.md` | Design/method decisions and why | A choice is made that others must follow |
| `docs/ai-ml/EXPERIMENTS.md` | ML/model experiments: plan, setup, results | An experiment is planned, run, or abandoned |
| `docs/ai-ml/FINDINGS.md` | Evidence-backed findings with sources and status | Something is learned that changes what we believe |
| `docs/ai-ml/TASKS.md` | Person 3 (AI/ML) checklist against the five deliverables | A task is finished, added, or unblocked |

Keep entries short. Link between files by ID (`D-001`, `E-001`, `F-001`).

## Skills

- `mle-workflow` (project) — any ML model, training, or evaluation work.
- `scientific-validation` (project) — any agronomic formula, crop parameter, dataset, or scientific claim.
- `findings-maintainer` (project) — recording or revising entries in `docs/ai-ml/FINDINGS.md`.
- `superpowers` (plugin, must be installed — see `docs/ai-ml/CONTEXT.md`) — TDD, debugging, code review.

## Rules

1. **Never fabricate.** No invented sources, citations, DOIs, datasets, results, or metrics.
   If a number was not produced by code that was actually run, or read from a source that was
   actually opened, do not write it down. Write "unknown" or "not yet measured" instead.
2. **Label provenance.** Every value is a field measurement, satellite estimate, model output,
   or simulation (the UI already tags these; keep it that way). Demo data is never presented as real.
3. **Reproducible.** Experiments record code commit, data source/version, parameters, and random seed
   (`lib/rng.ts` exists for seeded randomness).
4. **Keep it simple.** Prefer an inspectable rule or small model over a complex one until a
   simpler baseline has been measured and shown to fall short.
5. **Science lives in `lib/science/`**, parameters in `data/`. UI code calls `services/` only.
6. Don't commit or push; the user commits.
