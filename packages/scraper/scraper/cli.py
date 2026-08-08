from pathlib import Path

import click

from . import source_header
from .checkpoint import Checkpoint
from .db import ScraperDatabase
from .seed import seed_database
from .snapshots import ROOT_PREFIX


@click.group()
def main() -> None:
    """Quran corpus scraper and data importer."""


def _check_headers(primary: Path, source: str, pair: str | None) -> None:
    """Both header guards, with their message delivered as a message.

    `check`/`check_pair` raise `ValueError`, which click does not translate:
    the operator of the one command that deletes rows would see a traceback
    with the explanation buried in it. These guards exist to be *read* -- they
    name which dictionary is about to be deleted and installed in whose place
    -- so the failure exits 1 with `Error: <message>` like any other misuse.
    """
    try:
        source_header.check(primary, source)
        if pair:
            source_header.check_pair(primary, Path(pair))
    except ValueError as exc:
        raise click.ClickException(str(exc)) from exc


# Shared --rate-limit for every command that hits corpus.quran.com.
# CLAUDE.md §11 pins the crawl to ~1 req / 1.5-2s and calls it non-negotiable,
# so the floor is enforced by click rather than left to the operator. Defined
# once, not copied per command: a new scrape command wired with this decorator
# cannot silently disagree with its neighbours about the floor.
rate_limit_option = click.option(
    "--rate-limit",
    type=click.FloatRange(min=1.5),
    default=1.5,
    show_default=True,
    help="Seconds between requests (floor 1.5, CLAUDE.md §11)",
)


@main.command()
@click.option("--db", default="quran.db", show_default=True)
def seed(db: str) -> None:
    """Seed database with languages and surah metadata (idempotent)."""
    database = ScraperDatabase(db)
    seed_database(database)
    database.close()
    click.echo("Seed complete.")


@main.command()
@click.option("--db", default="quran.db", show_default=True, help="SQLite output path")
@click.option("--checkpoint", default="checkpoint.json", show_default=True)
@click.option("--surah", type=int, default=None, help="Scrape single surah (1-114)")
@rate_limit_option
@click.option(
    "--force", is_flag=True, help="Re-scrape even if checkpoint marks a chapter done"
)
def scrape(
    db: str, checkpoint: str, surah: int | None, rate_limit: float, force: bool
) -> None:
    """Scrape corpus.quran.com morphology data (rate-limited, resumable)."""
    from .sources.corpus_quran import scrape_chapter

    database = ScraperDatabase(db)
    ckpt = Checkpoint(checkpoint)
    # idempotent; ensures surahs + languages exist before scraping
    seed_database(database)

    surah_range = [surah] if surah else list(range(1, 115))
    for chapter_id in surah_range:
        if force:
            ckpt.clear(f"chapter_{chapter_id}")
        click.echo(f"Scraping surah {chapter_id}...")
        scrape_chapter(chapter_id, database, ckpt, rate_limit=rate_limit)

    click.echo("Done.")
    database.close()


@main.command("scrape-dictionary")
@click.option("--db", default="quran.db", show_default=True, help="SQLite output path")
@click.option("--checkpoint", default="dict_checkpoint.json", show_default=True)
@click.option(
    "--snapshot-dir", default=".snapshots/roots", show_default=True,
    help="Persist raw HTML here (CLAUDE.md §11)",
)
@rate_limit_option
def scrape_dictionary_cmd(
    db: str, checkpoint: str, snapshot_dir: str, rate_limit: float
) -> None:
    """Scrape qurandictionary.jsp for every distinct root (rate-limited, resumable).

    Requires roots to exist in the DB first (run import-corpus).
    """
    from .sources.dictionary_scrape import scrape_dictionary

    database = ScraperDatabase(db)
    ckpt = Checkpoint(checkpoint)
    count = scrape_dictionary(
        database, ckpt, rate_limit=rate_limit, snapshot_dir=snapshot_dir
    )
    database.close()
    click.echo(f"Dictionary scrape complete: {count} roots.")


