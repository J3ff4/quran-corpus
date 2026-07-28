# Phase 17 — Single-Form Root Parser + Raw Snapshots

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover derived-form data for the 712 roots (43.4% of the dictionary) that currently have zero `root_forms` rows, and persist raw scrape HTML so the next parser bug needs no re-fetch.

**Architecture:** Parser-only defect. `_extract_forms` reads `<ul class="also">`; corpus omits that list when a root has exactly one derived form and states the form inline in the intro prose instead. Add a prose fallback used only when the list yields nothing, then re-scrape just the affected roots. Snapshot writing is a new orthogonal module wired into the existing scrape loop.

**Tech Stack:** Python 3.12, BeautifulSoup4 + lxml, httpx, click, pytest, uv. SQLite. No new dependencies (`gzip`, `urllib.parse`, `pathlib` are stdlib).

## Global Constraints

- No new dependencies. Stdlib only for snapshots.
- Rate limit stays ≥ 1.5 s/request (CLAUDE.md §11). Never lower it.
- Scrape must stay resumable via `Checkpoint`.
- `packages/data` untouched — this is scraper + data only. No web code changes (see Task 5 for why).
- Conventional Commits, one logical change per commit (§9).
- Parser stays pure `str -> ParsedRoot`, network-free, fixture-tested.
- Snapshots never enter git.

---

## Diagnosis (evidence, already gathered — do not re-derive)

Five live pages fetched 2026-07-27 and run through the current parser:

| root | occ | current parse | corpus intro sentence |
|---|---|---|---|
| `qrb` | 96 | **11 forms** ✓ | "... in eleven derived forms:" + `ul.also` |
| `ArD` | 461 | **0 forms** ✗ | "occurs 461 times in the Quran as the noun arḍ ( أَرْض )." |
| `ywm` | 405 | **0 forms** ✗ | "... as the nominal yawm ( يَوْم )." |
| `nws` | 241 | **0 forms** ✗ | "... as the noun nās ( نَّاس )." |
| `lys` | 89 | **0 forms** ✗ | "... as the form I verb laysa ( لَّيْسَ )." |
| `$El` | 1 | **0 forms** ✗ | "occurs only once in the Quran, as the form VIII verb ish'taʿala ( ٱشْتَعَلَ )." |

On failing pages there is exactly one `ul.also` — the "See Also" box — and its `<li>`s carry no `span.at`, so `_extract_forms` correctly rejects them and returns `[]`.

Trigger is **one distinct form**, not low frequency (`ArD` occurs 461×). DB confirms: `0 forms: 712 roots`, `1 form: 0 roots`, `2 forms: 306 roots`. The empty "exactly 1" bucket is the signature.

Sample pages saved at `/tmp/claude-1000/-home-claude-projects-quran-corpus-pwa/34f952f0-027c-481c-a83e-31ea3b02093b/scratchpad/rootpages/`. If gone, regenerate:

```bash
curl -sS -A "quran-corpus-pwa research" "https://corpus.quran.com/qurandictionary.jsp?q=\$El" -o El.html
```

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/scraper/scraper/sources/corpus_dictionary.py` | **Modify.** Add `_SINGLE_FORM_RE` + `_extract_single_form`; wire into `parse_root_page` as fallback. |
| `packages/scraper/scraper/snapshots.py` | **Create.** `save_snapshot(dir, key, html)`. Gzip + percent-encoded filename. Nothing else. |
| `packages/scraper/scraper/sources/dictionary_scrape.py` | **Modify.** `scrape_dictionary` gains `roots=` and `snapshot_dir=` kwargs. |
| `packages/scraper/scraper/db.py` | **Modify.** Add `get_roots_without_forms()`. |
| `packages/scraper/scraper/cli.py` | **Modify.** Add `rescrape-formless-roots` command; add `--snapshot-dir` to `scrape-dictionary`. |
| `packages/scraper/.gitignore` | **Create.** Ignore `.snapshots/`. |
| `packages/scraper/tests/test_corpus_dictionary.py` | **Modify.** Single-form parse tests. |
| `packages/scraper/tests/test_snapshots.py` | **Create.** Round-trip + collision tests. |
| `packages/scraper/tests/test_dictionary_scrape.py` | **Modify.** `roots=` filter + snapshot writing. |
| `apps/web/src/test/FormFilterChips.test.tsx` | **Modify.** Regression test: one form → one chip. |

---

## Task 1: Parser — single-form prose fallback

**Files:**
- Modify: `packages/scraper/scraper/sources/corpus_dictionary.py`
- Test: `packages/scraper/tests/test_corpus_dictionary.py`

**Interfaces:**
- Consumes: existing `_parse_count`, `_cap_first`, `ParsedRootForm`, `_extract_forms`.
- Produces: `_extract_single_form(text: str, total: int) -> list[ParsedRootForm]` — returns `[]` or exactly one form with `sort_order=0`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/scraper/tests/test_corpus_dictionary.py`:

```python
# Corpus omits <ul class="also"> when a root has exactly ONE derived form and
# states it inline instead. 712 roots (43.4%) hit this. Real sentences, 2026-07-27.
_ONE_FORM_ONCE_HTML = (
    '<html><body>The triliteral root shīn ʿayn lām '
    '(<span class="at">ش ع ل</span>) occurs only once in the Quran, as the '
    'form VIII verb <i class="ab">ish\'taʿala</i> '
    '(<span class="at">ٱشْتَعَلَ</span>).</body></html>'
)
_ONE_FORM_MANY_HTML = (
    '<html><body>The triliteral root hamza rā ḍād '
    '(<span class="at">أ ر ض</span>) occurs 461 times in the Quran as the '
    'noun <i class="ab">arḍ</i> (<span class="at">أَرْض</span>).</body></html>'
)


def test_single_form_root_once_is_parsed() -> None:
    parsed = parse_root_page(_ONE_FORM_ONCE_HTML)
    assert parsed is not None
    assert parsed.occurrence_count == 1
    assert len(parsed.forms) == 1
    f = parsed.forms[0]
    assert f.sort_order == 0
    assert f.pos_label == "Form VIII verb"
    assert f.form_translit == "ish'taʿala"
    assert f.form_arabic == "ٱشْتَعَلَ"
    # Only form, so it accounts for every occurrence of the root.
    assert f.occurrence_count == 1


def test_single_form_root_high_frequency_is_parsed() -> None:
    # Trigger is ONE form, not low frequency -- this root occurs 461 times.
    parsed = parse_root_page(_ONE_FORM_MANY_HTML)
    assert parsed is not None
    assert len(parsed.forms) == 1
    assert parsed.forms[0].pos_label == "Noun"
    assert parsed.forms[0].form_translit == "arḍ"
    assert parsed.forms[0].occurrence_count == 461


def test_multi_form_page_ignores_the_prose_fallback(ktb: ParsedRoot) -> None:
    # The fallback must never fire when the list parsed; guards against a
    # stray sentence match overwriting real per-form counts.
    # ktb: 319 occurrences across 7 forms counting [49,1,1,260,1,6,1] --
    # none equals the total, so a fallback form would stand out immediately.
    assert len(ktb.forms) == 7
    assert all(f.occurrence_count != ktb.occurrence_count for f in ktb.forms)
```

