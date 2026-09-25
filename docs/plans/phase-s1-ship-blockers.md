# Phase S1 — Ship Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the two things that must not ship unresolved — unexplained user-DB loss (#96) and the corpus GPL obligation (#39).

**Architecture:** No new subsystems. #96 is already defended in code (`restoreIfMissing` / `backUp` / `reportIfBrandNew` landed in `src/data/userDb.ts`, and `createUserDb` wires all three into the open path); what is missing is *evidence* about the cause, so T1 is a device experiment, not a feature. #39 adds one licence screen fed by a generated string module plus a written source offer pointing at the public repo.

**Tech Stack:** Expo RN (`apps/mobile`), expo-sqlite, expo-file-system/legacy, vitest + the project's rnHosts shim, `adb`.

**Spec:** This file. Upstream authority: `CLAUDE.md` §3 (OWASP), §10 (device checklist), §11 (data & legal), and issues #96 / #39. Owner rulings of 2026-09-24 are recorded inline below.

## Global Constraints

- Ship scope is **both** `apps/mobile` and `apps/web` (owner, 2026-09-24).
- User DB lives on the owner's phone and survives app updates: **every migration additive only**, no destructive write, ever.
- `adb install -r --user 0` always. An unqualified `adb install -r` once landed on user 10 and wiped user-0 data.
- `adb shell pm clear` and `adb shell settings put` are blocked on this device.
- The phone under `adb` is also the display for the terminal session: **never drive it unattended**, coordinate every device step with the owner.
- §5 independent review is required for anything writing the on-device user DB. T1 writes no code by default; if T1's Ruling arm adds code, it triggers `/code-review` (user-triggered, agent cannot launch it).
- Conventional Commits, scope `mobile` / `mobile/about` / `docs`.
- GPL remedy ruled by owner 2026-09-24: **bundle the full licence text + written source offer pointing at `github.com/J3ff4/quran-corpus`** (already public). No email address, no postal address in the shipped app.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/mobile/src/licenses/gpl-2.0.ts` (create, generated) | The GPLv2 as one exported string constant. Generated from the FSF's text, never hand-typed. See Step 1 for why it is a `.ts` module and not a bundled asset. |
| `apps/mobile/src/screens/LicenseScreen.tsx` (create) | Renders that constant. Scrollable, selectable, its own heading — the navigator draws the back arrow, exactly as `AboutScreen` has it. |
| `apps/mobile/app/license.tsx` (create) | Route for the above, matching `app/about.tsx`: a route file and nothing else. No `_layout.tsx` entry — see Task 2 Step 8. |
| `apps/mobile/src/testing/rnHosts.ts` (modify) | Forwards `selectable` as `data-selectable`. Today it lands in the raw prop spread and React drops it, so the assertion on it would be vacuous. |
| `apps/mobile/src/screens/AboutScreen.tsx` (modify) | Adds the source-offer block and the link into the licence route. |
| `apps/mobile/src/i18n/uiStrings.ts` (modify) | New keys `about.sourceOffer`, `about.viewLicense`, `license.title`. EN/UZ/RU. |
| `docs/plans/phase-s1-ship-blockers.md` (this file) | Verification log for T1 (§10: a milestone is not complete until the device result is recorded here). |

---

### Task 1: Establish what actually emptied the user DB (#96)

No code by default. This task buys a **fact**, and the fact decides whether
anything else in #96 is owed.

**Why it is not already answered:** the issue rules out the install
(`Retain data and using new`, `firstInstallTime` unchanged at 2026-08-31),
rules out vc29's code, rules out the cleanup loop and storage pressure. The
owner's recollection (2026-09-24) is that he **deleted the app and installed
fresh** in that window — which explains the loss completely but contradicts
both recorded install artefacts. One of the two is wrong. A test settles it;
argument does not.

**Files:**
- Modify: `docs/plans/phase-s1-ship-blockers.md` (the Verification Log at the
  foot of this file)
- Modify: nothing in `apps/mobile` unless Step 7's ruling says so

**Interfaces:**
- Consumes: the diagnostics already shipped in
  `apps/mobile/src/data/userDb.ts` — `reportIfBrandNew`, `restoreIfMissing`,
  `backUp`. All three already log to logcat with the `[user db]` prefix.
- Produces: a verdict written into #96 and into the Verification Log, plus
  a ruling on whether a user-facing export is owed.

- [ ] **Step 1: Agree the run with the owner, then seed known state**

The phone is the owner's and is also this session's display. Do not start
without their word.

```bash
adb logcat -c
```

Then, on device, with the owner driving or watching: bookmark 2:1, add a note
to it, set Arabic size to Large, set UI language to Russian. Four different
tables touched on purpose — `bookmarks`, `reading_history`, `settings` and
(via the read) `reading_days`, which is part of the set `countUserRows` sums.

Do not background a `logcat | grep > file &` pipe to collect this. A
background shell started inside an agent turn is killed at the turn boundary,
silently, and the log it was writing simply stops. Read the buffer with
`logcat -d` at each step instead, as below.

- [ ] **Step 2: Relaunch, THEN confirm the backup was written**

```bash
adb shell am force-stop com.qurancorpus.mobile
# relaunch from the launcher, or: adb shell am start -n com.qurancorpus.mobile/.MainActivity
adb logcat -d | grep "backed up"
```

The force-stop is load-bearing. `backUp` runs inside `createUserDb`, which is
memoized per process (`userDb.ts:21`, `:42`) — so the backup this session's
app took happened at *open*, before Step 1 seeded anything. Grepping without
a relaunch reads the previous state's backup and calls it evidence.

Expected: `[user db] backed up N rows to <documentDirectory>backups/quran-corpus-user.db.backup`,
N ≥ 4.

If it does not appear, STOP — `backUp` is not running, and that is a defect
that outranks the rest of this task. Report it and re-scope.

- [ ] **Step 3: Arm A — reinstall over the top (the update path)**

```bash
adb install -r --user 0 "$CLAUDE_JOB_DIR/tmp/app-release-vc55.apk"
```

Launch, and record: bookmark present? note present? Large? Russian?

Expected: **all four survive.** This arm is already known-good from the #96
investigation; it runs again as the control, because an arm that always
passes is what proves the arm that fails means something.

- [ ] **Step 4: Arm B — uninstall, then install fresh (the owner's recollection)**

```bash
adb uninstall com.qurancorpus.mobile
adb install --user 0 "$CLAUDE_JOB_DIR/tmp/app-release-vc55.apk"
```

Launch, and record the same four. Then:

```bash
adb logcat -d | grep "user db"
```

Expected: **all four gone**, and `[user db] creating a NEW quran-corpus-user.db`
in the log with a `SQLite` listing beside it. The backup does **not** save this
arm — it lives under `documentDirectory/backups`, which is inside app data and
goes with the uninstall. That is a limit of the design, not a bug in it, and
Step 7 rules on whether it is acceptable.

- [ ] **Step 5: Arm C — delete only the live DB, keep the backup (the restore path)**

This arm is the one that proves the shipped defence works at all. It needs a
debuggable build, because `run-as` is refused on the release APK
(`run-as: package not debuggable` — recorded in #96).

One exists already: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`
(90 MB, built 2026-09-01). It is far behind head, so it is only good for this
arm if the DB and backup layout it ships still match — check its versionCode
with `aapt2 dump badging` before trusting it, and rebuild debuggable from
`build-dbg.sh` if it does not. It is debug-signed, so it cannot install over
the release build: uninstall first, which means Arm C runs *after* Arm B.

