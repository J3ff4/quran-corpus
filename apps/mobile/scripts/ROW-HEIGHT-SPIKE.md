# Row-height spike — run sheet

Goal: decide whether a computed `getItemLayout` model can replace the reader's
25-attempt scroll retry loop, and with what error.

Why a model at all: ayah Arabic runs from 6 to 1213 characters (200x), so a
constant row height is not a candidate. The open question is whether
`H = a + b * ceil(chars / cpl)` tracks the real card closely enough that the
*cumulative* offset error — what `scrollToIndex` actually sums — stays small
deep in a surah.

## Setup

1. Reconnect the phone: `~/platform-tools/adb connect <phone-ip>:5555`
2. `cd apps/mobile && npx expo start --clear` (Metro's watcher is dead in this
   container — every edit needs `--clear`), open in Expo Go.
3. Start the capture before touching the app:

   ```
   ~/platform-tools/adb logcat -c
   ~/platform-tools/adb logcat -s ReactNativeJS:* | grep --line-buffered RHSPIKE | tee dump.txt
   ```

## Passes

Surah 73 (Al-Muzzammil) is the whole length range in 20 ayahs: 30 to 723
characters. Scroll it top to bottom, slowly enough that every card lays out.

| # | Mode        | Arabic size | Surah                  |
|---|-------------|-------------|------------------------|
| 1 | Mushaf      | Small       | 73, top to bottom      |
| 2 | Mushaf      | Medium      | 73, top to bottom      |
| 3 | Mushaf      | X-Large     | 73, top to bottom      |
| 4 | Translation | Small       | 73, top to bottom      |
| 5 | Translation | Medium      | 73, top to bottom      |
| 6 | Translation | X-Large     | 73, top to bottom      |
| 7 | Mushaf      | Medium      | 2:282 (longest ayah)   |
| 8 | Translation | Medium      | 2:282                  |

Three sizes, not two: two points cannot show whether height is linear in font
size, and if it is, one size-normalized model covers all four steps.

## Then

```
python3 apps/mobile/scripts/fit-row-heights.py dump.txt
```

It fits `cpl` per (mode, size, width) group and reports per-row rms/p95/max
plus the cumulative prefix drift. Cumulative is the number that decides the
phase: a model whose prefix error stays inside roughly half a screen (~400dp)
can drive `getItemLayout` with the existing retry loop kept only as a backstop;
one that drifts further cannot, and the phase becomes a measured height table
instead.

---

## Results — device run 2026-09-06 (OnePlus GM1917, Android 12, 360x780dp)

2451 measured rows. Every ayah of surah 73 and all 286 of Al-Baqara, in both
modes, at all four Arabic sizes (22/28/35/42). Captured by driving the device
over adb; `dump.txt` beside this file is the raw log.

### 1. No closed-form model lands `scrollToIndex` exactly

Worst cumulative prefix drift, `H = a + b * ceil(chars / cpl)`:

| size | mushaf | translation |
|------|--------|-------------|
| 22   |  84dp  | 225dp |
| 28   | 138dp  | 203dp |
| 35   | 176dp  | 243dp |
| 42   | 377dp  | 512dp |

The ~400dp bar holds at every size but the largest. Adding an English-length
term cuts per-row rms hard (23.2 -> 13.8dp at size 22) and yet leaves worst
prefix drift where it was, and at size 42 makes it *worse* (450 -> 532dp). The
residual is systematic, not independent noise, so more terms do not buy
cumulative accuracy. Treat ~500dp as the floor for any fitted model.

### 2. The plain linear form beats the line-count form, and is interpretable

`H = a + b*arabic_chars (+ c*english_chars)`:

| group            | rms    | worst prefix | a     | b     | c    |
|------------------|--------|--------------|-------|-------|------|
| mushaf 22        |  8.5dp |  96dp        |  93.8 | 0.512 | --   |
| mushaf 28        | 12.5dp | 154dp        |  91.4 | 0.847 | --   |
| mushaf 35        | 17.7dp | 160dp        |  95.6 | 1.343 | --   |
| mushaf 42        | 24.4dp | 484dp        | 101.0 | 1.955 | --   |
| translation 22   | 13.7dp | 215dp        | 169.3 | 0.474 | 0.720|
| translation 28   | 16.6dp | 276dp        | 168.6 | 0.850 | 0.702|
| translation 35   | 22.2dp | 264dp        | 169.8 | 1.371 | 0.706|
| translation 42   | 30.0dp | 484dp        | 174.0 | 1.929 | 0.775|

Three things fall out, and they collapse eight fits into one model:

- **`a` is the chrome**, and it barely moves with size: ~92-101dp mushaf,
  ~169-174dp translation. The gap between them is the card's own furniture.
- **`b` goes as size²** -- b/size² is 1.06e-3..1.11e-3 across all eight groups,
  within +-5%. Physically right: line height scales with size while characters
  per line scale with 1/size, so dp per character scales with the area. It
  should therefore also go as 1/width, though this run has only two widths
  (334dp mushaf, 360dp translation) and they are confounded with mode -- an
  unverified half of the law.
- **`c` does not move with Arabic size** (0.70-0.78) because the English block
  never scales. Confirms the second term is real and separable.

So: `H = a_mode + k * size² * arabic_chars + c * english_chars`, k ~= 0.00108.

### 3. `initialNumToRender = initialIndex + 1` lays out every row above the target

Opening 2:282 emits 282 onLayout events, and rows re-lay out up to 7 times
before settling (1440 layout passes for 282 rows at translation/42). The
settling is what the retry loop's content-height check is actually waiting on.
Bursts complete in 0.1-1.5s of wall time, so this is not the multi-second cost
the retry cap implies -- but it is real work that `getItemLayout` removes
entirely, because FlatList can then jump without measuring what it skips.

### Verdict

A model can drive `getItemLayout`, but it cannot be the thing that lands the
scroll. Land in two bounded steps instead of 25 unbounded ones: jump on the
model, then correct once against the target row's real measured offset, which
is exact regardless of model error.
