# Phase 18 — Re-scrape the Remaining 930 Roots

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the raw-HTML snapshot archive to all 1642 roots and level `roots.root_arabic` hamza seats up to corpus spelling, by fetching the 930 roots phase 17 never touched.

**Architecture:** No new scrape command. `scrape_dictionary` gains a second skip condition — with `--snapshot-dir` set, a root is skipped only when the checkpoint says done **and** a snapshot exists. The 930 unsnapshotted roots then fall out of a plain `scrape-dictionary` run, and the archive becomes self-completing for every future run. Around that: a replay path so the next parser fix costs zero requests, a filename migration for 348 pre-encoder snapshots, and two footgun fixes.

**Tech Stack:** Python 3.11+, click, httpx, BeautifulSoup+lxml, pytest. All work in `packages/scraper`.

## Measured starting state (2026-07-28, live `~/quran-data/quran.db`)

Every number below was queried, not assumed. Re-verify before acting — the
DB is outside git and other sessions touch it.

| Fact | Value |
|---|---|
| `roots` rows | 1642 |
| roots with ≥1 form (`form_arabic IS NOT NULL`) | 1642 (0 formless) |
| `root_forms` rows | 4657, max 22 on one root, `sort_order` contiguous on every root |
| snapshots on disk `~/quran-data/.snapshots/roots/` | **712** of 1642 |
| snapshot filenames the new encoder would write differently | **348** |
| roots re-scraped in phase 17 (`dict_checkpoint_phase17.json`) | 712 |
| roots **never** re-scraped | **930** ← this phase's target |
| main checkpoint `packages/scraper/dict_checkpoint.json` | 1642 keys, all done |
| roots whose `root_arabic` ≠ naive `buckwalter_to_arabic` | 74 (64 in the 712, 10 in the 930) |
| roots in the 930 containing Buckwalter `A` | 71 |
| …of those, still bare alif (**seat unknown**) | **61** ← level-up targets |
| `roots.root_arabic` containing a space | 0 |
| `occurrence_count` vs `COUNT(word_segments.root)` mismatches | 0 / 1642 |

`A` is the only Buckwalter letter whose corpus rendering can differ (bare
alif `ا` vs a hamza seat `أ`). No root's Buckwalter contains `> < } & ' |`,
so 71 is the complete population at risk and 61 is the complete unknown set.

## Global Constraints

- **Rate limit ≥ 1.5 s/request. Non-negotiable (CLAUDE.md §11).** Already
  enforced by `rate_limit_option` (`click.FloatRange(min=1.5)`). Never widen
  it, never pass a smaller value, never add a command that bypasses it.
- Canonical DB is `~/quran-data/quran.db`. **Back it up before any live
  write** (`cp` to `~/quran-data/quran.db.bak-phase18-<date>`).
- **No live network in tests.** Every scrape test injects a fake
  `client_factory`. Zero real requests from pytest.
- `packages/data` stays free of web/Next imports; nothing in this phase
  should need to touch it.
- Conventional Commits (CLAUDE.md §9): `type(scope): subject`, scope
  `scraper` for everything here.
- Python entrypoint in `packages/scraper` is `.venv/bin/python` — plain
  `python` is not on PATH.
- Lint/type baseline to preserve: **ruff 10 pre-existing errors**
  (`--config pyproject.toml` — ruff resolves config relative to the linted
  file, so an unpinned run silently reports different numbers), **mypy 1
  pre-existing error** (`scraper/mt.py:37`). Zero new of either.
- Test baseline: **223 passing** in `packages/scraper`.
- `roots.root_arabic` carries **no inter-letter spaces** — user ruling.
  `parse_root_page` already strips them; do not reintroduce.
- Hamza seats **level UP** to corpus spelling. Never fold a seat down to
  bare alif. User ruling 2026-07-28.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `scraper/snapshots.py` | encode/write snapshots | add `iter_snapshots`, `legacy_name_for` |
| `scraper/sources/dictionary_scrape.py` | scrape loop | snapshot-aware skip; replace-forms-on-rescrape |
| `scraper/replay.py` | **new** — re-parse the archive into the DB, no network | create |
| `scraper/sources/lane.py` | Lane definitions import | stop clobbering `root_arabic`/`occurrence_count` |
| `scraper/db.py` | data access | `get_or_create_root`, `delete_root_forms` |
| `scraper/cli.py` | commands | `reparse-snapshots`, `migrate-snapshot-names`; fix `rescrape-formless-roots --checkpoint` default |

Tests mirror one-to-one: `tests/test_snapshots.py`, `tests/test_dictionary_scrape.py`, `tests/test_replay.py` (new), `tests/test_lane.py`, `tests/test_db.py`, `tests/test_cli.py`.

## Risks

| Risk | Mitigation |
|---|---|
| 930 live requests × 1.5 s ≈ **24 min**; process dies mid-run | checkpoint + snapshot-presence make resume exact and idempotent — just re-run |
| Re-scrape overwrites `root_forms` via `ON CONFLICT(root_id, sort_order)`; a root that now yields **fewer** forms keeps stale tail rows | Task 3 deletes a root's forms before inserting the fresh set |
| Re-scrape overwrites `occurrence_count` with corpus's total, undoing `fix-root-data` | currently 0/1642 mismatch, so corpus agrees with `word_segments`; Task 6 re-measures after the run and runs `fix-root-data` if any appear |
| Corpus changed a page since the original scrape → silent data drift on the 930 | Task 6 diffs before/after `root_arabic` + form counts and reports every change for eyeball |
| 348 legacy filenames become duplicate stale entries once new-encoder names land | Task 1 migrates them **before** anything else runs |
| A subagent's `run_in_background` shell is killed at its turn boundary | the live run is foreground `timeout 540` chunks; it resumes from checkpoint+snapshots |
| corpus.quran.com rejects or rate-limits a long run | `get_with_retry` already backs off on 429/5xx; if it still fails, stop and report — do not lower the rate limit |

## Rollback

- Code: every task is one commit on a feature branch; `git revert` or drop the branch.
- Data: restore `~/quran-data/quran.db.bak-phase18-<date>`.
- Snapshots: Task 1's migration is a pure rename and is reversible by
  re-running with the inverse map; the archive is regenerable regardless
  (it is gitignored, referenced by nothing).

---

### Task 1: Migrate legacy snapshot filenames

348 of the 712 snapshots on disk were written before `bdd7e7b` changed the
encoder. Their keys contain an uppercase letter, which the old encoder left
literal (`root_lHn.html.gz`) and the new one percent-encodes
(`root_l%48n.html.gz`). Left alone, the next write for such a key creates a
second file for the same root and the replay path in Task 2 counts it twice.

**Files:**
- Modify: `packages/scraper/scraper/snapshots.py`
- Modify: `packages/scraper/scraper/cli.py`
- Test: `packages/scraper/tests/test_snapshots.py`, `packages/scraper/tests/test_cli.py`

**Interfaces:**
- Consumes: `_encode_key(key: str) -> str` (existing, private).
- Produces:
  - `migrate_legacy_names(root_dir: str | Path) -> list[tuple[str, str]]` —
    renames every file whose name is not `_encode_key(decoded_key)`, returns
    `[(old_name, new_name), ...]`. Idempotent: a second call returns `[]`.
  - CLI `migrate-snapshot-names --snapshot-dir PATH [--dry-run]`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/scraper/tests/test_snapshots.py`:

