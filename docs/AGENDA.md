# AGENDA — standing backlog & status

Recovery doc. If a session is lost, read this to see where we stand. Derived
from the user's 2026-07-06 backlog review. Keep updated as items close.

## Legend
✅ done · 🔧 in progress · 📋 planned/spec'd · ⬜ not started · 🔁 needs re-test

---

## Done (PR #19 `phase-09-perf-overhaul` — Greptile passed, ready to merge)

- ✅ **Search dead / wouldn't open / "non-reactive".** Root cause: dev CSP blocked
  `eval` → Next Fast-Refresh threw → zero hydration → every client control dead.
  Fix `3bac067` (dev-only `unsafe-eval`).
- ✅ **libsql in client bundle** (separate hydration hazard). Fix `9f4cb96`
  (browser-safe `@quran-corpus/data/client` entry). See [[data-client-barrel-poison]].
- ✅ **Dictionary loaded all ~1,600 roots (slow).** Capped to 100 + Show-more,
  filter/sort still over full list. Fix `d8f5283`.
- ✅ **Concordance Load-more silent failure + no abort.** Error surfaced +
  AbortController. Fixes `9053c19`, `7bf0186`.

## Done — ✅ Phase 10: Dictionary Data Correctness
Spec/plan: `docs/superpowers/{specs,plans}/2026-07-06-dictionary-data-correctness*`.
- ✅ **Parser fabricated junk forms.** `corpus_dictionary._extract_forms` grabbed
  the See-Also `ul.also` (external dict links) as forms. Fixed: scan all
  `ul.also`, keep only `<li>` with a `<span class="at">`. (`fc9eff7`)
- ✅ **occurrence_count wrong for 1,399 roots.** Re-derived from `word_segments`
  via idempotent `fix-root-data` CLI. Applied to canonical DB: **1,399 counts
  updated, 714 junk forms deleted, 3,945 real forms remain.** AC all pass
  (Abd=28, Aty=549, ktb=319, Amm=119; 0 mismatches; 0 null forms; re-run 0/0).
  (`37057a7`, `5b8bb1a`)
- ✅ **Query guard.** `getRootForms` excludes `form_arabic IS NULL`; empty
  derived-forms section already hidden by `RootEntry.tsx`. (`de37cfa`)

## Backlog — ⬜ not yet scoped into a phase

### Performance
- ⬜ **Home / Read / tab-switch slow.** Only tested on the dev server (`:3939`),
  which is un-minified + recompiles per navigation. **Next step: build+run a
  production build (`next build && start`) and re-judge** before treating as a
  real problem. Then, if still slow: bundle analysis, code-split, framer-motion
  weight, route JS size.

### Concordance / dictionary UX
- ⬜ **Verse truncation** (screenshot 46). Concordance shows whole ayahs (e.g.
  2:282 — longest verse). Decision: **clause-trim** — trim around the matched
  word to Arabic clause boundaries (و / إذا / إن / من / إلى …), aim ~one line,
  tap to expand full verse. Example anchors: 2:282:8, 2:282:86.
- ⬜ **Prev/next root arrows** in the dictionary root page (navigate between
  roots; order = current sort — confirm alphabetical vs frequency at plan time).
- ⬜ **Pill-letter centering** (screenshot 2922). Root-letter pills not
  horizontally centered. CSS.
- ✅ **Dictionary "load more does nothing."** Re-tested on a **prod build**
  (2026-07-07, Phase 11 Task 1): no repro. Concordance Load-more API pages
  cleanly (total 35, page1 20 + page2 15, offset-past-end 0, zero overlap, 35
  distinct); Show-more + ConcordanceList append covered by 18/18 component tests.
  Logic/API sound. (Visual jank spot-check left to user; not a code bug.)
- ⬜ **Concordance undercounts compound secondary roots.** occurrence_count
  (from `word_segments`, corpus-correct) counts a compound word's secondary root;
  the concordance query uses `words.root_buckwalter` (primary root only), so it
  omits that occurrence. Visible on root `Amm` (أ م م): header 119, list 118
  (missing يَبْنَؤُمَّ 20:94:2). Pre-existing; only 1 root's total is affected.
  Fix later by basing concordance on `word_segments`.

## Housekeeping
- Merge PR #19 (Greptile green). Compact after phase per CLAUDE.md §13.
- Untracked, never commit: `STATUS.md`, `docs/handoff-2026-07-05-scraper-data-fill.md`.
