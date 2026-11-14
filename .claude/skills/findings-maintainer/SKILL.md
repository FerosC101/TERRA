---
name: findings-maintainer
description: Record and maintain evidence-backed findings in docs/ai-ml/FINDINGS.md. Use when an experiment, validation, dataset check, or literature source produces something worth keeping; when new evidence supports, contradicts, or outdates an existing finding; or when asked to review or update findings.
---

# Findings maintainer

`docs/ai-ml/FINDINGS.md` is the project's memory of what we know and how sure we are. The template is at the top of that file.

## Add a finding
1. Read `docs/ai-ml/FINDINGS.md` first. If an existing entry covers it, **revise** that entry instead of adding one.
2. Use the next free ID (`F-001`, `F-002`, …). IDs are never reused.
3. Fill every field. Evidence must point to something checkable: a `docs/ai-ml/EXPERIMENTS.md` entry,
   a code path and command, a measurement, or a source.
4. Sources: full reference or URL **you actually consulted**, with access date. No source → status `Unverified`.
5. Set the status honestly:
   - `Unverified` — plausible, not yet checked
   - `Supported` — one line of evidence
   - `Validated` — independently reproduced or checked against real field data
   - `Disputed` — evidence conflicts
   - `Outdated` — superseded; say by what

## Revise a finding
- When new evidence arrives, review every finding it touches (search by topic, variable, dataset).
- Edit the entry in place, update `Last reviewed`, and **append** a history line:
  `- YYYY-MM-DD — status X → Y: reason (evidence ref)`.
- Never delete an entry or rewrite its history. Mark it `Outdated` and link the replacement.

## Never
- Invent sources, DOIs, authors, dates, or numbers.
- Upgrade a status without new evidence.
- Treat demo-data output as evidence about real fields.

After editing, tell the user which entries changed and why.
