# M1 Data Sources And Runtime Config

> M1 execution may use the existing PWA-generated DB for development. Play Store release work must not ship a source whose license or attribution is marked `Needs release sign-off` or `Not approved`.

## Corpus And Translation Sources

| Dataset | Source | License | Attribution | Code | Approved by | Approval date |
| --- | --- | --- | --- | --- | --- | --- |
| Arabic Quran text | Canonical local corpus DB: sibling workspace `../quran-data/quran.db`, generated from existing PWA importer data including Tanzil Uthmani XML via `packages/scraper/scraper/sources/tanzil.py`; copied to ignored mobile asset `apps/mobile/assets/db/quran.db` by `pnpm generate:m1-db` | Needs release sign-off | Needs release sign-off | ar | Not approved | Not approved |
| English translation | Existing PWA DB: Saheeh International | Needs release sign-off | Needs release sign-off | en | Not approved | Not approved |
| Uzbek translation (Latin) | Existing PWA DB: Tasnim | Needs release sign-off | Needs release sign-off | uz | Not approved | Not approved |
| Uzbek translation (Cyrillic) | Existing PWA DB: Tasnim, imported in M9 | Needs release sign-off | Needs release sign-off | uz-Cyrl | Not approved | Not approved |
| Russian translation | Existing PWA DB: Abu Adel | Needs release sign-off | Needs release sign-off | ru | Not approved | Not approved |
| Hafs font | Existing mobile asset: `apps/mobile/assets/fonts/hafs.18.woff2` | Needs release sign-off | Needs release sign-off | hafs | Not approved | Not approved |
| Abdul Rashid Sufi audio metadata | Not approved | Not approved | Not approved | abdul-rashid-sufi | Not approved | Not approved |

## Runtime Services

| Service | Config key | Value source | Privacy constraint | Enabled in local dev |
| --- | --- | --- | --- | --- |
| Audio endpoint | EXPO_PUBLIC_AUDIO_API_BASE_URL | Not approved | No user identifiers in URL | No |
| Sentry | EXPO_PUBLIC_SENTRY_DSN | Not approved | No Quran text or raw user input | No |
| PostHog | EXPO_PUBLIC_POSTHOG_KEY, EXPO_PUBLIC_POSTHOG_HOST | Not approved | Autocapture and session replay disabled | No |

## M1 Translation Selection

Uzbek is listed twice on purpose. `uz` is Latin and `uz-Cyrl` is Cyrillic, and
both name Tasnim so the script toggle changes the alphabet and nothing else --
the corpus's other two Uzbek translators are Cyrillic-only, so binding either
script to one of them would make the toggle swap the translation itself.

| Language | Selected translator |
| --- | --- |
| en | Saheeh International |
| uz | Tasnim |
| uz-Cyrl | Tasnim |
| ru | Abu Adel |