```bash
# with a debuggable variant installed, and re-seeded: Arm B took the backup
# with it, so this arm starts from an empty user DB. Re-do Step 1's four
# values, then force-stop and relaunch once so backUp has written them.
adb shell run-as com.qurancorpus.mobile ls files/SQLite files/backups
adb shell run-as com.qurancorpus.mobile rm files/SQLite/quran-corpus-user.db
adb shell am force-stop com.qurancorpus.mobile
```

Relaunch. Expected: the four values are **back**, and logcat carries
`[user db] quran-corpus-user.db was missing and has been RESTORED from …`.

If a debuggable variant is not available this session, mark Arm C **blocked**
in the Verification Log with that reason — do not silently drop it, and do not
claim the restore works on the strength of its unit tests alone.

- [ ] **Step 6: Write the result into the Verification Log and into #96**

Record, per arm: what was seeded, what survived, the exact logcat lines.
Quote them; do not paraphrase.

```bash
gh issue comment 96 --body-file "$CLAUDE_JOB_DIR/tmp/s1-96-result.md"
```

- [ ] **Step 7: Rule, and act on the ruling**

Three outcomes, and only three:

1. **Arm B reproduces the loss and Arm A does not** → the owner's recollection
   is the cause, the recorded `firstInstallTime` belongs to a later install
   than the one that mattered, and #96 closes as *external, not a defect*.
   The shipped backup already covers every non-uninstall case.
   Close #96 with the evidence. **Nothing further is owed in this phase.**
2. **Arm A also loses data** → a live defect in the update path. Stop this
   plan, open a fresh issue with the logcat, and treat it as the top blocker.
3. **Neither arm reproduces** → the cause is still unknown and the phone has
   now run the instrumentation that would catch the next occurrence. Leave
   #96 open, labelled `needs-reproduction`, and state plainly in the Log that
   we are shipping with an unexplained one-off, defended but not explained.

Whatever the outcome, record it as
`Ruling: <decision> — <evidence> — <what it costs if wrong>`.

