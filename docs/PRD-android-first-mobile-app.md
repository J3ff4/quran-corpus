# PRD: Quran Corpus Native Mobile App

> Status: Draft for review.
> Source repo inspected: `quran-corpus-pwa` on 2026-07-27.
> Scope: Android first, scalable to iOS.
> Related source docs: `CLAUDE.md`, `PRD-quran-corpus-pwa.md`, `STATUS.md`, `docs/plans/*`.
> Product decisions recorded: full native app; React Native + Expo; first launch works offline; English + Uzbek + Russian UI/content; audio streams only; Play Store target; local-only user data; bundled DB first; versioned REST API later; treebank post-v1; Abdul Rashid Sufi via thin audio endpoint.

## 1. Context

The current product is a mobile-first Quranic Corpus PWA built in a monorepo:

- `apps/web`: Next.js App Router PWA.
- `packages/data`: shared SQLite/libSQL schema, migrations, query functions, text utilities, morphology decoding, search queries.
- `packages/scraper`: data acquisition tooling.

The web app already includes Quran reading, word-by-word morphology, dictionary/root pages, concordance tools, search API, bookmarks, per-ayah audio, offline fallback, PWA manifest, and a service worker.

The native mobile app should not become a separate product with duplicated domain logic. It should reuse the same corpus data model, query semantics, source attribution rules, and design language.

## 2. Problem

The PWA is mobile-first and installable, but Android users still do not get a fully native app experience:

- Play Store discoverability and trust are missing.
- Offline behavior is limited by browser/service-worker constraints.
- Audio, storage, downloads, sharing, notifications, and future background work are easier to control natively.
- A future iOS app should not require a second rewrite.

## 3. Goals

1. Ship an Android app that faithfully carries the Quranic Corpus experience into a native mobile shell.
2. Preserve the app's differentiator: morphology, grammar, roots, dictionary, concordance, and search, not just Quran reading.
3. Reuse `packages/data` concepts and avoid diverging schemas or query behavior.
4. Make the app local-first for core text, morphology, dictionary, and translations.
5. Keep the architecture ready for iOS with minimal platform-specific business logic.
6. Preserve the current visual direction: warm paper light mode, low-contrast night mode, high-quality Arabic typography, refined RTL/LTR handling, purposeful motion, and WCAG AA accessibility.

## 4. Non-Goals For First Android Release

These are not rejected forever; they are excluded from the first native release unless product direction changes:

- User accounts, cloud sync, or auth.
- Community features.
- Tafsir/commentary.
- Treebank graph editing.
- Treebank viewing in v1. Treebank does not exist in the current web app; add it to native after web/data support exists.
- Public API launch.
- Per-word audio, unless an approved source and data model are confirmed.
- Offline audio downloads.
- Background/lock-screen audio controls, unless later required for Play Store v1.
- Live scraping or mutation of source corpus data from the mobile app.

## 5. Target Users

- Quranic Arabic learners who need word-by-word grammar and morphology.
- Readers who want translations alongside the Arabic text.
- Users studying roots, derived forms, concordance, and dictionary entries.
- Mobile-first users who need offline reading and lookup.
- Later: users on iOS using the same product model.

Decision: v1 stays focused on faithful corpus lookup, reading, morphology, dictionary, and search. A distinct beginner-learning journey is post-v1.

## 6. Android V1 Product Scope

### 6.1 App Shell

- Native bottom navigation for main areas:
  - Home / Continue.
  - Surahs.
  - Search.
  - Dictionary.
  - Bookmarks.
- Drawer or settings screen for:
  - About/Credits.
  - Theme.
  - Language/translation settings.
  - Data/offline storage.
- Deep links for:
  - `surah/{id}`.
  - `surah/{id}/ayah/{ayah}`.
  - `surah/{id}/words`.
  - `word/{surah}:{ayah}:{position}`.
  - `dictionary/{root}`.

Decision: support Android App Links that mirror canonical web paths, with an internal route mapper in the native app. Use a custom scheme only as a fallback for internal/testing flows. This keeps shared links human-readable, SEO-compatible, and future iOS-compatible through Universal Links.

### 6.2 Reader

