# CLAUDE.md

Project governance for the **Quran Corpus** monorepo — a mobile-first PWA and a native Android app over one shared data layer. This file is binding. Read it fully before any task. If a request conflicts with these rules, surface the conflict before proceeding.

-----

## 1. Project Summary

Two products over one corpus: a beautiful, mobile-first, installable PWA, and an Android-first native app (Expo/React Native) portable to iOS. Both present Arabic text, word-by-word morphology/grammar, and multi-language translations (English, Uzbek, Russian, extensible). Data is scraped once from corpus.quran.com, supplemented by open datasets (Tanzil, QuranEnc), normalized into SQLite/libSQL, served via Next.js on the web and bundled as a local SQLite file on mobile.

See `PRD-quran-corpus-pwa.md` for the web product and `docs/PRD-android-first-mobile-app.md` for the Android app. CLAUDE.md governs *how* we build; the PRDs govern *what*.

-----

## 2. Repository Structure (Monorepo)

```
/
├── apps/
│   ├── web/            # Next.js (App Router) PWA — the web product
│   └── mobile/         # Expo React Native app — Android first, iOS scalable
├── packages/
│   ├── scraper/        # corpus.quran.com scraper + dataset importers (Tanzil, QuranEnc)
│   ├── data/           # shared: schema, migrations, seed/export, typed data-access layer
│   ├── mobile-data/    # Expo SQLite adapter and mobile DB fixture generation
│   └── config/         # shared tsconfig, eslint, tailwind preset, prettier
├── docs/
│   └── plans/          # phase plans live here (one file per phase)
├── PRD-quran-corpus-pwa.md
├── docs/PRD-android-first-mobile-app.md
└── CLAUDE.md
```

- `packages/data` is the single source of truth for schema and queries. **Web, mobile, and scraper all depend on it.** Never duplicate schema or query logic into an app.
- Keep `packages/data` free of any web, Next, Expo, or React Native imports so it stays portable across all three consumers.
- `packages/data` has three entry points and they are not interchangeable:
  - `.` — the full barrel. Pulls `@libsql/client`. Server and Node scripts only.
  - `./client` — browser-safe pure functions and types. Required in any file with `'use client'`; the barrel drags libsql into the client bundle and breaks hydration app-wide.
  - `./mobile` — read-only query subset with no `createDatabase`, migrations, or backfills. Required in `apps/mobile`; the barrel pulls the native libsql driver into the React Native module graph.
  - `tests/client-entry.test.ts` and `tests/mobile-entry.test.ts` guard those module graphs. Do not weaken them.
- `apps/mobile` depends on `packages/mobile-data`, which adapts the shared data API to Expo SQLite.
- **Forking a shared package is never the answer.** In July 2026 the Android app began life in a separate repo with copies of `packages/data` and `packages/config`; within two weeks the copy had lost the `trg_roots_sort_order_*` invalidation triggers, the `text/buckwalter.ts` trust-boundary validators, and 199 lines of `queries/roots.ts`. If a shared package does not fit a new consumer, change the shared package (§12).

-----

## 3. Engineering Principles (non-negotiable)

- **DRY** — no duplicated logic. Shared logic goes in `packages/`. If you copy-paste, stop and extract.
- **SOLID** — applies to all service/business-logic layers. Single responsibility per module; depend on interfaces, not concretions, for data sources (scraper sources, translation providers, audio providers must be swappable behind interfaces).
- **OWASP Top 10** — input validation at every boundary, output encoding, secure headers (CSP, HSTS, X-Content-Type-Options), dependency audit on every install, zero secrets in the client bundle, no eval/dynamic-source execution. Treat any future user-generated content (notes/bookmarks) as untrusted.
- **Source-agnostic data** — the normalized schema must not leak where data came from. Morphology, translations, and audio are joined on Surah:Ayah:Word, not on source-specific identifiers.

-----

## 4. The Mandatory Loop

Every unit of work (a feature, a fix, a module) follows this loop. Do not skip steps. Do not batch multiple features through one loop.

