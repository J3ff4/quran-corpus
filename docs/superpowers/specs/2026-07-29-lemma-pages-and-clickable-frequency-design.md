# Lemma Pages + Clickable Frequency/Verb-Concordance (Design Spec)

**Date:** 2026-07-29
**Branch (to create):** `feat/lemma-pages`
**Goal:** Make `/dictionary/lemma-frequency` and `/dictionary/verb-concordance` rows clickable. Each row → a new per-lemma page showing that exact lemma's meaning + occurrences. Row count == destination count (kept promise).

Origin: user request — freq/verb pages are static lists; rows need links. Verb → root was the first idea, refined to per-lemma (row count matches only at lemma granularity; root page is the whole family, a different, larger number). Phase-19 API deferred.

## Global Constraints

- Canonical/live DB on this machine: `d:\coding\quran-corpus-pwa\quran-data\quran.db` (134M). App reads `apps/web/quran.db` (overwritten copy of it, gitignored). **Reads only this phase — no DB writes, no schema change.** Verified: 4832 distinct lemmas, 175 rootless, **0 lemmas map to >1 root**, 1642 roots, 1386 `root_definitions` rows.
- `packages/data` stays web/Next-agnostic (portable to future `apps/mobile`). No Next imports.
- Client components import from `@quran-corpus/data/client`, never the barrel (libsql poison). See `[[data-client-barrel-poison]]`. Freq pages + lemma page are **server** components (`force-dynamic`), so barrel import is fine there; any client child must use `/client`.
- 6-step loop per unit (CLAUDE.md §4). `/code-review` is user-triggered (step 3) — stop and ask.
- CodeRabbit gate (§5): no unresolved findings before merge. Conventional Commits. Commit **named paths only** — never `git add -A`. Never commit `STATUS.md` or `quran.db`.
- Subagents: Sonnet floor; **do not spawn unless user explicitly asks.**

## Architecture

Three units, order **A → B → C**. A = data layer (queries + tests, portable, foundation). B = new lemma page route (consumes A). C = wire the two frequency pages to link (consumes A for hrefs, B for targets).

Data-layer changes: new `packages/data/src/queries/lemma.ts` (or extend `dictionary.ts`) + tests. UI in `apps/web`. Reuse the root page's `ConcordanceEntry` shape and concordance-list component — do not duplicate (DRY, CLAUDE.md §3).

Param key everywhere = `lemma_buckwalter` (URL-encoded). Unique — 0 lemmas map to >1 root; no collision.

---

## Unit A — Data layer (`packages/data`)

New queries. All filter on `words.lemma_buckwalter`. No schema change, reads only.

