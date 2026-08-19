# M4 Dictionary + Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship dictionary browse, root/lemma detail, concordance, frequency tables and offline search in `apps/mobile`, plus the surah/ayah jump PRD §6.2 lists and M1 never built.

**Architecture:** No new queries. `packages/data` already carries every read M4 needs and the bundled DB already ships a populated FTS5 index; the phase widens `packages/data/src/mobile.ts`, changes exactly one query (`searchVerses`, to match the reader's translator), and is otherwise screens in `apps/mobile` over thin `corpusRepository` wrappers.

**Tech Stack:** Expo Router, React Native 0.86, expo-sqlite 57 (FTS5 on by default), reanimated 4.5, vitest + @testing-library/react with `vi.mock('react-native')`.

**Spec:** `docs/superpowers/specs/2026-08-18-m4-dictionary-search-design.md`

## Global Constraints

- CLAUDE.md is binding. §2 (no schema/query logic in an app), §3 (DRY/SOLID/OWASP), §4 (the loop, including the mutation-check), §5 (independent review triggers), §9 (Conventional Commits), §10 (tests + the device gate).
- `apps/mobile` imports from `@quran-corpus/data/mobile` only. Never the barrel — it drags the native libsql driver into Metro.
- `packages/data/tests/mobile-entry.test.ts` is not weakened. Widening the entry point is fine; reaching `db.ts`, `migrate.ts` or a backfill is not.
- No new dependency without asking (§12). This phase adds none.
- Every route param is validated before the DB is opened.
- Reader translator per language is `selectedTranslators` in `packages/mobile-data`: `en` Saheeh International, `ru` **Abu Adel**, `uz` Muhammad Sodik Muhammad Yusuf.
- UI locale (`en`/`uz`/`ru`) is separate from content language. Every new string lands in all three.
- One logical change per commit. Commit only after the loop closes.

---

## File Structure

**`packages/data`** — one query changed, one entry point widened.

| File | Responsibility |
| --- | --- |
| `src/queries/search.ts` | gains language + translator filtering on `searchVerses`/`search` |
| `src/mobile.ts` | gains 5 lemma/dictionary exports |
| `tests/search.test.ts` | covers the translator filter |
| `tests/mobile-entry.test.ts` | asserts the 5 new exports |

**`apps/mobile`** — one repository, one validator module, screens.

| File | Responsibility |
| --- | --- |
| `src/data/corpusRepository.ts` | thin wrappers; no query logic |
| `src/data/routeParams.ts` | gains `parseLemmaParam`, `parseLetterParam` |
| `src/components/SnippetText.tsx` | renders FTS snippet delimiters as highlighted runs |
| `src/components/ConcordanceList.tsx` | paged occurrence list, shared by root and lemma |
| `src/components/AlphabetGrid.tsx` | hijāʾī grid |
| `src/components/FrequencyList.tsx` | rows of `arabic · gloss · count` |
| `src/screens/SearchScreen.tsx` | jump / verses / roots |
| `src/screens/DictionaryScreen.tsx` | Browse ⏐ Frequent |
| `src/screens/LetterScreen.tsx`, `src/screens/LemmaScreen.tsx`, `src/screens/MenuScreen.tsx` | the remaining screens |
| `app/(tabs)/dictionary.tsx`, `app/(tabs)/menu.tsx` | new tabs |
| `app/bookmarks.tsx`, `app/settings.tsx` | moved out of `(tabs)` |
| `app/search.tsx`, `app/dictionary/letter/[letter].tsx`, `app/lemma/[lemma].tsx` | new routes |
| `app/root/[buckwalter].tsx` | gains the concordance list |

Screens live in `src/screens/` and route files stay thin, matching `WbwScreen`. Route files cannot be unit-tested directly (expo-router's `require.context` turns a test under `app/` into a route), so logic goes in the screen.

---

## Task 1: Tab restructure

Five tabs, one of them new. Bookmarks and Settings become pushed routes behind Menu — web's own shape (`BottomNav.tsx` plus `DrawerMenu.tsx`). Ships alone, before any new screen (R6).

**Files:**
- Create: `apps/mobile/app/(tabs)/menu.tsx`, `apps/mobile/app/(tabs)/dictionary.tsx`, `apps/mobile/src/screens/MenuScreen.tsx`
- Move: `apps/mobile/app/(tabs)/bookmarks.tsx` → `apps/mobile/app/bookmarks.tsx`; `apps/mobile/app/(tabs)/settings.tsx` → `apps/mobile/app/settings.tsx`
- Modify: `apps/mobile/app/(tabs)/_layout.tsx`, `apps/mobile/src/i18n/uiStrings.ts`
- Test: `apps/mobile/src/screens/MenuScreen.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: routes `/bookmarks`, `/settings`, `/(tabs)/dictionary`, `/(tabs)/menu`. `MenuScreen` takes no props.

Nothing links to `/bookmarks` or `/settings` today — verified, they are reached only from the tab bar — so the move breaks no `href`. The About route is untouched.

- [ ] **Step 1: Add the i18n keys**

In `src/i18n/uiStrings.ts`, add to `UiStringKey`:

```ts
  | 'tabs.dictionary'
  | 'tabs.menu'
  | 'menu.bookmarks'
  | 'menu.settings'
  | 'menu.about'
```

and to each of the three locale records:

```ts
    // en
    'tabs.dictionary': 'Dictionary',
    'tabs.menu': 'Menu',
    'menu.bookmarks': 'Bookmarks',
    'menu.settings': 'Settings',
    'menu.about': 'About & credits',
```

```ts
    // uz
    'tabs.dictionary': 'Lug‘at',
    'tabs.menu': 'Menyu',
    'menu.bookmarks': 'Xatcho‘plar',
    'menu.settings': 'Sozlamalar',
    'menu.about': 'Dastur haqida',
```

```ts
    // ru
    'tabs.dictionary': 'Словарь',
    'tabs.menu': 'Меню',
    'menu.bookmarks': 'Закладки',
    'menu.settings': 'Настройки',
    'menu.about': 'О приложении',
```

- [ ] **Step 2: Write the failing MenuScreen test**

Create `apps/mobile/src/screens/MenuScreen.test.tsx`:

```tsx
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MenuScreen } from './MenuScreen';

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en' }),
}));

vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
      React.createElement('a', { href }, children),
  };
});

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return { Text: host('span'), View: host('div'), ScrollView: host('div') };
});

