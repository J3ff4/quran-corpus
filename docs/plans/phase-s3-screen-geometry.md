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