- [ ] **Step 8: Commit the log**

```bash
git add docs/plans/phase-s1-ship-blockers.md
git commit -m "docs(mobile): record the #96 user-DB survival matrix"
```

**Acceptance criteria:**
- All three arms run, or a blocked arm carries its reason.
- Every claim in the Log is backed by a quoted logcat line or an on-screen
  observation, never by inference.
- #96 is closed with evidence, or left open with a named reason.

**Risk:** Arm B destroys the owner's real bookmarks and notes on his own phone.
**Rollback:** Arm B is destructive by design and there is no undo — so before
Step 1, pull a copy off the device and keep it outside the app:
`adb shell run-as com.qurancorpus.mobile cat files/backups/quran-corpus-user.db.backup > "$CLAUDE_JOB_DIR/tmp/userdb-preS1.backup"` (debuggable build), or have the
owner confirm out loud that the current contents are expendable. Do not run
Arm B without one of the two.

---

### Task 2: Ship the GPL licence text and the written source offer (#39)

**Files:**
- Create: `apps/mobile/src/licenses/gpl-2.0.ts` (generated)
- Create: `apps/mobile/src/screens/LicenseScreen.tsx`
- Create: `apps/mobile/src/screens/LicenseScreen.test.tsx`
- Create: `apps/mobile/app/license.tsx`
- Modify: `apps/mobile/src/testing/rnHosts.ts`
- Modify: `apps/mobile/src/screens/AboutScreen.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`
- Modify: `apps/mobile/src/screens/AboutTab.test.tsx`

**Interfaces:**
- Consumes: `t(uiLocale, key)` from `@/i18n/uiStrings`;
  `useAppSettings()` from `@/settings/settingsStore`;
  `useThemeColors()` from `@/theme/themeContext`;
  `typography` from `@/theme/tokens`;
  `useListBottomPadding()` from `@/theme/useListBottomPadding`.
  **Not** `HeaderCard` — see Step 8.
- Produces: `export function LicenseScreen(): JSX.Element` — no props, it
  renders the one licence the app is obliged to ship. Route `/license`.

**Why this is a blocker, not backlog:** `about.sourceCorpus` already tells the
user "GNU General Public License" (`uiStrings.ts:498`). Naming a copyleft
licence while shipping neither its text nor an offer of source is the
non-compliant state — the string makes the obligation explicit and then does
not meet it. §11 requires attribution *per each source's licence terms*.

**Scope note:** the obligation attaches to **distribution** — the Android APK.
`apps/web` serves the corpus over a network, which GPLv2 does not treat as
distribution (no §13-style network clause; that is the AGPL), so no web-side
change is in this task. Do not add one. If the web app ever offers the corpus
DB as a download, that *is* conveying and this scope note stops applying.

- [ ] **Step 1: Generate the licence module**

The corpus (corpus.quran.com / Quranic Arabic Corpus) is GPLv2.

```bash
mkdir -p apps/mobile/src/licenses
curl -fsSL https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt \
  -o "$CLAUDE_JOB_DIR/tmp/gpl-2.0.txt"
wc -l < "$CLAUDE_JOB_DIR/tmp/gpl-2.0.txt"      # 338
sha256sum "$CLAUDE_JOB_DIR/tmp/gpl-2.0.txt"    # edaef632cbb643e4e7a221717a6c441a4c1a7c918e6e4d56debc3d8739b233f6

python3 - "$CLAUDE_JOB_DIR/tmp/gpl-2.0.txt" > apps/mobile/src/licenses/gpl-2.0.ts <<'PY'
import hashlib, json, sys
text = open(sys.argv[1], encoding='utf-8').read()
print('// GENERATED. Do not edit -- a reformatted GPL is not the GPL.')
print('// Source: https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt')
print(f'// sha256(text) = {hashlib.sha256(text.encode()).hexdigest()}')
print('// Regenerate with the python block in docs/plans/phase-s1-ship-blockers.md, Task 2 Step 1.')
print('export const GPL_2_0_TEXT = ' + json.dumps(text) + ';')
PY
```

**Why a `.ts` module and not a bundled asset.** The obvious move —
`assets/licenses/gpl-2.0.txt` plus `assetExts.push('txt')` — does not work.
Metro's `assetExts` does not inline file *contents*: an `import x from
'./a.txt'` under it yields an asset handle, not a string, so the screen would
render a module id and the fix would be a runtime `Asset.downloadAsync` +
`FileSystem.readAsStringAsync` — a file read that can fail on device, which is
precisely what this avoids. Vitest cannot resolve a bare `.txt` import either,
so the test would never run. A JSON asset would need `resolveJsonModule`,
which `packages/config/tsconfig/base.json` does not set. A generated `.ts`
needs no config anywhere and behaves identically under Metro and vitest.

`json.dumps` rather than a template literal: the GPL contains five backticks
(its ASCII `like this' quoting), and a template literal would need them
escaped by hand. A JSON string literal is a valid TS string literal, so the
generator cannot get the escaping wrong.

