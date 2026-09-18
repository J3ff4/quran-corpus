# Phase M10 — Web UI Locale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `apps/web` a real UI locale, then use it for the two things M9
imported but web cannot reach: surah names per locale, and Uzbek root glosses.

**Architecture:** Promote mobile's hand-rolled i18n mechanism into
`packages/config/i18n`; both apps import it, each keeps its own string table.
Web resolves locale server-side from a cookie (never client reconcile), so
SSR renders the final text. Script (Latin / Cyrillic) is a **second**,
independent setting — `uiLocale='uz'` + script picks the content code `uz` or
`uz-Cyrl`.

**Tech Stack:** TypeScript, Next.js App Router (server components + cookies),
`packages/config` (source-exports, no build step), Vitest + Testing Library.
**No new dependency.** `next-intl` is deliberately NOT added — §7 says
"next-intl (or equivalent)" and the equivalent already exists and ships.

**Spec:** Owner rulings 2026-09-16, recorded in full under Rulings below.
Upstream: `docs/plans/phase-m9-uzbek-wbw-tasnim.md` Task 8 Steps 4-5, which
this phase takes over.

## Rulings (owner, 2026-09-16)

| # | Question | Ruling |
|---|---|---|
| R1 | Web has no `uiLocale`; drive names off `?lang=`? | **No.** Build real web UI i18n first. |
| R2 | Mechanism | **Promote mobile's layer to a shared package.** Not next-intl, not a copy. |
| R3 | Scope | **Data-driven strings only.** Chrome stays English this phase. |
| R4 | Web script toggle | **Yes.** Web gets Latin/Cyrillic too. |
| R5 | (M9, carried) Surah names | Names follow `uiLocale`; **Arabic + transliteration stay visible regardless** of locale or script. |
| R6 | (M9, carried) Dictionary | Uzbek root glosses **above** Lane / Hans Wehr, which **stay English**. |

## Global Constraints

- **No new npm dependency.** Any proposal to add one stops the task and asks (§12).
- **`packages/config` has no build step** — it exports source. Nothing it
  exports may import React Native, Next, Expo, or `@libsql/client`.
- **Locale resolves server-side.** A client "correct after mount" flashes;
  every locale-dependent string must be right in the SSR payload.
- **`uiLocale` codes:** `'en' | 'uz' | 'ru'`. **Script codes:** `'latin' | 'cyrillic'`.
  **Content language codes** (what the DB stores): `'en' | 'uz' | 'uz-Cyrl' | 'ru'`.
  These are three different things and never the same variable.
- Cyrillic script is meaningful **only** for `uz`. Every other locale ignores it.
- Arabic text, transliteration, and the Arabic surah name are **never** gated
  on locale or script (R5).
- Mobile's runtime behaviour must not change in Task 1. Its test suite is the
  gate: same tests, same results, before and after the move.

---

### Task 1: Promote the i18n mechanism to `packages/config`

**Files:**
- Create: `packages/config/i18n/locales.ts`, `packages/config/i18n/script.ts`,
  `packages/config/i18n/t.ts`, `packages/config/i18n/textDirection.ts`
- Modify: `packages/config/package.json` (4 new `exports` entries)
- Modify: `apps/mobile/src/i18n/languages.ts`, `uiStrings.ts`,
  `textDirection.ts` — become **re-export shims**
- Test: `packages/config/i18n/__tests__/t.test.ts`,
  `packages/config/i18n/__tests__/script.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type UiLocaleCode = 'en' | 'uz' | 'ru'`
  - `type ScriptCode = 'latin' | 'cyrillic'`
  - `type ContentLanguageCode = 'en' | 'uz' | 'uz-Cyrl' | 'ru'`
  - `interface LanguageMetadata<TCode extends string> { code; label; nativeLabel; direction }`
  - `const uiLocales: LanguageMetadata<UiLocaleCode>[]`
  - `function isUiLocale(v: unknown): v is UiLocaleCode`
  - `function isScript(v: unknown): v is ScriptCode`
  - `function contentLanguage(locale: UiLocaleCode, script: ScriptCode): ContentLanguageCode`
  - `function makeT<K extends string>(table: Record<UiLocaleCode, Record<K, string>>): (locale: UiLocaleCode, key: K) => string`
  - `function textAlignFor(text: string): 'left' | 'right'`

