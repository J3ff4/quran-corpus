# Product Requirements Document: Quranic Corpus Mobile-First PWA

## 1. Overview

### 1.1 Problem Statement

corpus.quran.com is an invaluable resource for word-by-word Quranic morphology, grammar, and translation data, but its UI is desktop-only, dated, and not mobile-friendly. There is no public API, so data must be scraped once and stored locally.

### 1.2 Vision

Build a beautiful, fast, mobile-first Progressive Web App that presents the Quranic corpus (Arabic text, word-by-word morphology, grammar tags, root words, and multiple translations) in a modern, polished interface — with multi-language support (English, Uzbek, Russian, and extensible to others). The data layer must be designed so a native mobile app can consume the same backend/data store later.

### 1.3 Non-Goals (v1)

- No user accounts / auth (read-only public resource initially)
- No live re-scraping pipeline (one-time scrape; manual re-run capability only)
- No server-side rendering of audio playback UI complexity beyond basic recitation player
- No CMS for content editing (data is static/scraped)

-----

## 2. Data Acquisition Strategy

### 2.1 Source

corpus.quran.com (Quranic Arabic Corpus by Kais Dukes) — no public API available.

### 2.2 Approach: One-Time Scrape → Normalized Local Database

- Build a dedicated scraper (separate repo/package, Python or Node — Claude Code’s choice based on best scraping ergonomics, likely Python + BeautifulSoup/Playwright for JS-rendered pages).
- Scrape systematically per Surah → Ayah → Word, capturing:
  - Arabic word text (uthmani + simple script if available)
  - Root (triliteral root)
  - Lemma
  - Part-of-speech tag
  - Morphological segmentation (prefixes/stems/suffixes)
  - Grammatical features (case, mood, person, gender, number, etc.)
  - Word-by-word gloss/translation
- Respect robots.txt and rate-limit aggressively (e.g., 1 request per 1-2 seconds) to avoid hammering the source site. Run as a background batch job, resumable/checkpointed (store progress so it can be paused/resumed without re-scraping completed Surahs).
- Store raw scraped HTML/JSON snapshots in addition to parsed data, so re-parsing doesn’t require re-scraping if the schema needs adjustment later.

### 2.3 Supplementary Data Sources

Since corpus.quran.com itself doesn’t provide full verse translations in many target languages:

- **Tanzil Project** (tanzil.net) — Quran text (multiple script styles) + verified translations in many languages including Russian; commonly used as a clean, open dataset.
- **QuranEnc.com** — translations including Uzbek, Russian, and many other languages, designed for programmatic/API consumption.
- Cross-reference scraped corpus.quran.com morphology data with Tanzil/QuranEnc translation sets via Surah:Ayah:Word indexing (the standard Quranic addressing scheme makes this straightforward — every dataset uses Surah/Ayah numbering as the join key).

### 2.4 Audio

- Use an open audio CDN (e.g., EveryAyah.com or similar widely-used Quran audio repositories) for per-ayah and per-word recitation files, referenced by URL — not necessarily mirrored locally initially, but architecture should allow caching/self-hosting later.

### 2.5 Data Storage Format

- Normalize everything into a relational schema (see Section 5) in SQLite (via Turso/libSQL for easy embedded + remote-replica capability).
- Export a versioned “data package” (SQLite file or seed scripts) that can be:
  - Bundled with the web app
  - Shipped to the future native mobile app (as a bundled local DB, enabling fully offline use)
  - Synced via Turso embedded replicas for future updates

-----

## 3. Target Users & Use Cases

- Arabic learners studying word-by-word grammar and morphology
- Quran readers wanting translations in their native language (English, Uzbek, Russian, with room for more)
- Mobile-first users (majority of Quran app usage is on phones)
- Users wanting offline access (PWA installable, works without connection)

### Core User Flows

1. Browse Surah list → select Surah → read Ayah-by-Ayah with Arabic + translation
1. Tap/long-press any word → see word-by-word morphology breakdown (root, lemma, POS, grammar, translation) in a beautiful bottom-sheet/popover
1. Switch interface + translation language (English / Uzbek / Russian / extensible)
1. Play audio recitation per Ayah (and optionally per word)
1. Search (by Surah/Ayah number initially; text search as stretch goal)
1. Bookmark/last-read position (local storage, no account needed for v1)
1. Install as PWA, use offline

-----

## 4. Design & UX Requirements

**The product must NOT look like generic AI-generated UI.** This is a primary success criterion.

### 4.1 Design Process

- Use a **UI/UX design plugin** (Figma-based or equivalent) for mockups before implementation — design first, code second.
- Apply the **Emil Kowalski design/animation skill** for interaction details, micro-animations, and motion design principles (Vaul-style bottom sheets, smooth transitions, easing curves, optimistic UI feel).
- Pull layout/component inspiration from curated **21st.dev** templates/components — adapt, don’t copy verbatim; ensure originality in final composition.
- Animations should be purposeful and abundant but performant: page transitions, word-tap morphology reveal, language switcher, ayah highlight-on-scroll/audio sync, skeleton loading states, micro-interactions on buttons/toggles.

