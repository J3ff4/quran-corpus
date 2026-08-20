# M4 — Dictionary + Search (apps/mobile)

Design, 2026-08-18. Scope agreed with the owner in the brainstorming session
of the same date. Governs `apps/mobile`; `packages/data` is touched only where
noted in §4.

## 1. Scope

PRD §10 Phase M4's six items, plus the PRD §6.2 "jump to surah/ayah" that M1
never built:

1. Dictionary browse
2. Dictionary search
3. Root detail
4. Concordance
5. Lemma frequency
6. Verb concordance
7. Jump to surah/ayah — folded in, because `parseVerseRef` already exists in
   the mobile entry point and the search surface has to exist regardless.

Items 5 and 6 are the same query shape (top-N by count, verbs being the
POS-filtered variant) and ship as one screen with a filter, not two screens.

**Out of scope, deliberately:** recent-search history (it writes the on-device
user DB — a §5 trigger and persisted device state — for a convenience nobody
asked for), search filters by surah or part of speech, and any treebank
surface.

## 2. Navigation

Tab bar goes from five tabs to five, with Bookmarks and Settings collapsing
into one Menu tab to make room for Dictionary. This is web's own shape:
`BottomNav.tsx` is Home · Read · Dictionary · Menu, and `DrawerMenu.tsx` holds
Bookmarks and About.

```
Home    Read    Morphology    Dictionary    Menu
```

Morphology stays. It is the app's distinguishing feature, and it is the only
route that opens the word-by-word grid at the saved reading position.

| Route | State | Screen |
| --- | --- | --- |
| `app/(tabs)/dictionary.tsx` | new | Browse \| Frequent segmented control |
| `app/(tabs)/menu.tsx` | new | Bookmarks · Settings · About rows |
| `app/(tabs)/bookmarks.tsx` | moves | → `app/bookmarks.tsx`, pushed from Menu |
| `app/(tabs)/settings.tsx` | moves | → `app/settings.tsx`, pushed from Menu |
| `app/search.tsx` | new | Full-screen search |
| `app/dictionary/letter/[letter].tsx` | new | Roots under one hijāʾī letter |
| `app/lemma/[lemma].tsx` | new | Lemma entry + its concordance |
| `app/root/[buckwalter].tsx` | extended | gains inline concordance |
| `app/about.tsx` | unchanged | already exists; Menu links to it |

Deep links to the moved bookmarks and settings routes must keep working; both
are currently tab routes and become pushed routes.

## 3. Screens

### 3.1 Search — `app/search.tsx`

Full-screen pushed route, not a sheet. Reached from a magnifier in the Read and
Dictionary headers and from a Home card. A pushed screen was chosen over the
`BottomSheet` shell because it has room for three result sections and is the
easier of the two to make correct for TalkBack.

Sections, in the order `search()` returns them:

- **Jump** — present only when the query parses as a verse reference. Covers
  `2:255`, `Al-Baqarah 255`, `the opener`, and Arabic surah names; all of it is
  `parseVerseRef`, already written.
- **Verses** — FTS hits with a snippet. `searchVerses` wraps matched tokens in
  U+0002/U+0003; mobile renders those as a highlighted `<Text>` run, never as
  markup.
- **Roots** — `searchRoots` matches, each a link to the root screen.

Empty query renders the empty state, not a full-table scan: `search()` already
returns `EMPTY_SEARCH_RESULT` for a blank string.

### 3.2 Dictionary — `app/(tabs)/dictionary.tsx`

Segmented control with two panes.

**Browse** — the 28-letter hijāʾī grid, ported from web's `AlphabetGrid`.
Letter order comes from `ARABIC_ALPHABET_ORDER` in the shared package, not a
literal in the app. Tapping a letter pushes the letter screen.

**Frequent** — a three-chip filter over one list component:

| Chip | Query |
| --- | --- |
| Roots | `getRootsByFrequency` |
| Lemmas | `getLemmaFrequency` |
| Verbs | `getVerbConcordance` |

Rows link to the root or lemma screen. This is where PRD items 5 and 6 live.

### 3.3 Letter — `app/dictionary/letter/[letter].tsx`

Roots whose first letter is the given one. Composition follows web's
`DictionaryBrowser`: `getRootSearchList` returns all 1,548 roots once and
`rootFirstLetter` filters them in JS. **Do not "optimise" this into a SQL
`LIKE`** — `rootFirstLetter` folds hamza seats through `foldLetter`, and a SQL
prefix match would file أ, إ, آ and ٱ under four different letters. Load the
list once per session and memoise it; 1,548 rows is cheap, 28 queries for 28
letters is not.

The param is validated against `ARABIC_ALPHABET_ORDER`; anything else renders
the not-found state without reaching SQLite.

### 3.4 Root — `app/root/[buckwalter].tsx`

Today's header, forms and definitions become the `ListHeaderComponent` of a
`FlatList` whose rows are the concordance, paging in through
`getRootConcordancePage` with the total from `countRootConcordance`. The header
must contain no scroll view of its own — a nested VirtualizedList is a warning
and a scroll bug, not a style question.

### 3.5 Lemma — `app/lemma/[lemma].tsx`

`getLemmaEntry` for the header, `getLemmaConcordancePage` +
`countLemmaConcordance` for the same paged list as the root screen. Same list
component; the two screens differ only in header and query.

### 3.6 Menu — `app/(tabs)/menu.tsx`

Three rows: Bookmarks, Settings, About & credits. No logic of its own.

## 4. Data layer

**No new queries in `packages/data`, one changed one.**

### 4.1 Widening the mobile entry point