1. **Implement** — write code to spec, matching existing conventions.
1. **Self Review** — re-read the diff against DRY / SOLID / OWASP and this file. Check for duplication, leaked abstractions, missing validation.
1. **Quality Review** — run lint, type-check, and tests. All must pass. No `// @ts-ignore`, no disabled lint rules without an inline justification comment.
1. **Mutation-check new logic** — for a branch, loop, parser, or validator, delete the fix (or flip the condition) and confirm a test actually fails. A test that passes both ways asserts nothing, and that has slipped through twice (PRs #71, #73).
1. **Independent Review** — **only when §5 says the change needs one.** Most changes do not.
1. **Commit.**

Step 5 is **user-triggered**: the agent cannot launch `/code-review` itself. When a change meets a §5 trigger, the agent stops and asks the user to run it, then acts on the findings. Do not silently skip it because it needs a human keystroke — and do not invoke it for changes that fall outside the triggers.

If any step surfaces an issue, fix and **restart from step 2** for the affected code.

-----

## 5. Independent Review (scoped)

Independent review is **no longer a blanket gate**. It was one through
2026-08-15, and the ledger is unambiguous about what that cost: PR #75 took 25
review rounds, PR #71 took 7 with 11 of 29 findings withdrawn as wrong, and 30
of #75's 60 findings were against `STATUS.md` and a plan doc rather than code.
Much of the remaining effort went to detecting the reviewer's own fail-open
modes rather than to code quality. Pre-production, that trade stopped paying.

It still pays on a narrow slice, because the one failure mode self-review cannot
fix is the author being convinced by their own diff. On PR #5 an independent
read caught a `packages/data` §2 violation, two regressions introduced an hour
earlier, and an ayah-coordinate validator that had already passed self-review,
an OWASP check *and* a mutation-check. All three were data-layer or
input-validation defects. That is the slice worth keeping.

### When a change needs an independent read

Any one of these triggers it:

- **`packages/data` schema or queries** — the single source of truth; a mistake
  here reaches web, mobile and scraper at once.
- **Input validation or any trust boundary** — §3 OWASP applies, and this is the
  class the author is measurably worst at self-checking.
- **Anything writing the on-device user DB** — that file lives on a user's phone
  and survives app updates, so a bad row is not fixed by shipping a new build.
  "We are pre-production" does not apply to persisted device state.

Everything else — UI, styling, refactors, tests, docs, build scripts, plan files
— ships on §4's self-review plus lint/type-check/tests. Do not escalate on a
hunch; if a change is genuinely ambiguous, ask (§12) rather than defaulting to a
review round.

### How to run it

- `/code-review` is the tool, and it is user-triggered (§4). Plain
  `/code-review` is included in the Pro plan and runs locally — use it by
  default. `/code-review ultra` bills separately ($5-25/run); **never launch it
  without asking.**
- **One pass, not a loop to green.** Read the findings, fix what is real, and
  say plainly which ones are being declined and why. Re-run only when a fix was
  substantial enough to plausibly introduce a new defect — not to clear a
  scoreboard.
- Findings against prose (`STATUS.md`, plan docs, commit bodies) are advisory.
  Do not spend a round on them.

### CodeRabbit

Not the gate any more. It stays installed and may still comment on PRs; treat
its output as **advisory** — read it, fix what is real, never block on it, never
re-request a review to clear a stuck state, never poll for its status.

`.coderabbit.yaml` still points the bot at this file, so it will keep enforcing
rules written here. That is harmless while it is advisory. **If it is ever
restored as a blocking gate, re-read the fail-open signatures below first** —
each was observed live, and every one of them looks exactly like a pass:

- A rate-limited refusal posts a **green** status described `Review rate
  limited` (#59).
- A skipped review posts a **green** status reading `Review skipped: manual
  review required for this OSS repository`. Under 10 stars auto-review is off,
  so every push needs a bare `@coderabbitai review` — prose around it downgrades
  it to a chat reply.
- A quota-refused run submits an **empty `APPROVED`** under a green `Review
  approved` status (#75).
- A failed `mode: error` pre-merge check holds the PR with **no finding and no
  comment**; the reason lives only inside a collapsed `<details>` in the
  walkthrough (#59).
- A clean pass submits **no review object at all** (#63).
- Thread replies are review objects with **empty bodies**, so "a review exists
  at head" is not evidence that a review ran.
- "Outside diff range" findings have **no thread**, so an `APPROVED` never
  accounts for them (#75).
- Zero check-runs is a **lapse signature, not a pass**.

A gate that fails open in eight distinct ways, each indistinguishable from
success without reading a description string, has to be verified by hand every
single time. Retiring that labour is most of the point of this section.

### Greptile

Uninstalled in spirit — it was demoted to advisory on 2026-07-27 after its
50/month cap blew mid-review, and it has no role now. Its verdict gates nothing.

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

**Web (`apps/web`)**

- Next.js (App Router) + TypeScript + Tailwind CSS
- SQLite via Turso/libSQL (embedded; the embedded-replica model maps to the mobile local-first DB)
- Framer Motion for animation (Emil Kowalski-style interaction/motion patterns)
- next-intl (or equivalent) for UI i18n; translation *content* lives in the DB per `language_code`, decoupled from UI locale
- Self-hosted on Proxmox homelab via Docker, behind existing Caddy + Cloudflare Tunnel

**Mobile (`apps/mobile`)**

- React Native + Expo + TypeScript, Expo Router for navigation
- Expo SQLite over a bundled DB file first; keep a path open for versioned REST/API updates later
- Streamed audio only, through our own thin endpoint contract
- Builds go through EAS Build; the native `android/` and `ios/` directories are `expo prebuild` output and stay out of git

**Shared**

- Scraper: Python (Playwright/BeautifulSoup), isolated in `packages/scraper` — the only writer of the corpus DB
- DB-backed translation content keyed by `language_code`; UI i18n is separate and starts with English, Uzbek, and Russian

-----

## 8. Design Discipline

- **Design before code.** Mockups via the UI/UX design plugin first. On mobile, keep Android platform conventions while preserving the Quran Corpus brand.
- Apply the **Emil Kowalski** skill for motion/interaction detail (bottom sheets, easing, transitions, optimistic feel).
- Draw component/layout inspiration from **21st.dev** templates — adapt and recompose, never ship verbatim copies.
- **It must not look like AI slop.** Distinctive typography (proper Uthmani Arabic face + refined Latin face), a custom non-generic color system (warm paper light mode, low-contrast night dark mode), elegant mixed RTL/LTR handling.
- Animations: abundant but purposeful and performant (60fps target; respect `prefers-reduced-motion`).
- Accessibility: WCAG AA minimum.

-----

## 9. Commit Discipline

- **Conventional Commits** for every commit: `type(scope): subject`.
  - Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `style`, `build`, `ci`.
  - Scope = package or area, e.g. `feat(scraper): ...`, `fix(web/word-popover): ...`, `chore(data): ...`, `feat(mobile): ...`, `fix(mobile-data): ...`.
- One logical change per commit. Commit only after §4's loop completes — including an independent review when §5 calls for one.
- Imperative mood, concise subject (≤ ~72 chars). Body explains *why* when non-obvious; reference review false-positive justifications here.
- Never commit secrets, scraped raw HTML dumps, or large binary data into git (use `.gitignore`; raw scrape snapshots live outside version control or in a data artifact store).

-----

## 10. Testing

- Unit tests for `packages/data` (data-access layer) and scraper parsing/morphology logic.
- Component tests for key interactive UI on both apps: word morphology popover, language switcher, audio player.
- Playwright E2E smoke test for the core reading flow on a mobile viewport (`apps/web`).
- `apps/mobile` has no emulator in CI, so its equivalent gate is the on-device smoke checklist in `README.md`. A milestone is not complete until that checklist has been run on real hardware and the result recorded in the phase plan's verification log — "implementation complete, verification pending" is an unmet exit criterion, not a pass.
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

-----

## 15. Agent Skills Configuration

Machine-readable config for the installed engineering skills, under `docs/agents/`.
These files tell a skill *where* things live; they do not grant it authority. §4 and
§5 still govern review — in particular, `mattpocock-skills:code-review` is an
additional reader, **not** a substitute for the scoped `/code-review` that §4 and
§5 require on data-layer and trust-boundary changes.

### Issue tracker

GitHub Issues on `J3ff4/quran-corpus`, via the `gh` CLI. See
`docs/agents/issue-tracker.md`. Note that opening a *PR* remains the user's call
(never `gh pr create` unprompted); that restriction does not extend to issues.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root, both created lazily by
`/domain-modeling` when a term or decision actually needs recording. Neither exists
yet, and their absence is not a gap to fill. §2 remains the authority on package
boundaries; `CONTEXT.md` covers domain vocabulary only. See `docs/agents/domain.md`.

Triage labels are intentionally unconfigured — the `triage` skill is not registered
here. Re-run `/mattpocock-skills:setup-matt-pocock-skills` if that changes.