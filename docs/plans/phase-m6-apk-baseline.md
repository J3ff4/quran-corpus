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

Audio was measured through `dumpsys media_session` rather than the screen: it gives
playback state, position, track length and the metadata the lock screen renders, at
~38ms per sample, and it keeps working where `uiautomator dump` does not -- the dump
waits for window idle and returns an empty file while anything animates or plays.
Two traps worth writing down. `dumpsys media_session` reports `position` as of its
own `updated` timestamp and goes stale while PAUSED (it read 274ms where the UI read
0:11), so the UI is the instrument for scrub assertions. And `input swipe` under
about 500ms does not register here at all, while a device-side loop of swipes needs
a `sleep` between them or every one after the first is dropped.

**Device settings changed for this run**, recorded so they can be put back:
screen timeout 10min -> 30min, continuous play OFF -> ON, reciter Husary (Murattal)
-> Abdul Basit (Murattal), theme -> Light, interface language -> Russian and back to
**Device settings changed for this run**, all now RESTORED: screen timeout
30min -> 10min, continuous play -> off, reciter -> Mahmoud Khalil Al-Husary
(Murattal), theme -> System, interface language -> English, Reduce animations ->
off, OS font scale -> 1.0, Arabic size -> Medium, word-by-word layout -> Dense.
The ringer was already SILENT and was left alone. The two bookmarks this device
carried (An-Nahl 16:90, Aal-Imran 3:191) were deleted by checks 162 and 163 and
have been re-created, both without notes, as they were.

## Result

**116 of M6's 117 checks run on the APK: 103 PASS, 1 FAIL, 2 PARTIAL, 4 BLOCKED**,
plus 3 obsolete, 2 superseded and 1 already-resolved rows that are findings about
the checklist rather than the build. Check 88 is the one outstanding.

The one failure is **141**, filed as **issue #112**: paging to another surah hides
the reader's transport but does not stop the recitation, which keeps playing and
keeps advancing through the previous surah with no transport anywhere on screen.
The M6r Expo Go run recorded that check as PASS, so it is a regression, traced to
`2996092a` (phase M8).

What the APK proved that Expo Go could not: the media3 session really registers
(`active=true`, surah and reciter in its metadata, a MediaStyle notification, audio
continuing with the screen asleep and the keyguard up), decision 28's Arabic shaping
holds on the release bundle, and the release build's scrolling is clean under load
(39570 frames at 0.00% janky on the 1000-row frequency list, 11110 at 0.05% through
al-Baqara).

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

