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

Run on a physical Android device, on a `preview` profile APK built at `7d5f7b3`
or later. Older builds fail these for the wrong reasons: before `8e23d80` there
is no Dictionary → Browse search box at all (check 34), and before `7d5f7b3`
there is no clear button and no lemma paging (checks 34 and 42), and typing in
Browse leaves the alphabet grid covering the results, so nothing is visible
until the keyboard is dismissed (check 34). Confirm the EAS upload is ~36–43 MB
— a ~5 MB upload means `.easignore` dropped the bundled DB and every check
below fails for the wrong reason. Run these alongside M3's outstanding checks (F5, F6, check 27 and
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
34. Dictionary → Browse. The full root list is there with no letter tap. Type
    `ارض` — the stored `أرض` comes back (hamza seats fold). Type `to say` — the
    meaning search finds قول. Tap ق: the list narrows and the ق cell is visibly
    marked; tap it again and the list is whole. **Keep typing after the first
    letter** — if the keyboard closes or the caret jumps, the search box has
    ended up inside the list header. Typing also **hides the alphabet grid**, so
    the first result is visible without dismissing the keyboard, and an ✕
    appears inside the box — tap it and the whole list is back. Tap ق first,
    *then* type `to say`: قول comes back even though it is not under ق, and
    clearing the box puts you back in ق.
35. Dictionary → Most used. Roots, Lemmas and Verbs each load a different ranked
    list, numbered from 1, under a #/Form/Count header. Scroll past row 200 —
    the list keeps going. Tap a verb row: it opens a lemma screen, not a dead
    end. Then tap Next: you move down the **verb** ranking, not the lemma one.
    The tab above these lists reads **Most used**, not "Frequent".
36. Root screen for قول. The header is centred: three letter pills, "1722
    occurrences", Previous/Next. Tap Next twice, then Previous twice — you land
    back on قول. On the first and last root of the alphabet the arrow is dimmed
    and does nothing rather than disappearing.
37. Airplane mode: repeat 29, 31, 34, 36, 39, 40 and 41. All of it is local — the
    paged concordance loading that used to be check 36's own concern now lives
    in the occurrence rows those two exercise.
38. Repeat 29, 39 and 40 in dark mode and at maximum system font size. Nothing
    clips and the form chip and occurrence pill colours are still legible —
    check 36 no longer carries a snippet highlight of its own to repeat.
39. Same screen: the derived-form chips wrap over several lines and do not
    stretch across the row. Tap one — the chip fills with its own colour, the
    heading recounts (`Concordance (N)` matches the rows below) and the rows
    fade while the new ones load — **the screen does not jump to the top**.
    Scroll a few rows down before tapping a chip: you stay where you were. Tap
    it again for the whole list back. Then tap Next:
    the new root opens with **no chip selected**.
40. Any occurrence row: it reads `2:3:6` (three parts), carries the form's
    transliteration in a coloured pill, the word's transliteration and its
    translation. Tap **Show full verse** — the whole ayah appears and the button
    reads Show less; the row itself still opens the reader. With TalkBack on,
    the toggle is reachable as its own control.
41. Lemma screen for قَالَ: transliteration, a single sense chip (Verb) carrying
    **no** count — with one sense the count would only repeat the occurrence
    line above it — TRANSLATED AS with a ⓘ that opens a sheet, and the root
    definition in a card with its credit. For the counted case open مَا from
    Most used → Lemmas: six sense chips, each with its own count. Back on
    قَالَ, a long Lane definition is clamped to six lines with **Show more**;
    tapping it reveals the rest and the button becomes Show less. Repeat in dark
    mode at maximum system font size — nothing clips.
42. Lemma screen reached from Most used → Lemmas: Previous/Next page down the
    ranking, and the arrows are dimmed and inert at rank 1. Open the same lemma
    from a link inside another screen (View root, then back) — with no ranking
    to page through, both arrows are dimmed rather than missing.
43. Repeat 34 and 42 in dark mode at maximum system font size, and once in
    airplane mode. Nothing clips, the ✕ stays inside the search box, and the
    paging still works — all of it is local.

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
`docs/plans/phase-m3-morphology-mvp.md`, and checks 28-33 go in that of
`docs/plans/phase-m4-dictionary-search.md`. Checks 34-41 were rewritten by M5
and go in the Verification Log of `docs/plans/phase-m5-dictionary-parity.md` —
the M4 plan's log still describes the versions of 34-38 that only checked a
screen opened.