**Why shims, not 59 rewrites:** mobile imports `@/i18n/languages` in 48 files
and `@/i18n/uiStrings` in 45. Rewriting them is churn with no reader benefit
and a large diff to review. The three shim files re-export from the package
and say in one comment where the mechanism now lives.

**Why `makeT` and not `t`:** the string TABLE stays per app (R3 + the chrome
differs — mobile has `tabs.*` and `mushaf.*`, web has neither). Only the
lookup mechanism is shared. A single shared table would force web to carry
mobile's keys and vice versa.

- [ ] **Step 1: write the failing tests.**

```ts
// packages/config/i18n/__tests__/script.test.ts
import { describe, it, expect } from 'vitest';
import { contentLanguage } from '../script';

describe('contentLanguage', () => {
  it('maps Uzbek + cyrillic to the uz-Cyrl rows', () => {
    expect(contentLanguage('uz', 'cyrillic')).toBe('uz-Cyrl');
  });
  it('maps Uzbek + latin to uz', () => {
    expect(contentLanguage('uz', 'latin')).toBe('uz');
  });
  it('ignores the script for every locale that has only one', () => {
    // There is no en-Cyrl or ru-Latn in the corpus; asking for one must not
    // invent a language code no row carries.
    expect(contentLanguage('en', 'cyrillic')).toBe('en');
    expect(contentLanguage('ru', 'cyrillic')).toBe('ru');
  });
});
```

```ts
// packages/config/i18n/__tests__/t.test.ts
import { describe, it, expect } from 'vitest';
import { makeT } from '../t';

const t = makeT({
  en: { greet: 'Peace' },
  uz: { greet: 'Salom' },
  ru: { greet: 'Мир' },
});

describe('makeT', () => {
  it('returns the string for the asked locale', () => {
    expect(t('uz', 'greet')).toBe('Salom');
  });
  it('is keyed by the table, so a missing key is a type error not a runtime one', () => {
    // @ts-expect-error 'missing' is not a key of the table
    expect(() => t('en', 'missing')).not.toThrow();
  });
});
```

- [ ] **Step 2: run them, watch them fail** (`no such module`).

Run: `cd packages/config && npx vitest run i18n`

- [ ] **Step 3: write the four modules.**

`locales.ts` and `textDirection.ts` are a **move** of
`apps/mobile/src/i18n/languages.ts` and `textDirection.ts` — copy the bodies
verbatim, including comments, then delete `ContentLanguageCode`'s old
`= [...uiLocales]` aliasing (it is wrong now: `uz-Cyrl` is a content code
with no UI locale).

```ts
// packages/config/i18n/script.ts
import type { UiLocaleCode } from './locales';

export type ScriptCode = 'latin' | 'cyrillic';
export type ContentLanguageCode = 'en' | 'uz' | 'uz-Cyrl' | 'ru';

export function isScript(v: unknown): v is ScriptCode {
  return v === 'latin' || v === 'cyrillic';
}

/** Which DB rows a reader's two settings resolve to.
 *
 *  Only Uzbek ships in two scripts. Returning `${locale}-Cyrl` for anything
 *  else would name a language_code no row carries, and every query would
 *  silently return nothing.
 */
export function contentLanguage(
  locale: UiLocaleCode,
  script: ScriptCode,
): ContentLanguageCode {
  return locale === 'uz' && script === 'cyrillic' ? 'uz-Cyrl' : locale;
}
```

```ts
// packages/config/i18n/t.ts
import type { UiLocaleCode } from './locales';

/** Build a lookup over one app's own string table.
 *
 *  The MECHANISM is shared; the TABLE is not. Web and mobile have different
 *  chrome (mobile has tabs.* and mushaf.*), so one shared table would make
 *  each app carry the other's keys.
 */
export function makeT<K extends string>(
  table: Record<UiLocaleCode, Record<K, string>>,
): (locale: UiLocaleCode, key: K) => string {
  return (locale, key) => table[locale][key];
}
```

- [ ] **Step 4: add the `exports` entries** to `packages/config/package.json`:
      `"./i18n/locales"`, `"./i18n/script"`, `"./i18n/t"`, `"./i18n/textDirection"`.

- [ ] **Step 5: turn mobile's three modules into shims.** Each keeps its
      existing exported names so all 59 importers are untouched:

```ts
// apps/mobile/src/i18n/languages.ts
// The mechanism moved to packages/config/i18n so apps/web can share it
// (phase M10 R2). This file stays as the import path 48 call sites already
// use; the table of STRINGS is still local, in uiStrings.ts.
export type { UiLocaleCode, LanguageMetadata } from '@quran-corpus/config/i18n/locales';
export { uiLocales, isUiLocale } from '@quran-corpus/config/i18n/locales';
export type { ContentLanguageCode, ScriptCode } from '@quran-corpus/config/i18n/script';
export { contentLanguage, isScript } from '@quran-corpus/config/i18n/script';
```

  `uiStrings.ts` keeps its `strings` table and its `UiStringKey` union, and
  replaces its hand-written `t` with `export const t = makeT(strings);`.

- [ ] **Step 6: mobile regression gate.** Run the **whole** mobile suite and
      compare the count to the pre-change run recorded in Step 0 of the
      ledger. Any change in pass count fails the task.

Run: `cd apps/mobile && npx vitest run`
Expected: identical pass count to before the move.

- [ ] **Step 7: mutation-check.** Flip `contentLanguage`'s guard to
      `locale !== 'uz'`; the "ignores the script" test must fail. Restore by
      re-editing (never `git checkout`).

- [ ] **Step 8: commit** — `refactor(config): share the i18n mechanism with web`

---

### Task 2: Web locale + script, resolved server-side

**Files:**
- Create: `apps/web/src/lib/locale.ts` (cookie names, parse, resolve)
- Create: `apps/web/src/components/shared/LocaleSwitcher.tsx` (`'use client'`)
- Modify: `apps/web/src/app/layout.tsx` (`<html lang>` from the resolved locale)
- Test: `apps/web/src/test/locale.test.ts`,
  `apps/web/src/test/LocaleSwitcher.test.tsx`

**Interfaces:**
- Consumes: Task 1's `isUiLocale`, `isScript`, `contentLanguage`, `uiLocales`.
- Produces:
  - `const UI_LOCALE_COOKIE = 'ui-locale'`, `const SCRIPT_COOKIE = 'ui-script'`
  - `function resolveLocale(cookies: ReadonlyMap<string,string> | RequestCookies): { locale: UiLocaleCode; script: ScriptCode; content: ContentLanguageCode }`
  - `<LocaleSwitcher locale script />`

**Pattern to follow:** `apps/web/src/components/wbw/viewMode.ts` +
`words/page.tsx` — a plain (non-client) module holds the cookie name and the
validator, the server component reads `cookies()` and passes the value down.
Copy that shape exactly; it is the established one in this app.

- [ ] **Step 1: failing tests.**

```ts
// apps/web/src/test/locale.test.ts
import { describe, it, expect } from 'vitest';
import { resolveLocale, UI_LOCALE_COOKIE, SCRIPT_COOKIE } from '../lib/locale';

const jar = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? { value: o[k] } : undefined) });

describe('resolveLocale', () => {
  it('defaults to English in Latin when nothing is stored', () => {
    expect(resolveLocale(jar({}))).toEqual({ locale: 'en', script: 'latin', content: 'en' });
  });
  it('resolves Uzbek + Cyrillic to the uz-Cyrl content rows', () => {
    expect(resolveLocale(jar({ [UI_LOCALE_COOKIE]: 'uz', [SCRIPT_COOKIE]: 'cyrillic' })).content)
      .toBe('uz-Cyrl');
  });
  it('rejects a cookie value that is not a locale', () => {
    // The cookie is user-controlled input (§3 OWASP): an unvalidated value
    // reaches a SQL parameter and an <html lang> attribute.
    expect(resolveLocale(jar({ [UI_LOCALE_COOKIE]: "ru'; DROP" })).locale).toBe('en');
  });
  it('ignores a stored cyrillic script for a locale that has no Cyrillic', () => {
    expect(resolveLocale(jar({ [UI_LOCALE_COOKIE]: 'en', [SCRIPT_COOKIE]: 'cyrillic' })).content)
      .toBe('en');
  });
});
```

- [ ] **Step 2: run, watch it fail.**

Run: `cd apps/web && npx vitest run src/test/locale.test.ts`

- [ ] **Step 3: implement `lib/locale.ts`.** Validate BOTH cookies through
      Task 1's guards; fall back to `'en'` / `'latin'` on anything else.