| 80 | Scrub | **PASS** | Scrub, measured on ayah 7 (15.02s track). Drags to 20/50/90% read 0:03/-0:12, 0:07/-0:07, 0:13/-0:01 -- every pair sums to the track length and the fill matches the drag. Backward seeks verified too, so the result cannot be confused with elapsed time. NOTE: dumpsys media_session position goes stale while PAUSED (read 274ms where the UI read 0:11); the UI is the instrument here. |
| 81 | Continuous play through a surah boundary case (al-Fatiha, 7 ayahs) | **PASS** | Continuous play across al-Fatiha, sampled 3393x over 130s. Exactly SEVEN tracks (5224/6347/4571/4702/6922/5433/15020 ms), then STOPPED at 52.3s and still stopped 77s later. Does not wrap, does not restart. Reader bar parks on "Ayah 7 - Play", resumable. |
| 82 | Lock the screen mid-ayah | **PASS** | Both halves. Controls: the media session is active=true with metadata "An-Nahl, Mahmoud Khalil Al-Husary (Murattal)" -- surah AND reciter -- behind a MediaStyle notification (category=transport, flags=NO_CLEAR|FOREGROUND_SERVICE, android.title="An-Nahl", android.text the reciter) bound by an android.mediaSession token; it carries no Notification.Action buttons because media3 lets the system draw transport from the session. Continuity: with the screen asleep and isKeyguardShowing=true, position advanced 1798 -> 4804 (t+3s) -> 10814 (t+8s) at speed 1.0 on a 33.5s track. OBSERVATION: vis=PRIVATE, so what a secure lock screen shows of the content depends on the viewer's sensitive-notification setting. |
| 83 | Lock-screen transport, Android 13+ | **PASS** | Transport keys dispatched to the session: MEDIA_PAUSE -> PAUSED(2) at 1657ms; MEDIA_PLAY -> PLAYING(3) resuming 1657->2972; MEDIA_NEXT -> position reset to 2 with buffered 6347 (= ayah 2's length), i.e. it advanced. OBSERVATION: the legacy PlaybackState bitmask 7339979 omits SKIP_TO_NEXT(32) and SKIP_TO_PREVIOUS(16) though next demonstrably works -- affects legacy controllers reading the bitmask, not media3's own command set. |
| 84 | Listen across an ayah boundary | **PASS** | Six ayah seams measured from state transitions: 190, 130, 130, 150, 150, 120 ms. Max 190ms against a ~1s fail threshold. Every seam passes through BUFFERING, so each ayah is fetched fresh -- these numbers are wifi numbers and would widen on a slow link. Cold start from tap to sound: 820ms. |
| 85 | Play with the device in silent mode | **PASS** | Ringer was already SILENT (mode_ringer=0) for the entire run, so all seven ayahs above played under it. Explicit re-check: STREAM_MUSIC Muted=false at volume 8/15 on speaker, positions advancing 0 -> 1872 -> 4876. Structural reason: ringer-affected streams = SYSTEM|RING|NOTIFICATION|DTMF, which excludes STREAM_MUSIC. |
| 86 | Incoming call or another audio app mid-recitation | **BLOCKED** | Cannot drive an audio-focus loss from adb without either operating a third-party app's UI or playing arbitrary external media on the owner's tablet; neither is acceptable. Launching the other installed Quran app did not request focus, and the VOICE_COMMAND intent took none. FINDING recorded anyway from the focus stack while playing: the app holds "gain: GAIN_TRANSIENT" with "usage=USAGE_UNKNOWN", while the media session's own attributes are USAGE_MEDIA -- a transient request for a long recitation, and attributes that disagree with the session. Focus is released when playback stops. Needs the owner: a real incoming call, or another audio app started by hand mid-recitation. |
| 87 | Switch reciter mid-surah | **PASS** | Switched Husary (Murattal) -> Abdul Basit (Murattal) from Settings. Ayah 1 then loads a 4440ms track where Husary's was 5224ms -- a different file, not a relabel -- and session metadata reads "Al-Fatiha, Abdul Basit (Murattal)". Survives a restart: am force-stop + relaunch, Settings still reads Abdul Basit (and Home still offered "Continue reading Al-Fatiha 1:1"). Picker is a centred dialog at this width and lists ten reciters with NO Alafasy, per the M6 ruling. |
| 89 | Dictionary browse, both themes | **PASS** | Dictionary browse, both themes. Glass is measured, not eyeballed: tile interiors track the bloom across the row -- dark (23,41,35)->(21,20,18) over ground (20,34,29)->(18,17,16); light (251,250,245)->(254,252,247) over ground (245,244,239)->(248,246,241). Both are ground plus a constant ~+6/channel lift, i.e. translucent fill, not a painted colour. Arabic crisp in both; hijai order right-to-left; selected chip outlined in accent. |
| 90 | Root ق-و-ل | **PASS** | Root قول: entry plate (ق و ل tiles, "qwl", "1722 occurrences" -- matches roots.occurrence_count and a live word_segments count), Hans Wehr card, Lane card. Lane is collapsible where the entry needs it: قول's text fits whole so no control appears, while ضرب (1423-char Lane entry) shows "Show more" -> "Show less" and the card grows, pushing FILTER BY FORM from y1237 to y1333. Compound-root count checked on أمم as the plan's own log does: 119 occurrences on device, and its six form chips sum to 35+1+12+6+64+1 = 119. |
| 91 | Derived-form chips | **PASS** | Form chips. Tapping "umm, Noun, 35" filters the concordance to 35 with rows tagged umm (first 3:7:10). No dim: body luminance 240.64 / 240.64 / 240.65 across before / mid-gesture / settled. No layout shift: chips sat at x126/251/381 before and x125/250/380 after -- 1px. |
| 92 | Root Previous/Next through five roots, then back | **PASS** | Five Nexts walked Amm -> Amn -> Amw -> Anv -> Ans -> Anf, then ONE system Back landed straight on the dictionary search results (Roots · 9, أمم 119) with the query intact. It did not walk back through the other four. |
| 93 | Frequency list, scrolled to the bottom (1000 rows) | **PASS** | Frequency list runs to exactly 1000 rows; last row is #1000 محو (3 occurrences) and it clears the tab pill. Smooth under load: 39570 frames across the whole scroll, 1 janky (0.00%), p50 5ms / p90 7ms / p95 8ms / p99 9ms, all inside the 11.11ms budget at 90Hz. OBSERVATION: the list's bottom inset accounts for the tab pill but NOT the docked MiniPlayer, which overlaps rows 999-1000. Harmless at this width (the centred card covers only the empty middle column, rank and form stay readable) but the bar is full-width on a phone -- re-check there. |
| 94 | Lemma entry in Russian UI | **PASS** | Russian UI. Lemma screen reads Предыдущая / Следующая (feminine, agreeing with лемма) and "2699 вхождений"; the root screen reached from it reads Предыдущий / Следующий (masculine, корень). Genitive plural correct on counts throughout ("287 вхождений", "Корни · 6"). OBSERVATION: the header up-affordance still announces "Navigate up" in English under a Russian UI -- it is React Navigation's default label, not one of ours (no match in apps/mobile), so it is a navigator config gap rather than a missing translation. |
| 95 | Search "qwl" | PASS, same deviation as the Expo Go run | The check as written cannot hold: a Buckwalter root is neither a verse reference nor translation text, so "qwl" returns the ROOTS arm alone. Three queries, one per kind, each opening the right screen: qwl -> ROOTS -> قول's root page; 16:90 -> the GO TO card -> reader at An-Nahl Ayah 90; mercy -> VERSES (31:3, 10:86, 27:77, 17:24) -> reader at Luqman with Ayah 3 in view. NOTE: an "Edl" search first read "Roots · 0"; reading the field back out of the a11y tree showed the query was stale, and a clean "Edl" gives Roots · 43. No case-sensitivity defect -- both arms lowercase. |
| 96 | Concordance tap into 16:90 | **PASS** | Root عدل (28 occurrences, concordance order 2:48:16, 2:123:12 ... matching the DB exactly). Scrolled to the 16:90:4 row and tapped it: lands on An-Nahl with Ayah 90 at the top of the view (y398), 91 and 92 below. The M5c deep-link fix holds from the concordance caller. |

| 124 | Surahs tab → Juz | **PASS** | Thirty juz rows, every one collapsed (no ranges in the tree), each subtitle a count. Counts cross-checked against the corpus: all 30 agree with `select juz, count(*) from ayahs group by juz`, summing to 6236. D42's assumption reads right. |
| 125 | Tap Juz 1 | **PASS** | Tapping Juz 1 expands it in place to "Al-Fatiha, Ayahs 1–7" and "Al-Baqara, Ayahs 1–141" (7 + 141 = 148, the row's own count) and the juz list stays on screen -- 54 juz nodes still present, the reader did not open. |
| 126 | Tap `Al-Baqarah 1–141` | **PASS** | Tapping "Al-Baqara, Ayahs 1–141" opens the reader at 2:1 (Ayah 1 first, surah plate above it). |
| 127 | Expand Juz 2 with Juz 1 open | **PASS** | With Juz 1 open, expanding Juz 2 leaves both open: Al-Fatiha 1–7 and Al-Baqara 1–141 still listed, plus Al-Baqara 142–252 (= 111, Juz 2's count). Juz 1 also survived a round trip into the reader and back. |
| 128 | Tap Juz 1 again | **PASS** | Tapping Juz 1 again drops its two ranges and leaves the row; Juz 2's range is untouched, so only the tapped juz collapsed. |
| 129 | Juz → Surah → Juz | **PASS** | Juz -> Surah -> Juz leaves zero expanded ranges. D44 holds. |
| 130 | Surahs tab → Revealed | **PASS** | Revealed opens with both eras expanded and the counts on the headers: MECCAN 86, MEDINAN 28, matching `select revelation_type, count(*) from surahs` exactly. Rows are in revelation order and agree with the DB's order_number (1 Al-Alaq, 4 Al-Muddaththir, 7 At-Takwir). |
| 131 | Collapse Meccan | **PASS** | Collapsing Meccan leaves its header at y=214 and lifts MEDINAN to y=350, directly beneath it. Zero Meccan surah rows remain. |
| 132 | Expand Meccan again | **PASS** | Re-expanding restores the list identically -- MECCAN at y214, first row "1, Al-Alaq" at y294, then 4/7/10/13/16/19 down the left column, same geometry as before the collapse. |
| 133 | Read 2:50 in Mushaf → Translation | PASS, check off by one ayah | Read page 8 in the Mushaf (the page holding 2:50), then Home: "Continue reading Al-Baqara 2:49", and opening it puts Ayah 49 at the top. The check says 2:50; the mushaf records the ayah the PAGE OPENS IN, and `mushaf_layout` confirms page 8's first ayah by seq is 2:49 and that 2:49 begins on page 8. So the recorded position is right and the check's number is wrong. The substance -- not 2:1 -- holds. |
| 134 | …→ back to Mushaf | **PASS** | Returning to the Mushaf tab after that round trip leaves it on page 8, still holding 2:49-2:51. |
| 135 | 2:50 → Words chip | **PASS** | Words from the reader at 2:49 opens on the chunk "Ayahs 45–54", which contains ayah 50. |
| 136 | Page Words to 2:55, press back | **PASS** | Next-ayahs on Words moves to "Ayahs 55–64"; one Back puts the reader on Ayah 55 at the top. The Words position propagates back. |
| 137 | Open 2:1 from the surah list, immediately switch mode | **PASS** | Opening al-Baqara from the surah list lands on Ayah 1, and tapping Words immediately opens "Ayahs 1–10" with Ayah 1 first. No jump -- the race this check targets does not bite. |
| 138 | Next-surah chevron in al-Baqarah | **PASS** | Sampled one frame per repeat at six delays. Incoming content's leftmost ink sits at x=680 (40ms) and x=654 (80ms) -- a gap on the left, content pushed right -- and is full width (x~50) from 120ms on, i.e. it enters from the right. The back arrow's ink spans x=96..113 in ALL SIX frames: it does not animate. |
| 139 | Press back after paging three surahs | **PASS** | Paged al-Baqara -> Aal-Imran -> An-Nisa -> Al-Maidah, then ONE system Back returned to the Surahs list rather than walking the three. D48 holds. |
| 140 | Chevrons in al-Fatihah and an-Nas | **PASS** | Measured rather than eyeballed, and symmetric. Surah 1: Previous ink depth 66 vs Next 219. Surah 114: Previous 217 vs Next 66. Both chevrons are present in the accessibility tree at both ends -- neither vanishes. OBSERVATION: the dimmed state computes to 1.93:1 against its ground, under the 3:1 non-text minimum; exempt because the control is disabled, but it is faint. |
| 141 | Play 2:50, then page to Aal-Imran | **FAIL** -- regression, issue #112 | Paging to the next surah hides the reader's bar but does NOT stop playback. `state=PLAYING(3)` with position advancing 2727 -> 5725 over 3s at speed 1.0, and continuous play kept walking al-Baqara underneath -- paging back revealed it had reached Ayah 13. Because the reader is a pushed stack screen the MiniPlayer never renders over it, so the recitation is audible, advancing, and has no transport anywhere on screen. The M6r Expo Go run recorded PASS for this check, so it is a regression; traced to `2996092a` (phase M8, one recitation engine), which replaced the surah-keyed `useRecitation` with an app-wide engine plus an ownership test that governs only painting. |
| 142 | Words screen chevrons | **PASS** | Words screen's Next-surah chevron pages to Aal-Imran and opens at "Ayahs 1–10", Ayah 1 first. |
| 143 | TalkBack on a juz row | **PARTIAL** | Label and state are both present in the shipped build: the row's accessible name is "Juz 1, 148 ayahs" (juz + count, read off the device), and `BrowseList.tsx:114` attaches `accessibilityState: { expanded }` on disclosures only -- surah rows deliberately omit it so a navigating row is not announced as collapsed. The spoken output is still unverified: enabling TalkBack changes every gesture on the owner's tablet and would break the harness mid-run. Issue #34 stays open for the listen. |
| 144 | TalkBack on an era header | **PARTIAL** | Same shape. Era header's accessible name is "Meccan, 86" / "Medinan, 28" (era + count, read off the device) and `BrowseList.tsx:410` sets `accessibilityState={{ expanded: section.expanded !== false }}` from `SurahsScreen.tsx:297`. Spoken output still owed -- issue #34. |
| 145 | Reduce animations on, page a surah | **PASS** | With Reduce animations on, the incoming surah's leftmost ink is at x=47 at EVERY sampled delay (40/80/120/180ms), against x=680 and x=654 at 40/80ms with motion on. The slide is gone. The cross-fade itself resolves faster than this instrument's ~40ms floor, so it is asserted as "not a slide" rather than measured as a fade. |
| 146 | OS font scale at maximum, reader header | **PASS** | OS font scale 1.35 (the device maximum; `settings put system font_scale` works on this tablet where it is blocked on the OnePlus). The collapsed header reads "Al-Baqara ⌄" centred and uncut, back arrow left, kebab right, the two surah chevrons flanking the Translation/Words control below. Nothing clipped or overlapping -- the Task 8 Step 4 risk does not bite. NOTE: the header name is empty at the top of a surah at EVERY font scale -- that is the collapsing-header pattern (the name lives in the content plate until you scroll past it), not a defect; verified by A/B at 1.0 and 1.35. |
| 147 | Dark theme, both new chevrons | **PASS** | Dark theme, al-Baqara so both chevrons are enabled: glyphs reach luminance 237 on grounds of 30 and 18, i.e. **14.24:1** and **16.00:1**. Plainly visible against the glass; not the invisible-on-dark case. |

| 79 *(m6f)* | Play a single ayah | **PASS** | The OTHER check 79 -- the checklist uses the number twice, for m6e's rail-vs-wrapped (resolved, above) and for m6f's "Play a single ayah". Covered by the audio run: tap to first sound measured at 820ms against a ~2s budget (STOPPED -> BUFFERING at 1.58s, PLAYING at 2.40s on the same clock), and the bar shows a moving position -- the scrubber read 0:02 / -0:02 on a 4.7s track and tracked three seeks exactly. |
| 148 | **Upgrade over the M6r build without clearing app data** | **BLOCKED** | The migration's real test is an upgrade over the M6r build with app data intact. That already happened when vc92 was installed on this device, and it cannot be re-run without first installing the older build and downgrading the data -- which would risk the owner's user DB for no new information. The surviving evidence is indirect but real: two pre-existing bookmarks were present and intact under vc92, each with an empty note. |
| 149 | Scroll a list of 60+ bookmarks | **BLOCKED** | Needs 60+ bookmarks; this device has 2. Seeding 58 more into the owner's user DB and deleting them again is a larger write than any check requires. Wants a seeded device. (The 1000-row frequency list in check 93 exercises the same list component's scrolling and its last row clears the tab pill.) |
| 150 | Add, edit and clear a note | **PASS** | Full cycle. Add: note saved, card shows it, the row action flips "Add note" -> "Edit note". Edit: appended text saved and redisplayed. Clear: emptied and saved, action back to "Add note", and the BOOKMARK SURVIVES -- still "2 ayahs · 2 surahs", both cards present. Persistence verified across an `am force-stop` + relaunch mid-cycle. Cancel on an edit also discards correctly (a 500-char edit was abandoned and the original 24-char note came back). |
| 151 | Type past 500 characters | **PASS** | Measured by appending 50-character chunks and reading the field back out of the accessibility tree each time: 357 -> 407 -> 457 -> **500** -> 500 -> 500. Two further chunks add nothing, so the cap is exactly 500 and nothing is silently lost. The counter reads "Characters left · 0" in the warning colour at the cap. NOTE: a single 520-char `input text` burst lands only ~333 of its characters -- that is adb dropping, not the field, which is why the chunked method is the one that proves anything here. |
| 152 | A note in Arabic, Uzbek and Russian | **BLOCKED** | `adb shell input text` is ASCII-only -- Arabic raises "Exception occurred while executing 'text'", and Uzbek's oʻ/gʻ and Cyrillic are non-ASCII too. No stock adb path sets the clipboard to paste from either. Needs the owner typing on the on-screen keyboard. |
| 153 | All three tabs | **PASS** | Recent is newest-first, with a known insertion order: 3:191 was bookmarked last and is listed first, 16:90 second. By surah groups under surah headers ("Aal-Imran" header, then the card). With notes lists only noted bookmarks -- "No notes yet" while neither had one, and the noted card appeared once a note was added. |
| 154 | Un-bookmark an ayah that carries a note | **PASS** | Un-bookmarking a noted ayah raises a confirm; Cancel keeps both the bookmark and its text (verified in the reader, check 168); Delete removes both (verified on the bookmarks card, check 163). No dialog at all when the bookmark carries no note -- check 162's row went straight out. |
| 155 | Menu, both themes | PASS, check undercounts the rows | Menu renders cleanly in both themes -- four cards with icon, title, subtitle and chevron, consistent spacing. The check says THREE rows; there are FOUR: Morphology, Bookmarks, Settings, About & credits, plus an "On this device" privacy note below them. Morphology was added after the check was written. All four were opened during this run and each landed on the right screen. |
| 156 | Change every setting, kill the app, reopen | **PASS** | Changed every setting, `am force-stop`, relaunched. Persisted: UI locale (Uzbek), theme (Dark), reciter (Abdul Basit), Arabic size (Large -- verified by pill geometry, x=1127..1240 identical before and after, since the control exposes no selected state to the tree, issue #91), WbW layout, Reduce animations. Continuous play and note content were verified across separate restarts earlier (checks 87 and 150). |
| 157 | Switch UI locale to Uzbek, then Russian | PASS, one exception | Uzbek: Menu is Menyu / Morfologiya / Xatcho'plar / Sozlamalar / Dastur haqida; Settings is O'qish, Arab yozuvi o'lchami, Kichik/O'rtacha/Katta/Juda katta, Qiroat, Qori, Ketma-ket ijro, Ko'rinish, Mavzu, Tizim/Yorug'/Qorong'i, Animatsiyalarni kamaytirish, Til, Interfeys; About is Quran Corpus haqida, Matn va tarjima, "Usmoniy yozuvidagi Qur'on matni, Tanzil'dan", "Manba tasdig'i tugallanmagan". Russian verified under check 94. The only English left is correct: source names, reciter names, the language name "English" itself, and "GNU General Public License" as a licence's legal name. EXCEPTION: the header up-affordance announces "Navigate up" in English in every locale -- React Navigation's default label, not one of ours. |
| 158 | About | **PASS** | Every source named, in four groups. Text and translation: Tanzil, corpus.quran.com (GNU General Public License), QUL, Saheeh International, Tasnim, Abu Adel, vkorane.ru. Dictionary: Lane's Lexicon (via qurandev/roots, public domain), Hans Wehr, and the editorial roots written for this app. Recitation: everyayah.com and ten reciters. Typefaces: Newsreader, Hafs, KFGQPC, surah-name-v2/v4. The **OFL notice is present** -- "SIL Open Font License 1.1. Copyright 2020 The Newsreader Project Authors." S1's GPL obligations are discharged in place: the source offer renders between the credit groups and "Read the GNU General Public License" opens a screen carrying the full GPLv2 text. Nothing truncated -- the last card's two-line body ends "...One glyph per surah at PUA codepoint 0xE000 + surah number." Unapproved sources carry an honest "Source approval incomplete" badge. |
| 159 | Full pass over all nine sub-phases' screens in one session | PASS, with one regression | This run IS the full pass -- every sub-phase's screens exercised in one session on one build. The app reads as one design: the same glass surfaces, the same `SegmentedControl` in all six places it appears, the same confirm sheet in the reader and on the bookmarks card, consistent accent and typography across Home, Surahs, Mushaf, Dictionary, Menu, reader, Words, Bookmarks, Settings and About, and both themes coherent throughout. One regression found and filed: **check 141 / issue #112**. Nothing else from an earlier sub-phase had regressed. |
| 160 | Bookmarks → Recent, look at the first card | **PASS** | The first card clears the segmented control: the control's pill ends at y~358 and the card's top edge is at y~437, ~79 physical px of page ground between them, visible in the capture. Not flush. |
| 161 | Tap a card on its Arabic text, its note, and its empty space | **PASS** | Tapping the card's Arabic text (400,461) and its empty space (400,560) both open the reader at An-Nahl 16:90. Tapping the note icon opens the Add-note sheet and does NOT navigate; the delete icon raises the confirm sheet (163) and does not navigate either. |
| 162 | Trash icon on a bookmark with **no** note | **PASS** | Trash on a bookmark with no note: the row went at once with no sheet, and the header count dropped "2 ayahs · 2 surahs" -> "1 ayah · 1 surah" -- correctly singularised. Force-stop and relaunch: still gone, still 1. |
| 163 | Trash icon on a bookmark **with** a note | **PASS** | Trash on a noted bookmark raises the app's own glass sheet in the dark palette -- "Delete this bookmark? / Its note will be deleted with it. This cannot be undone." with Cancel and a red Delete -- not a white Material dialog. Cancel kept the row AND its note text; Delete removed both, taking the count to "0 ayahs · 0 surahs". |
| 164 | Swipe a row left | **PASS** | A full left swipe reveals a red delete panel with a trash glyph and slides the card off it; tapping the panel behaved exactly as 162 (no note -> row gone at once). A partial swipe released springs back with the card in its normal position and nothing deleted. |
| 165 | Compare the three tabs | **PASS** | Recent reads "An-Nahl 16:90" (surah + reference); By surah reads the bare "3:191" under an "Aal-Imran" header. Exactly the split the check asks for. |
| 166 | Switch tabs in **all five** segmented controls (Bookmarks, Dictionary, Surahs, word-by-word, the reader header) | **PASS** | All five controls are ONE component -- `SegmentedControl`, called from DictionaryScreen:367, BookmarksScreen:366, SurahsScreen:334, WbwScreen:378 and ReaderHeader:129 (and the mushaf's PageJumpSheet:68, a sixth the check does not list). The slide is measured on the Bookmarks control: with motion on the pill passes through intermediate geometry -- width 634 at 30ms and 826 at 100ms before settling at 879 -- where under Reduce animations it reads 1869..2748 w=879 at EVERY delay from 30ms, i.e. it jumps. On mount it is already in place: entering the Surahs tab, the pill is x=20..818 at 30ms and identical 2s later. The source backs both halves -- `place(target, false)` on first placement, commented "without it every mount slides the pill in". |
| 167 | TalkBack, swipe through one bookmark row | **PASS** | Three separate accessibility targets per row and no fourth: "Open An-Nahl 16:90", "Add note"/"Edit note", "Delete bookmark". The card itself is not a target -- its taps route through the link. |
| 168 | Reader: un-bookmark an ayah that carries a note | **PASS** | Un-bookmarking a noted ayah in the READER raises the same glass sheet as 163, word for word and in the same layout, not the Material dialog M6h shipped. Cancel kept the bookmark and its note. |

| 169 | Note sheet from a bookmark row | **PASS** | Note sheet from a bookmark row: title "Add note" (456x22dp) with "Aal-Imran 3:191" beneath it (456x18dp), and the input is a filled, bordered field 454x48dp -- it reads as a field, not a bare line. |
| 170 | Note sheet buttons | **PASS** | Measured from the `uiautomator` dump at density 320 (2px = 1dp): **Cancel 74x48dp, Save 63x48dp** -- both exactly at the 48dp minimum. Save is a filled accent button (green fill, dark label), Cancel is plain text.  |
| 171 | Note sheet with the keyboard up | **PASS** | With the keyboard up the sheet lifts and both buttons sit at y=579..617 on a 1752px screen, clear of the keyboard. Save is reachable without dismissing it -- no finding to file against D53. |
| 172 | Note sheet from the reader | **PASS** | The note sheet raised from the READER (check 168's path, on An-Nahl 16:90) is the same sheet with the same title treatment -- title, "<Surah> s:a" beneath, same field and buttons. |
| 173 | Reciter sheet | **PASS** | Active row carries a tinted fill, accent-coloured bold label and a **drawn check mark**; inactive rows are plain text on the sheet surface. No circle glyphs anywhere -- the position is spelled in the accessible name ("1 / 10"), not drawn as filled/empty bullets. |
| 174 | Reciter sheet at a large font scale | **PASS** | OS font scale 1.35: all ten rows are present in the tree and on screen without scrolling, and the last one -- "Muhammad Ayyoub, 10 / 10", bounds y=1303..1399 -- renders whole above the sheet's rounded bottom edge. Not clipped. |
| 175 | Reciter selection | **PASS** | Re-tapping the ACTIVE reciter closes the sheet and leaves the setting as it was ("Reciter, Mahmoud Khalil Al-Husary (Murattal)") -- no write. Tapping a different row switching the reciter and closing is check 87, which also proved the switch reaches the audio (a 4440ms track where Husary's was 5224ms). |
| 176 | Word sheet | **PASS** | On a word with a root (دِيَٰرِهِمْ at 3:195) the sheet shows BOTH links as full-width rows in one bordered card, each with a chevron and separated by a hairline: "Full analysis" and "Root دور". They use the shared press-scale style measured in check 54. A word with no root (فَلَا at 3:188) correctly shows only "Full analysis". |
| 177 | Lemma ⓘ | **PASS** | Drawn, not a glyph: `InfoButton` renders `<Icon name="info">`, and `Icon` is `<Svg><Path/></Svg>` from react-native-svg with path data "ported verbatim from web so the two products draw one glyph set". Tapping it opens a sheet -- "About these translations / From word-by-word translations, ordered by frequency — not dictionary definitions." It also carries `accessibilityState={{ expanded }}`. |
| 178 | Delete-confirm sheet | **PASS** | Unchanged from check 163: the same glass sheet, the same danger-coloured Delete and text Cancel, the same 48dp button metrics as 170. |
| 179 | TalkBack on the reciter sheet | PASS, and no TalkBack needed | The three things TalkBack would read are all in the node itself: every row is an `android.widget.RadioButton` (the role), each accessible name ends with its position -- "1 / 10" through "10 / 10" -- and `checked=true` appears on exactly one row, the active reciter, with `checked=false` on the other nine. All ten rows are 480x48dp. |
| 180 | Dark theme, every sheet | **PASS** | Every sheet raised during this run was on the dark surface and legible: note sheet, reciter sheet, delete confirm, word sheet, info sheet. Measured on the reciter sheet's active row, the worst case for accent-on-tint: accent rgb(90,165,141) on tint rgb(33,46,40) = **4.85:1**, clearing AA for normal text, and the label is bold besides. |
| 181 | Open 2:282 from a bookmark | PASS, with an intermittent noted | Opening 2:282 from a bookmark lands with "Ayah 282" at y=398 -- the same y as every correct landing in this run (16:90, 31:3, 2:49, 2:55, 2:50) -- first try, no visible scrolling. Verified cold (force-stop, relaunch, straight to the bookmark) and warm. INTERMITTENT, recorded not filed: twice early in this group a deep link to 2:282 landed roughly a screen INSIDE the ayah, with no "Ayah 282" header on screen and the viewport showing "ٱلشُّهَدَآءُ إِذَا مَا دُعُوا..." about 60% through. It did not reproduce in SEVEN subsequent attempts -- cold, warm, from a bookmark, from search, re-entering the same ayah, from a different ayah in the same surah, and under 684MB of resident memory after turning mushaf pages. Flaky on the hardest ayah in the corpus; worth a watch rather than a confident bug report. |
| 182 | Same, at Arabic size X-Large | **PASS** | Same landing at Arabic size **Extra large** -- the 512dp-drift config this check calls the model's worst case. 2:282's opening words sit at the top of the content area, y=336. |
| 183 | Open 2:282, then switch mode | **PASS** | From 2:282, switching to Words lands on the chunk "Ayahs 282–286" with Ayah 282 first -- on it, not near it. |
| 184 | Open a surah with no ayah param | **PASS** | Opening a surah with no ayah param lands at the top (surah plate, then Ayah 1) with no jump and no flash: sampled at 0.05/0.15/0.30/0.60/1.2s, the frames are byte-identical in ink from 150ms onward (3663215 px at every delay) and the 50ms frame differs by 0.5%, which is the entrance settling. No blank or inverted frame at any delay. |
| 185 | Open 16:90 from search | **PASS** | Covered under check 95: 16:90 from search lands on An-Nahl Ayah 90 at the top of the view -- the ayah the abandoned recovery used to miss by 41. |
| 186 | After any of the above, check the reading position | **PASS** | After landing on 2:282, Home reads "Continue reading Al-Baqara 2:282" -- the ayah landed on, not one flown over on the way. |
| 187 | Scroll Al-Baqara top to bottom by hand | **PASS** | Scrolled al-Baqara by hand over 24 swipes. The first visible ayah advances strictly monotonically -- 2, 5, 8, 11, 14, 16, 18, 21, 23, 25, 27, 29, 31, 33, 35, 37, 40, 42, 45, 47, 50, 52, 55, 56 -- never backtracking, which is what a mis-estimated row height looks like when the list corrects itself. No row drawn at the wrong height. Smooth with it: 11110 frames, **6 janky (0.05%)**, p50 7ms, p90 9ms, p95 11ms, p99 14ms against an 11.11ms budget at 90Hz. |
| 188 | Repeat 181 with Reduce animations on | **PASS** | Same 2:282 landing with Reduce animations on: the ayah's opening words at the top of the content, no motion. |
| 189 | Deep-link into the surah already on screen | **PASS** | Deep-linking to 2:50 while the reader already held al-Baqara (parked at 2:282) re-landed with Ayah 50 at y=398, without remounting. Re-entering the SAME ayah already on screen also re-lands cleanly. |
| 190 | Turn to the previous/next surah with the chevrons | **PASS** | From mid-surah (al-Baqara ayah 56): Next surah -> Aal-Imran **Ayah 1**; Previous surah -> Al-Baqara **Ayah 1**. Both land at ayah 1 rather than a remembered position. |

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

**88 (airplane mode) — owed, deferred by the owner 2026-10-04.** It needs the
tablet's wifi off, and wifi is the only transport `adb` reaches it on, so running it
costs the connection and possibly a re-pair at the device. It wants a USB-connected
device, where wifi can be toggled without losing `adb`.

**86 needs the owner** — an audio-focus loss cannot be provoked from `adb` without
driving a third-party app's UI or playing arbitrary media on the owner's tablet; it
wants a real incoming call, or another audio app started by hand mid-recitation.

**143 and 144 need TalkBack running.** Label and state were both verified present —
on the device and in the source that built this APK — but not the spoken output.
Turning TalkBack on changes every gesture on the owner's tablet and would have
broken the harness mid-run. Issue #34 stays open for the listen.

**148, 149 and 152 are blocked** for the reasons in their rows: a migration that
cannot be re-run without risking the user DB, a 60-bookmark list this device does
not have, and `adb shell input text` being ASCII-only.

**The phone still owes the layout checks.** Everything here ran at 876dp, an
expanded window class, so S4a's responsive layout is what rendered. Checks that
assert behaviour carry over to the phone; checks that assert phone layout do not.
