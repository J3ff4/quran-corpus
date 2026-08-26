# M6f Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn one-ayah play/pause into a real recitation experience: a scrub
bar, continuous play through the surah, background playback with lock-screen
controls, and a reciter picker — without adding a dependency.

**Architecture:** One long-lived `AudioPlayer`, not a player per ayah and not an
`AudioPlaylist`. `player.replace(nextUrl)` advances the surah on the same player
object, which is what keeps the lock-screen session attached
(`setActiveForLockScreen` exists on `AudioPlayer` and **not** on
`AudioPlaylist` — verified in `expo-audio@57.0.3`'s own types). `preload()` warms
the next ayah while the current one plays, which is the only lever available
against the seam between per-ayah mp3s. Reciters become a validated table in
`packages/data`, so a reciter id can never reach a URL path unchecked.

**Tech Stack:** `expo-audio` 57.0.3 (already a dependency) and its config
plugin. **No new dependency** — the foreground service, the media session and
the two permissions all come from `expo-audio/plugin/build/withAudio.js`, via an
`app.json` entry plus a prebuild.

**Spec:** `docs/plans/phase-m6-glass-redesign.md`, decisions 35–40.
Mockup `1e` (docked recitation bar).

## Global Constraints

Inherited from the umbrella plan. Sub-phase specifics:

- **§5 fires.** `packages/data` change, and the reciter id is a trust boundary
  (it becomes a URL path segment). Stop after Task 6 and ask.
- **Decision 37: Alafasy is excluded outright.** Not in the table, not as a
  fallback, not in a comment as a "maybe later". If a reviewer suggests adding
  him, decline and cite this line.
- **Decision 38: Husary is the default.** Abdur-Rashid Sufi has no per-ayah
  source; the whole playback path is per-ayah. Do not add a whole-surah code
  path to accommodate one reciter.
- **Decision 40:** prefer 64 kbps, fall back to the highest available. **No
  caching this phase** — no download, no offline audio, no file writes.
- The existing teardown order in `ayahAudio.ts` (`subscription.remove()`,
  then `player.remove()`, then `player.release()`) fixed a real per-ayah leak.
  Preserve it. Read that comment before touching the file.
- Branch: `feat/m6f-audio`. Device checks 79–88.

---

### Task 1: The reciter table

**Files:**
- Modify: `packages/data/src/audio.ts`
- Create: `packages/data/tests/audio.test.ts` (or extend, if one exists)
- Modify: `packages/data/src/mobile.ts` (re-export)

**Interfaces:**
- Produces, from `@quran-corpus/data/mobile` and the barrel:

```ts
export interface Reciter {
  id: string;            // stable app-side id, e.g. 'husary'
  folder: string;        // everyayah.com path segment
  label: string;         // display name, English
  bitrateKbps: 64 | 128;
}
export const RECITERS: readonly Reciter[];
export const DEFAULT_RECITER_ID: string;         // 'husary'
export function reciterById(id: string): Reciter | null;
export function ayahAudioUrl(surahId: number, ayahNumber: number, reciterId?: string): string;
```

Every folder below returned HTTP 200 for `002255.mp3` when probed on
2026-08-24. Re-probe before shipping — an upstream folder rename is silent.

| id | folder | label | kbps |
| --- | --- | --- | --- |
| `husary` | `Husary_64kbps` | Mahmoud Khalil Al-Husary (Murattal) | 64 |
| `husary-muallim` | `Husary_Muallim_128kbps` | Al-Husary (Muallim) | 128 |
| `husary-mujawwad` | `Husary_Mujawwad_64kbps` | Al-Husary (Mujawwad) | 64 |
| `minshawy` | `Minshawy_Murattal_128kbps` | Mohamed Siddiq El-Minshawi (Murattal) | 128 |
| `minshawy-mujawwad` | `Minshawy_Mujawwad_64kbps` | El-Minshawi (Mujawwad) | 64 |
| `abdul-basit` | `Abdul_Basit_Murattal_64kbps` | Abdul Basit (Murattal) | 64 |
| `sudais` | `Abdurrahmaan_As-Sudais_64kbps` | Abdurrahman As-Sudais | 64 |
| `shuraym` | `Saood_ash-Shuraym_64kbps` | Saud Al-Shuraim | 64 |
| `shatri` | `Abu_Bakr_Ash-Shaatree_64kbps` | Abu Bakr Al-Shatri | 64 |
| `ayyoub` | `Muhammad_Ayyoub_64kbps` | Muhammad Ayyoub | 64 |

Ten reciters, inside decision 39's 8–12 band. Muallim and Minshawy-Murattal are
128 kbps because everyayah has no 64 kbps folder for them — that is decision
40's "highest available" fallback, resolved at authoring time rather than at
runtime, because the answer is a fixed property of the host.

**Owner ruling 2026-08-24: Husary is the default on both products.**
`ayahAudioUrl` is shared, so the web reader's recitation changes from
`Abdul_Basit_Murattal_64kbps` to `Husary_64kbps` with it. That is intended — do
not pin the old reciter at web's call site to "keep web unchanged", and do not
split the helper in two. This is the one deliberate web-visible change in all of
M6; note it in the PR body so it is not read as an accident.

- [x] **Step 1: Write the failing test**

```ts
describe('reciters', () => {
  it('excludes Alafasy', () => {
    // Owner ruling, umbrella decision 37. Alafasy is the default in most Quran
    // apps and in the design mockup, so this is exactly the entry a later
    // "helpful" edit adds back.
    const text = JSON.stringify(RECITERS).toLowerCase();
    expect(text).not.toContain('alafasy');
    expect(text).not.toContain('afasy');
  });

  it('defaults to Husary', () => {
    expect(DEFAULT_RECITER_ID).toBe('husary');
    expect(reciterById(DEFAULT_RECITER_ID)?.folder).toBe('Husary_64kbps');
  });

  it('has unique ids and folders', () => {
    expect(new Set(RECITERS.map((r) => r.id)).size).toBe(RECITERS.length);
    expect(new Set(RECITERS.map((r) => r.folder)).size).toBe(RECITERS.length);
  });

  it('offers between eight and twelve reciters', () => {
    expect(RECITERS.length).toBeGreaterThanOrEqual(8);
    expect(RECITERS.length).toBeLessThanOrEqual(12);
  });
});

describe('ayahAudioUrl', () => {
  it('builds a per-ayah url for the named reciter', () => {
    expect(ayahAudioUrl(2, 255, 'sudais'))
      .toBe('https://everyayah.com/data/Abdurrahmaan_As-Sudais_64kbps/002255.mp3');
  });

  it('refuses a reciter it does not know', () => {
    // The trust boundary. This value comes from a persisted setting, so a
    // corrupted or hand-edited row must not be able to steer the path -- and
    // '../..' as a folder is a directory traversal against the audio host.
    for (const bad of ['', '../..', 'alafasy', 'Husary_64kbps', 'husary ']) {
      expect(() => ayahAudioUrl(2, 255, bad)).toThrow(RangeError);
    }
  });

  it('still validates the coordinates', () => {
    expect(() => ayahAudioUrl(0, 1, 'husary')).toThrow(RangeError);
    expect(() => ayahAudioUrl(1, 999, 'husary')).toThrow(RangeError);
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/data test audio`
Expected: FAIL — no `RECITERS`.

- [x] **Step 3: Implement**

Keep the existing coordinate validation in `ayahAudioUrl` exactly as it is and
add the reciter lookup in front of the path build:

```ts
export function ayahAudioUrl(surahId: number, ayahNumber: number, reciterId: string = DEFAULT_RECITER_ID): string {
  // ... existing surahId / ayahNumber RangeError checks, unchanged ...

  // Looked up, never interpolated. This value comes from a row in the
  // on-device settings table, and it lands in a URL path -- a folder of
  // '../..' would walk off the audio host entirely. The table is the
  // allowlist.
  const reciter = reciterById(reciterId);
  if (!reciter) throw new RangeError(`Unknown reciter ${reciterId}`);

  const surah = String(surahId).padStart(3, '0');
  const ayah = String(ayahNumber).padStart(3, '0');
  return `${AYAH_AUDIO_ORIGIN}/data/${reciter.folder}/${surah}${ayah}.mp3`;
}
```

Keep `AYAH_AUDIO_ORIGIN`. Replace `AYAH_AUDIO_RECITER` / `AYAH_AUDIO_ATTRIBUTION`
with per-reciter values. Grep for both across `apps/web` as well as
`apps/mobile` — web's reader and its credits copy both name Abdul Basit today,
and per the ruling above both must now say Husary — `uiStrings.ts` imports `AYAH_AUDIO_ATTRIBUTION`, so
update that call site to build the attribution from the active reciter.

- [x] **Step 4: Re-probe the folders**

```bash
for f in Husary_64kbps Husary_Muallim_128kbps Husary_Mujawwad_64kbps \
         Minshawy_Murattal_128kbps Minshawy_Mujawwad_64kbps Abdul_Basit_Murattal_64kbps \
         Abdurrahmaan_As-Sudais_64kbps Saood_ash-Shuraym_64kbps \
         Abu_Bakr_Ash-Shaatree_64kbps Muhammad_Ayyoub_64kbps; do
  printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -I "https://everyayah.com/data/$f/002255.mp3")" "$f"
done
```

Every line must read `200`. A `404` means the folder was renamed upstream —
find the new name or drop that reciter; do not ship a dead entry.

- [x] **Step 5: Run the tests, then mutation-check (§4)**

Run: `pnpm --filter @quran-corpus/data test` → PASS.
Then delete the `if (!reciter) throw` line and default `reciter.folder` to the
raw `reciterId`. Expected: the "refuses a reciter it does not know" test FAILS
on every entry. Restore by re-editing.

- [x] **Step 6: Commit**

```bash
git add packages/data/src/audio.ts packages/data/tests/audio.test.ts packages/data/src/mobile.ts \
        apps/mobile/src/i18n/uiStrings.ts apps/web
git commit -m "feat(data): make the reciter a validated choice, defaulting to Husary"
```

---

### Task 2: Background playback configuration

**Files:**
- Modify: `apps/mobile/app.json`
- Modify: `apps/mobile/src/audio/ayahAudio.ts`

**Interfaces:**
- Produces: `configureAudioSession(): Promise<void>` from `@/audio/ayahAudio`,
  called once from `app/_layout.tsx`.

- [x] **Step 1: Add the plugin entry**

`apps/mobile/app.json`, in `plugins`:

```json
      [
        "expo-audio",
        {
          "recordAudioAndroid": false,
          "enableBackgroundPlayback": true,
          "enableBackgroundRecording": false
        }
      ]
```

`recordAudioAndroid: false` is not optional. The plugin's default is `true`
(`withAudio.js`), which would put `android.permission.RECORD_AUDIO` in the
manifest of an app that never records — a permission the Play Store listing
would have to justify and a user would rightly refuse.

This entry gives us `FOREGROUND_SERVICE`,
`FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `MODIFY_AUDIO_SETTINGS` and the
`expo.modules.audio.service.AudioControlsService` service declaration. It does
**not** add `POST_NOTIFICATIONS` (the plugin only adds that for background
*recording*), so device check 83 exists to find out whether Android 13+ needs it
for the media notification. If it does, add it to `android.permissions` in
`app.json` and request it with
`requestNotificationPermissionsAsync()` before the first play — do not add it
speculatively.

- [x] **Step 2: Configure the session**

```ts
import { setAudioModeAsync } from 'expo-audio';

/**
 * Put the app's audio session in the mode recitation needs.
 *
 * `doNotMix` is not a preference: expo-audio's own docs make it a precondition
 * for lock-screen controls -- without exclusive focus the OS does not associate
 * the media session with our player. `shouldPlayInBackground` alone is not
 * enough either; on Android the OS stops background audio after roughly three
 * minutes unless a player has claimed the lock screen, which is what
 * setActiveForLockScreen does in the controller.
 *
 * Called once at startup rather than per play: the session is process-wide.
 */
export async function configureAudioSession(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: 'doNotMix',
    shouldPlayInBackground: true,
  });
}
```

Call it from `app/_layout.tsx`'s existing startup effect, and swallow its
rejection the way the reading-day write does — a failed session config must not
block the splash.

- [x] **Step 3: Prebuild and inspect the manifest**

```bash
cd apps/mobile && npx expo prebuild --platform android --clean
grep -n 'uses-permission\|AudioControlsService' android/app/src/main/AndroidManifest.xml
```

Expected: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`,
`MODIFY_AUDIO_SETTINGS`, the service line — and **no** `RECORD_AUDIO`.
`android/` is prebuild output and stays out of git (§7); do not commit it.

