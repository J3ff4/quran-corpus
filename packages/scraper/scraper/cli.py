import click

from .checkpoint import Checkpoint
from .db import ScraperDatabase


@click.group()
def main() -> None:
    """Quran corpus scraper and data importer."""


@main.command()
@click.option("--db", default="quran.db", show_default=True, help="SQLite output path")
@click.option("--checkpoint", default="checkpoint.json", show_default=True)
@click.option("--surah", type=int, default=None, help="Scrape single surah (1-114)")
def scrape(db: str, checkpoint: str, surah: int | None) -> None:
    """Scrape corpus.quran.com morphology data (rate-limited, resumable)."""
    database = ScraperDatabase(db)
    _ = Checkpoint(checkpoint)  # Phase 2: checkpoint will track per-surah progress
    surah_range = [surah] if surah else list(range(1, 115))
    click.echo(f"Target surahs: {surah_range}")
    click.echo("Phase 2: full scraping implementation pending.")
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
