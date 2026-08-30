# M6 Glass Redesign — Umbrella Plan

> **For agentic workers:** this file is the **spec**, not a task list. Every
> `docs/plans/phase-m6[a-i]-*.md` argues from it. Read this file first, then the
> sub-phase plan you are executing. REQUIRED SUB-SKILL for the sub-phase plans:
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans.

**Goal:** Re-skin the whole Android app to the owner's glass design, and grow
four features the design assumes (home counters, bookmark notes, reader mode
toggle, real audio playback), without adding a single dependency.

**Architecture:** One new theme layer (`glass.ts` + `Bloom` + `GlassSurface`)
that every screen consumes; nine sub-phases, each its own branch, PR and preview
APK. Screens are restyled in place — no route moves, no navigator changes beyond
the tab bar's own renderer. Two sub-phases touch the on-device user DB schema
and one touches `packages/data`; those are the only §5 triggers.

**Tech Stack:** Expo SDK 57 / expo-router 57 / React Native 0.86,
`react-native-svg` 15.15.4, `react-native-reanimated` 4.5.0, `expo-audio` 57.0.3,
`react-native-safe-area-context` 5.7, `expo-font` 57. Vitest + Testing Library
over the `@/testing/rnHosts` DOM shim.

**Design source of truth:** `~/quran-data/corpus-design-files/Quran Corpus Glass.dc.html`
(15 mockups: `1a`–`1k` turn 1, `2a`–`2d` turn 2) plus
`Mobile app design brainstorm-handoff.zip`. Recreate pixel-perfect in RN; do not
port structure. Do not render or screenshot the bundle.

---

## Decision record

Every row is an owner ruling from the 2026-08-24 grilling. Binding. Do not
re-litigate inside a sub-phase; if a plan and this table disagree, this table
wins and the plan is wrong.

### Scope

| # | Decision |
| --- | --- |
| 1 | Full re-skin, every screen. Not a partial pass. |
| 2 | Phase is **M6**. PRD §10 renumbers: hardening → M7, treebank → M8, iOS → M9. |
| 3 | Nine sub-phases, one plan file, one branch, one PR, one preview APK each. |
| 4 | `main` may sit half-redesigned between merges. Accepted — nothing is public. |
| 5 | Plan first. Mockups for unmocked screens are drawn **inside** the sub-phase that ships them, and the agent builds them as HTML for owner review. That means M6g Task 1 (lemma, frequency, dictionary browse, concordance) and M6i Task 0 (menu, settings, about) — confirmed 2026-08-24. |
| 6 | Out of scope: release hardening, iOS, treebank, the web app, analytics/crash providers. |

### Visual system

| # | Decision |
| --- | --- |
| 7 | **Fake glass.** Translucent fill + hairline border + inset top highlight over an SVG radial bloom. No `expo-blur`, no `backdrop-filter` substitute. |
| 8 | Revisit `expo-blur` (`experimentalBlurMethod="dimezisBlurView"`) **only** if the M6a device check says fake glass reads flat. That is a §12 dependency question, so it stops and asks. |
| 9 | `expo-glass-effect` stays installed and unused — it is iOS-26 Liquid Glass only. |
| 10 | Newsreader serif for display type, existing sans for UI. Hafs stays the Arabic face. |
| 11 | Theme default stays `system`. Light and dark both get the full glass treatment. |
| 12 | Motion restrained: sheets, tab transitions, presses. No decorative animation. `useReducedMotion` respected everywhere. |
| 13 | Mobile-only re-skin. `packages/config` palette untouched and no web UI changes. The single exception is decision 38's shared reciter default. |
| 14 | Palette is already correct (`tokens.ts` accent `#1f6f5b`/`#5aa58d`, night `#151412`). No token rewrite — glass tokens are **added**, existing hexes stay. |

### Information architecture