- [x] **Step 4: Commit**

```bash
git add apps/mobile/app.json apps/mobile/src/audio/ayahAudio.ts apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): enable background playback and the media session"
```

---

### Task 3: The recitation controller

**Files:**
- Modify: `apps/mobile/src/audio/ayahAudio.ts`
- Modify: `apps/mobile/src/audio/ayahAudio.test.ts`

**Interfaces:**
- Produces:

```ts
export interface RecitationState {
  ayah: number | null;
  playing: boolean;
  positionSec: number;
  durationSec: number;
  error: UiStringKey | null;
}
export function useRecitation(surah: number | null, ayahCount: number, reciterId: string): RecitationState & {
  toggleAyah: (ayah: number) => void;
  seekTo: (sec: number) => void;
  skipNext: () => void;
  skipPrevious: () => void;
  continuous: boolean;
  setContinuous: (on: boolean) => void;
};
```

`useAyahAudioController` is replaced, not kept beside this. Its request-id
guarding, its error keying and its teardown order all carry forward — port them,
do not rewrite them from scratch.

**Why one player and not `AudioPlaylist`.** `expo-audio@57` ships an
`AudioPlaylist` with `next()`/`previous()`, and it is the obvious fit for
continuous play. It has no `setActiveForLockScreen` — that method exists only on
`AudioPlayer` — so a playlist would trade decision 35's lock-screen controls for
a smoother advance. One `AudioPlayer` plus `replace()` keeps the media session
attached across ayahs, and `preload()` covers most of the seam. Record this in
the commit body; a reviewer will ask.

