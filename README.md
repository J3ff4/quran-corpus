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
4. Tap a word. The sheet rises from the bottom on an even timing curve and
   stops dead — no spring, no bounce, no overshoot past its resting height.
   This is the check that closes F4, so a bounce here is a FAIL.
5. Drag the sheet slowly down a short way — less than a quarter of its height —
   and let go: it settles back without bouncing. Drag it slowly past a quarter,
   or flick it down fast from anywhere — it dismisses.
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
    coloured per segment and every letter is still joined to its neighbour --
    compare it against the same word in the ayah above. A letter drawn in its
    isolated or final form mid-word is a FAIL. Then tap a word whose stem starts
    with a hamza-alef (2:22 ٱلْأَرْضَ): the لأ must be a single ligature, not a lam
    with a separate alef beside it.
22. Settings → Arabic size → Small, then Extra large. The reader Arabic, the
    basmala banner, the sheet hero and the root screen all change; the UI text
    does not.
23. Reader header. Tap the globe. The language sheet slides up; pick a different
    language and it closes on its own, with the translations underneath already
    changed. Reopen it: backdrop tap dismisses, Android back dismisses, drag
    down past a quarter dismisses. Then tap a word and, with that sheet up, tap
    the globe: the word sheet goes, the language sheet takes its place, and the
    dim briefly lifts between the two — that hand-off flicker is expected, two
    stacked backdrops would be the failure. Repeat with the words button: the
    word sheet closes before the grid opens, so Back returns to a clean reader.
24. There is no fixed language pill row above ayah 1 any more. The first ayah
    sits directly under the surah heading.
25. Scroll down slowly until the big surah heading leaves the screen. The surah
    name fades up into the header bar as you go, tracking the finger — it must
    not switch on all at once. Scroll slowly back up: it fades back out over the
    same stretch. Repeat at maximum system font size — the fade must start
    later, not at the top. Then Settings → **Reduce animations: on** and repeat:
    the name steps straight in with no fade and no travel.
26. Settings → **Reduce animations: on**. Open the language sheet: it fades, does
    not slide, and does not drag.
27. Settings → Language → Русский, then open any surah other than 1 and 9. With
    TalkBack on, focus the basmala banner: it is announced in Russian, not as
    "Bismillah".

## M4 Dictionary + Search Smoke Test

Run on a physical Android device, on a `preview` profile APK built at `9a47500`
or later — an older build has no `app/lemma/[lemma].tsx`, so check 35's Lemmas
and Verbs rows route nowhere. Confirm the EAS upload is ~43 MB — a ~5 MB upload
means `.easignore` dropped the bundled DB and every check below fails for the
wrong reason. Run these alongside M3's outstanding checks (F5, F6, check 27 and
the M2 rosette carry-over).

28. Tab bar reads Home · Read · Morphology · Dictionary · Menu. Menu opens
    Bookmarks, Settings and About & credits, and all three open.
29. Reader header → magnifier. Type `2:255`. A "Go to" row appears above the
    verse hits; tapping it opens al-Baqarah at 255.
30. Type `Al-Baqarah 255`, then an Arabic surah name. Both jump the same way.
31. Settings → Language → Русский. Search a Russian word. Each ayah appears
    **once**, and its wording matches what the reader shows for that ayah.
    Four copies of one verse is the defect this phase fixed.
32. Search an Arabic word. Matched words are tinted inside each snippet, and no
    box glyph or stray control character is visible.
33. Search nonsense. "Nothing found" — not a spinner that never stops, and not
    "Unable to search", which means FTS5 is missing from the build.
34. Dictionary → Browse. Tap ق. The list shows that letter's roots; tap one and
    the root screen opens.
35. Dictionary → Frequent. Roots, Lemmas and Verbs each load a different list.
    Tap a verb row: it opens a lemma screen, not a dead end.
36. Root screen for a common root (قول). Scroll: occurrences keep loading, the
    same verse never appears twice, and the header scrolls with the list rather
    than fighting it. The matched word in each snippet must be **bold in the
    Hafs face** — same glyph shapes as the words around it, only heavier. If it
    turns into system sans, Android is not synthesising a weight for a
    single-variant family and the non-colour signal has to become a size bump.
37. Airplane mode: repeat 29, 31, 34 and 36. All of it is local.
38. Repeat 29 and 36 in dark mode and at maximum system font size. Nothing
    clips and the snippet highlight is still legible.

## Current Status

M0-M2 are complete. M3 (morphology) is implemented on `feat/m3-morphology`: an offline reader over a bundled SQLite DB, per-segment coloured word morphology behind a bottom sheet, word-detail and root screens, a word-by-word grid, and Hafs font loading with English/Uzbek/Russian translations. M3b then fixed the defects found on the first two device runs — sheet spring, basmala placement, navigation headers, the word-by-word screen's chrome, a four-step Arabic size setting and an in-app reduce-animations switch.

CI has no Android emulator, so the smoke checklists above are the only gate
this app has. Run 1 passed all 22 checks on 2026-08-17 with one finding (the
word sheet's spring). M3c removed that spring, collapsed the reader's fixed
language band into a header sheet, put the surah name in the header on scroll,
and localised the basmala label; Run 2 on 2026-08-18 cleared ten of the twelve
checks those commits touched, left two unexercised, and found the header title
popping in and the sheet's coloured word coming apart at its segment
boundaries. Both are now fixed, but neither has been seen on
hardware: Run 3 is still owed, and it is now folded into M4's build.

M4 (dictionary + search) is implemented on the same branch: five tabs with
Bookmarks and Settings behind a Menu, offline FTS5 verse search with a `2:255`
"Go to" row, translation search filtered to one language so an ayah appears once,
dictionary browse by hijāʾī letter, frequency lists for roots/lemmas/verbs, and
paged concordances on the root and lemma screens. **None of it has run on a
device.** One build clears both: checks 1-27 (F5, F6 and check 27 outstanding)
plus the M2 rosette carry-over go in the Verification Log of
`docs/plans/phase-m3-morphology-mvp.md`, and checks 28-38 go in that of
`docs/plans/phase-m4-dictionary-search.md`.