> `ktb` is the existing module-scoped fixture at the top of this file (parses `tests/fixtures/corpus_dict_ktb.html`). Verified 2026-07-27: 7 forms, total 319, counts `[49, 1, 1, 260, 1, 6, 1]`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/scraper && uv run pytest tests/test_corpus_dictionary.py -k single_form -v
```
Expected: 2 FAIL — `assert 0 == 1` on `len(parsed.forms)`.

- [ ] **Step 3: Implement**

In `corpus_dictionary.py`, add after `_FORM_RE` (~line 31):

```python
# When a root has exactly ONE derived form, corpus emits no <ul class="also">
# and names the form inline: "... in the Quran, as the noun arḍ ( أَرْض )".
# The comma is optional ("occurs 461 times in the Quran as the noun ...").
# pos is non-greedy so "form VIII verb ish'taʿala" splits at the last token
# before the parenthesis; translit is \S+ because it carries apostrophes.
_SINGLE_FORM_RE = re.compile(
    r"in the Quran,?\s+as the\s+(?P<pos>.+?)\s+(?P<translit>\S+)\s*"
    r"\(\s*(?P<arabic>[^)]+?)\s*\)",
    re.IGNORECASE,
)
```

Add after `_extract_forms` (before `_extract_lane_url`):

```python
def _extract_single_form(text: str, total: int) -> list[ParsedRootForm]:
    """Fallback for roots with one derived form and therefore no forms list.

    The form accounts for every occurrence of the root, so its count is the
    root total. Returns [] when the sentence does not match, which is the
    normal case for multi-form roots.
    """
    m = _SINGLE_FORM_RE.search(text)
    if m is None:
        return []
    return [
        ParsedRootForm(
            sort_order=0,
            pos_label=_cap_first(m.group("pos").strip()),
            form_arabic=m.group("arabic").strip() or None,
            form_translit=m.group("translit").strip() or None,
            gloss=None,
            occurrence_count=total,
        )
    ]
```

In `parse_root_page`, replace the `forms=` argument:

```python
    forms = _extract_forms(soup) or _extract_single_form(text, total)

    return ParsedRoot(
        root_arabic=root_arabic,
        occurrence_count=total,
        forms=forms,
        lane_url=_extract_lane_url(soup),
    )
```

Update the module docstring's "Page shape" block — add beneath it:

```
Single-form roots carry no <ul class="also">; the form is stated inline:
  "... occurs 461 times in the Quran as the noun <i class="ab">arḍ</i>
   (<span class="at">أَرْض</span>)."
```

- [ ] **Step 4: Run the full parser suite**

```bash
cd packages/scraper && uv run pytest tests/test_corpus_dictionary.py -v
```
Expected: all PASS, including the pre-existing multi-form and See-Also tests.

- [ ] **Step 5: Verify against the five real pages**

```bash
cd packages/scraper && uv run python - <<'PY'
from scraper.sources.corpus_dictionary import parse_root_page
from pathlib import Path
D = Path("/tmp/claude-1000/-home-claude-projects-quran-corpus-pwa/34f952f0-027c-481c-a83e-31ea3b02093b/scratchpad/rootpages")
for n, want in [("qrb",11), ("ArD",1), ("ywm",1), ("nws",1), ("lys",1), ("El",1)]:
    p = parse_root_page((D / f"{n}.html").read_text(errors="replace"))
    got = len(p.forms)
    print(f"{n}: {got} forms (want {want}) {'OK' if got == want else 'FAIL'}")
PY
```
Expected: six OK lines. `qrb` must stay at 11 — proof the fallback did not fire on a list page.

- [ ] **Step 6: Commit**

```bash
git add packages/scraper/scraper/sources/corpus_dictionary.py packages/scraper/tests/test_corpus_dictionary.py
git commit -m "fix(scraper): parse single-form roots stated inline, not as a list"
```

---

## Task 2: Raw snapshot persistence

**Files:**
- Create: `packages/scraper/scraper/snapshots.py`
- Create: `packages/scraper/.gitignore`
- Test: `packages/scraper/tests/test_snapshots.py`

**Interfaces:**
- Produces: `save_snapshot(root_dir: str | Path, key: str, html: str) -> Path`.

- [ ] **Step 1: Write the failing test**

Create `packages/scraper/tests/test_snapshots.py`:

```python
from __future__ import annotations

import gzip

from scraper.snapshots import save_snapshot


def test_snapshot_round_trips(tmp_path) -> None:
    p = save_snapshot(tmp_path, "root_ktb", "<html>ك ت ب</html>")
    assert p.exists()
    with gzip.open(p, "rt", encoding="utf-8") as fh:
        assert fh.read() == "<html>ك ت ب</html>"