| # | Decision |
| --- | --- |
| 15 | Keep 5 tabs (`index`, `surahs`, `morphology`, `dictionary`, `menu`). Glass styling only, no re-ordering, no removals. |
| 16 | Menu holds Settings, About, Bookmarks. |
| 17 | Reader gets a header mode chip: Mushaf / Translation / Word-by-word. Both WBW doors stay — the Morphology tab keeps working. |
| 18 | Browse modes: Surah, Juz, Page, Revealed. Derived in-app from existing corpus data, no new data. |
| 19 | Revealed = chronological order, grouped Meccan / Medinan. |
| 20 | Page browse scrolls to the page's first ayah. A true paged mushaf is **deferred** — it is a typography project, not a re-skin. |

### Home

| # | Decision |
| --- | --- |
| 21 | All four blocks ship: continue-reading, day streak, roots studied, ayah of the day. |
| 22 | Streak counts **any reading**, on the device's local date. |
| 23 | Roots studied = distinct roots opened. All-time total plus a weekly log. |
| 24 | Ayah of the day = curated shortlist, date-seeded. Draft of 118 verified candidates at `docs/design/m6/ayah-of-the-day-draft.md`, awaiting the owner's strike-through. |

### Word-by-word

| # | Decision |
| --- | --- |
| 25 | `2c` hybrid is the default layout; `2d` dense is a second density mode. `2a` is dropped. |
| 26 | Density is a header chip, remembered globally (a persisted setting). |
| 27 | One cell per word. No phrase grouping. |
| 28 | Per-segment POS colour, as web does. **Every** such render goes through `joinSegmentRuns` + ZWJ (`src/text/arabicJoining.ts`) — Android breaks Arabic shaping across nested `<Text>`. |
| 29 | Tapping a word opens the existing bottom sheet. No inline panel. |

### User data

| # | Decision |
| --- | --- |
| 30 | Bookmark notes: one note per bookmark, 500 characters, plain text. |
| 31 | Stripped and capped at the write boundary in `packages/data`, not in the screen. |
| 32 | A real versioned migration. Existing rows preserved — this file lives on the owner's phone and survives app updates. |
| 33 | Bookmarks screen gets the full treatment: three tabs — **Recent · By surah · With notes**, per mockup `1k` — notes, and the scroll fix (`app/bookmarks.tsx` renders rows in a plain `View` today, so rows past the first screenful are unreachable). No History tab; reading history lives on the home card. |
| 34 | Nothing new leaves the device. The telemetry allowlist is not widened for streaks, roots or notes. |

### Audio

| # | Decision |
| --- | --- |
| 35 | In scope, and no longer cosmetic: scrub bar, continuous play, background playback with lock-screen controls, reciter picker. |
| 36 | No new dependency. `expo-audio@57`'s own config plugin adds `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` and `MediaSessionService`; `shouldPlayInBackground` + `interruptionMode: 'doNotMix'` give the lock-screen controls. `app.json` change plus prebuild. |
| 37 | **Alafasy is excluded outright.** Not in the shortlist, not as a fallback. |
| 38 | Default reciter is **Husary**, on **both products**. Abdur-Rashid Sufi exists only as whole-surah mp3s and the entire playback path is per-ayah; the PRD's "defaulting to Abdul Rashid Sufi" line was never true in code and gets corrected. `ayahAudioUrl` is shared, so the web reader changes from Abdul Basit to Husary with it — the one deliberate web-visible change in M6 (owner ruling 2026-08-24). |
| 39 | Shortlist (8–12, owner-approved in M6f Task 1): Husary ×3 (Murattal / Muallim / Mujawwad), Minshawy, Abdul Basit, Sudais, Shuraym, Shatri, Ayyoub. |
| 40 | Prefer 64 kbps; fall back to the highest available. No caching this phase. |

---

## Global Constraints

Every sub-phase task's requirements implicitly include this section.

- **CLAUDE.md governs.** §4's loop per task, including the mutation-check.
- **No new dependency in any sub-phase (§12).** Everything named in Tech Stack
  above is already in `apps/mobile/package.json`. A font file is an asset, not a
  dependency. If a task appears to need one, stop and ask.
- **`packages/config` is not modified.** The web app must not change.
- **`packages/data` is modified in four sub-phases only:** the user-DB schema
  and migration (M6b, M6h), the browse queries (M6c) and the reciter table
  (M6f). Nowhere else. §2 forbids putting query logic in an app, so a browse
  query cannot be hidden in `apps/mobile` to dodge a review round.