- [ ] **Step 2: Write the failing test**

Create `apps/mobile/src/screens/LicenseScreen.test.tsx`:

```tsx
import { createHash } from 'node:crypto';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GPL_2_0_TEXT } from '../licenses/gpl-2.0';
import { LicenseScreen } from './LicenseScreen';

// The store opens the user DB through expo-sqlite; every screen suite stubs
// it the same way (see AboutTab.test.tsx).
vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en' }),
}));

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());

describe('LicenseScreen', () => {
  afterEach(cleanup);

  it('carries the FSF text byte for byte', () => {
    // A hash, not a phrase. "Verbatim" is the whole legal requirement and a
    // phrase check passes on a text with a clause deleted -- which is the
    // shape of failure a generated file actually has.
    expect(createHash('sha256').update(GPL_2_0_TEXT, 'utf8').digest('hex')).toBe(
      'edaef632cbb643e4e7a221717a6c441a4c1a7c918e6e4d56debc3d8739b233f6',
    );
  });

  it('renders the licence body, not a summary of it', () => {
    render(<LicenseScreen />);
    // The operative clause. A screen that paraphrases the GPL does not
    // discharge the obligation, so assert on text only the real licence has.
    const body = screen.getByTestId('license-body').textContent ?? '';
    expect(body).toContain('GNU GENERAL PUBLIC LICENSE');
    expect(body).toContain('you must give the recipients all the rights that');
  });

  it('is selectable, so the text can be copied off the device', () => {
    render(<LicenseScreen />);
    // .getAttribute, not the jest-dom toHaveAttribute matcher: jest-dom is not
    // installed in this app (see the same note in DictionaryRow.test.tsx).
    expect(screen.getByTestId('license-body').getAttribute('data-selectable')).toBe('true');
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd apps/mobile && npx vitest run src/screens/LicenseScreen.test.tsx
```

Expected: FAIL — `Failed to resolve import "./LicenseScreen"`.

- [ ] **Step 4: Teach the test shim about `selectable`**

`rnHosts.ts`'s `host()` destructures every RN-only prop it maps and spreads
the rest; `selectable` falls into the spread, where React DOM drops a
`true`-valued unknown attribute outright. The assertion in Step 2 would
therefore fail whether or not the screen sets the prop — which is not a
failing test, it is an untestable one. Add it to `HostProps` and map it beside
`data-pointer-events`:

```ts
  // Mapped, not spread: React DOM drops a boolean-valued unknown attribute, so
  // a suite could never tell a selectable Text from a non-selectable one. It
  // is the practical half of "we gave you the licence" -- the user has to be
  // able to copy the terms off the device.
  'data-selectable': selectable ? 'true' : undefined,
```

- [ ] **Step 5: Implement the screen**

Create `apps/mobile/src/screens/LicenseScreen.tsx`:

```tsx
import { ScrollView, Text } from 'react-native';
import { t } from '@/i18n/uiStrings';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useListBottomPadding } from '@/theme/useListBottomPadding';
import { useAppSettings } from '@/settings/settingsStore';
import { GPL_2_0_TEXT } from '@/licenses/gpl-2.0';

/**
 * The GPLv2, verbatim.
 *
 * Not translated and not summarised: the licence's own terms are the thing
 * being conveyed, and a translation of them conveys something else. The UI
 * around it follows the app's locale; the body does not.
 *
 * Monospace because the GPL is laid out with hard line breaks -- set in a
 * proportional face its section numbering stops lining up.
 *
 * Shaped like AboutScreen, down to the heading: a plain ScrollView under the
 * navigator's own header. See Step 8 for why it does not wear a HeaderCard.
 */
export function LicenseScreen() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const paddingBottom = useListBottomPadding();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom, paddingHorizontal: 16, paddingTop: 12, gap: 12 }}
    >
      <Text
        accessibilityRole="header"
        style={{ color: theme.text, fontSize: typography.title, fontWeight: '700' }}
      >
        {t(uiLocale, 'license.title')}
      </Text>
      <Text
        testID="license-body"
        // Selectable so a user can copy the terms off the device, which is
        // the practical half of "we gave you the licence".
        selectable
        style={{
          color: theme.text,
          fontFamily: 'monospace',
          fontSize: typography.caption,
          lineHeight: 18,
        }}
      >
        {GPL_2_0_TEXT}
      </Text>
    </ScrollView>
  );
}
```

