# Phase 11 — Dictionary/Concordance UX + Correctness (Design Spec)

**Date:** 2026-07-07
**Branch (to create):** `phase-11-dictionary-concordance-ux`
**Goal:** Concordance verses trimmed & readable, root pages navigable, root/concordance counts consistent, letter-pills centered.

Sourced from `docs/AGENDA.md` "Concordance / dictionary UX" backlog (items 2,3,4,5,6). Perf item 1 explicitly out of scope (separate spike later).

## Global Constraints

- Canonical DB `/home/claude/quran-data/quran.db`; `apps/web/quran.db` is a symlink to it. **Back up (`.bak`) before any data write; no concurrent scraper writers.** (Only Unit A/B touch reads, not writes — no DB mutation expected this phase; a spike reads only.)
- `packages/data` stays web/Next-agnostic (portable to future `apps/mobile`). No Next imports.
- Client components import from `@quran-corpus/data/client`, never the barrel (libsql poison). See `[[data-client-barrel-poison]]`.
- TDD: RED → GREEN → COMMIT per unit. Conventional Commits. Commit **named paths only** — never `git add -A`.
- Never commit `STATUS.md` or `docs/handoff-*.md` (keep untracked).
- Greptile §5 = 5/5 (check pass) hard block before merge.
- Subagents: Sonnet floor; **do not spawn unless user explicitly asks.**

## Architecture

Five independent units. Order: **E → A → C → D → B**. Rationale: E is a verification that may enlarge scope (know early); A/C/D are self-contained wins; B is spike-gated and may reshape, so last.

Data-layer changes live in `packages/data/src/queries/roots.ts` + tests. UI in `apps/web`. Clause-trim logic is a pure, portable function in `packages/data` (unit-testable, mobile-reusable).

---

## Unit A — Concordance compound-root fix (item 6)

**Problem.** `countRootConcordance` and `getRootConcordancePage` (`packages/data/src/queries/roots.ts`) match `words.root_buckwalter` = primary root only. Compound words whose *secondary* segment carries the root are omitted. Visible: root `Amm` (أ م م) header 119, concordance list 118, missing يَبْنَؤُمَّ (20:94:2, primary root `bny`, secondary segment `Amm`).

**Fix.** Match on `word_segments.root`:
- `countRootConcordance`: `SELECT COUNT(DISTINCT w.id) FROM words w JOIN word_segments s ON s.word_id = w.id WHERE s.root = ?`
- `getRootConcordancePage`: same `JOIN ... WHERE s.root = ?`, `DISTINCT w.id`, preserve existing surah/ayah/position ordering + limit/offset. Verse rebuild (verse_words) unchanged.

**Consistency.** Root-page header uses `roots.occurrence_count` (segment-count, corpus-verified 119). Concordance now counts distinct matching *words*. For Amm both = 119.

**Residual ceiling.** A single word carrying the same root in two segments would make distinct-word count < segment occurrence_count (off-by-one). Nonexistent in corpus. Note in a `ponytail:` comment; do not engineer around it.

**Tests** (`packages/data/tests/roots.test.ts`):
- Seed a compound word (primary root `bny`, second segment root `Amm`) + standalone `Amm` words → `countRootConcordance('Amm')` includes the compound; list contains its word_id.
- A plain single-segment root: count/list unchanged from before.
- Existing "two matches in one ayah → two entries" still passes (DISTINCT w.id must not collapse two different words).

---

## Unit B — Concordance clause-trim (item 2) · SPIKE-GATED

