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
9. Run `pnpm android`. Audio needs no configuration: with `EXPO_PUBLIC_AUDIO_API_BASE_URL` unset the reader streams the public recitation direct, and setting it routes playback through that endpoint instead.
10. Turn off network and confirm Surahs opens and a surah reader displays Arabic plus the selected translation.
11. Add a bookmark, close the app, reopen it, and confirm the bookmark remains.
12. Open Settings, switch UI locale and content language, and confirm reader labels/content update separately.
13. Turn network on and confirm ayah audio plays.
14. Turn network off again and confirm the reader still works and a Play tap reports that audio is unavailable rather than sitting on Pause.

## M3 Morphology Smoke Test

Run on a physical Android device, on a `preview` profile APK. Confirm the EAS
upload is ~43 MB — a ~5 MB upload means `.easignore` dropped the bundled DB
and every check below will fail for the wrong reason.

1. Open al-Baqarah. Confirm the pause marks (`ۚ ۗ ۖ`) are still visible in
   2:255 — the reader now tokenizes the text and this is what tokenizing the
   word rows instead would have deleted.
2. Open al-Alaq (96). Confirm the basmala still prefixes ayah 1.
3. Open 2:44. Confirm the `۞` marker still leads the ayah.
4. Tap a word. The sheet springs up from the bottom.
5. Drag the sheet halfway down and let go — it springs back. Drag it past
   halfway — it dismisses.
6. Tap the backdrop — it dismisses. Press Android back — it dismisses.
7. Scroll the reader with the sheet open. The scroll must not fight the drag.
8. Settings (in the app) → **Reduce animations: on**. Reopen the sheet: it
   fades, does not slide, and does not drag. Turn it back off without
   restarting the app; the slide returns. Then repeat via the OS setting, which
   must also reduce motion with the in-app switch off: Pixel is Settings →
   Accessibility → Remove animations; Samsung is Settings → Accessibility →
   Visibility enhancements → Remove animations; on a device with neither, use
   Developer options → Animator duration scale → Animation off.
9. Sheet → Full analysis. Segment pills are coloured and legible.
10. Sheet → root link. The root screen shows Arabic, forms and a definition.
11. Tap a word with no root (a pronoun, e.g. 2:255 هُوَ). Confirm there is
    **no** root link rather than a dead one.
12. Reader header → word-by-word. Page forward to the last page of al-Baqarah;
    confirm it ends at 286 and Next is disabled.
13. Morphology tab. Confirm it opens the WbW screen at your last-read position.
14. Repeat 4, 9 and 12 in dark mode. Every POS colour must be legible on the
    warm near-black background.
15. System font size at maximum: repeat 4 and 12. Nothing clips; the sheet
    still scrolls to its actions.
16. Airplane mode: repeat 1, 4 and 12. All of it is local.
17. Open any surah other than 1 and 9. The basmala is its own centred line above
    ayah 1, and does not also appear inside ayah 1's text.
18. Open al-Fatiha. The basmala appears once, as ayah 1 — no banner above it.
    Open at-Tawba (9). No basmala anywhere.
19. From the reader, open a word sheet → Full analysis. Press the header back
    arrow: it returns to the reader. Press Android back from the reader: it
    returns to the surah list, and does not exit the app.
20. Morphology tab. The bottom tab bar stays visible, and the surah name and
    verse pager sit in the one header bar rather than stacking above the grid.
    Android back exits the app from here, and from here only.
21. Tap a multi-segment word (e.g. 2:2 بِٱلْغَيْبِ). The big Arabic in the sheet is
    coloured per segment, joined as one word with no gaps between segments.
22. Settings → Arabic size → Small, then Extra large. The reader Arabic, the
    basmala banner, the sheet hero and the root screen all change; the UI text
    does not.

## Current Status

M0-M2 are complete. M3 (morphology) is implemented on `feat/m3-morphology`: an offline reader over a bundled SQLite DB, per-segment coloured word morphology behind a bottom sheet, word-detail and root screens, a word-by-word grid, and Hafs font loading with English/Uzbek/Russian translations. M3b then fixed the defects found on the first two device runs — sheet spring, basmala placement, navigation headers, the word-by-word screen's chrome, a four-step Arabic size setting and an in-app reduce-animations switch.

CI has no Android emulator, so the M3 smoke checklist above is the only gate this app has. Run 1 of that checklist passed all 22 checks on the owner's device on 2026-08-17; the results, the one finding (the word sheet's spring, removed in `3ad1086` and awaiting a device re-check) and the still-open M2 rosette carry-over are in the Verification Log of `docs/plans/phase-m3-morphology-mvp.md`.
