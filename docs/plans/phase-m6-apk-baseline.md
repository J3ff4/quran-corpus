# Phase M6 — APK baseline

M6 was built and verified entirely in **Expo Go**. Expo Go is not the product: it
runs a different JS engine configuration, cannot register a media session, cannot
exercise the release bundle, and never proves the thing a user installs. This file
is the re-run of M6's own checklists against an installed release APK.

**Build:** `quran-corpus-vc92.apk`, versionCode 92, arm64-v8a, release, debug-signed,
built from `main` at `4523324` (S4c merged). Installed with `adb install -r --user 0`.

**Device:** Samsung SM-X820 tablet (`adb-R52XC0AYMZZ`), Android 16, 2800x1752 at
density 320, landscape.

**The device caveat, stated once.** The owner's OnePlus GM1917 is also the display
for the terminal session driving these checks, so the run moved to the tablet. The
tablet is 876dp wide, an **expanded** window class, so S4a's responsive layout is
what renders: three-column browse grids, full-width cards, a centred tab pill. Every
check below is therefore honest about the APK and honest about the tablet. Checks
that assert *behaviour* (data, navigation, persistence, motion, contrast, shaping)
carry over to the phone unchanged. Checks that assert *phone layout* are marked, and
the phone still owes those.

## Method

Motion and timing were measured with the one-frame-per-repeat technique: a screencap
costs ~280ms, so a burst cannot resolve a 220ms animation; firing the action, sleeping
a known fraction, taking one frame and repeating at other delays reconstructs the
curve across repeats. Layout and labels were read from the accessibility tree
(`uiautomator dump`) rather than from pixels wherever the assertion was textual --
exact, and cheap. Contrast figures are WCAG ratios computed from the glyph cores
against the measured surface behind them, not from design tokens.

## Results