- [x] **Step 1: Write the failing tests**

Against a fake player implementing the same structural interface the existing
suite already fakes:

```ts
it('advances to the next ayah when continuous play is on', async () => {
  const player = fakePlayer();
  const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: true });

  r.toggleAyah(1);
  await player.finish();

  // The point of the whole feature. A controller that only clears state on
  // finish looks identical until you listen to it.
  expect(player.replaced).toEqual([ayahAudioUrl(1, 2, 'husary')]);
  expect(r.state().ayah).toBe(2);
});

it('stops at the end of the surah instead of wrapping', async () => {
  const player = fakePlayer();
  const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: true });

  r.toggleAyah(7);
  await player.finish();

  expect(player.replaced).toEqual([]);
  expect(r.state().playing).toBe(false);
});

it('does not advance when continuous play is off', async () => {
  const player = fakePlayer();
  const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: false });

  r.toggleAyah(1);
  await player.finish();

  expect(player.replaced).toEqual([]);
  expect(r.state().ayah).toBeNull();
});

it('preloads the next ayah while the current one plays', async () => {
  const player = fakePlayer();
  const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: true });

  r.toggleAyah(1);
  // The only lever we have against the gap between two per-ayah mp3s.
  expect(player.preloaded).toContain(ayahAudioUrl(1, 2, 'husary'));
});

it('clamps a seek to the track', async () => {
  const player = fakePlayer({ duration: 12 });
  const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: false });

  r.toggleAyah(1);
  r.seekTo(-5);
  r.seekTo(999);

  // The scrub bar reports a fraction of a width; a stale duration or a rotated
  // screen can put that outside the track, and ExoPlayer's behaviour past the
  // end is not something to find out on a user's device.
  expect(player.seeks).toEqual([0, 12]);
});

it('reports a failed load through the existing error key', async () => {
  const player = fakePlayer();
  const r = renderRecitation({ surah: 1, ayahCount: 7, player, continuous: true });

  r.toggleAyah(1);
  await player.fail('404');

  expect(r.state().error).toBe('reader.audioFailed');
  // And it must not keep marching through the surah on a dead network.
  expect(player.replaced).toEqual([]);
});
```

