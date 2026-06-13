# Phase 02: Data Acquisition — Importers & Scraper

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the SQLite database from three sources — Tanzil Uthmani Arabic text, QuranEnc translations (English/Uzbek/Russian), and corpus.quran.com word-by-word morphology — using a CLI pipeline that is idempotent, resumable, and fully tested.

**Architecture:** Each source is an independent CLI command writing via `ScraperDatabase` upserts. A shared `seed_database(db)` call at the start of each command seeds languages and all 114 surahs. corpus.quran.com pages are fetched with Playwright (rate-limited to 1 req/1.5 s), saved as raw HTML snapshots in `raw-scrape/`, then parsed with BeautifulSoup4. The parser is a pure function (HTML string → list) so it can be unit-tested without a network.

**Tech Stack:** Python 3.12+, uv, Playwright (async), BeautifulSoup4, lxml, Pydantic v2, pytest, xml.etree.ElementTree (stdlib), click 8, asyncio, sqlite3 (stdlib)

**Pipeline order (must run in this sequence):**
1. `scraper seed` — languages + surahs (auto-called by all commands)
2. `scraper import-tanzil <path>` — creates `ayahs` rows (text_uthmani)
3. `scraper import-quranenc <path> <lang_code> <translator>` — creates `translations` rows (needs ayahs)
4. `scraper scrape` — creates `words` + `word_glosses` rows (needs ayahs)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `scraper/models.py` | Modify | Add `LanguageModel` |
| `scraper/db.py` | Modify | Add `upsert_language` |
| `scraper/surah_meta.py` | Create | All 114 `SurahModel` instances |
| `scraper/seed.py` | Create | `seed_database(db)` — idempotent |
| `scraper/sources/tanzil.py` | Modify | Implement Tanzil XML → ayahs |
| `scraper/sources/quranenc.py` | Modify | Implement QuranEnc JSON → translations |
| `scraper/sources/corpus_parser.py` | Create | Pure HTML → `list[ParsedWord]` (no I/O) |
| `scraper/sources/corpus_quran.py` | Modify | Playwright fetcher + orchestrator |
| `scraper/cli.py` | Modify | Wire all commands; add `seed_database` call |
| `tests/test_language.py` | Create | `upsert_language` unit tests |
| `tests/test_surah_meta.py` | Create | Surah count + spot-checks |
| `tests/test_seed.py` | Create | `seed_database` idempotency tests |
| `tests/test_tanzil.py` | Create | Tanzil importer tests |
| `tests/test_quranenc.py` | Create | QuranEnc importer tests |
| `tests/test_corpus_parser.py` | Create | HTML parser tests using fixture |
| `tests/fixtures/tanzil_sample.xml` | Create | 7-verse Al-Fatiha Tanzil fixture |
| `tests/fixtures/quranenc_sample.json` | Create | 7-verse Al-Fatiha QuranEnc fixture |
| `tests/fixtures/corpus_1_1.html` | Create | HTML fixture for 1:1 (created in Task 6) |

---

### Task 1: Add `LanguageModel` and `upsert_language`

**Files:**
- Modify: `packages/scraper/scraper/models.py`
- Modify: `packages/scraper/scraper/db.py`
- Create: `packages/scraper/tests/test_language.py`

- [ ] **Step 1: Write the failing tests**

Create `packages/scraper/tests/test_language.py`:

```python
import os
import sqlite3
import tempfile

from scraper.db import ScraperDatabase
from scraper.models import LanguageModel


def _make_db() -> tuple[ScraperDatabase, str]:
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    path = f.name
    f.close()
    return ScraperDatabase(path), path


def test_upsert_language_inserts_row():
    db, path = _make_db()
    try:
        lang = LanguageModel(code="en", name_native="English", name_english="English", direction="ltr")
        db.upsert_language(lang)
        db.close()
        conn = sqlite3.connect(path)
        row = conn.execute("SELECT code, direction FROM languages WHERE code='en'").fetchone()
        assert row == ("en", "ltr")
        conn.close()
    finally:
        os.unlink(path)


def test_upsert_language_is_idempotent():
    db, path = _make_db()
    try:
        lang = LanguageModel(code="ar", name_native="العربية", name_english="Arabic", direction="rtl")
        db.upsert_language(lang)
        db.upsert_language(lang)
        db.close()
        conn = sqlite3.connect(path)
        count = conn.execute("SELECT COUNT(*) FROM languages WHERE code='ar'").fetchone()[0]
        assert count == 1
        conn.close()
    finally:
        os.unlink(path)


def test_upsert_language_updates_name_on_conflict():
    db, path = _make_db()
    try:
        lang = LanguageModel(code="uz", name_native="Oʻzbekcha", name_english="Uzbek", direction="ltr")
        db.upsert_language(lang)
        updated = LanguageModel(code="uz", name_native="Oʻzbekcha (yangilangan)", name_english="Uzbek", direction="ltr")
        db.upsert_language(updated)
        db.close()
        conn = sqlite3.connect(path)
        row = conn.execute("SELECT name_native FROM languages WHERE code='uz'").fetchone()
        assert row[0] == "Oʻzbekcha (yangilangan)"
        conn.close()
    finally:
        os.unlink(path)
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd packages/scraper && uv run pytest tests/test_language.py -v
```

Expected: `FAILED` — `ImportError: cannot import name 'LanguageModel'`

- [ ] **Step 3: Add `LanguageModel` to `scraper/models.py`**

Add after the existing `WordGlossModel` class:

```python
class LanguageModel(BaseModel):
    code: str
    name_native: str
    name_english: str
    direction: Literal["ltr", "rtl"]
```

Also add `LanguageModel` to the import in `scraper/db.py` (edit the existing import line):

```python
from .models import AyahModel, LanguageModel, SurahModel, TranslationModel, WordGlossModel, WordModel
```

- [ ] **Step 4: Add `upsert_language` to `scraper/db.py`**

Add after `upsert_surah`:

```python
def upsert_language(self, language: LanguageModel) -> None:
    self._conn.execute(
        """INSERT INTO languages (code, name_native, name_english, direction)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(code) DO UPDATE SET
             name_native  = excluded.name_native,
             name_english = excluded.name_english,
             direction    = excluded.direction""",
        (language.code, language.name_native, language.name_english, language.direction),
    )
    self._conn.commit()
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd packages/scraper && uv run pytest tests/test_language.py -v
```

Expected: `3 passed`

- [ ] **Step 6: Run full test suite to confirm no regressions**

```bash
cd packages/scraper && uv run pytest -v
```

Expected: all existing tests + 3 new = all pass

- [ ] **Step 7: Commit**

```bash
cd packages/scraper
git add scraper/models.py scraper/db.py tests/test_language.py
git commit -m "feat(scraper): add LanguageModel and upsert_language to ScraperDatabase"
```

---

### Task 2: Static surah metadata (`surah_meta.py`)

**Files:**
- Create: `packages/scraper/scraper/surah_meta.py`
- Create: `packages/scraper/tests/test_surah_meta.py`

- [ ] **Step 1: Write the failing tests**

Create `packages/scraper/tests/test_surah_meta.py`:

```python
from scraper.surah_meta import get_all_surahs


def test_surah_count_is_114():
    surahs = get_all_surahs()
    assert len(surahs) == 114


def test_first_surah_al_fatiha():
    surahs = get_all_surahs()
    s = surahs[0]
    assert s.id == 1
    assert s.name_arabic == "الفاتحة"
    assert s.revelation_type == "meccan"
    assert s.ayah_count == 7
    assert s.order_number == 1


def test_second_surah_al_baqara():
    surahs = get_all_surahs()
    s = surahs[1]
    assert s.id == 2
    assert s.revelation_type == "medinan"
    assert s.ayah_count == 286


def test_last_surah_an_nas():
    surahs = get_all_surahs()
    s = surahs[113]
    assert s.id == 114
    assert s.name_arabic == "الناس"
    assert s.revelation_type == "meccan"
    assert s.ayah_count == 6


def test_ids_are_sequential():
    surahs = get_all_surahs()
    for i, s in enumerate(surahs, start=1):
        assert s.id == i, f"Expected id={i}, got id={s.id} for {s.name_translit}"


def test_all_have_valid_revelation_type():
    surahs = get_all_surahs()
    for s in surahs:
        assert s.revelation_type in ("meccan", "medinan"), f"{s.name_translit} has invalid type"
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd packages/scraper && uv run pytest tests/test_surah_meta.py -v
```

Expected: `FAILED` — `ModuleNotFoundError: No module named 'scraper.surah_meta'`

- [ ] **Step 3: Create `scraper/surah_meta.py`**

Create `packages/scraper/scraper/surah_meta.py`:

