# Phase M9 — Uzbek word-by-word from Tasnim

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans`. Steps use `- [ ]` checkboxes.

**Goal:** Every corpus word carries a human Uzbek gloss in both scripts; surah
names read Uzbek in an Uzbek UI; every root carries an Uzbek gloss list derived
from those words.

**Architecture:** Tasnim's WbW is human, Latin-script, 114 surahs — but its own
segmentation (66139 rows vs our 77429 words). Align it to OUR word ids by a
**deterministic** two-tier Arabic normalizer, not an LLM. Measured: 6220/6236
ayahs, 77115/77429 words. 16 ayahs hand-mapped in a checked-in override file.
Cyrillic is ours, transliterated from the Latin. Derived root glosses aggregate
the aligned words — no new source, no MT.

**Tech Stack:** Python (`packages/scraper`) for align + import; `packages/data`
for schema + queries; Next.js web + Expo mobile for UI.

**Spec:** none. This plan supersedes
`docs/superpowers/specs/2026-07-09-uz-wbw-alignment-design.md`, whose LLM
pipeline exists only because Tasnim was legally out of reach. **That boundary is
lifted: the owner states a licence is in hand (2026-09-16).** Every "never write
Tasnim text" line in that spec is dead. Its acceptance grep must be deleted, not
weakened.

---

## Global Constraints

- **Licence**: Tasnim text ships. About credit = `Word-by-word Uzbek: Tasnim`,
  beside corpus.quran.com / Tanzil / QuranEnc. No other notice required (owner).
- **Language codes**: `uz` = Latin, `uz-Cyrl` = Cyrillic (BCP-47). Both are
  rows in `languages`. No schema change buys this — `word_glosses` is already
  `UNIQUE(word_id, language_code)`.
- **Source tag**: `word_glosses.source = 'tasnim'` (Latin) / `'tasnim-cyrl'`
  (derived). `translations.translator = 'Tasnim'`.
- **Schema changes are additive only.** Three: `word_glosses.gloss_group`
  (nullable INT), new `surah_names`, new `root_glosses`. `root_definitions` is
  NOT touched.
- **§5 independent review is MANDATORY** on Tasks 1, 2 and 7 — `packages/data`
  schema + queries, and a parser over third-party input. `/code-review` is
  user-triggered: stop and ask.
- **§4 step 4 applies to every branch**: delete the fix, watch a test fail.
  Two vacuous-assertion escapes are already on record (#71, #73).
- **Reference DB is read-only, `mode=ro`, path
  `~/quran-data/refdata/TasnimDatabase.db`.** Never copied into git. The
  extracted `.imazingapp` stays out too.
- Live corpus = `apps/web/quran.db`. `.bak` before every write pass.
  `packages/scraper/quran.db` is a stale stub — never write it.
- Mobile bundled DB is generated (`pnpm generate:m1-db`), never committed.

---

## Measured facts (from the live DBs, 2026-09-16 — do not re-derive)

| Fact | Value |
|---|---|
| Tasnim `bywords` rows | 66139, all 114 surahs |
| `translateUzlat` filled | 66139 / 66139 (100%) |
| `translateUzbek` (Cyrillic) filled | **30** — surah 1 only. Useless. |
| `translateEn` filled | 0 |
| Our corpus words | 77429 |
| Ayahs where word counts already match | 1846 (29.6%) — positional join is dead |
| Ayahs aligned, tier 1 (base form) | 2960 |
| Ayahs aligned, tier 2 (consonant skeleton) | 3267 |
| **Ayahs aligned total** | **6227 / 6236 = 99.86%** |
| **Corpus words glossed** | **77253 / 77429 = 99.77%** |
| Group sizes | 55414×1, 9448×2, 875×3, 77×4, 2×5 |
| Failing ayahs | 9 |
| Existing uz glosses to replace | 75539, `source='mt'` |
| Tasnim `surah_name` | 114 rows, `nameUzlat` + `suraMeanUzlat` + Cyrillic |
| Tasnim `quran` | 6236 rows, `uzlat` verse translation |

**The 9 failures** (2026-09-16, symmetric walk): 4:36, 11:47, 17:60, 21:88,
29:28, 38:27, 42:15, 63:10, 72:16. 4:36 genuinely drops ابن السبيل. Fewer than
the 16 first measured because the aligner is symmetric — Tasnim also *splits*
where we join (يٰقَوْمِ → يا + قوم), which the first pass could not express and
which cost 166 ayahs. The residue report is the authority, not this list.

**Why two tiers.** Tasnim is imlāʾī (`مالك`, `الصراط`, `العالمين`); our corpus is
Uthmani (`ملك`, `الصرط`, `العلمين`). Tier 1 strips diacritics + folds
hamza/alef/ya/ta-marbuta and matches 2959 ayahs. Tier 2 additionally drops the
matres lectionis (ا و ي) — a consonant skeleton — and catches 3261 more.

**Trap that cost an hour**: the obvious "strip Arabic marks" character class
`[ؐ-ًؚ-ٰٟۖ-ۭـ]` spans LETTERS. It emptied every string and produced a bogus 100%
match. Strip via `unicodedata.combining`, and tatweel `ـ` (U+0640) explicitly.
A normalizer test must assert a real word survives, not only that marks die.

---

## File structure

**Create**
- `packages/scraper/scraper/tasnim_align.py` — normalizer tiers + greedy
  grouping aligner + residue report. Pure; no DB writes.
- `packages/scraper/scraper/tasnim_import.py` — CLI: glosses, verse
  translation, surah names. Checkpointed, resumable, `.bak` first.
- `packages/scraper/scraper/translit_uz_cyrl.py` — Latin→Cyrillic.
- `packages/scraper/scraper/root_glosses.py` — derive per-root Uzbek lists.
- `packages/scraper/data/tasnim_overrides.json` — the 16 hand-mapped ayahs.
- `packages/scraper/tests/test_tasnim_align.py`, `test_translit_uz_cyrl.py`,
  `test_root_glosses.py`.
- `packages/data/src/queries/surahNames.ts`, `queries/rootGlosses.ts` (+ tests).

**Modify**
- `packages/data/schema.sql` → regenerate `src/schema.generated.ts`.
- `packages/data/src/migrate.ts` — additive self-heal for `gloss_group`.
- `packages/data/src/queries/glosses.ts` — carry `gloss_group` through.
- `packages/data/src/{index,mobile,client}.ts` — export the new queries.
- `apps/web`: surah-name call sites, WbW gloss render, dictionary, About.
- `apps/mobile`: same + a script toggle in Settings.

---

### Task 1: Schema — gloss_group, surah_names, root_glosses

**§5 REVIEW REQUIRED** (`packages/data` schema).

**Files:** Modify `packages/data/schema.sql`,
`packages/data/src/migrate.ts`; regenerate `packages/data/src/schema.generated.ts`.
Test: `packages/data/tests/migrate.test.ts`.

**Interfaces — Produces:**
```sql
ALTER TABLE word_glosses ADD COLUMN gloss_group INTEGER;  -- nullable