**Intent.** Long verses (e.g. 2:282, longest in Quran) dominate the concordance list. Trim each verse to ~one line around the matched word; tap to expand full verse. Matched word **always** visible and centered (concordance's whole purpose).

**Boundary detection = corpus grammar, not string matching.** `word_segments.pos_tag` carries `CONJ` (coordinating conj., و/ف/ثم) and `SUB` (subordinating). A word *starts a new clause* if its first segment's `pos_tag` is in a boundary set (candidate: `{CONJ, SUB}`, spike may extend, e.g. `REM`/`CIRC`). This avoids the fragile attached-prefix problem (وَ is a segment, not a standalone token).

**Spike (throwaway, gates the rest).**
- Script over canonical DB (read-only). Inputs: anchors 2:282:8, 2:282:86, plus a spread of roots/verses (short + long).
- Compute clause window per anchor using the boundary predicate; print trimmed Arabic with the match marked.
- **Human eyeball: do the trimmed phrases read sensibly** (coherent clause, match in context, not cut mid-thought)?
- Record the decision + chosen boundary set in the implementation plan.

**Gate outcome.**
- ✅ Sensible → productionize (below).
- ❌ Not sensible → **fallback: word-window ±4** (9 words, match centered), same expand UI. No grammar dependency.

**Productionized (if spike ✅).**
- Query: `getRootConcordancePage` verse_words gain a per-word `starts_clause: boolean` (EXISTS on first segment pos_tag ∈ boundary set). Pure function decides the window.
- Pure fn `trimToClause(words, matchWordId) → { words, truncatedBefore, truncatedAfter }` in `packages/data` (portable, no Next). Window = from the boundary at/left of match to the boundary right of match; if that clause still exceeds a cap (e.g. > 12 words), fall back to ±4 within it.
- UI: `ConcordanceItem` renders trimmed words + `…` on truncated sides; tap/expand toggles full verse. Framer height/opacity transition, `prefers-reduced-motion` respected.

**Tests.**
- `trimToClause` (or `wordWindow` fallback): match at verse start/middle/end → window includes match, correct truncation flags, never drops the match.
- Long verse (no nearby boundary) → cap applies.
- Component: default trimmed, expand shows all words.

---

## Unit C — Prev/next root arrows (item 3) · data + UI

**Order = fixed hijāʾī (alphabetical)**, regardless of arrival path (user decision). One stable neighbor lookup.

- `getRootNeighbors(db, buckwalter) → { prev: string | null, next: string | null }` in `packages/data/src/queries/roots.ts`, reusing the **existing hijāʾī ordering** from `getAllRoots` (do not re-derive a second ordering — DRY). Returns adjacent roots' `root_buckwalter`.
- UI: root page header gains ← → controls linking to `/dictionary/root/[prevBw]` / `[nextBw]`. **Ends: disable (no wrap)** — first root has no prev, last no next.
- Tests: middle root → both neighbors; first → prev null; last → next null; unknown root → both null.

---

## Unit D — Pill-letter centering (item 4) · CSS

Letter-pill row (dictionary letter filter) not horizontally centered (screenshot 2922). Center the pill container (`justify-content: center` / grid centering). Visual-only, no logic. Verify in build; no unit test (trivial).

---

## Unit E — Load-more re-test (item 5) · verification

Dictionary Show-more + concordance Load-more were reimplemented since the original report. Run current **production** build (`next build && start`), exercise both. Reproduces → open a real bug task (root-cause, TDD). Does not reproduce → close the AGENDA item. No code by default.

---

## Testing summary

- `packages/data`: vitest for Units A, B (pure fn + query), C.
- `apps/web`: component test for clause-trim expand (B) if productionized; manual/build check for D, E.
- Each unit: full gates green (data: eslint + tsc + vitest) before its commit; Greptile 5/5 before merge.

## Risks / rollbacks

- **A** changes match semantics → could shift other roots' concordance counts slightly (any root with compound secondary occurrences). Expected + correct; spot-check a few roots stay stable. Rollback = revert query to `words.root_buckwalter`.
- **B spike ❌** → word-window fallback (already specced); no blocker.
- **C** ordering must exactly match `getAllRoots` or arrows disagree with the list → enforced by reusing that function, not duplicating sort.

## Acceptance criteria (testable)

1. `countRootConcordance('Amm')` = 119 and its concordance list length (all pages) = 119; matched word set includes word at 20:94:2.
2. A long concordance verse renders trimmed to a short window with the matched word visible + centered; tapping expands to the full verse; collapses back.
3. Root page shows ← → arrows stepping hijāʾī order; disabled at first/last root; links land on the correct neighbor.
4. Dictionary letter-pill row is horizontally centered on mobile viewport.
5. Load-more re-test outcome recorded (fixed-or-not); if bug reproduces, a tracked fix ships with a regression test.