- Browse all surahs.
- Open a surah and read ayah-by-ayah.
- Show Arabic Uthmani text, surah header, Bismillah where applicable, sajdah marks, ayah medallions, and selected translation.
- Continue reading from local reading history.
- Bookmark ayahs locally.
- Share ayah text with attribution.
- Jump to surah/ayah.
- Light/dark theme.

Android v1 ships English, Uzbek, and Russian UI and content, subject to final license/source approval. The architecture must make adding future UI locales and DB content languages data/config driven where possible.

### 6.3 Word-By-Word Morphology

- Surah word-by-word view.
- Toggle between compact/card and list-like word analysis presentation if that distinction remains useful on native.
- Tap word to open a native bottom sheet with:
  - Arabic word.
  - Transliteration.
  - Gloss.
  - POS summary.
  - Root/lemma.
  - Segment pills.
  - Link to full analysis.
  - Link to dictionary root where present.
- Full word detail screen with:
  - Complete morphology description.
  - Arabic grammar label.
  - Segment details.
  - Root, lemma, Buckwalter values where useful.
  - Concept tags if present.

Decision: hide Buckwalter values from default views. Show them only behind an advanced/details affordance where they help serious corpus users.

### 6.4 Dictionary

- Browse roots alphabetically using Arabic letter groups.
- Browse roots by frequency.
- Search by Arabic root, Buckwalter root, transliteration, or meaning where indexed.
- Root detail page:
  - Root Arabic + Buckwalter.
  - Occurrence count.
  - Lane definition where available.
  - Derived forms grouped by POS/form.
  - Concordance list with ayah references and links back to word detail.
- Verb concordance.
- Lemma frequency.

Decision: Dictionary is a primary bottom-nav destination in v1 because roots/concordance are core to the product's non-commodity value.

### 6.5 Search

- Match the current web search scope: verse references/surah names, Arabic verse text, translations through FTS, Uzbek Latin-to-Cyrillic fallback, and root search.
- Search results link to ayah and dictionary where applicable.
- Support offline search over the bundled/local DB.

### 6.6 Audio

- Per-ayah audio playback.
- Play/pause from ayah row.
- Optional continuous playback for a surah.
- Audio streams only in v1. No offline download/cache requirement.
- V1 reciter: Abdul Rashid Sufi.
- Audio delivery: app calls our own thin audio endpoint. The endpoint resolves ayah-level stream URLs using Quranic Universal Audio/QuranicAudio metadata and returns stable app-facing URLs or redirects. The mobile app must not depend directly on QuranClip's preview API.

### 6.7 Offline

- Core corpus DB available offline:
  - Surahs.
  - Ayahs.
  - Words.
  - Morphology.
  - Word segments.
  - Glosses.
  - Translations selected for v1.
  - Dictionary/root/concordance data.
  - Search index.
- Audio streams online only. No offline audio in Android v1.
- App should expose data version and update status.

The corpus DB must be bundled or otherwise available on first launch with no network dependency. The app must open to usable core reading/morphology/dictionary/search features offline immediately after install.

### 6.8 About, Credits, Legal

- Show source attribution for corpus.quran.com, Tanzil/QuranEnc, Lane's Lexicon, fonts, and any audio/translations used.
- Show licenses and provenance notes required by each dataset.
- Show app version and corpus data version.

Decision: user signs off on UI translations. Dataset/font/audio/source attribution still requires source/license review before Play Store release.

## 7. Recommended Tech Stack

### Recommendation: React Native + Expo Development Build

Use React Native with Expo development builds, TypeScript, and a native SQLite layer.

Rationale:

- The team already has React/TypeScript code and UI concepts.
- The future iOS app can share most screens, state, navigation, API/data models, and tests.
- Expo development builds allow native modules without giving up managed build ergonomics.
- Native SQLite support fits the existing `packages/data` schema direction.
- Android can ship first while keeping iOS as a build target, not a separate project.

Suggested stack:

- App: React Native + Expo SDK.
- Language: TypeScript.
- Navigation: React Navigation or Expo Router.
- Local DB: SQLite via `expo-sqlite` or a stronger JSI SQLite package after spike.
- Remote sync/API: typed REST client generated from OpenAPI once backend API exists.
- State/query cache: TanStack Query for server/update flows; direct repository layer for local DB reads.
- Local settings: MMKV or platform secure/simple storage depending on sensitivity.
- Audio: `expo-audio`/Expo AV replacement path, validated against current Expo SDK.
- Gestures/sheets: React Native Gesture Handler + Reanimated + bottom sheet library.
- Tests: Jest/Vitest-compatible shared pure tests, React Native Testing Library, Detox or Maestro for Android smoke flows.
- Build/distribution: EAS Build for Android first; keep iOS config present but not release-blocking.
- Crash/analytics: Sentry for React Native/Expo crash reporting; PostHog React Native for explicit privacy-safe analytics with autocapture/session replay disabled by default.

Decision: React Native + Expo is approved for Android v1, with iOS kept as a supported future target.

## 8. System Design

### 8.1 Monorepo Layout

Add:

```text
apps/mobile/
  app or src/
  assets/
  android/
  ios/              # generated/maintained when iOS work starts
  package.json
  app.json
```

Keep:

```text
packages/data/      # schema, migrations, query contracts, pure text/morphology utilities
packages/config/    # shared TS/ESLint/Prettier config
packages/scraper/   # source data generation
```

Likely add:

```text
packages/mobile-data/
```

Only if needed to adapt `packages/data` query contracts to the selected mobile SQLite driver. Keep adapter code thin and platform-specific; keep corpus semantics in `packages/data`.

Decision: start with a thin `packages/mobile-data` adapter during M0. Refactor `packages/data` toward more driver-agnostic repositories only where the adapter proves duplication or query drift.

### 8.2 Data Architecture

Recommended layers:

1. Source datasets are scraped/imported by `packages/scraper`.
2. Normalized SQLite DB is built by `packages/data`.
3. Mobile release artifact includes a signed/versioned DB asset so first launch works offline.
4. On device, the app opens a local SQLite DB read-only for bundled data and uses a small writable DB/table set for user data.
5. User data remains separate from corpus data:
   - bookmarks.
   - reading history.
   - settings.

Decisions:
- Android v1 treats the corpus DB as immutable bundled data. App releases can replace it.
- No in-place corpus DB migrations on device for v1.
- No user-data export/import in v1.
- Signed DB update downloads are post-v1.

### 8.3 API Strategy

Short term:

- Android reads local DB for core corpus features.
- Existing web APIs remain web-only unless needed for update checks/search telemetry.

Medium term:

- Build the planned typed REST + OpenAPI backend.
- Mobile uses it for:
  - DB/data version checks.
  - optional corpus DB download.
  - thin ayah-audio URL resolution/redirects.
  - future public API features.
  - future account/cloud sync, if approved.

Android v1 ships from bundled DB first and must not depend on a backend for first-run core use. Core text, morphology, dictionary, and search work from the embedded/local DB without network. A versioned REST/OpenAPI API can be introduced later without blocking v1.

Audio exception: streaming audio requires network and uses the thin audio endpoint. Offline app functionality does not depend on audio availability.

### 8.4 Sync And Updates

Recommended v1:

- No account sync.
- Local-only bookmarks/history/settings.
- App checks for corpus DB version when online.
- If a newer DB exists, prompt or silently download depending on size and product decision.

Decisions:
- V1 data updates are tied to app releases.
- Current expected bundled DB size is under 100 MB. Technical spike must measure final AAB/install impact before Play Store release.

### 8.5 Thin Audio Endpoint

Purpose:

- Give the mobile app one stable app-owned audio contract.
- Hide upstream source details and allow source changes without mobile releases.
- Support Abdul Rashid Sufi ayah-level streaming through QUA/QuranicAudio metadata.

Initial contract:

```text
GET /api/v1/audio/ayah?reciter=abdul-rashid-sufi&surah=1&ayah=1
```

Response options:

- `302` redirect to a signed/canonical upstream MP3 URL, preferred if no app metadata is needed.
- JSON `{ url, duration_ms, source, attribution }`, preferred if the app needs duration and attribution before playback.

Requirements:

- Validate `surah` and `ayah` ranges.
- Default reciter is Abdul Rashid Sufi.
- Return cacheable responses for immutable audio metadata.
- Do not proxy audio bytes unless CORS, reliability, or upstream stability requires it.
- Preserve source attribution for QuranicAudio/QUA in the About/Credits screen.
- Fail gracefully: if audio endpoint is unavailable, reading and offline corpus features still work.

### 8.6 Security

- Treat all local DB and remote responses as untrusted at boundaries.
- Validate route/deep-link params.
- Do not ship secrets in the app bundle.
- Use HTTPS only.
- If downloading DB files, verify checksum/signature before replacing local data.
- Keep source attribution accessible offline.
- Use Play Integrity only if abuse/fraud requirements exist later.

Decision: use Sentry for React Native/Expo crash reporting and PostHog React Native for explicit privacy-safe product analytics. Disable autocapture/session replay by default; capture only named events that do not include Quran text, search text, personal notes, or raw user input.

### 8.7 Performance

Targets:

- Cold launch to usable home screen: target to define after prototype.
- Surah open should feel instant from local DB for typical surahs.
- Long surahs must virtualize ayah/word lists.
- Arabic text and word-by-word layouts must avoid reflow jumps after font load.
- 60fps sheet transitions and navigation on target low/mid Android devices.

Recommendation: set `minSdkVersion` to Android 8.0 / API 26, target the current Google Play requirement at release time, and test on low/mid Android devices with 3-4 GB RAM. As of August 31, 2026, Google Play requires new apps and updates to target Android 16 / API 36 or higher.

Initial v1 budgets:
- Cold launch to interactive home: <= 2.5s on target mid device.
- Open typical surah from local DB: <= 300ms after tap.
- Search response for common query: <= 500ms local DB time.
- Long-surah scroll: no visible blank rows; maintain 60fps target during normal scroll.
- Bundled DB: expected < 100 MB; M0 must measure final Play Store AAB/install impact.

### 8.8 Accessibility And Internationalization

- WCAG AA target.
- Dynamic type support.
- Screen-reader labels for Arabic text, ayah controls, audio controls, bookmarks, and morphology actions.
- Respect reduced motion.
- UI locale and content language remain separate.
- RTL/LTR mixed text tested in Arabic, English, Uzbek, and Russian flows if those languages ship.

Decision: Android v1 UI locales are English, Uzbek, and Russian. Locale infrastructure must be scalable for additional UI languages.

## 9. Design Direction

Use the current PWA's design constraints as binding unless changed:

- No generic Quran reader look.
- Warm paper light mode.
- Low-contrast night dark mode.
- Uthmani Arabic face plus refined Latin typography.
- Touch-native bottom sheets for word morphology and search.
- Dense but calm study UI; avoid marketing-page patterns.
- Motion should clarify hierarchy and state, not decorate.

Decision: adapt to Android-native interaction patterns while keeping the same Quran Corpus brand.

Decision: create fresh Android mobile mockups before implementation. They should adapt from the PWA brand rather than copy web layouts one-to-one.

## 10. Milestones

### Phase M0: Mobile Technical Spike

Status: implementation complete; Android emulator/device smoke verification pending.

- Create `apps/mobile` prototype.
- Prove Android build.
- Prove Arabic font rendering.
- Prove local SQLite open/query against a representative corpus DB.
- Prove one surah reader screen and one word detail bottom sheet.
- Measure app size and launch time.

Exit criteria:

- Runs on Android emulator and one real device.
- Reads real data from local DB.
- No duplicated schema.
- Clear recommendation on SQLite driver and DB packaging.

### Phase M1: Android Reader MVP

Status: in progress.

- Surah list.
- Surah reader.
- English, Uzbek, and Russian translation display.
- Bookmarks.
- Reading history.
- Theme.
- About/Credits.
- Basic ayah audio streaming through our thin audio endpoint, defaulting to Abdul Rashid Sufi.
- Privacy-safe crash reporting and analytics instrumentation.

### Phase M2: Morphology MVP

- Word-by-word view.
- Word bottom sheet.
- Full word detail.
- Root navigation.
- Segment display.