### `getLemmaEntry(db, lemmaBw, lang = 'en'): Promise<LemmaEntry | null>`
Returns null if lemma has zero occurrences.
Fields:
- `lemma` (Arabic — `words.lemma`, falling back to `buckwalterToArabic(lemma_buckwalter)`, **not** the raw Buckwalter key: the header renders this in the RTL Arabic display face, where a Latin string looks broken), `lemma_buckwalter`, `transliteration` + `pos_tag`. **The latter two are NOT constant per lemma** — 2349 of 4832 lemmas carry more than one transliteration, 304 more than one POS tag, since every inflected and prefixed occurrence shares the lemma. "Pick deterministically, e.g. MIN over occurrences" (this spec's first wording) is not enough: MIN is deterministic but arbitrary, and shipped مَا with the transliteration `bimā`, proclitic attached. Take the most frequent **(transliteration, pos_tag) pair** — as a pair, so the two cannot come from different occurrences. Known ceiling: mode is not a citation form (`{ll~ah` → `l-lahi`).
- `root_buckwalter` (nullable — 175 rootless lemmas).
- `count` (total occurrences of the lemma).
- `top_gloss` (nullable): the single most-frequent `word_glosses.gloss_text` for this lemma + `lang`, **verbatim** (raw, incl. any trailing comma — user's call). Tie-break deterministic (e.g. ORDER BY n DESC, gloss_text).
- `root_definition` (nullable): Lane's Lexicon definition for the lemma's root — join `words → roots (via root_buckwalter) → root_definitions`. Null when rootless or no def row.

### `getLemmaConcordancePage(db, lemmaBw, { limit, offset, lang }): Promise<ConcordanceEntry[]>`
Reuse the existing `ConcordanceEntry` type/shape from the root concordance: `surah_id, ayah_number, position, word_id, text_arabic, transliteration, gloss, verse_words, form_id`. (No `ayah_id` — it is the internal join key for the verse rebuild and never reaches the returned entry.) Filter `WHERE w.lemma_buckwalter = ?`. Same ordering (surah, ayah, position) + limit/offset as root concordance. `form_id` is always `null` — form-chips are root-only and out of scope here; the field stays on the shared type rather than being omitted.

### `countLemmaConcordance(db, lemmaBw): Promise<number>`
`SELECT COUNT(*) FROM words WHERE lemma_buckwalter = ?`. Must equal the frequency-table row count for that lemma.

### Amend existing (expose href key)
- `getLemmaFrequency` already selects `lemma_buckwalter` — confirm it's on the returned `LemmaFrequencyEntry` type; add if missing.
- `getVerbConcordance` — add `lemma_buckwalter` to SELECT + return type (currently returns `lemma`, `form_arabic`, `count`; grouped by `lemma_buckwalter` already).

### Types (`packages/data/src/types.ts`)
Add `LemmaEntry`. Extend `LemmaFrequencyEntry` / `VerbConcordanceEntry` with `lemma_buckwalter` if absent. Export new queries from `src/index.ts` (barrel) and, if any client component needs the types, from `src/client.ts`.

### Tests (`packages/data/tests/lemma.test.ts`, in-memory DB + runMigrations)
- `getLemmaEntry`: known lemma → correct count, top_gloss, root_definition; **rootless lemma → root_buckwalter null AND root_definition null**; unknown lemma → null; top_gloss picks the most-frequent gloss for the given lang; lang param switches gloss language.
- `getLemmaConcordancePage`: rows match lemma, ordering, paging (limit/offset).
- `countLemmaConcordance`: equals number of seeded occurrences; unknown → 0.
- Amended queries expose `lemma_buckwalter`.

**Build note:** after editing `packages/data`, run `pnpm --filter @quran-corpus/data build` — web imports the built `dist/` (stale dist was today's `/client` 500). See `[[data-package-needs-build]]`.

---

## Unit B — Per-lemma page (`apps/web`)

New route `apps/web/src/app/dictionary/lemma/[lemma]/page.tsx`. `export const dynamic = 'force-dynamic'`. Mirrors `/dictionary/[root]/page.tsx` structure.

- `params` is `Promise<{ lemma: string }>` (async route params). **Do not decode** — the App Router already did, and decoding twice aliases `qa%2541la` onto `qaAla` (a real entry served under a non-canonical, separately-cached URL). `const { lemma: bw } = await params`, then `if (!isLemmaBuckwalter(bw)) notFound()`; `%` is outside the charset, so the validator rejects stray escapes on its own.
- `getLemmaEntry(db, bw)`; if null → `notFound()`.
- First concordance page: `getLemmaConcordancePage(db, bw, {limit: CONCORDANCE_PAGE_SIZE, offset: 0})`. Reuse `entry.count` for the total (equals `countLemmaConcordance`), no second count query.
- Render a `LemmaEntry` component (new, modelled on `RootEntry`), showing in order:
  1. **Header**: lemma Arabic (large, RTL), transliteration, POS, total count.
  2. **Quick meaning**: `top_gloss` verbatim (when present). Skip block if null.
  3. **Root definition**: when `root_definition` present — labelled as root-level ("Definition of root …") with an up-link `→ /dictionary/[root_buckwalter]`. Omit entirely when rootless.
  4. **Concordance**: paged occurrence list, reusing the existing concordance-list component. Each row links to `/word/[surah]/[ayah]/[position]`.
- **No** form-filter chips. **No** prev/next nav (lemmas have no canonical linear order — root's hijāʾī sort_order has no lemma analogue).

**Reuse:** extract/share the concordance list + paging component the root page uses rather than copy. If the root page's concordance is tightly coupled to `RootEntry`, factor the list into a shared child both consume.

### Tests (`apps/web/src/test/LemmaPage*.test.tsx` / component test)
- Renders header + quick meaning + concordance for a rooted lemma.
- **Rootless lemma: root-definition block absent, no up-link.**
- Null top_gloss: quick-meaning block absent, page still renders.

---

## Unit C — Wire frequency pages to link

`FrequencyTable` (`apps/web/src/components/dictionary/FrequencyTable.tsx`) gains an **optional** per-row href. Backward-compatible — existing callers without href render plain text (no regression to any other `FrequencyTable` user).

Approach: extend `FrequencyRow` with optional `href?: string`. When present, wrap the label in a Next `<Link>`; else plain `<span>` as today. Keep Arabic dir/rtl + styling identical.

- `lemma-frequency/page.tsx`: map each row → `href: /dictionary/lemma/${encodeURIComponent(lemma_buckwalter)}`.
- `verb-concordance/page.tsx`: same → per-lemma page (final decision: verb rows go to lemma page, not root). Row already grouped by lemma; use its `lemma_buckwalter`.
- Rows whose `lemma_buckwalter` is null (shouldn't occur — both queries filter/group on it) → render plain, no link (defensive).

### Tests
- `FrequencyTable`: renders `<a>` when row has href, plain text when not (pin backward-compat).

---

## Acceptance Criteria (testable)

1. `/dictionary/lemma/<bw>` for a known lemma renders header, count == `countLemmaConcordance`, top gloss, and (if rooted) root definition + root up-link. Unknown lemma → 404.
2. Rootless lemma page renders with **no** root-definition block and **no** root up-link.
3. Every row on `/dictionary/lemma-frequency` and `/dictionary/verb-concordance` is a link to the matching lemma page; the tapped count equals the destination's total.
4. `FrequencyTable` with no href renders exactly as before (other callers unaffected).
5. Data tests + web component tests pass; `tsc --noEmit` clean; eslint clean. `packages/data` rebuilt so web resolves new exports.

## Out of Scope (YAGNI)

Form-filter chips on lemma page; prev/next lemma nav; a real lemma-level dictionary import; lemma search integration; phase-19 API; touching root page behavior beyond extracting a shared concordance-list child.

## Risks / Rollback

- **Risk:** root page's concordance list too coupled to extract cleanly → fallback: a thin lemma-specific list component that shares the row renderer only. Rollback: new route + query are additive; deleting the route + reverting `FrequencyTable`'s optional href restores prior state (no schema/data change).
- **Risk:** stale `packages/data/dist` → runtime module-not-found (hit today). Mitigation: rebuild step in Unit A, called out in acceptance #5.