One `<Text>` holding 18 KB is the whole screen; device check 420 below is what
says whether it scrolls acceptably, and it is the reason 420 asks for the end
of the document rather than the top.

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd apps/mobile && npx vitest run src/screens/LicenseScreen.test.tsx
```

Expected: PASS, 3 tests.

- [ ] **Step 7: Mutation-check both assertions**

```bash
cp apps/mobile/src/screens/LicenseScreen.tsx "$CLAUDE_JOB_DIR/tmp/mut-license.tsx"
# (a) replace {GPL_2_0_TEXT} with the string "GNU General Public License v2"
# (b) separately, delete the `selectable` prop
cd apps/mobile && npx vitest run src/screens/LicenseScreen.test.tsx
```

Expected: (a) FAILS on `you must give the recipients`, proving the test
discriminates the real text from a name-check; (b) FAILS on `data-selectable`,
proving Step 4's shim change is what makes that assertion mean anything.

Also mutate the *generated* file: delete one clause from `gpl-2.0.ts`'s string
and confirm the sha256 test fails. A checksum assertion is the easiest kind to
write vacuously — against a hash computed from the file it is checking.

Restore by copying the scratch files back. **Never `git checkout` to undo a
mutation edit.**

```bash
cp "$CLAUDE_JOB_DIR/tmp/mut-license.tsx" apps/mobile/src/screens/LicenseScreen.tsx
```

- [ ] **Step 8: Add the route**

Create `apps/mobile/app/license.tsx`, exactly as `app/about.tsx` is written:

```tsx
import { LicenseScreen } from '@/screens/LicenseScreen';

// A route file, nothing else -- see app/about.tsx.
export default function LicenseRoute() {
  return <LicenseScreen />;
}
```

**No `_layout.tsx` entry.** There is no `about` entry to sit beside: only
`(tabs)`, `morphology` and `surah/[surahId]/words` are declared, and every
other stacked screen (about, settings, bookmarks, search) runs on the root
`Stack`'s default options — header shown, `title: ''`, so the navigator draws
the back arrow and nothing else. A screen only needs `headerShown: false` when
it draws its own `HeaderCard`, which is the two-back-buttons defect from M6e
(#25). This screen deliberately does not, so it needs no entry and gets the
one back button for free.

- [ ] **Step 9: Add the strings**

In `apps/mobile/src/i18n/uiStrings.ts`, add to the `UiStringKey` union:

```ts
  | 'about.sourceOffer'
  | 'about.viewLicense'
  | 'license.title'
```

EN:

```ts
    'license.title': 'GNU General Public License',
    'about.viewLicense': 'Read the GNU General Public License',
    // The written offer GPLv2 §3(b) asks for. It names a public repository
    // rather than an address because the source is already published there
    // (owner ruling, 2026-09-24) -- a postal or email offer in a shipped app
    // is a personal contact detail we would be distributing to everyone.
    'about.sourceOffer':
      'The complete corresponding source for this app, and for the corpus data it uses, is published at github.com/J3ff4/quran-corpus.',
```

UZ:

```ts
    'license.title': 'GNU General Public License',
    'about.viewLicense': 'GNU General Public License bilan tanishing',
    'about.sourceOffer':
      'Ushbu ilova va u ishlatadigan korpus maʼlumotlarining toʻliq manba kodi github.com/J3ff4/quran-corpus manzilida chop etilgan.',
```

RU:

```ts
    'license.title': 'GNU General Public License',
    'about.viewLicense': 'Открыть GNU General Public License',
    'about.sourceOffer':
      'Полный исходный код этого приложения и используемых им данных корпуса опубликован по адресу github.com/J3ff4/quran-corpus.',
```

The licence *name* stays untranslated in all three — it is the title of a
specific document, like a book. `strings` is typed
`Record<UiLocaleCode, Record<UiStringKey, string>>`, so a key missing from one
of the three is a type error, not a runtime blank.

- [ ] **Step 10: Write the failing About test**

Append to the `describe('AboutTab')` block in
`apps/mobile/src/screens/AboutTab.test.tsx`:

```tsx
  it('states where the source is and links to the licence', () => {
    render(<AboutTab />);
    expect(screen.getByText(/github\.com\/J3ff4\/quran-corpus/)).toBeTruthy();
    expect(screen.getByTestId('about-license-link')).toBeTruthy();
  });