```python
def test_migrate_renames_only_legacy_names(tmp_path):
    # Old encoder left uppercase literal; new one percent-encodes it.
    (tmp_path / "root_lHn.html.gz").write_bytes(b"legacy")
    already = save_snapshot(tmp_path, "root_qwl", "<html>ok</html>")

    moved = migrate_legacy_names(tmp_path)

    assert moved == [("root_lHn.html.gz", "root_l%48n.html.gz")]
    assert (tmp_path / "root_l%48n.html.gz").read_bytes() == b"legacy"
    assert not (tmp_path / "root_lHn.html.gz").exists()
    # A correctly-named file is left untouched, not rewritten.
    assert already.exists()


def test_migrate_is_idempotent(tmp_path):
    (tmp_path / "root_lHn.html.gz").write_bytes(b"legacy")
    assert len(migrate_legacy_names(tmp_path)) == 1
    # Second run has nothing to do -- the command is safe to re-run after a
    # partial failure, which is the only way it gets used.
    assert migrate_legacy_names(tmp_path) == []


def test_migrate_key_survives_the_rename(tmp_path):
    # The whole point: the decoded key must be identical before and after.
    (tmp_path / "root_%24TT.html.gz").write_bytes(b"legacy")
    migrate_legacy_names(tmp_path)
    names = [p.name for p in tmp_path.glob("*.html.gz")]
    assert [unquote(n.removesuffix(".html.gz")) for n in names] == ["root_$TT"]


def test_migrate_refuses_to_clobber(tmp_path):
    # Both names for one key already exist (a scrape ran after the encoder
    # change but before this migration). Overwriting would destroy whichever
    # is newer, so leave both and report nothing moved.
    (tmp_path / "root_lHn.html.gz").write_bytes(b"legacy")
    (tmp_path / "root_l%48n.html.gz").write_bytes(b"current")

    assert migrate_legacy_names(tmp_path) == []
    assert (tmp_path / "root_lHn.html.gz").read_bytes() == b"legacy"
    assert (tmp_path / "root_l%48n.html.gz").read_bytes() == b"current"
```

Add to that file's imports (it already has `from urllib.parse import unquote`):

```python
from scraper.snapshots import migrate_legacy_names, save_snapshot
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/claude/projects/quran-corpus-pwa/packages/scraper
.venv/bin/python -m pytest tests/test_snapshots.py -v
```

Expected: FAIL, `ImportError: cannot import name 'migrate_legacy_names'`.

- [ ] **Step 3: Implement**

Append to `packages/scraper/scraper/snapshots.py`. Two functions: the scan is
split out because Step 5's `--dry-run` needs the plan without the side effect.

```python
def legacy_names_to_migrate(root_dir: str | Path) -> list[tuple[str, str]]:
    """Renames ``migrate_legacy_names`` would perform. Pure; no side effects.

    A name needs migrating when it is not what ``_encode_key`` would produce
    for its own decoded key -- i.e. it was written by the pre-``bdd7e7b``
    encoder that left uppercase literal.
    """
    d = Path(root_dir)
    pending: list[tuple[str, str]] = []
    for path in sorted(d.glob("*.html.gz")):
        key = unquote(path.name.removesuffix(".html.gz"))
        target = d / f"{_encode_key(key)}.html.gz"
        # target.exists() means both names are present: one is fresher and the
        # filename cannot say which, so leave both rather than destroy one.
        if target == path or target.exists():
            continue
        pending.append((path.name, target.name))
    return pending


def migrate_legacy_names(root_dir: str | Path) -> list[tuple[str, str]]:
    """Rename snapshots written before the encoder gained uppercase escaping.

    The old encoder left uppercase literal, the current one percent-encodes
    it, so one root can end up with two files. Idempotent.
    """
    d = Path(root_dir)
    moved = legacy_names_to_migrate(d)
    for old, new in moved:
        (d / old).rename(d / new)
    return moved
```

Add to that file's imports:

```python
from urllib.parse import unquote
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
.venv/bin/python -m pytest tests/test_snapshots.py -v
```

Expected: PASS, all tests in the file.

- [ ] **Step 5: Add the CLI command**

Insert into `packages/scraper/scraper/cli.py`, immediately after
`rescrape_formless_roots_cmd`:

```python
@main.command("migrate-snapshot-names")
@click.option(
    "--snapshot-dir", default=".snapshots/roots", show_default=True,
    help="Snapshot archive to rename in place",
)
@click.option("--dry-run", is_flag=True, help="List renames without doing them")
def migrate_snapshot_names_cmd(snapshot_dir: str, dry_run: bool) -> None:
    """Rename snapshots written before the filename encoder changed.

    Idempotent. Run once against an archive predating the uppercase-escaping
    encoder, or a re-scrape leaves a second file per affected root.
    """
    from .snapshots import legacy_names_to_migrate, migrate_legacy_names

    if dry_run:
        pending = legacy_names_to_migrate(snapshot_dir)
        for old, new in pending:
            click.echo(f"{old} -> {new}")
        click.echo(f"migrate-snapshot-names: {len(pending)} would be renamed.")
        return
    moved = migrate_legacy_names(snapshot_dir)
    click.echo(f"migrate-snapshot-names: {len(moved)} renamed.")
```

- [ ] **Step 6: Test the CLI command**

Append to `packages/scraper/tests/test_cli.py`:

```python
def test_migrate_snapshot_names_dry_run_changes_nothing(runner, tmp_path):
    (tmp_path / "root_lHn.html.gz").write_bytes(b"legacy")
    result = runner.invoke(
        main, ["migrate-snapshot-names", "--snapshot-dir", str(tmp_path), "--dry-run"]
    )
    assert result.exit_code == 0
    assert "1 would be renamed" in result.output
    # The point of --dry-run: the file is still there under its old name.
    assert (tmp_path / "root_lHn.html.gz").exists()


def test_migrate_snapshot_names_renames(runner, tmp_path):
    (tmp_path / "root_lHn.html.gz").write_bytes(b"legacy")
    result = runner.invoke(
        main, ["migrate-snapshot-names", "--snapshot-dir", str(tmp_path)]
    )
    assert result.exit_code == 0
    assert "1 renamed" in result.output
    assert (tmp_path / "root_l%48n.html.gz").read_bytes() == b"legacy"
```

- [ ] **Step 7: Run the whole suite + lint + types**

```bash
.venv/bin/python -m pytest -q
.venv/bin/python -m ruff check --config pyproject.toml scraper tests
.venv/bin/python -m mypy scraper
```

Expected: 223 + 6 = **229 passed**; ruff **10 errors** (unchanged); mypy
**1 error** in `scraper/mt.py:37` (unchanged).

- [ ] **Step 8: Prove the tests are not vacuous**

A test that passes against both old and new code proves nothing. Break the
implementation and confirm the tests notice:

```bash
cd /home/claude/projects/quran-corpus-pwa/packages/scraper
cp scraper/snapshots.py /tmp/snap.bak
# make the clobber guard a no-op
sed -i 's|if target == path or target.exists():|if target == path:|' scraper/snapshots.py
.venv/bin/python -m pytest tests/test_snapshots.py -q   # expect: test_migrate_refuses_to_clobber FAILS
cp /tmp/snap.bak scraper/snapshots.py && diff -q /tmp/snap.bak scraper/snapshots.py && rm /tmp/snap.bak
.venv/bin/python -m pytest tests/test_snapshots.py -q   # expect: green again
```

- [ ] **Step 9: Commit**

```bash
cd /home/claude/projects/quran-corpus-pwa
git add packages/scraper/scraper/snapshots.py packages/scraper/scraper/cli.py \
        packages/scraper/tests/test_snapshots.py packages/scraper/tests/test_cli.py
git commit -m "feat(scraper): migrate snapshot filenames to the current encoder"
```

---

### Task 2: Replay the snapshot archive without the network

CLAUDE.md §11 asks that re-parsing never require re-scraping. Only the write
half exists — snapshots are saved and nothing reads them, so the next parser
fix costs another live crawl, which is exactly the bill phase 17 paid. This
is deferred `/code-review` finding 5.

**Files:**
- Create: `packages/scraper/scraper/replay.py`
- Modify: `packages/scraper/scraper/snapshots.py`
- Modify: `packages/scraper/scraper/db.py`
- Modify: `packages/scraper/scraper/cli.py`
- Test: `packages/scraper/tests/test_replay.py` (create), `packages/scraper/tests/test_db.py`, `packages/scraper/tests/test_cli.py`