- [x] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @quran-corpus/mobile test ayahAudio`
Expected: FAIL.

- [x] **Step 3: Implement**

Shape:

- One `createAudioPlayer()` for the controller's lifetime; `replace(url)` to
  change ayah. Teardown on unmount keeps the documented
  `subscription.remove()` → `player.remove()` → `player.release()` order.
- `setActiveForLockScreen(true, { title: <surah name>, artist: <reciter label> })`
  on first play; `clearLockScreenControls()` on teardown.
- `playbackStatusUpdate` drives `positionSec` / `durationSec` for the scrub bar
  and fires the advance on `didJustFinish`.
- On advance: `preload(urlFor(ayah + 2))` — one ahead of the one just started.
- Every URL comes from `ayahAudioUrl(surah, ayah, reciterId)`. No string
  building at this layer.

- [x] **Step 4: Run the tests, then mutation-check (§4)**

Run: `pnpm --filter @quran-corpus/mobile test ayahAudio` → PASS.
Then change the end-of-surah guard to `ayah + 1 <= ayahCount + 1`. Expected:
"stops at the end of the surah" FAILS. Restore by re-editing.

- [x] **Step 5: Commit**

```bash
git add apps/mobile/src/audio/ayahAudio.ts apps/mobile/src/audio/ayahAudio.test.ts
git commit -m "feat(mobile): continuous recitation with scrub and lock-screen controls"
```

---

### Task 4: The full recitation bar

**Files:**
- Modify: `apps/mobile/src/components/RecitationBar.tsx` (from M6d)
- Modify: `apps/mobile/src/components/RecitationBar.test.tsx`
- Modify: `apps/mobile/src/components/SurahReader.tsx`

**Interfaces:**
- Produces, replacing M6d's four-prop shape:

```ts
export interface RecitationBarProps {
  ayahNumber: number | null;      // null = nothing playing, bar is not rendered
  playing: boolean;
  positionSec: number;
  durationSec: number;            // NaN until the track reports one
  continuous: boolean;
  reciterLabel: string;
  onTogglePlay: () => void;
  onSkipNext: () => void;
  onSkipPrevious: () => void;
  onSeek: (sec: number) => void;  // absolute seconds, never a 0..1 fraction
  onToggleContinuous: () => void;
  onOpenReciters: () => void;
  uiLocale: UiLocaleCode;
}
```

Grow M6d's chrome into the real transport: previous / play-pause / next, a
scrub track with elapsed and remaining, a continuous-play toggle, and the
reciter name as a tappable label that opens the picker (Task 5).

- [x] **Step 1: Write the failing tests**

```tsx
it('reports a scrub as a position in seconds, not a fraction', () => {
  const seekTo = vi.fn();
  render(<RecitationBar {...playing} durationSec={120} seekTo={seekTo} />);

  fireEvent.click(screen.getByTestId('recitation-scrub'), { clientX: 0.5 });
  // The controller clamps against the duration; handing it a 0..1 fraction
  // would seek to half a second on every track.
  expect(seekTo).toHaveBeenCalledWith(60);
});

