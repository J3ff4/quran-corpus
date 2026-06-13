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
def scrape(db: str, checkpoint: str, surah: int | None, rate_limit: float) -> None:
    """Scrape corpus.quran.com morphology data (rate-limited, resumable)."""
    from .sources.corpus_quran import scrape_chapter

    database = ScraperDatabase(db)
    ckpt = Checkpoint(checkpoint)
    # idempotent; ensures surahs + languages exist before scraping
    seed_database(database)

    surah_range = [surah] if surah else list(range(1, 115))
    for chapter_id in surah_range:
        click.echo(f"Scraping surah {chapter_id}...")
        scrape_chapter(chapter_id, database, ckpt, rate_limit=rate_limit)

    click.echo("Done.")
    database.close()


@main.command("import-tanzil")
@click.argument("xml_path")
@click.option("--db", default="quran.db", show_default=True)
def import_tanzil(xml_path: str, db: str) -> None:
    """Import a Tanzil XML file into the database."""
    from pathlib import Path

    from .sources.tanzil import import_tanzil_text

    database = ScraperDatabase(db)
    import_tanzil_text(Path(xml_path), database)
    database.close()
    click.echo("Import complete.")


@main.command("import-quranenc")
@click.argument("json_path")
@click.argument("language_code")
@click.argument("translator")
@click.option("--db", default="quran.db", show_default=True)
def import_quranenc(
    json_path: str, language_code: str, translator: str, db: str
) -> None:
    """Import a QuranEnc JSON translation file into the database."""
    from pathlib import Path

    from .sources.quranenc import import_quranenc_translation

    database = ScraperDatabase(db)
    import_quranenc_translation(Path(json_path), language_code, translator, database)
    database.close()
    click.echo("Import complete.")