```python
from .models import SurahModel

SURAHS: list[SurahModel] = [
    SurahModel(id=1, name_arabic="الفاتحة", name_translit="Al-Fatiha", name_translation="The Opening", revelation_type="meccan", ayah_count=7, order_number=1),
    SurahModel(id=2, name_arabic="البقرة", name_translit="Al-Baqara", name_translation="The Cow", revelation_type="medinan", ayah_count=286, order_number=2),
    SurahModel(id=3, name_arabic="آل عمران", name_translit="Aal-Imran", name_translation="Family of Imran", revelation_type="medinan", ayah_count=200, order_number=3),
    SurahModel(id=4, name_arabic="النساء", name_translit="An-Nisa", name_translation="The Women", revelation_type="medinan", ayah_count=176, order_number=4),
    SurahModel(id=5, name_arabic="المائدة", name_translit="Al-Maidah", name_translation="The Table Spread", revelation_type="medinan", ayah_count=120, order_number=5),
    SurahModel(id=6, name_arabic="الأنعام", name_translit="Al-Anam", name_translation="The Cattle", revelation_type="meccan", ayah_count=165, order_number=6),
    SurahModel(id=7, name_arabic="الأعراف", name_translit="Al-Araf", name_translation="The Heights", revelation_type="meccan", ayah_count=206, order_number=7),
    SurahModel(id=8, name_arabic="الأنفال", name_translit="Al-Anfal", name_translation="The Spoils of War", revelation_type="medinan", ayah_count=75, order_number=8),
    SurahModel(id=9, name_arabic="التوبة", name_translit="At-Tawbah", name_translation="The Repentance", revelation_type="medinan", ayah_count=129, order_number=9),
    SurahModel(id=10, name_arabic="يونس", name_translit="Yunus", name_translation="Jonah", revelation_type="meccan", ayah_count=109, order_number=10),
    SurahModel(id=11, name_arabic="هود", name_translit="Hud", name_translation="Hud", revelation_type="meccan", ayah_count=123, order_number=11),
    SurahModel(id=12, name_arabic="يوسف", name_translit="Yusuf", name_translation="Joseph", revelation_type="meccan", ayah_count=111, order_number=12),
    SurahModel(id=13, name_arabic="الرعد", name_translit="Ar-Rad", name_translation="The Thunder", revelation_type="medinan", ayah_count=43, order_number=13),
    SurahModel(id=14, name_arabic="إبراهيم", name_translit="Ibrahim", name_translation="Abraham", revelation_type="meccan", ayah_count=52, order_number=14),
    SurahModel(id=15, name_arabic="الحجر", name_translit="Al-Hijr", name_translation="The Rocky Tract", revelation_type="meccan", ayah_count=99, order_number=15),
    SurahModel(id=16, name_arabic="النحل", name_translit="An-Nahl", name_translation="The Bee", revelation_type="meccan", ayah_count=128, order_number=16),
    SurahModel(id=17, name_arabic="الإسراء", name_translit="Al-Isra", name_translation="The Night Journey", revelation_type="meccan", ayah_count=111, order_number=17),
    SurahModel(id=18, name_arabic="الكهف", name_translit="Al-Kahf", name_translation="The Cave", revelation_type="meccan", ayah_count=110, order_number=18),
    SurahModel(id=19, name_arabic="مريم", name_translit="Maryam", name_translation="Mary", revelation_type="meccan", ayah_count=98, order_number=19),
    SurahModel(id=20, name_arabic="طه", name_translit="Ta-Ha", name_translation="Ta-Ha", revelation_type="meccan", ayah_count=135, order_number=20),
    SurahModel(id=21, name_arabic="الأنبياء", name_translit="Al-Anbiya", name_translation="The Prophets", revelation_type="meccan", ayah_count=112, order_number=21),
    SurahModel(id=22, name_arabic="الحج", name_translit="Al-Hajj", name_translation="The Pilgrimage", revelation_type="medinan", ayah_count=78, order_number=22),
    SurahModel(id=23, name_arabic="المؤمنون", name_translit="Al-Muminun", name_translation="The Believers", revelation_type="meccan", ayah_count=118, order_number=23),
    SurahModel(id=24, name_arabic="النور", name_translit="An-Nur", name_translation="The Light", revelation_type="medinan", ayah_count=64, order_number=24),
    SurahModel(id=25, name_arabic="الفرقان", name_translit="Al-Furqan", name_translation="The Criterion", revelation_type="meccan", ayah_count=77, order_number=25),
    SurahModel(id=26, name_arabic="الشعراء", name_translit="Ash-Shuara", name_translation="The Poets", revelation_type="meccan", ayah_count=227, order_number=26),
    SurahModel(id=27, name_arabic="النمل", name_translit="An-Naml", name_translation="The Ant", revelation_type="meccan", ayah_count=93, order_number=27),
    SurahModel(id=28, name_arabic="القصص", name_translit="Al-Qasas", name_translation="The Stories", revelation_type="meccan", ayah_count=88, order_number=28),
    SurahModel(id=29, name_arabic="العنكبوت", name_translit="Al-Ankabut", name_translation="The Spider", revelation_type="meccan", ayah_count=69, order_number=29),
    SurahModel(id=30, name_arabic="الروم", name_translit="Ar-Rum", name_translation="The Romans", revelation_type="meccan", ayah_count=60, order_number=30),
    SurahModel(id=31, name_arabic="لقمان", name_translit="Luqman", name_translation="Luqman", revelation_type="meccan", ayah_count=34, order_number=31),
    SurahModel(id=32, name_arabic="السجدة", name_translit="As-Sajdah", name_translation="The Prostration", revelation_type="meccan", ayah_count=30, order_number=32),
    SurahModel(id=33, name_arabic="الأحزاب", name_translit="Al-Ahzab", name_translation="The Combined Forces", revelation_type="medinan", ayah_count=73, order_number=33),
    SurahModel(id=34, name_arabic="سبأ", name_translit="Saba", name_translation="Sheba", revelation_type="meccan", ayah_count=54, order_number=34),
    SurahModel(id=35, name_arabic="فاطر", name_translit="Fatir", name_translation="Originator", revelation_type="meccan", ayah_count=45, order_number=35),
    SurahModel(id=36, name_arabic="يس", name_translit="Ya-Sin", name_translation="Ya Sin", revelation_type="meccan", ayah_count=83, order_number=36),
    SurahModel(id=37, name_arabic="الصافات", name_translit="As-Saffat", name_translation="Those Who Set the Ranks", revelation_type="meccan", ayah_count=182, order_number=37),
    SurahModel(id=38, name_arabic="ص", name_translit="Sad", name_translation="The Letter Sad", revelation_type="meccan", ayah_count=88, order_number=38),
    SurahModel(id=39, name_arabic="الزمر", name_translit="Az-Zumar", name_translation="The Troops", revelation_type="meccan", ayah_count=75, order_number=39),
    SurahModel(id=40, name_arabic="غافر", name_translit="Ghafir", name_translation="The Forgiver", revelation_type="meccan", ayah_count=85, order_number=40),
    SurahModel(id=41, name_arabic="فصلت", name_translit="Fussilat", name_translation="Explained in Detail", revelation_type="meccan", ayah_count=54, order_number=41),
    SurahModel(id=42, name_arabic="الشورى", name_translit="Ash-Shura", name_translation="The Consultation", revelation_type="meccan", ayah_count=53, order_number=42),
    SurahModel(id=43, name_arabic="الزخرف", name_translit="Az-Zukhruf", name_translation="The Ornaments of Gold", revelation_type="meccan", ayah_count=89, order_number=43),
    SurahModel(id=44, name_arabic="الدخان", name_translit="Ad-Dukhan", name_translation="The Smoke", revelation_type="meccan", ayah_count=59, order_number=44),
    SurahModel(id=45, name_arabic="الجاثية", name_translit="Al-Jathiyah", name_translation="The Crouching", revelation_type="meccan", ayah_count=37, order_number=45),
    SurahModel(id=46, name_arabic="الأحقاف", name_translit="Al-Ahqaf", name_translation="The Wind-Curved Sandhills", revelation_type="meccan", ayah_count=35, order_number=46),
    SurahModel(id=47, name_arabic="محمد", name_translit="Muhammad", name_translation="Muhammad", revelation_type="medinan", ayah_count=38, order_number=47),
    SurahModel(id=48, name_arabic="الفتح", name_translit="Al-Fath", name_translation="The Victory", revelation_type="medinan", ayah_count=29, order_number=48),
    SurahModel(id=49, name_arabic="الحجرات", name_translit="Al-Hujurat", name_translation="The Rooms", revelation_type="medinan", ayah_count=18, order_number=49),
    SurahModel(id=50, name_arabic="ق", name_translit="Qaf", name_translation="The Letter Qaf", revelation_type="meccan", ayah_count=45, order_number=50),
    SurahModel(id=51, name_arabic="الذاريات", name_translit="Adh-Dhariyat", name_translation="The Winnowing Winds", revelation_type="meccan", ayah_count=60, order_number=51),
    SurahModel(id=52, name_arabic="الطور", name_translit="At-Tur", name_translation="The Mount", revelation_type="meccan", ayah_count=49, order_number=52),
    SurahModel(id=53, name_arabic="النجم", name_translit="An-Najm", name_translation="The Star", revelation_type="meccan", ayah_count=62, order_number=53),
    SurahModel(id=54, name_arabic="القمر", name_translit="Al-Qamar", name_translation="The Moon", revelation_type="meccan", ayah_count=55, order_number=54),
    SurahModel(id=55, name_arabic="الرحمن", name_translit="Ar-Rahman", name_translation="The Beneficent", revelation_type="medinan", ayah_count=78, order_number=55),
    SurahModel(id=56, name_arabic="الواقعة", name_translit="Al-Waqiah", name_translation="The Inevitable", revelation_type="meccan", ayah_count=96, order_number=56),
    SurahModel(id=57, name_arabic="الحديد", name_translit="Al-Hadid", name_translation="The Iron", revelation_type="medinan", ayah_count=29, order_number=57),
    SurahModel(id=58, name_arabic="المجادلة", name_translit="Al-Mujadila", name_translation="The Pleading Woman", revelation_type="medinan", ayah_count=22, order_number=58),
    SurahModel(id=59, name_arabic="الحشر", name_translit="Al-Hashr", name_translation="The Exile", revelation_type="medinan", ayah_count=24, order_number=59),
    SurahModel(id=60, name_arabic="الممتحنة", name_translit="Al-Mumtahanah", name_translation="She That Is to Be Examined", revelation_type="medinan", ayah_count=13, order_number=60),
    SurahModel(id=61, name_arabic="الصف", name_translit="As-Saf", name_translation="The Ranks", revelation_type="medinan", ayah_count=14, order_number=61),
    SurahModel(id=62, name_arabic="الجمعة", name_translit="Al-Jumuah", name_translation="Friday", revelation_type="medinan", ayah_count=11, order_number=62),
    SurahModel(id=63, name_arabic="المنافقون", name_translit="Al-Munafiqun", name_translation="The Hypocrites", revelation_type="medinan", ayah_count=11, order_number=63),
    SurahModel(id=64, name_arabic="التغابن", name_translit="At-Taghabun", name_translation="Mutual Disillusion", revelation_type="medinan", ayah_count=18, order_number=64),
    SurahModel(id=65, name_arabic="الطلاق", name_translit="At-Talaq", name_translation="The Divorce", revelation_type="medinan", ayah_count=12, order_number=65),
    SurahModel(id=66, name_arabic="التحريم", name_translit="At-Tahrim", name_translation="The Prohibition", revelation_type="medinan", ayah_count=12, order_number=66),
    SurahModel(id=67, name_arabic="الملك", name_translit="Al-Mulk", name_translation="The Sovereignty", revelation_type="meccan", ayah_count=30, order_number=67),
    SurahModel(id=68, name_arabic="القلم", name_translit="Al-Qalam", name_translation="The Pen", revelation_type="meccan", ayah_count=52, order_number=68),
    SurahModel(id=69, name_arabic="الحاقة", name_translit="Al-Haqqah", name_translation="The Reality", revelation_type="meccan", ayah_count=52, order_number=69),
    SurahModel(id=70, name_arabic="المعارج", name_translit="Al-Maarij", name_translation="The Ascending Stairways", revelation_type="meccan", ayah_count=44, order_number=70),
    SurahModel(id=71, name_arabic="نوح", name_translit="Nuh", name_translation="Noah", revelation_type="meccan", ayah_count=28, order_number=71),
    SurahModel(id=72, name_arabic="الجن", name_translit="Al-Jinn", name_translation="The Jinn", revelation_type="meccan", ayah_count=28, order_number=72),
    SurahModel(id=73, name_arabic="المزمل", name_translit="Al-Muzzammil", name_translation="The Enshrouded One", revelation_type="meccan", ayah_count=20, order_number=73),
    SurahModel(id=74, name_arabic="المدثر", name_translit="Al-Muddaththir", name_translation="The Cloaked One", revelation_type="meccan", ayah_count=56, order_number=74),
    SurahModel(id=75, name_arabic="القيامة", name_translit="Al-Qiyamah", name_translation="The Resurrection", revelation_type="meccan", ayah_count=40, order_number=75),
    SurahModel(id=76, name_arabic="الإنسان", name_translit="Al-Insan", name_translation="Man", revelation_type="medinan", ayah_count=31, order_number=76),
    SurahModel(id=77, name_arabic="المرسلات", name_translit="Al-Mursalat", name_translation="The Emissaries", revelation_type="meccan", ayah_count=50, order_number=77),
    SurahModel(id=78, name_arabic="النبأ", name_translit="An-Naba", name_translation="The Tidings", revelation_type="meccan", ayah_count=40, order_number=78),
    SurahModel(id=79, name_arabic="النازعات", name_translit="An-Naziat", name_translation="Those Who Drag Forth", revelation_type="meccan", ayah_count=46, order_number=79),
    SurahModel(id=80, name_arabic="عبس", name_translit="Abasa", name_translation="He Frowned", revelation_type="meccan", ayah_count=42, order_number=80),
    SurahModel(id=81, name_arabic="التكوير", name_translit="At-Takwir", name_translation="The Overthrowing", revelation_type="meccan", ayah_count=29, order_number=81),
    SurahModel(id=82, name_arabic="الانفطار", name_translit="Al-Infitar", name_translation="The Cleaving", revelation_type="meccan", ayah_count=19, order_number=82),
    SurahModel(id=83, name_arabic="المطففين", name_translit="Al-Mutaffifin", name_translation="The Defrauding", revelation_type="meccan", ayah_count=36, order_number=83),
    SurahModel(id=84, name_arabic="الانشقاق", name_translit="Al-Inshiqaq", name_translation="The Sundering", revelation_type="meccan", ayah_count=25, order_number=84),
    SurahModel(id=85, name_arabic="البروج", name_translit="Al-Buruj", name_translation="The Mansions of the Stars", revelation_type="meccan", ayah_count=22, order_number=85),
    SurahModel(id=86, name_arabic="الطارق", name_translit="At-Tariq", name_translation="The Nightcomer", revelation_type="meccan", ayah_count=17, order_number=86),
    SurahModel(id=87, name_arabic="الأعلى", name_translit="Al-Ala", name_translation="The Most High", revelation_type="meccan", ayah_count=19, order_number=87),
    SurahModel(id=88, name_arabic="الغاشية", name_translit="Al-Ghashiyah", name_translation="The Overwhelming", revelation_type="meccan", ayah_count=26, order_number=88),
    SurahModel(id=89, name_arabic="الفجر", name_translit="Al-Fajr", name_translation="The Dawn", revelation_type="meccan", ayah_count=30, order_number=89),
    SurahModel(id=90, name_arabic="البلد", name_translit="Al-Balad", name_translation="The City", revelation_type="meccan", ayah_count=20, order_number=90),
    SurahModel(id=91, name_arabic="الشمس", name_translit="Ash-Shams", name_translation="The Sun", revelation_type="meccan", ayah_count=15, order_number=91),
    SurahModel(id=92, name_arabic="الليل", name_translit="Al-Layl", name_translation="The Night", revelation_type="meccan", ayah_count=21, order_number=92),
    SurahModel(id=93, name_arabic="الضحى", name_translit="Ad-Duha", name_translation="The Morning Hours", revelation_type="meccan", ayah_count=11, order_number=93),
    SurahModel(id=94, name_arabic="الشرح", name_translit="Ash-Sharh", name_translation="The Relief", revelation_type="meccan", ayah_count=8, order_number=94),
    SurahModel(id=95, name_arabic="التين", name_translit="At-Tin", name_translation="The Fig", revelation_type="meccan", ayah_count=8, order_number=95),
    SurahModel(id=96, name_arabic="العلق", name_translit="Al-Alaq", name_translation="The Clot", revelation_type="meccan", ayah_count=19, order_number=96),
    SurahModel(id=97, name_arabic="القدر", name_translit="Al-Qadr", name_translation="The Power", revelation_type="meccan", ayah_count=5, order_number=97),
    SurahModel(id=98, name_arabic="البينة", name_translit="Al-Bayyinah", name_translation="The Clear Proof", revelation_type="medinan", ayah_count=8, order_number=98),
    SurahModel(id=99, name_arabic="الزلزلة", name_translit="Az-Zalzalah", name_translation="The Earthquake", revelation_type="medinan", ayah_count=8, order_number=99),
    SurahModel(id=100, name_arabic="العاديات", name_translit="Al-Adiyat", name_translation="The Courser", revelation_type="meccan", ayah_count=11, order_number=100),
    SurahModel(id=101, name_arabic="القارعة", name_translit="Al-Qariah", name_translation="The Calamity", revelation_type="meccan", ayah_count=11, order_number=101),
    SurahModel(id=102, name_arabic="التكاثر", name_translit="At-Takathur", name_translation="The Rivalry in World Increase", revelation_type="meccan", ayah_count=8, order_number=102),
    SurahModel(id=103, name_arabic="العصر", name_translit="Al-Asr", name_translation="The Declining Day", revelation_type="meccan", ayah_count=3, order_number=103),
    SurahModel(id=104, name_arabic="الهمزة", name_translit="Al-Humazah", name_translation="The Traducer", revelation_type="meccan", ayah_count=9, order_number=104),
    SurahModel(id=105, name_arabic="الفيل", name_translit="Al-Fil", name_translation="The Elephant", revelation_type="meccan", ayah_count=5, order_number=105),
    SurahModel(id=106, name_arabic="قريش", name_translit="Quraysh", name_translation="Quraysh", revelation_type="meccan", ayah_count=4, order_number=106),
    SurahModel(id=107, name_arabic="الماعون", name_translit="Al-Maun", name_translation="The Small Kindnesses", revelation_type="meccan", ayah_count=7, order_number=107),
    SurahModel(id=108, name_arabic="الكوثر", name_translit="Al-Kawthar", name_translation="The Abundance", revelation_type="meccan", ayah_count=3, order_number=108),
    SurahModel(id=109, name_arabic="الكافرون", name_translit="Al-Kafirun", name_translation="The Disbelievers", revelation_type="meccan", ayah_count=6, order_number=109),
    SurahModel(id=110, name_arabic="النصر", name_translit="An-Nasr", name_translation="The Divine Support", revelation_type="medinan", ayah_count=3, order_number=110),
    SurahModel(id=111, name_arabic="المسد", name_translit="Al-Masad", name_translation="The Palm Fiber", revelation_type="meccan", ayah_count=5, order_number=111),
    SurahModel(id=112, name_arabic="الإخلاص", name_translit="Al-Ikhlas", name_translation="Sincerity", revelation_type="meccan", ayah_count=4, order_number=112),
    SurahModel(id=113, name_arabic="الفلق", name_translit="Al-Falaq", name_translation="The Daybreak", revelation_type="meccan", ayah_count=5, order_number=113),
    SurahModel(id=114, name_arabic="الناس", name_translit="An-Nas", name_translation="Mankind", revelation_type="meccan", ayah_count=6, order_number=114),
]


def get_all_surahs() -> list[SurahModel]:
    return SURAHS
```