it('shows elapsed and remaining time', () => {
  render(<RecitationBar {...playing} positionSec={65} durationSec={125} />);
  expect(screen.getByTestId('recitation-elapsed').textContent).toBe('1:05');
  expect(screen.getByTestId('recitation-remaining').textContent).toBe('-1:00');
});

it('labels every transport control for a screen reader', () => {
  render(<RecitationBar {...playing} />);
  for (const label of ['Previous ayah', 'Pause', 'Next ayah', 'Continuous play']) {
    expect(screen.getByLabelText(label)).toBeTruthy();
  }
});
```

- [x] **Step 2: Run them, watch them fail, implement, re-run**

`formatClock(sec)` is a pure helper — put it beside the component and test it
directly for `0`, `65`, `125`, `3600` and a `NaN` duration (a track whose
duration has not arrived yet must render `--:--`, not `NaN:NaN`).

- [x] **Step 3: Mutation-check (§4)**

Return the raw fraction from the scrub handler. Expected: the first test FAILS.
Restore by re-editing.

- [x] **Step 4: Commit**

```bash
git add apps/mobile/src/components/RecitationBar.tsx apps/mobile/src/components/RecitationBar.test.tsx \
        apps/mobile/src/components/SurahReader.tsx
git commit -m "feat(mobile): full transport in the recitation bar"
```

---

### Task 5: The reciter picker

**Files:**
- Modify: `apps/mobile/src/settings/settingsStore.tsx`
- Modify: `apps/mobile/src/settings/settingsStore.test.tsx`
- Create: `apps/mobile/src/components/ReciterSheet.tsx`
- Create: `apps/mobile/src/components/ReciterSheet.test.tsx`
- Modify: `apps/mobile/src/screens/SettingsTab.test.tsx` and the settings screen

**Interfaces:**
- Produces: `reciterId: string` + `setReciterId(id)` on the settings context;
  `<ReciterSheet onClose onSelect current />` built on the existing
  `BottomSheet`.

- [x] **Step 1: Write the failing tests**

```tsx
it('falls back to the default for an unknown stored reciter', async () => {
  // Same class as readerMode, and worse: this value reaches a URL builder.
  for (const bad of ['alafasy', '', '../..', 'Husary_64kbps']) {
    expect((await loadPersistedAppSettings(clientWith({ reciterId: bad }))).reciterId).toBe(DEFAULT_RECITER_ID);
  }
});