**Interfaces:**
- Consumes:
  - `parse_root_page(html: str) -> ParsedRoot | None` from `scraper.sources.corpus_dictionary`
  - `ScraperDatabase.upsert_root(RootModel) -> int`, `.upsert_root_form(RootFormModel) -> None`
  - `_encode_key` / `unquote` filename convention from Task 1
- Produces:
  - `iter_snapshots(root_dir) -> Iterator[tuple[str, str]]` in `snapshots.py`,
    yielding `(key, html)` sorted by key, key decoded from the filename
  - `replay_root_snapshots(root_dir, db) -> tuple[int, int]` in `replay.py`,
    returning `(roots_updated, snapshots_unparseable)`
  - `ScraperDatabase.delete_root_forms(root_id: int) -> int` — deletes that
    root's `root_forms` rows, returns the count deleted (Task 3 reuses it)
  - CLI `reparse-snapshots --db PATH --snapshot-dir PATH`

- [ ] **Step 1: Write the failing tests**

Create `packages/scraper/tests/test_replay.py`:

```python
from __future__ import annotations

import sqlite3

from scraper.db import ScraperDatabase
from scraper.replay import replay_root_snapshots
from scraper.snapshots import save_snapshot

_ONE_FORM_HTML = (
    '<html><body>The triliteral root hamza rā ḍād '
    '(<span class="at">أ ر ض</span>) occurs 461 times in the Quran as the '
    'noun <i class="ab">arḍ</i> (<span class="at">أَرْض</span>).</body></html>'
)


def test_replay_writes_roots_and_forms(tmp_path):
    save_snapshot(tmp_path / "snaps", "root_ArD", _ONE_FORM_HTML)
    db = ScraperDatabase(str(tmp_path / "t.db"))

    updated, bad = replay_root_snapshots(tmp_path / "snaps", db)

    assert (updated, bad) == (1, 0)
    row = db._conn.execute(
        "SELECT root_arabic, occurrence_count FROM roots"
        " WHERE root_buckwalter='ArD'"
    ).fetchone()
    assert (row[0], row[1]) == ("أرض", 461)
    form = db._conn.execute(
        "SELECT pos_label, form_arabic, occurrence_count FROM root_forms"
    ).fetchone()
    assert tuple(form) == ("Noun", "أَرْض", 461)
    db.close()


def test_replay_makes_no_network_calls(tmp_path, monkeypatch):
    # The entire value of this path is that it costs zero requests. Poison
    # httpx so any accidental fetch is a hard failure, not a slow test.
    import httpx

    def boom(*a, **k):
        raise AssertionError("replay must never hit the network")

    monkeypatch.setattr(httpx, "Client", boom)
    save_snapshot(tmp_path / "snaps", "root_ArD", _ONE_FORM_HTML)
    db = ScraperDatabase(str(tmp_path / "t.db"))
    assert replay_root_snapshots(tmp_path / "snaps", db)[0] == 1
    db.close()


def test_replay_counts_unparseable_without_touching_the_db(tmp_path):
    # A 404 or a redesigned page parses to None. It must be reported, not
    # written as an empty root -- a silent empty row is the phase-17 bug class.
    save_snapshot(tmp_path / "snaps", "root_zzz", "<html><body>404</body></html>")
    db = ScraperDatabase(str(tmp_path / "t.db"))

    assert replay_root_snapshots(tmp_path / "snaps", db) == (0, 1)

    assert db._conn.execute("SELECT COUNT(*) FROM roots").fetchone()[0] == 0
    db.close()


def test_replay_is_idempotent(tmp_path):
    save_snapshot(tmp_path / "snaps", "root_ArD", _ONE_FORM_HTML)
    db = ScraperDatabase(str(tmp_path / "t.db"))
    replay_root_snapshots(tmp_path / "snaps", db)
    replay_root_snapshots(tmp_path / "snaps", db)
    # Second pass must update in place, not duplicate.
    assert db._conn.execute("SELECT COUNT(*) FROM roots").fetchone()[0] == 1
    assert db._conn.execute("SELECT COUNT(*) FROM root_forms").fetchone()[0] == 1
    db.close()


def test_replay_recovers_the_key_through_percent_encoding(tmp_path):
    # Buckwalter roots use $ ' > < & } * -- the round-trip through the
    # filename is what makes replay possible at all.
    save_snapshot(tmp_path / "snaps", "root_$El", _ONE_FORM_HTML)
    db = ScraperDatabase(str(tmp_path / "t.db"))
    replay_root_snapshots(tmp_path / "snaps", db)
    assert db._conn.execute(
        "SELECT root_buckwalter FROM roots"
    ).fetchone()[0] == "$El"
    db.close()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/python -m pytest tests/test_replay.py -v
```

Expected: FAIL, `ModuleNotFoundError: No module named 'scraper.replay'`.

- [ ] **Step 3: Add `iter_snapshots` to `snapshots.py`**

```python
def iter_snapshots(root_dir: str | Path) -> Iterator[tuple[str, str]]:
    """Yield ``(key, html)`` for every snapshot, sorted by filename.

    The key is decoded straight back out of the filename, which is why
    ``_encode_key`` must stay reversible -- this is the read half of the
    §11 promise that re-parsing never needs a re-fetch.
    """
    for path in sorted(Path(root_dir).glob("*.html.gz")):
        key = unquote(path.name.removesuffix(".html.gz"))
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            yield key, fh.read()
```

Add to that file's imports:

```python
from collections.abc import Iterator
```

- [ ] **Step 4: Create `packages/scraper/scraper/replay.py`**

```python
"""Re-parse the saved snapshot archive into the DB. No network.

CLAUDE.md §11 wants re-parsing to never require re-scraping. Snapshots were
already being written; this is the read half. A parser fix now costs a
minute of local CPU instead of an hour of rate-limited crawling.
"""

from __future__ import annotations

from pathlib import Path

from .db import ScraperDatabase
from .models import RootFormModel, RootModel
from .snapshots import iter_snapshots
from .sources.corpus_dictionary import parse_root_page

_PREFIX = "root_"


def replay_root_snapshots(
    root_dir: str | Path, db: ScraperDatabase
) -> tuple[int, int]:
    """Re-parse every root snapshot. Returns (roots updated, unparseable).

    Unparseable snapshots (404 bodies, a redesigned page) are counted and
    skipped, never written as an empty root -- a silently empty root is the
    exact failure phase 17 existed to fix.
    """
    updated = 0
    unparseable = 0
    for key, html in iter_snapshots(root_dir):
        if not key.startswith(_PREFIX):
            continue
        bw = key[len(_PREFIX):]
        parsed = parse_root_page(html)
        if parsed is None:
            unparseable += 1
            continue
        rid = db.upsert_root(
            RootModel(
                root_buckwalter=bw,
                root_arabic=parsed.root_arabic or bw,
                occurrence_count=parsed.occurrence_count,
            )
        )
        db.delete_root_forms(rid)
        for form in parsed.forms:
            db.upsert_root_form(
                RootFormModel(
                    root_id=rid,
                    sort_order=form.sort_order,
                    pos_label=form.pos_label,
                    form_arabic=form.form_arabic,
                    form_translit=form.form_translit,
                    gloss=form.gloss,
                    occurrence_count=form.occurrence_count,
                )
            )
        updated += 1
    return updated, unparseable
```

- [ ] **Step 5: Add `delete_root_forms` to `packages/scraper/scraper/db.py`**

`replay_root_snapshots` calls it, and Task 3 reuses it for the same reason.
Insert immediately after `upsert_root_form`:

```python
    def delete_root_forms(self, root_id: int) -> int:
        """Drop every root_forms row for ``root_id``. Returns rows deleted.

        A re-parse or re-scrape replaces a root's form list wholesale.
        Merging on ON CONFLICT(root_id, sort_order) alone would leave stale
        tail rows whenever the page now yields fewer forms than are stored.
        """
        cur = self._conn.execute(
            "DELETE FROM root_forms WHERE root_id = ?", (root_id,)
        )
        self._conn.commit()
        return int(cur.rowcount)
```