def test_buckwalter_keys_do_not_collide(tmp_path) -> None:
    # Buckwalter uses $ ' > < & } * -- none are filesystem-safe, and naive
    # sanitising would map "$El" and "'El" onto the same file.
    a = save_snapshot(tmp_path, "root_$El", "dollar")
    b = save_snapshot(tmp_path, "root_'El", "apostrophe")
    assert a != b
    with gzip.open(a, "rt", encoding="utf-8") as fh:
        assert fh.read() == "dollar"
    with gzip.open(b, "rt", encoding="utf-8") as fh:
        assert fh.read() == "apostrophe"


def test_creates_directory_and_overwrites(tmp_path) -> None:
    d = tmp_path / "nested" / "snaps"
    save_snapshot(d, "root_ktb", "first")
    p = save_snapshot(d, "root_ktb", "second")
    with gzip.open(p, "rt", encoding="utf-8") as fh:
        assert fh.read() == "second"
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd packages/scraper && uv run pytest tests/test_snapshots.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'scraper.snapshots'`.

- [ ] **Step 3: Implement**

Create `packages/scraper/scraper/snapshots.py`:

```python
"""Persist raw scraped HTML so re-parsing never requires a re-fetch.

CLAUDE.md §11 asks for this. It was not happening for root pages, which is
why diagnosing the single-form parser gap in Phase 17 needed live requests.
"""

from __future__ import annotations

import gzip
from pathlib import Path
from urllib.parse import quote


def save_snapshot(root_dir: str | Path, key: str, html: str) -> Path:
    """Write ``html`` to ``<root_dir>/<key>.html.gz``. Overwrites.

    The key is percent-encoded rather than character-stripped: Buckwalter
    roots use ``$ ' > < & } *``, so stripping would collide ``$El`` with
    ``'El``. Encoding is reversible via ``urllib.parse.unquote``.
    """
    d = Path(root_dir)
    d.mkdir(parents=True, exist_ok=True)
    path = d / f"{quote(key, safe='')}.html.gz"
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        fh.write(html)
    return path
```

Create `packages/scraper/.gitignore`:

```
# Raw scrape snapshots -- large, regenerable, never in git (CLAUDE.md §9, §11)
.snapshots/
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd packages/scraper && uv run pytest tests/test_snapshots.py -v
```
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/scraper/snapshots.py packages/scraper/tests/test_snapshots.py packages/scraper/.gitignore
git commit -m "feat(scraper): persist raw scrape HTML as gzipped snapshots"
```

---

## Task 3: Wire snapshots + root filtering into the scrape loop

**Files:**
- Modify: `packages/scraper/scraper/sources/dictionary_scrape.py`
- Modify: `packages/scraper/scraper/db.py`
- Test: `packages/scraper/tests/test_dictionary_scrape.py`

**Interfaces:**
- Consumes: `save_snapshot` (Task 2).
- Produces:
  - `scrape_dictionary(db, checkpoint, *, client_factory=..., rate_limit=1.5, roots: list[str] | None = None, snapshot_dir: str | Path | None = None) -> int`
  - `ScraperDatabase.get_roots_without_forms() -> list[str]`

- [ ] **Step 1: Write the failing tests**

Append to `packages/scraper/tests/test_dictionary_scrape.py`:

```python
def test_scrape_dictionary_honours_explicit_root_list(tmp_path):
    # Re-scraping only the broken roots must not re-fetch all 1,642.
    db = _seed(tmp_path)
    html = (FIX / "corpus_dict_ktb.html").read_text(encoding="utf-8")
    ck = Checkpoint(str(tmp_path / "c.json"))
    n = scrape_dictionary(
        db, ck, client_factory=lambda: _FakeClient(html), rate_limit=0, roots=[]
    )
    assert n == 0
    assert not ck.is_done("root_ktb")


def test_scrape_dictionary_writes_snapshots(tmp_path):
    db = _seed(tmp_path)
    html = (FIX / "corpus_dict_ktb.html").read_text(encoding="utf-8")
    ck = Checkpoint(str(tmp_path / "c.json"))
    snaps = tmp_path / "snaps"
    scrape_dictionary(
        db,
        ck,
        client_factory=lambda: _FakeClient(html),
        rate_limit=0,
        snapshot_dir=snaps,
    )
    written = list(snaps.glob("*.html.gz"))
    assert len(written) == 1


def test_scrape_dictionary_writes_no_snapshots_by_default(tmp_path):
    db = _seed(tmp_path)
    html = (FIX / "corpus_dict_ktb.html").read_text(encoding="utf-8")
    ck = Checkpoint(str(tmp_path / "c.json"))
    scrape_dictionary(db, ck, client_factory=lambda: _FakeClient(html), rate_limit=0)
    assert not (tmp_path / ".snapshots").exists()
```