```

`render(<AboutTab />)` is how every case in that file renders — there is no
`renderAbout` helper. The suite has no `expo-router` mock today and
`AboutScreen` is about to import `router`, so add one beside the existing
mocks, in the shape `SettingsTab.test.tsx` uses:

```tsx
const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('expo-router', () => ({ router: { push: mocks.push } }));
```

Run it: expected FAIL, `Unable to find an element by: [data-testid="about-license-link"]`.

- [ ] **Step 11: Add the block to AboutScreen**

In `apps/mobile/src/screens/AboutScreen.tsx`, after the `GROUPS` loop and
before the recitation group, render:

```tsx
      {/* GPLv2 obligations, discharged where the licence is named. The corpus
          credit above says "GNU General Public License"; naming a copyleft
          licence and then shipping neither its text nor an offer of source is
          the non-compliant state (#39). The offer points at the public repo
          rather than an address (owner ruling, 2026-09-24). */}
      <GlassSurface style={{ padding: 16, gap: 12, marginTop: 10 }}>
        <Text style={{ color: theme.mutedText, fontSize: typography.body }}>
          {t(uiLocale, 'about.sourceOffer')}
        </Text>
        <Pressable
          testID="about-license-link"
          accessibilityRole="link"
          onPress={() => router.push('/license')}
        >
          <Text style={{ color: theme.accent, fontSize: typography.body }}>
            {t(uiLocale, 'about.viewLicense')}
          </Text>
        </Pressable>
      </GlassSurface>
```

No `borderRadius` in the style: `GlassSurface` owns its own corner and border
(`radius?: keyof typeof radii`, default `card`), and passing one through
`style` forks the rule it exists to hold. Add `Pressable` to the
`react-native` import and `import { router } from 'expo-router';` at the top.

- [ ] **Step 12: Run the suite**

```bash
pnpm --filter @quran-corpus/mobile test
pnpm --filter @quran-corpus/mobile type-check   # both tsconfigs; plain `tsc --noEmit` misses the test one
pnpm --filter @quran-corpus/mobile lint
```

Expected: all green. No `@ts-ignore`, no disabled rules.

- [ ] **Step 13: Commit**

```bash
git add apps/mobile/src/licenses/gpl-2.0.ts apps/mobile/src/screens/LicenseScreen.tsx \
  apps/mobile/src/screens/LicenseScreen.test.tsx apps/mobile/app/license.tsx \
  apps/mobile/src/testing/rnHosts.ts apps/mobile/src/screens/AboutScreen.tsx \
  apps/mobile/src/screens/AboutTab.test.tsx apps/mobile/src/i18n/uiStrings.ts
git commit -m "feat(mobile/about): ship the GPL text and a written source offer