CREATE TABLE IF NOT EXISTS surah_names (
  surah_id      INTEGER NOT NULL REFERENCES surahs(id) ON DELETE CASCADE,
  language_code TEXT    NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  meaning       TEXT,
  PRIMARY KEY (surah_id, language_code)
);

CREATE TABLE IF NOT EXISTS root_glosses (
  root_id          INTEGER NOT NULL REFERENCES roots(id) ON DELETE CASCADE,
  language_code    TEXT    NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
  rank             INTEGER NOT NULL,
  gloss            TEXT    NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (root_id, language_code, rank)
);
CREATE INDEX IF NOT EXISTS idx_root_glosses_root ON root_glosses(root_id, language_code, rank);
```

`gloss_group` is scoped per `(ayah, language_code)` by construction — a
`word_glosses` row already belongs to exactly one language. Rows sharing a group
id are ONE phrase in that language. NULL = ungrouped, which is every row of
every source that does not group (`corpus` EN, and 54954 of Tasnim's own).

- [ ] **Step 1: failing test** — `migrate.test.ts`: open a DB seeded with the
      PRE-column `word_glosses` DDL, run `runMigrations`, assert
      `PRAGMA table_info(word_glosses)` contains `gloss_group`, and that
      `surah_names` / `root_glosses` exist.
- [ ] **Step 2: run, watch it fail** — `pnpm --filter @quran-corpus/data test`.
      Expected: no such column `gloss_group`.
- [ ] **Step 3: schema.sql** — add the three objects above.
- [ ] **Step 4: migrate.ts** — extend the existing self-heal pattern
      (`migrateAddWordColumns`) with `migrateAddGlossGroup`: read
      `PRAGMA table_info(word_glosses)`, `ALTER TABLE … ADD COLUMN` when absent.
      `CREATE TABLE IF NOT EXISTS` covers the two new tables through
      `SCHEMA_SQL` — no extra code. Follow the DB_SKIP_MIGRATIONS convention:
      an idempotent self-heal runs unconditionally in `db.ts`, NOT nested inside
      `runMigrations`.
- [ ] **Step 5: regenerate** — `pnpm --filter @quran-corpus/data generate:schema`.
      **Never hand-edit `schema.generated.ts`**; a stale generated file makes a
      schema mutation-check vacuous.
- [ ] **Step 6: green + mutation-check** — tests pass; then delete the
      `ALTER TABLE` line and confirm Step 1's test fails.
- [ ] **Step 7: commit** — `feat(data): gloss_group, surah_names, root_glosses`
- [ ] **Step 8: STOP.** Ask the owner to run `/code-review`.

---

### Task 2: The aligner

**§5 REVIEW REQUIRED** (parser over third-party input; §3 OWASP trust boundary).

**Files:** Create `packages/scraper/scraper/tasnim_align.py`,
`packages/scraper/tests/test_tasnim_align.py`.

**Interfaces — Produces:**
```python
def base_form(s: str) -> str: ...      # tier 1: marks + tatweel out, hamza/alef/ya/ta folded
def skeleton(s: str) -> str: ...       # tier 2: base_form minus ا و ي

