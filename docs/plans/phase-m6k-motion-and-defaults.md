# Phase M6k — motion and defaults

Four owner reports from the 2026-08-31 device session, one branch
(`feat/m6k-reader-and-bookmark-motion`), one PR. No up-front plan: the owner
chose "one branch, one PR" over a plan file, so this doc is the record and the
verification log, not the brief.

**Owner rulings (2026-08-31, via AskUserQuestion):**

- **Dense** — "Default + migrate once". Change `defaultSettings` *and* rewrite a
  stored `hybrid` to `dense` exactly once. Picker stays.
- **Mode switch** — "Never blank, land exact". Keep the list mounted, hold the
  old rendering on screen while the new one lays out behind it, cross-fade. No
  spinner ever, and still land on the same ayah.
- **Delete motion** — "Slide out sideways", then the list closes the gap.
- **Order** — Dense first, Verse second, in both the words screen and Settings.

§5 applies: `ac36368` writes the on-device user DB, so this branch needs a
user-triggered `/code-review` before merge.

---

## What shipped

| commit | what |
| --- | --- |
| `ac36368` | `wbwDensity` defaults to `dense`; one-time `migration.wbwDensityDense` rewrite of a stored `hybrid`; Dense before Verse in `WbwScreen` and `SettingsScreen` |
| `6ed3e47` | a deleted bookmark slides off the left edge, then its row collapses; the negative `marginBottom` pays back the list `gap` so nothing jumps |
| `2fafaae` | a mode switch mounts the incoming rendering under the one on screen, lands it, then cross-fades — no spinner, no blank |
| `8e183d4` | every reader layer takes the same wrapper, so dropping the spent one does not remount the survivor |
| `0a178e3` | the outgoing layer fades out as the incoming one fades in, so the switch is a cross-fade and not two renderings printed over each other |
| `b00675a` | the docked-bar backing moves into `GlassSurface` behind a `docked` prop, fully opaque; both bars drop their `opacity: 0.94` copy |

`8e183d4` is the device finding: see the verification log.

---

## Verification log — device run 2026-09-01

OnePlus 7 Pro (GM1917), Android 12, 1440×3120, density override 640 (**1 dp =
4 px**). Local release APK, debug-signed, versionCode 1, installed
`adb install -r --user 0`.

**No `screenrecord` on this device.** OxygenOS denies `shell` exec of
`/system/bin/screenrecord` (`Permission denied` under SELinux `u:r:shell:s0`),
so motion is captured as a burst of on-device `screencap -p` — 139 ms/frame,
~7 fps — with the tap injected from inside the same device-side loop. That is
enough to catch a blank frame or a stalled fade; it is not enough to count the
frames of a 180 ms slide, which is sampled instead.

### 181 — dense is the default, Dense comes first · **PASS**

- Morphology tab opens on the word-by-word screen in **dense** rendering.
- Its control reads **Dense · Verse**, in that order, Dense selected.
- Settings → Word by word: same order, `chk=true` on Dense, accent border +
  accent bold label + tinted fill.
- **Migration is once-only, proved on the owner's own DB:** set the picker to
  Verse (stores `hybrid`), `am force-stop`, cold relaunch — still Verse. A
  missing `migration.wbwDensityDense` guard would have rewritten it back to
  Dense on that launch. Restored to Dense afterwards.

### 183 — mode switch deep in a long surah · **FAIL, then fixed**

Deep-linked `qurancorpus://surah/2?ayah=255` cold, then tapped Translation
under a 22-frame burst.

| frames | what the pixels show |
| --- | --- |
| b01–b10 | mushaf 2:255, unchanged (the tap has not landed yet) |
| b11–b13 | **both renderings on screen at once** — mushaf beneath, translation fading in over it. This is the fix working. |
| b14 | **98.0 % flat background, 19 ink pixels — blank, with the spinner** |
| b15–b24 | translation 2:255, landed |

So the cross-fade was right and the blank was still there, after it.

**Cause.** `dropSpentLayers` shrinks the array, so the survivor moves from index
1 to index 0. Index 0 returned its `AyahList` bare while every other index
wrapped it in an `Animated.View`. Changing the element type at a position is an
unmount: React rebuilt the landed list, and the rebuild re-ran the landing from
scratch behind the spinner on an empty screen — the exact blank the layering
exists to remove. The `key` was already stable (`layer.id`, not the mode); the
wrapper was not.

