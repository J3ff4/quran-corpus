# CLAUDE.md

Project governance for the **Quran Corpus Android App**. This file is binding. Read it fully before any task. If a request conflicts with these rules, surface the conflict before proceeding.

-----

## 1. Project Summary

A beautiful, Android-first native mobile app presenting the Quranic corpus: Arabic text, word-by-word morphology/grammar, and multi-language translations (English, Uzbek, Russian, extensible). The app uses a bundled local SQLite database first and keeps the architecture portable to iOS and to a future versioned REST/API-backed data pipeline.

See `docs/PRD-android-first-mobile-app.md` for full requirements. CLAUDE.md governs *how* we build; PRD governs *what*.

-----

## 2. Repository Structure (Monorepo)

```
/
├── apps/
│   └── mobile/         # Expo React Native app — Android first, iOS scalable
├── packages/
│   ├── data/           # shared: schema, migrations, typed data-access layer
│   ├── mobile-data/    # Expo SQLite adapter and mobile DB fixture generation
│   └── config/         # shared tsconfig, eslint, tailwind preset, prettier
├── docs/
│   └── plans/          # phase plans live here (one file per phase)
├── docs/PRD-android-first-mobile-app.md
└── CLAUDE.md
```

- `packages/data` is the single source of truth for schema and queries. Never duplicate schema or query logic into an app.
- `apps/mobile` depends on `packages/mobile-data`, which adapts the shared data API to Expo SQLite.
- Keep `packages/data` free of any web, Expo, or React Native imports so it stays portable.

-----

## 3. Engineering Principles (non-negotiable)

- **DRY** — no duplicated logic. Shared logic goes in `packages/`. If you copy-paste, stop and extract.
- **SOLID** — applies to all service/business-logic layers. Single responsibility per module; depend on interfaces, not concretions, for data sources (scraper sources, translation providers, audio providers must be swappable behind interfaces).
- **OWASP Top 10** — input validation at every boundary, output encoding, secure headers (CSP, HSTS, X-Content-Type-Options), dependency audit on every install, zero secrets in the client bundle, no eval/dynamic-source execution. Treat any future user-generated content (notes/bookmarks) as untrusted.
- **Source-agnostic data** — the normalized schema must not leak where data came from. Morphology, translations, and audio are joined on Surah:Ayah:Word, not on source-specific identifiers.

-----

## 4. The Mandatory 6-Step Loop

Every unit of work (a feature, a fix, a module) follows this loop. Do not skip steps. Do not batch multiple features through one loop.

1. **Implement** — write code to spec, matching existing conventions.
1. **Self Review** — re-read the diff against DRY / SOLID / OWASP and this file. Check for duplication, leaked abstractions, missing validation.
1. **Code Review** — run `/code-review` on the change. This is the first *independent* read of the diff; self-review is the agent grading its own work. Plain `/code-review` is included in the Pro plan and runs locally — use it by default. `/code-review ultra` bills separately ($5–25/run) and is reserved for changes where a missed bug is expensive; never launch it without asking.
1. **Quality Review** — run lint, type-check, and tests. All must pass. No `// @ts-ignore`, no disabled lint rules without an inline justification comment.
1. **CodeRabbit Review** — open/update the PR and wait for CodeRabbit review (see §5).
1. **Final Review** — re-review after fixes; confirm no regression, then commit.

Step 3 is **user-triggered**: the agent cannot launch `/code-review` itself. When the loop reaches it, the agent stops and asks the user to run it, then acts on the findings. Do not silently skip the step because it needs a human keystroke.

If any step surfaces an issue, fix and **restart from step 2** for the affected code.

-----

## 5. CodeRabbit Quality Gate (HARD BLOCK)

- CodeRabbit is the automated review gate. Greptile is not used.
- Every meaningful change must receive a CodeRabbit review on its PR before merge.
- `reviewDecision: CHANGES_REQUESTED` is a hard block. Fix the findings and wait for CodeRabbit to re-review.
- Zero CodeRabbit check-runs is a lapse signature, not a pass. Do not merge or proceed as if review succeeded.
- Blocking CodeRabbit checks with `error` severity block merge. `warning` findings must be reviewed and either fixed or explicitly documented as accepted trade-offs.
- Keep `.coderabbit.yaml` and this file in sync; CodeRabbit uses this file as project knowledge.

-----

## 6. Phase Planning Workflow

Work proceeds in phases. Before writing code for a phase:

1. Use the **superpowers** skill (`superpowers:writing-plans`, and `superpowers:brainstorming` upstream for new features) to generate the phase plan. One plan file per phase in `docs/plans/phase-NN-<slug>.md`.
1. **Mandatory, not optional:** activate `/caveman` **before/while** `writing-plans` runs, so the plan is *authored* in caveman's terse, token-efficient style from the first draft — not written verbose and trimmed later. The point is to spend fewer tokens producing and re-reading plans. **Target: thorough but tight** — the plan must still cover every step, decision, risk, file/module mapping, and testable acceptance criteria; caveman removes padding and filler, never decision-relevant content. A plan not authored in caveman style is not ready. (Skills do not invoke each other automatically; you, the agent running the workflow, must have caveman active when you write the plan.)
1. A plan is “ready” only when: every task maps to a file/module, every external dependency is named, risks and rollbacks are listed, and the acceptance criteria are testable.
1. Do not start implementation until the phase plan is written and reviewed.