@dataclass(frozen=True)
class Group:
    word_ids: tuple[int, ...]
    gloss: str

def align_ayah(corpus: Sequence[tuple[int, str]],
               tasnim: Sequence[tuple[str, str]]) -> list[Group] | None:
    """Greedy monotone grouping. Tier 1, then tier 2. None = no alignment."""

def align_all(corpus_db: Path, tasnim_db: Path,
              overrides: Mapping[str, list[Group]]) -> tuple[list[Group], list[tuple[int,int]]]:
    """Returns (groups, unaligned_ayah_keys)."""
```

- [ ] **Step 1: failing tests** — all four, from real data:
```python
def test_base_form_keeps_letters():
    # The trap: a mark-stripping char class that spans letters returns ''.
    assert base_form('بِسْمِ') == 'بسم'
    assert base_form('ٱلرَّحْمَٰنِ') == 'الرحمن'

def test_tatweel_is_stripped():
    assert 'ـ' not in base_form('بِٱلْـَٔاخِرَةِ')

def test_tier_one_aligns_one_to_one():
    corpus = [(1, 'بِسْمِ'), (2, 'ٱللَّهِ')]
    tasnim = [('بِسْمِ', 'nomi bilan'), ('ٱللَّهِ', 'Allohning')]
    assert align_ayah(corpus, tasnim) == [Group((1,), 'nomi bilan'),
                                          Group((2,), 'Allohning')]

def test_tier_two_rescues_uthmani_vs_imlai():
    # Our الصرط vs Tasnim الصراط -- tier 1 cannot match these.
    corpus = [(1, 'ٱلصِّرَٰطَ')]
    tasnim = [('الصِّرَاطَ', "yo'lga")]
    assert align_ayah(corpus, tasnim) == [Group((1,), "yo'lga")]

def test_grouping_maps_one_gloss_to_two_words():
    corpus = [(1, 'لَا'), (2, 'رَيْبَ')]
    tasnim = [('لَا رَيْبَ', "shubha yo'q")]
    assert align_ayah(corpus, tasnim) == [Group((1, 2), "shubha yo'q")]

def test_no_alignment_returns_none_never_a_guess():
    corpus = [(1, 'بِسْمِ')]
    tasnim = [('ٱللَّهِ', 'Allohning')]
    assert align_ayah(corpus, tasnim) is None
