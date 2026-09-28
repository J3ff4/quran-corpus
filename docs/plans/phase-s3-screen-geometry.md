# Phase S3 — Screen Geometry

**Goal:** app holds up on screens that are not a 6" phone. Owner saw
imperfections on a Galaxy Z Fold; find all of them, fix them.

**Status:** device run done 2026-09-27 on a real Galaxy Tab S10+ (SM-X820)
and on an S24 under `wm size` overrides. One root cause behind almost every
defect (Finding 2). Fix not started.

## Why now

Every layout in the app was built and checked at ~330-355dp of width. Nothing
has ever rendered at a Fold's unfolded 711dp. Play ships to Folds and tablets.

## Constraints

- A real **Galaxy Tab S10+ (SM-X820)** is available: 1752x2800 @ 320dpi, so
  876x1400dp -- 1400dp wide in landscape, which is the widest case the app
  will ever see. Prefer it over any override.
- No emulator here: `/dev/kvm` absent, 4 cores, 8GB. For the Fold the
  substitute is `wm size` + `wm density` on the S24 (verified reversible).
- `wm size`/`wm density` CANNOT reproduce a hinge, true multi-window, or the
  fold/unfold reconfiguration event. Those stay untested until real hardware.
- **OnePlus 7 Pro is unusable for this.** `wm size` is rejected by
  `OplusWindowManagerService`, `settings put` throws SecurityException, and it
  is this session's display.
- Every `screencap` is gated on `dumpsys window | grep mCurrentFocus`
  containing `qurancorpus`. A capture taken while the owner had switched apps
  once caught their private messages.
- Restore with `wm size reset` / `wm density reset` on every exit path.

## Geometries

| id | wm size | density | stands for | text width |
|---|---|---|---|---|
| tab-native | reset | reset | real Tab S10+, landscape | 1368dp |
| native | reset | reset | S24 as shipped (480dpi) | 328dp |
| fold-open | 1812x2176 | 390 | Z Fold inner, unfolded | 711dp |
| fold-cover | 904x2316 | 390 | Z Fold outer cover | 339dp |
| small | 720x1600 | 320 | low-end small phone | 328dp |
| tablet | 1600x2560 | 320 | 10" tablet, portrait | 768dp |

## Finding 1 (static, no device needed) — the mushaf caps on a wide screen

`mushafFontSize` = `textWidth * 0.985 / MUSHAF_PAGE_WIDEST_EM[page]`, clamped
to `MUSHAF_MAX_FONT_SIZE = 40`. The clamp exists because M7b's device run saw
Android drop pieces of the whole-word QCF outlines above ~44px.

Against the real 604-page metrics (em 11.91 - 18.17):

| geometry | font min | font max | pages at the cap |
|---|---|---|---|
| native | 19.1 | 29.1 | 0/604 |
| fold-cover | 18.4 | 28.0 | 0/604 |
| small | 17.8 | 27.1 | 0/604 |
| fold-open | 38.6 | 58.8 | **603/604** |
| tablet | 41.6 | 63.5 | **604/604** |

Mushaf lines are pre-justified to fill their column exactly, so a capped font
does not fill it: the page renders stranded against one edge with dead space
beside it. `pageScale.ts` predicted this in a comment; no Fold width was ever
put through it.

**Measured 2026-09-27.** Cap COUNT was the wrong metric -- what shows is how
much of the column the clamped text covers:

| width | pages capped | median fill | worst fill | looks |
|---|---|---|---|---|
| fold-open 711dp | 603/604 | 90% | 68% | fine; page 257 wants 44.6dp, gets 40 |
| tablet portrait 844dp | 604/604 | 76% | 57% | noticeable |
| tablet landscape 1368dp | 604/604 | **47%** | **35%** | broken -- see Finding 2 |

So the Fold's mushaf is not the problem. The tablet's is: at 1368dp the page is
a small island of ragged, unjustified lines in a field of empty background.