About has named the corpus GPL since M6i while shipping neither the licence
text nor an offer of source, which is the non-compliant state rather than a
missing nicety (#39, CLAUDE.md §11). The offer points at the already-public
repository instead of a postal or email address: an address in a shipped app
is a personal contact detail distributed to every user.

The licence body is verbatim and untranslated -- its own terms are the thing
being conveyed, and a translation of them conveys something else. It ships as
a generated .ts constant rather than a Metro asset: assetExts hands back an
asset handle, not a string, so a .txt would have meant a runtime file read
that can fail on device and an import vitest cannot resolve.

Closes #39"
```

**Acceptance criteria:**
- `sha256(GPL_2_0_TEXT)` is `edaef632…b233f6`, asserted in the suite rather
  than checked by eye.
- About shows the source offer; the link opens a scrollable, selectable, full
  licence with one back button.
- Tests green, type-check clean (both tsconfigs), lint clean, and every
  mutation in Step 7 actually failed.

**Risk:** an 18 KB string in one `<Text>` scrolls badly on a low-end device.
**Mitigation:** device check 420 reads to the end of the document, not the top.
**Rollback:** `git revert` the commit; no data, schema, persisted state or
build configuration is touched, so the revert is total.

---

### Task 3: Device verification and the phase exit

**Files:**
- Modify: `docs/plans/phase-s1-ship-blockers.md` (Verification Log)

§10: a milestone is not complete until the on-device checklist has been run on
real hardware and recorded here. "Implementation complete, verification
pending" is an unmet exit criterion.

- [x] **Step 1: Build and install, coordinated with the owner**

```bash
bash "$CLAUDE_JOB_DIR/tmp/build55.sh"   # copy of build54.sh, versionCode bumped in app.json
```

`taskset -c 7,8` is mandatory. Never build while `expo start` runs.

- [x] **Step 2: Run these checks and record each verbatim**

Numbering starts at 419 because 409-418 were spent on the vc54 run
(2026-09-24, PR #98) — the gap above 408 in `phase-m12` is allocated, not free.

| # | Check | Pass |
| --- | --- | --- |
| 419 | About → source-offer paragraph is present and names the repo | ✅ |
| 420 | About → licence link opens the licence; the text is the real GPL, scrolls to the end | ✅ |
| 421 | Long-press the licence body selects text (copyable) | ✅ |
| 422 | One back button on the licence screen; back returns to About | ✅ |
| 423 | Offer + link read correctly under Russian and Uzbek UI | ✅ |
| 424 | TalkBack: the link announces as a link with its label | deferred → #100 |

- [x] **Step 3: Fill the Verification Log below and commit**

```bash
git add docs/plans/phase-s1-ship-blockers.md
git commit -m "docs(mobile): record the S1 device run"
```

**Acceptance criteria:** every row above carries PASS, FAIL or a blocked
reason. No row left blank.

---

## Risks and Rollbacks (phase level)

| Risk | Mitigation | Rollback |
| --- | --- | --- |
| Arm B of T1 destroys the owner's real reading data | Pull a copy off-device first, or get the owner's explicit "expendable" | None — irreversible by design, which is why the copy is a precondition |
| T1 finds Arm A also loses data | Stop the phase, open a blocker issue | n/a — this is a discovery, not a change |
| Arm C's debug APK is too old to be evidence | Check its versionCode before trusting it; rebuild from `build-dbg.sh` otherwise | Mark Arm C blocked with the reason |
| GPL text fetched from a mirror rather than the FSF | `sha256` = `edaef632…b233f6` (338 lines, 17,984 chars), asserted in the suite, and the URL is pinned in Step 1 | Re-fetch and regenerate |

## Verification Log

### T1 — user-DB survival matrix

Run 2026-09-25 00:00-00:10 UTC, OnePlus 7 Pro (GM1917), Android 12 / SDK 31,
`com.qurancorpus.mobile` **vc54** (`app-release.apk`, built 2026-09-24 07:33).

**Deviations from the plan as written, and why:**

1. The plan names `app-release-vc55.apk`. No such artefact exists; the build
   under test is **vc54**, the same one installed on the phone since
   2026-09-24 07:33. Verified with `aapt2 dump badging`: `versionCode='54'`.
2. **Step 1's four seeded values were not planted.** Seeding needs taps, and
   the phone under `adb` is this session's display. `[user db] backed up N
   rows` is a machine-readable proxy for the whole row set — `countUserRows`
   sums `bookmarks + reading_history + reading_days + root_views + settings`
   (`userDb.ts:255-261`) — so the arms are scored on that count plus the
   create/restore lines, not on four on-screen values. The baseline was
   established the same way before Arm A.
3. **No off-device copy was taken. It is not possible on this device.**
   `adb backup -noapk` exits 0 and writes a 47-byte file: the
   `ANDROID BACKUP` header plus an empty deflate stream. Android 12 dropped
   app data from `adb backup` unless the app is `android:debuggable`;
   `android:allowBackup="true"` does not override it. Making the build
   debuggable changes nothing for this purpose — it needs an install, and the
   installed release was not debuggable. The owner ruled the data
   **expendable** (2026-09-25): *"i dont nees thosw bookmarks or other
   stuff"*. The phase-level risk row above is therefore resolved by consent,
   not by a copy, and the plan's stated precondition was waived knowingly.

**Baseline**, before any arm — `am force-stop` then relaunch, which is what
makes the reading honest (`backUp` runs inside the memoized `createUserDb`,
`userDb.ts:21`/`:42`):

```
09-24 23:53:36.401 I ReactNativeJS: [user db] backed up 19 rows to file:///data/user/0/com.qurancorpus.mobile/files/backups/quran-corpus-user.db.backup
```

19 rows live. No `creating a NEW` line, no `RESTORED` line. This also settles
Step 2 on its own terms: **`backUp` runs, and it runs at every open.**

| Arm | Baseline | After | Logcat | Verdict |
| --- | --- | --- | --- | --- |
| A — `install -r --user 0` | 19 rows | 19 rows, `firstInstallTime` unchanged `2026-08-31 15:57:23` | `[user db] backed up 19 rows to …/backups/quran-corpus-user.db.backup` | **PASS** — survives |
| B — `uninstall` + fresh `install` | 19 rows | 0 rows, `firstInstallTime` moved to `2026-09-25 00:07:11` | `W [user db] creating a NEW quran-corpus-user.db -- if this device has run the app before, bookmarks, notes, history and settings have just been lost. file:///data/user/0/com.qurancorpus.mobile/files/SQLite holds: quran-corpus-m11b.db` | **PASS — reproduces the loss** |
| C — delete live DB only | 4 rows seeded | 4 rows, byte-identical | `W [user db] quran-corpus-user.db was missing and has been RESTORED from file:///…/files/backups/quran-corpus-user.db.backup. Anything saved since the last backup is not in it.` then `[user db] backed up 4 rows to …` | **PASS** — the shipped defence works |

Two secondary facts Arm B establishes, both of which #96 lists as open:

- The absence of a `backed up N rows` line on the fresh install is **correct
  behaviour, not a missing backup**: `backUp` returns early at `rows === 0`
  (`userDb.ts:219`). The sibling `the database is empty and a backup exists`
  warn is also correctly absent — the backup went with the uninstall, so there
  was nothing to keep.
- The `SQLite` listing in the warn names **only** `quran-corpus-m11b.db`. No
  orphaned `-wal` or `-shm` sidecar. #96's stale-sidecar candidate is dead for
  this path, and the loss is **selective** in the sense that matters: the
  corpus extract is re-created by `ensureCorpusDbFile` while the user DB is
  not, because nothing survives an uninstall to restore it from.

**Arm C, how it was run.** The existing `app-debug.apk` (2026-09-01) was
**rejected as evidence**: `restoreIfMissing` and `backUp` landed in `4729366`
on 2026-09-21, so that build predates the whole defence and could not test it.
Built a debuggable variant at head instead. The release buildType already signs
with `signingConfigs.debug` (`android/app/build.gradle:115`), so adding
`debuggable true` to it yields a **same-signature** APK that installs with
`install -r` over the top — no uninstall, and therefore no second data loss.
Reverted immediately after; the shipped `app-release.apk` was verified free of
`application-debuggable` and reinstalled, and `run-as` is refused again.

Arm B had left the DB at 0 rows, so the arm had to be seeded first. There is no
`sqlite3` on the device, so the DB was pulled with `run-as`, written locally
with python's `sqlite3`, and pushed back:

```bash
adb exec-out run-as com.qurancorpus.mobile cat files/SQLite/quran-corpus-user.db > seed.db
# insert bookmark 2:1 with note 'ARM C canary note', arabicSize=large, uiLanguage=ru
cat seed.db | adb shell 'run-as com.qurancorpus.mobile sh -c "cat > /data/user/0/com.qurancorpus.mobile/files/SQLite/quran-corpus-user.db"'
```

The inner quoting is load-bearing: written as `adb shell run-as … sh -c "cat >
…"`, the local shell strips the quotes and the **device's `shell` uid** performs
the redirect, which fails `Permission denied` against app-private storage. The
arm then ran as the plan specifies — `rm` the live DB, force-stop, relaunch —
and the restored file was pulled back and compared: bookmark `(2, 1, 'ARM C
canary note')` and settings `arabicSize=large`, `uiLanguage=ru` all present.

**Ruling: outcome 1 — #96 is external, not a defect.** Arm B reproduces the
symptom exactly and Arm A does not, so the cause is an uninstall-and-reinstall,
matching the owner's recollection. The recorded `firstInstallTime=2026-08-31`
and `Retain data and using new` are true of the install they describe and say
nothing about an uninstall preceding it — a reinstall resets `firstInstallTime`
and it then reads as continuous from that point on. The artefacts and the
recollection were never in conflict. Arm C independently shows the shipped
defence restores every non-uninstall case. **Cost if wrong:** we close an issue
whose real cause is a rare update-path defect that Arm A's single run did not
provoke — mitigated by the fact that the `creating a NEW` warn now ships, so a
recurrence is self-reporting rather than reconstructed.

**Residual, accepted not fixed:** the backup lives at `${documentDirectory}backups`,
inside app data, so it does not survive an uninstall. Covering that needs a
backup outside app data (SAF or a user-chosen location) — a user-facing export
feature, not a defence. Not a ship blocker: the loss it would prevent requires
the user to deliberately uninstall. Filed as #99 rather than built here.

**Device state at the end of the run:** clean vc54 (non-debuggable) installed,
4 rows (the Arm C canary). The owner's original 19 rows were destroyed by
Arm B with prior consent and are not recoverable.

### T3 — device checks 419-424

Build: vc55, non-debuggable (`aapt2 dump badging` carries no
`application-debuggable`), installed with `adb install -r --user 0` over vc55's
predecessor. `firstInstallTime` unchanged at `2026-09-25 00:07:11`; launch logged
`backed up 4 rows`, so the run did not disturb the user DB.

| # | Result | Note |
| --- | --- | --- |
| 419 | **PASS** | "419-yes" — source-offer paragraph present, names the repo |
| 420 | **PASS** | "420-yws. it opens", then confirmed scrolling past the end of the terms into the "How to Apply These Terms to Your New Programs" appendix. The 18 KB single-`<Text>` scroll risk did not land |
| 421 | **PASS** | "421-yes" — long-press selects the licence body |
| 422 | **PASS** | "422-1arrow. yes" — one back arrow, back returns to About |
| 423 | **PASS** | "423-pas" — offer + link read correctly under ru and uz |
| 424 | **DEFERRED** | "delay talkback" — tracked as issue #100 |

Logcat during the run held two `Choreographer: Skipped N frames!` lines (90 and
1052). Both were investigated and are **not** licence-screen jank: each is
bracketed by `OplusHansManager … F enter()` / `freeze uid:` / `unfreeze uid:`,
so the frame count is frozen wall-clock, not work. 1052 frames is ~11 s, which
no scroll spends. Do not read either line as the Task 2 risk landing.
