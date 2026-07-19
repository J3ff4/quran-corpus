# CLAUDE.md

Project governance for the **Quranic Corpus Mobile-First PWA**. This file is binding. Read it fully before any task. If a request conflicts with these rules, surface the conflict before proceeding.

-----

## 1. Project Summary

A beautiful, mobile-first, installable PWA presenting the Quranic corpus — Arabic text, word-by-word morphology/grammar, and multi-language translations (English, Uzbek, Russian, extensible). Data is scraped once from corpus.quran.com, supplemented by open datasets (Tanzil, QuranEnc), normalized into SQLite/libSQL (Turso), and served via Next.js. A native mobile app will later consume the same data layer.

See `PRD.md` for full requirements. CLAUDE.md governs *how* we build; PRD governs *what*.

-----

## 2. Repository Structure (Monorepo)

```
/
├── apps/
│   └── web/            # Next.js (App Router) PWA — the product
├── packages/
│   ├── scraper/        # corpus.quran.com scraper + dataset importers (Tanzil, QuranEnc)
│   ├── data/           # shared: schema, migrations, seed/export, typed data-access layer
│   └── config/         # shared tsconfig, eslint, tailwind preset, prettier
├── docs/
│   └── plans/          # phase plans live here (one file per phase)
├── PRD.md
└── CLAUDE.md
```

- `packages/data` is the single source of truth for schema and queries. **Web and scraper both depend on it.** Never duplicate schema or query logic into an app.
- The future mobile app will be added as `apps/mobile` and will reuse `packages/data`. Keep `packages/data` free of any web/Next-specific imports so it stays portable.

-----

## 3. Engineering Principles (non-negotiable)

- **DRY** — no duplicated logic. Shared logic goes in `packages/`. If you copy-paste, stop and extract.
- **SOLID** — applies to all service/business-logic layers. Single responsibility per module; depend on interfaces, not concretions, for data sources (scraper sources, translation providers, audio providers must be swappable behind interfaces).
- **OWASP Top 10** — input validation at every boundary, output encoding, secure headers (CSP, HSTS, X-Content-Type-Options), dependency audit on every install, zero secrets in the client bundle, no eval/dynamic-source execution. Treat any future user-generated content (notes/bookmarks) as untrusted.
- **Source-agnostic data** — the normalized schema must not leak where data came from. Morphology, translations, and audio are joined on Surah:Ayah:Word, not on source-specific identifiers.

-----

## 4. The Mandatory 5-Step Loop

Every unit of work (a feature, a fix, a module) follows this loop. Do not skip steps. Do not batch multiple features through one loop.

1. **Implement** — write code to spec, matching existing conventions.
1. **Code Review** — self-review against DRY / SOLID / OWASP and this file. Check for duplication, leaked abstractions, missing validation.
1. **Quality Review** — run lint, type-check, and tests. All must pass. No `// @ts-ignore`, no disabled lint rules without an inline justification comment.
1. **Greptile Review** — run Greptile on the change (see §5).
1. **Final Review** — re-review after fixes; confirm no regression, then commit.

If any step surfaces an issue, fix and **restart from step 2** for the affected code.

-----

## 5. Greptile Quality Gate (HARD BLOCK)

- Run Greptile on every meaningful change.
- **A score below 5/5 is a hard block. Never proceed, never merge, never move to the next task until the change scores 5/5.** There is no override.
- Address every Greptile finding (fix it, or if it’s a false positive, document why in the PR/commit body — but the score itself must still reach the threshold).
- Re-run Greptile after fixes to confirm the new score. A claimed fix without a re-run does not count.

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

- Next.js (App Router) + TypeScript + Tailwind CSS
- SQLite via Turso/libSQL (embedded; embedded-replica model maps to future mobile local-first DB)
- Framer Motion for animation (Emil Kowalski-style interaction/motion patterns)
- next-intl (or equivalent) for UI i18n; translation *content* lives in the DB per `language_code`, decoupled from UI locale
- Scraper: Python (Playwright/BeautifulSoup) or Node — choose per scraping ergonomics; isolated in `packages/scraper`
- Self-hosted on Proxmox homelab via Docker, behind existing Caddy + Cloudflare Tunnel

-----

## 8. Design Discipline

- **Design before code.** Mockups via the UI/UX design plugin first.
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
- One logical change per commit. Commit only after the 5-step loop completes and Greptile ≥ 4/5.
- Imperative mood, concise subject (≤ ~72 chars). Body explains *why* when non-obvious; reference Greptile false-positive justifications here.
- Never commit secrets, scraped raw HTML dumps, or large binary data into git (use `.gitignore`; raw scrape snapshots live outside version control or in a data artifact store).

-----

## 10. Testing

- Unit tests for `packages/data` (data-access layer) and scraper parsing/morphology logic.
- Component tests for key interactive UI: word morphology popover, language switcher, audio player.
- Playwright E2E smoke test for the core reading flow on a mobile viewport.
- Tests must pass in step 3 of the loop. New logic ships with tests.

-----

## 11. Data & Legal Care

- Respect corpus.quran.com `robots.txt`; rate-limit the scraper (~1 req / 1–2s), make it resumable/checkpointed, and persist raw snapshots so re-parsing never requires re-scraping.
- Surface dataset attribution (corpus.quran.com, Tanzil, QuranEnc) in an in-app About/Credits section per each source’s license terms. Validate licensing before shipping any translation set.

-----

## 12. When In Doubt

Stop and ask rather than guess on: schema changes, adding a dependency, anything touching security, or anything that would duplicate logic across packages. A short question now beats a Greptile block later.

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