### Phase M3: Dictionary + Search

- Dictionary browse/search.
- Root detail.
- Concordance.
- Lemma frequency.
- Verb concordance.
- Offline search.

### Phase M4: Android Release Hardening

- Accessibility pass.
- Performance pass on target devices.
- Crash/error handling.
- Play Store assets and privacy disclosures.
- Legal/source attribution review.
- Release candidate QA.

### Phase M5: Post-V1 Treebank Readiness

- Track web/data treebank implementation.
- Add native treebank viewer after treebank exists in the shared data layer.
- Validate touch pan/zoom rendering and performance.

### Phase M6: iOS Readiness

- Audit platform-specific code.
- Enable iOS build.
- Validate fonts, SQLite, audio, gestures, and safe-area behavior.
- Create iOS release plan.

Decision: iOS readiness is a separate post-Android phase. Android v1 must avoid architectural choices that block iOS, but iOS build validation is not a Play Store v1 release gate.

## 11. Acceptance Criteria For Android V1

- User can install from an Android release build.
- User can install from the Play Store for public v1 release.
- User can launch the app without network and use core content immediately.
- User can browse surahs and read Arabic + selected English, Uzbek, or Russian translation.
- User can use app offline for core text, morphology, dictionary, and search features included in v1.
- User can tap a word and understand morphology without leaving the reading flow.
- User can navigate from word to root dictionary entry.
- User can bookmark ayahs and resume reading.
- Bookmarks/history/settings are local-only.
- Crash reporting and privacy-safe analytics are configured.
- App exposes source credits and licenses.
- No duplicated corpus schema/query logic beyond approved driver adapters.
- Android implementation leaves a credible path to iOS using the same app codebase.

## 12. Pending User Decisions

1. Final legal/source sign-off owner for dataset, font, and audio attribution.

Resolved:

- Android v1 is a full native app, not a narrow companion.
- Platform is React Native + Expo.
- First launch must work offline for core corpus features via bundled DB.
- UI and content languages are English, Uzbek, and Russian, with scalable locale/content architecture.
- Search scope matches the current web app.
- Audio streams only; no offline audio in v1.
- V1 reciter is Abdul Rashid Sufi.
- Audio streams through our own thin endpoint backed by QUA/QuranicAudio metadata; no direct QuranClip dependency.
- Distribution target is the Google Play Store.
- Deep links mirror web paths through Android App Links; custom scheme only as fallback.
- Design adapts to Android-native patterns while preserving brand.
- Recommended Android support: min Android 8.0 / API 26, target current Play requirement at release.
- Treebank is post-v1.
- User data is local-only for v1.
- Mobile ships from bundled DB first; versioned REST/OpenAPI comes later.
- User signs off on UI translations.
- V1 has no distinct beginner-learning journey.
- Buckwalter is advanced/details-only.
- Dictionary is a primary bottom-nav destination.
- Corpus DB is immutable bundled data in v1; app releases replace it.
- No in-place corpus DB migrations, user-data export/import, or signed DB downloads in v1.
- Fresh Android mockups are required before implementation.
- iOS readiness is post-Android and not a Play Store v1 release gate.
- Crash reporting provider: Sentry for React Native/Expo.
- Product analytics provider: PostHog React Native with autocapture/session replay off by default; capture only explicit privacy-safe events.
- Mobile data access starts with a thin `packages/mobile-data` adapter; deeper `packages/data` refactor only if needed.
- Initial performance budgets are set; M0 measures and verifies them.

## 13. Launch Success Metrics

- Play Store approval without policy rejection.
- Core offline flows work on first launch without network: surah reader, word-by-word morphology, dictionary, and search.
- Crash-free sessions >= 99.5% during the first public release window.
- Cold launch, surah open, search, and long-surah scroll meet the v1 performance budgets on target devices.
- Users can complete the core study flow: open surah -> tap word -> view morphology -> open root dictionary -> return to reading.
- App reviews/support feedback do not show recurring blockers around offline DB, Arabic typography, language switching, or audio streaming.

## 14. Questions For Product Review

1. Who signs off on Arabic typography, dataset attribution, font attribution, and audio attribution?
