# Phase M7 — Paged Mushaf

> **For agentic workers:** this is the phase brief, not an executable plan. Executable
> plans live in `phase-m7a-mushaf-spike.md`, then `phase-m7b-*.md` and `phase-m7c-*.md`,
> which are authored **after** M7a reports.

**Goal:** replace the reader's continuous-scroll mushaf with a real 604-page mushaf built
from imported page-layout data and per-page glyph fonts.

**Spec:** `docs/PRD-android-first-mobile-app.md` §10 (renumbered, below) + the owner
rulings in this file. Rulings here are binding and were answered 2026-09-07; do not
re-litigate them.

**Tech:** Expo/RN, `expo-font` lazy registration, `react-native-pages`-style horizontal
pager (Reanimated, already a dep), SQLite via `packages/mobile-data`, Click importer in
`packages/scraper`.

---

## PRD renumbering

Mushaf takes M7. Everything after shifts one:

| was | now |
|-----|-----|
| M7 release hardening | **M8** |
| M8 treebank | **M9** |
| M9 iOS | **M10** |

Update PRD §10 in M7a's PR, not later.

---

## Why imported, not computed

`ayahs.page` (1..604) and `ayahs.juz` are populated for all 6236 rows, so page
*boundaries* are known. Nothing in the schema goes below ayah→page: no word→line, no
word→position. RN cannot kashida-justify Arabic, so flowing our Hafs text into a 15-line
box gives ragged lines with wide word gaps. Printed fidelity comes from per-page
pre-shaped glyphs (KFGQPC/QPC), which is **data we import**, never layout we derive.

Source: QUL (`qul.tarteel.ai`). Layout ships as SQLite/JSON — a `pages` table with
`page_number`, `line_number`, `line_type` (`ayah` | `surah_name` | `basmallah`),
`is_centered`, `first_word_id`, `last_word_id`, `surah_number`. Fonts are 604 per-page
files (TTF/WOFF/WOFF2); rendering needs a per-word glyph string (`code_v1`/`code_v2`)
plus `page_number` + `line_number`.

---

## Global Constraints

- **Bundle everything in the APK.** No download-on-demand, no new endpoint. Budget:
  **up to ~40MB** of APK growth for fonts + layout, whatever the chosen edition needs.
- **Schema goes in `quran.db`** — a new layout table plus glyph-code column(s) on
  `words`. Not a second DB file. Migration is **additive only**.
- Importer lives in `packages/scraper` (§7: the only writer of the corpus DB), modelled
  on the existing `import-qul` Click command in `scraper/cli.py`.
- Queries live in `packages/data`, exported through `./mobile`. `apps/mobile` never
  writes its own SQL (§2).
- Ornament geometry that both apps draw goes in `packages/config/ornaments/` beside
  `medallion.ts` (§3). The web's `SurahFrame` is CSS-only and cannot be shared as-is.
- i18n in all three locales as we go (en/uz/ru), owner reviews uz/ru at the end.
- One plan file, one PR, one preview APK **per sub-phase**. Main may sit half-built
  between merges.
- Device checklist continues at **191**.

---

## Owner rulings (2026-09-07)

| # | Decision | Ruling |
|---|----------|--------|
| 1 | Approach | Spike first, then decide. No production code until M7a reports. |
| 2 | Delivery | Bundle everything in the APK. |
| 3 | Scope | Paged mushaf only. Translation mode untouched — its own later phase. |
| 4 | Page actions | Tap a word → existing bottom sheet; the sheet grows the ayah actions (bookmark, note, play). No control chrome on the page. |
| 5 | Edition | Spike renders V1/V2/V4 on the owner's phone; owner picks from screenshots. |
| 6 | Scroll mushaf | **Paged replaces it outright.** `MushafAyah` and its scroll path are deleted. |
| 7 | Page turn | Horizontal pager, **RTL** — swipe right-to-left advances, like the book. |
| 8 | Size budget | Up to ~40MB, whatever the chosen edition needs. |
| 9 | Licence risk | **Ship it anyway, note the risk.** Same call as Hans Wehr. Attribution in About/Credits. |
| 10 | Navigation | **Model A** — one 604-page pager; a surah is an entry point, not a boundary. Pager crosses surahs freely. `/surah/[surahId]` kept as the entry door. |
| 11 | Chevrons | Jump to previous/next **surah's first page**. Swipe does page-by-page. |
| 12 | TalkBack | **Per ayah**, labelled with real Uthmani text + ayah number. Lines hidden from the reader. |
| 13 | POS colour | Not on the page. Print has no grammar colouring; colour lives in WBW. |
| 14 | Schema home | New table + new column(s) in `quran.db`. |
| 15 | Reading position | Store the **page**; display it as the surah/ayah that page opens with. Fixes #59 — a page turn is an unambiguous write point. |
| 16 | Structure | Three sub-phases: **M7a** spike → **M7b** data → **M7c** UI. |
| 17 | Landing | Open the page, **pulse** the target ayah, fade the pulse out. |
| 18 | Audio | Highlight the playing ayah **and auto-turn** at the page boundary. |
| 19 | Bookmarks | A bookmarked ayah is **highlighted** on the page (persistent wash). |
| 20 | Highlights | **Three distinct treatments, all can show together.** Bookmark = faint warm wash (persistent). Landing = stronger pulse, fades. Audio = accent tint, moves. |
| 21 | Surah band | Our own `Sura_border` — the same arabesque the web `SurahFrame` draws. Not KFGQPC's surah-name font. |
| 22 | Footer | Page number + juz. Both already in schema; no hizb import. |
| 23 | Page-number ornament | **Owner will source it.** Interim: reuse `medallion-1` as a stand-in, marked as a stand-in in the PR body so review does not read it as final. |
| 24 | Reduced motion | **Same animation, just faster.** Owner override of the §8 default — recorded here so no reviewer re-opens it. |