```
- [ ] **Step 2: run, watch them fail** — `uv run pytest tests/test_tasnim_align.py -v`.
- [ ] **Step 3: implement** — normalizer via `unicodedata.normalize('NFKD')` +
      drop `unicodedata.combining` + drop U+0640, then fold
      `ٱآأإ→ا`, `ى→ي`, `ة→ه`, `ؤ→و`, `ئ→ي`, drop `ء`, keep only U+0620–U+064A.
      `skeleton` = that, minus `ا و ي`. `align_ayah`: walk Tasnim rows,
      accumulate corpus words until the normalized forms are equal; bail to
      `None` on overshoot or exhaustion; require both cursors to land at the end.
      Try tier 1 whole-ayah first, tier 2 only if tier 1 returns `None`.
- [ ] **Step 4: green.**
- [ ] **Step 5: mutation-check** — remove the tatweel strip → tier-2 test fails.
      Make the overshoot branch return the partial group instead of `None` →
      `test_no_alignment_returns_none_never_a_guess` fails. **Delete
      `__pycache__` between runs**: same size + same second = stale bytecode,
      and a mutation silently keeps running.
- [ ] **Step 6: run it whole** — `align_all` over the live DBs; assert the
      measured numbers: 6220 ayahs, 77115 words, 16 unaligned. **A different
      number means the aligner changed, not the data — investigate before
      proceeding.**
- [ ] **Step 7: commit** — `feat(scraper): deterministic Tasnim→corpus aligner`
- [ ] **Step 8: STOP.** Ask the owner to run `/code-review`.

---

### Task 3: Overrides for the 16

**Files:** Create `packages/scraper/data/tasnim_overrides.json`. Modify
`tasnim_align.py` (consume them), `tests/test_tasnim_align.py`.

**Interfaces — Consumes** `align_all`'s residue report from Task 2 Step 6.

```json
{ "4:36": [ { "words": [22, 23], "gloss": "yo'lovchiga" } ] }
```
Keyed `surah:ayah`; `words` are **positions within the ayah**, 1-based, never
global word ids — a global id changes if the corpus is ever re-seeded.

- [ ] **Step 1: failing test** — an override for a synthetic ayah that tier 1
      and tier 2 both fail wins, and covers every position exactly once.
- [ ] **Step 2: run, watch it fail.**
- [ ] **Step 3: generate the residue** — dump the 16 ayahs with corpus words,
      Tasnim rows and both normalizations side by side.
- [ ] **Step 4: hand-map all 16.** Every corpus position gets exactly one gloss.
      4:36 has no Tasnim gloss for ابن السبيل — leave those positions OUT rather
      than inventing one; the EN fallback covers them.
- [ ] **Step 5: wire them in** — overrides consulted BEFORE tier 1, so a hand
      mapping is never silently overruled by a lucky match.
- [ ] **Step 6: assert full coverage** — a test walks the override file and
      fails if any listed ayah still appears in the residue, or if a position
      appears twice.
- [ ] **Step 7: commit** — `fix(scraper): hand-map the 16 unalignable ayahs`

---

### Task 4: Latin→Cyrillic

**Files:** Create `packages/scraper/scraper/translit_uz_cyrl.py`,
`packages/scraper/tests/test_translit_uz_cyrl.py`.

**Interfaces — Produces:** `def to_cyrillic(latin: str) -> str`

Digraphs FIRST, longest match wins, or `sh`→`сҳ`: `o'`→ў, `g'`→ғ, `sh`→ш,
`ch`→ч, `ng`→нг, `ya`→я, `yo`→ё, `yu`→ю, `ye`→е, `ts`→ц. Then singles:
`x`→х, `h`→ҳ, `q`→қ, `j`→ж, `c`→к. Apostrophe variants `'` `ʻ` `ʼ` `’` all
count. Word-initial `e`→э, elsewhere `e`→е. Case preserved.

- [ ] **Step 1: failing tests** — one per rule above plus:
```python
def test_digraph_beats_singles():
    assert to_cyrillic("shubha") == "шубҳа"      # not сҳубҳа
def test_x_and_h_do_not_collapse():
    assert to_cyrillic("xayr") == "хайр"
    assert to_cyrillic("hamd") == "ҳамд"
def test_apostrophe_variants_all_map():
    for a in ("o'", "oʻ", "oʼ", "o’"):
        assert to_cyrillic(a + "zi") == "ўзи"
def test_initial_e_is_e_oborotnoye():
    assert to_cyrillic("ertaga") == "эртага"
    assert to_cyrillic("kel") == "кел"
def test_case_survives():
    assert to_cyrillic("Alloh") == "Аллоҳ"
```
- [ ] **Step 2: run, watch them fail.**
- [ ] **Step 3: implement** — one ordered table, single left-to-right pass.
- [ ] **Step 4: green.**
- [ ] **Step 5: mutation-check** — reorder so singles precede digraphs →
      `test_digraph_beats_singles` fails. Clear `__pycache__`.
- [ ] **Step 6: commit** — `feat(scraper): Uzbek Latin→Cyrillic transliterator`

---

### Task 5: Import — glosses, verse translation, surah names

**Files:** Create `packages/scraper/scraper/tasnim_import.py`. Modify
`packages/scraper/scraper/cli.py`. Test:
`packages/scraper/tests/test_tasnim_import.py`.

**Interfaces — Consumes** `align_all` (Task 2), overrides (Task 3),
`to_cyrillic` (Task 4). Writes `word_glosses`, `translations`, `surah_names`,
`languages`.

**Order matters.** `languages` rows first (`uz-Cyrl` FK), then glosses, then
translations, then surah names. `translations` INSERT fires
`trg_translations_ai` into `search_fts` — that is wanted, and it means the
verse import is NOT free in DB size.