**Fix (not a bigger cap — that brings back the glyph dropping):** clamp the
COLUMN, not the font. `maxColumn = MUSHAF_MAX_FONT_SIZE * widestEm / 0.985`,
which is 483-738dp depending on the page; centre the page in whatever width
remains. A Fold then shows a phone-proportioned page centred, which is what a
real mushaf app does on a tablet. Per-page column width is fine -- the pager
already keys layout off the page number.

## Finding 2 (device, both geometries) -- nothing has a max content width

Every screen is one full-bleed column, so at width the content does not
re-flow; it is pinned to both edges with the middle left empty.

- **Reader**: ayah 1 of al-Baqara puts `آلمّ` hard against the right edge and
  `Alif, Lam, Meem.` hard against the left, with ~600dp of nothing between at
  fold-open and ~1200dp at tablet landscape. A long translation instead runs
  the full 1368dp as one line -- roughly 200 characters of measure.
- **Surah list**: one 1368dp row per surah, number and name left, Arabic name
  right, dead middle. Wants a 2-3 column grid at this width.
- **Word screen**: hero word right, transliteration and gloss left, same gap;
  lower 60% of the screen empty.
- **Translation/Words segmented control**: stretched to full width, each
  segment ~640dp holding one centred word.
- **Settings** is the exception and survives: its chips are intrinsic-width,
  so only the toggles drift far right. No change needed.

This is one fix, not five: a shared max-width content container
(`maxWidth`, `alignSelf: 'center'`, `width: '100%'`) applied at the screen
containers and at `contentContainerStyle` on the lists. Settings shows the
layout is already sound at phone width -- it just needs to stop growing.

## Finding 3 -- content runs under the One UI taskbar

On the tablet the persistent taskbar covers the bottom of every scrolling
screen: the surah list's last row, About's last badge, the reader's
translation. The tab pill sits above it, so there is a strip between the pill
and the screen edge where list content shows through and collides with the
taskbar icons. The phone bottom inset is not accounting for a tablet taskbar.

## Not defects (checked, ruled out)

- The floating pencil at the right edge of every tablet screenshot is
  Samsung's S Pen button, not ours.
- Mushaf glyphs are the QCF face at every width tested -- no tofu, no system
  fallback. The 40dp cap is doing its job (check 441 PASS).
- Search highlight bands stay separated at 1368dp (check 447 PASS).

## Checks

Run per geometry. `sweep.sh` collects a screenshot of each screen; these are
the judgements to make against them.

| # | check |
|---|---|
| 440 | Mushaf page fills its column, no dead band beside the text (Finding 1) |
| 441 | Mushaf glyphs are the QCF face, not tofu and not a system fallback |
| 442 | Reader ayah text wraps to the column, no clipped or stranded line |
| 443 | Reader/WBW rows estimate their height correctly -- no overlap, no gap |
| 444 | Docked bars (tab pill, player, top strip) stay opaque over content |
| 445 | Tab pill and player are reachable, not stretched across the full width |
| 446 | Word sheet is a sheet, not a full-screen slab; its 4 blocks hold shape |
| 447 | Search results: snippet wraps, highlight bands do not run together |
| 448 | Dictionary root list and entry: no clipped definition, no dead column |
| 449 | Bookmarks cards keep one shape; swipe-to-delete still clips correctly |
| 450 | Settings segmented controls fit, no label truncation |
| 451 | About + licence screens: GPL text readable, line length not absurd |
| 452 | No horizontal scroll anywhere |
| 453 | Running text stays under ~75 characters per line at 711 and 768dp |

453 is the one a phone can never fail: at 711dp a single column of translation
is an unreadable measure even when nothing is clipped.

## How to run