- [ ] **Step 4: Run tests**

```bash
cd packages/scraper && uv run pytest tests/test_surah_meta.py -v
```

Expected: `6 passed`

- [ ] **Step 5: Commit**

```bash
cd packages/scraper
git add scraper/surah_meta.py tests/test_surah_meta.py
git commit -m "feat(scraper): add static surah metadata for all 114 surahs"
```

---

### Task 3: Seed helper (`seed.py`)

**Files:**
- Create: `packages/scraper/scraper/seed.py`
- Create: `packages/scraper/tests/test_seed.py`

Seeds languages (Arabic, English, Uzbek, Russian) and all 114 surahs into the database. Called at the top of every CLI command so the DB is always ready before any import runs.

- [ ] **Step 1: Write failing tests**

Create `packages/scraper/tests/test_seed.py`:

```python
import os
import sqlite3
import tempfile

from scraper.db import ScraperDatabase
from scraper.seed import seed_database


def _make_db() -> tuple[ScraperDatabase, str]:
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    path = f.name
    f.close()
    return ScraperDatabase(path), path


def test_seed_inserts_four_languages():
    db, path = _make_db()
    try:
        seed_database(db)
        db.close()
        conn = sqlite3.connect(path)
        codes = {r[0] for r in conn.execute("SELECT code FROM languages").fetchall()}
        assert {"ar", "en", "uz", "ru"} == codes
        conn.close()
    finally:
        os.unlink(path)


def test_seed_inserts_114_surahs():
    db, path = _make_db()
    try:
        seed_database(db)
        db.close()
        conn = sqlite3.connect(path)
        count = conn.execute("SELECT COUNT(*) FROM surahs").fetchone()[0]
        assert count == 114
        conn.close()
    finally:
        os.unlink(path)


def test_seed_is_idempotent():
    db, path = _make_db()
    try:
        seed_database(db)
        seed_database(db)  # second call must not raise or duplicate
        db.close()
        conn = sqlite3.connect(path)
        lang_count = conn.execute("SELECT COUNT(*) FROM languages").fetchone()[0]
        surah_count = conn.execute("SELECT COUNT(*) FROM surahs").fetchone()[0]
        assert lang_count == 4
        assert surah_count == 114
        conn.close()
    finally:
        os.unlink(path)
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd packages/scraper && uv run pytest tests/test_seed.py -v
```

