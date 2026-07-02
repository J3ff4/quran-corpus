# Product Requirements Document: Quranic Corpus Mobile-First PWA (v2)

> **Status:** Active. Supersedes v1 (archived at `docs/PRD-v1-corpus-reader-archived.md`).
> **What changed from v1:** v1 drifted into a generic Quran-reader-with-translations — a commodity. v2 refocuses on the original intent: a faithful, mobile-first port of **corpus.quran.com** itself (word-by-word morphology, grammar, dictionary, treebank), which is desktop-only and has no API. The v1 codebase (phases 01–05: monorepo, `packages/data`, reader UI, translations, audio, PWA) is **kept as the foundation** and re-scoped, not discarded.
> CLAUDE.md governs *how* we build; this PRD governs *what*.

-----

## 1. Overview

### 1.1 Problem
corpus.quran.com (Quranic Arabic Corpus, © Kais Dukes / University of Leeds) is the definitive source for word-by-word Quranic morphology, syntactic grammar, and a root-based dictionary. It is **desktop-only, dated, and has no public API**. Its linguistic depth is inaccessible to the mobile-majority audience and to other developers.

### 1.2 Vision
Reproduce corpus.quran.com's linguistic depth as a **beautiful, fast, mobile-first, installable PWA** — responsive, richly animated, offline-capable — and expose it through a **typed backend API that corpus.quran.com never had**. The data and API layers are designed so a future native mobile app consumes the same backend with a bundled local-first DB.

### 1.3 Non-Goals (v2 near-term)
- No user accounts / auth (read-only public resource; bookmarks/last-read stay device-local).
- No live re-scraping pipeline (one-time scrape; manual re-run only).
- No CMS / content editing (data is scraped/imported, immutable at runtime).
- No fabricated linguistic data — every field traces to a named source (see §3).

-----

## 2. Product Scope & Feature Vision

Four committed pillars, plus a reserved future set. Pillar depth ships across phases (§8).

### 2.1 Word-by-word morphology (core)
Per word, faithfully reproduced from corpus.quran.com:
- Arabic text, transliteration, English gloss.
- Part-of-speech + the **verbatim** human-readable English morphology description (e.g. "prefixed preposition bi + genitive masculine noun") **and** the Arabic grammar label (e.g. جار ومجرور).
- Structured grammar features (POS, gender, number, person, case, mood, state) stored alongside the verbatim strings.
- Segmentation (prefix / stem / suffix segments).
- Root (Arabic + Buckwalter) and lemma, root linking into the dictionary.
- Named-entity / concept tags captured now, shown as non-clickable labels until the ontology phase.
- **Presentation:** tap a word → quick bottom-sheet (root/lemma/POS/gloss); "more" → a dedicated full word-detail route with complete morphology, grammar, and a link into the dictionary.