- [ ] **Step 4: the switcher.** A `'use client'` control writing both cookies,
      then `router.refresh()` **at the write site**. Without the refresh the
      App Router serves the cached server render and the change appears only
      on the next hard navigation — the same defect fixed in #57.

- [ ] **Step 5: `<html lang>`** takes the resolved locale. Note: `lang` takes
      the **UI locale**, not the content code — `uz-Cyrl` is not a BCP-47
      language for this purpose, `uz-Cyrl` as `<html lang>` would be legal but
      the page's chrome is still English this phase (R3).

- [ ] **Step 6: a11y check.** The switcher is a disclosure: `aria-expanded`
      **and** `aria-controls` must be paired — a lone `aria-expanded` is a
      standing review finding in this repo.

- [ ] **Step 7: mutation-check.** Delete the `isUiLocale` guard so the raw
      cookie passes through; the "rejects a cookie value" test must fail.

- [ ] **Step 8: commit** — `feat(web): a UI locale and script, resolved server-side`

---

### Task 3: Surah names by locale

**Files:**
- Modify: `apps/web/src/components/reader/SurahHeader.tsx:33,35`
- Modify: `apps/web/src/components/wbw/WbwView.tsx:51`
- Modify: `apps/web/src/components/wbw/VersePicker.tsx:38`
- Modify: `apps/web/src/components/surah-list/SurahCard.tsx:18`
- Modify: `apps/web/src/components/wbw/types.ts` (`PickerSurah` gains `name`)
- Modify: `apps/web/src/app/bookmarks/rows.ts:14,21`
- Modify: the server components feeding all of the above
- Test: extend `SurahHeader.test.tsx`, `SurahCard.test.tsx`,
  `VersePicker.test.tsx`, `bookmarksPage.test.tsx`

**Interfaces:**
- Consumes: `getSurahNames(db, lang)` from `@quran-corpus/data` — **already
  shipped in M9 Task 7**, returns `Map<number, { name, meaning }>` with a
  per-surah fallback to the `surahs` row. Do not write a second query.
- Consumes: Task 2's `resolveLocale`.

**The rule (R5):** the localized name REPLACES the transliteration slot.
Arabic name and transliteration both stay on screen — `SurahHeader` already
renders `name_arabic` separately and must keep doing so. A Russian or English
reader sees exactly what they see today, because `getSurahNames` falls back
to `name_translit` / `name_translation` per surah.

- [ ] **Step 1: failing test** — with locale `uz`, `SurahHeader` renders
      `Fotiha` and **still** renders the Arabic `الفاتحة`.
- [ ] **Step 2: run, watch it fail.**
- [ ] **Step 3: thread `names` down.** Each server component calls
      `getSurahNames(db, content)` once and passes the looked-up name; no
      component calls the DB itself.
- [ ] **Step 4: failing test** — with locale `en`, the header still reads
      `Al-Fatihah`, proving the fallback path and that this is not a
      hard-coded Uzbek swap.
- [ ] **Step 5: green.**
- [ ] **Step 6: mutation-check** — make `getSurahNames`' result ignored and
      fall back to `name_translit` always; the `uz` test must fail.
- [ ] **Step 7: commit** — `feat(web): surah names follow the UI locale`

---

### Task 4: Uzbek root glosses on the dictionary root page

**Files:**
- Modify: `apps/web/src/app/dictionary/[root]/page.tsx`
- Modify: `apps/web/src/components/dictionary/RootEntry.tsx` (above the
  `definitions.map` at :82)
- Test: extend `apps/web/src/test/RootEntry.test.tsx`

**Interfaces:**
- Consumes: `getRootGlosses(db, rootId, lang)` from `@quran-corpus/data` —
  **already shipped in M9 Task 7**, returns `{ gloss, occurrence_count }[]`
  ranked, at most 8 per root.
- Consumes: Task 2's `resolveLocale`.

**The rule (R6):** the Uzbek glosses sit ABOVE Lane / Hans Wehr, and those
articles **stay English**. They are not translations of each other: the root
glosses are derived from how the Quran actually uses the root (M9 Task 6),
the articles are lexicon entries. Do not merge, do not hide the articles.

**Live shape:** 1642 of 1642 roots covered in both `uz` and `uz-Cyrl`, 7220
rows each, average 4.4 glosses per root, cap 8. So an Uzbek reader sees this
block on **every** root page — there is no empty state to design for on `uz`,
but there IS on `en` and `ru`, where `root_glosses` has no rows at all.