**Fix** (`8e183d4`): every layer takes the same `Animated.View` and differs only
by style — `[absoluteFill, incomingStyle]` while arriving, `{flex: 1, opacity:
1}` at rest. The resting style sets opacity explicitly, because dropping an
animated style off the array does not by itself repaint the value it left.

Mutation-checked: restoring the `if (index === 0) return list;` branch puts
`reader-positioning` back on screen and fails
`never blanks the reader while a mode switch lands`.

Re-run on the fixed build (2026-09-03): **PASS.** No blank, no spinner, both
directions.

### 182 — bookmark delete motion · **FAIL x3, then fixed**

The card slid out and the rows below still jumped up the moment it went.

**Cause.** The vertical space a row occupies has two owners: the row's own
height, and the list's `contentContainerStyle` gap between rows. Three rounds
went at the first owner only, so the collapse shrank the jump without removing
it. The third round tried to pull the gap up with a negative `marginBottom` on
the row's child; Yoga clamps a cell at zero height, so it did nothing at all.

**Fix** (`6f9dc25`): `rowExit` returns `maxHeight` **and** `marginBottom`
together, and the row owns both — `ROW_GAP` moved off the list and onto the
row, because spacing that has to animate cannot live on a container that is not
animating.

**Why three rounds and not one:** neither bookmarks-list mock forwards
`contentContainerStyle`, so no test in the suite can see the gap. Every round
passed the full suite and then failed on device. Noted at both call sites; the
gap in coverage is real and still open.

Re-run 2026-09-03: **PASS.**

### 184 — same switch under Reduce animations · **FAIL, then fixed**

Header and background gradient, no content. Reduced motion only; into mushaf
and into translation alike.

**Cause.** That branch wrote `incoming.value = 1` directly and dropped the
spent layer in the same tick. The direct write is scheduled onto the UI thread;
the drop re-renders the survivor with no animated style, which unregisters the
view before the write lands. The node keeps the opacity reanimated last
actually applied — 0, from the mount.

**Fix** (`9def462`): the cut goes through `withTiming(1, {duration: 0})`, so
the drop sits in the completion callback and cannot run before the value is
committed. Still a cut; deletes a branch rather than adding one.

Mutation-checked against `lands a reduced-motion switch through the fade, not
around it` — restoring the direct write fails it with `expected 0 to be greater
than 0`.

Re-run 2026-09-03: **PASS.**

### Bookmarks screen crash · **found 2026-09-03, fixed**

Opening Bookmarks took the app down. `rowExit`, added in `6f9dc25`, is called
inside `useAnimatedStyle` — the UI thread — without a `'worklet';` directive.
Reanimated throws rather than hopping threads, and the throw takes the screen
with it. `swipePanel.ts`'s three exports have carried the directive since they
were extracted; `6f9dc25` copied their shape and dropped it.

**Fix** (`64abf95`). Its test asserts the *build contract* — directive present
and first in the body, the position the babel plugin matches on — because
vitest runs without that plugin and the mocks call worklets as ordinary JS, so
no behavioural test in this repo can tell a workletized function from a plain
one.

## Still owed an owner decision

**Mode-switch latency.** Tap the pill, ~220 ms of nothing before anything
moves. `PILL_SETTLE_MS = 220` (measured, defers `onChange` out of the pill
spring) plus the arriving layer mounting `initialNumToRender = initialIndex + 1`
rows — ~255 for 2:255 — before `scrollToIndex` retries. Both values were
measured on device; shortening either brings back jank that was measured too. A
real fix wants `getItemLayout`, which variable-height ayah rows do not permit.
Options: leave it, or spend a phase on fixed-height row estimation.

---

## Found on the way, fixed on owner instruction (`b00675a`)

- **Neither docked bar was opaque.** `GlassTabBar` and `RecitationBar` each
  carried their own copy of the opaque backing at `opacity: 0.94`; on the home
  screen the ayah-of-the-day text was legible straight through the tab labels.
  RN has no backdrop blur, so the 6 % bought bleed-through and nothing else.
  Fixed once rather than twice: the backing is now a `docked` prop on
  `GlassSurface`, and both bars deleted their hand-rolled version. Device
  check for it is pending with the rest of the run.

## Environment to restore before the run is called done

- Bookmark **Al-Isra 17:9** deleted while probing the delete path; re-create it.
- Word-by-word density left on **Dense** (where it started).
