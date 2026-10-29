# Phase R1 — Play Store Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `apps/mobile` to Google Play production as **Quran Corpusly** (`com.qurancorpusly.app`) v1.0.0.

**Architecture:** No new subsystem. Five streams: (1) app identity + EAS production AAB, (2) opt-in Sentry + PostHog behind the existing `telemetry.ts` boundary and the existing Settings switch, (3) three release-blocking defects (#112, #106, #91), (4) legal: licence inventory, privacy policy on GitHub Pages, in-app link, (5) Play Console: listing, forms, 14-day closed test, RC QA on the Play-delivered build, production.

**Tech Stack:** Expo SDK 57 / RN, EAS Build (managed keystore), `@sentry/react-native` (EU), `posthog-react-native` (EU Cloud), vitest + rnHosts shim, `bundletool`, `adb`, GitHub Pages via Actions.

**Spec:** `docs/PRD-android-first-mobile-app.md` §10 "Android Release Hardening" + §11 acceptance criteria + §8.8; `CLAUDE.md` §3/§4/§5/§10/§11. Owner rulings 2026-10-29 below are binding and override the PRD where they differ.

**Numbering:** PRD §10 calls hardening "M8"; that slot went to global recitation. This phase is **R1** (release), not an M-number.

## Owner Rulings (2026-10-29)

| # | Ruling |
|---|---|
| R-1 | Telemetry = **Sentry + PostHog** (PRD §11 as written). |
| R-2 | Both **opt-in** via the existing Settings switch (`analyticsEnabled`, default `false`). Off = nothing sent. |
| R-3 | Sentry may send **stack traces, scrubbed**: no messages/exception values, no breadcrumbs, no device name, no IP (`sendDefaultPii: false`). |
| R-4 | Data region **EU**: Sentry `de.sentry.io`, PostHog `https://eu.i.posthog.com`. |
| R-5 | Play account: **personal**, not yet created → 12 testers / 14 days closed test before production access. |
| R-6 | Package id **`com.qurancorpusly.app`** (permanent). Display name **"Quran Corpusly"**. |
| R-7 | Build + sign via **EAS Build, EAS-managed upload keystore**. Play App Signing holds the app key. |
| R-8 | Licences: plan task verifies each source, **owner signs per row**. Release gated on every row Approved or Owner-accepted risk. |
| R-9 | Privacy policy on **GitHub Pages** of `J3ff4/quran-corpus`. |
| R-10 | In scope bugs: **#106, #112, #91 + TalkBack #100, #34**. Out: #110 #117 #121 #122 #89 #90. |
| R-11 | #112: paging the reader to another surah **keeps playing and shows a transport**. |
| R-12 | Store listing **en + uz + ru**. Target audience **13+**. Contact = **new dedicated address** (owner creates in T0). |
| R-13 | Android backup rules: **back up the user DB, exclude the corpus DB** (Task 8A). §5 applies (persisted device state). |
| R-14 | **F-Droid out of scope** for R1. The inline (non-pack) build is not a release artefact this phase; stripping SDKs for F-Droid is a later phase. |

## Global Constraints

- `apps/mobile` only. Web untouched except nothing. `packages/data` untouched (no schema change in this phase).
- New deps approved by R-1 only: `@sentry/react-native`, `posthog-react-native` + its Expo peers `expo-application`, `expo-localization` (not yet installed). Install via `npx expo install` (SDK-57-matched versions). `pnpm audit --prod` is workspace-wide: record a **baseline before** install; only **new** high/critical advisories → stop, ask.
- Telemetry keys are **not** in `app.json`. They come from `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`, set **only** in `eas.json` `production.env` (public client keys by design). Dev / Expo Go / preview builds get none → telemetry inert there.
- No `any` (`packages/config/eslint/index.js:6` `no-explicit-any: 'error'`); use `unknown` + narrow.
- Consequence of opt-in, accepted: errors before settings hydrate (corpus DB open, settings migration/hydration) are **not reportable**. Do not buffer them.
- Telemetry is a trust boundary (§3, §5): **allowlist by value**, never forward raw `Error`, raw event names or free text. Never Quran text, search text, notes, bookmarks content.
- Nothing leaves the device while `analyticsEnabled === false`, including before settings hydrate.
- Every telemetry call fails quiet: telemetry must never throw into a user path.
- `android/` is prebuild output, not in git. EAS prebuilds on its builder. `.easignore` replaces `.gitignore` for uploads — any new ignore rule must be mirrored there.
- Release AAB must be built with `EXPO_MUSHAF_ASSET_PACK=1` (S2: fonts in install-time pack; base download ≤ 200 MB).
- `targetSdkVersion` ≥ **36** (Play rule since 2026-08-31, PRD §8.7). minSdk 26.
- `versionCode` strictly increasing per upload. Start at **100**. `version` (versionName) `1.0.0`.
- `adb install -r --user 0` always. Phone under adb = owner's terminal display: coordinate every device step with owner.
- TalkBack cannot be driven over adb → TalkBack checks are owner-run.
- §4 loop per task incl. **mutation-check** of every new branch/validator. §5 `/code-review` fires on **T3–T5** (trust boundary; T5 also edits `settingsStore.tsx`, which writes the user DB) and **T8A** (on-device backup/restore); user-triggered — stop and ask.
- Conventional Commits, scopes `mobile`, `mobile/telemetry`, `mobile/about`, `mobile/mushaf`, `mobile/settings`, `docs`, `ci`.
- Outward-facing steps (accounts, uploads, Pages enable, store submit, PR open) = owner only or owner-approved per step.
- STATUS.md ledger written at merge, not inside open PRs.

## Review Focus

1. **Consent revoked mid-session** → no new event/crash leaves after the switch flips off; PostHog queue opted out before shutdown. Test in T3.
2. **Crash before settings hydrate** (consent unknown) → nothing sent; Sentry not initialised. Test in T4 (`TelemetryGate` test: provider default `false` → `applyTelemetryConsent(false, …)` only).
3. **Error message carrying user text** (e.g. SQLite error echoing a search term, a URL) → `exception.values[].value` scrubbed unless it is an allowlisted error code; `message` dropped. JS: T3 test. Native (Java/NDK, ANR — never reaches JS `beforeSend`): server-side scrub rules T0 Step 4 + RC-6 real-event inspection.
4. **Device name / IP** in Sentry context or PostHog auto-properties → dropped. Test in T3; PostHog props checked in T4 Step 1 + RC-6.
5. **Turning analytics OFF** emits nothing on the way out (no `setting_changed {analyticsEnabled:false}`); **OFF → ON in one session** resumes sending, once, no double handlers. T5 test + RC-6.
6. **Reader transports:** foreign track (mushaf/home, or reader's own other surah), **or own track paused then re-opened after paging away and back** → exactly one transport on screen. T6 (`SurahReader.test.tsx` + device).

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/mobile/app.json` (modify) | name, package, version, versionCode, `blockedPermissions`, Sentry + backup plugins; remove dead `extra.sentryDsn/posthogKey/posthogHost`. |
| `apps/mobile/eas.json` (modify) | `production` profile: AAB, pack env, telemetry keys; `preview.env.SENTRY_DISABLE_AUTO_UPLOAD`. |
| `.gitignore`, `.easignore` (modify) | `credentials.json`, `credentials/`, `*.keystore`, `*.jks` (keystore download lands in the project). |
| `apps/mobile/plugins/withBackupRules.js` + `.test.mjs` (create) | Auto Backup / device-transfer include-list: user DB backup copy only (T8A). |
| `apps/mobile/src/release/releaseConfig.test.ts` (create) | Pins identity + production profile so a rename/regression fails CI. |
| `apps/mobile/src/i18n/uiStrings.ts` (modify) | App name in `about.title`; telemetry switch copy; `about.privacyPolicy`. |
| `apps/mobile/src/screens/AboutScreen.tsx`, `MenuScreen.tsx` (modify) | Display name; privacy link; `pending` credit flags (T9). |
| `apps/mobile/src/telemetry/scrubEvent.ts` (create) | Pure Sentry `beforeSend` allowlist. |
| `apps/mobile/src/telemetry/consent.ts` (create) | `applyTelemetryConsent(enabled, config, sdks)` — init/teardown both SDKs. |
| `apps/mobile/src/telemetry/telemetry.ts` (modify) | `setTelemetryProviders()`; `telemetry` delegates to current providers. |
| `apps/mobile/src/telemetry/TelemetryConsent.tsx` (create) | Effect component bridging `analyticsEnabled` → `applyTelemetryConsent`. |
| `apps/mobile/app/_layout.tsx` (modify) | Mount `TelemetryConsent`; `app_opened`. |
| `apps/mobile/metro.config.js` (modify) | Wrap with `getSentryExpoConfig` (source maps), keep pack alias. |
| call sites (modify) | `openCorpusDb.ts`, `userDb.ts`, `settingsStore.tsx`, `ayahAudio.ts`, `app/surah/[surahId].tsx`, `MushafScreen.tsx`. |
| `apps/mobile/src/components/MiniPlayer.tsx` (modify) | `bottom` prop for the reader (#112). |
| `apps/mobile/app/surah/[surahId].tsx`, `src/components/SurahReader.tsx` (`SurahReader` + inner `AyahList`) (modify) | Foreign-track transport, parked-own-track seed, list clearance (#112). |
| `apps/mobile/src/screens/AboutScreen.tsx` (modify, T10) | Corpus data version line (PRD §6.8). |
| `apps/mobile/src/components/mushaf/MushafPage.tsx`, `MushafPager.tsx` (modify, T7 outcome) | Memory fix (#106). |
| `apps/mobile/src/screens/SettingsScreen.tsx` (modify) | Chip a11y (#91). |
| `docs/data-sources-m1.md` (modify) | Full licence inventory, owner sign-off column. |
| `site/privacy/index.html` (create) | Privacy policy en/uz/ru, static. |
| `.github/workflows/pages.yml` (create) | Deploy `site/` to Pages. |
| `docs/release/store-listing.md` (create) | Listing text en/uz/ru + Play form answers. Images live outside git: `~/quran-data/release/store-assets/` (§9 no large binaries). |
| `docs/plans/phase-r1-play-release.md` (this) | Verification log. |

---

### Task 0: Owner setup (owner only, no code)

Outward-facing. Agent prepares nothing here but the log fields.

- [ ] **Step 1:** Create dedicated contact mailbox (R-12). Record address in Verification Log `T0.contact`.
- [ ] **Step 2:** Create Play Console **personal** developer account ($25, ID verification, device verification). Record `T0.playAccount=done` + date. Verification can take days — do this first.
- [ ] **Step 3:** Sentry: create org + project (platform React Native) in **EU** region. Record `T0.sentryOrg`, `T0.sentryProject`, `T0.sentryDsn`. Create an **Organization Auth Token** (fixed scopes, fine for source-map upload); store as EAS secret, never in git:
  `eas env:create --name SENTRY_AUTH_TOKEN --value <token> --environment production --visibility secret`
- [ ] **Step 4:** Sentry project settings → Security & Privacy: enable **Data Scrubber**, **Use Default Scrubbers**, **Prevent Storing of IP Addresses**. Add **Advanced Data Scrubbing** rules: `[Remove] [Anything] from [$error.value]`, `[Remove] [Anything] from [$message]`, `[Remove] [Anything] from [contexts.device.name]`. Native Java/NDK crashes and ANRs are sent by sentry-android and never pass JS `beforeSend` — these rules are their only scrubber (R-3).
- [ ] **Step 5:** PostHog: create project on **EU Cloud**. Project settings: **disable** autocapture, session replay, heatmaps, surveys; enable **Discard client IP data**. Record `T0.posthogKey` (public `phc_…` key).
- [ ] **Step 6:** Repo Settings → Pages → Source = **GitHub Actions** (needed by T10).
- [ ] **Step 7:** Recruit ≥ 12 closed-test testers (Google accounts). Record count. Need ≥ 12 **opted in for 14 continuous days**.

**Done when:** all `T0.*` fields in the log are filled.

---

### Task 1: App identity + production profile

**Files:**
- Modify: `apps/mobile/app.json`, `apps/mobile/eas.json`
- Modify: `apps/mobile/src/i18n/uiStrings.ts:502,762,1010` (`about.title`)
- Modify: `apps/mobile/src/screens/AboutScreen.tsx:81,120`, `apps/mobile/src/screens/MenuScreen.tsx:79`
- Modify: `apps/mobile/src/data/userDb.test.ts:106`, `apps/mobile/src/telemetry/telemetry.test.ts:42,76` (fixture paths, cosmetic)
- Modify: `apps/mobile/src/screens/MenuScreen.test.tsx:86`, `apps/mobile/src/screens/AboutTab.test.tsx:144` (assert `'Quran Corpus 1.2.3'` → `'Quran Corpusly 1.2.3'`)
- Modify: `.gitignore`, `.easignore` (repo root) — keystore/credential patterns
- Create: `apps/mobile/src/release/releaseConfig.test.ts`

**Interfaces:** Produces `production` EAS profile used by T2, T14, T15. Display name constant used by T10/T11 copy: **"Quran Corpusly"**.

- [ ] **Step 1: Write failing test**

```ts
// apps/mobile/src/release/releaseConfig.test.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const app = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8')).expo;
const eas = JSON.parse(readFileSync(resolve(root, 'eas.json'), 'utf8'));

describe('release identity', () => {
  // Permanent once uploaded to Play (R-6). A rename here is a new app.
  it('pins the package id and display name', () => {
    expect(app.android.package).toBe('com.qurancorpusly.app');
    expect(app.name).toBe('Quran Corpusly');
  });

  it('ships a semver versionName and a versionCode past the sideloaded builds', () => {
    expect(app.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(app.android.versionCode).toBeGreaterThanOrEqual(100);
  });

  // Without the pack env the 604 mushaf fonts land in the base module and the
  // AAB blows Play's 200 MB base-download cap (S2).
  it('builds an AAB with the mushaf asset pack for production', () => {
    expect(eas.build.production.android.buildType).toBe('app-bundle');
    expect(eas.build.production.env.EXPO_MUSHAF_ASSET_PACK).toBe('1');
  });

  // Library manifests merge these in despite "permissions": [] (stale prebuild
  // manifest shows all five). An overlay permission in a release invites a
  // Play review question for a feature we do not have.
  it('blocks permissions the app does not use', () => {
    expect(app.android.blockedPermissions).toEqual(expect.arrayContaining([
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'com.google.android.gms.permission.AD_ID',
    ]));
  });

  // Preview/local builds have no SENTRY_AUTH_TOKEN; the Sentry plugin's
  // source-map upload would fail them.
  it('disables Sentry upload outside production', () => {
    expect(eas.build.preview.env.SENTRY_DISABLE_AUTO_UPLOAD).toBe('true');
  });
});
```

- [ ] **Step 2:** `cd apps/mobile && pnpm vitest run src/release/releaseConfig.test.ts` → FAIL (package/name/production missing).
- [ ] **Step 3: Implement**
  - `app.json`: `"name": "Quran Corpusly"`, `"version": "1.0.0"`, `android.package: "com.qurancorpusly.app"`, `android.versionCode: 100`, `android.blockedPermissions` = the four in the test (keep `VIBRATE`, `MODIFY_AUDIO_SETTINGS` — audio uses them). Delete `extra.sentryDsn`, `extra.posthogKey`, `extra.posthogHost` (dead; keys move to EAS env, T4). Leave `slug`, `scheme`, `extra.eas.projectId`, `owner` unchanged (slug/projectId bind the EAS project; changing them orphans credentials).
  - `eas.json`: add to `preview`: `"env": { "SENTRY_DISABLE_AUTO_UPLOAD": "true" }`. Add:
    ```json
    "production": {
      "environment": "production",
      "env": { "EXPO_MUSHAF_ASSET_PACK": "1" },
      "android": { "buildType": "app-bundle" }
    }
    ```
    No `submit` block: owner uploads manually (Play requires the first upload by hand).
  - Replace `'Quran Corpus'` with `'Quran Corpusly'` at the **six** string sites: en/uz/ru `about.title`, `AboutScreen.tsx:120` version line, `AboutScreen.tsx:81` editorial credit (the project authored those glosses; product rename = author rename), `MenuScreen.tsx:79`.
  - Fixture paths `com.qurancorpus.mobile` → `com.qurancorpusly.app`; the two test assertions above.
  - Root `.gitignore` and `.easignore`: add `credentials.json`, `credentials/`, `*.keystore` (`.easignore` already has `*.keystore`/`*.jks`; add the other two). `eas credentials` downloads plaintext passwords into the project.
  - Local Gradle recipe (memory `local-apk-build-without-eas`): prefix `SENTRY_DISABLE_AUTO_UPLOAD=true` from T4 on.
- [ ] **Step 4:** Test PASS. Mutation-check: set `buildType` back to `apk` → test FAILS; restore.
- [ ] **Step 5:** `pnpm run lint && pnpm run type-check && pnpm test` (apps/mobile) all green.
- [ ] **Step 6:** Note in log: sideloaded `com.qurancorpus.mobile` installs become a **separate app**; their user DB does not transfer (no export in v1, PRD). Owner informs existing testers.
- [ ] **Step 7: Commit** `feat(mobile): release identity Quran Corpusly, com.qurancorpusly.app, 1.0.0`

---

### Task 2: First production AAB + artefact verification

**Depends:** T0 Step 2 not required yet; T1 merged or on branch.
**Files:** Verification Log only.

- [ ] **Step 1:** From the **repo root**: `pnpm generate:m1-db && pnpm --filter ./apps/mobile prebuild:assert-db` (the script lives at root/`packages/mobile-data`, not `apps/mobile`).
- [ ] **Step 2 (owner, interactive):** `cd apps/mobile && eas build -p android --profile production`. On first run answer **Generate a new Android Keystore → Yes** (R-7). Compare the upload archive size in the CLI output against the last successful EAS preview upload (record both); far smaller (e.g. ~5 MB) = DB/fonts dropped → abort.
- [ ] **Step 3 (owner):** Back up the keystore **outside the repo**: `cd $HOME/keystore-backup && eas credentials -p android --project-dir <repo>/apps/mobile` → production → *Download credentials*, or download from expo.dev → Credentials. Then move `credentials.json` + `.jks` off this machine. Confirm `git -C <repo> status` shows no credential file. Record `T2.keystoreBackup=done`.
- [ ] **Step 4:** Download the AAB to `$CLAUDE_JOB_DIR/tmp/r1-vc100.aab`. Verify with bundletool (`java -jar bundletool-all-1.18.1.jar`):
  ```bash
  bundletool dump manifest --bundle=r1-vc100.aab | grep -E 'package=|versionCode|versionName|targetSdkVersion|minSdkVersion|uses-permission|foregroundServiceType|allowBackup|dataExtractionRules|fullBackupContent'
  bundletool dump manifest --bundle=r1-vc100.aab --module=mushaf_fonts | grep -E 'delivery|install-time'
  bundletool build-apks --bundle=r1-vc100.aab --output=r1.apks --mode=default
  bundletool get-size total --apks=r1.apks --dimensions=SDK,ABI --modules=base
  unzip -o r1.apks -d r1-apks && for a in r1-apks/splits/*.apk; do zipalign -c -P 16 -v 4 "$a" | tail -1; done
  ```
  Expect: `package="com.qurancorpusly.app"`, versionCode 100, versionName 1.0.0, targetSdk ≥ 36, minSdk 26, `mushaf_fonts` install-time, **base** MAX download < 200 MB, every split `Verification successful` for 16 KB alignment (Play rule for targetSdk 35+; Sentry NDK `.so` files are new). Permission list recorded verbatim (T12): expect `INTERNET`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `WAKE_LOCK`, `VIBRATE`, `MODIFY_AUDIO_SETTINGS`, maybe `POST_NOTIFICATIONS`; **absent**: `SYSTEM_ALERT_WINDOW`, `READ/WRITE_EXTERNAL_STORAGE`, `AD_ID`. targetSdk < 36 → stop; set `expo-build-properties.android.targetSdkVersion: 36` + `compileSdkVersion: 36`, re-run T1 Step 5, rebuild. 16 KB failure → name the `.so`, upgrade its package (owner approves), rebuild.
- [ ] **Step 5 (owner):** Play Console → Create app "Quran Corpusly", default language en-US, App, Free. Internal testing → upload `r1-vc100.aab`. Accept Play App Signing. Record any Console warnings verbatim.
- [ ] **Step 6:** Smoke from the internal track: owner installs via Play Store link on phone (OnePlus) and tablet (SM-X820). Cold start offline (airplane mode) → Home renders, open al-Fatiha, open mushaf p.1 (proves pack fonts load from AssetManager). Record pass/fail.
- [ ] **Step 7:** Pre-launch report (Console → Testing → Pre-launch report, auto-run on upload): record crashes/ANRs/a11y warnings. Any crash → new issue, fix before T13 starts.

**Done when:** log has all of Step 4 numbers + Step 6 pass + Step 7 result.

---

### Task 3: Scrubber + consent module (pure, testable) — §5 trust boundary

**Files:**
- Create: `apps/mobile/src/telemetry/scrubEvent.ts`, `scrubEvent.test.ts`
- Create: `apps/mobile/src/telemetry/consent.ts`, `consent.test.ts`
- Modify: `apps/mobile/src/telemetry/telemetry.ts` (end of file), `telemetry.test.ts`

**Interfaces:**
- Produces `scrubEvent(event: SentryEventLike): SentryEventLike | null` (null = drop the event)
- Produces `setTelemetryProviders(p: TelemetryProviders): void` (export `TelemetryProviders` type)
- Produces `applyTelemetryConsent(enabled: boolean, config: TelemetryConfig, sdks: TelemetrySdks): void`
- `TelemetryConfig = { sentryDsn: string; posthogKey: string; posthogHost: string }` (no `release`: the SDK default `package@version+versionCode` matches native events and uploaded source maps)
- `TelemetrySdks` = injected SDK surface (lets tests run without native modules; T4 passes the real ones).

- [ ] **Step 1: Failing tests — scrubber**

```ts
// scrubEvent.test.ts
import { describe, expect, it } from 'vitest';
import { scrubEvent } from './scrubEvent';

const raw = {
  event_id: 'e1', timestamp: 1, level: 'fatal', platform: 'javascript',
  release: 'com.qurancorpusly.app@1.0.0+100', dist: '100', environment: 'production',
  message: 'search failed for رحمة',
  exception: { values: [{
    type: 'SqliteError', value: 'near "رحمة": syntax error',
    mechanism: { type: 'onerror', handled: false },
    stacktrace: { frames: [{
      filename: 'app:///index.android.bundle', function: 'search', lineno: 10, colno: 2, in_app: true,
      abs_path: '/data/user/0/com.qurancorpusly.app/x', context_line: 'q = "رحمة"', vars: { q: 'رحمة' },
    }] },
  }] },
  breadcrumbs: [{ message: 'typed رحمة' }],
  user: { ip_address: '1.2.3.4', id: 'u' },
  request: { url: 'https://x/?q=رحمة' },
  server_name: 'Jeff phone',
  contexts: { device: { name: 'Jeff phone', model: 'CPH2581', family: 'OnePlus', arch: 'arm64' },
              os: { name: 'Android', version: '16' }, app: { app_version: '1.0.0', app_build: '100' } },
  extra: { surah: 2, note: 'my private note' },
  debug_meta: { images: [{ type: 'sourcemap', code_file: 'app:///index.android.bundle', debug_id: 'd' }] },
};

describe('scrubEvent', () => {
  // JSON round-trip: typed loosely for assertions without an explicit `any`.
  const out = JSON.parse(JSON.stringify(scrubEvent(raw)));

  it('drops free text: message, exception value, breadcrumbs, request', () => {
    expect(out.message).toBeUndefined();
    expect(out.exception.values[0].value).toBeUndefined();
    expect(out.breadcrumbs).toBeUndefined();
    expect(out.request).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain('رحمة');
  });

  it('drops identity: user, server_name, device name', () => {
    expect(out.user).toBeUndefined();
    expect(out.server_name).toBeUndefined();
    expect(out.contexts.device.name).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain('Jeff');
  });

  it('keeps what symbolication needs', () => {
    const f = out.exception.values[0].stacktrace.frames[0];
    expect(out.exception.values[0].type).toBe('SqliteError');
    expect(f).toEqual({ filename: 'app:///index.android.bundle', function: 'search', lineno: 10, colno: 2, in_app: true });
    expect(out.debug_meta).toEqual(raw.debug_meta);
    expect(out.release).toBe(raw.release);
    expect(out.contexts.device.model).toBe('CPH2581');
  });

  it('passes extra through the telemetry allowlist', () => {
    expect(out.extra).toEqual({ surah: 2 });
  });

  // createTelemetry.captureException sends `new Error(code)`: the code IS the
  // exception value. Dropping it would make every handled error identical.
  it('keeps an exception value that is an allowlisted error code, and its fingerprint', () => {
    const coded = JSON.parse(JSON.stringify(scrubEvent({
      exception: { values: [{ type: 'Error', value: 'audio_fetch_failed' }] },
      fingerprint: ['audio_fetch_failed'],
    })));
    expect(coded.exception.values[0].value).toBe('audio_fetch_failed');
    expect(coded.fingerprint).toEqual(['audio_fetch_failed']);
  });

  it('drops a fingerprint that is not an error code', () => {
    const f = JSON.parse(JSON.stringify(scrubEvent({ fingerprint: ['رحمة'] })));
    expect(f.fingerprint).toBeUndefined();
  });

  it('never throws on junk; unscrubbable input is dropped (null), not sent', () => {
    expect(() => scrubEvent({ exception: { values: [null] } } as never)).not.toThrow();
    expect(scrubEvent(null as never)).toBeNull();
  });
});
```

- [ ] **Step 2:** Run → FAIL (module missing).
- [ ] **Step 3: Implement `scrubEvent.ts`** — build a new object from an allowlist (never delete-from-original; an unknown future field must be dropped by default).

```ts
import { sanitizeProperties, telemetryErrorCodes } from './telemetry';

// Allowlist by construction, same rule as telemetry.ts: a field the SDK adds
// next year is dropped until someone decides it is safe. Exception *values*
// and messages go because SQLite and URL errors echo user input (R-3).
type Obj = Record<string, unknown>;
export type SentryEventLike = Obj;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const pick = (src: unknown, keys: readonly string[]): Obj | undefined => {
  if (!isObj(src)) return undefined;
  const out: Obj = {};
  for (const k of keys) if (Object.hasOwn(src, k) && src[k] !== undefined) out[k] = src[k];
  return out;
};

const TOP = ['event_id', 'timestamp', 'level', 'platform', 'release', 'dist', 'environment', 'sdk', 'debug_meta'] as const;
const FRAME = ['filename', 'function', 'module', 'lineno', 'colno', 'in_app', 'instruction_addr', 'package', 'platform'] as const;

const isCode = (v: unknown): v is string =>
  typeof v === 'string' && (telemetryErrorCodes as readonly string[]).includes(v);

export function scrubEvent(event: SentryEventLike): SentryEventLike | null {
  try {
    if (!isObj(event)) return null;
    const out = pick(event, TOP) ?? {};
    if (Array.isArray(event.fingerprint) && event.fingerprint.length > 0 && event.fingerprint.every(isCode)) {
      out.fingerprint = [...event.fingerprint];
    }
    const values = isObj(event.exception) && Array.isArray(event.exception.values) ? event.exception.values : [];
    if (values.length) {
      out.exception = {
        values: values.filter(isObj).map((v) => ({
          ...pick(v, ['type', 'module', 'thread_id']),
          // The one value allowed through: our own error code (handled path).
          ...(isCode(v.value) ? { value: v.value } : {}),
          ...(isObj(v.mechanism) ? { mechanism: pick(v.mechanism, ['type', 'handled']) } : {}),
          ...(isObj(v.stacktrace) && Array.isArray(v.stacktrace.frames)
            ? { stacktrace: { frames: v.stacktrace.frames.map((f) => pick(f, FRAME) ?? {}) } }
            : {}),
        })),
      };
    }
    if (isObj(event.contexts)) {
      out.contexts = {
        device: pick(event.contexts.device, ['model', 'family', 'arch', 'memory_size', 'simulator']),
        os: pick(event.contexts.os, ['name', 'version', 'build']),
        app: pick(event.contexts.app, ['app_version', 'app_build']),
      };
    }
    out.extra = sanitizeProperties(event.extra);
    return out;
  } catch {
    // null = Sentry drops the event. Never send what could not be scrubbed.
    return null;
  }
}
```

  Note: `event.exception.values[].type` for a `TypeError` is a class name, not user text — kept.
- [ ] **Step 4:** Run → PASS. **Mutation-check:** (a) add `'value'` to the exception pick → "drops free text" FAILS; (b) add `'name'` to device pick → "drops identity" FAILS; (c) replace `sanitizeProperties(event.extra)` with `event.extra` → "passes extra" FAILS; (d) drop the `isCode(v.value)` spread → "keeps … error code" FAILS; (e) drop `.every(isCode)` → "drops a fingerprint" FAILS; (f) catch returns `{}` → junk test FAILS. Restore each.

- [ ] **Step 5: Failing tests — provider indirection + consent**

```ts
// consent.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTelemetryConsent, resetConsentForTest, type TelemetrySdks } from './consent';
import { telemetry } from './telemetry';

const config = { sentryDsn: 'https://k@o1.ingest.de.sentry.io/1', posthogKey: 'phc_x', posthogHost: 'https://eu.i.posthog.com' };

function fakeSdks() {
  const ph = { capture: vi.fn(), optIn: vi.fn(), optOut: vi.fn(), reset: vi.fn(), shutdown: vi.fn(() => Promise.resolve()) };
  const sdks: TelemetrySdks = {
    sentry: { init: vi.fn(), close: vi.fn(() => Promise.resolve()), captureException: vi.fn() },
    createPostHog: vi.fn(() => ph),
  };
  return { sdks, ph };
}

describe('applyTelemetryConsent', () => {
  beforeEach(() => resetConsentForTest());

  it('initialises nothing while consent is off', () => {
    const { sdks } = fakeSdks();
    applyTelemetryConsent(false, config, sdks);
    telemetry.captureEvent('app_opened');
    expect(sdks.sentry.init).not.toHaveBeenCalled();
    expect(sdks.createPostHog).not.toHaveBeenCalled();
  });

  it('initialises both on, with privacy options, and routes events', () => {
    const { sdks, ph } = fakeSdks();
    applyTelemetryConsent(true, config, sdks);
    const opts = vi.mocked(sdks.sentry.init).mock.calls[0]![0];
    expect(opts).toMatchObject({ dsn: config.sentryDsn, sendDefaultPii: false, maxBreadcrumbs: 0, attachScreenshot: false, attachViewHierarchy: false, tracesSampleRate: 0 });
    expect(opts.beforeSend({ message: 'x' })).toEqual(expect.not.objectContaining({ message: 'x' }));
    expect(opts.beforeBreadcrumb()).toBeNull();
    expect(vi.mocked(sdks.createPostHog).mock.calls[0]).toEqual([config.posthogKey, expect.objectContaining({ host: config.posthogHost, captureAppLifecycleEvents: false, disableGeoip: true, preloadFeatureFlags: false })]);
    // posthog-core persists an opt-out across launches; a fresh client after a
    // past revoke would stay silent without this.
    expect(ph.optIn).toHaveBeenCalled();
    telemetry.captureEvent('app_opened');
    expect(ph.capture).toHaveBeenCalledWith('app_opened', {});
  });

  it('tags handled errors with their code as fingerprint', () => {
    const { sdks } = fakeSdks();
    applyTelemetryConsent(true, config, sdks);
    telemetry.captureException('audio_fetch_failed');
    expect(vi.mocked(sdks.sentry.captureException).mock.calls[0]![1]).toMatchObject({ fingerprint: ['audio_fetch_failed'] });
  });

  it('OFF then ON in one session resumes with a fresh client, opted in', () => {
    const { sdks } = fakeSdks();
    applyTelemetryConsent(true, config, sdks);
    applyTelemetryConsent(false, config, sdks);
    applyTelemetryConsent(true, config, sdks);
    expect(sdks.sentry.init).toHaveBeenCalledTimes(2);
    expect(sdks.createPostHog).toHaveBeenCalledTimes(2);
  });

  it('is idempotent: a second ON does not re-init', () => {
    const { sdks } = fakeSdks();
    applyTelemetryConsent(true, config, sdks);
    applyTelemetryConsent(true, config, sdks);
    expect(sdks.sentry.init).toHaveBeenCalledTimes(1);
  });

  it('revoking stops everything: opt out BEFORE shutdown, and later events go nowhere', () => {
    const { sdks, ph } = fakeSdks();
    applyTelemetryConsent(true, config, sdks);
    applyTelemetryConsent(false, config, sdks);
    expect(sdks.sentry.close).toHaveBeenCalled();
    expect(ph.optOut.mock.invocationCallOrder[0]).toBeLessThan(ph.shutdown.mock.invocationCallOrder[0]!);
    expect(ph.reset).toHaveBeenCalled();
    ph.capture.mockClear();
    telemetry.captureEvent('app_opened');
    telemetry.captureException('unknown');
    expect(ph.capture).not.toHaveBeenCalled();
    expect(sdks.sentry.captureException).not.toHaveBeenCalled();
  });

  it('skips a provider whose key is empty (dev builds)', () => {
    const { sdks } = fakeSdks();
    applyTelemetryConsent(true, { ...config, sentryDsn: '', posthogKey: '' }, sdks);
    expect(sdks.sentry.init).not.toHaveBeenCalled();
    expect(sdks.createPostHog).not.toHaveBeenCalled();
  });

  it('fails quiet when an SDK throws', () => {
    const { sdks } = fakeSdks();
    vi.mocked(sdks.sentry.init).mockImplementation(() => { throw new Error('native missing'); });
    expect(() => applyTelemetryConsent(true, config, sdks)).not.toThrow();
  });
});
```

- [ ] **Step 6:** Run → FAIL.
- [ ] **Step 7: Implement.** Append to `telemetry.ts` (replace last line):

```ts
export type { TelemetryProviders };

let current = createTelemetry({ posthog: null, sentry: null });

/** Swapped by consent.ts only. Null providers = nothing leaves the device. */
export function setTelemetryProviders(providers: TelemetryProviders): void {
  current = createTelemetry(providers);
}

export const telemetry = {
  captureEvent: (...args: Parameters<typeof current.captureEvent>) => current.captureEvent(...args),
  captureException: (...args: Parameters<typeof current.captureException>) => current.captureException(...args),
};
```

  (`interface TelemetryProviders` becomes exported via the type re-export.)

  `consent.ts`:

```ts
import { scrubEvent } from './scrubEvent';
import { setTelemetryProviders } from './telemetry';

export interface TelemetryConfig { sentryDsn: string; posthogKey: string; posthogHost: string }

interface PostHogClient {
  capture(name: string, props?: Record<string, unknown>): void;
  optIn(): void | Promise<void>;
  optOut(): void | Promise<void>;
  reset(): void;
  shutdown(): Promise<void> | void;
}

/** The subset of Sentry.init options we set. Narrowed to the real
 *  `ReactNativeOptions` in T4 if tsc rejects a field. */
export interface SentryInitOptions {
  dsn: string;
  sendDefaultPii: false;
  maxBreadcrumbs: 0;
  beforeBreadcrumb: () => null;
  beforeSend: (event: Record<string, unknown>) => Record<string, unknown> | null;
  attachScreenshot: false;
  attachViewHierarchy: false;
  attachStacktrace: true;
  tracesSampleRate: 0;
  enableAutoSessionTracking: true;
}

/** The SDK surface we touch, injected so tests need no native module. */
export interface TelemetrySdks {
  sentry: {
    init(options: SentryInitOptions): void;
    close(): Promise<void> | void;
    captureException(error: unknown, context?: { extra?: Record<string, unknown>; fingerprint?: string[] }): void;
  };
  createPostHog(key: string, options: Record<string, unknown>): PostHogClient;
}

let sentryOn = false;
let posthog: PostHogClient | null = null;

/** Tests only. */
export function resetConsentForTest(): void {
  sentryOn = false;
  posthog = null;
  setTelemetryProviders({ posthog: null, sentry: null });
}

// R-2: opt-in. R-3: scrubbed stacks only. R-4: EU host comes from config.
export function applyTelemetryConsent(enabled: boolean, config: TelemetryConfig, sdks: TelemetrySdks): void {
  try {
    if (!enabled) {
      // Providers first, so nothing new is captured while teardown runs.
      setTelemetryProviders({ posthog: null, sentry: null });
      if (posthog) {
        const ph = posthog;
        posthog = null;
        ph.optOut(); // before shutdown: shutdown flushes the queue, opt-out empties it
        ph.reset();
        void Promise.resolve(ph.shutdown()).catch(() => undefined);
      }
      if (sentryOn) {
        sentryOn = false;
        void Promise.resolve(sdks.sentry.close()).catch(() => undefined);
      }
      return;
    }
    if (!sentryOn && config.sentryDsn) {
      sdks.sentry.init({
        dsn: config.sentryDsn,
        sendDefaultPii: false,
        maxBreadcrumbs: 0,
        beforeBreadcrumb: () => null,
        beforeSend: (event: Record<string, unknown>) => scrubEvent(event),
        attachScreenshot: false,
        attachViewHierarchy: false,
        attachStacktrace: true,
        tracesSampleRate: 0,
        enableAutoSessionTracking: true, // crash-free-sessions metric, PRD §13
      });
      sentryOn = true;
    }
    if (!posthog && config.posthogKey) {
      posthog = sdks.createPostHog(config.posthogKey, {
        host: config.posthogHost,
        captureAppLifecycleEvents: false,
        disableGeoip: true,
        enableSessionReplay: false,
        preloadFeatureFlags: false,
      });
      void Promise.resolve(posthog.optIn()).catch(() => undefined);
    }
    const ph = posthog;
    setTelemetryProviders({
      posthog: ph ? { capture: (name, props) => ph.capture(name, props) } : null,
      sentry: sentryOn
        ? {
            // The code is the Error's message (createTelemetry); as fingerprint
            // it keeps the codes apart in Sentry, where one shared stack
            // (the `new Error` line) would merge them into one issue.
            captureException: (e, c) =>
              sdks.sentry.captureException(e, { ...c, fingerprint: [e instanceof Error ? e.message : 'unknown'] }),
          }
        : null,
    });
  } catch {
    // Telemetry never takes a user path down. A half-initialised state is
    // reset to "nothing leaves".
    setTelemetryProviders({ posthog: null, sentry: null });
  }
}
```

- [ ] **Step 8:** Run → PASS; full `pnpm test` green (existing `telemetry.test.ts` still passes — `createTelemetry`/`sanitizeProperties` unchanged).
- [ ] **Step 9: Mutation-check:** (a) swap `ph.optOut()` and `ph.shutdown()` order → order test FAILS; (b) remove `setTelemetryProviders({null,null})` at top of the disable branch → "later events go nowhere" FAILS; (c) drop `if (!sentryOn` guard → idempotent test FAILS; (d) remove `try/catch` → fails-quiet FAILS; (e) remove `optIn()` → "opted in" FAILS; (f) remove the fingerprint spread → fingerprint test FAILS; (g) skip resetting `sentryOn=false` on disable → OFF→ON test FAILS. Restore each.
- Fakes prove call order only. Real SDK persistence semantics (opt-out on disk, whether `reset()` clears the queue, whether `close()`→`init()` double-installs the global handler) are checked against installed source in T4 Step 1 and on device in RC-6.
- [ ] **Step 10:** lint + type-check + test green. **Commit** `feat(mobile/telemetry): scrubbed Sentry events and opt-in consent switch`

---

### Task 4: Wire real SDKs (deps, config, metro, root mount, copy) — §5 trust boundary

**Depends:** T0 Steps 3, 5 (DSN, key, org, project); T3.
**Files:**
- Modify: `apps/mobile/package.json` (deps), `app.json` (Sentry plugin), `eas.json` (`production.env` keys), `metro.config.js`
- Create: `apps/mobile/src/telemetry/TelemetryConsent.tsx`, `TelemetryConsent.test.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (mount inside `AppSettingsProvider`)
- Modify: `apps/mobile/src/i18n/uiStrings.ts` (`settings.analytics`, `settings.analyticsHint` en/uz/ru)
- Modify: `.easignore` only if the Sentry plugin writes a new local file (e.g. `sentry.properties`) — it must not carry the token.

**Interfaces:** Consumes `applyTelemetryConsent`, `TelemetrySdks`, `TelemetryConfig` (T3). Produces `telemetry.captureEvent/captureException` live when consent on (used by T5).

- [ ] **Step 1: Install** (approved by R-1): record `pnpm audit --prod` baseline, then `cd apps/mobile && npx expo install @sentry/react-native posthog-react-native expo-application expo-localization`, then audit again. Record versions + **new** advisories in log. New high/critical → stop, ask owner.
  **Read the installed SDK source** (`node_modules/posthog-react-native`, `node_modules/posthog-core`, `node_modules/@sentry/react-native`) and record answers in the log; any "no" → adjust T3 code + tests before continuing:
  - option names exist: `disableGeoip`, `captureAppLifecycleEvents`, `enableSessionReplay`, `preloadFeatureFlags`; methods `optIn`/`optOut`/`reset`/`shutdown`.
  - opt-out is persisted? (→ `optIn()` after create is required, T3 has it.) Does `optOut()` drop the queued events or does `shutdown()` still flush them?
  - PostHog auto-properties: is `$device_name` (user-set device name) sent? If yes, override it via `customAppProperties` (blank it) and add a test.
  - Sentry: does `close()` then `init()` re-install the global error handler once or twice? If twice, change disable to `Sentry.getClient()?.getOptions().enabled = false`-style toggle per SDK docs, not close/re-init.
- [ ] **Step 2: Config.**
  - `eas.json` `production.env` add: `EXPO_PUBLIC_SENTRY_DSN` = `T0.sentryDsn`, `EXPO_PUBLIC_POSTHOG_KEY` = `T0.posthogKey`, `EXPO_PUBLIC_POSTHOG_HOST` = `"https://eu.i.posthog.com"`. Public client keys by design; the auth token is NOT here (EAS secret, T0 Step 3). Absent in `preview`/dev → telemetry inert there, so test builds never report into production projects.
  - `app.json` plugins add: `["@sentry/react-native/expo", { "organization": "<T0.sentryOrg>", "project": "<T0.sentryProject>", "url": "https://de.sentry.io/" }]`.
  - Extend `releaseConfig.test.ts`: `production.env.EXPO_PUBLIC_POSTHOG_HOST === 'https://eu.i.posthog.com'`; `preview.env` has no `EXPO_PUBLIC_SENTRY_DSN`/`EXPO_PUBLIC_POSTHOG_KEY`; `app.json` `extra` has no `sentryDsn`/`posthogKey`.
- [ ] **Step 3: Metro.** Replace `getDefaultConfig` import/line only:
  ```js
  const { getSentryExpoConfig } = require('@sentry/react-native/metro');
  const config = getSentryExpoConfig(projectRoot);
  ```
  Everything else (watchFolders, assetExts, pack `resolveRequest` alias) unchanged. Verify the alias still bites — a check that **can** fail:
  ```bash
  cd apps/mobile
  npx expo export --platform android --output-dir $CLAUDE_JOB_DIR/tmp/exp-inline
  EXPO_MUSHAF_ASSET_PACK=1 npx expo export --platform android --output-dir $CLAUDE_JOB_DIR/tmp/exp-pack
  for d in exp-inline exp-pack; do find $CLAUDE_JOB_DIR/tmp/$d/assets -name '*.ttf' | wc -l; done
  ```
  Expect inline ≥ 604, pack < 604 (only the non-mushaf fonts). Run the same pair once **before** the metro edit to confirm the instrument distinguishes them. Delete both dirs.
- [ ] **Step 4: Failing tests — TelemetryConsent + TelemetryGate**

```tsx
// TelemetryConsent.test.tsx — mocks the SDK modules; asserts the bridge only.
import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('./consent', () => ({ applyTelemetryConsent: vi.fn() }));
vi.mock('./telemetry', () => ({ telemetry: { captureEvent: vi.fn(), captureException: vi.fn() } }));
vi.mock('@sentry/react-native', () => ({ init: vi.fn(), close: vi.fn(), captureException: vi.fn() }));
vi.mock('posthog-react-native', () => ({ default: vi.fn() }));
import { render } from '@testing-library/react'; // same as SettingsTab.test.tsx
import { applyTelemetryConsent } from './consent';
import { telemetry } from './telemetry';
import { TelemetryConsent } from './TelemetryConsent';

beforeEach(() => vi.clearAllMocks());

it('passes the setting through and re-applies on change', () => {
  const { rerender } = render(<TelemetryConsent enabled={false} />);
  expect(vi.mocked(applyTelemetryConsent).mock.calls.at(-1)?.[0]).toBe(false);
  rerender(<TelemetryConsent enabled />);
  expect(vi.mocked(applyTelemetryConsent).mock.calls.at(-1)?.[0]).toBe(true);
  rerender(<TelemetryConsent enabled={false} />);
  expect(vi.mocked(applyTelemetryConsent).mock.calls.at(-1)?.[0]).toBe(false);
});

// app_opened lives here, not in RootLayout: RootLayout runs above
// AppSettingsProvider, before consent can be on, so it could never send.
it('emits app_opened once per launch, only after consent is on', () => {
  const { rerender } = render(<TelemetryConsent enabled={false} />);
  expect(telemetry.captureEvent).not.toHaveBeenCalled();
  rerender(<TelemetryConsent enabled />);
  rerender(<TelemetryConsent enabled={false} />);
  rerender(<TelemetryConsent enabled />);
  expect(vi.mocked(telemetry.captureEvent).mock.calls.filter(([n]) => n === 'app_opened')).toHaveLength(1);
});
```

  Plus `src/telemetry/TelemetryGate.test.tsx`: render `<AppSettingsProvider><TelemetryGate /></AppSettingsProvider>` with the user-DB fake `settingsStore.test.tsx` already uses, persisted `analyticsEnabled='true'`, and a hydration promise held unresolved. Assert every `applyTelemetryConsent` call so far has `false`; resolve hydration; assert the last call is `true` (Review Focus 2). Mutation-check: change `AppSettingsProvider`'s default (`settingsStore.tsx:102`) to `true` → FAILS; restore.
- [ ] **Step 5:** Run → FAIL.
- [ ] **Step 6: Implement**

```tsx
// TelemetryConsent.tsx
import * as Sentry from '@sentry/react-native';
import PostHog from 'posthog-react-native';
import { useEffect, useRef } from 'react';

import { applyTelemetryConsent, type TelemetryConfig, type TelemetrySdks } from './consent';
import { telemetry } from './telemetry';

const sdks: TelemetrySdks = {
  sentry: Sentry,
  createPostHog: (key, options) => new PostHog(key, options),
};

// EXPO_PUBLIC_* are inlined at build time; set only in eas.json production.env.
function readConfig(): TelemetryConfig {
  return {
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? '',
  };
}

/** Renders nothing. Mounted under AppSettingsProvider, whose default is
 *  `analyticsEnabled: false`, so nothing initialises before hydration (R-2). */
export function TelemetryConsent({ enabled, properties }: { enabled: boolean; properties?: Record<string, string> }) {
  const opened = useRef(false);
  useEffect(() => {
    applyTelemetryConsent(enabled, readConfig(), sdks);
    if (enabled && !opened.current) {
      opened.current = true;
      telemetry.captureEvent('app_opened', properties);
    }
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps -- properties are read once, at the launch's first consented render
  return null;
}
```

  Same file, exported: `export function TelemetryGate() { const { analyticsEnabled, uiLocale, contentLanguage, theme } = useAppSettings(); return <TelemetryConsent enabled={analyticsEnabled} properties={{ uiLocale, contentLanguage, theme }} />; }` (in `src/`, not the route file: expo-router owns route-file exports). `app/_layout.tsx`: render `<TelemetryGate />` once inside the `AppSettingsProvider` subtree. If `tsc` rejects `sdks` against the real SDK signatures, narrow `TelemetrySdks`/`SentryInitOptions` — never `any`-cast, never `@ts-ignore`.
- [ ] **Step 7:** Tests PASS. Mutation-check: (a) effect deps `[]` → re-apply assertion FAILS; (b) drop `opened.current` guard → "once" FAILS; restore.
- [ ] **Step 8: Copy** (`uiStrings.ts`, owner signs off uz/ru per PRD):
  - en `settings.analytics`: `Crash reports & usage statistics`; `settings.analyticsHint`: `Off by default. When on, sends crash reports (Sentry) and anonymous usage events (PostHog), stored in the EU. Never Quran text, searches, bookmarks or notes.`
  - uz `settings.analytics`: `Nosozlik hisobotlari va foydalanish statistikasi`; hint: `Odatda oʻchiq. Yoqilsa, nosozlik hisobotlari (Sentry) va anonim foydalanish hodisalari (PostHog) yuboriladi, YeIda saqlanadi. Qurʼon matni, qidiruvlar, xatchoʻplar va eslatmalar hech qachon yuborilmaydi.`
  - ru `settings.analytics`: `Отчёты о сбоях и статистика`; hint: `По умолчанию выключено. Если включить, отправляются отчёты о сбоях (Sentry) и анонимные события использования (PostHog), хранятся в ЕС. Текст Корана, поиск, закладки и заметки не отправляются никогда.`
- [ ] **Step 9:** lint + type-check + test green.
- [ ] **Step 10:** Device check (production-profile build on the internal track, versionCode +1): switch ON → kill → reopen → Sentry shows a session for release `com.qurancorpusly.app@1.0.0+10x`; PostHog Live events shows `app_opened`. Full consent matrix is RC-6.
- [ ] **Step 11: Commit** `feat(mobile/telemetry): wire Sentry and PostHog behind the consent switch`
- [ ] **Step 12: STOP — §5.** After T5, ask owner to run `/code-review` over T3+T4+T5 together. Fix real findings, state declined ones.

---

### Task 5: Event + error call sites

**Depends:** T4. **Files:** call sites below + their existing tests.

Events (names fixed by `telemetryEvents`; properties pass `sanitizeProperties`, so a key outside the allowlist is dropped — no new keys):

| Event | Site | Properties |
|---|---|---|
| `app_opened` | done in T4 (`TelemetryConsent`) | — |
| `reader_ayah_opened` | `app/surah/[surahId].tsx` `onReadingAyah` (~`:524-528`): compute `const first = landedSurah.current !== displayedSurahId;` **before** the existing `landedSurah.current = displayedSurahId;` line, emit after it only if `first` | `{ surah, ayah }` |
| `reader_audio_played` | `[surahId].tsx` `toggleAyah`: emit only when the call **starts** sound: `!(mine && audioRef.current.playing && audioRef.current.ayah === ayahNumber)` evaluated before `toggle` | `{ surah, ayah }` |
| `bookmark_toggled` | `[surahId].tsx` `applyToggle`, **after** `setBookmark` resolves (covers the ConfirmSheet path, skips failed writes); `MushafScreen.tsx` equivalent after its write resolves | `{ surah, ayah }` |
| `setting_changed` | `settingsStore.tsx:321` `updateSetting(key, value)` — **skip when `key === 'analyticsEnabled'`** (on → providers not up yet; off → would send after revoke, R-2) | `{ [key]: value }` (allowlist drops reciterId etc.) |

Errors (`captureException(code)`, beside the existing handling, never replacing it). Pre-hydration catches (`openCorpusDb.ts:176/210`, `settingsStore.tsx:195/293`) are **not** wired: consent cannot be on yet (Global Constraints).

| Code | Site |
|---|---|
| `user_db_write_failed` | `[surahId].tsx:378` (bookmark write catch), `[surahId].tsx:453` (note write catch), `MushafScreen.tsx` bookmark write catch |
| `settings_persist_failed` | `settingsStore.tsx` persistence chain catch near `:365` (the post-hydration write path) |
| `audio_fetch_failed` | `src/audio/ayahAudio.ts:297` (`status.error` from the player) |

`corpus_db_open_failed` stays in `telemetryErrorCodes` unused (it is allowlist data; removal is churn).

- [ ] **Step 1: Failing tests.** In each site's existing test file (`SurahRoute.test.tsx`, the MushafScreen suite, `settingsStore.test.tsx`, `ayahAudio.test.ts`), `vi.mock('@/telemetry/telemetry', () => ({ telemetry: { captureEvent: vi.fn(), captureException: vi.fn() } }))` and assert exact name + exact properties per row. Also:
  - `reader_ayah_opened`: **one** call across two viewable changes in the same surah; a second call after paging to another surah.
  - `reader_audio_played`: tap Play → 1 call; tap again (pause) → still 1.
  - `bookmark_toggled`: write rejects → 0 calls + `user_db_write_failed` 1 call; ConfirmSheet confirm path → 1 call.
  - `setting_changed`: `setAnalyticsEnabled(false)` and `(true)` → 0 calls; `setTheme('dark')` → `{ theme: 'dark' }`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** add the calls. **Step 4:** PASS.
- [ ] **Step 5: Mutation-check:** (a) move the `first` computation after the assignment → "one call" FAILS; (b) drop the start-guard → pause test FAILS; (c) drop the `analyticsEnabled` skip → FAILS; (d) emit bookmark before `await` → reject test FAILS. Restore each.
- [ ] **Step 6:** lint + type-check + test green. **Commit** `feat(mobile/telemetry): named events and error codes at their call sites`. Then T4 Step 12 (§5).

---

### Task 6: #112 — reader always shows a transport for a sounding/parked track (R-11)

**Files:**
- Modify: `apps/mobile/src/components/MiniPlayer.tsx`
- Modify: `apps/mobile/app/surah/[surahId].tsx`
- Modify: `apps/mobile/src/components/SurahReader.tsx` (`SurahReader` props + pass-through to inner `AyahList`, padding at `:1014`; `dockedAyah` seed at `:1131`)
- Test: `apps/mobile/src/components/SurahReader.test.tsx` (real reader, docked bar + padding), `apps/mobile/src/screens/SurahRoute.test.tsx` (route wiring), `apps/mobile/src/components/MiniPlayer.test.tsx`

**Interfaces:**
- `MiniPlayer({ bottom?: number })` — `bottom` given = dock offset on a pushed screen (no tab bar), else `tabBarTop + 8`.
- `SurahReader` new props: `foreignBar: boolean` (forwarded to `AyahList` → adds `RECITATION_BAR_CLEARANCE` like `barDocked`), `parkedAyah: number | null` (own track's current ayah when `mine`, seeds `dockedAyah` on mount).

Invariant (issue #112): **while a track exists (sounding or paused), the reader screen shows exactly one transport.**

Two holes the naive fix leaves, both closed here:
- **Zero transports:** own track paused on 2:5 → page to 3 → back to 2. `mine` is true again, but the remounted `SurahReader` starts with `dockedAyah === null` (`:1131`), so its bar hides — and MiniPlayer is hidden because `mine`. Fix: seed `dockedAyah` from `parkedAyah`.
- **Two transports mid-slide:** `mine` reads the pager's `surahId` (`[surahId].tsx:142`), which flips before the outgoing reader unmounts. Fix: compute `foreign` from `displayedSurahId`.

- [ ] **Step 1: Failing tests**
  - `SurahReader.test.tsx` (renders the real reader + its `RecitationBar`):
    1. `parkedAyah={5}`, `playingAyah={null}` on mount → bar docked on ayah 5 (`ayahNumber` 5).
    2. `foreignBar` → list `paddingBottom` includes `RECITATION_BAR_CLEARANCE`; `foreignBar={false}` and not docked → it does not.
  - `SurahRoute.test.tsx`: extend its mocks first — add `usePathname: () => '/surah/3'` to the `expo-router` mock; make the recitation mock stateful (a `let track` the test sets, `surahName` included). `SurahReader` stays stubbed here; assert on props it receives + MiniPlayer presence:
    3. track `{owner:'reader', surahId:2}`, displayed surah 3 → `mini-player` rendered; stub receives `foreignBar=true`.
    4. track `{owner:'mushaf', surahId:3}`, displayed 3 → `mini-player` rendered.
    5. track `{owner:'reader', surahId:3}`, displayed 3 → **no** `mini-player`; stub receives `parkedAyah` = track ayah, `foreignBar=false`.
    6. pager `surahId` already 4 but `displayedSurahId` still 3 with own track on 3 → **no** `mini-player` (mid-slide).
  - `MiniPlayer.test.tsx`: `bottom={24}` → container style `bottom: 24`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement**
  - `MiniPlayer`: `export function MiniPlayer({ bottom }: { bottom?: number } = {})`; style `bottom: bottom ?? tabBarTop + 8`. Pathname gate unchanged.
  - `[surahId].tsx`: `const ownTrackHere = audio.track?.owner === 'reader' && audio.track.surahId === displayedSurahId;` `const foreign = audio.track !== null && !ownTrackHere;` Keep the existing `mine` for highlight/error. Render `{foreign ? <MiniPlayer bottom={insets.bottom + 8} /> : null}` as the last child of the screen root, with `useSafeAreaInsets` from `react-native-safe-area-context` (add the import if absent). Pass `foreignBar={foreign}` and `parkedAyah={ownTrackHere ? audio.ayah : null}` to `SurahReader`.
  - `SurahReader`: `useState<number | null>(() => parkedAyah)` at `:1131`; forward `foreignBar` to `AyahList`; padding `listBottomPadding + (barDocked || foreignBar ? RECITATION_BAR_CLEARANCE : 0)`.
  - No change to `recitationContext.tsx`: the engine surviving navigation is M8's point and the #87 ruling.
- [ ] **Step 4:** PASS. **Mutation-check:** (a) `foreign` from pager `surahId` instead of `displayedSurahId` → test 6 FAILS; (b) seed `useState(null)` → test 1 FAILS; (c) `foreign = false` → tests 3/4 FAIL. Restore each.
- [ ] **Step 5:** lint + type-check + test green.
- [ ] **Step 6: Device** (release build, owner coordinates) — the real single-transport gate, the shim cannot see z-order: (a) M6r check 141 + #112 repro: al-Baqara Play, Continuous on, Next surah → transport visible, Pause works, last ayah of Aal-Imran clears the bar; (b) pause 2:5 → Next → Prev → bar docked on 2:5; (c) watch the slide itself for a double bar (screen-record 60fps). Phone portrait + tablet landscape. Record.
- [ ] **Step 7: Commit** `fix(mobile): keep one transport on the reader for any live recitation (#112)`

---

### Task 7: #106 — mushaf memory: measure, then fix the real category

The issue's model (fonts ~200 KB × N) cannot explain 684 MB after 16 page fonts (~3 MB of TTF). Do not fix the font cache on assumption. `superpowers:systematic-debugging`.

**Files:** first only the Verification Log; fix files decided by Step 3. Candidates: `src/components/mushaf/MushafPage.tsx:205` (`renderToHardwareTextureAndroid`), `src/components/mushaf/MushafPager.tsx:483` (`offscreenPageLimit`), `src/mushaf/pageFont.ts`.

- [ ] **Step 1: Baseline** (release build, owner coordinates). Phone portrait AND tablet landscape. Fresh launch → mushaf → page 1. After 0, 8, 30, 60 turns:
  `adb shell dumpsys meminfo com.qurancorpusly.app | grep -E 'TOTAL PSS|Native Heap|Java Heap|Graphics|GL mtrack|EGL mtrack|Unknown|\.ttf mmap|Other mmap'`
  Record a table. Also `adb shell dumpsys gfxinfo com.qurancorpusly.app | grep -iE 'layer|cache|Total GPU'`.
- [ ] **Step 2: Classify.** Growth that **plateaus** by 30 turns = window cost, not a leak. Growth that is **monotonic** to 60 = leak; name the category that grows.
- [ ] **Step 3: Fix by category** (pick the one the data names; record the decision):
  - **Graphics / GL / EGL mtrack grows** (hardware layers retained): count mounted `MushafPage`s with layer (`uiautomator dump` / React DevTools). If pages beyond `offscreenPageLimit` keep `renderToHardwareTextureAndroid`, gate it to `page within ±WINDOW of current` (prop from pager). Must keep the swipe-jank win — re-measure framestats per [[ui-thread-jank-measure-framestats]]: janky frames ≤ 10% (was 8% after the layer fix).
  - **Native Heap grows** (typeface / glyph cache): `expo-font` has no unload; cap is process-level. Lever = keep `loaded` but stop re-rendering offscreen pages' Text (memo) so HWUI drops their glyph caches; if still monotonic, file the ceiling and accept it if under the budget below.
  - **Neither grows past 30 turns** → #106 is a plateau, not a leak; close with the numbers.
  Each code change gets a test in the owning file's existing test suite (e.g. `MushafPage.test.tsx` asserts `data-hardware-layer` true only on window pages) + mutation-check.
- [ ] **Step 4: Acceptance** (proposed; owner may amend at plan review): phone portrait 60 turns PSS **≤ 450 MB** and last 30 turns grow **< 10 %**; tablet landscape 60 turns **≤ 700 MB** plateaued. Target class is 3–4 GB RAM (PRD §8.7) → also confirm no crash in T2/T14 pre-launch report on low-RAM devices.
- [ ] **Step 5:** lint + type-check + test green. **Commit** `fix(mobile/mushaf): <category> memory bound on page turns (#106)` — or, if plateau, a docs commit with the table and `gh issue close 106` (owner OK first).

---

### Task 8: #91 — Settings chips announce role + selected

`ChoiceChip` already sets `accessibilityRole="radio"` + `accessibilityState={{ selected, checked }}` (`SettingsScreen.tsx:105-106`), yet the vc23 dump showed `checkable=false selected=false`. `SheetRow` (works) differs in two ways: plain `Pressable` (not `Animated.createAnimatedComponent(Pressable)`), and its `radiogroup` View is **unnamed** (`ReciterSheet.tsx:42`); `ChoiceRow`'s has `accessibilityLabel={label}` (`SettingsScreen.tsx:171-172`).

**Files:** `apps/mobile/src/screens/SettingsScreen.tsx`; test `apps/mobile/src/screens/SettingsTab.test.tsx`.

- [ ] **Step 1: Re-dump on current build** (release, owner coordinates): `adb shell uiautomator dump /sdcard/s.xml && adb pull /sdcard/s.xml` on Menu → Settings. If chips now show `checkable=true` + active `checked=true` → close #91 with the dump (fixed incidentally), skip to Step 5.
- [ ] **Step 2: Fix B first (likelier cause):** a labelled parent does not explain `checkable=false` on the chips themselves; the Animated wrapper not forwarding a11y state to the native view does. `ChoiceChip` → plain `Pressable` with `usePressScaleStyle()` exactly as `SheetRow.tsx:41,58` does (style function form). Rebuild, dump. Active chip `checkable=true checked=true` → Step 4.
- [ ] **Step 3: Fix A (only if B alone fails on device):** also remove `accessibilityLabel={label}` from the `radiogroup` View (`SettingsScreen.tsx:172`), matching `ReciterSheet.tsx:42`. Rebuild, dump.
- [ ] **Step 4: Pin what worked** in `SettingsTab.test.tsx`: each chip `role=radio`, active one `aria-checked=true`; if Fix A landed, the radiogroup container has no accessible name. The shim renders `Pressable` and `Animated` Pressable identically, so **Fix B is device-gated only** — record the before/after dumps in the log as its evidence; mutation-check B on device (revert → dump shows `checkable=false`) only if the owner OKs one extra build, else note "B unmutated, dump before/after is the evidence". Mutation-check A in the shim (re-add label → test FAILS).
- [ ] **Step 5:** lint + type-check + test green. **Commit** `fix(mobile/settings): settings chips expose radio state to TalkBack (#91)`

---

### Task 8A: Android backup — user DB in, corpus DB out (R-13) — §5

Today: `allowBackup="true"`, no `fullBackupContent` / `dataExtractionRules`, so Auto Backup tries all of `files/` incl. the ~134 MB extracted corpus DB (`openCorpusDb.ts`, `files/SQLite/quran-corpus-m13b.db`) — over the 25 MB quota, so **nothing** is backed up. Bookmarks/notes die with the phone (#99).

Include-list, not exclude-list: back up **only** `files/SQLite/quran-corpus-user.db.backup` — the consistent staged copy `userDb.ts` already refreshes (`BACKUP_NAME`, `:99`, refresh `:233-241`). Never the live DB (WAL sidecars, mid-write). On restore the live DB is absent and the backup present → the existing `restoreIfMissing` (`userDb.ts:~156-189`) restores it. No new restore code.

**Files:**
- Create: `apps/mobile/plugins/withBackupRules.js`, `apps/mobile/plugins/withBackupRules.test.mjs` (same style as `withMushafAssetPack.test.mjs`)
- Modify: `apps/mobile/app.json` (plugin entry)

**Interfaces:** writes `res/xml/backup_rules.xml` + `res/xml/data_extraction_rules.xml`; sets `android:fullBackupContent="@xml/backup_rules"` and `android:dataExtractionRules="@xml/data_extraction_rules"` on `<application>`.

- [ ] **Step 1: Failing test** (`withBackupRules.test.mjs`, vitest — `vitest.config.ts:22` already includes `plugins/**/*.test.mjs`): run the plugin's pure builders and assert:
  - `backupRulesXml()` contains exactly one `<include domain="file" path="SQLite/quran-corpus-user.db.backup"/>` and no other `<include>`.
  - `dataExtractionRulesXml()` has the same single include under **both** `<cloud-backup>` and `<device-transfer>`.
  - the manifest mod sets both attributes and leaves `allowBackup="true"`.
  - the filename is imported from one place: the plugin reads `userDbFileName` by parsing `src/data/openCorpusDb.ts` (regex on `export const userDbFileName = '…'`) and the test asserts it equals `'quran-corpus-user.db'` — a rename then fails the test instead of silently backing up nothing.
- [ ] **Step 2:** Run (`cd apps/mobile && pnpm vitest run plugins/withBackupRules.test.mjs`) → FAIL.
- [ ] **Step 3: Implement** with `withDangerousMod` (write the two XML files under `android/app/src/main/res/xml/`) + `withAndroidManifest` (set the two attributes on `manifest.application[0].$`). Export the two pure XML builders for the test.
- [ ] **Step 4:** PASS. **Mutation-check:** change the include path to the live DB name → test FAILS; drop the `<device-transfer>` block → FAILS. Restore.
- [ ] **Step 5:** lint + type-check + test green.
- [ ] **Step 6: Device** (internal-track build, owner coordinates): add a bookmark + note → wait for the app's backup refresh → `adb shell bmgr backupnow com.qurancorpusly.app` → `adb shell pm clear` is blocked here, so uninstall → reinstall from Play → `adb shell bmgr restore` happens on install (or `bmgr restore <token> com.qurancorpusly.app` with the token from `bmgr list sets`) → launch → bookmark + note present, logcat shows `has been RESTORED from`. Also confirm `adb shell dumpsys backup | grep -A3 qurancorpusly` reports a size well under 25 MB. Record. (First time the restore path ever runs on hardware — S1 noted it never had.)
- [ ] **Step 7: Commit** `feat(mobile): back up the user database, not the corpus, via Android backup rules`
- [ ] **Step 8: STOP — §5** (persisted device state). Ask owner to run `/code-review` on T8A.

---

### Task 9: Licence inventory + owner sign-off (R-8)

`docs/data-sources-m1.md` is stale: 7 rows "Not approved" and whole sources missing. No code except `pending` flags in About.

**Files:** `docs/data-sources-m1.md`; `apps/mobile/src/screens/AboutScreen.tsx` (`pending` flags only).

- [ ] **Step 1: Inventory what the AAB actually ships** — every row from ground truth, not memory:
  - corpus tables (no `sqlite3` on this machine — use `python3 -I` with `sqlite3.connect('file:apps/mobile/assets/db/quran.db?mode=ro', uri=True)`): `select language_code, translator, count(*) from translations group by 1,2` (check real column names with `pragma table_info(translations)` first); `select source, count(*) from root_definitions group by 1`; same for `word_glosses`, `root_glosses`; plus the provenance of `surah_names` (vkorane.ru), `word_concept_tags`, `mushaf_layout`. List every table (`select name from sqlite_master where type='table'`) and account for each one's source.
  - fonts: `ls apps/mobile/assets/fonts` + mushaf pack (QCF V2, 604) + `SurahNameV2/V4` + `hafs.ttf` (patched, PR #115) + Newsreader (OFL).
  - mushaf layout data (M7b import source), audio (everyayah.com, each reciter in `RECITERS`), morphology (corpus.quran.com, GPL), Lane (qurandev/roots + Perseus TEI), Hans Wehr, editorial glosses, Tasnim WBW, Quran Academy ru WBW, Tanzil text.
  - Cross-check against every `CreditRow` in `AboutScreen.tsx`. A shipped source with no credit = defect; a credit with no shipped source = remove.
- [ ] **Step 2: Per row research**, primary sources only (licence page / terms URL, quoted clause): licence, obligations (attribution text, no-modification, non-commercial, share-alike), evidence URL + date. Columns: `Dataset | Source | Licence (quoted) | Evidence URL | Obligations | Met how | Status | Owner sign-off date`.
  Status ∈ `Approved` | `Owner-accepted risk` | `Cut`. Already-recorded owner risk decisions carry over with their dates: Hans Wehr (copyright risk accepted, Phase 23), Hafs patched font vs EULA (2026-10-06), Quran Academy ru WBW (#116 override 2026-10-07).
- [ ] **Step 3: Owner signs** each row (AskUserQuestion per row group). `Cut` rows → open an issue to drop them from the mobile export before T14's RC build.
- [ ] **Step 4:** About: drop `pending: true` only on rows now `Approved`/`Owner-accepted risk`; adjust `AboutScreen` test expectations accordingly. lint + type-check + test.
- [ ] **Step 5: Commit** `docs: release licence inventory with owner sign-off` (+ `fix(mobile/about): …` if code changed).

**Gate:** T14 does not start with any row not signed.

---

### Task 10: Privacy policy (GitHub Pages) + in-app link

**Depends:** T0 Steps 1, 6.
**Files:**
- Create: `site/privacy/index.html`, `.github/workflows/pages.yml`
- Modify: `apps/mobile/src/screens/AboutScreen.tsx` (link row beside `about-license-link`), `uiStrings.ts` (`about.privacyPolicy`), `AboutScreen` test.

URL (fixed): **`https://j3ff4.github.io/quran-corpus/privacy/`**

- [ ] **Step 1: Policy content** (one static HTML, three `<section lang>` blocks en/uz/ru, no JS, no external resources). Must state, true to T3–T5 code:
  - App: Quran Corpusly, `com.qurancorpusly.app`, developer contact `T0.contact`.
  - Local-only data: bookmarks, notes, reading position, settings — stored on device. A copy of that one file is included in Android's own backup / device transfer under the user's Google account (T8A rules; the corpus is excluded); the developer never receives it.
  - Optional diagnostics (off by default, Settings switch): Sentry crash reports (stack trace, app version, device model, OS version; no messages, no IP) and PostHog anonymous events (exact list: the 5 `telemetryEvents` + their allowlisted properties), anonymous install ID, EU storage, processors named with links, retention = provider default (state it after checking each provider's retention page), turning the switch off stops collection.
  - Network: audio streamed from everyayah.com — that server sees IP + requested file; its own policy applies.
  - No ads, no accounts, no sale/sharing of data, not directed at children under 13.
  - Deletion: uninstall removes local data; diagnostics deletion request via contact address.
  - Effective date.
- [ ] **Step 2: Workflow**

```yaml
# .github/workflows/pages.yml
name: pages
on:
  push:
    branches: [main]
    paths: ['site/**', '.github/workflows/pages.yml']
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: '${{ steps.d.outputs.page_url }}' }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/upload-pages-artifact@v3
        with: { path: site }
      - id: d
        uses: actions/deploy-pages@v4
```

  Only `site/` is published — never `docs/` (plans are not public-facing pages).
- [ ] **Step 3: In-app link — failing test** in the About test: `about-privacy-link` has `accessibilityRole="link"` and pressing it calls `Linking.openURL('https://j3ff4.github.io/quran-corpus/privacy/')` (mock `Linking`).
- [ ] **Step 4: Implement:** `const PRIVACY_POLICY_URL = 'https://j3ff4.github.io/quran-corpus/privacy/';` in `AboutScreen.tsx`; a second `Pressable` (`testID="about-privacy-link"`, `accessibilityRole="link"`) in the same `GlassSurface` as the licence link, `onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}`. Strings: en `Privacy policy`, uz `Maxfiylik siyosati`, ru `Политика конфиденциальности`.
- [ ] **Step 4b: Corpus data version on About** (PRD §6.8): failing test in the About suite — a line `Data <corpusDbVersion>` (testID `about-data-version`) renders `m13b`. Implement by importing `corpusDbVersion` from `@/data/openCorpusDb` (`openCorpusDb.ts:49`) beside the version line at `AboutScreen.tsx:120`; strings en `Data`, uz `Maʼlumotlar`, ru `Данные`. Test mocks `@/data/openCorpusDb`'s `corpusDbVersion` to `'test1'` and expects `Data test1`, so a hard-coded string fails it (that is the mutation-check).
- [ ] **Step 5:** PASS; mutation-check: change URL → test FAILS. lint + type-check + test.
- [ ] **Step 6: Commit** `feat(mobile/about): privacy policy page and in-app link`. After merge (owner): confirm URL returns 200 and renders all three languages on a phone. Record.

---

### Task 11: Store listing (en / uz / ru)

**Files:** Create `docs/release/store-listing.md` (text only). Images → `~/quran-data/release/store-assets/` (outside git).

- [ ] **Step 1: Text** per language: title `Quran Corpusly` (≤ 30), short description (≤ 80), full description (≤ 4000; core flows: offline reading, word-by-word morphology, roots dictionary, search, paged mushaf, recitation; source credits sentence naming corpus.quran.com, Tanzil, translators — no claim of affiliation). Category **Books & Reference**. Tags. Contact `T0.contact`, privacy URL (T10). Owner signs off uz/ru.
- [ ] **Step 2: Graphics** — design first (§8, `impeccable` skill): 512×512 icon (32-bit PNG, from `assets/icons/icon.png` source art, no alpha issues), 1024×500 feature graphic (brand palette, no AI-slop, no "best/#1" text — Play metadata policy).
- [ ] **Step 3: Screenshots** from the Play-installed build (T2), owner coordinates: phone ≥ 4 (9:16, ≥ 1080 px short side): Home, reader with word sheet, dictionary root, mushaf page; tablet 7"/10" ≥ 4 (S4a/S4b layouts incl. landscape spread). Light + one dark. Per listing language, UI in that locale. `adb exec-out screencap -p > file.png`. No status-bar clutter (demo mode if available: `adb shell settings put global sysui_demo_allowed 1` is blocked on this device → crop or accept).
- [ ] **Step 4: Commit** `docs: Play store listing text en/uz/ru`.

---

### Task 12: Play Console declarations (owner enters; agent drafts answers)

Draft answers into `docs/release/store-listing.md` § Declarations; owner enters them.

- [ ] **Data safety:** collects (optional, user can turn off): *Crash logs*, *Diagnostics*, *App interactions*, *Device or other IDs* (PostHog anonymous ID). Purpose: App functionality / Analytics. Not shared (processors ≠ sharing). Encrypted in transit: yes. Deletion: request via contact. Local-only user data: not collected (Android backup is Google's, under the user's account, not the developer's). Re-check against T4 Step 1's PostHog auto-property findings before submitting.
- [ ] **Advertising ID** declaration (mandatory, targetSdk 33+): "No, the app does not use advertising ID"; T2 Step 4 must show `AD_ID` absent (T1 blocks it).
- [ ] **Content rating (IARC):** Reference/education, no violence/sex/gambling, no UGC shared between users (notes are local), no location.
- [ ] **Target audience:** 13–15, 16–17, 18+ (R-12). Not "appeals to children".
- [ ] **Ads:** No. **App access:** all functionality without login. **News app:** No. **Government:** No. **Financial/health features:** none.
- [ ] **Foreground service declaration** (targetSdk 34+): type `mediaPlayback` — "plays Quran recitation the user started, continues with screen off; controls in notification". Provide a short screen recording (owner) if Console asks.
- [ ] **Permissions:** confirm each permission from T2 Step 4 needs no further declaration.
- [ ] **Commit** `docs: Play Console declarations draft`.

---

### Task 13: Closed test — 12 testers × 14 days (R-5)

**Starts as soon as:** T2 (AAB on a track), T10 live, **T11 Steps 1–3** (closed tracks need a complete listing: icon, feature graphic, ≥ 2 phone screenshots), T12 entered. Only internal testing can run before those. Run T5–T9 fixes *during* the 14 days; each fix ships as a new closed-track build (versionCode +1). Uploading new builds does not reset the 14-day clock; testers dropping below 12 opted-in may.

- [ ] **Step 1 (owner):** Closed testing → create track → add testers (email list / Google Group) → upload current AAB → roll out. Record start date `T13.start`.
- [ ] **Step 2:** Track opted-in count every few days (Console). Record. < 12 → recruit.
- [ ] **Step 3:** Collect tester feedback → issues. Triage with owner; only crashes/data-loss block.
- [ ] **Step 4:** Day ≥ 14 with ≥ 12 opted in → owner applies for production access (Console questionnaire: testing recruitment, feedback received, changes made — answer from Step 3 log). Google review ~7 days. Record `T13.productionAccess`.

---

### Task 14: Release-candidate QA on the Play-delivered build

**Gate:** T3–T10 merged; T9 fully signed; RC built from `main` with `eas build -p android --profile production`, versionCode next, distributed via closed track, **installed from Play** on phone + tablet (not sideloaded).

Record each in the Verification Log (§10: not complete until recorded).

- [ ] **RC-1 Offline + budgets:** airplane mode, fresh install → first launch works (record its time separately — it extracts ~134 MB, `_layout.tsx`). Then force-stop and measure the **second** cold launch: `adb shell am start -W -n com.qurancorpusly.app/.MainActivity` TotalTime ≤ 2.5 s (PRD §8.7). Surah open ≤ 300 ms and search `رحمة` ≤ 500 ms: screen-record at 60 fps (`adb shell screenrecord`), count frames from the tap frame to the first frame showing results; 3 repeats, median.
- [ ] **RC-2 Core study flow:** surah → tap word → morphology sheet → root dictionary → back to reading (PRD §13).
- [ ] **RC-3 Upgrade keeps user data (old check 148):** install RC (vcN) from track, add 3 bookmarks + 1 note + khatm mark, publish vcN+1 to the track, update via Play → all survive.
- [ ] **RC-4 Audio:** play, lock screen controls, screen off continues, continuous play; #112 repro (T6 Step 6).
- [ ] **RC-5 Mushaf memory:** T7 Step 1 protocol at 60 turns on phone → within T7 acceptance.
- [ ] **RC-6 Telemetry consent + scrubbing:** (a) default OFF → no PostHog event, no Sentry session for this release in 10 min of use. (b) ON → `app_opened` + session appear. (c) OFF → nothing new in 10 min (no `setting_changed`). (d) ON again **without restarting** → events resume; one forced error below produces **one** Sentry event, not two (close→init double handler). (e) Forced errors with consent ON: native — `adb shell am crash com.qurancorpusly.app`; handled JS — airplane mode + Play an ayah → `audio_fetch_failed`. Open both events in Sentry: no exception value except the code, no message, no device name, no IP, no breadcrumbs. (f) PostHog event inspector: no `$device_name` or other free-text property.
- [ ] **RC-7 TalkBack (owner-run):** #100 (check 424: licence link + body + heading), #34 (checks 143/144: juz row + era header expanded/collapsed), #91 (settings chips announce "radio button, checked, English"), privacy link announces as link. Close issues on pass.
- [ ] **RC-8 Owed device checks:** the README on-device smoke checklists (M1, M3, M4, M6a, Hafs — CLAUDE.md §10's gate) + M8 340–352, S4b's 13, 272/273 + T8A Step 6 restore — re-run on RC; checks deleted by later phases marked obsolete with the commit that deleted them.
- [ ] **RC-9 Pre-launch report** on the RC: 0 crashes, 0 ANRs; a11y warnings triaged.
- [ ] **RC-10 About:** every shipped source credited, no stale `pending`, privacy + licence links work, version line `Quran Corpusly 1.0.0`, data version line shows the bundled `corpusDbVersion`.
- [ ] **RC-11 Locales:** en/uz(Latin+Cyrillic)/ru UI walk of Home, Settings, About.

Any FAIL → issue, fix through §4 loop, new RC, re-run the failed rows + RC-1/RC-9.

---

### Task 15: Production release (owner)

- [ ] **Step 1:** Production access granted (T13 Step 4).
- [ ] **Step 2:** Promote the passing RC from closed → production, **staged rollout 20 %** if Console offers it for a first release; if not, 100 % with **Managed publishing** on so the owner presses publish after review. Release notes en/uz/ru (draft in `store-listing.md`).
- [ ] **Step 3:** Watch Android vitals + Sentry 72 h: crash-free sessions ≥ 99.5 % (PRD §13; Sentry only sees opted-in users, vitals sees all). Pass → 100 %. Fail → halt rollout, fix, new build.
- [ ] **Step 4:** STATUS.md ledger + memory update; close #106/#112/#91/#100/#34 if not closed; tag `mobile-v1.0.0` (owner approves tag).

---

## Risks + Rollbacks

| Risk | Mitigation / rollback |
|---|---|
| Play ID verification / production-access review delays (days–weeks) | T0 Step 2 first; T13 starts as early as T2. |
| < 12 testers stay opted in 14 days | Recruit 15+; track in T13 Step 2. |
| EAS upload > limit or slow (~300 MB archive) | Measured at T2 Step 2; fallback = local Gradle `bundleRelease` with EAS-downloaded keystore (memory: local-apk-build-without-eas, `taskset`). |
| EAS first AAB with the asset-pack plugin never built remotely before (S2 built locally) | T2 Step 4 verifies pack + size before any upload. |
| Lost upload key | EAS holds it + T2 Step 3 offline backup; Play upload-key reset is the last resort. |
| targetSdk < 36 from Expo 57 default | T2 Step 4 check; set via expo-build-properties. |
| Sentry metro wrapper breaks the pack alias | T4 Step 3 export check; rollback = revert metro change (source maps unsymbolicated, crashes still reported). |
| Telemetry leaks user text | T3 allowlist + tests + server-side scrubbers (T0 Step 4) + §5 `/code-review`. Rollback = ship with switch hidden/empty DSN (config only). |
| Licence row ends `Cut` | Drop from mobile export (issue), rebuild DB; About updated. |
| Package rename strands sideloaded users' data | Accepted (R-6); testers told (T1 Step 6). |
| #106 fix regresses swipe jank | T7 Step 3 framestats gate; rollback = revert, accept plateau if within budget. |
| Play policy rejection (metadata, impersonation, permissions) | Name changed (R-6); listing avoids affiliation claims; FGS + Ad-ID declarations drafted; unused permissions blocked (T1); fix + resubmit. |
| 16 KB page-size rejection | T2 Step 4 `zipalign -P 16` on every split before upload. |
| Backup rules restore a stale user DB over a newer one | Restore only fires when the live DB is absent (existing `restoreIfMissing`); T8A device test + §5 review. |
| F-Droid build drifts with telemetry SDKs inside | Out of scope (R-14); next phase owns it. |

## Acceptance (phase exit)

- `com.qurancorpusly.app` 1.0.0 live in Play production at 100 % rollout.
- PRD §11 boxes all true on the Play build, incl. "Crash reporting and privacy-safe analytics are configured" (opt-in, R-2).
- #112, #91 closed by device evidence; #106 closed with measured numbers; #100, #34 closed by owner TalkBack run.
- `docs/data-sources-m1.md`: every row signed.
- Privacy URL 200, linked in-app + in Console.
- User DB backup copy restores on reinstall (T8A Step 6); corpus DB not in backup.
- RC-1..RC-11 all PASS in the log.
- CI green on `main`.

## Verification Log

| Field | Value |
|---|---|
| T0.contact | |
| T0.playAccount | |
| T0.sentryOrg / project / dsn | |
| T0.posthogKey | |
| T0.testers | |
| T2.keystoreBackup | |
| T2 manifest / size | |
| T2 smoke / pre-launch | |
| T2 16 KB / permissions | |
| T4 dep versions + audit (baseline/after) | |
| T4 SDK source answers (opt-out persistence, queue, $device_name, close→init) | |
| T8 dumps before/after | |
| T8A backup size / restore | |
| T7 memory table | |
| T13.start / count / productionAccess | |
| RC-1 … RC-11 | |