- [ ] **Step 1: failing test** — locale `uz`, the root page renders the ranked
      Uzbek glosses above the Lane article, and the Lane article is unchanged
      English.
- [ ] **Step 2: run, watch it fail.**
- [ ] **Step 3: implement.** `getRootGlosses(db, entry.root.id, content)`;
      render nothing at all when the list is empty (the `en`/`ru` case) —
      not an empty heading.
- [ ] **Step 4: failing test** — locale `en` renders NO gloss block and the
      page is otherwise byte-identical to today's.
- [ ] **Step 5: green.**
- [ ] **Step 6: mutation-check** — render the block unconditionally; the `en`
      test must fail.
- [ ] **Step 7: commit** — `feat(web): Uzbek root glosses above the lexicon articles`

---

### Task 5: Verification

- [ ] **Step 1:** `npm run lint`, `npx tsc --noEmit`, `npx vitest run` in
      `apps/web`, `apps/mobile`, `packages/config`, `packages/data`. All green.
- [ ] **Step 2:** `packages/data`'s two entry-point guards
      (`tests/client-entry.test.ts`, `tests/mobile-entry.test.ts`) still pass.
      Nothing in this phase should move either module graph; if one moved,
      something imported the barrel.
- [ ] **Step 3:** run the web checks below by hand against `next dev`.
- [ ] **Step 4:** record results in the table, then commit the table.

| # | Check | Result |
|---|---|---|
| 380 | Locale English (default): everything reads exactly as before this phase | PASS — Al-Fatiha / Al-Baqara / At-Tawbah, English meanings, no gloss block |
| 381 | Locale Uzbek: headers, browse list and verse picker read Fotiha, Baqara, Tavba | PASS — Fotiha, Baqara, Tavba in header, browse list, home picker and verse picker |
| 382 | Arabic surah name AND transliteration visible in every locale (R5) | PASS — الفاتحة renders beside Fotiha / Фотиҳа in every locale |
| 383 | Locale Uzbek, script Cyrillic: names read Фотиҳа; WbW glosses Cyrillic; verse translation Cyrillic | PASS after a fix — names Фотиҳа; WbW glosses and verse translation were LATIN (see below), now Cyrillic |
| 384 | Script toggle with locale English or Russian: nothing changes | PASS — script rows are only offered under Uzbek; names and chrome identical either way |
| 385 | Dictionary root page, locale Uzbek: ranked Uzbek glosses above Lane, Lane still English | PASS — kitobni 80, kitob 39 … above Hans Wehr and Lane, both still English |
| 386 | Dictionary root page, locale English: no gloss block, page as before | PASS — no `Meanings in the Quran` block at all; Hans Wehr and Lane render as before |
| 387 | Switching locale updates the page with no flash of the previous language (SSR, not post-mount) | PASS — 16ms sampler saw exactly two states, Al-Fatiha → Fotiha, no third |
| 388 | Locale survives a reload and an in-app navigation (cookie + router.refresh) | PASS — hard reload, in-app Link nav and back-nav all stay Uzbek |
| 389 | A hand-edited junk `ui-locale` cookie falls back to English, no error | PASS — xx, en-US, uz-Cyrl, ../../etc, injection strings all fall back to English |
| 390 | Keyboard: switcher reachable, `aria-expanded` + `aria-controls` paired | PASS — 5 tabs from the drawer trigger; Enter flips aria-expanded, aria-controls names a real panel that is `hidden` when closed |

### Device run 2026-09-18

OnePlus 7Pro, Chrome 153, real device over `adb reverse` to the dev server,
driven through the Chrome DevTools Protocol (real key and click events, real
rendering). 11 of 11 pass; one needed a fix first.

**383 was a genuine miss.** Surah names and root glosses followed the script
cookie, but the reader's verse translation and the word-by-word glosses did
not: both pages took their `language_code` from `?lang=` alone, so Uzbek
always rendered Latin no matter the script. The data was there all along
(`translations` 6236 `uz-Cyrl` rows, `word_glosses` 77424). Fixed by composing
the two in the one place that is allowed to — `contentLanguage(lang, script)`
— in `surah/[id]/page.tsx` and `surah/[id]/words/page.tsx`, with the composed
code also passed as `pageLang` so the popover's fallback badge does not start
reading "(uz-Cyrl)" on every word. Covered by `readerPageLang.test.tsx` (5
tests, mutation-checked: dropping the composition fails 2).

