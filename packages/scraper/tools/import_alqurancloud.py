"""One-shot import from api.alquran.cloud.

Populates: ayahs (text_uthmani, juz, page) + translations (en, ru, uz).
Idempotent — all upserts; safe to re-run.

Usage:
    uv run python tools/import_alqurancloud.py --db ../../apps/web/quran.db
"""

import sys
from pathlib import Path

import click
import httpx

sys.path.insert(0, str(Path(__file__).parents[1]))

from scraper.db import ScraperDatabase
from scraper.models import AyahModel, TranslationModel

EDITIONS = [
    ("en", "Saheeh International", "en.sahih"),
    ("ru", "Elmir Kuliev", "ru.kuliev"),
    ("uz", "Muhammad Sodik Muhammad Yusuf", "uz.sodik"),
]

BASE = "https://api.alquran.cloud/v1/quran"


def fetch(client: httpx.Client, edition: str) -> dict:
    click.echo(f"  Fetching {edition}...")
    r = client.get(f"{BASE}/{edition}", timeout=60.0)
    r.raise_for_status()
    return r.json()


@click.command()
@click.option("--db", default="quran.db", show_default=True)
def main(db: str) -> None:
    database = ScraperDatabase(db)

    with httpx.Client() as client:
        # ── Step 1: ayahs ──────────────────────────────────────────────
        click.echo("Importing ayahs (quran-uthmani)...")
        data = fetch(client, "quran-uthmani")
        total = 0
        for surah in data["data"]["surahs"]:
            surah_id: int = surah["number"]
            for ayah in surah["ayahs"]:
                database.upsert_ayah(AyahModel(
                    surah_id=surah_id,
                    ayah_number=int(ayah["numberInSurah"]),
                    text_uthmani=ayah["text"],
                    juz=ayah.get("juz"),
                    page=ayah.get("page"),
                ))
                total += 1
        click.echo(f"  {total} ayahs imported.")

        # ── Step 2: ayah_id lookup ─────────────────────────────────────
        ayah_map: dict[tuple[int, int], int] = {
            (int(r["surah_id"]), int(r["ayah_number"])): int(r["id"])
            for r in database.get_all_ayahs()
        }

        # ── Step 3: translations ───────────────────────────────────────
        for lang_code, translator, edition in EDITIONS:
            click.echo(f"Importing translations ({lang_code} — {translator})...")
            tdata = fetch(client, edition)
            count = 0
            for surah in tdata["data"]["surahs"]:
                surah_id = surah["number"]
                for ayah in surah["ayahs"]:
                    ayah_number = int(ayah["numberInSurah"])
                    ayah_id = ayah_map.get((surah_id, ayah_number))
                    if ayah_id is None:
                        click.echo(f"  WARN: no ayah for {surah_id}:{ayah_number}", err=True)
                        continue
                    database.upsert_translation(TranslationModel(
                        ayah_id=ayah_id,
                        language_code=lang_code,
                        translator=translator,
                        text=ayah["text"],
                    ))
                    count += 1
            click.echo(f"  {count} translations imported.")

    database.close()
    click.echo("Done.")


if __name__ == "__main__":
    main()