| # | Check | Verdict | Evidence |
|---|---|---|---|
| 48 | Fake glass on a real panel, both themes | **PASS** | Both themes. Translucent: card fill tracks the bloom across its width (light: ground varies 24 units, fill 3 = ~12% transmission; dark: fill follows ground almost 1:1). Hairline present (light y=224 rgb(188,205,196) between ground and fill; dark y=224 rgb(70,95,87)). Top highlight present (light 2px pure white y=226-227; dark 3px y=225-227). Not flat - decision 8 gate passes, no expo-blur needed |
| 49 | Scroll a long surah (2, al-Baqarah) top to bottom | **PASS** | 3 fling-scrolls through al-Baqara: 292/316/312 frames, janky 0.34%/0.00%/0.00%, p50 6-7ms, p90 11-13ms, p95 12-15ms. Bloom costs nothing on scroll |
| 50 | Switch theme in Settings with a tab screen open | **PASS** | 8 samples across the Light->Dark transition (0.37-0.47s); bloom, card fill and tab pill always agree - never a mixed frame. Flip is atomic |
| 51 | Tab pill: tap all five tabs | **PASS** | All five tabs land on the right screen; active tab tinted accent. Mushaf hides the bar until chrome is revealed, by design |
| 52 | Any long list, scrolled to the very end | **PASS** | List scrolled to the end: last row bottom y=1478, tab pill top y=1522 - 22dp clearance, nothing hidden |
| 53 | Newsreader renders | **PASS** | Headings render in the serif (bracketed serifs, high stem contrast) against the sans UI face on the same card; no tofu, no mid-screen fallback |
| 54 | Reduced motion on (system setting) | **PASS** | System reduce-motion (all three animation scales = 0), app restarted. Card top edge on press: animations ON 224->228 px, 3/3 repeats (press-scale fires); reduce-motion ON 224->224, 3/3 repeats (does not fire). Clean A/B |
| 55 | Upgrade over the M6a build **without clearing app data** | **PASS** | In-place upgrade vc91 -> vc92 on both devices (adb install -r, no data clear): khatm mark, bookmarks and reading position all survived; Home rendered |
| 56 | Read an ayah, background the app, reopen | **OBSOLETE** | Tests the day-streak counter, which S4c deleted by owner ruling |
| 57 | Read again the next day (or set the device date forward one day) | **OBSOLETE** | Same - streak gone |
| 58 | Skip a day, then read | **OBSOLETE** | Same - streak gone |
| 59 | Open three root screens, return home | **PASS** | Opened 4 new root screens; Roots studied 2 -> 6 and Roots this week 1 -> 5, weekly bar filled for today. Literal "reads 3" assumes a virgin install; the counter increments per distinct root |
| 60 | Ayah of the day | **PASS** | 33:35 today, unchanged across a force-stop + relaunch; tapping it opened Al-Ahzab at Ayah 35. Date-seeded from a 118-entry pool: algorithm predicts 31:34 for 2026-10-03 (matches the phone capture yesterday), 33:35 for today (matches), 33:56 tomorrow - so it does change daily |
| 61 | Switch through all four modes | **PASS** | All four modes render (Surah 3-col grid, Juz, Page, Revealed); switching instant after first load |
| 62 | Juz 2, juz 15, juz 30 | **PASS** | Juz 2 -> Al-Baqara 142-252, reader opened on Ayah 142 under a JUZ 2 marker; Juz 15 -> Al-Isra 1-111 (17:1); Juz 30 -> An-Naba 1-40, reader opened on Ayah 1 under JUZ 30 |
| 63 | Page 1, page 300, page 604 | **PASS** | Page 1 -> Al-Fatiha 1, Page 300 -> Al-Kahf 54, Page 604 -> Al-Ikhlas 1; reader opened on each; all three cross-checked against mushaf_layout in the corpus DB and match |
| 64 | Revealed mode | **PASS** | Revealed: al-Alaq first, MECCAN header reads 86, collapsible chevron present |
| 65 | Translation mode, both themes | **PASS** | Reader translation view, both themes, glass cards over the bloom. Contrast: dark Arabic 8.33:1 / translation 16.15:1; light Arabic 6.06:1 / translation 16.84:1 - all clear AA |
| 66 | Mushaf mode | **SUPERSEDED** | Reader mushaf mode no longer exists - M7d deleted ReaderMode and made the mushaf its own tab. Capability covered by the M7 checks |
| 67 | Kill and reopen the app | **SUPERSEDED** | "Mode last used" referred to translation-vs-mushaf, removed by M7d. The reader's remaining toggle is Translation/Words, and Words is a pushed screen, not a mode |
| 68 | Word-by-word segment of the chip | **PASS** | Words segment pushes the WbW screen (word + gloss, Ayahs 35-44 pager); Back returns to the reader with the Translation/Words segments, in the previous view |
| 69 | Morphology tab | **PASS** | Menu > Morphology reaches the identical WbW screen at the same position - decision 17 both doors hold |
| 70 | Deep link into 16:90 from the concordance | **PASS** | Concordance 16:90:4 opened An-Nahl with Ayah 90 topmost. Frames sampled at 0.08-0.90s after the tap: body ink 0.0-0.7% (empty) throughout, then the settled 16:90 frame at 0.9s - no other ayah is ever rendered first, so no flash-scroll. M5c fix holds |
| 71 | Bookmark and play from a card, both modes | **PASS** | Bookmark on an ayah card flips to "Remove bookmark"; Play starts recitation. Both targets measure exactly 48x48 dp - Material's minimum |
| 72 | Recitation bar | **PASS** | Recitation bar appears on play, names the ayah ("Ayah 90", later "An-Nahl 92" under continuous play), shows reciter and a working scrubber (0:25 / -0:07), and the control toggles to pause and back. On Home the player IS the Listen card in place, so it never contends with the tab pill; in the reader it docks above the content. Media3 session active=true, i.e. lock-screen/notification controls are live - something Expo Go could never verify, which is the point of an APK baseline |
| 73 | Hybrid layout, 2:255 | **PASS** | Verse (hybrid) layout: the ayah reads as one continuous RTL Arabic line above the word cells, cells wrap RTL, gloss under each word. Verified on 2:137; the dense run was verified on 2:255 and 2:137 |
| 74 | **Shaping**, both layouts, on a word with 3+ segments (e.g. `فَسَيَكْفِيكَهُمُ`, 2:137) | **PASS** | DECISION 28 GATE. فَسَيَكْفِيكَهُمُ (2:137, 3+ segments) renders as ONE joined word - letters connect continuously across all three segment colour changes, no separated letter groups. joinSegmentRuns + ZWJ holds on a real APK |
| 75 | Dense layout | **PASS** | Dense is visibly tighter than Verse: one-line glosses, whole ayah 137 in two rows, and no separate ayah line - Verse adds the continuous line plus bordered cells |
| 76 | Switch density, leave the screen, come back, kill and reopen the app | **PASS** | Density survived leaving the screen and returning, and a full force-stop + relaunch: the kebab reports Verse selected=true after the restart |
| 77 | Tap a word in each layout | **PASS** | Tapping a word in both layouts opens the word sheet on that word (شِقَاقٍ) with gloss, SEGMENTS block (Noun), Full analysis and Root شقق |
| 78 | Segment colours, both themes | **PASS** | Every distinct segment colour clears AA on the glass surface. Light: 5.64-7.27:1. Dark: 7.17-8.96:1 |
| 79 | Play a single ayah | **RESOLVED** | Owner picked wrapped; the rail branch is gone. Only 'dense' and 'hybrid' remain in settingsStore; the two surviving references to 'rail' are migration-fallback comments, not code paths |

## What the checklist itself got wrong

Three checks and two more are no longer runnable as written, and that is a finding
about the checklist, not a gap in the build:

- **56, 57, 58 — OBSOLETE.** All three test the day-streak counter. S4c deleted it
  by owner ruling on 2026-10-03: the Home khatm card took its place and the streak
  number "goes away entirely". There is no streak to read.
- **66, 67 — SUPERSEDED.** Both test the reader's *mushaf mode*. M7d deleted
  `ReaderMode` and the layer machine and made the mushaf its own tab (-824 lines).
  The reader's surviving toggle is Translation/Words, and Words is a pushed screen
  rather than a mode, so "reopens in the mode last used" has no referent. The mushaf
  capability is covered by the M7 checks.
- **79 — RESOLVED, not run.** It asked the owner to pick rail or wrapped and delete
  the loser. That happened: only `dense` and `hybrid` remain.

## Still to run

Checks 80-190 (m6f audio, m6g dictionary and search, m6r reader navigation,
m6h bookmarks and notes, m6i settings and about, m6j sheet chrome, m6l row
estimation). The harness used here is reusable; nothing about the remaining
groups needs a different approach.