Expected: `FAILED` — `ModuleNotFoundError: No module named 'scraper.seed'`

- [ ] **Step 3: Create `scraper/seed.py`**

Create `packages/scraper/scraper/seed.py`:

```python
from .db import ScraperDatabase
from .models import LanguageModel
from .surah_meta import get_all_surahs

_LANGUAGES: list[LanguageModel] = [
    LanguageModel(code="ar", name_native="العربية", name_english="Arabic", direction="rtl"),
    LanguageModel(code="en", name_native="English", name_english="English", direction="ltr"),
    LanguageModel(code="uz", name_native="Oʻzbekcha", name_english="Uzbek", direction="ltr"),
    LanguageModel(code="ru", name_native="Русский", name_english="Russian", direction="ltr"),
]


def seed_database(db: ScraperDatabase) -> None:
    """Idempotently seeds languages and surah metadata. Call before any import pipeline."""
    for lang in _LANGUAGES:
        db.upsert_language(lang)
    for surah in get_all_surahs():
        db.upsert_surah(surah)
```

- [ ] **Step 4: Run tests**

```bash
cd packages/scraper && uv run pytest tests/test_seed.py -v
```

Expected: `3 passed`

- [ ] **Step 5: Run full suite**

```bash
cd packages/scraper && uv run pytest -v
```

Expected: all previous + 3 new = all pass

- [ ] **Step 6: Commit**

```bash
cd packages/scraper
git add scraper/seed.py tests/test_seed.py
git commit -m "feat(scraper): add seed_database helper for languages and surahs"
```

---

### Task 4: Tanzil XML importer

**Files:**
- Create: `packages/scraper/tests/fixtures/tanzil_sample.xml`
- Modify: `packages/scraper/scraper/sources/tanzil.py`
- Create: `packages/scraper/tests/test_tanzil.py`

Tanzil Uthmani XML format (download from `tanzil.net/trans/` — choose "Quran Text → Uthmani"):

```
<quran>
  <sura index="N" name="Arabic name">
    <aya index="N" text="Arabic text with diacritics"/>
    ...
  </sura>
  ...
</quran>
```

- [ ] **Step 1: Create the fixture**

Create `packages/scraper/tests/fixtures/tanzil_sample.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<quran>
  <sura index="1" name="الفاتحة">
    <aya index="1" text="بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِيمِ" />
    <aya index="2" text="ٱلۡحَمۡدُ لِلَّهِ رَبِّ ٱلۡعَـٰلَمِينَ" />
    <aya index="3" text="ٱلرَّحۡمَـٰنِ ٱلرَّحِيمِ" />
    <aya index="4" text="مَـٰلِكِ يَوۡمِ ٱلدِّينِ" />
    <aya index="5" text="إِيَّاكَ نَعۡبُدُ وَإِيَّاكَ نَسۡتَعِينُ" />
    <aya index="6" text="ٱهۡدِنَا ٱلصِّرَٰطَ ٱلۡمُسۡتَقِيمَ" />
    <aya index="7" text="صِرَٰطَ ٱلَّذِينَ أَنۡعَمۡتَ عَلَيۡهِمۡ غَيۡرِ ٱلۡمَغۡضُوبِ عَلَيۡهِمۡ وَلَا ٱلضَّآلِّينَ" />
  </sura>
</quran>
```

- [ ] **Step 2: Write failing tests**

Create `packages/scraper/tests/test_tanzil.py`:

```python
import os
import sqlite3
import tempfile
from pathlib import Path

from scraper.db import ScraperDatabase
from scraper.seed import seed_database
from scraper.sources.tanzil import import_tanzil_text

FIXTURE = Path(__file__).parent / "fixtures" / "tanzil_sample.xml"


def _make_db() -> tuple[ScraperDatabase, str]:
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    path = f.name
    f.close()
    db = ScraperDatabase(path)
    seed_database(db)  # surahs must exist before ayahs (FK)
    return db, path


def test_import_tanzil_inserts_all_ayahs():
    db, path = _make_db()
    try:
        import_tanzil_text(FIXTURE, db)
        db.close()
        conn = sqlite3.connect(path)
        count = conn.execute("SELECT COUNT(*) FROM ayahs WHERE surah_id=1").fetchone()[0]
        assert count == 7
        conn.close()
    finally:
        os.unlink(path)


def test_import_tanzil_stores_uthmani_text():
    db, path = _make_db()
    try:
        import_tanzil_text(FIXTURE, db)
        db.close()
        conn = sqlite3.connect(path)
        text = conn.execute(
            "SELECT text_uthmani FROM ayahs WHERE surah_id=1 AND ayah_number=1"
        ).fetchone()[0]
        assert "بِسۡمِ" in text
        conn.close()
    finally:
        os.unlink(path)


def test_import_tanzil_is_idempotent():
    db, path = _make_db()
    try:
        import_tanzil_text(FIXTURE, db)
        import_tanzil_text(FIXTURE, db)
        db.close()
        conn = sqlite3.connect(path)
        count = conn.execute("SELECT COUNT(*) FROM ayahs WHERE surah_id=1").fetchone()[0]
        assert count == 7
        conn.close()
    finally:
        os.unlink(path)


def test_import_tanzil_sets_ayah_number():
    db, path = _make_db()
    try:
        import_tanzil_text(FIXTURE, db)
        db.close()
        conn = sqlite3.connect(path)
        numbers = [
            r[0]
            for r in conn.execute(
                "SELECT ayah_number FROM ayahs WHERE surah_id=1 ORDER BY ayah_number"
            ).fetchall()
        ]
        assert numbers == list(range(1, 8))
        conn.close()
    finally:
        os.unlink(path)
```

- [ ] **Step 3: Run to confirm failure**

```bash
cd packages/scraper && uv run pytest tests/test_tanzil.py -v
```

Expected: `FAILED` — `NotImplementedError: Tanzil import implemented in Phase 2`

- [ ] **Step 4: Implement `import_tanzil_text`**

Replace the entire content of `packages/scraper/scraper/sources/tanzil.py`:

```python
"""Importer for Tanzil.net Quran text (Uthmani XML format).

Download the Uthmani XML from tanzil.net/trans/ once; do not re-scrape.
"""
import xml.etree.ElementTree as ET
from pathlib import Path

from ..db import ScraperDatabase
from ..models import AyahModel


def import_tanzil_text(xml_path: Path, db: ScraperDatabase) -> None:
    """Parse Tanzil Uthmani XML and upsert into ayahs table (text_uthmani field)."""
    tree = ET.parse(xml_path)
    root = tree.getroot()
    for sura in root.findall("sura"):
        surah_id = int(sura.attrib["index"])
        for aya in sura.findall("aya"):
            ayah_number = int(aya.attrib["index"])
            text_uthmani = aya.attrib["text"]
            ayah = AyahModel(
                surah_id=surah_id,
                ayah_number=ayah_number,
                text_uthmani=text_uthmani,
            )
            db.upsert_ayah(ayah)
```

- [ ] **Step 5: Run tests**

```bash
cd packages/scraper && uv run pytest tests/test_tanzil.py -v
```

Expected: `4 passed`

- [ ] **Step 6: Run full suite**

```bash
cd packages/scraper && uv run pytest -v
```

Expected: all pass

- [ ] **Step 7: Commit**

```bash
cd packages/scraper
git add scraper/sources/tanzil.py tests/test_tanzil.py tests/fixtures/tanzil_sample.xml
git commit -m "feat(scraper): implement Tanzil Uthmani XML importer"
```

---

### Task 5: QuranEnc JSON importer

**Files:**
- Create: `packages/scraper/tests/fixtures/quranenc_sample.json`
- Modify: `packages/scraper/scraper/sources/quranenc.py`
- Create: `packages/scraper/tests/test_quranenc.py`

QuranEnc export format (flat array of verse objects):

```json
[
  {"sura": 1, "aya": 1, "text": "Translation of verse 1:1"},
  {"sura": 1, "aya": 2, "text": "Translation of verse 1:2"},
  ...
]
```

The `language_code` and `translator` fields are passed as CLI arguments, not stored in the JSON.

- [ ] **Step 1: Create the fixture**

Create `packages/scraper/tests/fixtures/quranenc_sample.json`:

```json
[
  {"sura": 1, "aya": 1, "text": "In the name of Allah, the Entirely Merciful, the Especially Merciful."},
  {"sura": 1, "aya": 2, "text": "All praise is due to Allah, Lord of the worlds."},
  {"sura": 1, "aya": 3, "text": "The Entirely Merciful, the Especially Merciful,"},
  {"sura": 1, "aya": 4, "text": "Sovereign of the Day of Recompense."},
  {"sura": 1, "aya": 5, "text": "It is You we worship and You we ask for help."},
  {"sura": 1, "aya": 6, "text": "Guide us to the straight path —"},
  {"sura": 1, "aya": 7, "text": "The path of those upon whom You have bestowed favor, not of those who have evoked anger or of those who are astray."}
]
```

- [ ] **Step 2: Write failing tests**

Create `packages/scraper/tests/test_quranenc.py`:

```python
import os
import sqlite3
import tempfile
from pathlib import Path

from scraper.db import ScraperDatabase
from scraper.seed import seed_database
from scraper.sources.quranenc import import_quranenc_translation
from scraper.sources.tanzil import import_tanzil_text

FIXTURE_JSON = Path(__file__).parent / "fixtures" / "quranenc_sample.json"
FIXTURE_XML = Path(__file__).parent / "fixtures" / "tanzil_sample.xml"


def _make_db() -> tuple[ScraperDatabase, str]:
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    path = f.name
    f.close()
    db = ScraperDatabase(path)
    seed_database(db)
    import_tanzil_text(FIXTURE_XML, db)  # ayahs must exist before translations (FK)
    return db, path


def test_import_quranenc_inserts_translations():
    db, path = _make_db()
    try:
        import_quranenc_translation(FIXTURE_JSON, "en", "Sahih International", db)
        db.close()
        conn = sqlite3.connect(path)
        count = conn.execute(
            "SELECT COUNT(*) FROM translations WHERE language_code='en'"
        ).fetchone()[0]
        assert count == 7
        conn.close()
    finally:
        os.unlink(path)


def test_import_quranenc_stores_correct_text():
    db, path = _make_db()
    try:
        import_quranenc_translation(FIXTURE_JSON, "en", "Sahih International", db)
        db.close()
        conn = sqlite3.connect(path)
        row = conn.execute(
            """SELECT t.text FROM translations t
               JOIN ayahs a ON a.id = t.ayah_id
               WHERE a.surah_id=1 AND a.ayah_number=1 AND t.language_code='en'"""
        ).fetchone()
        assert row is not None
        assert "Merciful" in row[0]
        conn.close()
    finally:
        os.unlink(path)


def test_import_quranenc_stores_translator():
    db, path = _make_db()
    try:
        import_quranenc_translation(FIXTURE_JSON, "en", "Sahih International", db)
        db.close()
        conn = sqlite3.connect(path)
        row = conn.execute(
            "SELECT translator FROM translations WHERE language_code='en' LIMIT 1"
        ).fetchone()
        assert row[0] == "Sahih International"
        conn.close()
    finally:
        os.unlink(path)


def test_import_quranenc_is_idempotent():
    db, path = _make_db()
    try:
        import_quranenc_translation(FIXTURE_JSON, "en", "Sahih International", db)
        import_quranenc_translation(FIXTURE_JSON, "en", "Sahih International", db)
        db.close()
        conn = sqlite3.connect(path)
        count = conn.execute(
            "SELECT COUNT(*) FROM translations WHERE language_code='en'"
        ).fetchone()[0]
        assert count == 7
        conn.close()
    finally:
        os.unlink(path)
```

- [ ] **Step 3: Run to confirm failure**

```bash
cd packages/scraper && uv run pytest tests/test_quranenc.py -v
```

Expected: `FAILED` — `NotImplementedError: QuranEnc import implemented in Phase 2`

- [ ] **Step 4: Implement `import_quranenc_translation`**

Replace the entire content of `packages/scraper/scraper/sources/quranenc.py`:

```python
"""Importer for QuranEnc.com translations (flat JSON array format).

Download a translation JSON from QuranEnc.com. The format is:
  [{"sura": N, "aya": N, "text": "..."}, ...]

Pass language_code and translator as CLI arguments.
"""
import json
from pathlib import Path

from ..db import ScraperDatabase
from ..models import TranslationModel


def import_quranenc_translation(
    json_path: Path, language_code: str, translator: str, db: ScraperDatabase
) -> None:
    """Parse a QuranEnc JSON flat array and upsert into translations table."""
    verses: list[dict] = json.loads(json_path.read_text(encoding="utf-8"))

    # Build a lookup: (surah_id, ayah_number) -> ayah_id
    ayah_rows = db._conn.execute("SELECT id, surah_id, ayah_number FROM ayahs").fetchall()
    ayah_map: dict[tuple[int, int], int] = {
        (int(r[1]), int(r[2])): int(r[0]) for r in ayah_rows
    }

    for verse in verses:
        surah_id = int(verse["sura"])
        ayah_number = int(verse["aya"])
        text = str(verse["text"])
        ayah_id = ayah_map.get((surah_id, ayah_number))
        if ayah_id is None:
            continue  # ayah not in DB yet; skip (run import-tanzil first)
        translation = TranslationModel(
            ayah_id=ayah_id,
            language_code=language_code,
            translator=translator,
            text=text,
        )
        db.upsert_translation(translation)
```

- [ ] **Step 5: Run tests**

```bash
cd packages/scraper && uv run pytest tests/test_quranenc.py -v
```

Expected: `4 passed`

- [ ] **Step 6: Run full suite**

```bash
cd packages/scraper && uv run pytest -v
```

Expected: all pass

- [ ] **Step 7: Commit**

```bash
cd packages/scraper
git add scraper/sources/quranenc.py tests/test_quranenc.py tests/fixtures/quranenc_sample.json
git commit -m "feat(scraper): implement QuranEnc JSON translation importer"
```

---

### Task 6: corpus.quran.com HTML exploration

**Files:**
- Create: `packages/scraper/tools/inspect_corpus_html.py`
- Create: `packages/scraper/tests/fixtures/corpus_1_1.html` *(output of running this task)*

This task has no automated tests — it's a one-time exploration that produces the HTML fixture used in Task 7. Run it once, inspect the output, then proceed to Task 7.

> **Rate limit note:** The actual full scrape (Task 8) respects `robots.txt` with 1.5 s between requests. This exploration fetches exactly one page.

- [ ] **Step 1: Install Playwright browsers if not already done**

```bash
cd packages/scraper && uv run playwright install chromium
```

Expected: Chromium downloaded (may take ~1 minute). If already installed: `Chromium is already up to date`.

- [ ] **Step 2: Create the inspection script**

Create `packages/scraper/tools/inspect_corpus_html.py`:

```python
"""One-time exploration script: fetch corpus.quran.com 1:1 and save raw HTML.

Run: uv run python tools/inspect_corpus_html.py
Output: tests/fixtures/corpus_1_1.html (used by Task 7 parser tests)
"""
import asyncio
from pathlib import Path

from playwright.async_api import async_playwright

URL = "https://corpus.quran.com/wordbyword.jsp?chapter=1&verse=1"
FIXTURE_PATH = Path(__file__).parents[1] / "tests" / "fixtures" / "corpus_1_1.html"


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        print(f"Fetching {URL} ...")
        await page.goto(URL, wait_until="networkidle", timeout=30_000)
        html = await page.content()
        FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE_PATH.write_text(html, encoding="utf-8")
        print(f"Saved {len(html):,} bytes to {FIXTURE_PATH}")

        # Print structural overview to guide parser implementation
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "lxml")
        print("\n--- Top-level elements ---")
        for tag in ["table", "div", "tr", "td"]:
            elements = soup.find_all(tag)
            print(f"  <{tag}>: {len(elements)} total")
            if elements:
                first = elements[0]
                attrs = dict(list(first.attrs.items())[:3])
                print(f"    first attrs: {attrs}")

        print("\n--- Elements with lang='ar' ---")
        arabic_spans = soup.find_all(attrs={"lang": "ar"})
        print(f"  Count: {len(arabic_spans)}")
        if arabic_spans:
            print(f"  First 4 texts: {[s.get_text(strip=True) for s in arabic_spans[:4]]}")

        print("\n--- DONE ---")
        print("Open tests/fixtures/corpus_1_1.html in a browser or text editor.")
        print("Identify the CSS class/id pattern for word cells, then update Task 7.")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 3: Run the exploration script**

```bash
cd packages/scraper && uv run python tools/inspect_corpus_html.py
```

Expected output (values will vary based on real HTML):
```
Fetching https://corpus.quran.com/wordbyword.jsp?chapter=1&verse=1 ...
Saved ~50,000 bytes to .../tests/fixtures/corpus_1_1.html

--- Top-level elements ---
  <table>: N total
    first attrs: {...}
  ...
--- Elements with lang='ar' ---
  Count: 4
  First 4 texts: ['بِسۡمِ', 'ٱللَّهِ', 'ٱلرَّحۡمَـٰنِ', 'ٱلرَّحِيمِ']
--- DONE ---
```

- [ ] **Step 4: Inspect the saved HTML**

Open `tests/fixtures/corpus_1_1.html` in a text editor or browser. Note:
- The CSS class or id of the container table (e.g. `class="qtable"` or `id="corpus"`)
- How each word cell is structured (what tag, what class)
- Where the Arabic text, transliteration, POS tag, and English gloss appear
- Whether root/lemma data is present inline or only on the detail page

Write down your findings — you will use them in Task 7.

- [ ] **Step 5: Commit the fixture and exploration script**

```bash
cd packages/scraper
mkdir -p tools && touch tools/__init__.py
git add tools/inspect_corpus_html.py tools/__init__.py tests/fixtures/corpus_1_1.html
git commit -m "chore(scraper): add HTML exploration script and corpus 1:1 fixture"
```

---

### Task 7: corpus.quran.com HTML parser

**Files:**
- Create: `packages/scraper/scraper/sources/corpus_parser.py`
- Create: `packages/scraper/tests/test_corpus_parser.py`

This task depends on Task 6's fixture. The parser is a pure function so it is tested without network access.

> **Before writing code:** Open `tests/fixtures/corpus_1_1.html` and verify which CSS selectors to use. The selectors in Step 3 below must be updated to match the real HTML you found in Task 6.

The parser produces a `ParsedWord` per graphical Arabic token. Multiple morphemes within one token are captured in `morphology_json` (a JSON array). If the site only shows one POS tag per word, `morphology_json` is a single-element array.

- [ ] **Step 1: Write failing tests**

Create `packages/scraper/tests/test_corpus_parser.py`:

```python
"""
Tests for the corpus.quran.com HTML parser.

Uses tests/fixtures/corpus_1_1.html created by Task 6.
Al-Fatiha 1:1 has exactly 4 graphical words:
  1. بِسۡمِ  (bismi)
  2. ٱللَّهِ  (allahi)
  3. ٱلرَّحۡمَـٰنِ  (al-rahmani)
  4. ٱلرَّحِيمِ  (al-rahimi)
"""
from pathlib import Path

from scraper.sources.corpus_parser import ParsedWord, parse_verse_words

FIXTURE = Path(__file__).parent / "fixtures" / "corpus_1_1.html"


def _get_words() -> list[ParsedWord]:
    html = FIXTURE.read_text(encoding="utf-8")
    return parse_verse_words(html)


def test_returns_four_words_for_1_1():
    words = _get_words()
    assert len(words) == 4, f"Expected 4 words, got {len(words)}"


def test_positions_are_sequential():
    words = _get_words()
    assert [w.position for w in words] == [1, 2, 3, 4]


def test_all_words_have_arabic_text():
    words = _get_words()
    for w in words:
        assert w.text_arabic, f"Word at position {w.position} has empty text_arabic"


def test_first_word_contains_bismi():
    words = _get_words()
    # بِسۡمِ or بسم — strip diacritics for comparison
    arabic = words[0].text_arabic
    stripped = "".join(c for c in arabic if "ء" <= c <= "ۿ" or c == "ا")
    assert "بسم" in stripped or "بِسۡمِ" in arabic, f"Unexpected first word: {arabic!r}"


def test_english_gloss_present_for_first_word():
    words = _get_words()
    # Should have some English gloss — exact wording varies by site version
    assert words[0].english_gloss is not None
    assert len(words[0].english_gloss) > 0
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd packages/scraper && uv run pytest tests/test_corpus_parser.py -v
```

Expected: `FAILED` — `ModuleNotFoundError: No module named 'scraper.sources.corpus_parser'`

- [ ] **Step 3: Create `scraper/sources/corpus_parser.py`**

> **Action required:** Open `tests/fixtures/corpus_1_1.html`, find the CSS selectors for word cells, Arabic text spans, transliteration, POS, and gloss. Replace `WORD_CELL_SELECTOR`, `ARABIC_SELECTOR`, `TRANSLIT_SELECTOR`, `POS_SELECTOR`, and `GLOSS_SELECTOR` below with the actual selectors you found.

Create `packages/scraper/scraper/sources/corpus_parser.py`:

```python
"""Parser for corpus.quran.com word-by-word HTML pages.

Pure function: takes an HTML string, returns a list of ParsedWord.
No I/O, no network — safe to unit-test with a fixture.

CSS SELECTORS — update these after inspecting tests/fixtures/corpus_1_1.html:
"""
import json
from dataclasses import dataclass, field