Append to `packages/scraper/tests/test_db.py`:

```python
def test_get_roots_without_forms(tmp_path):
    from scraper.db import ScraperDatabase
    from scraper.models import RootFormModel, RootModel

    db = ScraperDatabase(str(tmp_path / "d.db"))
    with_forms = db.upsert_root(
        RootModel(root_buckwalter="ktb", root_arabic="ك ت ب", occurrence_count=319)
    )
    db.upsert_root(
        RootModel(root_buckwalter="ArD", root_arabic="أ ر ض", occurrence_count=461)
    )
    db.upsert_root_form(
        RootFormModel(
            root_id=with_forms,
            sort_order=0,
            pos_label="Noun",
            form_arabic="كِتَٰب",
            form_translit="kitāb",
            gloss=None,
            occurrence_count=230,
        )
    )
    assert db.get_roots_without_forms() == ["ArD"]
    db.close()
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd packages/scraper && uv run pytest tests/test_dictionary_scrape.py tests/test_db.py -k "root_list or snapshot or without_forms" -v
```
Expected: FAIL — `TypeError: unexpected keyword argument 'roots'` and `AttributeError: 'ScraperDatabase' object has no attribute 'get_roots_without_forms'`.

- [ ] **Step 3: Implement the db helper**

In `packages/scraper/scraper/db.py`, add directly after `get_distinct_roots`:

```python
    def get_roots_without_forms(self) -> list[str]:
        """Buckwalter roots that have no root_forms rows.

        Phase 17: these are the single-form roots the old parser dropped.
        """
        return [
            r[0]
            for r in self._conn.execute(
                "SELECT r.root_buckwalter FROM roots r "
                "WHERE NOT EXISTS "
                "  (SELECT 1 FROM root_forms f WHERE f.root_id = r.id) "
                "ORDER BY r.root_buckwalter"
            ).fetchall()
        ]
```

- [ ] **Step 4: Implement the scrape-loop changes**

In `dictionary_scrape.py`, add the import beneath the existing ones:

```python
from pathlib import Path

from ..snapshots import save_snapshot
```

Change the `scrape_dictionary` signature and the two lines noted:

```python
def scrape_dictionary(
    db: ScraperDatabase,
    checkpoint: Checkpoint,
    *,
    client_factory: ClientFactory = _default_factory,
    rate_limit: float = 1.5,
    roots: list[str] | None = None,
    snapshot_dir: str | Path | None = None,
) -> int:
    """Scrape each distinct root's dictionary page. Returns #roots stored.

    ``roots`` overrides the full root list -- used to re-scrape only the roots
    a parser fix affects. ``snapshot_dir`` persists the raw HTML so a future
    parser change can re-parse without re-fetching (CLAUDE.md §11).
    """
    stored = 0
    roots = roots if roots is not None else db.get_distinct_roots()
```

Then inside the loop, immediately after `resp = get_with_retry(...)`:

```python
            if snapshot_dir is not None:
                save_snapshot(snapshot_dir, key, resp.text)
```

- [ ] **Step 5: Run the scraper suite**

```bash
cd packages/scraper && uv run pytest -q
```
Expected: all PASS, count = previous total + 6.

- [ ] **Step 6: Commit**

```bash
git add packages/scraper/scraper/sources/dictionary_scrape.py packages/scraper/scraper/db.py packages/scraper/tests/
git commit -m "feat(scraper): scrape a root subset and snapshot raw HTML"
```

---

## Task 4: CLI command + the actual re-scrape

**Files:**
- Modify: `packages/scraper/scraper/cli.py`
- Test: `packages/scraper/tests/test_cli.py`