@main.command("rescrape-formless-roots")
@click.option("--db", default="quran.db", show_default=True, help="SQLite output path")
@click.option(
    "--checkpoint",
    required=True,
    help="Checkpoint file. Required: defaulting to the main dict_checkpoint"
         " would mark roots done in the checkpoint the full scrape depends on.",
)
@click.option(
    "--snapshot-dir", default=".snapshots/roots", show_default=True,
    help="Persist raw HTML here so a future parser fix needs no re-fetch",
)
@rate_limit_option
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
    try:
        targets = database.get_roots_without_forms()
        if not targets:
            click.echo("rescrape-formless-roots: nothing to do.")
            return

        ckpt = Checkpoint(checkpoint)
        for bw in targets:
            ckpt.clear(f"{ROOT_PREFIX}{bw}")

        click.echo(f"re-scraping {len(targets)} formless roots...")
        count = scrape_dictionary(
            database,
            ckpt,
            rate_limit=rate_limit,
            roots=targets,
            snapshot_dir=snapshot_dir,
        )
        remaining = len(database.get_roots_without_forms())
    finally:
        database.close()
    click.echo(
        f"rescrape-formless-roots: {count} roots re-scraped, "
        f"{remaining} still without forms."
    )


@main.command("migrate-snapshot-names")
@click.option(
    "--snapshot-dir", default=".snapshots/roots", show_default=True,
    type=click.Path(exists=True, file_okay=False),
    help="Snapshot archive to rename in place",
)
@click.option("--dry-run", is_flag=True, help="List renames without doing them")
def migrate_snapshot_names_cmd(snapshot_dir: str, dry_run: bool) -> None:
    """Rename snapshots written before the filename encoder changed.

    Idempotent. Run once against an archive predating the uppercase-escaping
    encoder, or a re-scrape leaves a second file per affected root.
    """
    from .snapshots import (
        duplicate_key_names,
        legacy_names_to_migrate,
        migrate_legacy_names,
    )

    # Duplicates are exactly what the migration declines to touch, so reporting
    # only the rename count would print "0 renamed" for an archive that still
    # holds a stale copy of every affected root.
    for key, names in duplicate_key_names(snapshot_dir):
        click.echo(f"warning: {key} archived under {len(names)} names: {names}")
    if dry_run:
        pending = legacy_names_to_migrate(snapshot_dir)
        for old, new in pending:
            click.echo(f"{old} -> {new}")
        click.echo(f"migrate-snapshot-names: {len(pending)} would be renamed.")
        return
    moved = migrate_legacy_names(snapshot_dir)
    click.echo(f"migrate-snapshot-names: {len(moved)} renamed.")


@main.command("reparse-snapshots")
@click.option("--db", default="quran.db", show_default=True, help="SQLite output path")
@click.option(
    "--snapshot-dir", default=".snapshots/roots", show_default=True,
    type=click.Path(exists=True, file_okay=False),
    help="Archive to re-parse (written by scrape-dictionary --snapshot-dir)",
)
def reparse_snapshots_cmd(db: str, snapshot_dir: str) -> None:
    """Re-parse saved root HTML into the DB. No network, idempotent.

    Use after any change to parse_root_page instead of re-crawling.
    """
    from .replay import replay_root_snapshots

    database = ScraperDatabase(db)
    try:
        updated, bad, unreadable = replay_root_snapshots(snapshot_dir, database)
    finally:
        database.close()
    click.echo(
        f"reparse-snapshots: {updated} roots updated, {bad} unparseable, "
        f"{unreadable} unreadable."
    )


@main.command("scrape-word-details")
@click.option("--db", default="quran.db", show_default=True, help="SQLite output path")
@click.option("--checkpoint", default="worddetail_checkpoint.json", show_default=True)
@rate_limit_option
def scrape_word_details_cmd(db: str, checkpoint: str, rate_limit: float) -> None:
    """Scrape wordmorphology.jsp verbatim strings for every word (resumable)."""
    from .sources.dictionary_scrape import scrape_word_details

    database = ScraperDatabase(db)
    ckpt = Checkpoint(checkpoint)
    count = scrape_word_details(database, ckpt, rate_limit=rate_limit)
    database.close()
    click.echo(f"Word-detail scrape complete: {count} words.")


@main.command("trim-word-descriptions")
@click.option("--db", default="quran.db", show_default=True, help="SQLite output path")
def trim_word_descriptions_cmd(db: str) -> None:
    """Trim trailing page chrome from stored word descriptions (idempotent)."""
    from .backfill_descriptions import trim_stored_descriptions

    database = ScraperDatabase(db)
    changed = trim_stored_descriptions(database)
    database.close()
    click.echo(f"trim-word-descriptions: {changed} rows trimmed.")


@main.command("fix-root-data")
@click.option("--db", default="quran.db", show_default=True, help="SQLite output path")
def fix_root_data_cmd(db: str) -> None:
    """Re-derive occurrence_count from word_segments + drop junk forms (idempotent)."""
    from .fix_root_data import fix_root_data

    database = ScraperDatabase(db)
    counts, forms = fix_root_data(database)
    database.close()
    click.echo(f"fix-root-data: {counts} counts updated, {forms} junk forms deleted.")