```bash
# S24 only. Never the OnePlus.
adb mdns services                 # the connect port changes every reconnect
adb connect 192.168.0.x:PORT
adb install -r --user 0 $CLAUDE_JOB_DIR/tmp/serve/quran-corpus-vc67.apk
$CLAUDE_JOB_DIR/tmp/geom/sweep.sh <serial>            # all geometries
$CLAUDE_JOB_DIR/tmp/geom/sweep.sh <serial> fold-open  # just one
```

`--user 0` is mandatory: an unqualified `adb install -r` once landed on user 10
and wiped user-0 app data.

## Verification Log

### 2026-09-27 -- Tab S10+ (SM-X820, landscape 1368dp) and S24 under fold-open

vc67 on both. Screenshots under `$CLAUDE_JOB_DIR/tmp/geom/shots/`.

| # | tab landscape | fold-open | note |
|---|---|---|---|
| 440 | **FAIL** | PASS | 47% median column fill vs 90% at fold-open |
| 441 | PASS | PASS | QCF face, no tofu, at every width |
| 442 | **FAIL** | **FAIL** | Finding 2 -- split measure, not clipping |
| 444 | **FAIL** | PASS | Finding 3, tablet taskbar only |
| 445 | **FAIL** | **FAIL** | segmented control stretched full width |
| 447 | PASS | not run | bands stay separated; query seeded `earth` |
| 450 | PASS | PASS | chips are intrinsic-width and hold |
| 452 | PASS | PASS | no horizontal scroll anywhere |
| 453 | **FAIL** | **FAIL** | ~200 characters of measure at 1368dp |

443, 446, 448, 449, 451 not judged this run -- the screens were captured but
Finding 2 dominates all of them, and they should be re-judged after the fix.

Method notes for next time:
- `adb shell input keyevent 111` (ESC) navigates BACK out of the search
  screen, it does not just close the IME. Capture with the keyboard up.
- `adb shell input text` still cannot send Arabic; `earth` was used to get
  results on screen.
- The tablet's mdns entry appears on the same IP as the other devices; only
  one of the three advertised ports actually accepts a connect.

---

# S3b — Three owner-reported defects on hardware we do not have

Reported 2026-09-27 after the first sweep. None reproduce on the Tab S10+, the
S24 or the OnePlus, so each needs its geometry imitated before it is touched.

## Owner rulings

- **Fold model: 8 first**, then 5, 6, 7. Owner's words: "it looked short not
  tall like other folds." That is the load-bearing detail -- a Fold whose inner
  screen is WIDER than it is TALL in the held orientation is a geometry nothing
  in this app has ever rendered at, and it explains a top clip that no portrait
  Fold shows.
- **S22 Ultra: sweep it.** Owner does not know which display setting differs.
- **Gradient: reproduce first, fix second.** No guessing from the code.

## Geometries to add

`wm size` is in px and `wm density` in dpi; dp width = px / dpi * 160.

| id | wm size | density | dp | stands for |
|---|---|---|---|---|
| fold8-wide | 2184x1968 | 372 | 939x846 | **wider than tall** -- the owner's "short" Fold. Run first. |
| fold7 | 1968x2184 | 372 | 846x939 | Fold 7 inner, portrait |
| fold6 | 1856x2160 | 374 | 794x924 | Fold 6 inner |
| fold5 | 1812x2176 | 374 | 775x931 | Fold 5 inner (the first sweep used 390dpi; 374 is closer) |

Exact panel specs for a Fold 8 are not confirmed here. `fold8-wide` is a
short-and-wide stand-in chosen to match the owner's description, not a spec
sheet. Say so in the log; do not report it as "tested on a Fold 8".

## Defect A — the wash paints half the screen

**Symptom:** reader gradient on the left only, right side flat dark.

**What the symptom tells us:** the View's `backgroundColor` still fills -- that
is why the bare half reads as "black" rather than as nothing. The background
paints, the gradient does not. So the container is the right size and the SVG
content inside it is not.