Append to `packages/scraper/tests/test_db.py`:

```python
def test_delete_root_forms_removes_only_that_root(tmp_path):
    from scraper.models import RootFormModel, RootModel

    db = ScraperDatabase(str(tmp_path / "d.db"))
    keep = db.upsert_root(
        RootModel(root_buckwalter="ktb", root_arabic="كتب", occurrence_count=319)
    )
    drop = db.upsert_root(
        RootModel(root_buckwalter="ArD", root_arabic="أرض", occurrence_count=461)
    )
    for rid in (keep, drop):
        db.upsert_root_form(
            RootFormModel(
                root_id=rid, sort_order=0, pos_label="Noun",
                form_arabic="ك", occurrence_count=1,
            )
        )

    assert db.delete_root_forms(drop) == 1

    remaining = db._conn.execute("SELECT root_id FROM root_forms").fetchall()
    assert [r[0] for r in remaining] == [keep]
    db.close()
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
.venv/bin/python -m pytest tests/test_replay.py -v
```

Expected: PASS, 5 tests.

- [ ] **Step 7: Add the CLI command**

Insert into `packages/scraper/scraper/cli.py` after `migrate_snapshot_names_cmd`:

```python
@main.command("reparse-snapshots")
@click.option("--db", default="quran.db", show_default=True, help="SQLite output path")
@click.option(
    "--snapshot-dir", default=".snapshots/roots", show_default=True,
    help="Archive to re-parse (written by scrape-dictionary --snapshot-dir)",
)
def reparse_snapshots_cmd(db: str, snapshot_dir: str) -> None:
    """Re-parse saved root HTML into the DB. No network, idempotent.

    Use after any change to parse_root_page instead of re-crawling.
    """
    from .replay import replay_root_snapshots

    database = ScraperDatabase(db)
    try:
        updated, bad = replay_root_snapshots(snapshot_dir, database)
    finally:
        database.close()
    click.echo(f"reparse-snapshots: {updated} roots updated, {bad} unparseable.")
```

Append to `packages/scraper/tests/test_cli.py`:

```python
def test_reparse_snapshots_reads_the_archive(runner, tmp_path):
    from scraper.snapshots import save_snapshot

    html = (
        '<html><body>The triliteral root hamza rā ḍād '
        '(<span class="at">أ ر ض</span>) occurs 461 times in the Quran as the '
        'noun <i class="ab">arḍ</i> (<span class="at">أَرْض</span>).</body></html>'
    )
    snaps = tmp_path / "snaps"
    save_snapshot(snaps, "root_ArD", html)
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])

    result = runner.invoke(
        main, ["reparse-snapshots", "--db", db, "--snapshot-dir", str(snaps)]
    )

    assert result.exit_code == 0
    assert "1 roots updated, 0 unparseable" in result.output
    conn = sqlite3.connect(db)
    assert conn.execute(
        "SELECT root_arabic FROM roots WHERE root_buckwalter='ArD'"
    ).fetchone()[0] == "أرض"
    conn.close()
```

- [ ] **Step 8: Run the whole suite + lint + types**

```bash
.venv/bin/python -m pytest -q
.venv/bin/python -m ruff check --config pyproject.toml scraper tests
.venv/bin/python -m mypy scraper
```

Expected: **236 passed** (229 + 5 replay + 1 db + 1 cli); ruff 10; mypy 1 (`mt.py:37`).

- [ ] **Step 9: Prove the tests are not vacuous**

Two mutations, one per load-bearing behaviour.

```bash
cd /home/claude/projects/quran-corpus-pwa/packages/scraper
cp scraper/replay.py /tmp/replay.bak

# MUTATION A: stop skipping unparseable pages -- they become empty roots
.venv/bin/python - <<'MUT'
import pathlib
p = pathlib.Path("scraper/replay.py")
p.write_text(p.read_text().replace(
    "        if parsed is None:\n            unparseable += 1\n            continue\n",
    "        if parsed is None:\n            parsed = ParsedRoot('', 0, [], None)\n",
).replace(
    "from .sources.corpus_dictionary import parse_root_page",
    "from .sources.corpus_dictionary import ParsedRoot, parse_root_page",
))
MUT
.venv/bin/python -m pytest tests/test_replay.py -q
# expect: test_replay_counts_unparseable_without_touching_the_db FAILS
cp /tmp/replay.bak scraper/replay.py

# MUTATION B: drop the wholesale form replacement
.venv/bin/python - <<'MUT'
import pathlib
p = pathlib.Path("scraper/replay.py")
p.write_text(p.read_text().replace("        db.delete_root_forms(rid)\n", ""))
MUT
.venv/bin/python -m pytest tests/test_replay.py -q
# expect: PASS. Each root here has one form, so ON CONFLICT already updates
# in place -- this behaviour is pinned by Task 3's
# test_rescrape_replaces_stale_forms, not here. Record that in the ledger and
# do NOT add a redundant test.

cp /tmp/replay.bak scraper/replay.py && diff -q /tmp/replay.bak scraper/replay.py && rm /tmp/replay.bak
.venv/bin/python -m pytest tests/test_replay.py -q   # expect: green again
```

- [ ] **Step 10: Commit**

```bash
cd /home/claude/projects/quran-corpus-pwa
git add packages/scraper/scraper/replay.py packages/scraper/scraper/snapshots.py \
        packages/scraper/scraper/db.py packages/scraper/scraper/cli.py \
        packages/scraper/tests/test_replay.py packages/scraper/tests/test_db.py \
        packages/scraper/tests/test_cli.py
git commit -m "feat(scraper): re-parse saved snapshots without re-fetching"
```

---

### Task 3: Snapshot-aware skip + replace-forms-on-rescrape

Two defects in the same loop:

1. `scrape_dictionary` skips a root whose checkpoint key is done **before**
   the snapshot write. Turning `--snapshot-dir` on mid-project therefore
   yields a partial archive with no signal it is incomplete — which is
   precisely why 712 of 1642 are on disk today. Making the skip require a
   snapshot too turns the archive self-completing, and makes the 930-root
   run in Task 6 a plain `scrape-dictionary` invocation with no key clearing.
2. `upsert_root_form` merges on `ON CONFLICT(root_id, sort_order)`. If a
   re-scraped root now yields **fewer** forms than are stored, the stale tail
   rows survive. Currently 0 roots are non-contiguous, so this is prevention,
   not repair — but the run in Task 6 touches 930 roots holding up to 22
   forms each, which is where it would first bite.

Also fixes `rescrape-formless-roots --checkpoint` defaulting to the main
`dict_checkpoint.json` — running it with the default silently marks roots
done in the checkpoint the full scrape depends on.

**Files:**
- Modify: `packages/scraper/scraper/sources/dictionary_scrape.py`
- Modify: `packages/scraper/scraper/snapshots.py`
- Modify: `packages/scraper/scraper/cli.py:95` (the `--checkpoint` default)
- Test: `packages/scraper/tests/test_dictionary_scrape.py`, `packages/scraper/tests/test_cli.py`

**Interfaces:**
- Consumes: `save_snapshot`, `_encode_key` from `scraper.snapshots`.
- Consumes: `ScraperDatabase.delete_root_forms(root_id: int) -> int` from
  Task 2 Step 5.
- Produces:
  - `snapshots.has_snapshot(root_dir: str | Path, key: str) -> bool`
  - `scrape_dictionary` unchanged in signature; changed in skip semantics

- [ ] **Step 1: Write the failing tests**

Append to `packages/scraper/tests/test_dictionary_scrape.py`:

```python
def test_done_root_is_refetched_when_its_snapshot_is_missing(tmp_path):
    # The archive is a second completeness condition. Without this, enabling
    # --snapshot-dir on an already-scraped corpus archives nothing and says
    # nothing -- how 712 of 1642 ended up on disk.
    db = ScraperDatabase(str(tmp_path / "t.db"))
    ckpt = Checkpoint(str(tmp_path / "c.json"))
    ckpt.mark_done("root_ArD")
    calls: list[str] = []

    def factory():
        return _FakeClient(_ONE_FORM_HTML, calls)

    scrape_dictionary(
        db, ckpt, client_factory=factory, rate_limit=0,
        roots=["ArD"], snapshot_dir=str(tmp_path / "snaps"),
    )

    assert len(calls) == 1
    assert (tmp_path / "snaps" / "root_%41rD.html.gz").exists()
    db.close()


def test_done_root_is_skipped_when_its_snapshot_exists(tmp_path):
    db = ScraperDatabase(str(tmp_path / "t.db"))
    ckpt = Checkpoint(str(tmp_path / "c.json"))
    ckpt.mark_done("root_ArD")
    save_snapshot(tmp_path / "snaps", "root_ArD", _ONE_FORM_HTML)
    calls: list[str] = []

    scrape_dictionary(
        db, ckpt, client_factory=lambda: _FakeClient(_ONE_FORM_HTML, calls),
        rate_limit=0, roots=["ArD"], snapshot_dir=str(tmp_path / "snaps"),
    )

    # Already archived -- re-fetching would be a pointless request against a
    # rate-limited third-party site.
    assert calls == []
    db.close()


def test_done_root_is_skipped_when_snapshots_are_off(tmp_path):
    # No --snapshot-dir means no archive condition; the checkpoint alone
    # governs, exactly as before.
    db = ScraperDatabase(str(tmp_path / "t.db"))
    ckpt = Checkpoint(str(tmp_path / "c.json"))
    ckpt.mark_done("root_ArD")
    calls: list[str] = []

    scrape_dictionary(
        db, ckpt, client_factory=lambda: _FakeClient(_ONE_FORM_HTML, calls),
        rate_limit=0, roots=["ArD"], snapshot_dir=None,
    )

    assert calls == []
    db.close()


def test_rescrape_replaces_stale_forms(tmp_path):
    # A root that used to yield 3 forms and now yields 1 must end with 1.
    # ON CONFLICT(root_id, sort_order) alone leaves sort_order 1 and 2 behind.
    db = ScraperDatabase(str(tmp_path / "t.db"))
    rid = db.upsert_root(
        RootModel(root_buckwalter="ArD", root_arabic="أرض", occurrence_count=461)
    )
    for i in range(3):
        db.upsert_root_form(
            RootFormModel(
                root_id=rid, sort_order=i, pos_label="Stale",
                form_arabic="ستالة", occurrence_count=1,
            )
        )
    ckpt = Checkpoint(str(tmp_path / "c.json"))

    scrape_dictionary(
        db, ckpt, client_factory=lambda: _FakeClient(_ONE_FORM_HTML, []),
        rate_limit=0, roots=["ArD"],
    )

    rows = db._conn.execute(
        "SELECT sort_order, pos_label FROM root_forms ORDER BY sort_order"
    ).fetchall()
    assert [tuple(r) for r in rows] == [(0, "Noun")]
    db.close()
```

Check the existing top of `tests/test_dictionary_scrape.py` for the fake
client and HTML constant already in use, and reuse them rather than adding a
second copy. If the fixtures there are named differently, rename the
references above to match — do not introduce a parallel fake.

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/python -m pytest tests/test_dictionary_scrape.py -v
```

Expected: FAIL — `test_done_root_is_refetched_when_its_snapshot_is_missing`
asserting `len(calls) == 1` and getting `0`, because the done root is still
skipped on the checkpoint alone; and `test_rescrape_replaces_stale_forms`
finding 3 form rows where 1 is expected.

`delete_root_forms` already exists — Task 2 Step 5 added it, and this task
is its second caller.

- [ ] **Step 3: Add `has_snapshot` to `packages/scraper/scraper/snapshots.py`**

```python
def has_snapshot(root_dir: str | Path, key: str) -> bool:
    """True when ``key`` is already archived under the current encoding."""
    return (Path(root_dir) / f"{_encode_key(key)}.html.gz").exists()
```

- [ ] **Step 4: Change the skip and add the form replacement**

In `packages/scraper/scraper/sources/dictionary_scrape.py`, change the import
line `from ..snapshots import save_snapshot` to:

```python
from ..snapshots import has_snapshot, save_snapshot
```

Replace the skip:

```python
            key = f"root_{bw}"
            if checkpoint.is_done(key):
                continue
```

with:

```python
            key = f"root_{bw}"
            # Two completeness conditions, not one. The checkpoint says the DB
            # row is written; the archive says the raw HTML is kept (§11).
            # Requiring both lets --snapshot-dir back-fill an already-scraped
            # corpus, instead of silently archiving nothing -- which is how
            # 712 of 1642 roots ended up on disk.
            if checkpoint.is_done(key) and (
                snapshot_dir is None or has_snapshot(snapshot_dir, key)
            ):
                continue
```

Add the form replacement — after `rid = db.upsert_root(...)` and before the
`for form in parsed.forms:` loop:

```python
                # The page is authoritative for the whole form list. Merging
                # per sort_order would keep stale tail rows when a root now
                # yields fewer forms than are stored.
                db.delete_root_forms(rid)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
.venv/bin/python -m pytest tests/test_dictionary_scrape.py -v
```

Expected: PASS.

- [ ] **Step 6: Fix the `rescrape-formless-roots` checkpoint default**

In `packages/scraper/scraper/cli.py`, on `rescrape_formless_roots_cmd`,
change:

```python
@click.option("--checkpoint", default="dict_checkpoint.json", show_default=True)
```

to:

```python
@click.option(
    "--checkpoint",
    required=True,
    help="Checkpoint file. Required: defaulting to the main dict_checkpoint"
         " would mark roots done in the checkpoint the full scrape depends on.",
)
```

Append to `packages/scraper/tests/test_cli.py`:

```python
def test_rescrape_formless_roots_requires_an_explicit_checkpoint(runner, tmp_path):
    # Sharing the main dict_checkpoint.json silently rewrites the state the
    # full scrape resumes from. Make the operator name the file.
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])
    result = runner.invoke(main, ["rescrape-formless-roots", "--db", db])
    assert result.exit_code != 0
    assert "checkpoint" in result.output.lower()
```

Update the two existing `rescrape-formless-roots` tests if either omitted
`--checkpoint` — both currently pass it, so no change is expected; re-run
them to confirm.

- [ ] **Step 7: Run the whole suite + lint + types**

```bash
.venv/bin/python -m pytest -q
.venv/bin/python -m ruff check --config pyproject.toml scraper tests
.venv/bin/python -m mypy scraper
```

Expected: **241 passed** (236 + 4 scrape + 1 cli); ruff 10; mypy 1 (`mt.py:37`).

- [ ] **Step 8: Prove the tests are not vacuous**

```bash
cp scraper/sources/dictionary_scrape.py /tmp/ds.bak
# revert the skip to checkpoint-only
.venv/bin/python - <<'PY'
import pathlib
p = pathlib.Path("scraper/sources/dictionary_scrape.py")
t = p.read_text()
t = t.replace(
    "            if checkpoint.is_done(key) and (\n"
    "                snapshot_dir is None or has_snapshot(snapshot_dir, key)\n"
    "            ):",
    "            if checkpoint.is_done(key):")
p.write_text(t)
PY
.venv/bin/python -m pytest tests/test_dictionary_scrape.py -q
# expect: test_done_root_is_refetched_when_its_snapshot_is_missing FAILS
cp /tmp/ds.bak scraper/sources/dictionary_scrape.py
diff -q /tmp/ds.bak scraper/sources/dictionary_scrape.py && rm /tmp/ds.bak
.venv/bin/python -m pytest tests/test_dictionary_scrape.py -q   # expect: green
```

- [ ] **Step 9: Commit**

```bash
cd /home/claude/projects/quran-corpus-pwa
git add packages/scraper/scraper/sources/dictionary_scrape.py \
        packages/scraper/scraper/snapshots.py packages/scraper/scraper/cli.py \
        packages/scraper/tests/test_dictionary_scrape.py \
        packages/scraper/tests/test_cli.py
