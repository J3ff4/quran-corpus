# Domain Docs

How the engineering skills should consume this repo's domain documentation when
exploring the codebase. **Layout: single-context.**

## Before exploring, read these

- **`CONTEXT.md`** at the repo root
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence;
don't suggest creating them upfront. The `/domain-modeling` skill creates them
lazily when terms or decisions actually get resolved. Neither exists yet — that is
the expected starting state, not a gap to fill.

## File structure

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-....md
│   └── 0002-....md
├── apps/web/
└── packages/{config,data,scraper}/
```

This is a pnpm/turbo monorepo, but it is treated as a **single context**: the
package boundaries are already governed by `CLAUDE.md` §2 (`packages/data` is the
single source of truth for schema and queries, and stays free of web/Next imports
so it remains portable to a future `apps/mobile`). Do not restate those boundaries
in `CONTEXT.md` — §2 is the authority. `CONTEXT.md` is for *domain* vocabulary
(surah, ayah, root, lemma, segment, gloss, concordance), not module layout.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a
hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to
synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're
inventing language the project doesn't use (reconsider) or there's a real gap
(note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than
silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

Note that `CLAUDE.md` outranks any ADR: it is binding governance, and §12 requires
stopping to ask on schema changes, new dependencies, and anything security-touching.
An ADR may record *how* a decision was made, never license bypassing that rule.