### Ruling 24 — the conflict, on the record

CLAUDE.md §8 says respect `prefers-reduced-motion`, and WCAG AA treats a shortened
slide as still-moving. The owner was shown that conflict and chose the faster slide
anyway. This is an owner override of §8 for the page-turn transition only. It does not
widen to any other animation, and it is not a precedent.

---

## Architecture

**One pager, 604 pages.** `MushafPager` owns a horizontal RTL pager over pages 1..604.
Every entry point resolves to a page number before it reaches the pager:

```
/surah/5              -> min(page) where surah_id=5          -> page 106
/surah/5?ayah=27      -> page of (5,27), + pulse target      -> page 111
bookmark, search hit  -> same ayah->page hop
continue-reading card -> stored page directly
chevron               -> min(page) of the adjacent surah
```

`ayahs.page` is already indexed by the browse query; the ayah→page hop is one lookup.

**One page renders from layout rows, not from ayah rows.** A page is 15 line records.
Each `ayah` line names a word-id range; the renderer pulls those words, joins them into
one `Text` run in the page's own font, and tags each word for tap. `surah_name` lines
draw the `Sura_border` band; `basmallah` lines draw the existing `Bismillah` component.

**Ayahs span lines and pages.** Highlighting an ayah means tinting a word range that may
start mid-line and continue onto the next page. The highlight is per word, driven by a
`(surah, ayah)` predicate, never by a line or a box.

**Fonts load lazily.** 604 fonts cannot be registered at startup. Register the current
page's font plus a small neighbour window ahead of the swipe, cache what is registered,
and show the Unicode Hafs text as a fallback until the page's font is ready. Whether RN
Android registers these at all is M7a's highest-risk question.

**Shaping hazard.** Memory `rn-android-breaks-shaping-across-nested-text` applies: RN
Android breaks Arabic shaping across nested `<Text>`. Per-word tinting therefore cannot
be nested spans of live Arabic — but glyph fonts change the picture, because a QCF word
is a single pre-shaped glyph with no joining to its neighbours. Confirm on device in
M7a; if it holds, per-word tinting is safe here in a way it never was for Unicode text.

---

## Sub-phases

### M7a — Spike (no production code)

Deliverables, all four required before M7b starts:

1. **Licence findings** for the layout data and for each font edition, with the
   terms-of-use text quoted verbatim per resource. Ruling 9 means we ship regardless;
   this documents what is actually being accepted.
2. **V1/V2/V4 rendered on the owner's phone**, same three pages each, screenshots sent
   to the owner. Owner picks the edition. Needs a device session with the owner present.
3. **Proof RN Android registers these fonts** — lazily, at runtime, 604 of them; and
   whether WOFF2 works or TTF is required. If this fails, the glyph approach fails.
4. **Measured byte cost** per edition per format, plus layout row count and real DB
   growth, checked against the ~40MB budget.

Ends in a written finding appended to `phase-m7a-mushaf-spike.md`. No schema change,
no app change, no merge to the reader.

### M7b — Data (§5 review required)

Schema migration, importer, `packages/data` queries, tests. No UI.

Touches `packages/data` schema **and** queries, so it triggers an independent read
under §5 — both of the first two triggers, in fact. Plan authored after M7a picks the
edition, because the column names follow the edition (`code_v1` vs `code_v2`).

Exit: the chosen edition's layout is in `quran.db`, every page 1..604 resolves to 15
lines, every line's word range resolves to words, and the whole 604-page walk is
verified against `ayahs.page` with no gaps and no orphans.

### M7c — UI (device run required)

`MushafPager`, page renderer, surah band, footer, three highlight states, audio follow
with auto-turn, per-ayah TalkBack, chevron jumps, reading-position write, deletion of
`MushafAyah` and its scroll path, i18n in three locales.

Exit: device checklist 191+ run on the owner's GM1917 and recorded here. Per §10,
"implementation complete, verification pending" is an unmet exit criterion.

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| RN Android will not register 604 fonts lazily | Kills the glyph approach outright | M7a deliverable 3, before any production code |
| WOFF2 unsupported, TTF blows the 40MB budget | Forces an edition change or a format change | M7a deliverable 4 measures both |
| Layout data has gaps for some pages | Blank or broken pages | M7b exit criterion walks all 604 and fails on any gap |
| KFGQPC grants no redistribution right | Legal exposure on a shipped app | Owner accepted (ruling 9); M7a records the exact terms; attribution in About/Credits |
| Shaping breaks across per-word tint spans | Garbled Arabic on every page | Confirm on device in M7a; glyph fonts likely immune, Unicode fallback text is not |
| Deleting scroll mushaf strands the M6l row-height model | Dead code, or a broken translation mode | The model still serves translation mode — delete only the mushaf branch, keep `rowHeightModel.ts` |
| An ayah spanning two pages breaks the audio highlight | Highlight vanishes mid-recitation | Highlight predicate is `(surah, ayah)` over words, evaluated per page, not a stored box |

## Rollback

Each sub-phase is one PR and reverts independently. M7b's migration is additive, so a
revert of M7c leaves unused rows in `quran.db` and nothing broken. Reverting M7b as well
drops the table and column; no existing query reads them.

Scroll mushaf is deleted in M7c only. Until that merges, `git revert` restores it whole.