git commit -m "fix(scraper): treat the snapshot archive as a resume condition"
```

---

### Task 4: Stop `import-lane` from clobbering scraped root data

`import_lane_definitions` calls `db.upsert_root(RootModel(root_buckwalter=bw,
root_arabic=buckwalter_to_arabic(bw) or bw))` — a naive bare-alif spelling
and the model's `occurrence_count: int = 0` default. `upsert_root`'s
`ON CONFLICT ... DO UPDATE SET root_arabic = excluded.root_arabic,
occurrence_count = excluded.occurrence_count` then overwrites both. One
`import-lane` re-run therefore folds all **74** seated hamzas back to bare
alif and zeroes **1642** occurrence counts.

The dictionary scrape *must* keep overwriting (it is the authority), so the
fix is a separate creation-only path, not a change to `upsert_root`.

**Files:**
- Modify: `packages/scraper/scraper/db.py`
- Modify: `packages/scraper/scraper/sources/lane.py:44-47`
- Test: `packages/scraper/tests/test_db.py`, `packages/scraper/tests/test_lane.py`

**Interfaces:**
- Produces: `ScraperDatabase.get_or_create_root(root_buckwalter: str,
  root_arabic: str) -> int` — returns the existing root's id untouched, or
  inserts with `occurrence_count = 0` and returns the new id.

- [ ] **Step 1: Write the failing tests**

Append to `packages/scraper/tests/test_db.py`:

```python
def test_get_or_create_root_preserves_an_existing_row(tmp_path):
    from scraper.models import RootModel

    db = ScraperDatabase(str(tmp_path / "d.db"))
    rid = db.upsert_root(
        RootModel(root_buckwalter="ArD", root_arabic="أرض", occurrence_count=461)
    )

    # Naive Buckwalter renders bare alif; the scraped seat must win.
    again = db.get_or_create_root("ArD", "ارض")

    assert again == rid
    row = db._conn.execute(
        "SELECT root_arabic, occurrence_count FROM roots WHERE id=?", (rid,)
    ).fetchone()
    assert (row[0], row[1]) == ("أرض", 461)
    db.close()


def test_get_or_create_root_inserts_when_absent(tmp_path):
    db = ScraperDatabase(str(tmp_path / "d.db"))
    rid = db.get_or_create_root("ktb", "كتب")
    row = db._conn.execute(
        "SELECT root_buckwalter, root_arabic, occurrence_count FROM roots"
        " WHERE id=?", (rid,)
    ).fetchone()
    assert tuple(row) == ("ktb", "كتب", 0)
    db.close()
```

Append to `packages/scraper/tests/test_lane.py`:

```python
def test_import_lane_does_not_revert_a_scraped_hamza_seat(tmp_path):
    from scraper.db import ScraperDatabase
    from scraper.models import RootModel
    from scraper.sources.lane import import_lane_definitions

    db = ScraperDatabase(str(tmp_path / "t.db"))
    db.upsert_root(
        RootModel(root_buckwalter="ArD", root_arabic="أرض", occurrence_count=461)
    )
    tsv = tmp_path / "lane.tsv"
    tsv.write_text("ArD\tearth/land\n", encoding="utf-8")

    assert import_lane_definitions(tsv, db) == 1

    row = db._conn.execute(
        "SELECT root_arabic, occurrence_count FROM roots"
        " WHERE root_buckwalter='ArD'"
    ).fetchone()
    # Lane is an additive definitions layer. It is not an authority on
    # spelling or counts, and re-running it must not undo the scrape.
    assert (row[0], row[1]) == ("أرض", 461)
    db.close()


def test_import_lane_still_creates_a_missing_root(tmp_path):
    from scraper.db import ScraperDatabase
    from scraper.sources.lane import import_lane_definitions

    db = ScraperDatabase(str(tmp_path / "t.db"))
    tsv = tmp_path / "lane.tsv"
    tsv.write_text("ktb\twrite/inscribe\n", encoding="utf-8")

    assert import_lane_definitions(tsv, db) == 1

    # Definitions must still be loadable before the dictionary scrape runs.
    row = db._conn.execute(
        "SELECT root_arabic FROM roots WHERE root_buckwalter='ktb'"
    ).fetchone()
    assert row is not None
    db.close()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/python -m pytest tests/test_db.py tests/test_lane.py -v
```

Expected: FAIL — `AttributeError: ... 'get_or_create_root'`, and
`test_import_lane_does_not_revert_a_scraped_hamza_seat` failing with
`('ارض', 0)`.

- [ ] **Step 3: Add `get_or_create_root` to `packages/scraper/scraper/db.py`**

Insert immediately after `upsert_root`:

```python
    def get_or_create_root(self, root_buckwalter: str, root_arabic: str) -> int:
        """Return the root's id, inserting it only if absent.

        Unlike upsert_root this never writes over an existing row. Additive
        importers (Lane definitions) need a root_id but are not an authority
        on spelling or counts -- upsert_root would fold every scraped hamza
        seat back to bare alif and zero every occurrence_count.
        """
        row = self._conn.execute(
            "SELECT id FROM roots WHERE root_buckwalter = ?", (root_buckwalter,)
        ).fetchone()
        if row is not None:
            return int(row[0])
        cur = self._conn.execute(
            "INSERT INTO roots (root_buckwalter, root_arabic, occurrence_count)"
            " VALUES (?, ?, 0) RETURNING id",
            (root_buckwalter, root_arabic),
        )
        rid = int(cur.fetchone()[0])
        self._conn.commit()
        return rid
```

- [ ] **Step 4: Point `lane.py` at it**

In `packages/scraper/scraper/sources/lane.py`, replace:

```python
            rid = db.upsert_root(
                RootModel(
                    root_buckwalter=bw, root_arabic=buckwalter_to_arabic(bw) or bw
                )
            )
```

with:

```python
            # get_or_create, not upsert: Lane is an additive definitions
            # layer. Overwriting would revert every scraped hamza seat to
            # bare alif and zero every occurrence_count.
            rid = db.get_or_create_root(bw, buckwalter_to_arabic(bw) or bw)
```

Then drop the now-unused `RootModel` import from that file (ruff `F401` will
flag it otherwise).

- [ ] **Step 5: Run tests to verify they pass**

```bash
.venv/bin/python -m pytest tests/test_db.py tests/test_lane.py -v
```

Expected: PASS.

- [ ] **Step 6: Run the whole suite + lint + types**

```bash
.venv/bin/python -m pytest -q
.venv/bin/python -m ruff check --config pyproject.toml scraper tests
.venv/bin/python -m mypy scraper
```

Expected: **245 passed** (241 + 4); ruff 10; mypy 1 (`mt.py:37`).

- [ ] **Step 7: Prove the tests are not vacuous**

```bash
cp scraper/sources/lane.py /tmp/lane.bak
.venv/bin/python - <<'PY'
import pathlib
p = pathlib.Path("scraper/sources/lane.py")
p.write_text(p.read_text().replace(
    "rid = db.get_or_create_root(bw, buckwalter_to_arabic(bw) or bw)",
    "rid = db.upsert_root(RootModel(root_buckwalter=bw, "
    "root_arabic=buckwalter_to_arabic(bw) or bw))")
    .replace("from ..models import RootDefinitionModel",
             "from ..models import RootDefinitionModel, RootModel"))
PY
.venv/bin/python -m pytest tests/test_lane.py -q
# expect: test_import_lane_does_not_revert_a_scraped_hamza_seat FAILS with ('ارض', 0)
cp /tmp/lane.bak scraper/sources/lane.py
diff -q /tmp/lane.bak scraper/sources/lane.py && rm /tmp/lane.bak
.venv/bin/python -m pytest tests/test_lane.py -q   # expect: green
```

- [ ] **Step 8: Commit**

```bash
cd /home/claude/projects/quran-corpus-pwa
git add packages/scraper/scraper/db.py packages/scraper/scraper/sources/lane.py \
        packages/scraper/tests/test_db.py packages/scraper/tests/test_lane.py