**Open question for the owner, behind check 384.** The script cookie now
applies to Uzbek *content* wherever it is rendered, including `?lang=uz` under
an English or Russian UI. The toggle is not offered in those locales, so this
only shows up for a reader who set Cyrillic under the Uzbek UI and then
switched the UI to English. Honouring it seems right — otherwise an
English-UI reader can never read the Cyrillic Uzbek translation — but the
alternative (script dies with the Uzbek UI) is defensible. Shipped as the
former; say the word to flip it.

### Mobile smoke 2026-09-18 (Task 1's shims, on device)

M10 defines no mobile checks, but Task 1 turned mobile's three i18n modules
into re-export shims over `@quran-corpus/config/i18n/*`, and vitest resolves
modules its own way — only Metro's graph proves the `exports` subpaths hold.
Run on the OnePlus 7Pro through Expo Go, `expo start --clear`, over
`adb reverse tcp:8081`.

| What | Result |
|---|---|
| Bundle | PASS — `Android Bundled 13698ms … (2761 modules)`, no resolution error, clean log |
| Tab labels through the shimmed `t` | PASS — Bosh sahifa / Suralar / Mushaf / Lug'at / Menyu under Uzbek |
| Settings chrome | PASS — Til, Interfeys, Tarjima, Maxfiylik; About page localized too |
| `scripts` through the shim | PASS — "Oʻzbek yozuvi" with Lotin / Кирилл appears only once the translation is Uzbek |
| `contentLanguage` through the shim | PASS — Cyrillic gives "Раҳмон ва Раҳим бўлган Аллоҳ номи билан бошлайман." and WbW gloss Раҳмон |
| Surah list names | PASS — Fotiha / Ochuvchi, Baqara / Sigir |

Mobile suite on the branch: **1268 tests / 112 files green**, unchanged.
Device settings were restored to English / English / Latin afterwards.

Two pre-existing mobile gaps confirmed still open, neither caused by this
branch (the shims are pure re-exports):

- **Issue #83** — the reader header still reads `Al-Fatiha` / `The Opening`
  even under the Uzbek UI, where the surah *list* correctly reads Fotiha.
- **Surah names ignore the script toggle on mobile.** Under Uzbek + Cyrillic
  the list still reads Fotiha where web now reads Фотиҳа. Mobile files the
  script under Translation, so names are content and should follow it. Worth
  its own issue alongside #83.

---

## Risks and rollback

| Risk | Mitigation | Rollback |
|---|---|---|
| The package move silently changes mobile behaviour | Task 1 Step 6 gates on an unchanged mobile pass count; the shims keep all 59 import paths | Revert Task 1's commit; mobile's modules are self-contained again |
| `packages/config` gains a runtime import that breaks Metro or the Next client bundle | The four new modules import nothing but each other's types | Revert; the `exports` entries are additive |
| Cookie value reaches SQL unvalidated | Task 2 Step 1's OWASP test + Step 7's mutation-check | — |
| Locale flashes post-mount | Resolved server-side by construction; check 387 | — |
| Chrome stays English and reads as half-done | R3 is deliberate and recorded; the follow-up is its own phase | — |
| `uz-Cyrl` named as an `<html lang>` or a UI locale by mistake | Three distinct types, and `contentLanguage` is the only bridge | — |
| The service worker's `navigate-pages` cache (`sw.ts:21`) is keyed by URL only, so an offline load — or any load slower than its 5s `networkTimeoutSeconds` — serves HTML rendered for the PREVIOUS locale | Harmless while the chrome is English (R3): only localized names differ. Becomes "the whole UI is in the wrong language offline" the moment R3 lands | Vary the cache key on the `ui-locale` cookie, or drop the navigate-pages cache entry on a locale write |

## Out of scope (recorded, not forgotten)

- Translating web chrome into uz/ru (R3). Its own phase.
- `next-intl`, locale-prefixed routes, message formatting/pluralization (R2).
- Mobile's Latin/Cyrillic toggle — shipped in M9 (`925b2c2`). It will consume Task 1's
  `contentLanguage` rather than defining its own.
- The `?lang=` translation picker stays as it is: which TRANSLATION you read is
  a separate choice from which language the UI is in, and R1 turned down
  collapsing the two.