**The obvious suspect does NOT survive the source (checked 2026-09-27).**
`Bloom` is mounted once in `app/_layout.tsx` and its docstring says it is
deliberately never re-rendered, which looks like a stale percentage viewport.
It is not:

- `SvgView.onSizeChanged` calls `invalidate()`
  (`react-native-svg@15.15.4/android/.../SvgView.java:160-162`), so a resize
  repaints with no re-render needed.
- `bbWidth` is stored as an `SVGLength` and resolved RELATIVE to the live
  canvas width at draw time (`SvgView.java:312`), not captured at layout.
- Every `bloom` token in `src/theme/tokens.ts` is a percentage
  (`cx: '18%'`, `rx: '120%'`, `ry: '66%'`), so the wash scales with the
  viewport instead of staying phone-sized.

**So there is no code-supported hypothesis yet.** Reproduce first and capture
what is actually on screen before forming one -- which is the ruling anyway.
Candidates to rule in or out only once it is on screen: whether the bare
region tracks the OLD window width (points back at a stale bound somewhere
above the Svg) or is a fixed fraction of the NEW one (points at the gradient
geometry), and whether it survives a backgrounding and return.

**Note for the device run:** the width cap landed in `47c7c0a` puts the scene
at 640dp centred, so at a Fold's 939dp there will now be bloom-coloured bands
down both sides of the content. That is expected, is not this defect, and
should be judged on its own -- it is the first time anyone will see the app
with the cap applied at Fold width.

**Reproduce (required before fixing):**
1. App foregrounded on the reader, S24 at a narrow `wm size`.
2. `wm size 2184x1968` + `wm density 372` **while it stays foregrounded** --
   that fires a configuration change without restarting the activity, which is
   the closest thing here to an unfold.
3. Screenshot. The defect is confirmed only if the wash covers the left portion
   and stops at roughly the pre-change width.

If it does not reproduce, stop and say so -- do not fix a bug that is not there
(the taskbar finding in S3 was withdrawn for exactly this reason).

**Fix:** not specified here on purpose. The three readings above each point
somewhere different, and the source rules out the one that would have been
guessed. Write the fix after the screenshot, not before it.

## Defect B — mushaf clips at the top on a short screen

**Symptom:** surah English name and juz number invisible; top of line 1 cut.

**Suspect 1 -- DISPROVEN by reading the code, 2026-09-27.** `HEADER_HEIGHT = 0`
in `MushafPage.tsx` is correct. `MushafTopStrip` is a sibling ABOVE
`MushafReader` inside a flex column (`MushafScreen.tsx:541-560`), so the
reader's `flex: 1` already receives height-minus-strip. The strip is not an
overlay and nothing needs to subtract it twice. Do not "fix" this.

**Suspect 2 -- two independent refs that must agree and have no way to.**

The mushaf cancels the scene's top padding with a negative margin:

- `app/(tabs)/_layout.tsx:15` -- `const { top } = useStableInsets()`, spent as
  `sceneStyle: { paddingTop: top }`
- `src/screens/MushafScreen.tsx:122` -- `const { top: insetTop } =
  useStableInsets()`, spent as `marginTop: -insetTop` AND passed to the strip
  as `insetTop`

Those are two separate CALL SITES, and `useStableInsets` holds its value in a
`useRef` -- so there are two refs, each holding its own "last non-zero" top.
The padding and the margin cancel only while both refs agree. The mushaf hides
both system bars, which collapses the live inset to 0, and `useRef(live)` seeds
from whatever was live at mount; `live.top || previous.top` then keeps a 0
until some non-zero arrives. A configuration change landing while the bars are
hidden can leave the two refs holding different values, permanently.

A mismatch of d shifts the whole screen up by d: the strip goes off the top
(no surah name, no juz) and the first line clips. One mechanism, both reported
symptoms, and only on hardware whose top inset changes while the bars are
hidden -- which is a fold and nothing else here.