**Interfaces:**
- Consumes: `get_roots_without_forms`, `scrape_dictionary(roots=, snapshot_dir=)`.
- Produces: CLI `rescrape-formless-roots`.

- [ ] **Step 1: Write the failing test**

Append to `packages/scraper/tests/test_cli.py`. The file already imports `main` and defines a `runner` fixture, so use them directly:

```python
def test_rescrape_formless_roots_is_registered():
    assert "rescrape-formless-roots" in main.commands


def test_rescrape_formless_roots_no_op_on_clean_db(runner, tmp_path):
    # Empty DB -> no formless roots -> must exit 0 without making any request.
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])
    result = runner.invoke(
        main,
        [
            "rescrape-formless-roots",
            "--db", db,
            "--checkpoint", str(tmp_path / "c.json"),
            "--snapshot-dir", str(tmp_path / "snaps"),
        ],
    )
    assert result.exit_code == 0
    assert "nothing to do" in result.output
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd packages/scraper && uv run pytest tests/test_cli.py -k formless -v
```
Expected: FAIL — `KeyError` / assertion error.

- [ ] **Step 3: Implement**

In `cli.py`, add after `scrape_dictionary_cmd`:

```python
@main.command("rescrape-formless-roots")
@click.option("--db", default="quran.db", show_default=True, help="SQLite output path")
@click.option("--checkpoint", default="dict_checkpoint.json", show_default=True)
@click.option(
    "--snapshot-dir", default=".snapshots/roots", show_default=True,
    help="Persist raw HTML here so a future parser fix needs no re-fetch",
)
@click.option(
    "--rate-limit", default=1.5, show_default=True, help="Seconds between requests"
)
def rescrape_formless_roots_cmd(
    db: str, checkpoint: str, snapshot_dir: str, rate_limit: float
) -> None:
    """Re-scrape only roots that currently have zero derived forms.

    Phase 17: the old parser dropped single-form roots, leaving 712 of them
    empty. Clears just those roots' checkpoint keys so the run is resumable
    without redoing the other ~930.
    """
    from .sources.dictionary_scrape import scrape_dictionary

    database = ScraperDatabase(db)
    targets = database.get_roots_without_forms()
    if not targets:
        click.echo("rescrape-formless-roots: nothing to do.")
        database.close()
        return

    ckpt = Checkpoint(checkpoint)
    for bw in targets:
        ckpt.clear(f"root_{bw}")

    click.echo(f"re-scraping {len(targets)} formless roots...")
    count = scrape_dictionary(
        database,
        ckpt,
        rate_limit=rate_limit,
        roots=targets,
        snapshot_dir=snapshot_dir,
    )
    remaining = len(database.get_roots_without_forms())
    database.close()
    click.echo(
        f"rescrape-formless-roots: {count} roots re-scraped, "
        f"{remaining} still without forms."
    )
```

Also add `--snapshot-dir` to the existing `scrape_dictionary_cmd` so full scrapes snapshot too:

```python
@click.option(
    "--snapshot-dir", default=".snapshots/roots", show_default=True,
    help="Persist raw HTML here (CLAUDE.md §11)",
)
```
and thread it: `scrape_dictionary(database, ckpt, rate_limit=rate_limit, snapshot_dir=snapshot_dir)`.

- [ ] **Step 4: Run to verify it passes**

```bash
cd packages/scraper && uv run pytest -q && uv run ruff check scraper tests
```
Expected: all tests PASS. Ruff: only the 12 pre-existing errors (`cli.py`, `corpus_parser.py`, `qul.py`, `test_db.py`, `test_review_glosses.py`, `import_alqurancloud.py`, `spike_form_lemma_alignment.py`) — **zero in files this phase touches**.

- [ ] **Step 5: Back up the DB**

```bash
cp ~/quran-data/quran.db ~/quran-data/quran.db.pre-phase17-$(date +%Y%m%d-%H%M%S)
```
Expected: a new `.bak`-style file. This is the rollback (see Risks).

- [ ] **Step 6: Dry-run on three roots first**