@main.command("fix-hamza-seat")
@click.option("--db", default="quran.db", show_default=True, help="SQLite output path")
def fix_hamza_seat_cmd(db: str) -> None:
    """Rewrite definite-article seatless-hamza to KFGQPC's tatweel-seat form."""
    from .fix_hamza_seat import fix_hamza_seat

    database = ScraperDatabase(db)
    ayahs, words = fix_hamza_seat(database)
    database.close()
    click.echo(f"fix-hamza-seat: {ayahs} ayahs updated, {words} words updated.")


@main.command("fix-lemma-madda")
@click.option("--db", default="quran.db", show_default=True, help="SQLite output path")
def fix_lemma_madda_cmd(db: str) -> None:
    """NFC-normalize words/word_segments.lemma alef-madda spelling to match
    root_forms.form_arabic, so the concordance derived-form filter matches."""
    from .fix_lemma_madda import fix_lemma_madda

    database = ScraperDatabase(db)
    words, segments = fix_lemma_madda(database)
    database.close()
    click.echo(f"fix-lemma-madda: {words} words updated, {segments} word_segments updated.")


@main.command("import-corpus")
@click.argument("txt_path")
@click.option("--db", default="quran.db", show_default=True)
def import_corpus(txt_path: str, db: str) -> None:
    """Import the Quranic Arabic Corpus morphology file (runs seed first).

    Download quranic-corpus-morphology-0.4.txt from
    https://corpus.quran.com/download/ first. Ayah text must already be
    imported (run import-tanzil) so word Arabic text can be derived.
    """
    from .sources.corpus_import import import_corpus_morphology

    database = ScraperDatabase(db)
    seed_database(database)
    count = import_corpus_morphology(Path(txt_path), database)
    database.close()
    click.echo(f"Import complete: {count} words.")


@main.command("import-lane")
@click.argument("tsv_path")
@click.option("--db", default="quran.db", show_default=True)
# No default. It used to be "lane", a tag no row has ever carried -- the live
# four are corpus-forms, hanswehr, perseus-lane and qurandev-lane -- so an
# omitted flag wrote an orphan nothing reads. That is worst in the pair this
# command belongs to: `prepare_*` emits a prune list scoped to *its* source and
# `prune-definitions --source` requires the tag, so a forgotten flag here
# deletes a dictionary's live rows and reinstalls them under a name no query
# joins on. Pairing the two is the whole point of the prune list; make the
# operator name the source on both halves.
@click.option(
    "--source",
    required=True,
    help="root_definitions.source tag (e.g. qurandev-lane, hanswehr)",
)
# The tag pairs the two *sources*; this pairs the two *runs*. Optional because
# the other three prepare tools stamp nothing and their TSVs still import.
@click.option(
    "--pair",
    type=click.Path(exists=True),
    help="the prune list from the same prepare run; refuses a different run",
)
def import_lane(tsv_path: str, db: str, source: str, pair: str | None) -> None:
    """Import Lane's Lexicon root definitions from a TSV (root<TAB>definition)."""
    from .sources.lane import import_lane_definitions

    # Before the DB is opened: a required flag stops --source being forgotten,
    # not the import naming a different one from the prune that preceded it.
    _check_headers(Path(tsv_path), source, pair)
    database = ScraperDatabase(db)
    count = import_lane_definitions(Path(tsv_path), database, source=source)
    database.close()
    click.echo(f"Lane import complete: {count} definitions (source={source}).")