**Instrument before fixing:** log both values together on a page turn. They are
in different components, so the cheap probe is a temporary `testID` carrying
each, read with `uiautomator dump`. Confirm they diverge before changing
anything.

**Reproduce:** mushaf tab at `fold8-wide`, then the three portrait Folds, each
BOTH cold-started at that geometry and reached by changing geometry live while
the app is foregrounded. Suspect 2 predicts the clip appears only in the live
arm and never on a cold start -- that pairing is the control, and it is now the
only hypothesis left, so a clip on a cold start means neither suspect is right
and the investigation reopens.

**Fix if the control confirms it:** the two call sites must not each hold their
own copy. Lift the held inset to one provider read by both, so there is a
single value that cannot disagree with itself -- the same reasoning §2 gives
for not forking a shared package, applied to state. Do not paper over it by
having the mushaf read the live inset: the docstring explains what that costs
(every mounted tab reflows twice per chrome toggle, ruling 2).

**Test:** drive the two consumers through one provider with a top inset that
goes non-zero, to 0, then to a DIFFERENT non-zero, and assert the padding and
the margin still cancel. Mutation-check by restoring the per-call-site ref.

## Defect C — root chips wrap two-per-line on an S22 Ultra

**Symptom:** on an S22 Ultra, 2 chips per row where the OnePlus, S24 and Tab
S10+ all fit 3.

**Why width alone cannot explain it:** S22 Ultra is 384dp at stock, the S24 is
360dp. The narrower phone fits MORE. So the variable is not the window.

**Suspect:** `src/components/FormFilterChips.tsx` lays its chips out as
`flexDirection: 'row', flexWrap: 'wrap', gap: 7` with each chip sized by its
own content (`paddingHorizontal: 11`, `typography.caption`). Nothing caps a
chip or reserves a column count, so the wrap point moves with **font scale**:
a user who has turned One UI's font size up widens every chip and pushes the
third one over. `src/components/EntryHeader.tsx` wraps the same way and would
have the same defect.

**Sweep to find the breaking point:** on the S24, hold width at 360dp and walk
`settings put system font_scale` through 1.0, 1.1, 1.3, 1.5, 1.8; then hold
font_scale at 1.0 and walk density 480, 540, 600. Screenshot a root entry at
each. Record the first combination where three chips become two.

`settings put` is blocked on the OnePlus but the S24 is a different vendor
build -- verify it takes, and restore with `settings put system font_scale 1.0`
on every exit path, the way `sweep.sh` restores geometry.

**Fix once the breaking point is known:** give the chips a `flexBasis` and
`flexGrow` so the row commits to a column count instead of letting content
decide, the way `AlphabetGrid` already does for its ten tiles -- that component
is the in-repo precedent and its comment already reasons about the 360-412dp
band. Apply to `FormFilterChips` and `EntryHeader` together.

**Test:** the chip row must keep its column count with a doubled font scale.
`useWindowDimensions().fontScale` is what `AyahMedallion` already reads, so the
shim can drive it.

## Risks

| risk | mitigation |
|---|---|
| "Fold 8" geometry is invented, so a pass proves less than it looks | Logged as a stand-in, never as a tested model. Run all four Fold geometries, report per-geometry. |
| A live `wm size` change is not a real fold | Stated as a limitation in the log. It does fire a configuration change, which is the mechanism Defect A turns on. |
| `settings put system font_scale` blocked or not restored | Verify it takes before the sweep; restore in a trap, and assert the restored value. |
| Fixing B on the wrong suspect | The cold-start control decides it. No fix before the control runs. |

## Acceptance criteria

- Each of A, B, C is either reproduced with a screenshot naming the geometry,
  or recorded as NOT REPRODUCED with what was tried. No fix lands without one.
- Every fix ships with a test that fails when the fix is reverted.
- `wm size`, `wm density` and `font_scale` are all back to stock on both
  devices, asserted rather than assumed.
- The four Fold geometries are each reported pass/fail for the mushaf top.