describe('MenuScreen', () => {
  afterEach(cleanup);

  it('links to bookmarks, settings and about', () => {
    render(<MenuScreen />);

    // The three destinations the tab bar gave up a slot for. A missing row
    // here is a screen the user can no longer reach at all.
    expect(screen.getByText('Bookmarks').closest('a')?.getAttribute('href')).toBe('/bookmarks');
    expect(screen.getByText('Settings').closest('a')?.getAttribute('href')).toBe('/settings');
    expect(screen.getByText('About & credits').closest('a')?.getAttribute('href')).toBe('/about');
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

Run: `cd apps/mobile && npx vitest run src/screens/MenuScreen.test.tsx --no-cache`
Expected: FAIL — `Failed to resolve import "./MenuScreen"`.

- [ ] **Step 4: Write MenuScreen**

Create `apps/mobile/src/screens/MenuScreen.tsx`:

```tsx
import { Link } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { t, type UiStringKey } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

const ROWS: { href: string; label: UiStringKey }[] = [
  { href: '/bookmarks', label: 'menu.bookmarks' },
  { href: '/settings', label: 'menu.settings' },
  { href: '/about', label: 'menu.about' },
];

/** The fifth tab. Bookmarks and Settings gave up their own slots so Dictionary
 *  could have one; this is where they went. No logic of its own. */
export function MenuScreen() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ padding: 20 }}>
        {ROWS.map((row) => (
          <Link
            key={row.href}
            href={row.href}
            accessibilityRole="link"
            style={{
              color: theme.text,
              fontSize: 17,
              paddingVertical: 16,
              minHeight: touchTargets.minimum,
              borderBottomColor: theme.border,
              borderBottomWidth: 1,
            }}
          >
            {t(uiLocale, row.label)}
          </Link>
        ))}
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 5: Run it, confirm it passes**

Run: `cd apps/mobile && npx vitest run src/screens/MenuScreen.test.tsx --no-cache`
Expected: PASS, 1 test.

- [ ] **Step 6: Move the two routes**

```bash
cd apps/mobile
git mv "app/(tabs)/bookmarks.tsx" app/bookmarks.tsx
git mv "app/(tabs)/settings.tsx" app/settings.tsx
```

In both moved files, rename the default export (`BookmarksTab` → `BookmarksRoute`, `SettingsTab` → `SettingsRoute`) so the name stops claiming something untrue. Nothing imports them by name; expo-router uses the default export.

- [ ] **Step 7: Add the two route files**

Create `apps/mobile/app/(tabs)/menu.tsx`:

```tsx
import { MenuScreen } from '@/screens/MenuScreen';

export default function MenuRoute() {
  return <MenuScreen />;
}
```

Create `apps/mobile/app/(tabs)/dictionary.tsx` as a stub Task 5 replaces:

```tsx
import { View } from 'react-native';
import { useThemeColors } from '@/theme/themeContext';

/** Filled in by Task 5 (Browse) and Task 6 (Frequent). A stub rather than a
 *  missing file: the tab bar ships in this task, and an absent route renders
 *  as a blank screen with no name on it. */
export default function DictionaryRoute() {
  const theme = useThemeColors();
  return <View style={{ flex: 1, backgroundColor: theme.background }} />;
}
```

- [ ] **Step 8: Rewrite the tab bar**

In `app/(tabs)/_layout.tsx`, the five `<Tabs.Screen>` entries become, in order: `index` (`tabs.home`, icon `home`), `surahs` (`tabs.surahs`, icon `book`), `morphology` (`tabs.morphology`, icon `words`), `dictionary` (`tabs.dictionary`, icon `dictionary`), `menu` (`tabs.menu`, icon `menu`). Delete the `bookmarks` and `settings` entries.

Icons: `dictionary` and `menu` have no glyph yet, and `book` is already the Surahs tab. Two identical glyphs in one tab bar is worse than a plain new one, so add two icons to `src/components/icons/` following the shape of the existing ones and extend the `Icon` name union. Refining them is a design task; having them is not.

- [ ] **Step 9: Full gate**

Run: `cd apps/mobile && pnpm test && pnpm type-check && pnpm lint`
Expected: all green. Nothing imported the moved files, so every existing suite still passes.

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/app apps/mobile/src
git commit -m "feat(mobile): make room for Dictionary with a Menu tab

Bookmarks and Settings become pushed routes behind a Menu tab, which is
web's own bottom-nav shape (BottomNav.tsx plus DrawerMenu.tsx). Nothing
linked to either route directly, so the move breaks no href.

Morphology keeps its tab: it is the only route that opens the
word-by-word grid at the saved reading position."
```

---

## Task 2: Search matches the reader's translator

The one `packages/data` change. **§5 trigger — stop after this task and ask the owner to run `/code-review`.**

**Files:**
- Modify: `packages/data/src/queries/search.ts`
- Modify: `apps/web/src/app/api/search/route.ts`
- Test: `packages/data/tests/search.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface VerseSearchOpts {
    limit?: number;
    language?: string;
    translator?: string;
  }
  searchVerses(db: QueryClient, q: string, opts?: VerseSearchOpts): Promise<VerseHit[]>
  search(db: QueryClient, q: string, opts?: VerseSearchOpts): Promise<SearchResult>
  ```

The bundled DB carries seven translations — four of them Russian. Each reader shows one per language. Unfiltered, a Russian query returns each verse four times and three of them are text the app never displays. Collapsing by ayah is the wrong fix: it keeps the best `bm25` row, which is usually not Abu Adel.

- [ ] **Step 1: Write the failing tests**

In `packages/data/tests/search.test.ts`, add a second Russian translator and the cases:

```ts
async function seedTwoRussian(db: Client): Promise<void> {
  await db.execute("INSERT INTO languages VALUES ('ru','Russian','Русский','ltr')");
  await db.execute(
    "INSERT INTO translations (ayah_id,language_code,translator,text) VALUES (1,'ru','Abu Adel','именем Аллаха милостивого')",
  );
  await db.execute(
    "INSERT INTO translations (ayah_id,language_code,translator,text) VALUES (1,'ru','Elmir Kuliev','именем Аллаха милосердного')",
  );
}

describe('searchVerses translator filter', () => {
  beforeEach(async () => {
    await seedTwoRussian(db);
    await backfillSearchIndex(db);
  });

  it('returns one hit per ayah for the selected translator', async () => {
    const hits = await searchVerses(db, 'Аллаха', { language: 'ru', translator: 'Abu Adel' });
    const ru = hits.filter((h) => h.source === 'ru');

    expect(ru).toHaveLength(1);
    // The wording proves WHICH translator survived. A length check alone
    // passes just as happily when Kuliev's row is the one that stayed.
    expect(ru[0]!.snippet).toContain('милостивого');
  });

  it('still returns the Arabic row alongside the selected translation', async () => {
    const hits = await searchVerses(db, 'الرحمن', { language: 'ru', translator: 'Abu Adel' });

    expect(hits.some((h) => h.source === 'ar')).toBe(true);
  });

  it('excludes languages other than Arabic and the selected one', async () => {
    const hits = await searchVerses(db, 'Allah', { language: 'ru', translator: 'Abu Adel' });

    expect(hits.some((h) => h.source === 'en')).toBe(false);
  });

  it('searches every language when no selection is given', async () => {
    const hits = await searchVerses(db, 'Аллаха');

    expect(hits.filter((h) => h.source === 'ru')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run them, confirm they fail**

Run: `cd packages/data && npx vitest run tests/search.test.ts --no-cache`
Expected: FAIL — the first case returns two `ru` hits; `searchVerses` ignores the new option fields.

- [ ] **Step 3: Implement the filter**

In `packages/data/src/queries/search.ts`, replace the options type and the query build:

```ts
export interface VerseSearchOpts {
  limit?: number;
  /** Content language to search alongside Arabic. Omitted searches every
   *  indexed language — what every caller did before the DB carried four
   *  Russian translations. */
  language?: string;
  /** Restricts translation hits to one translator's rows. Ignored without
   *  `language`, since the pair is what identifies a translation set. */
  translator?: string;
}

/** `search_fts` indexes every translation in the DB and each reader shows one
 *  per language. Without this clause a Russian query returns the same verse
 *  four times, three of them in wording that appears nowhere in the product. */
function sourceFilter(opts: VerseSearchOpts): { sql: string; args: (string | number)[] } {
  if (!opts.language) return { sql: '', args: [] };
  if (!opts.translator) {
    return { sql: ' AND source IN (?, ?)', args: ['ar', opts.language] };
  }
  return {
    sql: ` AND (source = 'ar' OR (source = ? AND ref_id IN (
             SELECT id FROM translations WHERE language_code = ? AND translator = ?)))`,
    args: [opts.language, opts.language, opts.translator],
  };
}

/** The same restriction for the Uzbek transliteration pass, which queries one
 *  source directly and so cannot reuse sourceFilter's `source = 'ar' OR` shape. */
function uzTranslatorFilter(opts: VerseSearchOpts): { sql: string; args: (string | number)[] } {
  if (!opts.translator) return { sql: '', args: [] };
  return {
    sql: ' AND ref_id IN (SELECT id FROM translations WHERE language_code = ? AND translator = ?)',
    args: ['uz', opts.translator],
  };
}

export async function searchVerses(
  db: QueryClient,
  q: string,
  opts: VerseSearchOpts = {},
): Promise<VerseHit[]> {
  const limit = opts.limit ?? 50;
  const term = normalizeArabic(q).trim();
  if (term.length === 0) return [];
  const match = buildFtsMatch(term);
  const filter = sourceFilter(opts);
  const res = await db.execute({
    sql: `${SNIPPET_SELECT} WHERE search_fts MATCH ?${filter.sql} ORDER BY bm25(search_fts) LIMIT ?`,
    args: [match, ...filter.args, limit],
  });
  const hits = rowsToHits(res.rows);

  // Uzbek's `uz` rows are Cyrillic-only, so a Latin query never matches them
  // above. Skipped outright when the reader is on another language: those rows
  // would only be filtered out again on arrival.
  const uzWanted = opts.language === undefined || opts.language === 'uz';
  if (uzWanted && HAS_LATIN.test(term) && !HAS_CYRILLIC.test(term)) {
    const uzFilter = uzTranslatorFilter(opts);
    const uzMatch = buildFtsMatch(transliterateUzbekLatinToCyrillic(term));
    const uzRes = await db.execute({
      sql: `${SNIPPET_SELECT} WHERE search_fts MATCH ? AND source = 'uz'${uzFilter.sql} ORDER BY bm25(search_fts) LIMIT ?`,
      args: [uzMatch, ...uzFilter.args, limit],
    });
    const seen = new Set(hits.map((h) => `${h.source}-${h.surah_id}-${h.ayah_number}`));
    for (const hit of rowsToHits(uzRes.rows)) {
      const key = `${hit.source}-${hit.surah_id}-${hit.ayah_number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(hit);
    }
  }

  return hits.slice(0, limit);
}
```

Then thread the options through `search`:

```ts
export async function search(
  db: QueryClient,
  q: string,
  opts: VerseSearchOpts = {},
): Promise<SearchResult> {
```

and change its internal `searchVerses(db, query)` call to `searchVerses(db, query, opts)`.

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `cd packages/data && npx vitest run tests/search.test.ts --no-cache`
Expected: PASS — the four new cases and every pre-existing one. The no-options path is unchanged by design, so a pre-existing failure means the default regressed.

- [ ] **Step 5: Mutation-check (§4 step 4)**

Delete the translator branch from `sourceFilter`, returning the two-source form for every call.

Run: `cd packages/data && npx vitest run tests/search.test.ts --no-cache`
Expected: FAIL on `returns one hit per ayah for the selected translator` — two `ru` hits.

Restore. Re-run: PASS.

- [ ] **Step 6: Update the web caller**

`apps/web/src/app/api/search/route.ts` calls `search(db, q)`. Web has no per-language translator selection, so it passes none and its behaviour is unchanged. Record why:

```ts
// No selection passed: web offers every indexed translation rather than one
// fixed translator per language. apps/mobile passes its selectedTranslators
// entry -- see the comment on sourceFilter in queries/search.ts.
const result = await search(db, q);
```

- [ ] **Step 7: Run both gates**

Run: `cd packages/data && pnpm test && pnpm type-check`  (that package has no `lint` script; eslint runs from the root)
Run: `cd apps/web && pnpm test && pnpm type-check && pnpm lint`
Run: `cd apps/web && pnpm exec playwright test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add packages/data apps/web/src/app/api/search/route.ts
git commit -m "feat(data): filter verse search by language and translator

search_fts indexes all seven translations in the DB -- four of them
Russian -- while each reader shows one translator per language. A Russian
query therefore returned every verse four times, three of them in wording
that appears nowhere in the product.

Deduplicating by ayah would have kept whichever row won on bm25, which is
usually not the selected translator. searchVerses now restricts to Arabic
plus the selected translator's rows, so one hit per ayah per source falls
out by construction.

Both options are passed in, never hardcoded: a translator picker would use
the same mechanism. Web passes none and keeps its current behaviour."
```

- [ ] **Step 9: STOP — §5 independent review**

This task changed a `packages/data` query. Ask the owner to run `/code-review` (plain, not `ultra` — that bills separately and needs explicit permission). Read the findings, fix what is real, and say plainly which are declined and why. Do not start Task 3 first.

---

## Task 3: Search screen

The first thing in this phase that runs FTS5 on the device. If R4 bites — FTS5 unavailable against the read-only bundled asset — it surfaces here, before five more screens depend on it.

**Files:**
- Create: `apps/mobile/src/components/SnippetText.tsx`, `apps/mobile/src/components/SnippetText.test.tsx`, `apps/mobile/src/screens/SearchScreen.tsx`, `apps/mobile/src/screens/SearchScreen.test.tsx`, `apps/mobile/app/search.tsx`
- Modify: `apps/mobile/src/data/corpusRepository.ts`, `apps/mobile/src/i18n/uiStrings.ts`, `apps/mobile/src/components/SurahReader.tsx`, `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/src/components/icons/Icon.tsx`

**Interfaces:**
- Consumes: `search(db, q, opts)` from Task 2.
- Produces:
  ```ts
  searchCorpus(client: MobileDataClient, query: string, languageCode: ContentLanguageCode): Promise<SearchResult>
  <SnippetText snippet={string} highlightColor={string} style={TextStyle} />
  ```

- [ ] **Step 1: Write the failing SnippetText test**

`searchVerses` wraps matched tokens in U+0002/U+0003. They must render as a highlighted run, never as markup and never as visible control characters.

Create `apps/mobile/src/components/SnippetText.test.tsx`:

```tsx
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SnippetText } from './SnippetText';

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return { Text: host('span') };
});

const START = '\u0002';
const END = '\u0003';

describe('SnippetText', () => {
  afterEach(cleanup);

  it('highlights the delimited run and nothing else', () => {
    render(
      <SnippetText
        snippet={`in the name of ${START}Allah${END} the merciful`}
        highlightColor="#f00"
      />,
    );

    const marks = screen.getAllByTestId('snippet-mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toBe('Allah');
  });

  it('leaves the delimiters out of the rendered text', () => {
    render(<SnippetText snippet={`a ${START}b${END} c`} highlightColor="#f00" />);

    // A stray U+0002 on screen is a visible box glyph, and it is the giveaway
    // that the snippet was rendered as one plain string.
    expect(screen.getByTestId('snippet').textContent).toBe('a b c');
  });

  it('renders an undelimited snippet unchanged', () => {
    render(<SnippetText snippet="no match markers here" highlightColor="#f00" />);

    expect(screen.queryAllByTestId('snippet-mark')).toHaveLength(0);
    expect(screen.getByTestId('snippet').textContent).toBe('no match markers here');
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd apps/mobile && npx vitest run src/components/SnippetText.test.tsx --no-cache`
Expected: FAIL — `Failed to resolve import "./SnippetText"`.

- [ ] **Step 3: Write SnippetText**

Create `apps/mobile/src/components/SnippetText.tsx`:

```tsx
import { Text, type TextStyle } from 'react-native';

// FTS5's snippet() wraps each matched token in these. They are control
// characters, not markup: rendered as text they show as a box glyph, and
// treated as markup they would be an injection point. Split on them instead.
const START = '\u0002';
const END = '\u0003';

export interface SnippetTextProps {
  snippet: string;
  highlightColor: string;
  style?: TextStyle;
}

/** One FTS snippet with its matched tokens tinted. */
export function SnippetText({ snippet, highlightColor, style }: SnippetTextProps) {
  const parts = snippet.split(START);

  return (
    <Text testID="snippet" style={style}>
      {parts.map((part, index) => {
        if (index === 0) return part;
        const [matched, ...rest] = part.split(END);
        return (
          // Index keys: the parts have no identity of their own, and the whole
          // list is rebuilt on every new snippet.
          <Text key={index}>
            <Text testID="snippet-mark" style={{ color: highlightColor, fontWeight: '700' }}>
              {matched}
            </Text>
            {rest.join(END)}
          </Text>
        );
      })}
    </Text>
  );
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `cd apps/mobile && npx vitest run src/components/SnippetText.test.tsx --no-cache`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add the repository wrapper**

In `apps/mobile/src/data/corpusRepository.ts`:

```ts
import { search, type SearchResult } from '@quran-corpus/data/mobile';

/** Search restricted to what the reader actually shows: Arabic plus the one
 *  translator this language is bound to. Without the translator the DB's four
 *  Russian translations each return the same verse. */
export async function searchCorpus(
  client: MobileDataClient,
  query: string,
  languageCode: ContentLanguageCode,
): Promise<SearchResult> {
  return search(client, query, {
    language: languageCode,
    translator: translatorByLanguage[languageCode],
  });
}
```

`translatorByLanguage` already exists at the top of that file.

- [ ] **Step 6: Add the i18n keys**

Add to `UiStringKey` and all three locale records:

```ts
  | 'search.title'
  | 'search.placeholder'
  | 'search.jump'
  | 'search.verses'
  | 'search.roots'
  | 'search.empty'
  | 'search.noResults'
  | 'search.loadFailed'
```

```ts
    // en
    'search.title': 'Search',
    'search.placeholder': 'Verse, word or root',
    'search.jump': 'Go to',
    'search.verses': 'Verses',
    'search.roots': 'Roots',
    'search.empty': 'Type a verse reference, a word, or a root',
    'search.noResults': 'Nothing found',
    'search.loadFailed': 'Unable to search',
```

```ts
    // uz
    'search.title': 'Qidiruv',
    'search.placeholder': 'Oyat, so‘z yoki o‘zak',
    'search.jump': 'O‘tish',
    'search.verses': 'Oyatlar',
    'search.roots': 'O‘zaklar',
    'search.empty': 'Oyat raqami, so‘z yoki o‘zak kiriting',
    'search.noResults': 'Hech narsa topilmadi',
    'search.loadFailed': 'Qidirib bo‘lmadi',
```

```ts
    // ru
    'search.title': 'Поиск',
    'search.placeholder': 'Аят, слово или корень',
    'search.jump': 'Перейти',
    'search.verses': 'Аяты',
    'search.roots': 'Корни',
    'search.empty': 'Введите номер аята, слово или корень',
    'search.noResults': 'Ничего не найдено',
    'search.loadFailed': 'Не удалось выполнить поиск',
```

- [ ] **Step 7: Write the failing SearchScreen test**

Create `apps/mobile/src/screens/SearchScreen.test.tsx`:

```tsx
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchScreen } from './SearchScreen';

const mocks = vi.hoisted(() => ({
  searchCorpus: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en', contentLanguage: 'ru' }),
}));
vi.mock('@/data/corpusRepository', () => ({ searchCorpus: mocks.searchCorpus }));
vi.mock('@/data/openCorpusDb', () => ({ openCorpusDb: () => Promise.resolve({}) }));
vi.mock('@quran-corpus/mobile-data', () => ({ createExpoSqliteClient: () => ({}) }));
vi.mock('expo-router', () => ({ router: { push: mocks.push } }));

vi.mock('react-native', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');
  const Input = ({ onChangeText, value, placeholder, testID }: {
    onChangeText?: (text: string) => void;
    value?: string;
    placeholder?: string;
    testID?: string;
  }) =>
    React.createElement('input', {
      'data-testid': testID,
      placeholder,
      value: value ?? '',
      onChange: (event: { target: { value: string } }) => onChangeText?.(event.target.value),
    });
  return {
    ActivityIndicator: host('div'),
    Pressable: host('button'),
    ScrollView: host('div'),
    Text: host('span'),
    TextInput: Input,
    View: host('div'),
  };
});

const EMPTY = { jump: null, verses: [], roots: [] };

describe('SearchScreen', () => {
  beforeEach(() => {
    mocks.searchCorpus.mockReset();
    mocks.push.mockReset();
    mocks.searchCorpus.mockResolvedValue(EMPTY);
  });

  afterEach(cleanup);

  it('shows the empty state before anything is typed', () => {
    render(<SearchScreen />);

    expect(screen.getByText('Type a verse reference, a word, or a root')).toBeTruthy();
    expect(mocks.searchCorpus).not.toHaveBeenCalled();
  });

  it('searches in the reader content language, not the UI locale', async () => {
    render(<SearchScreen />);

    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'нет' } });

    await waitFor(() => expect(mocks.searchCorpus).toHaveBeenCalled());
    // Passing the UI locale here searches Russian text for a user reading in
    // English and returns nothing, which reads as a broken index.
    expect(mocks.searchCorpus.mock.calls.at(-1)![2]).toBe('ru');
  });

  it('renders a verse-reference jump above the hits', async () => {
    mocks.searchCorpus.mockResolvedValue({
      jump: {
        surah_id: 2,
        ayah_number: 255,
        text_uthmani: 'ٱللَّهُ',
        words: [],
        highlightPosition: null,
      },
      verses: [{ surah_id: 2, ayah_number: 255, source: 'ar', snippet: 'ٱللَّهُ' }],
      roots: [],
    });

    render(<SearchScreen />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: '2:255' } });

    await waitFor(() => expect(screen.getByTestId('search-jump')).toBeTruthy());
    expect(screen.getByTestId('search-jump').textContent).toContain('2:255');
  });

  it('opens the surah at the ayah when the jump is tapped', async () => {
    mocks.searchCorpus.mockResolvedValue({
      jump: {
        surah_id: 2,
        ayah_number: 255,
        text_uthmani: 'ٱللَّهُ',
        words: [],
        highlightPosition: null,
      },
      verses: [],
      roots: [],
    });

    render(<SearchScreen />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: '2:255' } });
    await waitFor(() => expect(screen.getByTestId('search-jump')).toBeTruthy());

    fireEvent.click(screen.getByTestId('search-jump'));

    expect(mocks.push).toHaveBeenCalledWith('/surah/2?ayah=255');
  });

  it('reports a failed search instead of an empty result', async () => {
    mocks.searchCorpus.mockRejectedValue(new Error('no such module: fts5'));

    render(<SearchScreen />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'x' } });

    // R4: an FTS5 build problem must not look identical to an unmatched word,
    // or the first device run reports a data fault instead of a build one.
    await waitFor(() => expect(screen.getByText('Unable to search')).toBeTruthy());
  });
});
```

- [ ] **Step 8: Run it, confirm it fails**

Run: `cd apps/mobile && npx vitest run src/screens/SearchScreen.test.tsx --no-cache`
Expected: FAIL — `Failed to resolve import "./SearchScreen"`.

- [ ] **Step 9: Write SearchScreen**

Create `apps/mobile/src/screens/SearchScreen.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import type { SearchResult } from '@quran-corpus/data/mobile';
import { searchCorpus } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { SnippetText } from '@/components/SnippetText';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