- [ ] **Step 1: failing test** — against a temp DB from `SCHEMA_SQL`: a 2-word
      group writes two `word_glosses` rows with the SAME `gloss_group` and the
      same text; a single writes `gloss_group IS NULL`; Cyrillic rows land under
      `uz-Cyrl` with the same group ids.
- [ ] **Step 2: run, watch it fail.**
- [ ] **Step 3: implement.** `source='tasnim'` / `'tasnim-cyrl'`. Group ids
      unique per ayah. Checkpointed per surah, resumable (§11). `.bak` first.
      **Validate at the boundary (§3):** reject a gloss that is empty, longer
      than 120 chars, or contains Arabic-range characters — count and report,
      never write.
- [ ] **Step 4: the mt export + delete.** `UNIQUE(word_id, language_code)`
      means mt and Tasnim cannot coexist under `uz`. Export all 75539 rows to
      a gitignored `uz_mt_export.jsonl` FIRST, then delete
      `WHERE language_code='uz' AND source='mt'`, then import. Assert the export
      row count equals the pre-delete count before deleting anything.
- [ ] **Step 5: surah names** — `nameUzlat`→`name`, `suraMeanUzlat`→`meaning`,
      `language_code='uz'`; Cyrillic columns → `uz-Cyrl`. Where meaning equals
      the name (Tavba/Tavba, Ixlos/Ixlos) store NULL, not a repeat.
- [ ] **Step 6: verse translation** — Tasnim `quran.uzlat` → `translations`,
      `translator='Tasnim'`, `language_code='uz'`. 6236 rows.
- [ ] **Step 7: STRATIFIED SAMPLE — OWNER GATE.** Before the live write, emit
      ~200 pairs as a readable artifact: short/medium/long surahs, every group
      size 1–5, 20 Cyrillic pairs beside their Latin. **Hand it to the owner and
      WAIT.** No live import without their verdict.
- [ ] **Step 8: live import** against `apps/web/quran.db`. Verify after:
      `uz` glosses ≥ 77115, `uz-Cyrl` equal to `uz`, zero rows with
      `source='mt'`, `surah_names` = 228, `translations` +6236.
- [ ] **Step 9: commit** — `feat(scraper): import Tasnim WbW, verse text, names`

---

### Task 6: Derived Uzbek root glosses

**Files:** Create `packages/scraper/scraper/root_glosses.py`,
`packages/scraper/tests/test_root_glosses.py`.

**Interfaces — Produces:** rows in `root_glosses`.

Per root, per language: group its words' glosses, count occurrences, rank by
frequency descending then alphabetically (deterministic ties), keep the top 8.
Case-fold and trim for counting; store the most frequent surface spelling.
Skip a gloss that is only punctuation. Run for `uz` and `uz-Cyrl`.

- [ ] **Step 1: failing test** — a root with glosses `["kitob","kitob","yozdi"]`
      yields rank 1 `kitob` (count 2), rank 2 `yozdi` (count 1); a tie breaks
      alphabetically; the cap holds at 8.
- [ ] **Step 2: run, watch it fail.**
- [ ] **Step 3: implement.**
- [ ] **Step 4: green + mutation-check** — drop the alphabetical tiebreak →
      the tie test fails (run it twice; a dict-order accident passes once).
- [ ] **Step 5: run live**, report roots covered out of 1548.
- [ ] **Step 6: commit** — `feat(scraper): derive Uzbek root glosses from WbW`

---

### Task 7: Data layer queries

**§5 REVIEW REQUIRED** (`packages/data` queries).

**Files:** Modify `packages/data/src/queries/glosses.ts`; create
`queries/surahNames.ts`, `queries/rootGlosses.ts`; export from
`src/index.ts`, `src/mobile.ts`. Tests beside each.

**Interfaces — Produces:**
```ts
export interface GlossWithLang {
  word_id: number; gloss_text: string; gloss_lang: string;
  gloss_group: number | null;          // NEW
}
export function getSurahNames(db: QueryClient, lang: string):
  Promise<Map<number, { name: string; meaning: string | null }>>;
export function getRootGlosses(db: QueryClient, rootId: number, lang: string):
  Promise<{ gloss: string; occurrence_count: number }[]>;
```

`getGlossesWithFallback` keeps its shape and gains `gloss_group` — taken from
whichever row won, so an English fallback row correctly reports NULL.

**`getSurahNames` falls back like the glosses do**: a surah with no row in the
requested language returns `surahs.name_translit` / `name_translation`. Never
an empty name.

- [ ] **Step 1: failing tests** — `gloss_group` survives the COALESCE; a
      fallback row reports `gloss_group: null`; `getSurahNames('uz')` returns
      Fotiha/Ochuvchi; `getSurahNames('ru')` (no rows) falls back to
      Al-Fatiha/The Opening.
