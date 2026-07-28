# Quran Corpus Android App

Android-first native mobile app for the Quran Corpus experience, built with React Native and Expo. The structure keeps the app portable to iOS while prioritizing Play Store delivery first.

## Workspace

- `apps/mobile` - Expo React Native app.
- `packages/data` - shared corpus schema and query helpers.
- `packages/mobile-data` - Expo SQLite adapter and bundled DB generation.
- `packages/config` - shared TypeScript, lint, and formatting config.
- `docs/PRD-android-first-mobile-app.md` - product requirements.
- `docs/plans/phase-m0-mobile-technical-spike.md` - M0 implementation plan.

## Commands

```bash
pnpm install
pnpm test
pnpm type-check
pnpm lint
pnpm build
pnpm android
```

## Current Status

M0 contains an Expo Android app scaffold with a bundled SQLite fixture DB, Hafs font loading, English/Uzbek/Russian translation switching, word detail interaction, and a thin audio endpoint contract for streamed ayah recitation.