const EMPTY: SearchResult = { jump: null, verses: [], roots: [] };
// Long enough that a fast typist runs one query rather than six, short enough
// that results still feel attached to the keystroke. The DB is local, so this
// is about wasted work, not latency.
const DEBOUNCE_MS = 200;

export function SearchScreen() {
  const { uiLocale, contentLanguage } = useAppSettings();
  const theme = useThemeColors();

  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Every keystroke starts a query and they can land out of order; only the
  // newest is allowed to write state.
  const requestRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResult(EMPTY);
      setFailed(false);
      return;
    }

    const request = (requestRef.current += 1);
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const found = await searchCorpus(client, trimmed, contentLanguage);
        if (requestRef.current !== request) return;
        setResult(found);
        setFailed(false);
      } catch (cause) {
        // Distinct from "nothing found": an FTS5 build problem and an
        // unmatched word are otherwise the same blank screen.
        console.error('[search] failed', { query: trimmed, cause });
        if (requestRef.current !== request) return;
        setResult(EMPTY);
        setFailed(true);
      } finally {
        if (requestRef.current === request) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, contentLanguage]);

  const openJump = useCallback(() => {
    const jump = result.jump;
    if (!jump) return;
    const suffix = jump.ayah_number === null ? '' : `?ayah=${jump.ayah_number}`;
    router.push(`/surah/${jump.surah_id}${suffix}`);
  }, [result.jump]);

  const heading = { color: theme.mutedText, fontSize: 12, letterSpacing: 1, marginTop: 20 };
  const empty = query.trim().length === 0;
  const nothing =
    !empty &&
    !loading &&
    !failed &&
    result.jump === null &&
    result.verses.length === 0 &&
    result.roots.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ padding: 16 }}>
        <TextInput
          testID="search-input"
          value={query}
          onChangeText={setQuery}
          placeholder={t(uiLocale, 'search.placeholder')}
          placeholderTextColor={theme.mutedText}
          autoFocus
          accessibilityLabel={t(uiLocale, 'search.title')}
          style={{
            color: theme.text,
            borderColor: theme.border,
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 14,
            minHeight: touchTargets.minimum,
          }}
        />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        {loading ? <ActivityIndicator /> : null}
        {failed ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.danger }}>
            {t(uiLocale, 'search.loadFailed')}
          </Text>
        ) : null}
        {empty ? <Text style={{ color: theme.mutedText }}>{t(uiLocale, 'search.empty')}</Text> : null}
        {nothing ? <Text style={{ color: theme.mutedText }}>{t(uiLocale, 'search.noResults')}</Text> : null}

        {result.jump ? (
          <>
            <Text style={heading}>{t(uiLocale, 'search.jump').toUpperCase()}</Text>
            <Pressable
              testID="search-jump"
              accessibilityRole="button"
              onPress={openJump}
              style={{ paddingVertical: 14, minHeight: touchTargets.minimum }}
            >
              <Text style={{ color: theme.accent, fontSize: 17 }}>
                {result.jump.surah_id}:{result.jump.ayah_number ?? 1}
              </Text>
            </Pressable>
          </>
        ) : null}

        {result.verses.length > 0 ? (
          <>
            <Text style={heading}>{t(uiLocale, 'search.verses').toUpperCase()}</Text>
            {result.verses.map((hit) => (
              <Pressable
                key={`${hit.source}-${hit.surah_id}-${hit.ayah_number}`}
                testID="search-verse"
                accessibilityRole="button"
                onPress={() => router.push(`/surah/${hit.surah_id}?ayah=${hit.ayah_number}`)}
                style={{ paddingVertical: 12 }}
              >
                <Text style={{ color: theme.mutedText, fontSize: 12 }}>
                  {hit.surah_id}:{hit.ayah_number}
                </Text>
                <SnippetText snippet={hit.snippet} highlightColor={theme.accent} style={{ color: theme.text }} />
              </Pressable>
            ))}
          </>
        ) : null}

        {result.roots.length > 0 ? (
          <>
            <Text style={heading}>{t(uiLocale, 'search.roots').toUpperCase()}</Text>
            {result.roots.map((root) => (
              <Pressable
                key={root.root_buckwalter}
                testID="search-root"
                accessibilityRole="button"
                onPress={() => router.push(`/root/${encodeURIComponent(root.root_buckwalter)}`)}
                style={{ paddingVertical: 12, minHeight: touchTargets.minimum }}
              >
                <Text style={{ color: theme.accent, fontSize: 17 }}>{root.root_arabic}</Text>
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
```

If `theme.danger` or `theme.border` is not a token, read `src/theme/tokens.ts` and use the one that is. Do not invent a token.

- [ ] **Step 10: Run it, confirm it passes**

Run: `cd apps/mobile && npx vitest run src/screens/SearchScreen.test.tsx --no-cache`
Expected: PASS, 5 tests.

- [ ] **Step 11: Mutation-check**

Change `searchCorpus(client, trimmed, contentLanguage)` to `searchCorpus(client, trimmed, uiLocale)`.

Run the suite. Expected: FAIL on `searches in the reader content language, not the UI locale`.

Restore. Re-run: PASS.

- [ ] **Step 12: Add the route and the header entry point**

Create `apps/mobile/app/search.tsx`:

```tsx
import { SearchScreen } from '@/screens/SearchScreen';

export default function SearchRoute() {
  return <SearchScreen />;
}
```

In `src/components/SurahReader.tsx`, add a third button at the start of the existing `headerRight` row:

```tsx
          <Pressable
            testID="open-search"
            accessibilityRole="button"
            accessibilityLabel={t(uiLocale, 'search.title')}
            // Same reachability rule as the globe and the words button: close
            // the sheet first, or it stays mounted behind the pushed screen
            // holding the list at no-hide-descendants.
            onPress={() => {
              closeSheet();
              router.push('/search');
            }}
            style={{
              minHeight: touchTargets.minimum,
              minWidth: touchTargets.minimum,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="search" color={theme.accent} />
          </Pressable>
```

Add the same button to the Home tab (`app/(tabs)/index.tsx`) as a row above the continue-reading card, using the same label and the same `router.push('/search')`. The Dictionary header's magnifier lands in Task 5, where that screen is written.

`Icon` has no `search` glyph yet. Add one to `src/components/icons/` following the shape of the existing icons and extend the name union. Do not ship a button with no glyph.

- [ ] **Step 13: Full gate and commit**

Run: `cd apps/mobile && pnpm test && pnpm type-check && pnpm lint`

```bash
git add apps/mobile
git commit -m "feat(mobile): offline search over the bundled FTS index

A pushed screen rather than a sheet: three result sections need the room,
and a pushed route is the easier of the two to get right for TalkBack.

Searches in the reader's content language and its bound translator, so a
hit is always text the reader would show. A failed query reports itself
rather than rendering as 'nothing found' -- an FTS5 build problem and an
unmatched word are otherwise the same blank screen."
```

---

## Task 4: Widen the mobile entry point

> **Amended 2026-08-18 after a pre-flight read of the code this task touches.**
> Four things the original steps got wrong, all verified against the tree:
> 1. `parseLemmaParam` **already exists** at `packages/data/src/text/buckwalter.ts:100`,
>    decode-aware and tested against the three most frequent lemmas. The original
>    Step 7 had us hand-write a second, weaker one in the app -- wrong cap
>    (`ROOT_BUCKWALTER_MAX` 24 instead of `LEMMA_BUCKWALTER_MAX` 32), no decode,
>    so `%7Bll~ah` (ٱللَّه, 2699 occurrences) would 404. That is the exact bug
>    buckwalter.ts documents costing 35% of web's lemma pages, and a duplicate
>    validator in a consumer is the CLAUDE.md §2 failure mode by name.
> 2. The original `raw.includes('%')` guard was redundant -- `%` is outside
>    `BUCKWALTER_CHAR_CLASS`, so its test passed with the line deleted.
> 3. `apps/mobile/src/data/routeParams.test.ts` does not exist; it is created, not appended to.
> 4. `?? ''` on a null `lemma_buckwalter` builds a dead `/lemma/` route.

**Files:**
- Modify: `packages/data/src/mobile.ts`, `packages/data/tests/mobile-entry.test.ts`, `apps/mobile/src/data/corpusRepository.ts`, `apps/mobile/src/data/routeParams.ts`
- Create: `apps/mobile/src/data/routeParams.test.ts`
- Test: `apps/mobile/src/data/corpusRepository.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, from `@quran-corpus/data/mobile`: `getLemmaEntry`, `getLemmaConcordancePage`, `countLemmaConcordance`, `getLemmaFrequency`, `getVerbConcordance`, `parseLemmaParam`. From `corpusRepository`:
  ```ts
  interface FrequencyRow { href: string; arabic: string; gloss: string | null; count: number }
  getRootOccurrenceCount(client, bw: string): Promise<number>
  getRootOccurrences(client, bw: string, lang: ContentLanguageCode, offset: number, limit: number): Promise<ConcordanceEntry[]>
  getLemmaScreen(client, lemmaBw: string, lang: ContentLanguageCode): Promise<{ entry: LemmaEntry | null; total: number }>
  getLemmaOccurrences(client, lemmaBw: string, lang: ContentLanguageCode, offset: number, limit: number): Promise<ConcordanceEntry[]>
  getFrequencyRows(client, kind: 'roots' | 'lemmas' | 'verbs'): Promise<FrequencyRow[]>
  ```
  From `routeParams`: `parseLemmaParam` (re-export), `parseLetterParam(value): string | null`.

- [ ] **Step 1: Extend the entry-point guard first**

In `packages/data/tests/mobile-entry.test.ts`, add to the first case:

```ts
    expect(typeof mod.getLemmaEntry).toBe('function');
    expect(typeof mod.getLemmaConcordancePage).toBe('function');
    expect(typeof mod.countLemmaConcordance).toBe('function');
    expect(typeof mod.getLemmaFrequency).toBe('function');
    expect(typeof mod.getVerbConcordance).toBe('function');
    expect(typeof mod.parseLemmaParam).toBe('function');
```

Leave the "does not export node/libsql runtime helpers" case and the import-graph walk exactly as they are. They are the guard, not paperwork.

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd packages/data && npx vitest run tests/mobile-entry.test.ts --no-cache`
Expected: FAIL — `expected undefined to be "function"`.

- [ ] **Step 3: Widen the entry point**

In `packages/data/src/mobile.ts`, after the roots block:

```ts
export {
  getLemmaEntry,
  getLemmaConcordancePage,
  countLemmaConcordance,
} from './queries/lemma.js';
export { getLemmaFrequency, getVerbConcordance } from './queries/dictionary.js';
```

Add `parseLemmaParam` to the existing `./text/buckwalter.js` export line — beside `parseRootParam`, which is already there for exactly the same reason.

Add `LemmaEntry` and `LemmaSense` to the type exports. (`ConcordanceEntry`, `LemmaFrequencyEntry`, `VerbConcordanceEntry` and `RootSearchItem` are already exported — do not re-add them.)

- [ ] **Step 4: Run the guard, confirm it passes**

Run: `cd packages/data && npx vitest run tests/mobile-entry.test.ts --no-cache`
Expected: PASS — including the import-graph case, which is what proves neither `lemma.ts` nor `dictionary.ts` reaches `db.ts`. (Both import only types plus `text/` and `morphology/` helpers, so this should hold; if it does not, stop and report rather than trimming the guard.)

- [ ] **Step 5: Write the failing routeParams tests**

Create `apps/mobile/src/data/routeParams.test.ts`. `parseLemmaParam`'s own behaviour is already covered by `packages/data/tests/buckwalter.test.ts` — do not restate that suite here. Assert only what this module is responsible for: that the re-export is wired and that mobile's array-or-string param shape is handled.

```ts
import { describe, expect, it } from 'vitest';
import { parseLemmaParam, parseLetterParam } from './routeParams';

describe('parseLemmaParam', () => {
  it('is the shared decode-aware validator, not a local copy', () => {
    // The single most frequent lemma in the corpus (ٱللَّه, 2699 occurrences)
    // reaches a route still percent-encoded. A charset-only validator rejects
    // it -- that regression cost web 35% of its lemma pages once already.
    expect(parseLemmaParam('%7Bll~ah')).toBe('{ll~ah');
  });
});

describe('parseLetterParam', () => {
  it('accepts a letter the alphabet carries', () => {
    expect(parseLetterParam('ب')).toBe('ب');
  });

  it('rejects a letter it does not', () => {
    // rootFirstLetter folds hamza seats into ا, so أ is never a bucket of its
    // own and a screen for it could never have rows.
    expect(parseLetterParam('أ')).toBeNull();
  });

  it('rejects arbitrary text', () => {
    expect(parseLetterParam('../../etc')).toBeNull();
  });

  it('takes the first of a repeated param', () => {
    expect(parseLetterParam(['ب', 'ت'])).toBe('ب');
  });
});
```

- [ ] **Step 6: Run them, confirm they fail**

Run: `cd apps/mobile && npx vitest run src/data/routeParams.test.ts --no-cache`
Expected: FAIL — neither export exists yet.

- [ ] **Step 7: Wire the validators**

In `apps/mobile/src/data/routeParams.ts`, add `parseLemmaParam` to the existing re-export line:

```ts
export { parseRootParam, parseLemmaParam } from '@quran-corpus/data/mobile';
```

That line's comment already says why: buckwalter.ts is the single source of truth for what a corpus identifier is, and a consumer-side copy is the §2 failure mode. Note `parseLemmaParam` takes a bare `string`, so callers unwrap the array-or-string param themselves exactly as `app/root/[buckwalter].tsx` already does for `parseRootParam`.

Then append `parseLetterParam`. This one has no shared original — web's letter picker is client state with no route segment, so nothing to reuse — but it must not restate the folding rules either:

```ts
import { ARABIC_ALPHABET_ORDER } from '@quran-corpus/data/mobile';

/** A hijāʾī bucket off a deep link. Membership, not a charset test:
 *  `rootFirstLetter` folds أ إ آ ٱ to ا and ى to ي, so those are never buckets
 *  and a screen for one could never have rows. The list is imported rather
 *  than restated so this cannot drift from the folding that produces it. */
export function parseLetterParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  return ARABIC_ALPHABET_ORDER.includes(raw) ? raw : null;
}
```

- [ ] **Step 8: Run them, confirm they pass**

Run: `cd apps/mobile && npx vitest run src/data/routeParams.test.ts --no-cache`
Expected: PASS.

- [ ] **Step 9: Mutation-check**

Two mutations, each in isolation, file restored between:

(a) Delete the `ARABIC_ALPHABET_ORDER.includes(raw)` check and return `raw`.
    Expected: FAIL on `rejects a letter it does not` and `rejects arbitrary text`.

(b) Point the re-export at `isLemmaBuckwalter` instead of `parseLemmaParam`
    (i.e. `export const parseLemmaParam = (s: string) => isLemmaBuckwalter(s) ? s : null`).
    Expected: FAIL on `is the shared decode-aware validator, not a local copy`.
    This is the guard against silently reintroducing the charset-only version.

Restore. Re-run: PASS.

- [ ] **Step 10: Add the repository wrappers**

In `apps/mobile/src/data/corpusRepository.ts`:

```ts
import {
  countLemmaConcordance,
  countRootConcordance,
  getLemmaConcordancePage,
  getLemmaEntry,
  getLemmaFrequency,
  getRootConcordancePage,
  getRootsByFrequency,
  getVerbConcordance,
  type ConcordanceEntry,
  type LemmaEntry,
} from '@quran-corpus/data/mobile';

/** One row of the Frequent pane, whichever of the three lists produced it. */
export interface FrequencyRow {
  /** Route target: a root screen for roots, a lemma screen for the other two. */
  href: string;
  arabic: string;
  gloss: string | null;
  count: number;
}

export async function getRootOccurrenceCount(
  client: MobileDataClient,
  bw: string,
): Promise<number> {
  return countRootConcordance(client, bw);
}

export async function getRootOccurrences(
  client: MobileDataClient,
  bw: string,
  lang: ContentLanguageCode,
  offset: number,
  limit: number,
): Promise<ConcordanceEntry[]> {
  return getRootConcordancePage(client, bw, { lang, offset, limit });
}

export async function getLemmaScreen(
  client: MobileDataClient,
  lemmaBw: string,
  lang: ContentLanguageCode,
): Promise<{ entry: LemmaEntry | null; total: number }> {
  const [entry, total] = await Promise.all([
    getLemmaEntry(client, lemmaBw, lang),
    countLemmaConcordance(client, lemmaBw),
  ]);
  return { entry, total };
}

export async function getLemmaOccurrences(
  client: MobileDataClient,
  lemmaBw: string,
  lang: ContentLanguageCode,
  offset: number,
  limit: number,
): Promise<ConcordanceEntry[]> {
  return getLemmaConcordancePage(client, lemmaBw, { lang, offset, limit });
}

/** The Frequent pane's three lists flattened to one row shape, so the screen
 *  renders one list rather than three that differ only in field names. */
export async function getFrequencyRows(
  client: MobileDataClient,
  kind: 'roots' | 'lemmas' | 'verbs',
): Promise<FrequencyRow[]> {
  if (kind === 'roots') {
    const roots = await getRootsByFrequency(client);
    return roots.map((root) => ({
      href: `/root/${encodeURIComponent(root.root_buckwalter)}`,
      arabic: root.root_arabic,
      gloss: null,
      count: root.occurrence_count,
    }));
  }

  if (kind === 'lemmas') {
    const lemmas = await getLemmaFrequency(client);
    // Both queries filter `lemma_buckwalter IS NOT NULL`, so this drops nothing
    // today -- but the row type still allows null, and `?? ''` would build a
    // dead `/lemma/` link rather than omit an unroutable row.
    return lemmas
      .filter((row) => row.lemma_buckwalter !== null)
      .map((row) => ({
        href: `/lemma/${encodeURIComponent(row.lemma_buckwalter!)}`,
        arabic: row.lemma,
        gloss: null,
        count: row.count,
      }));
  }

  const verbs = await getVerbConcordance(client);
  return verbs
    .filter((row) => row.lemma_buckwalter !== null)
    .map((row) => ({
      // The lemma, not the surface form the row displays: form_arabic is the
      // commonest spelling of the verb and routing on it opens nothing.
      href: `/lemma/${encodeURIComponent(row.lemma_buckwalter!)}`,
      arabic: row.form_arabic,
      gloss: row.lemma,
      count: row.count,
    }));
}
```

- [ ] **Step 11: Test the flattening**

Append to `apps/mobile/src/data/corpusRepository.test.ts`, following that file's existing pattern for faking a `MobileDataClient`.

```ts
describe('getFrequencyRows', () => {
  it('links a verb row to its lemma, not to its surface form', async () => {
    // A verb row's Arabic is the commonest surface form (يَقُولُ) and its
    // identity is the lemma. Routing on the surface form opens nothing.
    mocks.getVerbConcordance.mockResolvedValue([
      { lemma: 'قَالَ', lemma_buckwalter: 'qAl', form_arabic: 'يَقُولُ', count: 12 },
    ]);

    const rows = await getFrequencyRows(client, 'verbs');

    expect(rows[0]!.href).toBe('/lemma/qAl');
    expect(rows[0]!.arabic).toBe('يَقُولُ');
  });

  it('omits a row with no lemma identifier rather than linking to /lemma/', async () => {
    mocks.getVerbConcordance.mockResolvedValue([
      { lemma: null, lemma_buckwalter: null, form_arabic: 'يَقُولُ', count: 12 },
    ]);

    expect(await getFrequencyRows(client, 'verbs')).toEqual([]);
  });
});
```

Mutation-check both: restore `?? ''` in place of the filter and confirm the second test fails; point the verb `href` at `form_arabic` and confirm the first fails.

- [ ] **Step 12: Full gate and commit**

Run: `cd packages/data && pnpm test && pnpm type-check && pnpm lint`
Run: `cd apps/mobile && pnpm test && pnpm type-check && pnpm lint`

```bash
git add packages/data apps/mobile/src/data
git commit -m "feat(mobile): expose the lemma and frequency reads to mobile

Widens packages/data's mobile entry point by five query exports -- lemma
entry, lemma concordance paging and count, lemma frequency, verb
concordance -- plus parseLemmaParam, which is the validator the lemma
route needs and which already exists beside parseRootParam. Its own
contract permits all six: none reaches db.ts, migrate.ts or a backfill,
and the import-graph guard proves it.

Adds parseLetterParam, a membership test over the shared alphabet
constant, for the hijai bucket screens."
```

> **After this task: STOP.** It widens `packages/data` and adds a route-param
> validator — two CLAUDE.md §5 triggers. The agent cannot launch `/code-review`;
> ask the user to run it and act on the findings before Task 5 starts.


## Task 5: Dictionary Browse and the letter screen

> **Amended 2026-08-18 (controller pre-flight).** Read the code this task
> touches before dispatch. Four defects in the original section:
>
> 1. **`sizes.body` does not exist.** `useArabicSizes()` returns
>    `{reader, title, banner}` only. Both snippets read `sizes.body`, which is
>    `undefined` — RN would have rendered at the default size with no error.
>    Swapped to `typography.body`, which is what `app/root/[buckwalter].tsx`
>    already uses for Arabic rows inside a list. That removes `useArabicSizes`
>    from both components and the `arabicScale` mock from their tests.
> 2. **`getRootsForLetter` did not sort.** Web's `DictionaryBrowser` filters on
>    `rootFirstLetter` *and* sorts on `compareRootsArabic`; the plan's own
>    comment claimed parity while copying only the filter. Verified against the
>    live DB: today all 28 buckets are already in hijāʾī order under SQL's
>    binary `ORDER BY root_arabic` (0 reorderings; no root carries ة, ؤ, ئ or
>    ى), so this is not a live bug — but every root in the ا bucket currently
>    carries the أ seat, and the scheduled 930-root re-scrape levels hamza
>    seats UP into `root_arabic`. On that data binary order files every
>    أ-initial root ahead of every ا-initial one regardless of second radical.
>    One line now, with a test that fails without it.
> 3. **§3 violation.** The headerRight magnifier was a second verbatim copy of
>    `SurahReader.tsx:111-131` — same testID, label, style block and Icon, only
>    the `onPress` differs. Extracted to `SearchHeaderButton`, used by both.
> 4. **The pane toggle and the letter→route push had no test.** Added
>    `DictionaryScreen.test.tsx`; the `router.push` href is the wiring that
>    makes the grid do anything.

> **Still carried from Task 4's review — NOT discharged here.** Five of Task
> 4's six new repository exports have zero coverage: the reviewer transposed
> `offset`/`limit` in `getRootOccurrences` and `getLemmaOccurrences`,
> hardcoded `getRootOccurrenceCount` to `0`, and pointed the `roots` and
> `lemmas` hrefs at `/BROKEN/`, then ran the full suite green. Both `offset`
> and `limit` are `number`, so TypeScript is not a backstop. **Task 5 wires
> none of them** — `getRootsForLetter` is a new wrapper with no paging. The
> requirement moves intact to **Task 6** (`getFrequencyRows`) and **Task 7**
> (`getRootOccurrences`, `getRootOccurrenceCount`): whichever first wires one
> to a screen must assert the paging arguments reach the query *in order*, not
> merely that rows come back.

**Files:**
- Create: `apps/mobile/src/components/AlphabetGrid.tsx`, `apps/mobile/src/components/AlphabetGrid.test.tsx`, `apps/mobile/src/components/SearchHeaderButton.tsx`, `apps/mobile/src/screens/LetterScreen.tsx`, `apps/mobile/src/screens/LetterScreen.test.tsx`, `apps/mobile/src/screens/DictionaryScreen.tsx`, `apps/mobile/src/screens/DictionaryScreen.test.tsx`, `apps/mobile/app/dictionary/letter/[letter].tsx`
- Modify: `apps/mobile/src/data/corpusRepository.ts`, `apps/mobile/src/data/corpusRepository.test.ts`, `apps/mobile/src/components/SurahReader.tsx`, `apps/mobile/app/(tabs)/dictionary.tsx`, `apps/mobile/src/i18n/uiStrings.ts`

**Interfaces:**
- Consumes: `parseLetterParam` (Task 4); `ARABIC_ALPHABET_ORDER`, `rootFirstLetter`, `compareRootsArabic`, `getRootSearchList`, `RootSearchItem` (all already exported from `@quran-corpus/data/mobile` — verified).
- Produces:
  ```ts
  getRootsForLetter(client, letter: string): Promise<RootSearchItem[]>
  <AlphabetGrid onSelect={(letter: string) => void} />
  <SearchHeaderButton onPress={() => void} />
  <LetterScreen letter={string | null} />
  ```

- [ ] **Step 1: Write the failing repository test**

Append to `apps/mobile/src/data/corpusRepository.test.ts`. The fake client
needs a branch for `getRootSearchList` — its SQL is the only one in the graph
matching `FROM roots r`:

```ts
      if (sql.includes('FROM roots r')) {
        // Fixture order is SQL's binary ORDER BY root_arabic: أ (U+0623) sorts
        // before ا (U+0627), so a seated root lands ahead of a bare one no
        // matter what the second radical is. Handing these back unsorted is
        // what puts getRootsForLetter's own sort under test.
        return { rows: rootSearch };
      }
```

with the fixture beside the other `const` fixtures:

```ts
  const rootSearch: MobileRow[] = [
    { id: 1, root_buckwalter: '>wb', root_arabic: 'أوب', occurrence_count: 18, gloss_blob: 'to return' },
    { id: 2, root_buckwalter: 'Abl', root_arabic: 'ابل', occurrence_count: 2, gloss_blob: 'camel' },
    { id: 7, root_buckwalter: 'rHm', root_arabic: 'رحم', occurrence_count: 339, gloss_blob: 'mercy' },
  ];
```

and the test:

```ts
describe('getRootsForLetter', () => {
  it('files hamza seats under ا and orders the bucket hijāʾī, not by codepoint', async () => {
    const list = await getRootsForLetter(createFakeClient(), 'ا');

    // Both roots belong to the ا bucket because rootFirstLetter folds the seat.
    // Order is the assertion: SQL hands them back أوب, ابل (codepoint order);
    // hijāʾī order compares the *second* radical, ب before و.
    expect(list.map((root) => root.root_arabic)).toEqual(['ابل', 'أوب']);
  });

  it('excludes roots filed under another letter', async () => {
    const list = await getRootsForLetter(createFakeClient(), 'ا');

    expect(list.map((root) => root.root_arabic)).not.toContain('رحم');
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd apps/mobile && npx vitest run src/data/corpusRepository.test.ts --no-cache`
Expected: FAIL — `getRootsForLetter` is not exported.

- [ ] **Step 3: Add the repository wrapper**

In `corpusRepository.ts`. **Merge the new names into the existing
`@quran-corpus/data/mobile` import block** — a second import statement from the
same module trips `no-duplicate-imports`:

```ts
  compareRootsArabic,
  getRootSearchList,
  rootFirstLetter,
  type RootSearchItem,
```

```ts
/** Roots filed under one hijāʾī letter, in dictionary order.
 *
 *  Filtered and sorted in JS, not in SQL, and deliberately so: rootFirstLetter
 *  folds hamza seats (أ إ آ ٱ to ا) and ى to ي, so a SQL prefix match would
 *  file those under four separate letters, and SQLite's binary collation would
 *  then order the bucket by codepoint — every seated root ahead of every bare
 *  one. Web's DictionaryBrowser does both for the same reasons. One query of
 *  1,548 rows is cheap; 28 letter-shaped queries are not. */
export async function getRootsForLetter(
  client: MobileDataClient,
  letter: string,
): Promise<RootSearchItem[]> {
  const roots = await getRootSearchList(client);
  return roots
    .filter((root) => rootFirstLetter(root.root_arabic) === letter)
    .sort((a, b) => compareRootsArabic(a.root_arabic, b.root_arabic));
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `cd apps/mobile && npx vitest run src/data/corpusRepository.test.ts --no-cache`
Expected: PASS.

**Mutation-check (§4 step 4):** delete the `.sort(...)` line. The first test
must fail on `['أوب','ابل']`. Restore.

- [ ] **Step 5: Write the failing AlphabetGrid test**

Create `apps/mobile/src/components/AlphabetGrid.test.tsx`. No settings mock:
the grid reads `typography.body` and `useThemeColors`, and themeContext
defaults to the light palette without a provider.

```tsx
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARABIC_ALPHABET_ORDER } from '@quran-corpus/data/mobile';
import { AlphabetGrid } from './AlphabetGrid';

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return { Pressable: host('button'), Text: host('span'), View: host('div') };
});

describe('AlphabetGrid', () => {
  afterEach(cleanup);

  it('renders every letter the shared order carries', () => {
    render(<AlphabetGrid onSelect={() => {}} />);

    // Driven off the shared constant, not a literal: a grid with its own copy
    // of the alphabet drifts from the buckets rootFirstLetter assigns.
    expect(screen.getAllByTestId('alphabet-cell')).toHaveLength(ARABIC_ALPHABET_ORDER.length);
  });

  it('reports the tapped letter', () => {
    const onSelect = vi.fn();
    render(<AlphabetGrid onSelect={onSelect} />);

    fireEvent.click(screen.getAllByTestId('alphabet-cell')[1]!);

    expect(onSelect).toHaveBeenCalledWith(ARABIC_ALPHABET_ORDER[1]);
  });
});
```

- [ ] **Step 6: Run it, confirm it fails**

Run: `cd apps/mobile && npx vitest run src/components/AlphabetGrid.test.tsx --no-cache`
Expected: FAIL — module not found.

- [ ] **Step 7: Write AlphabetGrid**

Create `apps/mobile/src/components/AlphabetGrid.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native';
import { ARABIC_ALPHABET_ORDER } from '@quran-corpus/data/mobile';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface AlphabetGridProps {
  onSelect: (letter: string) => void;
}

/** The hijāʾī grid. Letters come from the shared order, so these buckets are
 *  the ones rootFirstLetter actually assigns. */
export function AlphabetGrid({ onSelect }: AlphabetGridProps) {
  const theme = useThemeColors();

  return (
    <View
      // RTL reading order: the alphabet starts at the top right.
      style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, padding: 16 }}
    >
      {ARABIC_ALPHABET_ORDER.map((letter) => (
        <Pressable
          key={letter}
          testID="alphabet-cell"
          accessibilityRole="button"
          accessibilityLabel={letter}
          onPress={() => onSelect(letter)}
          style={{
            minWidth: touchTargets.minimum,
            minHeight: touchTargets.minimum,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text style={{ color: theme.text, fontFamily: 'Hafs', fontSize: typography.body }}>
            {letter}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
```

- [ ] **Step 8: Run it, confirm it passes**

Run: `cd apps/mobile && npx vitest run src/components/AlphabetGrid.test.tsx --no-cache`
Expected: PASS, 2 tests.

- [ ] **Step 9: Add the i18n keys**

```ts
  | 'dictionary.browse'
  | 'dictionary.frequent'
  | 'dictionary.noRoots'
```

```ts
    // en
    'dictionary.browse': 'Browse',
    'dictionary.frequent': 'Frequent',
    'dictionary.noRoots': 'No roots under this letter',
```

```ts
    // uz
    'dictionary.browse': 'Ko‘rish',
    'dictionary.frequent': 'Ko‘p uchraydigan',
    'dictionary.noRoots': 'Bu harfda o‘zak yo‘q',
```

```ts
    // ru
    'dictionary.browse': 'Обзор',
    'dictionary.frequent': 'Частотные',
    'dictionary.noRoots': 'Под этой буквой нет корней',
```

- [ ] **Step 10: Write the failing LetterScreen test**

Create `apps/mobile/src/screens/LetterScreen.test.tsx`. Fixtures use
space-free `root_arabic`, which is the live column's shape (`رحم`, not `ر ح م`).

```tsx
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LetterScreen } from './LetterScreen';

const mocks = vi.hoisted(() => ({ getRootsForLetter: vi.fn() }));

vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en' }) }));
vi.mock('@/data/corpusRepository', () => ({ getRootsForLetter: mocks.getRootsForLetter }));
vi.mock('@/data/openCorpusDb', () => ({ openCorpusDb: () => Promise.resolve({}) }));
vi.mock('@quran-corpus/mobile-data', () => ({ createExpoSqliteClient: () => ({}) }));
vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
      React.createElement('a', { href }, children),
  };
});
vi.mock('react-native', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');
  return {
    ActivityIndicator: host('div'),
    Text: host('span'),
    View: host('div'),
    FlatList: ({ data, renderItem }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
    }) =>
      React.createElement(
        'div',
        null,
        data.map((item, index) => React.createElement('div', { key: index }, renderItem({ item, index }))),
      ),
  };
});

describe('LetterScreen', () => {
  beforeEach(() => mocks.getRootsForLetter.mockReset());
  afterEach(cleanup);

  it('renders the empty state for a letter outside the alphabet', () => {
    render(<LetterScreen letter={null} />);

    expect(screen.getByText('No roots under this letter')).toBeTruthy();
    // Validated before the DB is opened: an identifier that is not a bucket has
    // no business reaching SQLite at all.
    expect(mocks.getRootsForLetter).not.toHaveBeenCalled();
  });

  it('lists the letter roots in the order the repository returns them', async () => {
    mocks.getRootsForLetter.mockResolvedValue([
      { id: 2, root_buckwalter: 'Abl', root_arabic: 'ابل', occurrence_count: 2, gloss_blob: 'camel' },
      { id: 1, root_buckwalter: '>wb', root_arabic: 'أوب', occurrence_count: 18, gloss_blob: 'to return' },
    ]);

    render(<LetterScreen letter="ا" />);

    // Both the rows and their order: the repository already sorted these, and a
    // screen that re-sorts or reverses them would still render two roots.
    await waitFor(() => expect(screen.getAllByTestId('letter-root')).toHaveLength(2));
    expect(screen.getAllByTestId('letter-root').map((node) => node.textContent)).toEqual(['ابل', 'أوب']);
  });

  it('links each root to its own encoded route', async () => {
    mocks.getRootsForLetter.mockResolvedValue([
      { id: 3, root_buckwalter: '>wb', root_arabic: 'أوب', occurrence_count: 18, gloss_blob: null },
    ]);

    render(<LetterScreen letter="ا" />);

    // `>` is a Buckwalter letter and an unsafe path character; the href must
    // carry it percent-encoded or the root route 404s.
    await waitFor(() =>
      expect(screen.getAllByTestId('letter-root')[0]!.getAttribute('href')).toBe('/root/%3Ewb'),
    );
  });
});
```

- [ ] **Step 11: Run it, confirm it fails**

Run: `cd apps/mobile && npx vitest run src/screens/LetterScreen.test.tsx --no-cache`
Expected: FAIL — module not found.

- [ ] **Step 12: Write LetterScreen and its route**

Create `apps/mobile/src/screens/LetterScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import type { RootSearchItem } from '@quran-corpus/data/mobile';
import { getRootsForLetter } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface LetterScreenProps {
  /** Already validated by the route. `null` is a letter the alphabet does not
   *  carry, which renders the empty state without touching the DB. */
  letter: string | null;
}

export function LetterScreen({ letter }: LetterScreenProps) {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();

  const [roots, setRoots] = useState<RootSearchItem[]>([]);
  const [loading, setLoading] = useState(letter !== null);

  useEffect(() => {
    if (letter === null) {
      setRoots([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const found = await getRootsForLetter(client, letter);
        if (!cancelled) setRoots(found);
      } catch (cause) {
        // Same dead end as a letter with no roots: nothing the reader can act
        // on either way. Logged for logcat.
        console.error('[dictionary] letter load failed', { letter, cause });
        if (!cancelled) setRoots([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [letter]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (roots.length === 0) {
    return (
      <View style={{ flex: 1, padding: 20, backgroundColor: theme.background }}>
        <Text style={{ color: theme.mutedText }}>{t(uiLocale, 'dictionary.noRoots')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={roots}
      keyExtractor={(item) => item.root_buckwalter}
      renderItem={({ item }) => (
        <Link
          testID="letter-root"
          href={`/root/${encodeURIComponent(item.root_buckwalter)}`}
          accessibilityRole="link"
          style={{
            color: theme.text,
            fontFamily: 'Hafs',
            fontSize: typography.body,
            paddingHorizontal: 20,
            paddingVertical: 14,
            minHeight: touchTargets.minimum,
          }}
        >
          {item.root_arabic}
        </Link>
      )}
      style={{ flex: 1, backgroundColor: theme.background }}
    />
  );
}
```

The `expo-router` mock in Step 10 maps `href` onto an `<a>` but drops
`testID`; extend that mock's `Link` to pass `data-testid={testID}` so the
queries above resolve. Keep the extension inside the mock, not in the
component.

Create `apps/mobile/app/dictionary/letter/[letter].tsx`:

```tsx
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { LetterScreen } from '@/screens/LetterScreen';
import { parseLetterParam } from '@/data/routeParams';

export default function LetterRoute() {
  const params = useLocalSearchParams<{ letter: string }>();
  const letter = useMemo(() => parseLetterParam(params.letter), [params.letter]);

  return <LetterScreen letter={letter} />;
}
```

- [ ] **Step 13: Run it, confirm it passes**

Run: `cd apps/mobile && npx vitest run src/screens/LetterScreen.test.tsx --no-cache`
Expected: PASS, 3 tests.

**Mutation-check (§4 step 4):** drop `encodeURIComponent` from the `href`. The
third test must fail on `/root/>wb`. Restore.

- [ ] **Step 14: Extract SearchHeaderButton**

`SurahReader.tsx` already renders this exact Pressable (testID `open-search`,
`search.title` label, 4-prop style block, accent Icon). The dictionary header
would be the second copy — CLAUDE.md §3. Create
`apps/mobile/src/components/SearchHeaderButton.tsx`:

```tsx
import { Pressable } from 'react-native';
import { Icon } from '@/components/icons/Icon';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface SearchHeaderButtonProps {
  /** The reader closes its word sheet before pushing; the dictionary tab just
   *  pushes. That difference is the only reason this takes a callback rather
   *  than routing itself. */
  onPress: () => void;
}

/** The header magnifier, two of the spec's three search entry points. (Home's
 *  is a full-width pill with placeholder text, a different control.) */
export function SearchHeaderButton({ onPress }: SearchHeaderButtonProps) {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();

  return (
    <Pressable
      testID="open-search"
      accessibilityRole="button"
      accessibilityLabel={t(uiLocale, 'search.title')}
      onPress={onPress}
      style={{
        minHeight: touchTargets.minimum,
        minWidth: touchTargets.minimum,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="search" color={theme.accent} />
    </Pressable>
  );
}
```

Replace the block in `SurahReader.tsx`'s `headerRight` with:

```tsx
          <SearchHeaderButton
            onPress={() => {
              closeSheet();
              router.push('/search');
            }}
          />
```

keeping the surrounding comment about closing the sheet first. `SurahReader`'s
existing `open-search` test must still pass untouched — if it does not, the
extraction changed behaviour and is wrong.

- [ ] **Step 15: Write the failing DictionaryScreen test**

Create `apps/mobile/src/screens/DictionaryScreen.test.tsx`:

```tsx
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DictionaryScreen } from './DictionaryScreen';

const mocks = vi.hoisted(() => ({ push: vi.fn(), setOptions: vi.fn() }));

vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en' }) }));
vi.mock('expo-router', () => ({
  router: { push: mocks.push },
  useNavigation: () => ({ setOptions: mocks.setOptions }),
}));
vi.mock('@/components/icons/Icon', () => ({ Icon: () => null }));
vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return { Pressable: host('button'), Text: host('span'), View: host('div') };
});

describe('DictionaryScreen', () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.setOptions.mockReset();
  });
  afterEach(cleanup);

  it('opens on Browse and routes a tapped letter to its own screen', () => {
    render(<DictionaryScreen />);

    fireEvent.click(screen.getAllByTestId('alphabet-cell')[1]!);

    // The second cell is ا. Encoded, like every other Arabic path segment this
    // app builds -- an unencoded Arabic letter in a route is what parseLetterParam
    // would then have to un-guess.
    expect(mocks.push).toHaveBeenCalledWith(`/dictionary/letter/${encodeURIComponent('ا')}`);
  });

  it('hides the grid on the Frequent pane', () => {
    render(<DictionaryScreen />);

    fireEvent.click(screen.getByTestId('dictionary-pane-frequent'));

    expect(screen.queryAllByTestId('alphabet-cell')).toHaveLength(0);
    expect(screen.getByTestId('dictionary-pane-frequent').getAttribute('aria-selected')).toBe('true');
  });

  it('puts a search button in the header', () => {
    render(<DictionaryScreen />);

    expect(mocks.setOptions).toHaveBeenCalledWith(
      expect.objectContaining({ headerRight: expect.any(Function) }),
    );
  });
});
```

- [ ] **Step 16: Run it, confirm it fails**

Run: `cd apps/mobile && npx vitest run src/screens/DictionaryScreen.test.tsx --no-cache`
Expected: FAIL — module not found.

- [ ] **Step 17: Write DictionaryScreen and point the tab at it**

Create `apps/mobile/src/screens/DictionaryScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { AlphabetGrid } from '@/components/AlphabetGrid';
import { SearchHeaderButton } from '@/components/SearchHeaderButton';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

type Pane = 'browse' | 'frequent';

export function DictionaryScreen() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const navigation = useNavigation();
  const [pane, setPane] = useState<Pane>('browse');

  // The third of the spec's three search entry points; the reader's and Home's
  // landed in Task 3.
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => <SearchHeaderButton onPress={() => router.push('/search')} />,
    });
  }, [navigation]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: 'row', padding: 16, gap: 8 }}>
        {(['browse', 'frequent'] as const).map((option) => (
          <Pressable
            key={option}
            testID={`dictionary-pane-${option}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: pane === option }}
            onPress={() => setPane(option)}
            style={{
              flex: 1,
              minHeight: touchTargets.minimum,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: pane === option ? theme.accent : 'transparent',
            }}
          >
            <Text style={{ color: pane === option ? theme.background : theme.text }}>
              {t(uiLocale, option === 'browse' ? 'dictionary.browse' : 'dictionary.frequent')}
            </Text>
          </Pressable>
        ))}
      </View>

      {pane === 'browse' ? (
        <AlphabetGrid onSelect={(letter) => router.push(`/dictionary/letter/${encodeURIComponent(letter)}`)} />
      ) : null}
      {/* Task 6 renders the Frequent pane here. */}
    </View>
  );
}
```

Point `app/(tabs)/dictionary.tsx` at it, replacing the Task 1 stub:

```tsx
import { DictionaryScreen } from '@/screens/DictionaryScreen';

export default function DictionaryRoute() {
  return <DictionaryScreen />;
}
```

- [ ] **Step 18: Run it, confirm it passes**

Run: `cd apps/mobile && npx vitest run src/screens/DictionaryScreen.test.tsx --no-cache`
Expected: PASS, 3 tests.

**Mutation-check (§4 step 4):** change the `pane === 'browse'` guard to `true`.
The second test must fail on 29 cells. Restore.

- [ ] **Step 19: Full gate and commit**

Run: `cd apps/mobile && pnpm test && pnpm type-check && pnpm lint`

```bash
git add apps/mobile
git commit -m "feat(mobile): dictionary browse by hijāʾī letter

The grid is driven off ARABIC_ALPHABET_ORDER and the letter screen filters
getRootSearchList through rootFirstLetter and sorts it with
compareRootsArabic, matching web's DictionaryBrowser. Not a SQL prefix
match with SQLite's binary collation: rootFirstLetter folds hamza seats, so
prefix matching would file أ, إ, آ and ٱ under four letters, and codepoint
order would then put every seated root ahead of every bare one.

The header magnifier is extracted rather than copied -- SurahReader already
renders the same control, and only the onPress differs."
```

---

## Task 6: Dictionary Frequent pane

**Files:**
- Create: `apps/mobile/src/components/FrequencyList.tsx`, `apps/mobile/src/components/FrequencyList.test.tsx`, `apps/mobile/src/screens/DictionaryScreen.test.tsx`
- Modify: `apps/mobile/src/screens/DictionaryScreen.tsx`, `apps/mobile/src/i18n/uiStrings.ts`

**Interfaces:**
- Consumes: `getFrequencyRows`, `FrequencyRow` (Task 4).
- Produces: `<FrequencyList kind={'roots' | 'lemmas' | 'verbs'} />`.

This pane is where PRD items 5 (lemma frequency) and 6 (verb concordance) live.

- [ ] **Step 1: Add the i18n keys**

```ts
  | 'dictionary.kindRoots'
  | 'dictionary.kindLemmas'
  | 'dictionary.kindVerbs'
```

en: `'Roots'`, `'Lemmas'`, `'Verbs'`. uz: `'O‘zaklar'`, `'Lemmalar'`, `'Fe’llar'`. ru: `'Корни'`, `'Леммы'`, `'Глаголы'`.

- [ ] **Step 2: Write the failing FrequencyList test**

Create `apps/mobile/src/components/FrequencyList.test.tsx`:

```tsx
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrequencyList } from './FrequencyList';

const mocks = vi.hoisted(() => ({ getFrequencyRows: vi.fn() }));

vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ arabicScale: 'medium' }) }));
vi.mock('@/data/corpusRepository', () => ({ getFrequencyRows: mocks.getFrequencyRows }));
vi.mock('@/data/openCorpusDb', () => ({ openCorpusDb: () => Promise.resolve({}) }));
vi.mock('@quran-corpus/mobile-data', () => ({ createExpoSqliteClient: () => ({}) }));
vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
      React.createElement('a', { href }, children),
  };
});
vi.mock('react-native', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');
  return {
    ActivityIndicator: host('div'),
    Text: host('span'),
    View: host('div'),
    FlatList: ({ data, renderItem }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
    }) =>
      React.createElement(
        'div',
        null,
        data.map((item, index) => React.createElement('div', { key: index }, renderItem({ item, index }))),
      ),
  };
});