@main.command("prune-definitions")
@click.option("--db", default="quran.db", show_default=True)
@click.option(
    "--source", required=True, help="root_definitions.source tag to delete from"
)
@click.option(
    "--roots",
    required=True,
    type=click.Path(exists=True),
    help="Buckwalter roots, one per line; a row carrying a TAB and a gloss is "
    "a replacement and is skipped.",
)
@click.option(
    "--pair",
    type=click.Path(exists=True),
    help="the gloss TSV from the same prepare run; refuses a different run",
)
def prune_definitions(db: str, source: str, roots: str, pair: str | None) -> None:
    """Delete one source's definitions for the listed roots.

    The delete path `import-lane` lacks: it upserts and never removes, so a
    root the human override gate drops would keep its old gloss forever.

    Intended input is the generated list from `prepare_hanswehr_glosses
    --prune-out`: one bare root per line, every root holding a row at this
    source that the paired run did not re-produce. Prune it, import that run's
    `--out`, and the source holds exactly what the run produced.

    A `root<TAB>gloss` line is tolerated and *skipped* as a replacement, so
    pointing this at a hand-written overrides file cannot install five corrected
    glosses with `import-lane` and immediately delete them again. That is a
    safety net, not the path: an overrides file names only the roots a human
    chose, and the roots quarantined by the run keep their stale gloss.

    Note the asymmetry with `prepare_hanswehr_glosses.load_overrides`, which
    *raises* on a line with no tab. Deliberate: there a missing keystroke would
    turn a replacement into a drop, while here a bare root is the documented
    input and the file is machine-written.

    `--source` has no default on purpose -- this is the one destructive
    command here, and a wrong tag deletes another dictionary's work.
    """
    # Before anything reads the list, and long before the delete: the generated
    # file names the source it was computed against, and a bare root list
    # matches any source's rows, so a mismatch here silently deletes the wrong
    # dictionary. Absent header (hand-written file, or one from a tool that does
    # not write it yet) is unchecked, not rejected.
    _check_headers(Path(roots), source, pair)
    wanted: list[str] = []
    replacements = 0
    for line in Path(roots).read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        root, _, gloss = line.partition("\t")
        if gloss.strip():
            replacements += 1
            continue
        wanted.append(root.strip())
    # Deduped: `delete_root_definitions` reports rows deleted, so a root listed
    # twice printed "Pruned 1 of 2" and repeated itself in the unknown-roots
    # line. `--prune-out` cannot emit a duplicate, but a hand-written file is
    # documented as tolerated input here.
    wanted = list(dict.fromkeys(wanted))
    if replacements:
        click.echo(f"Skipped {replacements} rows carrying a gloss (replacements).")
    if not wanted:
        click.echo("No roots listed; nothing to prune.")
        return

    database = ScraperDatabase(db)
    deleted, unknown = database.delete_root_definitions(wanted, source)
    database.close()
    click.echo(f"Pruned {deleted} of {len(wanted)} listed roots (source={source}).")
    if unknown:
        click.echo(f"Not in roots table: {' '.join(unknown)}")


@main.command("validate")
@click.argument("gpl_txt_path")
@click.option("--db", default="quran.db", show_default=True)
@click.option("--limit", default=20, show_default=True, help="Max mismatches to print")
def validate_cmd(gpl_txt_path: str, db: str, limit: int) -> None:
    """Cross-check DB annotations against the GPL morphology file (exit 1 if any)."""
    import sys

    from .validate import validate_against_gpl

    database = ScraperDatabase(db)
    mismatches = validate_against_gpl(Path(gpl_txt_path), database)
    database.close()
    if not mismatches:
        click.echo("Validation clean: no mismatches.")
        return
    click.echo(f"Found {len(mismatches)} mismatches:")
    for m in mismatches[:limit]:
        click.echo(
            f"  ({m.surah}:{m.ayah}:{m.position}) {m.field}: "
            f"scraped={m.scraped!r} expected={m.expected!r}"
        )
    sys.exit(1)


@main.command("import-tanzil")
@click.argument("xml_path")
@click.option("--db", default="quran.db", show_default=True)
def import_tanzil(xml_path: str, db: str) -> None:
    """Import a Tanzil XML file into the database (runs seed first)."""
    from .sources.tanzil import import_tanzil_text

    database = ScraperDatabase(db)
    seed_database(database)
    import_tanzil_text(Path(xml_path), database)
    database.close()
    click.echo("Import complete.")


@main.command("derive-word-arabic")
@click.option("--db", default="quran.db", show_default=True)
def derive_word_arabic_cmd(db: str) -> None:
    """Rebuild words.text_arabic from word_segments (corpus-aligned)."""
    from .word_arabic import derive_word_arabic

    database = ScraperDatabase(db)
    try:
        changed = derive_word_arabic(database)
    except ValueError as exc:
        raise click.ClickException(str(exc)) from exc
    finally:
        database.close()
    click.echo(f"derive-word-arabic: {changed} words updated.")


@main.command("normalize-root-arabic")
@click.option("--db", default="quran.db", show_default=True)
def normalize_root_arabic_cmd(db: str) -> None:
    """Strip inter-letter whitespace from roots.root_arabic (idempotent)."""
    database = ScraperDatabase(db)
    try:
        changed = database.normalize_root_arabic()
    finally:
        database.close()
    click.echo(f"normalize-root-arabic: {changed} roots updated.")


@main.command("validate-alignment")
@click.option("--db", default="quran.db", show_default=True)
def validate_alignment_cmd(db: str) -> None:
    """Assert text_arabic aligns with translit/segments. Exit 1 on any failure."""
    import sys

    from .validate_alignment import validate_alignment

    database = ScraperDatabase(db)
    errs = validate_alignment(database)
    database.close()
    if errs:
        for e in errs:
            click.echo(f"FAIL: {e}")
        sys.exit(1)
    click.echo("validate-alignment: OK")