from bs4 import BeautifulSoup

# ── Selector constants ────────────────────────────────────────────────────────
# Update these based on the actual HTML structure found in Task 6.
# Common patterns observed on corpus.quran.com (use whichever matches):
#   Word cells: td.odd, td.even, div[class*="word"], td[class*="token"]
#   Arabic text: span[lang="ar"], span.arabic, .arabic span
#   Transliteration: td.trans, span.trans, .transliteration
#   POS tag: td.pos, span.pos, .tag, .form
#   English gloss: td.eng, span.eng, .gloss, last <td> in a word cell

WORD_CELL_SELECTOR = "td.odd, td.even"   # VERIFY against fixture
ARABIC_SELECTOR = '[lang="ar"]'           # Usually stable
TRANSLIT_SELECTOR = "td:nth-of-type(2)"  # VERIFY: often the second cell in a word table
POS_SELECTOR = "td:nth-of-type(3)"       # VERIFY
GLOSS_SELECTOR = "td:nth-of-type(4)"     # VERIFY
# ─────────────────────────────────────────────────────────────────────────────


@dataclass
class ParsedWord:
    position: int
    text_arabic: str
    transliteration: str | None = None
    pos_tag: str | None = None
    root: str | None = None
    lemma: str | None = None
    english_gloss: str | None = None
    morphology_json: str | None = None  # JSON array of morpheme dicts


def _text(el: object | None) -> str | None:
    if el is None:
        return None
    text = getattr(el, "get_text", lambda **_: "")().strip()
    return text or None


def parse_verse_words(html: str) -> list[ParsedWord]:
    """Parse a corpus.quran.com wordbyword.jsp page and return one ParsedWord per token."""
    soup = BeautifulSoup(html, "lxml")
    cells = soup.select(WORD_CELL_SELECTOR)

    words: list[ParsedWord] = []
    for i, cell in enumerate(cells, start=1):
        arabic_el = cell.select_one(ARABIC_SELECTOR)
        if not arabic_el:
            continue  # skip header cells, etc.

        text_arabic = arabic_el.get_text(strip=True)
        if not text_arabic:
            continue

        # Extract transliteration, POS, gloss from the nested structure.
        # These selectors are relative to the word cell — adjust as needed.
        inner_cells = cell.select("td")
        translit = _text(inner_cells[0]) if len(inner_cells) > 0 else None
        pos = _text(inner_cells[1]) if len(inner_cells) > 1 else None
        gloss = _text(inner_cells[-1]) if inner_cells else None

        # Avoid assigning the Arabic text itself as transliteration
        if translit and any("؀" <= c <= "ۿ" for c in translit):
            translit = None

        morphology: list[dict] = []
        if pos:
            morphology = [{"pos": pos, "segment": text_arabic}]

        words.append(
            ParsedWord(
                position=i,
                text_arabic=text_arabic,
                transliteration=translit,
                pos_tag=pos,
                english_gloss=gloss,
                morphology_json=json.dumps(morphology, ensure_ascii=False) if morphology else None,
            )
        )

    return words
```

- [ ] **Step 4: Run tests**

```bash
cd packages/scraper && uv run pytest tests/test_corpus_parser.py -v
```

**If tests fail with `assert len(words) == 4, got 0`:** The CSS selectors do not match the real HTML. Open `tests/fixtures/corpus_1_1.html`, find the correct selectors, update the `WORD_CELL_SELECTOR`, `ARABIC_SELECTOR`, etc. constants in `corpus_parser.py`, and re-run.

**If tests pass:** Proceed.

Expected when selectors are correct: `5 passed`

- [ ] **Step 5: Run full suite**

```bash
cd packages/scraper && uv run pytest -v
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
cd packages/scraper
git add scraper/sources/corpus_parser.py tests/test_corpus_parser.py
git commit -m "feat(scraper): add corpus.quran.com HTML parser with ParsedWord dataclass"
```

---

### Task 8: corpus.quran.com Playwright fetcher and scraper orchestrator

**Files:**
- Modify: `packages/scraper/scraper/sources/corpus_quran.py`

The orchestrator:
1. Loops over surah IDs and their ayah counts (from `surah_meta`)
2. Skips verses already done in checkpoint
3. Fetches raw HTML via Playwright (async, rate-limited to 1.5 s between requests)
4. Saves raw HTML to `raw_scrape_dir/ch{N}_v{N}.html` (one file per verse)
5. Calls `parse_verse_words()` from Task 7
6. Upserts `WordModel` and `WordGlossModel` records into the DB
7. Marks the verse as done in checkpoint

No unit tests for the orchestrator (it requires Playwright + network). The scrape command is an integration-level operation verified manually. The parser (Task 7) and DB methods (Task 1) are already unit-tested.

- [ ] **Step 1: Replace `corpus_quran.py`**

Replace the entire content of `packages/scraper/scraper/sources/corpus_quran.py`:

```python
"""Scraper for corpus.quran.com — word-by-word morphology data.

Rate-limited to 1 req / 1.5 s per robots.txt policy. Resumable via Checkpoint.
Raw HTML snapshots are saved to raw_scrape_dir so re-parsing never requires re-scraping.
"""
import asyncio
import json
import sqlite3
from pathlib import Path

from playwright.async_api import BrowserContext, async_playwright

from ..checkpoint import Checkpoint
from ..db import ScraperDatabase
from ..models import WordGlossModel, WordModel
from ..surah_meta import get_all_surahs
from .corpus_parser import ParsedWord, parse_verse_words

RATE_LIMIT_SECONDS = 1.5
BASE_URL = "https://corpus.quran.com"


async def _fetch_verse_html(
    context: BrowserContext,
    surah_id: int,
    ayah_number: int,
) -> str:
    """Fetch one verse page and return its full HTML content."""
    url = f"{BASE_URL}/wordbyword.jsp?chapter={surah_id}&verse={ayah_number}"
    page = await context.new_page()
    try:
        await page.goto(url, wait_until="networkidle", timeout=30_000)
        return await page.content()
    finally:
        await page.close()


def _get_ayah_id(db: ScraperDatabase, surah_id: int, ayah_number: int) -> int | None:
    """Return the ayah.id for the given surah/ayah, or None if not yet imported."""
    row = db._conn.execute(
        "SELECT id FROM ayahs WHERE surah_id=? AND ayah_number=?",
        (surah_id, ayah_number),
    ).fetchone()
    return int(row[0]) if row else None


def _upsert_parsed_words(
    db: ScraperDatabase,
    ayah_id: int,
    words: list[ParsedWord],
    language_code: str = "en",
) -> None:
    """Upsert word rows and English glosses from parsed corpus data."""
    for pw in words:
        word = WordModel(
            ayah_id=ayah_id,
            position=pw.position,
            text_arabic=pw.text_arabic,
            transliteration=pw.transliteration,
            pos_tag=pw.pos_tag,
            root=pw.root,
            lemma=pw.lemma,
            morphology_json=pw.morphology_json,
        )
        word_id = db.upsert_word(word)
        if pw.english_gloss:
            gloss = WordGlossModel(
                word_id=word_id,
                language_code=language_code,
                gloss_text=pw.english_gloss,
            )
            db.upsert_word_gloss(gloss)


async def scrape_surah(
    surah_id: int,
    db: ScraperDatabase,
    checkpoint: Checkpoint,
    raw_scrape_dir: Path,
) -> None:
    """Scrape all ayahs for a surah. Skips verses already done in checkpoint."""
    surahs = {s.id: s for s in get_all_surahs()}
    surah = surahs.get(surah_id)
    if surah is None:
        raise ValueError(f"Unknown surah_id: {surah_id}")

    raw_scrape_dir.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (compatible; QuranCorpusScraper/1.0; "
                "+https://github.com/J3ff4/quran-corpus-pwa)"
            )
        )
        try:
            for ayah_number in range(1, surah.ayah_count + 1):
                key = f"corpus_{surah_id}_{ayah_number}"
                if checkpoint.is_done(key):
                    continue

                snapshot_path = raw_scrape_dir / f"ch{surah_id}_v{ayah_number}.html"

                # Use cached snapshot if available (avoids re-fetching on re-run)
                if snapshot_path.exists():
                    html = snapshot_path.read_text(encoding="utf-8")
                else:
                    html = await _fetch_verse_html(context, surah_id, ayah_number)
                    snapshot_path.write_text(html, encoding="utf-8")
                    await asyncio.sleep(RATE_LIMIT_SECONDS)

                ayah_id = _get_ayah_id(db, surah_id, ayah_number)
                if ayah_id is None:
                    # ayahs table not yet populated — skip word upsert but save snapshot
                    checkpoint.mark_done(key)
                    continue

                parsed_words = parse_verse_words(html)
                _upsert_parsed_words(db, ayah_id, parsed_words)
                checkpoint.mark_done(key)

        finally:
            await context.close()
            await browser.close()