git commit -m "fix(scraper): stop import-lane overwriting scraped root spelling"
```

---

### Task 5: Migrate the live archive and prove replay is a no-op

Before any live crawl: rename the 348 legacy snapshots, then re-parse all 712
existing snapshots into a **copy** of the DB and diff it against the live one.
The diff must be empty. A non-empty diff means Task 2's replay path disagrees
with what the scrape wrote, and the 930-root run must not start until that is
understood.

This is the same differential technique that caught the `root_nwn` regression
in phase 17 when every unit test was green.

**Files:** none modified — this task produces evidence, and its deliverable is
the recorded result plus a `docs/plans/` note if anything surprising appears.

- [ ] **Step 1: Back up the live DB**

```bash
cp ~/quran-data/quran.db ~/quran-data/quran.db.bak-phase18-$(date +%Y%m%d)
ls -la ~/quran-data/quran.db.bak-phase18-*
```

- [ ] **Step 2: Dry-run the filename migration**

```bash
cd /home/claude/projects/quran-corpus-pwa/packages/scraper
.venv/bin/python -m scraper.cli migrate-snapshot-names \
  --snapshot-dir ~/quran-data/.snapshots/roots --dry-run | tail -5
```

Expected: ends with `migrate-snapshot-names: 348 would be renamed.`
If the number is not 348, stop and re-measure — the archive changed since
this plan was written.

- [ ] **Step 3: Run the migration**

```bash
.venv/bin/python -m scraper.cli migrate-snapshot-names \
  --snapshot-dir ~/quran-data/.snapshots/roots
ls ~/quran-data/.snapshots/roots | wc -l
```

Expected: `migrate-snapshot-names: 348 renamed.` and still **712** files —
a rename must not change the count. A drop means a collision silently ate a
file; restore from the DB backup path and stop.

- [ ] **Step 4: Confirm idempotence on the real archive**

```bash
.venv/bin/python -m scraper.cli migrate-snapshot-names \
  --snapshot-dir ~/quran-data/.snapshots/roots
```

Expected: `0 renamed.`

- [ ] **Step 5: Replay into a copy and diff against live**

```bash
cd /home/claude/projects/quran-corpus-pwa/packages/scraper
cp ~/quran-data/quran.db /tmp/replay-check.db
.venv/bin/python -m scraper.cli reparse-snapshots \
  --db /tmp/replay-check.db --snapshot-dir ~/quran-data/.snapshots/roots
```

Expected: `reparse-snapshots: 712 roots updated, 0 unparseable.`

- [ ] **Step 6: Diff the two databases**

```bash
.venv/bin/python - <<'PY'
import sqlite3
live = sqlite3.connect("file:%s?mode=ro" % __import__("os").path.expanduser(
    "~/quran-data/quran.db"), uri=True)
rep = sqlite3.connect("file:/tmp/replay-check.db?mode=ro", uri=True)

def snap(c):
    roots = {r[0]: (r[1], r[2]) for r in c.execute(
        "SELECT root_buckwalter, root_arabic, occurrence_count FROM roots")}
    forms = {}
    for bw, so, pos, ar, tr, n in c.execute(
        "SELECT r.root_buckwalter, f.sort_order, f.pos_label, f.form_arabic,"
        " f.form_translit, f.occurrence_count"
        " FROM root_forms f JOIN roots r ON r.id = f.root_id"):
        forms[(bw, so)] = (pos, ar, tr, n)
    return roots, forms

lr, lf = snap(live)
rr, rf = snap(rep)
print("root rows differing:", sum(1 for k in lr if lr[k] != rr.get(k)))
print("form rows only in live:", len(set(lf) - set(rf)))
print("form rows only in replay:", len(set(rf) - set(lf)))
print("form rows differing:", sum(1 for k in lf if k in rf and lf[k] != rf[k]))
for k in list(k for k in lr if lr[k] != rr.get(k))[:10]:
    print("  ROOT", k, "live", lr[k], "replay", rr.get(k))
PY
```

Expected: **all four counts zero.** If any is non-zero, stop: the replay path
and the scrape disagree, and the 930-root run in Task 6 must wait until the
cause is understood and fixed. Record the finding in the SDD ledger.

- [ ] **Step 7: Clean up and record**

```bash
rm /tmp/replay-check.db
```

Write the four counts and the migration numbers into the SDD progress ledger.
No commit — this task changes no tracked file.

---

### Task 6: The live 930-root run and verification

Fetch the 930 roots that have no snapshot. With Task 3 in place this is a
plain `scrape-dictionary` against the main checkpoint: every root's key is
already `done`, so only the ones missing from the archive get fetched.

**Files:**
- Modify: `STATUS.md`
- Test: verification is data-level, run inline; the code is already covered
  by Tasks 1-4.

- [ ] **Step 1: Record the before-state**

```bash
cd /home/claude/projects/quran-corpus-pwa/packages/scraper
.venv/bin/python - > /tmp/phase18-before.json <<'PY'
import json, os, sqlite3
c = sqlite3.connect("file:%s?mode=ro" % os.path.expanduser(
    "~/quran-data/quran.db"), uri=True)
print(json.dumps({
    "roots": {r[0]: [r[1], r[2]] for r in c.execute(
        "SELECT root_buckwalter, root_arabic, occurrence_count FROM roots")},
    "form_counts": {r[0]: r[1] for r in c.execute(
        "SELECT r.root_buckwalter, COUNT(f.id) FROM roots r"
        " LEFT JOIN root_forms f ON f.root_id = r.id GROUP BY r.id")},
}, ensure_ascii=False))
PY
ls ~/quran-data/.snapshots/roots | wc -l   # expect 712
```

- [ ] **Step 2: Confirm the dry count before spending 24 minutes of crawl**

```bash
.venv/bin/python - <<'PY'
import os, sqlite3, sys
sys.path.insert(0, ".")
from scraper.snapshots import has_snapshot
d = os.path.expanduser("~/quran-data/.snapshots/roots")
c = sqlite3.connect("file:%s?mode=ro" % os.path.expanduser(
    "~/quran-data/quran.db"), uri=True)
roots = [r[0] for r in c.execute(
    "SELECT DISTINCT root_buckwalter FROM words"
    " WHERE root_buckwalter IS NOT NULL AND root_buckwalter <> ''")]
missing = [b for b in roots if not has_snapshot(d, f"root_{b}")]
print("roots:", len(roots), "would fetch:", len(missing))
print("sample:", missing[:8])
PY
```

Expected: `roots: 1642 would fetch: 930`. Any other number means the archive
or the root set moved — stop and re-measure before crawling.

- [ ] **Step 3: Run the scrape in resumable foreground chunks**

A subagent's `run_in_background` shell is killed at its turn boundary,
silently. Run foreground chunks instead; each is resumable because the
checkpoint and the archive both persist.

```bash
cd /home/claude/projects/quran-corpus-pwa/packages/scraper
for i in $(seq 1 8); do
  timeout 540 .venv/bin/python -m scraper.cli scrape-dictionary \
    --db ~/quran-data/quran.db \
    --checkpoint ~/quran-data/dict_checkpoint.json \
    --snapshot-dir ~/quran-data/.snapshots/roots \
    --rate-limit 1.5 2>&1 | tail -3
  echo "--- chunk $i done, archive: $(ls ~/quran-data/.snapshots/roots | wc -l) ---"
  [ "$(ls ~/quran-data/.snapshots/roots | wc -l)" -ge 1642 ] && break