`packages/data/src/mobile.ts` gains `getLemmaEntry`,
`getLemmaConcordancePage`, `countLemmaConcordance`, `getLemmaFrequency` and
`getVerbConcordance`. The file's own contract permits this — "widening it is
fine as long as nothing added reaches `db.ts`, `migrate.ts`, or a backfill" —
and none of these do. `tests/mobile-entry.test.ts` stays as the guard and is
not weakened.

Each gets a thin wrapper in `apps/mobile/src/data/corpusRepository.ts`,
matching every other screen in the app. No query logic is written in
`apps/mobile`.

### 4.2 The one query change: search must match what the reader shows

The bundled DB carries seven translations — one English, **four Russian** (Abu
Adel, Elmir Kuliev, Ministry of Awqaf, Rowwad) and two Uzbek — and all seven
are in `search_fts`: 6,236 Arabic rows, 6,236 English, 12,472 Uzbek, 24,944
Russian.

The reader shows exactly one translator per language, from
`selectedTranslators` in `packages/mobile-data`: Saheeh International, **Abu
Adel**, Muhammad Sodik Muhammad Yusuf. `searchVerses` filters by nothing, so a
Russian query returns each verse four times *and* three of those four are text
that appears nowhere in the app. Deduplicating by ayah is not enough — it would
keep whichever row scored best on `bm25`, which is usually not Abu Adel.

Fix in `packages/data/src/queries/search.ts`: `searchVerses` takes the content
language and the translator as options and restricts `search_fts` to

- `source = 'ar'`, plus
- `source = <language>` where `ref_id` is a translation by `<translator>`.

One row per ayah per source falls out by construction; there is nothing left to
deduplicate. Both options are passed in, never hardcoded — the same mechanism a
future translator picker would use, and the reason the owner chose this over
pruning the DB (decision, 2026-08-18: the unselected translations stay on the
device, ~8-12 MB, because Kuliev and Rowwad were imported deliberately in
phase 01/02 and a picker would need them).

`apps/web` consumes the same function and must pass its own selection.

This is a `packages/data` query change, so **CLAUDE.md §5 triggers an
independent `/code-review`**. The agent stops and asks the owner to run it; it
cannot launch it itself.

### 4.3 Search index

Already built and shipped. `search_fts` is FTS5 with the stock
`unicode61 remove_diacritics 2` tokenizer, so no custom tokenizer has to be
registered at query time, and expo-sqlite 57 enables FTS5 by default
(`android/build.gradle:30-31`, gated on `expo.sqlite.enableFTS != 'false'`,
which nothing sets). Nothing is indexed at runtime and the DB asset does not
grow.

## 5. Trust boundaries

Three route params reach the data layer, all validated before the DB is opened:

| Param | Validator |
| --- | --- |
| `[buckwalter]` | `parseRootParam` — already in use on this route |
| `[lemma]` | same treatment; charset, length cap, no double-encoding |
| `[letter]` | membership in `ARABIC_ALPHABET_ORDER` |

Search text goes to `buildFtsMatch` and is never concatenated into SQL. Snippet
delimiters are rendered as React text nodes, never as HTML.

## 6. i18n

New keys across `en`, `uz` and `ru`: `tabs.dictionary`, `tabs.menu`, and the
`menu.*`, `search.*` and `dictionary.*` groups. `tabs.bookmarks` and
`tabs.settings` survive as row labels inside Menu. UI locale stays separate
from content language, per CLAUDE.md §7.

## 7. Testing

- Unit tests for every new `corpusRepository` wrapper.
- Component tests for the search screen (all three sections plus the empty
  state), the Browse↔Frequent control, the three-chip frequency filter, the
  root screen's concordance paging, and the Menu rows.
- The §4.2 change gets a test and a mutation-check: drop the translator
  restriction and a named test must fail by returning a Kuliev or Rowwad row
  for a Russian query.
- **Web regression is mandatory.** `apps/web` consumes the same
  `searchVerses`; its search tests and the Playwright reading-flow smoke both
  run before that commit lands.
- Device: CI has no Android emulator, so `README.md` gains M4 checks and the
  §10 gate is a run on the owner's hardware, recorded in the phase plan's
  Verification Log.

## 8. Risks

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | Moving bookmarks and settings out of `(tabs)` breaks existing deep links and any in-app `href` to them. | Enumerate every `router.push`/`Link` to those paths before the move; the routes become pushed screens at stable paths. |
| R2 | Root screen `ScrollView` → `FlatList` nests a VirtualizedList. | Header is plain `View`s; the concordance list is the only scroller. |
| R3 | The §4.2 dedupe changes web's search results. | Web tests + Playwright in the same commit; §5 review taken on it. |
| R4 | FTS5 behaves differently against the read-only bundled asset on device than in Node. | First task probes it on device rather than assuming; fallback is a `LIKE` path over the normalized column, slower but correct. |
| R5 | M4's checks land on a build that already carries M3's Run 3 debt (F5, F6, check 27, the M2 rosette). | One build, one checklist. The M3 carry-over rides it, per the owner's 2026-08-18 decision. |
| R6 | Five tabs with three of them new or moved is a lot of navigation churn in one phase. | Tab move ships as its own task and its own commit, ahead of any new screen. |

## 9. Exit criteria

- All seven scope items reachable on device.
- `2:255`, `Al-Baqarah 255` and an Arabic surah name all jump correctly.
- A Russian query returns each ayah once, in Abu Adel's wording — the same
  text the reader shows.
- `pnpm test`, `pnpm type-check`, `pnpm lint` green in `apps/mobile` and
  `apps/web`.
- The §5 independent review taken on the `packages/data` search change.
- The combined M3-carry-over + M4 checklist run on the owner's device and
  recorded in the phase plan's Verification Log. "Implementation complete,
  verification pending" is not a pass.