@main.command("import-quranenc")
@click.argument("json_path")
@click.argument("language_code")
@click.argument("translator")
@click.option("--db", default="quran.db", show_default=True)
def import_quranenc(
    json_path: str, language_code: str, translator: str, db: str
) -> None:
    """Import a QuranEnc JSON translation file into the database (runs seed first)."""
    from .sources.quranenc import import_quranenc_translation

    database = ScraperDatabase(db)
    seed_database(database)
    import_quranenc_translation(Path(json_path), language_code, translator, database)
    database.close()
    click.echo("Import complete.")


@main.command("import-qul")
@click.argument("json_path")
@click.argument("language_code")
@click.argument("translator")
@click.option("--db", default="quran.db", show_default=True)
def import_qul(json_path: str, language_code: str, translator: str, db: str) -> None:
    """Import a QUL (Tarteel AI) "simple" JSON translation file (runs seed first)."""
    from .sources.qul import import_qul_translation

    database = ScraperDatabase(db)
    seed_database(database)
    import_qul_translation(Path(json_path), language_code, translator, database)
    database.close()
    click.echo("Import complete.")


@main.command("translate-glosses")
@click.option("--db", default="quran.db", show_default=True, help="SQLite output path")
@click.option("--batch-size", default=256, show_default=True)
def translate_glosses_cmd(db: str, batch_size: int) -> None:
    """Generate Uzbek word glosses via NLLB-200 (idempotent). Needs the `mt` extra."""
    from .mt import NllbMt
    from .translate_glosses import translate_glosses

    database = ScraperDatabase(db)
    n = translate_glosses(database, NllbMt(), batch_size=batch_size)
    database.close()
    click.echo(f"translate-glosses: {n} uz rows written.")


@main.command("glosses-export")
@click.option("--db", default="quran.db", show_default=True)
@click.option("--top", default=500, show_default=True, help="How many distinct glosses")
@click.option("--out", default="gloss-review.json", show_default=True)
def glosses_export_cmd(db: str, top: int, out: str) -> None:
    """Export top-N Uzbek glosses for human review (JSON)."""
    import json
    from .review_glosses import export_top

    database = ScraperDatabase(db)
    rows = export_top(database, top)
    database.close()
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(rows, fh, ensure_ascii=False, indent=2)
    click.echo(f"glosses-export: {len(rows)} rows -> {out}")


@main.command("glosses-import")
@click.argument("path")
@click.option("--db", default="quran.db", show_default=True)
def glosses_import_cmd(path: str, db: str) -> None:
    """Import reviewed Uzbek glosses; flips them to mt-reviewed (idempotent)."""
    import json
    from .review_glosses import import_reviewed

    with open(path, encoding="utf-8") as fh:
        entries = json.load(fh)
    database = ScraperDatabase(db)
    n = import_reviewed(database, entries)
    database.close()
    click.echo(f"glosses-import: {n} uz rows reviewed.")


@main.command("fetch-lane-tei")
@click.option(
    "--dest",
    default=str(Path.home() / "quran-data" / "refdata" / "lane-tei"),
    show_default=True,
    help="Where the TEI volumes land. Outside the repo: 67 MB, third-party (§9).",
)
@click.option("--force", is_flag=True, help="Re-download volumes already present.")
def fetch_lane_tei(dest: str, force: bool) -> None:
    """Download Perseus's 36 Lane TEI volumes."""
    from .sources.lane_tei import download_volumes

    paths = download_volumes(Path(dest), force=force)
    total = sum(p.stat().st_size for p in paths)
    click.echo(f"Lane TEI: {len(paths)} volumes, {total // 1024 // 1024} MB -> {dest}")


@main.command("fetch-salmone")
@click.option(
    "--dest",
    default=str(Path.home() / "quran-data" / "refdata" / "salmone"),
    show_default=True,
    help="Where salmone.xml lands. Outside the repo: 28.9 MB, third-party (§9).",
)
@click.option("--force", is_flag=True, help="Re-download even if already present.")
def fetch_salmone(dest: str, force: bool) -> None:
    """Download Perseus's Salmoné Arabic-English Dictionary XML."""
    from .sources.salmone import download_salmone

    path = download_salmone(Path(dest), force=force)
    size = path.stat().st_size
    click.echo(f"Salmone: {path.name}, {size} bytes -> {dest}")


if __name__ == "__main__":
    main()
