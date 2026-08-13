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

## 4. The Mandatory 6-Step Loop

Every unit of work (a feature, a fix, a module) follows this loop. Do not skip steps. Do not batch multiple features through one loop.

1. **Implement** — write code to spec, matching existing conventions.
1. **Self Review** — re-read the diff against DRY / SOLID / OWASP and this file. Check for duplication, leaked abstractions, missing validation.
1. **Code Review** — run `/code-review` on the change. This is the first *independent* read of the diff; self-review is the agent grading its own work. Plain `/code-review` is included in the Pro plan and runs locally — use it by default. `/code-review ultra` bills separately ($5–25/run) and is reserved for changes where a missed bug is expensive; never launch it without asking.
1. **Quality Review** — run lint, type-check, and tests. All must pass. No `// @ts-ignore`, no disabled lint rules without an inline justification comment.
1. **Automated Review** — run the review gate on the change (CodeRabbit; see §5).
1. **Final Review** — re-review after fixes; confirm no regression, then commit.

Step 3 is **user-triggered**: the agent cannot launch `/code-review` itself. When the loop reaches it, the agent stops and asks the user to run it, then acts on the findings. Do not silently skip the step because it needs a human keystroke.

If any step surfaces an issue, fix and **restart from step 2** for the affected code.

-----

## 5. Automated Review Gate (HARD BLOCK)

**CodeRabbit is the gate.** Greptile stays installed for now so the two can be
compared over a few PRs, but it is advisory — it does not block, and it cannot
gate anyway (see below).

- Run the review on every meaningful change. Config lives in `.coderabbit.yaml`;
  it points CodeRabbit at this file, so **rules added here are enforced by the
  bot** — keep the two in sync.
- **A change is blocked until CodeRabbit raises no unresolved findings.** Never
  proceed, never merge, never move to the next task while one is outstanding.
  `request_changes_workflow` is on, so this shows up as a requested-changes
  state rather than a score. **The author may never override it** —
  `override_requested_reviewers_only: true` removes the self-grant path
  CodeRabbit otherwise offers. CodeRabbit has no setting that forbids an
  override outright: the one remaining path is a *requested reviewer*
  dismissing a failed check. This repo requests none, so today that path is
  empty — if a human reviewer is ever added, they inherit the only override
  that exists, and this rule is what tells them not to use it.
- Address every finding: fix it, or — if it is a false positive — reply to the
  bot's comment saying why, and record the same reasoning in the PR/commit body.
  Replying teaches it; a silent dismissal does not.
- **Re-run after fixes.** A claimed fix without a fresh review does not count.
- **Distinguish "no findings" from "never ran."** Zero check-runs / zero comments
  is a lapse signature, not a pass — confirm the bot actually reviewed the head
  commit before treating silence as approval. Greptile's 50/month free cap hit
  mid-review on PR #58 and produced exactly this, which is why it can no longer
  be the gate: a quota-limited reviewer fails open.
- CodeRabbit's free tier covers **unlimited public repositories** — that is a
  repository-count allowance, not a review-volume one. **Review volume stays
  plan- and rate-limit dependent** (reviews/hour, with a separate open-source
  tier). So a paused, rate-limited or missing review is still possible, and
  still counts as **blocked, never passed**. Going public does not retire this
  rule; check the review actually ran.
- The config is set to fail closed: `fail_commit_status: true` turns a
  review-service error into a red status instead of a silent green, and
  `auto_pause_after_reviewed_commits: 0` stops it from quietly giving up on a
  branch after five commits and letting a later fix land unreviewed, and
  `drafts: true` overrides a default that skips draft PRs entirely — otherwise
  work can be pushed, reviewed by nobody, and marked ready with only the final
  diff ever seen. **It does
  not cover the rate limit.** Observed on PR #59 (2026-07-28): a review refused
  for quota posted a **green `success`** status whose description read `Review
  rate limited` — the state is indistinguishable from a pass unless the
  description is read. Read it; wait for the quota; re-request.
- **`.coderabbit.yaml` is part of the diff it governs**, so a PR can weaken its
  own gate — deleting `request_changes_workflow`, or filtering its own files out
  of review. CodeRabbit's answer is an org/workspace global override, which
  outranks the repo file; this repo is owned by a personal account, which has no
  organization tier to host one, so that fix is unavailable today. Until it
  exists, treat any diff touching `.coderabbit.yaml` or this section as
  self-modifying: review the gate change on its own merits before the code it
  would let through, and never in the same PR as work that benefits from the
  loosening.
- **Read the pre-merge check table, not just the review verdict.** A failed
  `mode: error` check holds the PR in requested-changes with no finding and no
  comment attached to it — the reason lives only inside a collapsed `<details>`
  block in CodeRabbit's walkthrough comment. On PR #59 (2026-07-28) that was the
  title check, failing for a missing Conventional Commits scope while the review
  itself read "No actionable comments were generated"; two re-reviews were spent
  guessing before anyone opened the block, and the second exhausted the quota for
  48 minutes. Before re-requesting a review to clear a stuck state, open the
  walkthrough and find which check failed — re-running does not re-read what you
  have not fixed.

### Greptile (advisory, being retired)
- Free plan: 50 reviews/month. Quota exhaustion looks like 0 check-runs.
- Findings are still worth reading during the comparison window; they do not
  block, and its verdict does not substitute for CodeRabbit's.

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
- One logical change per commit. Commit only after the 6-step loop completes and the review gate passes (§5).
- Imperative mood, concise subject (≤ ~72 chars). Body explains *why* when non-obvious; reference review false-positive justifications here.
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

-----

## 15. Agent Skills Configuration

Machine-readable config for the installed engineering skills, under `docs/agents/`.
These files tell a skill *where* things live; they do not grant it authority. §4 and
§5 still govern review — in particular, `mattpocock-skills:code-review` is an
additional reader, **not** a substitute for §4 step 3 (`/code-review`) or the §5
CodeRabbit gate.

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