### 2.2 Quranic Dictionary (core)
- **By-root entry:** root (Arabic + Buckwalter), total occurrence count, derived forms grouped by POS with per-form counts, and a full **concordance** (every occurrence: verse ref + transliterated form + English gloss + full Arabic verse + link to that word's morphology).
- **Curated definitions:** each root enriched with a definition from **Lane's Lexicon** (public domain), imported as an **additive layer** — shown when present, does not gate the dictionary UI.
- **Sibling tools (in scope for the dictionary phase):** **Verb Concordance** (verb forms grouped) and **Lemma Frequency** (frequency ranking by lemma).
- **Navigation:** tap a word's root → its entry; browse all roots alphabetically; browse by frequency; search by root (Arabic/Buckwalter) or meaning.

### 2.3 Syntactic treebank / grammar
- Interactive, **pan/zoom** dependency graph of a verse's grammatical relations (nodes = tokens, edges = labelled relations), adapted for touch. Hardest to make mobile-friendly → sequenced last (§8), begins with a rendering research spike.

### 2.4 Translations, audio, search (first-class supporting)
- **Per-word gloss:** English (scraped) now; Uzbek + Russian per-word glosses **machine-translated from the English gloss, human-reviewed, provenance-tagged** (added in a later phase — schema supports per-language glosses from day one).
- **Full-verse translations:** English, Uzbek, Russian (Tanzil / QuranEnc). Language-agnostic schema → new languages are data-only.
- **Audio:** per-ayah recitation (existing). **Per-word audio is deferred** to a future phase; schema reserves a per-word audio slot.
- **Search:** by surah/ayah number and by root/meaning now; full-text search over translations/morphology later.

### 2.5 Future (named, unscheduled)
Ontology of Quranic concepts · tafsir/commentary · grammar tutorial articles · community features · per-word audio · additional gloss/translation languages. **Architecture and schema must not block these**, but none gets a committed phase number now.

-----

## 3. Data Acquisition & Sources

### 3.1 Primary: scrape corpus.quran.com
- Scrape the site's HTML for **all** corpus data — word-by-word (grammar, gloss, transliteration, concept tags), dictionary root/verb-concordance/lemma-frequency pages, and (its phase) the treebank.
- Rate-limit ~1 req / 1.5 s, respect `robots.txt`, run resumable/checkpointed, and **persist raw HTML snapshots** so re-parsing never requires re-scraping. Raw snapshots are **never** committed to git.
- Parsers are pure functions (HTML string → records) so they are unit-testable without a network.

### 3.2 Ground-truth validation
- The downloaded GPL morphology file (`quranic-corpus-morphology-0.4.txt`) contains the same POS/root/lemma/feature annotations the site renders. It is **retained solely to cross-check the scrape** and catch parsing errors — it is not a user-facing source.

### 3.3 Supplementary datasets
- **Tanzil** — Uthmani Arabic verse text (existing).
- **QuranEnc / Tanzil** — full-verse translations (English/Uzbek/Russian).
- **Lane's Lexicon (public domain)** — curated root definitions, keyed by root, imported as an additive layer.

### 3.4 Generated data (provenance-tagged)
- Uzbek/Russian **per-word glosses** are machine-translated from the English gloss, human-reviewed, and stored with an explicit machine-assisted provenance marker so they are never presented as authoritative source data.

### 3.5 Join model
- All data joins on the standard Surah:Ayah:Word address, source-agnostic. The normalized schema never leaks where a field came from.

-----

## 4. Target Users & Core Flows

**Users:** Arabic/Quranic-grammar learners; readers wanting native-language translation; mobile-first users; offline users; (later) developers consuming the API.

**Core flows:**
1. Browse surahs → open a surah → read ayah-by-ayah (Arabic + translation).
2. Tap a word → quick morphology sheet → "more" → full word-detail route.
3. From a word, tap its root → dictionary entry (definition, derived forms, concordance).
4. Explore the dictionary directly (browse alphabetical / by frequency, search, verb concordance, lemma frequency).
5. Switch UI locale and translation language independently.
6. Play per-ayah audio.
7. (Treebank phase) open a verse's interactive dependency graph.
8. Bookmark / last-read (device-local), install as PWA, use offline.

-----

## 5. Design & UX

Governed by CLAUDE.md §8. Summary: **must not look like AI slop.** Distinctive Uthmani Arabic + refined Latin typography; warm-paper light / low-contrast night dark modes; elegant mixed RTL/LTR; purposeful, performant animation (60fps, respect `prefers-reduced-motion`); WCAG AA minimum. Design before code — mockups first, motion detail via the Emil Kowalski skill, anti-slop via the design skills (Hallmark / Impeccable / frontend-design), layout inspiration adapted (never copied) from 21st.dev.

-----

## 6. Technical Architecture

### 6.1 Stack
Next.js (App Router) + TypeScript + Tailwind; SQLite via Turso/libSQL (embedded, replica model → future mobile local-first); Framer Motion; next-intl (UI i18n; translation *content* lives in the DB per `language_code`); scraper in `packages/scraper` (Python). Self-hosted on Proxmox via Docker behind Caddy + Cloudflare Tunnel.

### 6.2 Data layer (`packages/data`)
Single source of truth for schema + queries; web, API, scraper, and future mobile all depend on it. Stays free of Next/web imports (portable).

### 6.3 Schema extensions (source-agnostic; exact DDL per phase plan)
The v1 schema (surahs, ayahs, words, translations, word_glosses, languages) extends with:
- A **roots / dictionary** layer (root, Buckwalter, occurrence count, derived-form groupings) + a **Lane's-definition** layer keyed by root.
- **Structured word-segment + grammar-feature** detail (beyond today's flat POS JSON), plus the **verbatim** morphology description + Arabic grammar label strings.
- **Concept / named-entity tags** per word.
- A **reserved per-word audio URL** column (unused until per-word audio ships).
- **Treebank dependency edges** (its phase).
`word_glosses` already keys on `language_code` → multi-language glosses are data-only.

### 6.4 Offline
Bundle the full text/morphology/dictionary/translations SQLite for **complete offline** reading and lookup (maps to the mobile app's local-first DB). **Audio streams online only** (kept out of the offline bundle for size). Service worker continues cache-on-navigate for shell/assets.

### 6.5 i18n
UI locale (next-intl) decoupled from content language. Adding a translation/gloss language = inserting rows; only UI strings need code changes.

### 6.6 Scalability
SSG/ISR for immutable surah/ayah pages; CDN-friendly fonts/audio; Turso embedded-replica pattern so the same data file scales to edge or bundles into the mobile app without a server dependency.

-----

## 7. Backend API

The differentiator corpus.quran.com lacks.
- **Style:** typed **REST + OpenAPI** — language-agnostic, generates typed clients, works for a React Native app or external consumers.
- **Audience/rollout:** **internal now, architected to be promoted to public later** — versioning seam (`/v1/...`) and clean resource boundaries from the start, so opening it publicly needs no rewrite.
- **When:** its own later phase (§8). **Phase 1 (word-by-word + dictionary) reads via `packages/data` directly in Server Components** — no HTTP hop yet. The API reuses the same `packages/data` queries (DRY, zero duplication).
- **Resources (initial):** surahs, ayahs, words/morphology, roots/dictionary (+ verb concordance, lemma frequency), translations, glosses, search; treebank when it ships.
- **Security (OWASP):** input validation at every boundary, output encoding, secure headers, no secrets in the client bundle. When promoted to public: API keys, rate limiting/quotas, CORS, abuse controls.

-----

## 8. Roadmap (repo phase numbering continues after 05)

- **Phase 06 — "Phase 1" of the vision:** scraper work to acquire word-by-word + dictionary data (with GPL-file validation) → **word-by-word morphology** (quick sheet + full word-detail route) + **Quranic Dictionary** (by-root entry with concordance; Verb Concordance; Lemma Frequency; browse alphabetical + by frequency; search by root/meaning; Lane's definitions imported as an additive layer).
- **Phase 07 — Search + translation/audio expansion:** global search; full-verse Uzbek/Russian translations surfaced; machine-translated + reviewed Uzbek/Russian **per-word glosses**.
- **Phase 08 — Syntactic treebank:** interactive pan/zoom dependency graph (opens with a mobile-rendering research spike).
- **Phase 09 — Backend API:** internal typed REST + OpenAPI layer over `packages/data`, built for later public promotion.
- **Future (unscheduled):** ontology/concepts, tafsir, grammar articles, community, per-word audio, more languages.

-----

## 9. Engineering Process & Quality

Governed by CLAUDE.md; summarized here for scope.
- **5-step loop** per unit of work: Implement → Code Review → Quality Review (lint/type/test) → **Greptile** → Final Review.
- **Greptile ≥ 4/5 is a hard block** — no merge/next-task below threshold.
- **Planning:** `superpowers` (brainstorming → writing-plans) generates each phase plan, **authored with `/caveman` active** so plans are terse and token-efficient from the first draft (thorough but tight — CLAUDE.md §6). One plan file per phase in `docs/plans/`.
- **Discipline:** ponytail (laziest solution that works) + Karpathy guidelines (no assumptions, surgical changes, verifiable success criteria).
- **Compaction:** mandatory after every completed task **and** after every completed + approved phase (CLAUDE.md §13).
- **Subagents:** Sonnet floor, never Haiku (CLAUDE.md §13).
- **Testing:** unit tests for `packages/data` + scraper parsing; component tests for key interactive UI (word sheet/detail, dictionary, language switcher, audio); Playwright mobile E2E for the core reading flow. New logic ships with tests.
- **Commits:** Conventional Commits, one logical change each, only after the loop passes and Greptile ≥ 4/5.

-----

## 10. Data & Legal Care

- Respect corpus.quran.com `robots.txt`; rate-limit (~1 req / 1–2 s); resumable/checkpointed; persist raw snapshots (never committed).
- Verify licensing before shipping any dataset. corpus.quran.com annotations are **GPL** (attribute © Kais Dukes / Language Research Group, Leeds, with a clear source link). **Lane's Lexicon is public domain.** Tanzil / QuranEnc used unmodified with required attribution. Machine-translated glosses carry a machine-assisted provenance marker.
- Surface all attributions in the in-app About/Credits section, updated as each source ships.

-----

## 11. Resolved Decisions (v2 build)

Recorded so they are not re-litigated:
- Faithful corpus port, not a generic reader; v1 code kept as foundation.
- Scrape the site for all corpus data; GPL file kept only for validation.
- Curated root definitions from Lane's Lexicon (public domain), additive (not a Phase-1 gate).
- Grammar stored verbatim **and** structured. Concept tags captured, non-clickable until ontology phase.
- Uzbek/Russian per-word glosses: machine-translated + reviewed + provenance-tagged (later phase).
- Per-word audio deferred; per-ayah only now.
- Offline: full corpus DB bundled; audio streams online.
- API: typed REST + OpenAPI, internal → publicly promotable, built in Phase 09; Phase 1 uses direct `packages/data` access.
- Dictionary phase includes Verb Concordance + Lemma Frequency.
- Out-of-scope items reserved in a named Future section, no committed phase.
