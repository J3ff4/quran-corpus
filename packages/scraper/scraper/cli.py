import click

from .checkpoint import Checkpoint
from .db import ScraperDatabase
from .seed import seed_database


@click.group()
def main() -> None:
    """Quran corpus scraper and data importer."""


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
@click.option(
    "--rate-limit", default=1.5, show_default=True, help="Seconds between requests"
)
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
    "--rate-limit", default=1.5, show_default=True, help="Seconds between requests"
)
def scrape_dictionary_cmd(db: str, checkpoint: str, rate_limit: float) -> None:
    """Scrape qurandictionary.jsp for every distinct root (rate-limited, resumable).

    Requires roots to exist in the DB first (run import-corpus).
    """
    from .sources.dictionary_scrape import scrape_dictionary

    database = ScraperDatabase(db)
    ckpt = Checkpoint(checkpoint)
    count = scrape_dictionary(database, ckpt, rate_limit=rate_limit)
    database.close()
    click.echo(f"Dictionary scrape complete: {count} roots.")


@main.command("scrape-word-details")
@click.option("--db", default="quran.db", show_default=True, help="SQLite output path")
@click.option("--checkpoint", default="worddetail_checkpoint.json", show_default=True)
@click.option(
    "--rate-limit", default=1.5, show_default=True, help="Seconds between requests"
)
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
    from pathlib import Path

    from .sources.corpus_import import import_corpus_morphology

    database = ScraperDatabase(db)
    seed_database(database)
    count = import_corpus_morphology(Path(txt_path), database)
    database.close()
    click.echo(f"Import complete: {count} words.")


@main.command("import-lane")
@click.argument("tsv_path")
@click.option("--db", default="quran.db", show_default=True)
@click.option(
    "--source",
    default="lane",
    show_default=True,
    help="root_definitions.source tag (e.g. qurandev-lane)",
)
def import_lane(tsv_path: str, db: str, source: str) -> None:
    """Import Lane's Lexicon root definitions from a TSV (root<TAB>definition)."""
    from pathlib import Path

    from .sources.lane import import_lane_definitions

    database = ScraperDatabase(db)
    count = import_lane_definitions(Path(tsv_path), database, source=source)
    database.close()
    click.echo(f"Lane import complete: {count} definitions (source={source}).")


@main.command("validate")
@click.argument("gpl_txt_path")
@click.option("--db", default="quran.db", show_default=True)
@click.option("--limit", default=20, show_default=True, help="Max mismatches to print")
def validate_cmd(gpl_txt_path: str, db: str, limit: int) -> None:
    """Cross-check DB annotations against the GPL morphology file (exit 1 if any)."""
    import sys
    from pathlib import Path

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
    from pathlib import Path

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
    from pathlib import Path

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
    from pathlib import Path

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


if __name__ == "__main__":
    main()