done
```

`--rate-limit 1.5` is the floor, not a knob (CLAUDE.md §11). Never lower it.
930 × 1.5 s ≈ 24 min, so ~3 chunks; the loop allows slack for retries.

> `~/quran-data/dict_checkpoint.json` does not exist today — the main
> checkpoint lives at `packages/scraper/dict_checkpoint.json` with 1642 keys.
> Copy it first (`cp packages/scraper/dict_checkpoint.json
> ~/quran-data/dict_checkpoint.json`) or point `--checkpoint` at the repo
> path. Confirm which before starting; do not create an empty one, or every
> root re-fetches.

- [ ] **Step 4: Confirm the archive is complete**

```bash
ls ~/quran-data/.snapshots/roots | wc -l
```

Expected: **1642**. If short, re-run one more chunk — it resumes exactly.

- [ ] **Step 5: Diff before vs after and eyeball every change**

```bash
cd /home/claude/projects/quran-corpus-pwa/packages/scraper
.venv/bin/python - <<'PY'
import json, os, sqlite3
before = json.load(open("/tmp/phase18-before.json"))
c = sqlite3.connect("file:%s?mode=ro" % os.path.expanduser(
    "~/quran-data/quran.db"), uri=True)
after_roots = {r[0]: [r[1], r[2]] for r in c.execute(
    "SELECT root_buckwalter, root_arabic, occurrence_count FROM roots")}
after_forms = {r[0]: r[1] for r in c.execute(
    "SELECT r.root_buckwalter, COUNT(f.id) FROM roots r"
    " LEFT JOIN root_forms f ON f.root_id = r.id GROUP BY r.id")}

spell = [(b, before["roots"][b][0], after_roots[b][0])
         for b in after_roots
         if b in before["roots"] and before["roots"][b][0] != after_roots[b][0]]
count = [(b, before["roots"][b][1], after_roots[b][1])
         for b in after_roots
         if b in before["roots"] and before["roots"][b][1] != after_roots[b][1]]
forms = [(b, before["form_counts"].get(b), after_forms[b])
         for b in after_forms
         if before["form_counts"].get(b) != after_forms[b]]

print("root_arabic changed:", len(spell))
for row in spell: print("   ", row)
print("occurrence_count changed:", len(count))
for row in count[:20]: print("   ", row)
print("form count changed:", len(forms))
for row in forms[:20]: print("   ", row)
print("roots with a space in root_arabic:", c.execute(
    "SELECT COUNT(*) FROM roots WHERE root_arabic LIKE '% %'").fetchone()[0])
print("roots with 0 forms:", c.execute(
    "SELECT COUNT(*) FROM roots r WHERE NOT EXISTS(SELECT 1 FROM root_forms f"
    " WHERE f.root_id=r.id AND f.form_arabic IS NOT NULL)").fetchone()[0])
PY
```

Acceptance:
- `root_arabic changed` ≤ **61** and **every** change is bare alif → hamza
  seat (`ا` → `أ`/`إ`/`آ`) or another added diacritic. **Any change in the
  reverse direction is a level-DOWN and violates the user's ruling — stop,
  revert the DB from the backup, and report.**
- `roots with a space in root_arabic` = **0**.
- `roots with 0 forms` = **0**.
- `form count changed` — inspect each. A drop is legitimate only if the live
  page really lists fewer forms; spot-check two by URL before accepting.
- `occurrence_count changed` — inspect. See Step 6.

- [ ] **Step 6: Re-check `occurrence_count` provenance**

The scrape writes corpus's page total into `roots.occurrence_count`, which
can undo `fix-root-data` (that command derives it from `word_segments.root`).
Before the run these agreed on all 1642 roots.

```bash
.venv/bin/python - <<'PY'
import os, sqlite3
c = sqlite3.connect("file:%s?mode=ro" % os.path.expanduser(
    "~/quran-data/quran.db"), uri=True)
n = c.execute("""SELECT COUNT(*) FROM roots r WHERE r.occurrence_count <>
  (SELECT COUNT(*) FROM word_segments s WHERE s.root = r.root_buckwalter)"""
).fetchone()[0]
print("occurrence_count vs word_segments mismatches:", n)
PY
```

Expected **0**. If non-zero, run
`.venv/bin/python -m scraper.cli fix-root-data --db ~/quran-data/quran.db`
and re-check — `word_segments` is the agreed source
(`occurrence-count-source-decision`).

- [ ] **Step 7: Spot-check three roots against the live site**

Pick three from the `root_arabic changed` list and confirm the seat matches
the page:

```bash
for bw in Alh Ajr Akl; do
  echo "=== $bw ==="
  curl -s "https://corpus.quran.com/qurandictionary.jsp?q=$bw" \
    | grep -o 'class="at">[^<]*</span>' | head -2
  sleep 2
done
```

Three requests, 2 s apart — well inside the §11 floor. Confirm each DB
spelling matches the page's header span.

- [ ] **Step 8: Verify the web layer still resolves both spellings**

`foldLetter` in `packages/data/src/text/arabic.ts` folds hamza variants
before sorting, bucket lookup, and search, and phase 17 added client-side
folding in `DictionaryBrowser.tsx`. Confirm nothing regressed:

```bash
cd /home/claude/projects/quran-corpus-pwa
npm run -w apps/web test 2>&1 | tail -5
npm run -w @quran-corpus/data test 2>&1 | tail -5
npx tsc --noEmit -p apps/web 2>&1 | tail -5
```

Expected: web suite **402 passed**, data suite passing, `tsc` clean.

> Do **not** run `npm run build` while a `next dev` server is running — they
> share `.next` and the build wipes it, producing CSS 404s and
> `MODULE_NOT_FOUND`. Recovery: kill dev, `rm -rf apps/web/.next`, restart.

- [ ] **Step 9: Update `STATUS.md`**

Replace the "Carry into the 930-root re-scrape phase" list in the Phase 17
section with a Phase 18 section recording: archive 712 → 1642, the exact
count of `root_arabic` seats levelled up with the full list, form-count
changes, occurrence-count outcome, and which of the six carry items are now
closed (all of them) versus still open.

- [ ] **Step 10: Commit**

```bash
cd /home/claude/projects/quran-corpus-pwa
git add STATUS.md
git commit -m "docs: record the 930-root re-scrape and hamza seat level-up"
```

---

## Acceptance Criteria

Testable, all of them:

1. `ls ~/quran-data/.snapshots/roots | wc -l` = **1642**.
2. `migrate-snapshot-names --snapshot-dir ~/quran-data/.snapshots/roots`
   reports **0 renamed** on a second run.
3. `reparse-snapshots` into a copy of the live DB produces **zero** differing
   root rows and **zero** differing form rows (Task 5 Step 6).
4. `SELECT COUNT(*) FROM roots WHERE root_arabic LIKE '% %'` = **0**.
5. `SELECT COUNT(*) FROM roots r WHERE NOT EXISTS(SELECT 1 FROM root_forms f
   WHERE f.root_id=r.id AND f.form_arabic IS NOT NULL)` = **0**.
6. Every `root_arabic` change is a level-**up** (bare alif → seated hamza).
   Zero level-downs.
7. `occurrence_count` matches `COUNT(word_segments.root)` on all 1642 roots.
8. `import-lane` re-run against the live DB changes **no** `root_arabic` and
   **no** `occurrence_count` (covered by `test_import_lane_does_not_revert_a_scraped_hamza_seat`).
9. `rescrape-formless-roots` without `--checkpoint` exits non-zero.
10. `pytest` in `packages/scraper`: **245 passed**. ruff: 10 errors
    (`--config pyproject.toml`). mypy: 1 error, `scraper/mt.py:37`.
11. `apps/web` suite 402 passed, `tsc --noEmit` clean.
12. Every new test fails when its implementation is reverted (the mutation
    step in each task).

## Out of Scope

- `docs/plans/phase-12-hamza-seat-fix.md` — seatless hamza in **ayah text
  rendering**, a different layer. Untracked, unrelated, keep it out of every
  commit.
- Repo visibility. Still blocked on GitHub Support GC'ing the orphaned
  pre-rewrite objects. Do not flip it.
- The 6 dead concordance chips from shadda/vowel byte ordering.
- `DictionaryBrowser` test fixtures still using spaced roots.