describe('FrequencyList', () => {
  beforeEach(() => {
    mocks.getFrequencyRows.mockReset();
    mocks.getFrequencyRows.mockResolvedValue([]);
  });

  afterEach(cleanup);

  it('asks for the kind it was given', async () => {
    render(<FrequencyList kind="verbs" />);

    await waitFor(() => expect(mocks.getFrequencyRows).toHaveBeenCalled());
    expect(mocks.getFrequencyRows.mock.calls.at(-1)![1]).toBe('verbs');
  });

  it('refetches when the kind changes', async () => {
    const { rerender } = render(<FrequencyList kind="roots" />);
    await waitFor(() => expect(mocks.getFrequencyRows).toHaveBeenCalledTimes(1));

    rerender(<FrequencyList kind="lemmas" />);

    // Without this the chips change the label and nothing else: the pane keeps
    // showing roots under a heading that says lemmas.
    await waitFor(() => expect(mocks.getFrequencyRows).toHaveBeenCalledTimes(2));
    expect(mocks.getFrequencyRows.mock.calls.at(-1)![1]).toBe('lemmas');
  });

  it('renders each row with its count', async () => {
    mocks.getFrequencyRows.mockResolvedValue([
      { href: '/root/qwl', arabic: 'ق و ل', gloss: null, count: 1722 },
    ]);

    render(<FrequencyList kind="roots" />);

    await waitFor(() => expect(screen.getByText('ق و ل')).toBeTruthy());
    expect(screen.getByText('1722')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

Run: `cd apps/mobile && npx vitest run src/components/FrequencyList.test.tsx --no-cache`
Expected: FAIL — module not found.

- [ ] **Step 4: Write FrequencyList**

Create `apps/mobile/src/components/FrequencyList.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import { getFrequencyRows, type FrequencyRow } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useArabicSizes } from '@/theme/useArabicSizes';

export interface FrequencyListProps {
  kind: 'roots' | 'lemmas' | 'verbs';
}

/** The Frequent pane's list. One component over three queries -- the rows
 *  differ only in where they link and whether they carry a gloss. */
export function FrequencyList({ kind }: FrequencyListProps) {
  const theme = useThemeColors();
  const sizes = useArabicSizes();
  const [rows, setRows] = useState<FrequencyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const found = await getFrequencyRows(client, kind);
        if (!cancelled) setRows(found);
      } catch (cause) {
        console.error('[dictionary] frequency load failed', { kind, cause });
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kind]);

  if (loading) return <ActivityIndicator />;

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.href}
      renderItem={({ item }) => (
        <Link href={item.href} accessibilityRole="link">
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingVertical: 12,
              minHeight: touchTargets.minimum,
              gap: 12,
            }}
          >
            <Text style={{ color: theme.text, fontFamily: 'Hafs', fontSize: sizes.body }}>{item.arabic}</Text>
            {item.gloss ? (
              <Text numberOfLines={1} style={{ color: theme.mutedText, flex: 1 }}>
                {item.gloss}
              </Text>
            ) : null}
            <Text style={{ color: theme.mutedText }}>{item.count}</Text>
          </View>
        </Link>
      )}
      style={{ flex: 1 }}
    />
  );
}
```

- [ ] **Step 5: Run it, confirm it passes**

Run: `cd apps/mobile && npx vitest run src/components/FrequencyList.test.tsx --no-cache`
Expected: PASS, 3 tests.

- [ ] **Step 6: Mutation-check**

Change the effect's dependency array from `[kind]` to `[]`.

Run the suite. Expected: FAIL on `refetches when the kind changes`.

Restore. Re-run: PASS.

- [ ] **Step 7: Wire the chips into DictionaryScreen**

In `src/screens/DictionaryScreen.tsx`, add the state:

```tsx
  const [kind, setKind] = useState<'roots' | 'lemmas' | 'verbs'>('roots');
```

and replace the Task 5 comment with:

```tsx
      {pane === 'frequent' ? (
        <>
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8 }}>
            {(['roots', 'lemmas', 'verbs'] as const).map((option) => (
              <Pressable
                key={option}
                testID={`frequency-kind-${option}`}
                accessibilityRole="button"
                accessibilityState={{ selected: kind === option }}
                onPress={() => setKind(option)}
                style={{
                  paddingHorizontal: 14,
                  minHeight: touchTargets.minimum,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: kind === option ? theme.accent : theme.border,
                }}
              >
                <Text style={{ color: kind === option ? theme.accent : theme.mutedText }}>
                  {t(
                    uiLocale,
                    option === 'roots'
                      ? 'dictionary.kindRoots'
                      : option === 'lemmas'
                        ? 'dictionary.kindLemmas'
                        : 'dictionary.kindVerbs',
                  )}
                </Text>
              </Pressable>
            ))}
          </View>
          <FrequencyList kind={kind} />
        </>
      ) : null}
```

- [ ] **Step 8: Write the DictionaryScreen test**

Create `apps/mobile/src/screens/DictionaryScreen.test.tsx`. Mock the two children as stubs — `AlphabetGrid` renders `<div data-testid="alphabet-grid" />`, `FrequencyList` renders `<div data-testid="frequency-list" data-kind={kind} />` — plus `expo-router`, `@/settings/settingsStore` and `react-native` as in the other suites.

```tsx
  it('shows Browse first and swaps to Frequent on tap', () => {
    render(<DictionaryScreen />);

    expect(screen.getByTestId('alphabet-grid')).toBeTruthy();

    fireEvent.click(screen.getByTestId('dictionary-pane-frequent'));

    expect(screen.queryByTestId('alphabet-grid')).toBeNull();
    expect(screen.getByTestId('frequency-list')).toBeTruthy();
  });

  it('passes the selected chip down to the list', () => {
    render(<DictionaryScreen />);
    fireEvent.click(screen.getByTestId('dictionary-pane-frequent'));

    fireEvent.click(screen.getByTestId('frequency-kind-verbs'));

    expect(screen.getByTestId('frequency-list').getAttribute('data-kind')).toBe('verbs');
  });
```

- [ ] **Step 9: Full gate and commit**

Run: `cd apps/mobile && pnpm test && pnpm type-check && pnpm lint`

```bash
git add apps/mobile
git commit -m "feat(mobile): frequency lists for roots, lemmas and verbs

PRD M4 lists lemma frequency and verb concordance separately, but they are
the same query shape -- top-N by count, verbs being the POS-filtered
variant -- so they ship as one list behind a chip rather than two screens.
Root frequency joins them for the same reason.

Verb rows link on the lemma, not on the surface form the row displays: the
Arabic there is the commonest spelling and routing on it opens nothing."
```

---

## Task 7: Root screen concordance

**Files:**
- Create: `apps/mobile/src/components/ConcordanceList.tsx`, `apps/mobile/src/components/ConcordanceList.test.tsx`
- Modify: `apps/mobile/app/root/[buckwalter].tsx`, `apps/mobile/src/i18n/uiStrings.ts`

**Interfaces:**
- Consumes: `getRootOccurrences`, `getRootOccurrenceCount` (Task 4).
- Produces:
  ```ts
  <ConcordanceList
    total={number}
    loadPage={(offset: number, limit: number) => Promise<ConcordanceEntry[]>}
    header={ReactElement}
  />
  ```
  Task 8 reuses it with the lemma loaders.

- [ ] **Step 1: Add the i18n keys**

```ts
  | 'concordance.empty'
```

en `'No occurrences'`; uz `'Uchrashlar yo‘q'`; ru `'Нет вхождений'`.

- [ ] **Step 2: Write the failing ConcordanceList test**

Create `apps/mobile/src/components/ConcordanceList.test.tsx`:

```tsx
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConcordanceList } from './ConcordanceList';

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en', arabicScale: 'medium' }),
}));
vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
      React.createElement('a', { href }, children),
  };
});
vi.mock('react-native', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');
  return {
    ActivityIndicator: host('div'),
    Text: host('span'),
    View: host('div'),
    // Exposes onEndReached as a button so a test can page without a viewport.
    FlatList: ({ data, renderItem, ListHeaderComponent, onEndReached }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
      ListHeaderComponent?: React.ReactNode;
      onEndReached?: () => void;
    }) =>
      React.createElement(
        'div',
        null,
        ListHeaderComponent,
        React.createElement('button', { 'data-testid': 'end-reached', onClick: onEndReached }),
        data.map((item, index) => React.createElement('div', { key: index }, renderItem({ item, index }))),
      ),
  };
});

function entry(surah: number, ayah: number) {
  return {
    surah_id: surah,
    ayah_number: ayah,
    position: 1,
    word_id: surah * 1000 + ayah,
    text_arabic: 'ٱلْغَيْبِ',
    transliteration: null,
    gloss: null,
    verse_words: [],
    form_id: null,
  };
}

describe('ConcordanceList', () => {
  const loadPage = vi.fn();

  beforeEach(() => {
    loadPage.mockReset();
    loadPage.mockResolvedValue([entry(2, 3)]);
  });

  afterEach(cleanup);

  it('loads the first page on mount', async () => {
    render(<ConcordanceList total={60} loadPage={loadPage} header={<span />} />);

    await waitFor(() => expect(loadPage).toHaveBeenCalledWith(0, 20));
  });

  it('pages from the offset it has reached, not from zero', async () => {
    render(<ConcordanceList total={60} loadPage={loadPage} header={<span />} />);
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(1));

    screen.getByTestId('end-reached').click();

    // Re-requesting offset 0 renders the same page again and never advances,
    // which looks exactly like a list that has finished loading.
    await waitFor(() => expect(loadPage).toHaveBeenCalledWith(1, 20));
  });

  it('stops paging once every occurrence is loaded', async () => {
    render(<ConcordanceList total={1} loadPage={loadPage} header={<span />} />);
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(1));

    screen.getByTestId('end-reached').click();
    screen.getByTestId('end-reached').click();

    expect(loadPage).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

Run: `cd apps/mobile && npx vitest run src/components/ConcordanceList.test.tsx --no-cache`
Expected: FAIL — module not found.

- [ ] **Step 4: Write ConcordanceList**

Create `apps/mobile/src/components/ConcordanceList.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Link } from 'expo-router';
import type { ConcordanceEntry } from '@quran-corpus/data/mobile';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useArabicSizes } from '@/theme/useArabicSizes';

// One screenful and a bit: large enough that a scroll rarely waits, small
// enough that the first page lands immediately on a hot root.
const PAGE = 20;

export interface ConcordanceListProps {
  total: number;
  loadPage: (offset: number, limit: number) => Promise<ConcordanceEntry[]>;
  header: ReactElement;
}

/** Paged occurrences under a screen's own header. Shared by the root and lemma
 *  screens, which differ only in header and loader. */
export function ConcordanceList({ total, loadPage, header }: ConcordanceListProps) {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const sizes = useArabicSizes();

  const [entries, setEntries] = useState<ConcordanceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  // Refs, not state: onEndReached fires repeatedly while the list settles, and
  // a state read there is a frame behind, which requests the same page twice.
  const busyRef = useRef(false);
  const offsetRef = useRef(0);

  const loadMore = useCallback(async () => {
    if (busyRef.current) return;
    if (offsetRef.current >= total) return;
    busyRef.current = true;
    setLoading(true);
    try {
      const page = await loadPage(offsetRef.current, PAGE);
      offsetRef.current += page.length;
      setEntries((current) => [...current, ...page]);
      // An empty page means the source is exhausted whatever `total` claims;
      // without this the list retries the same tail offset forever.
      if (page.length === 0) offsetRef.current = total;
    } catch (cause) {
      console.error('[concordance] page load failed', { offset: offsetRef.current, cause });
      offsetRef.current = total;
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }, [loadPage, total]);

  useEffect(() => {
    offsetRef.current = 0;
    busyRef.current = false;
    setEntries([]);
    void loadMore();
    // loadMore changes with the loader, which is what a new root or lemma is.
  }, [loadMore]);

  return (
    <FlatList
      data={entries}
      keyExtractor={(item) => String(item.word_id)}
      ListHeaderComponent={header}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListFooterComponent={loading ? <ActivityIndicator /> : null}
      ListEmptyComponent={
        loading ? null : (
          <Text style={{ color: theme.mutedText, padding: 20 }}>{t(uiLocale, 'concordance.empty')}</Text>
        )
      }
      renderItem={({ item }) => (
        <Link href={`/surah/${item.surah_id}?ayah=${item.ayah_number}`} accessibilityRole="link">
          <View style={{ paddingHorizontal: 20, paddingVertical: 12, minHeight: touchTargets.minimum }}>
            <Text style={{ color: theme.mutedText, fontSize: 12 }}>
              {item.surah_id}:{item.ayah_number}
            </Text>
            <Text
              style={{
                color: theme.text,
                fontFamily: 'Hafs',
                fontSize: sizes.body,
                writingDirection: 'rtl',
                textAlign: 'right',
              }}
            >
              {item.text_arabic}
            </Text>
            {item.gloss ? <Text style={{ color: theme.mutedText }}>{item.gloss}</Text> : null}
          </View>
        </Link>
      )}
      style={{ flex: 1, backgroundColor: theme.background }}
    />
  );
}
```

- [ ] **Step 5: Run it, confirm it passes**

Run: `cd apps/mobile && npx vitest run src/components/ConcordanceList.test.tsx --no-cache`
Expected: PASS, 3 tests.

- [ ] **Step 6: Mutation-check**

Change `loadPage(offsetRef.current, PAGE)` to `loadPage(0, PAGE)`.

Run the suite. Expected: FAIL on `pages from the offset it has reached, not from zero`.

Restore. Re-run: PASS.

- [ ] **Step 7: Rebuild the root route around it**

In `apps/mobile/app/root/[buckwalter].tsx`: keep the param validation and the entry load exactly as they are; add a `total` from `getRootOccurrenceCount` alongside the entry load; move the existing header, forms and definitions markup into a `header` element built from plain `View`s; and return

```tsx
  return <ConcordanceList total={total} loadPage={loadPage} header={header} />;
```

where

```tsx
  const loadPage = useCallback(
    async (offset: number, limit: number) => {
      if (!buckwalter) return [];
      const db = await openCorpusDb();
      const client = createExpoSqliteClient(db as ExpoSqliteLike);
      return getRootOccurrences(client, buckwalter, contentLanguage, offset, limit);
    },
    [buckwalter, contentLanguage],
  );
```

`contentLanguage` comes from `useAppSettings()`, which the route already calls for `uiLocale`.

The header must contain **no** `ScrollView`. A scroll view inside a `FlatList` header is a nested VirtualizedList: it warns, and it breaks the scroll rather than nesting it (R2). The route's current outer `ScrollView` is what goes.

- [ ] **Step 8: Full gate and commit**

Run: `cd apps/mobile && pnpm test && pnpm type-check && pnpm lint`

```bash
git add apps/mobile
git commit -m "feat(mobile): show a root's occurrences on the root screen

The root screen becomes a FlatList whose header is the forms and
definitions it already showed, with the concordance paging in beneath. The
outer ScrollView goes: a scroll view inside a list header is a nested
VirtualizedList, which breaks the scroll rather than nesting it.

Paging state lives in refs, not state -- onEndReached fires repeatedly
while the list settles, and a state read there is a frame behind, which
requests the same page twice."
```

---

## Task 8: Lemma screen

**Files:**
- Create: `apps/mobile/src/screens/LemmaScreen.tsx`, `apps/mobile/src/screens/LemmaScreen.test.tsx`, `apps/mobile/app/lemma/[lemma].tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`

**Interfaces:**
- Consumes: `getLemmaScreen`, `getLemmaOccurrences`, `parseLemmaParam` (Task 4), `ConcordanceList` (Task 7).
- Produces: route `/lemma/[lemma]`, the target of every Frequent-pane lemma and verb row.

- [ ] **Step 1: Add the i18n keys**

```ts
  | 'lemma.notFound'
  | 'lemma.root'
```

en `'This lemma is not in the corpus'` / `'Root'`; uz `'Bu lemma korpusda yo‘q'` / `'O‘zak'`; ru `'Этой леммы нет в корпусе'` / `'Корень'`.

- [ ] **Step 2: Write the failing LemmaScreen test**

Create `apps/mobile/src/screens/LemmaScreen.test.tsx`. Mock `@/components/ConcordanceList` as `<div data-testid="concordance" data-total={String(total)} />`, plus `@/data/corpusRepository`, `@/data/openCorpusDb`, `@quran-corpus/mobile-data`, `@/settings/settingsStore`, `expo-router` and `react-native`, following `LetterScreen.test.tsx`.

```tsx
  it('renders the not-found state for an invalid identifier', () => {
    render(<LemmaScreen lemmaBuckwalter={null} />);

    expect(screen.getByText('This lemma is not in the corpus')).toBeTruthy();
    // Validated before the DB is opened.
    expect(mocks.getLemmaScreen).not.toHaveBeenCalled();
  });

  it('passes the occurrence total down to the list', async () => {
    mocks.getLemmaScreen.mockResolvedValue({
      entry: {
        lemma: 'قَالَ',
        lemma_buckwalter: 'qAl',
        transliteration: null,
        root_buckwalter: 'qwl',
        count: 3,
        senses: [],
        top_glosses: [],
        root_definition: null,
      },
      total: 1722,
    });

    render(<LemmaScreen lemmaBuckwalter="qAl" />);

    await waitFor(() => expect(screen.getByTestId('concordance')).toBeTruthy());
    // From countLemmaConcordance, not from the entry's own count: the entry
    // query groups occurrences away, and paging off that number truncates the
    // list at the wrong place.
    expect(screen.getByTestId('concordance').getAttribute('data-total')).toBe('1722');
  });

  it('links to the lemma root when it has one', async () => {
    mocks.getLemmaScreen.mockResolvedValue({
      entry: {
        lemma: 'قَالَ',
        lemma_buckwalter: 'qAl',
        transliteration: null,
        root_buckwalter: 'qwl',
        count: 1,
        senses: [],
        top_glosses: [],
        root_definition: null,
      },
      total: 1,
    });

    render(<LemmaScreen lemmaBuckwalter="qAl" />);

    await waitFor(() => expect(screen.getByTestId('lemma-root')).toBeTruthy());
    expect(screen.getByTestId('lemma-root').getAttribute('href')).toBe('/root/qwl');
  });
```

- [ ] **Step 3: Run it, confirm it fails**

Run: `cd apps/mobile && npx vitest run src/screens/LemmaScreen.test.tsx --no-cache`
Expected: FAIL — module not found.

- [ ] **Step 4: Write LemmaScreen and its route**

Create `apps/mobile/src/screens/LemmaScreen.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import type { LemmaEntry } from '@quran-corpus/data/mobile';
import { ConcordanceList } from '@/components/ConcordanceList';
import { getLemmaOccurrences, getLemmaScreen } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useArabicSizes } from '@/theme/useArabicSizes';

export interface LemmaScreenProps {
  /** Already validated by the route. `null` is an identifier that is not a
   *  lemma, which renders the not-found state without touching the DB. */
  lemmaBuckwalter: string | null;
}

export function LemmaScreen({ lemmaBuckwalter }: LemmaScreenProps) {
  const { uiLocale, contentLanguage } = useAppSettings();
  const theme = useThemeColors();
  const sizes = useArabicSizes();

  const [entry, setEntry] = useState<LemmaEntry | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(lemmaBuckwalter !== null);

  useEffect(() => {
    if (lemmaBuckwalter === null) {
      setEntry(null);
      setTotal(0);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const found = await getLemmaScreen(client, lemmaBuckwalter, contentLanguage);
        if (cancelled) return;
        setEntry(found.entry);
        setTotal(found.total);
      } catch (cause) {
        // Same dead end as a lemma the corpus does not carry. Logged for logcat.
        console.error('[lemma] load failed', { lemmaBuckwalter, cause });
        if (!cancelled) {
          setEntry(null);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lemmaBuckwalter, contentLanguage]);

  const loadPage = useCallback(
    async (offset: number, limit: number) => {
      if (lemmaBuckwalter === null) return [];
      const db = await openCorpusDb();
      const client = createExpoSqliteClient(db as ExpoSqliteLike);
      return getLemmaOccurrences(client, lemmaBuckwalter, contentLanguage, offset, limit);
    },
    [lemmaBuckwalter, contentLanguage],
  );

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!entry) {
    return (
      <View style={{ flex: 1, padding: 20, backgroundColor: theme.background }}>
        <Text style={{ color: theme.mutedText }}>{t(uiLocale, 'lemma.notFound')}</Text>
      </View>
    );
  }

  // Plain Views, no ScrollView: this is a FlatList header, and a scroll view
  // inside one is a nested VirtualizedList (see ConcordanceList, R2).
  const header = (
    <View style={{ padding: 20 }}>
      <Text
        style={{
          color: theme.text,
          fontFamily: 'Hafs',
          fontSize: sizes.title,
          textAlign: 'right',
          writingDirection: 'rtl',
        }}
      >
        {entry.lemma}
      </Text>
      {entry.transliteration ? (
        <Text style={{ color: theme.mutedText }}>{entry.transliteration}</Text>
      ) : null}
      {entry.top_glosses.length > 0 ? (
        <Text style={{ color: theme.text }}>{entry.top_glosses.join(' · ')}</Text>
      ) : null}
      {entry.root_buckwalter ? (
        <Link
          testID="lemma-root"
          href={`/root/${encodeURIComponent(entry.root_buckwalter)}`}
          accessibilityRole="link"
          style={{ color: theme.accent, paddingVertical: 12, minHeight: touchTargets.minimum }}
        >
          {t(uiLocale, 'lemma.root')}
        </Link>
      ) : null}
    </View>
  );

  return <ConcordanceList total={total} loadPage={loadPage} header={header} />;
}
```

Create `apps/mobile/app/lemma/[lemma].tsx`:

```tsx
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { LemmaScreen } from '@/screens/LemmaScreen';
import { parseLemmaParam } from '@/data/routeParams';

export default function LemmaRoute() {
  const params = useLocalSearchParams<{ lemma: string }>();
  const lemmaBuckwalter = useMemo(() => parseLemmaParam(params.lemma), [params.lemma]);

  return <LemmaScreen lemmaBuckwalter={lemmaBuckwalter} />;
}
```

- [ ] **Step 5: Run it, confirm it passes**

Run: `cd apps/mobile && npx vitest run src/screens/LemmaScreen.test.tsx --no-cache`
Expected: PASS, 3 tests.

- [ ] **Step 6: Full gate and commit**

Run: `cd apps/mobile && pnpm test && pnpm type-check && pnpm lint`

```bash
git add apps/mobile
git commit -m "feat(mobile): lemma screen with its concordance

Reuses ConcordanceList behind the lemma loaders, so the root and lemma
screens differ only in header and query. Paging is driven by
countLemmaConcordance rather than the entry's own count: the entry query
groups occurrences away, and paging off that number truncates the list."
```

---

## Task 9: Checklist, verification log and ledger

**Files:**
- Modify: `README.md`, `docs/plans/phase-m4-dictionary-search.md` (this file), `STATUS.md`

**Interfaces:** consumes everything. Produces the §10 exit criterion.

- [ ] **Step 1: Add the M4 checks to `README.md`**

Append after the M3 section, numbered 28 onward so M3's numbering is untouched:

```
## M4 Dictionary + Search Smoke Test

Run on a physical Android device, on a `preview` profile APK, alongside the
outstanding M3 checks (F5, F6, check 27 and the M2 rosette carry-over).

28. Tab bar reads Home · Read · Morphology · Dictionary · Menu. Menu opens
    Bookmarks, Settings and About & credits, and all three open.
29. Reader header → magnifier. Type `2:255`. A "Go to" row appears above the
    verse hits; tapping it opens al-Baqarah at 255.
30. Type `Al-Baqarah 255`, then an Arabic surah name. Both jump the same way.
31. Settings → Language → Русский. Search a Russian word. Each ayah appears
    **once**, and its wording matches what the reader shows for that ayah.
    Four copies of one verse is the defect this phase fixed.
32. Search an Arabic word. Matched words are tinted inside each snippet, and no
    box glyph or stray control character is visible.
33. Search nonsense. "Nothing found" — not a spinner that never stops, and not
    "Unable to search", which means FTS5 is missing from the build.
34. Dictionary → Browse. Tap ق. The list shows that letter's roots; tap one and
    the root screen opens.
35. Dictionary → Frequent. Roots, Lemmas and Verbs each load a different list.
    Tap a verb row: it opens a lemma screen, not a dead end.
36. Root screen for a common root (قول). Scroll: occurrences keep loading, the
    same verse never appears twice, and the header scrolls with the list rather
    than fighting it.
37. Airplane mode: repeat 29, 31, 34 and 36. All of it is local.
38. Repeat 29 and 36 in dark mode and at maximum system font size. Nothing
    clips and the snippet highlight is still legible.
```

- [ ] **Step 2: Add the Verification Log skeleton to this plan**

Append a `## Verification Log` section with `### Run 1 — pending`, a table of checks 28–38 all marked `unexercised`, and four carry-over rows for M3's F5, F6, check 27 and the M2 rosette. Per the M3 log's convention: **an unexercised check is recorded as unexercised, never implied to have passed.**

- [ ] **Step 3: Ask for the build**

M4 is code-complete but not verified. Ask the owner for a `preview` build. Confirm the EAS upload is ~43 MB — a ~5 MB upload means `.easignore` dropped the bundled DB and every check above fails for the wrong reason.

- [ ] **Step 4: Record the run**

Fill the table with the real results. A FAIL is a finding: record it, fix it, and note whether the fix was re-verified on device or carried to the next build.

- [ ] **Step 5: Update `STATUS.md` and commit**

Verify against `git log --oneline` before writing anything into `STATUS.md` (§14).

```bash
git add README.md docs/plans/phase-m4-dictionary-search.md STATUS.md
git commit -m "docs(mobile): record the M4 on-device verification run"
```

---

## Risks

| # | Risk | Mitigation | Rollback |
| --- | --- | --- | --- |
| R1 | Moving bookmarks and settings out of `(tabs)` breaks a deep link or an in-app `href`. | Verified before planning: nothing links to `/bookmarks` or `/settings`, both are reached only from the tab bar. Task 1 ships alone, so a break is unambiguous. | `git revert` Task 1's commit; the routes return to `(tabs)`. |
| R2 | The root screen's `FlatList` header keeps a `ScrollView` and nests a VirtualizedList. | Task 7 Step 7 deletes the wrapper explicitly. | Push the concordance to its own screen and leave the root screen a `ScrollView`. |
| R3 | The Task 2 search change alters web's results. | Web passes no options and the no-options path is unchanged; Task 2 Step 7 runs web's tests and Playwright before the commit. | Revert Task 2; mobile falls back to unfiltered search with visible duplicates. |
| R4 | FTS5 unavailable against the read-only bundled asset on device. | Task 3 surfaces it first, and its error state says "Unable to search" rather than rendering as "nothing found". expo-sqlite 57 enables FTS5 unless `expo.sqlite.enableFTS=false`, which nothing sets. | Fall back to `LIKE` over a normalized column — slower, correct, no schema change. |
| R5 | Loading 1,548 roots per letter tap is slow on a low-end device. | One query and one filter; measure on check 34 before optimising. | Memoise the root list in a module-level cache. |
| R6 | M4's checks land on a build that already carries M3's Run 3 debt. | One build, one checklist — the owner's decision of 2026-08-18. Task 9's checklist names the carry-over explicitly. | None needed. |
| R7 | Nine tasks is a lot of unverified code before a device run. | Every task ends green on lint, type-check and tests, and Task 3 is the earliest point at which the riskiest assumption becomes device-testable. | Ask for a build after Task 3 rather than after Task 9. |

## Not in this phase

- **Recent-search history** — writes the on-device user DB, a §5 trigger and persisted device state, for a convenience nobody asked for.
- **Search filters by surah or part of speech.**
- **Form-filter chips on the root concordance** (web's `FormFilterChips`). `getRootConcordancePage` already accepts `formIds`; no mobile screen passes them yet.
- **Refined Dictionary and Menu tab glyphs.** Task 1 adds two plain ones so no glyph is shared with another tab; drawing them properly is a design task.
- **A translator picker.** Task 2's options exist so one is cheap later, but nothing in this phase exposes them.
- **Any treebank surface.**