- [ ] **Step 2: run, watch them fail.**
- [ ] **Step 3: implement.**
- [ ] **Step 4: green + mutation-check** — drop the fallback branch in
      `getSurahNames` → the `ru` test fails.
- [ ] **Step 5: `packages/data` entry-point guard** — `tests/client-entry.test.ts`
      and `tests/mobile-entry.test.ts` must still pass. Do not weaken them.
- [ ] **Step 6: commit** — `feat(data): surah names and root glosses by language`
- [ ] **Step 7: STOP.** Ask the owner to run `/code-review`.

---

### Task 8: Web UI

**Files:** Modify `apps/web` surah-name call sites (21 across
`packages/data` consumers — enumerate with
`grep -rn "name_translit\|name_translation" apps/web/src`), the WbW gloss
render, the dictionary root page, `apps/web/src/app/about/page.tsx`.

- [ ] **Step 1: failing component test** — a WbW row of two words sharing a
      `gloss_group` renders ONE gloss under the pair, not two copies.
- [ ] **Step 2: run, watch it fail.**
- [ ] **Step 3: render the span** — group consecutive words by
      `gloss_group`, render the gloss once under the span. NULL groups are
      unchanged. The group is per language, so switching language regroups.
- [x] ~~**Step 4: surah names by UI locale**~~ — **MOVED to phase M10.**
- [x] ~~**Step 5: dictionary** — Uzbek root glosses above Lane / Hans Wehr~~ —
      **MOVED to phase M10.**

  Both steps named `uiLocale`, which is an `apps/mobile` concept: `apps/web`
  has no UI-locale layer at all. Owner ruled 2026-09-16 to build real web UI
  i18n first rather than drive names off the `?lang=` translation picker, so
  these two steps are Tasks 3 and 4 of
  `docs/plans/phase-m10-web-ui-locale.md`. The queries they need
  (`getSurahNames`, `getRootGlosses`) shipped here in Task 7 and are unaffected.
- [ ] **Step 6: About credit** — `Word-by-word Uzbek: Tasnim`. Drop the NLLB
      credit; the mt rows are gone.
- [ ] **Step 7: green** — lint, type-check, tests.
- [ ] **Step 8: commit** — `feat(web): Uzbek WbW, surah names, root glosses`

---

### Task 9: Mobile UI + script toggle

**Owner rulings, 2026-09-16** (both asked because the plan could not answer
them and the answers change the work):

| # | Question | Ruling |
|---|---|---|
| R9-1 | A grouped pair renders one gloss, but decision 27 says "one cell per word, in every layout" | **Merge the cells.** Decision 27 is reversed for gloss spans: it was made against a mockup that merged for visual effect, with nothing in the data saying which words belonged together; `gloss_group` is that missing fact. One cell per word still holds INSIDE a span, so touch targets, POS colours and TalkBack labels are unchanged. |
| R9-2 | Surah names follow the UI locale or the content language? | **UI locale.** A surah name is chrome; it stays put when the reader changes which translation of the verses they want. The script toggle therefore does not reach surah names. |

**Open, not ruled:** the verse translation and search stay bound to the content
language, NOT the composed query language. The corpus has three `uz` translators
and one `uz-Cyrl` (Tasnim), so routing them through the script would change
*which* translation is on screen rather than its alphabet. `translatorByLanguage`
is keyed by `ContentLanguageCode` so passing a composed code is a compile error.


**Files:** Modify `apps/mobile/src/i18n/languages.ts`,
`src/settings/settingsStore.tsx`, `src/screens/SettingsScreen.tsx`, the WbW
row renderer, the dictionary screen, `src/screens/AboutTab.tsx`, and every
surah-name call site.

**The script toggle is a setting that maps to a language code**: Latin → `uz`,
Cyrillic → `uz-Cyrl`. It is only meaningful while the content language is
Uzbek — hide it otherwise rather than showing a dead control.

- [ ] **Step 1: failing tests** — the toggle switches the queried language code;
      a grouped pair renders one gloss; an Uzbek UI locale shows Fotiha.
- [ ] **Step 2: run, watch them fail.**
- [ ] **Step 3: implement.** `settingsStore`'s persisted key list is
      **append-only** — a new key goes at the END. Inserting in the middle feeds
      the wrong value to every setting after it.
- [ ] **Step 4: green + mutation-check.**
- [ ] **Step 5: commit** — `feat(mobile): Uzbek WbW, script toggle, surah names`

---

### Task 10: Rebuild, ship, verify on device