it('lists every reciter with the current one marked', () => {
  render(<ReciterSheet current="sudais" onSelect={() => {}} onClose={() => {}} uiLocale="en" />);

  expect(screen.getAllByRole('radio')).toHaveLength(RECITERS.length);
  expect(screen.getByLabelText(/As-Sudais/).getAttribute('aria-checked')).toBe('true');
});

it('never lists Alafasy', () => {
  render(<ReciterSheet current="husary" onSelect={() => {}} onClose={() => {}} uiLocale="en" />);
  expect(screen.queryByText(/afasy/i)).toBeNull();
});
```

- [x] **Step 2: Run them, watch them fail, implement, re-run**

Validate with `reciterById(value) !== null` in the settings guard — do not write
a second list of ids in `apps/mobile`. The picker is reachable from two places:
the recitation bar's reciter label and the Settings screen.

- [x] **Step 3: Mutation-check (§4)**

Drop the settings guard. Expected: the fallback test FAILS. Restore by
re-editing.

- [x] **Step 4: Commit**

```bash
git add apps/mobile/src/settings apps/mobile/src/components/ReciterSheet.tsx \
        apps/mobile/src/components/ReciterSheet.test.tsx apps/mobile/src/screens
git commit -m "feat(mobile): let the reader choose a reciter"
```

---

### Task 6: §5 stop, then build

- [x] **Step 1: Self-review**, with the OWASP question front and centre: can any
  value that is not in `RECITERS` reach a URL path? Trace the persisted setting
  through to `ayahAudioUrl`.
- [x] **Step 2: Stop and ask the owner to run `/code-review`** — `packages/data`
  plus a trust boundary (§5). Plain `/code-review`; never `ultra` unprompted.
- [x] **Step 3: Act on the findings.** One pass. 5 findings: 4 fixed (`de2b41d`, `37f9023`), the 5th (dead `api/audio.ts`) archived on the owner's ruling -- `git show a47c418:apps/mobile/src/audio/ayahAudio.ts` still has the endpoint's origin allowlist and payload validators if one is ever built.
- [ ] **Step 4: Build.** A prebuild is required this time — the manifest changed.

```bash
cd apps/mobile && npx expo prebuild --platform android --clean \
  && pnpm prebuild:assert-db && eas build --platform android --profile preview
