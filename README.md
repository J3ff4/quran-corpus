# Quran Corpus Android App

Android-first native mobile app for the Quran Corpus experience, built with React Native and Expo. The structure keeps the app portable to iOS while prioritizing Play Store delivery first.

## Workspace

- `apps/mobile` - Expo React Native app.
- `packages/data` - shared corpus schema and query helpers.
- `packages/mobile-data` - Expo SQLite adapter and bundled DB generation.
- `packages/config` - shared TypeScript, lint, and formatting config.
- `docs/PRD-android-first-mobile-app.md` - product requirements.
- `docs/plans/phase-m0-mobile-technical-spike.md` - M0 implementation plan.
- `docs/plans/phase-m1-real-offline-reader.md` - M1 implementation plan.

## Commands

```bash
pnpm install
pnpm test
pnpm type-check
pnpm lint
pnpm build
pnpm android
```

## M1 Android Smoke Test

1. Run `pnpm install`.
2. Confirm the canonical sibling DB exists at `../quran-data/quran.db`.
3. Run `pnpm generate:m1-db` after `docs/data-sources-m1.md` records selected translators. This copies canonical `../quran-data/quran.db` to the ignored mobile asset and overwrites any differing local asset.
4. Run `pnpm test`.
5. Run `pnpm type-check`.
6. Run `pnpm lint`.
7. Run `pnpm build`.
8. Start an Android emulator or connect a physical Android device.
9. Set `EXPO_PUBLIC_AUDIO_API_BASE_URL` if testing audio.
10. Run `pnpm android`.
11. Turn off network and confirm Surahs opens and a surah reader displays Arabic plus the selected translation.
12. Add a bookmark, close the app, reopen it, and confirm the bookmark remains.
13. Open Settings, switch UI locale and content language, and confirm reader labels/content update separately.
14. Turn network on and confirm ayah audio requests use the configured thin endpoint.
15. Turn network off again and confirm reader still works while audio is unavailable.

## Current Status

M1 is in progress on an isolated branch. M0 contains an Expo Android app scaffold with a bundled SQLite fixture DB, Hafs font loading, English/Uzbek/Russian translation switching, word detail interaction, and a thin audio endpoint contract for streamed ayah recitation. Android emulator/device smoke verification remains pending.