**Files:** none committed — `apps/mobile/assets/db/quran.db` is generated.

- [x] **Step 1: regenerate** — `pnpm generate:m1-db`. Record the size delta;
      the bundle is ~134 MB today and this adds ~150k gloss rows, 6236
      translations and their FTS entries. **A jump past ~150 MB needs a ruling
      before the APK.**
- [x] **Step 2: build + install** — versionCode +1,
      `taskset -c 7,8 nice -n 19 ionice -c 3 ./gradlew assembleRelease
      -PreactNativeArchitectures=arm64-v8a --max-workers=2 --no-daemon`.
      Serve a COPY named after the versionCode from `aapt2 dump badging`.
- [x] **Step 3: device checks** — record each in the verification log below.
      §10: a milestone is not complete until this runs on real hardware.
- [x] **Step 4: commit** — `chore(mobile): versionCode N for the M9 APK` (`880a913`)

---

### Step 1 result (2026-09-17)

| | bytes | MiB |
|---|---|---|
| baseline (vc21, 2026-09-08) | 145,022,976 | 138.3 |
| regenerated (M9) | 164,765,696 | **157.1** |
| delta | +19,742,720 | +18.8 |

**Past the ~150 MB gate. Owner ruled 2026-09-17: ship 157.1 MiB as-is.**

The measured alternative, for whenever size is revisited: the bundle carries
four translator sets no screen can reach (`ru` Rowwad / Ministry of Awqaf /
Kuliev, `uz` Alauddin Mansour) — `selectedTranslators` picks one per language
and `corpusRepository` renders nothing else. Pruning them, both Tasnim sets
kept, measures **102.5 MiB — 54.7 MiB saved**, below the pre-M9 baseline; the
FTS index blocks shrink far more than the text does. `translators.ts` already
notes this is "a bundle-size question, not a correctness one". Not done: the
owner ruled the gate cleared instead.

Largest remaining consumers, for reference: `words` 62.0 MiB (of which
`morphology_description` 16.4), `search_fts_content` 19.7 (a full second copy
of every indexed body — plain FTS5, not external-content), `translations`
19.1, `search_fts_data` 9.9.

---

## Verification log (fill on the device — empty is NOT a pass)

| # | Check | Result |
|---|---|---|
| 360 | Reader, content=Uzbek: every word has an Uzbek gloss, no `(en)` tags outside the known 314 | **PASS** — fallback set is **5**, not 314. 78:39 مَـَٔابًا renders "a return." + `(en)`; neighbours all Uzbek |
| 361 | A grouped pair (2:2 لا ريب) shows ONE gloss under both words | **PASS** — لَا and رَيْبَ share one bordered cell, own POS tags (NEG, N), single gloss "shubha yo’q"; neighbours separate |
| 362 | Script toggle → Cyrillic: glosses change script, nothing else moves | **PASS** — 2:1 gloss flipped "алиф лам мим" ↔ "alif lam mim"; same cell, same INL tag |
| 363 | Script toggle hidden while content language is English | **PASS** — verified both directions: absent on English, `Oʻzbek yozuvi` appears on O'zbek |
| 364 | ~~UI locale Uzbek: headers/browse/jump read Fotiha~~ | moved to M10 (381) |
| 365 | ~~UI locale English: still Al-Fatiha~~ | moved to M10 (380/382) |
| 366 | Dictionary root: Uzbek gloss list above the English article | **PASS** — قول: `TARJIMASI` + info button, 8 glosses, then Hans Wehr, then Lane's |
| 367 | About: Tasnim credited, no NLLB credit | **PASS** — Tasnim credited with localized description; zero NLLB across the whole page |
| 368 | Search finds an Uzbek verse phrase from the Tasnim translation | **FAIL** — see below |
| 369 | Cold start after the DB grew: extract completes, no ANR | **PASS** (2026-09-17, vc22) — cold launch 2,190 ms to first frame; app data 138 → 281.3 MiB, so the m9 extract ran; no ANR, no FATAL, process alive. 160 GB free on device |

#### Check 368 — FAIL

Search cannot return a Tasnim verse in either script.

`sourceFilter` (`packages/data/src/queries/search.ts:197`) builds, for
`language='uz'` with a translator, `source='uz' AND ref_id IN (SELECT id FROM
translations WHERE language_code='uz' AND translator=?)`. The translator is
`selectedTranslators.uz` = **Muhammad Sodik Muhammad Yusuf**, so:

- Tasnim's Latin `uz` rows are filtered out — wrong translator.
- `source='uz-Cyrl'` is matched by **no** arm, so all **6,236** indexed Tasnim
  Cyrillic rows are unreachable.