```

---

### Task 7: Device run

Ten checks, and this is the sub-phase most likely to fail one.

| # | Check | Pass condition |
| --- | --- | --- |
| 79 | Play a single ayah | Audio starts within ~2s; the bar shows a moving position |
| 80 | Scrub | Dragging moves playback; elapsed and remaining stay correct |
| 81 | Continuous play through a surah boundary case (al-Fatiha, 7 ayahs) | Advances 1→7 then **stops**; does not wrap or restart |
| 82 | Lock the screen mid-ayah | Audio continues; lock-screen controls appear with surah and reciter |
| 83 | Lock-screen transport, Android 13+ | Play/pause/next work from the lock screen. If the notification never appears, `POST_NOTIFICATIONS` is needed — see Task 2 Step 1 |
| 84 | Listen across an ayah boundary | Judge the seam. A short gap is accepted; a gap over ~1s, or a stall, is a fail |
| 85 | Play with the device in silent mode | Recitation still plays (`playsInSilentMode`) |
| 86 | Incoming call or another audio app mid-recitation | Ours pauses; state is sane afterwards |
| 87 | Switch reciter mid-surah | Next ayah plays in the new voice; the choice survives an app restart |
| 88 | Airplane mode, then press play | A clear error, no spinner that never resolves, no crash |

Record every result below.

## Verification Log

| Check | Build | Date | Result | Notes |
| --- | --- | --- | --- | --- |
| 79 | Expo Go | 2026-08-26 | PASS | Audio started 336 ms after the tap (`dumpsys audio` sampled at ~100 ms on device). Position advanced 0:08 -> 0:11 while sounding. |
| 80 | Expo Go | 2026-08-26 | PASS | A drag along the track moved playback 0:08 -> 0:11 on a 14 s ayah; elapsed and remaining summed to the duration before and after. |
| 81 | Expo Go | 2026-08-26 | PASS | Seven playback spans, then silence held for the remaining 64 s of a 115 s sample. No wrap, no restart. |
| 82 | Expo Go | 2026-08-26 | PASS (audio) / BLOCKED (controls) | Audio survived both backgrounding and a real screen lock -- the second confirmed by the owner on the device. The lock-screen **controls** could not be tested at all: Expo Go's own manifest has none of our plugin's output, so the service never binds (`Failed to start the expo-audio playback service` on every play). `app.json` sets `enableBackgroundPlayback: true` and the prebuild manifest carries `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `AudioControlsService` and `MediaSessionService`, so this is Expo Go's ceiling, not ours. The controls half needs the EAS build. |
| 83 | — | 2026-08-26 | BLOCKED | Same service-binding failure. Note the device is Android 12 (SDK 31), so `POST_NOTIFICATIONS` is not exercised here -- the Android 13+ half of this check needs newer hardware or an emulator. |
| 84 | Expo Go | 2026-08-26 | PASS | Six seams across al-Fatiha: 622, 610, 532, 525, 537, 514 ms (mean 557 ms). Six more on a second run with a different reciter: 500-607 ms. Comfortably inside the 1 s ceiling, no stalls -- the one-ahead preload is doing its job. |
| 85 | Expo Go | 2026-08-26 | PASS | The phone was in silent mode (`settings get global mode_ringer` = 0) for the whole session and recitation played throughout. |
| 86 | Expo Go | 2026-08-26 | PASS (after fix `8c625b1`) | First run FAILED its second clause: focus was surrendered correctly, but the bar kept the **pause** icon over a clock frozen at 0:03 / -0:01 and silence, needing two taps to recover. Cause: the driver forwarded only `error` and `didJustFinish`, so an OS-initiated pause never reached `handleStatus`. Re-run against the fix: Brave taking focus stops us, the bar then reads `Ayah 3 · Play` with the position kept, and **one** tap resumes mid-ayah (1.67 s remainder) with continuous play carrying on through 4-7 at unchanged 500-620 ms seams. |
| 87 | Expo Go | 2026-08-26 | PASS | Husary -> Sudais from the bar's picker. Every al-Fatiha ayah then ran materially shorter (ayah 1: 2.73 s vs 4.92 s, ayah 5: 4.65 s vs 6.59 s), so the source changed rather than only the label. The choice survived a force-stop and relaunch. |
| 88 | Expo Go | 2026-08-26 | PASS | Run on-device inside an airplane-mode window, on a surah never played (3:1) so nothing could answer from the preload cache. Play produced `Unable to play audio` in red, the bar fell back to its Play icon, and `[audio] playback failed {"surah":3,"ayah":1...}` was logged. No spinner left hanging, no crash. |

Checks 79-81, 84-87 were driven over `adb` on the owner's OnePlus 7 Pro (GM1917, Android 12),
with playback confirmed against `dumpsys audio` rather than the UI alone.