> Note: `superpowers` and `caveman` are installed Claude Code plugins (`caveman` from github.com/JuliusBrussee/caveman — its manifest wires SessionStart + UserPromptSubmit hooks). Newly installed plugin skills only register on the next session start, so if `/caveman` isn’t yet invokable, apply its thorough-but-tight style manually until then. Confirm exact skill names before relying on them; a wrong name silently won’t load.

-----

## 7. Tech Stack (see PRD for rationale)

- React Native + Expo + TypeScript
- Expo Router for navigation
- Expo SQLite with a bundled DB first; keep a path open for versioned REST/API updates later
- DB-backed translation content keyed by `language_code`; UI i18n is separate and starts with English, Uzbek, and Russian
- Streamed audio only, through our own thin endpoint contract

-----

## 8. Design Discipline

- **Design before code.** Keep Android platform conventions while preserving the Quran Corpus brand.
- Apply the **Emil Kowalski** skill for motion/interaction detail (bottom sheets, easing, transitions, optimistic feel).
- Draw component/layout inspiration from **21st.dev** templates — adapt and recompose, never ship verbatim copies.
- **It must not look like AI slop.** Distinctive typography (proper Uthmani Arabic face + refined Latin face), a custom non-generic color system (warm paper light mode, low-contrast night dark mode), elegant mixed RTL/LTR handling.
- Animations: abundant but purposeful and performant (60fps target; respect `prefers-reduced-motion`).
- Accessibility: WCAG AA minimum.

-----

## 9. Commit Discipline

- **Conventional Commits** for every commit: `type(scope): subject`.
  - Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `style`, `build`, `ci`.
  - Scope = package or area, e.g. `feat(scraper): ...`, `fix(web/word-popover): ...`, `chore(data): ...`.
- One logical change per commit. Commit only after the 6-step loop completes and CodeRabbit passes (§5).
- Imperative mood, concise subject (≤ ~72 chars). Body explains *why* when non-obvious; reference CodeRabbit false-positive or accepted-trade-off justifications here.
- Never commit secrets, scraped raw HTML dumps, or large binary data into git (use `.gitignore`; raw scrape snapshots live outside version control or in a data artifact store).

-----

## 10. Testing

- Unit tests for `packages/data` (data-access layer) and scraper parsing/morphology logic.
- Component tests for key interactive UI: word morphology popover, language switcher, audio player.
- Playwright E2E smoke test for the core reading flow on a mobile viewport.
- Tests must pass in step 4 of the loop. New logic ships with tests.

-----

## 11. Data & Legal Care

- Respect corpus.quran.com `robots.txt`; rate-limit the scraper (~1 req / 1–2s), make it resumable/checkpointed, and persist raw snapshots so re-parsing never requires re-scraping.
- Surface dataset attribution (corpus.quran.com, Tanzil, QuranEnc) in an in-app About/Credits section per each source’s license terms. Validate licensing before shipping any translation set.

-----

## 12. When In Doubt

Stop and ask rather than guess on: schema changes, adding a dependency, anything touching security, or anything that would duplicate logic across packages. A short question now beats a blocked review later.

**Whenever you are uncertain about anything — ambiguous requirements, multiple valid approaches, unclear scope, naming, trade-offs, or intent — use the AskUserQuestion tool instead of guessing or silently picking a default.** Asking is always preferred over assuming. Do not proceed on an unverified assumption when a quick question would resolve it.

-----

## 13. Subagent Model Floor + Compaction

- **Minimum model: Sonnet.** Never dispatch a subagent on Haiku. The floor is `claude-sonnet-4-6` (or newer Sonnet/Opus). Haiku is too weak for the code-quality bar required here.
- **Compact after every completed task.** When running Subagent-Driven Development, trigger a context compaction after each task's review cycle passes before dispatching the next task's implementer.
- **Compact after every completed + approved phase.** In addition to per-task compaction, trigger a compaction once a full phase is complete and the user has approved it, before starting the next phase. Both levels are mandatory: task-level and phase-level.

-----

## 14. Status Ledger Discipline

`STATUS.md` (repo root) is a live scratch board, not governance — it drifts stale across sessions and accounts. Confirmed 2026-07-18: it claimed a search feature was mid-review and a fix was "ready to merge" when both had actually been merged (and the search feature iterated further) days earlier.

- Before acting on anything `STATUS.md` claims — a task pending, a fix unmerged, a job running — verify against ground truth: `git log --oneline`, `git merge-base --is-ancestor <commit> main`, `gh pr list --state all`. Never trust the narrative alone across a session boundary.
- Update `STATUS.md` at natural checkpoints (phase done, PR merged, job finishes) so the drift stays small — but still re-verify before relying on it, since the next session may not be the one that updates it.