Observed: searching `bilan boshlayman` returns 1:1 rendered in **Muhammad
Sodik's Cyrillic**, with the Latin query matched via the
`transliterateUzbekLatinToCyrillic` arm (search.ts:246). Search ignores the
Lotin/Кирилл setting entirely.

Two stale premises this exposed:

1. That arm's comment reads "Uzbek's `uz` rows are Cyrillic-only, so a Latin
   query never matches them". Since M9, `language_code='uz'` is **mixed**:
   Alauddin Mansour and Muhammad Sodik are Cyrillic (6,236 each), Tasnim is
   Latin. `uz` is not a script.
2. The plan assumed shipping the Tasnim translation made it searchable. Nothing
   selects it.

**Not fixed here — the fix is the owner's open ruling** (which translator `uz`
selects, and whether verse translation + search follow the script). Any change
picks a translator for every Uzbek reader, which is a product decision, not a
defect repair.

**Device run 2026-09-17, vc22 (`aapt2 dump badging` confirmed), APK 208.8 MiB.**
Defect found and fixed before the run: `corpusDbVersion` still read `'m7b'`,
so the extract would have skipped and the phone would have kept its vc21 DB —
every check above would have failed for a reason that is not the feature
(`880a913`). 369 was verified from logcat and diskstats without taking the
screen; the phone is also this session's terminal display, so the remaining
nine checks are owed an owner-driven pass.

---

## Risks / rollback

| Risk | Mitigation |
|---|---|
| Aligner regresses silently on a re-run | Task 2 Step 6 asserts 6220/77115/16 exactly. A different number is a bug, not data. |
| Cyrillic transliteration errors | Owner spot-check (Task 5 Step 7) covers 20 Cyrillic pairs. Cyrillic is a separate language code — deleting `uz-Cyrl` rows reverts it alone, without touching Latin. |
| mt delete is irreversible | Export first, assert the count, and the `.bak` is taken before the pass. |
| Bundle size past a usable APK | Measured at Task 10 Step 1, before the build. |
| Group render looks wrong in WbW | `gloss_group` is stored either way; the render is a UI change with no re-import. |
| `search_fts` doubles on the new translation | Expected. Counted in the size delta. |
| Web build deployed against a DB the import has not touched | **Deploy order is load-bearing: run `import-tasnim` against the live DB BEFORE shipping the web build.** `getGlossesWithFallback` references `gloss_group` unconditionally and `apps/web` runs with `DB_SKIP_MIGRATIONS=true`, so a web build meeting an un-migrated `quran.db` throws `no such column: gloss_group` on the reader AND the WbW page — a 500 on the core reading flow, not a degraded gloss. Same shape awaits `surah_names` / `root_glosses` (`no such table`) when M10 Tasks 3-4 wire them up. |

**Rollback**: restore `quran.db.bak-phase-m9`; or, surgically, delete
`word_glosses WHERE source LIKE 'tasnim%'`, `translations WHERE
translator='Tasnim'`, `surah_names`, `root_glosses`, then replay
`uz_mt_export.jsonl`.

---

## Acceptance

- ≥77115 corpus words carry a `uz` gloss; `uz-Cyrl` count equals `uz`.
- Zero `word_glosses` rows with `language_code='uz' AND source='mt'`.
- `surah_names` = 228 rows (114 × 2 scripts); `root_glosses` non-empty for
  every root that has a glossed word.
- Every grouped Tasnim row writes one `gloss_group` shared by its words.
- The 16 override ayahs appear in no residue report.
- Owner signed off the stratified sample BEFORE the live import.
- lint 0, type-check 0, all tests green, both entry-point guards intact.
- `/code-review` run and answered on Tasks 1, 2 and 7.
- Device log above filled in.

---

## Self-review

**Coverage**: Uzbek WbW → Tasks 2-5. Dictionary → Task 6 + 7 + 8/9 render.
Surah names → Tasks 1, 5, 7, 8, 9. Both scripts → Task 4 + the `uz-Cyrl` code.
Both apps → Tasks 8 and 9. Verse translation → Task 5 Step 6.

**Placeholders**: none. Every test step carries its assertion; the only
deliberately deferred content is the 16 override mappings, which cannot be
written before Task 2 Step 6 emits the residue — Task 3 owns generating them.

**Type consistency**: `Group(word_ids, gloss)` is the single currency between
Tasks 2, 3 and 5. `gloss_group` is `INTEGER` in SQL and `number | null` in TS
throughout. `language_code` is `'uz'` / `'uz-Cyrl'` everywhere — no bare
`'uzc'` or `'uz_cyrl'` spelling appears in any task.