- **§5 independent review fires on M6b, M6c, M6f, M6h.** All four touch either
  `packages/data` or the on-device user DB. `/code-review` is user-triggered:
  stop at the end of the sub-phase and ask. Every other sub-phase ships on §4's
  self-review plus lint / type-check / tests.
- **Gates:** `pnpm -r lint`, `pnpm -r type-check`,
  `pnpm --filter @quran-corpus/mobile test`. All green before any commit.
- **Device gate (§10):** a sub-phase is not complete until its device checks run
  on real hardware and the result is written into that plan's verification log.
  "Implementation complete, verification pending" is a failure.
- **Accessibility:** WCAG AA. Contrast is measured against the **glass surface
  over the bloom**, not against the flat page background — see
  `[[palette-calibrate-against-worst-call-site]]`. `src/testing/contrast.ts`
  is the measuring tool and the assertions live in `tokens.test.ts`.
- **Touch targets** stay ≥ `touchTargets.minimum` (48).
- **Arabic shaping:** decision 28. Non-negotiable, it is a shipped-and-fixed bug
  class (`f409ed0`).
- **Telemetry:** `src/telemetry/telemetry.ts` allowlists by value, not key, and
  both providers are null. Do not touch it.
- **Target device:** mid-range Android, `minSdkVersion: 26`. 60fps.
- **Commits:** Conventional Commits, one logical change each (§9).
- **PRs are the owner's call.** Never run `gh pr create` unprompted.

---

## Sub-phase map

| Sub-phase | Plan file | Branch | §5 | Device checks |
| --- | --- | --- | --- | --- |
| M6a Design system + app chrome | `phase-m6a-design-system.md` | `feat/m6a-design-system` | no | 48–54 |
| M6b Home + counters | `phase-m6b-home-counters.md` | `feat/m6b-home-counters` | **yes** | 55–60 |
| M6c Surah index + browse modes | `phase-m6c-browse-modes.md` | `feat/m6c-browse-modes` | **yes** | 61–64 |
| M6d Reader | `phase-m6d-reader.md` | `feat/m6d-reader` | no | 65–72 |
| M6e Word-by-word | `phase-m6e-wbw.md` | `feat/m6e-wbw` | no | 73–78 |
| M6f Audio | `phase-m6f-audio.md` | `feat/m6f-audio` | **yes** | 79–88 |
| M6g Dictionary + search | `phase-m6g-dictionary-search.md` | `feat/m6g-dictionary-search` | no | 89–107 |
| M6h Bookmarks + notes | `phase-m6h-bookmarks-notes.md` | `feat/m6h-bookmarks-notes` | **yes** | 148–154 |
| M6i Settings, About, Menu | `phase-m6i-settings-about.md` | `feat/m6i-settings-about` | **yes** | 155–159 |

Order is fixed and confirmed by the owner. M6b consumes M6a's primitives; M6e
consumes M6d's mode chip; M6f consumes M6d's reader chrome.

### Superseded device checks

M6a supersedes the three open carry-overs, because the screens they test are
being redrawn:

- M2's rosette carry-over.
- M3 Run 3 checks F5, F6, 27.
- M4 Run 1 checks 28–33.

M6a Task 8 marks them superseded in `README.md` with a pointer to this file. Do
not run them; do not delete the record of them.

---

## Risks

| Risk | Sub-phase | Mitigation | Rollback |
| --- | --- | --- | --- |
| Fake glass reads flat on a real mid-range panel | M6a | Device check 48 is the first thing the first APK proves | Decision 8: stop and ask about `expo-blur` |
| Full-screen SVG bloom costs frames | M6a | One static `<Svg>` behind the navigator, never re-rendered; device check 49 scrolls a long surah | Flat gradient-less background token |
| Per-segment colour breaks shaping in the new layouts | M6e | Decision 28; `arabicJoining.test.ts` extended per layout | Single-colour word render |
| Background playback needs a foreground service and two permissions | M6f | expo-audio's own plugin declares them; no hand-written manifest | Drop `shouldPlayInBackground`, keep foreground-only |
| Continuous play seams between per-ayah mp3s | M6f | Preload the next ayah's player while the current one runs; device check 84 listens for it | Ship gapful; it is audible but not broken |
| A user-DB migration corrupts the owner's real bookmarks | M6b, M6h | Versioned migration + `PRAGMA user_version`, tested against a populated fixture; §5 review | The migration is additive-only, so an old build reads the new file |
| Half-redesigned `main` between merges | all | Accepted (decision 4) | — |