```bash
cd packages/scraper && uv run python - <<'PY'
from scraper.db import ScraperDatabase
from scraper.checkpoint import Checkpoint
from scraper.sources.dictionary_scrape import scrape_dictionary
db = ScraperDatabase("/home/claude/quran-data/quran.db")
ck = Checkpoint("/home/claude/quran-data/dict_checkpoint_phase17.json")
targets = db.get_roots_without_forms()[:3]
print("targets:", targets)
print("stored:", scrape_dictionary(db, ck, rate_limit=1.5, roots=targets,
                                   snapshot_dir="/home/claude/quran-data/.snapshots/roots"))
for bw in targets:
    rid = db._conn.execute("select id from roots where root_buckwalter=?", (bw,)).fetchone()[0]
    print(bw, db._conn.execute("select pos_label, form_arabic, occurrence_count from root_forms where root_id=?", (rid,)).fetchall())
db.close()
PY
```
Expected: each of the three roots now has exactly one form with a plausible `pos_label` and Arabic. **If any returns zero forms, STOP** — the prose pattern has a variant Task 1 does not cover. Capture that page and extend `_SINGLE_FORM_RE` before continuing.

- [ ] **Step 7: Run the full re-scrape**

```bash
cd packages/scraper && uv run python -m scraper.cli rescrape-formless-roots \
  --db /home/claude/quran-data/quran.db \
  --checkpoint /home/claude/quran-data/dict_checkpoint_phase17.json \
  --snapshot-dir /home/claude/quran-data/.snapshots/roots \
  --rate-limit 1.5
```
Expected: `re-scraping ~709 formless roots...` then a final line reporting how many remain. Takes ≈ 18 minutes. Resumable — safe to interrupt and re-run.

- [ ] **Step 8: Commit the code (not the DB)**

```bash
git add packages/scraper/scraper/cli.py packages/scraper/tests/test_cli.py
git commit -m "feat(scraper): add rescrape-formless-roots for the single-form gap"
```

---

## Task 5: Verify the data and lock in the UI behaviour

**Files:**
- Modify: `apps/web/src/test/FormFilterChips.test.tsx`

**Interfaces:** none — `FormFilterChips` already renders a chip for any non-empty `forms`, so no component change is needed. The test exists to stop someone "optimising" a `length <= 1` guard back in.

- [ ] **Step 1: Verify the data landed**

```bash
cd /home/claude/projects/quran-corpus-pwa && python3 - <<'PY'
import sqlite3
c = sqlite3.connect("file:/home/claude/quran-data/quran.db?mode=ro", uri=True)
q = """select n, count(*) from (
  select r.id, (select count(*) from root_forms f where f.root_id=r.id) n from roots r
) group by n order by n limit 4"""
print("forms_per_root -> roots")
for n, cnt in c.execute(q):
    print(f"  {n} forms : {cnt}")
zero = c.execute("select count(*) from roots r where not exists"
                 "(select 1 from root_forms f where f.root_id=r.id)").fetchone()[0]
print("zero-form roots:", zero, "(was 712)")
for bw in ("ArD", "ywm", "nws", "lys"):
    row = c.execute("select f.pos_label, f.form_arabic, f.occurrence_count "
                    "from root_forms f join roots r on r.id=f.root_id "
                    "where r.root_buckwalter=?", (bw,)).fetchall()
    print(f"  {bw}: {row}")
PY
```
Expected: the `1 forms` bucket is now populated (~700+), `zero-form roots` near 0, and `ArD` shows `('Noun', 'أَرْض', 461)`. A small non-zero residue is acceptable **only** if each remaining root is individually checked and explained — record them in STATUS.md.

- [ ] **Step 2: Write the UI regression test**

Append inside the existing `describe('FormFilterChips', ...)` block in
`apps/web/src/test/FormFilterChips.test.tsx`. The file already imports
`RootForm` from `@quran-corpus/data` and has `vi` in scope, so type the
fixture directly rather than casting:

```tsx
  it('renders a chip for a root with only one derived form', () => {
    // 712 roots have exactly one form (Phase 17). The chip is informational --
    // it names the form even though filtering by the only option is a no-op --
    // so it must render rather than be hidden as a useless control.
    const single: RootForm[] = [
      {
        id: 1, root_id: 1, sort_order: 0, pos_label: 'Noun',
        form_arabic: 'أَرْض', form_translit: 'arḍ', gloss: null,
        occurrence_count: 461,
      },
    ];

    render(<FormFilterChips forms={single} selected={[]} onToggle={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByText('Noun')).toBeInTheDocument();
    expect(screen.getByText('أَرْض')).toBeInTheDocument();
    expect(screen.getByText('461')).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run the web suite**

```bash
cd apps/web && npx vitest run --reporter=dot && npx tsc --noEmit && npx eslint src --ext .ts,.tsx
```
Expected: 402 tests pass (401 + 1), tsc clean, eslint clean.

- [ ] **Step 4: Spot-check in the browser**

With the dev server on `0.0.0.0:3939`, open `/dictionary/ArD` (or navigate to أ ر ض). Expected: one chip reading `Noun أَرْض arḍ 461`, previously absent.

- [ ] **Step 5: Update STATUS.md**

Record: cause, 712 affected roots, the re-scrape, the snapshot directory now at `~/quran-data/.snapshots/roots`, and any residual zero-form roots with reasons.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/test/FormFilterChips.test.tsx STATUS.md
git commit -m "test(web): pin single-form roots rendering one filter chip"
```

---

## Risks & Rollback

| Risk | Likelihood | Mitigation |
|---|---|---|
| Prose has variants the regex misses (e.g. quadriliteral phrasing, "as the proper noun") | Medium | Task 4 Step 6 dry-runs 3 roots and **halts** on zero forms. Task 5 Step 1 reports the residue rather than assuming success. |
| Fallback fires on a multi-form page and overwrites real counts | Low | Structurally impossible — `_extract_forms(soup) or …` only evaluates the fallback when the list is empty. Pinned by `test_multi_form_page_ignores_the_prose_fallback`. |
| Re-scrape corrupts good data | Low | Only touches roots with **zero** forms. `upsert_root_form` conflicts on `(root_id, sort_order)`; these roots have no rows. DB backed up at Task 4 Step 5. |
| Interrupted mid-run | Medium | Separate checkpoint file `dict_checkpoint_phase17.json`; re-running resumes. The main `dict_checkpoint.json` is never reset. |
| Snapshots bloat the repo | Low | `.snapshots/` gitignored (Task 2) and written to `~/quran-data/` outside the repo in practice. ~712 × ~12 KB gzipped ≈ 9 MB. |
| corpus.quran.com rate-limits or blocks | Low | 1.5 s/request per §11; `get_with_retry` already handles transient failures. Do not lower the rate limit to speed this up. |

**Rollback:** `cp ~/quran-data/quran.db.pre-phase17-<ts> ~/quran-data/quran.db`, then `git revert` the phase commits. Snapshots can be deleted freely — they are regenerable and referenced by nothing.

---

## Acceptance Criteria

1. `parse_root_page` returns exactly one form for `ArD`, `ywm`, `nws`, `lys`, `$El`, and still 11 for `qrb`.
2. Roots with zero `root_forms` drops from 712 to 0, or every remaining root is individually explained in STATUS.md.
3. The `exactly 1 form` bucket is non-empty (was 0 roots).
4. `ArD` has `pos_label='Noun'`, `form_arabic='أَرْض'`, `occurrence_count=461`.
5. Scraper suite green; ruff clean in every file this phase touches.
6. Web: 402 tests pass, `tsc --noEmit` clean, eslint clean.
7. `/dictionary/ArD` renders one filter chip.
8. `~/quran-data/.snapshots/roots/` holds one `.html.gz` per re-scraped root, and `.snapshots/` is gitignored.
9. No new dependencies in `pyproject.toml` or `uv.lock`.

## Out of Scope

- **Gloss backfill.** Corpus states a gloss on these pages (`Noun - the Earth, land`); `root_forms.gloss` is NULL for all 3,945 rows. Free data on pages we are re-fetching, and the snapshots will preserve it — but it is a separate change with its own review.
- **The oversized filter chip.** `Form II passive participle` wrapping to two lines is a live, separate issue.
- Re-scraping roots that already have forms.