```

- [ ] **Step 2: Verify the module imports without error**

```bash
cd packages/scraper && uv run python -c "from scraper.sources.corpus_quran import scrape_surah; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Run full test suite**

```bash
cd packages/scraper && uv run pytest -v
```

Expected: all pass (the orchestrator itself has no new unit tests)

- [ ] **Step 4: Commit**

```bash
cd packages/scraper
git add scraper/sources/corpus_quran.py
git commit -m "feat(scraper): implement Playwright-based corpus.quran.com scraper orchestrator"
```

---

### Task 9: Wire up the CLI

**Files:**
- Modify: `packages/scraper/scraper/cli.py`

Connect all commands to their implementations. Each command calls `seed_database(db)` first (idempotent). The `scrape` command runs the async orchestrator via `asyncio.run()`.

- [ ] **Step 1: Replace `cli.py`**

Replace the entire content of `packages/scraper/scraper/cli.py`:

```python
import asyncio
from pathlib import Path

import click

from .checkpoint import Checkpoint
from .db import ScraperDatabase
from .seed import seed_database


@click.group()
def main() -> None:
    """Quran corpus scraper and data importer."""


@main.command()
@click.option("--db", default="quran.db", show_default=True, help="SQLite output path")
@click.option(
    "--checkpoint", default="checkpoint.json", show_default=True, help="Checkpoint file path"
)
@click.option(
    "--raw-scrape-dir",
    default="raw-scrape",
    show_default=True,
    help="Directory to save raw HTML snapshots",
)
@click.option("--surah", type=int, default=None, help="Scrape a single surah (1–114)")
def scrape(db: str, checkpoint: str, raw_scrape_dir: str, surah: int | None) -> None:
    """Scrape corpus.quran.com morphology data (rate-limited, resumable)."""
    from .sources.corpus_quran import scrape_surah

    database = ScraperDatabase(db)
    seed_database(database)
    cp = Checkpoint(checkpoint)
    raw_dir = Path(raw_scrape_dir)
    surah_range = [surah] if surah else list(range(1, 115))

    for surah_id in surah_range:
        click.echo(f"Scraping surah {surah_id} ...")
        asyncio.run(scrape_surah(surah_id, database, cp, raw_dir))

    database.close()
    click.echo("Done.")


@main.command("import-tanzil")
@click.argument("xml_path")
@click.option("--db", default="quran.db", show_default=True)
def import_tanzil(xml_path: str, db: str) -> None:
    """Import a Tanzil Uthmani XML file (Arabic text) into the ayahs table."""
    from .sources.tanzil import import_tanzil_text

    database = ScraperDatabase(db)
    seed_database(database)
    import_tanzil_text(Path(xml_path), database)
    database.close()
    click.echo(f"Imported Tanzil text from {xml_path}")


@main.command("import-quranenc")
@click.argument("json_path")
@click.argument("language_code")
@click.argument("translator")
@click.option("--db", default="quran.db", show_default=True)
def import_quranenc(json_path: str, language_code: str, translator: str, db: str) -> None:
    """Import a QuranEnc JSON translation file into the translations table.

    \b
    Example:
      scraper import-quranenc en_sahih.json en "Sahih International"
      scraper import-quranenc uz_abdulaziz.json uz "Abdulaziz Mansur"
      scraper import-quranenc ru_kuliev.json ru "Elmir Kuliev"
    """
    from .sources.quranenc import import_quranenc_translation

    database = ScraperDatabase(db)
    seed_database(database)
    import_quranenc_translation(Path(json_path), language_code, translator, database)
    database.close()
    click.echo(f"Imported {language_code} translations from {json_path}")
```

- [ ] **Step 2: Verify CLI help**

```bash
cd packages/scraper && uv run scraper --help
```

Expected:
```
Usage: scraper [OPTIONS] COMMAND [ARGS]...

  Quran corpus scraper and data importer.

Commands:
  import-quranenc  Import a QuranEnc JSON translation file...
  import-tanzil    Import a Tanzil Uthmani XML file...
  scrape           Scrape corpus.quran.com morphology data...
```

- [ ] **Step 3: Verify sub-command help**

```bash
cd packages/scraper && uv run scraper scrape --help
cd packages/scraper && uv run scraper import-tanzil --help
cd packages/scraper && uv run scraper import-quranenc --help
```

Expected: each shows its options without error.

- [ ] **Step 4: Smoke-test the seed path**

```bash
cd packages/scraper
uv run scraper import-tanzil tests/fixtures/tanzil_sample.xml --db /tmp/smoke_test.db
sqlite3 /tmp/smoke_test.db "SELECT COUNT(*) FROM surahs; SELECT COUNT(*) FROM ayahs;"
rm /tmp/smoke_test.db
```

Expected output:
```
Imported Tanzil text from tests/fixtures/tanzil_sample.xml
114
7
```

- [ ] **Step 5: Run lint and type-check**

```bash
cd packages/scraper
uv run ruff check scraper/
uv run mypy scraper/ --ignore-missing-imports
```

Expected: zero errors on both.

- [ ] **Step 6: Run full test suite**

```bash
cd packages/scraper && uv run pytest -v
```

Expected: all pass

- [ ] **Step 7: Commit**

```bash
cd packages/scraper
git add scraper/cli.py
git commit -m "feat(scraper): wire all CLI commands with seed_database and corpus orchestrator"
```

---

## Acceptance Criteria

- [ ] `uv run scraper --help` shows 3 sub-commands: `import-tanzil`, `import-quranenc`, `scrape`
- [ ] `uv run scraper import-tanzil <tanzil_uthmani.xml>` populates `surahs` (114 rows), `languages` (4 rows), `ayahs` (6236 rows for full Quran)
- [ ] `uv run scraper import-quranenc <en.json> en "Sahih International"` populates `translations` for all 6236 ayahs
- [ ] `uv run scraper scrape --surah 1` scrapes Al-Fatiha (7 verses), saves 7 HTML snapshots under `raw-scrape/`, populates `words` rows
- [ ] `uv run scraper scrape --surah 1` run a second time completes instantly (all verses in checkpoint)
- [ ] `uv run pytest -v` → all tests pass (target: ≥ 22 tests)
- [ ] `uv run ruff check scraper/` → zero errors
- [ ] `uv run mypy scraper/ --ignore-missing-imports` → zero errors
- [ ] No `.db` files committed to git

---

## Data Download Instructions

Before running the full pipeline, download the source files:

**Tanzil Uthmani XML:**
1. Go to `https://tanzil.net/trans/`
2. Select "Quran Text" → "Uthmani"
3. Format: XML
4. Download → save as `tanzil-uthmani.xml`

**QuranEnc translations** (flat JSON format: `[{"sura": N, "aya": N, "text": "..."}, ...]`):
1. Go to `https://quranenc.com`
2. Find a translation → use their API or download links
3. Save as e.g. `en_sahih.json`, `uz_mansur.json`, `ru_kuliev.json`
4. Verify the format matches the fixture in `tests/fixtures/quranenc_sample.json`; if it differs, adapt `import_quranenc_translation` accordingly

---

## Risks and Rollbacks

| Risk | Mitigation |
|------|-----------|
| corpus.quran.com HTML structure differs from fixture | Task 6 exploration reveals actual structure; update selectors in `corpus_parser.py` and fixture |
| corpus.quran.com changes its HTML between scrape runs | Raw HTML snapshots in `raw-scrape/` protect against this — re-parse from snapshots without re-fetching |
| QuranEnc uses a different JSON format | Inspect a downloaded file; if nested (not flat array), adapt the loop in `import_quranenc_translation` |
| Playwright `networkidle` never fires on a slow verse page | Change `wait_until="networkidle"` to `wait_until="domcontentloaded"` in `_fetch_verse_html` |
| FK violation on `upsert_word` if `ayah_id` not found | `_get_ayah_id` returns `None` → verse is skipped but checkpointed; run `import-tanzil` first to create ayahs |
| Scrape interrupted mid-surah | Resume with same command; checkpoint skips completed verses; HTML snapshots prevent re-fetching |
| `RETURNING id` not supported in old SQLite (< 3.35) | Already handled in Phase 01 `db.py`; Python 3.12 ships SQLite ≥ 3.39 |