## PRD renumbering

M6a Task 8 rewrites `docs/PRD-android-first-mobile-app.md` §10:

- Insert **M6: Glass Redesign** after M5, summarising this file's scope.
- **M5 Android Release Hardening → M7.**
- **M6 Post-V1 Treebank Readiness → M8.**
- **M7 iOS Readiness → M9.**
- Correct M1's line: audio defaults to **Husary**, streamed per-ayah from the
  public source, not "our thin audio endpoint, defaulting to Abdul Rashid Sufi"
  — no endpoint was ever deployed and Sufi has no per-ayah source (decision 38).

## Verification Log

Every row below was re-verified against `gh pr list --state all` and `git log`
rather than against the ledger (§14). No sub-phase ever ran on a release APK:
EAS has been unavailable since before M6a, so every device run went through Expo
Go on the owner's phone — same JS, same hardware, not a release binary.

| Sub-phase | Merge | PR | Checks | Device run | Result |
| --- | --- | --- | --- | --- | --- |
| M6a | `7168e71` | #20 | 48–54 | 2026-08-24, Expo Go | 4 pass, 1 fail parked to M6b (48, glass legibility), 2 not exercisable (53–54, no consumer yet) |
| M6b | `8ac1348` | #21 | 55–60 | 2026-08-24, Expo Go | 5 pass + check 48 re-run **pass**; 55 deferred |
| M6c | `764c232` | #22 | 61–64 | 2026-08-25, Expo Go | 4/4 pass |
| M6d | `d4d73d4` | #23 | 65–72 | 2026-08-25, Expo Go | 8/8 pass (72 after a fix) |
| M6e | `9c0f86d` | #24 | 73–78 | 2026-08-25, Expo Go | 6/6 pass |
| M6f | `d4d695d`, `865cdf4` | #26, #27 | 79–88 | 2026-08-26, Expo Go | 8 pass, 2 **blocked** (82 controls, 83 — Expo Go cannot test lock-screen controls); 86 after fix `8c625b1` |
| M6g | `e9e1be7` | #30 | 89–107 | 2026-08-27/28, Expo Go | pass, with 92 failing first and passing after `c4f9780`; ran past its own header's 89–96 and finished at 107 |
| M6h | `37fa508` | #38 | 148–154 | 2026-08-29, Expo Go | 149–154 pass (152 after a fix), 1 **blocked** (148 — an APK-upgrade check by definition; the Expo Go sandbox holds no pre-M6h user DB to migrate); two defects fixed in `d9860e0` |
| M6i | `72a17a5` | #40 | 155–159 | 2026-08-29, Expo Go | 155–158 pass; 159 failed on three defects, all fixed and re-checked in the same session (`d9860e0`, `14e8fa9`) |

Also merged inside the M6 window, outside the sub-phase map: **M6r** reader
navigation (`421c08b`, #37, checks 120–147) — a repair pass over M6c/M6d rather
than a numbered sub-phase.

**M6 is not complete.** §10: a milestone is not complete until its device
checklist has been run on real hardware and recorded here. All nine sub-phases
have now run, but four checks are still outstanding — 55 (deferred), 82 and 83
(Expo Go cannot exercise lock-screen controls) and 148 (needs an APK to build
its own pre-upgrade DB) — and **none of the nine ran on a release APK**, so the
whole checklist is owed a re-run against one. Everything above is
"implementation complete, verification pending", which §10 calls an unmet exit
criterion — not a pass. The build window opens **2026-09-01**.