### 4.2 Visual Direction

- Distinctive typography: a proper Arabic typeface (e.g., Amiri, Lateef, or Noto Naskh Arabic / KFGQPC fonts for Uthmani script) paired with a refined Latin typeface for translations/UI — avoid default system fonts.
- Custom color system reflecting a calm, focused “reading” aesthetic (avoid generic purple-gradient SaaS look). Consider warm paper tones for light mode and deep, low-contrast dark mode optimized for night reading.
- RTL/LTR mixed-layout handling done elegantly (Arabic RTL blocks within an LTR app shell, and full RTL shell when interface language itself is Arabic-compatible in future).
- Mobile-first responsive breakpoints; tablet/desktop are enhanced layouts, not afterthoughts.

### 4.3 Accessibility

- WCAG AA minimum: color contrast, font scaling, screen-reader labels for Arabic + translation content, focus states for keyboard nav (desktop).

-----

## 5. Technical Architecture

### 5.1 Stack

- **Framework**: Next.js (App Router), TypeScript
- **Styling**: Tailwind CSS
- **Database**: SQLite via Turso/libSQL — embedded for self-hosted simplicity, with optional embedded-replica sync model that maps cleanly to future mobile app’s local-first storage
- **PWA**: next-pwa or native Next.js PWA setup — service worker, offline caching, installable manifest, app icons
- **Animation**: Framer Motion (pairs well with Emil Kowalski-style interaction patterns)
- **Hosting**: Self-hosted on existing Proxmox homelab (Docker container, behind existing Caddy reverse proxy + Cloudflare Tunnel setup)

### 5.2 Data Schema (high-level)

- `surahs` (id, name_arabic, name_translit, name_translation, revelation_type, ayah_count, order)
- `ayahs` (id, surah_id, ayah_number, text_uthmani, text_simple, juz, page, audio_url)
- `words` (id, ayah_id, position, text_arabic, transliteration, root, lemma, pos_tag, morphology_json)
- `translations` (id, ayah_id, language_code, translator, text)
- `word_glosses` (id, word_id, language_code, gloss_text)
- `languages` (code, name_native, name_english, direction)

This schema is normalized and source-agnostic — both web and future mobile app query the same shape regardless of whether data came from corpus.quran.com, Tanzil, or QuranEnc.

### 5.3 i18n

- next-intl or similar for UI string localization (English, Uzbek, Russian initially)
- Translation content (Quran translations) stored in DB per `language_code`, decoupled from UI locale — a user could read UI in English while viewing a Russian Quran translation
- Architecture must allow adding new languages by inserting rows, no code changes required for new translation languages (only UI locale strings need code-level additions)

### 5.4 Scalability Considerations

- Static generation (SSG/ISR) for Surah/Ayah pages — content is immutable, perfect for pre-rendering
- CDN-friendly asset delivery for fonts/audio
- Database read-replica pattern (Turso embedded replicas) allows the same data file to scale to edge locations or be bundled into the mobile app without server dependency
- API routes designed RESTfully/typed (tRPC or typed REST) so the future mobile app can either reuse the same API or ship the bundled SQLite directly for fully offline operation

-----

## 6. Engineering Process & Quality Standards

### 6.1 Principles

Strict adherence to:

- **DRY** (Don’t Repeat Yourself)
- **SOLID** principles for all service/business-logic layers
- **OWASP Top 10** — input validation, output encoding (especially for any user-generated content like bookmarks/notes if added later), secure headers, dependency auditing, no secrets in client bundle

### 6.2 Claude Code Workflow

Every feature/PR must follow this cycle:

1. **Implement** — write code per spec
1. **Code Review** — self-review against DRY/SOLID/OWASP and project conventions
1. **Quality Review** — run linting, type-checking, tests
1. **Final Review** — re-review after fixes, confirm nothing regressed

### 6.3 Greptile Quality Gate

- Run Greptile code review on every meaningful change.
- **Hard gate: any score below 4/5 must be fixed before merge/proceeding.** No exceptions — iterate until threshold is met.

### 6.4 Testing

- Unit tests for data access layer and morphology parsing logic
- Component tests for key interactive UI (word popover, language switcher, audio player)
- E2E smoke test (Playwright) for core reading flow on mobile viewport

-----

## 7. Future / Phase 2 Considerations (not in scope now, but architecture must not block)

- Native mobile app (React Native or similar) consuming the same bundled SQLite/Turso data
- Additional translation languages via data insertion only
- Full-text search across translations and morphology
- User accounts, bookmarks sync, reading plans, notes
- Self-hosted audio mirroring for offline word-level audio
- Tafsir (commentary) integration

-----

## 8. Open Questions / Assumptions to Validate During Build

- Confirm corpus.quran.com’s terms of use / robots.txt allow scraping for this purpose (personal/educational self-hosted project)
- Confirm licensing terms for Tanzil and QuranEnc translation datasets (most are free for non-commercial use with attribution — attribution requirements must be surfaced in app’s About/Credits section)
- Verify Uzbek translation availability/quality on QuranEnc vs. other sources