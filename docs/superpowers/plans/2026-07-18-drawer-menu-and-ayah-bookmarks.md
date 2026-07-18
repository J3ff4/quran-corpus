# Drawer Menu + Ayah-Level Bookmarks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed top-right theme button and bottom-nav Search icon
with a single right-side drawer menu (Search, Theme, Bookmarks, About &
Credits), and let users bookmark individual ayahs — from both reading mode
and the word-by-word page — to localStorage, browsable at `/bookmarks`.

**Architecture:** Client-only feature, no `packages/data`/schema change.
`lib/bookmarks.ts` owns a localStorage array of `{surahId, ayahNumber, view,
bookmarkedAt}`; a shared `BookmarkButton` component (used by both
`AyahView` and `WbwAyahBlock`) reads/writes it. `DrawerMenu` is a right-side
sliding panel (same overlay/spring mechanics as the existing `SearchSheet`)
triggered from `BottomNav`, which now owns the drawer's open state directly
(no new context — nothing else needs to trigger it). The existing
`ThemeToggle` fixed button is replaced by a `useTheme()` hook consumed from
inside the drawer. Reading mode gains ayah-scroll support (`ScrollToAyah`,
already built for the word-by-word page, moves to a shared location) so a
reading-mode bookmark can jump back to its exact verse.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind, Framer Motion,
Vitest + Testing Library (jsdom). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-18-drawer-menu-and-ayah-bookmarks-design.md`

## Global Constraints

- Conventional Commits per commit: `type(scope): subject` (CLAUDE.md §9). One logical change per commit.
- Every task's implementation step is followed by `pnpm --filter web test`, `pnpm --filter web lint`, `pnpm --filter web type-check` passing before commit (CLAUDE.md §4 step 3). No `@ts-ignore`, no disabled lint rule without an inline justification comment.
- Greptile must reach 5/5 (check pass) before this branch merges to `main` (CLAUDE.md §5) — run once after all tasks, not per-task.
- DRY: bookmark read/write logic lives once (`lib/bookmarks.ts`); the bookmark button UI lives once (`components/shared/BookmarkButton.tsx`) and is used by both `AyahView` and `WbwAyahBlock`; `ScrollToAyah` lives once (`components/shared/`) and is used by both the reading and word-by-word pages.
- No changes to `packages/data` — bookmarks are localStorage-only, per-device, no server round trip.
- OWASP: no secrets involved; all `localStorage` access wrapped in try/catch (private-mode/quota) so a storage failure never throws into the UI.
- Subagent floor: Sonnet or newer if dispatching subagents for these tasks (CLAUDE.md §13).

---

### Task 1: Bookmarks storage — `lib/bookmarks.ts`

**Files:**
- Create: `apps/web/src/lib/bookmarks.ts`
- Test: `apps/web/src/test/bookmarks.test.ts`

**Interfaces:**
- Produces: `interface Bookmark { surahId: number; ayahNumber: number; view: 'reading' | 'wbw'; bookmarkedAt: number }`, `getBookmarks(): Bookmark[]` (sorted `bookmarkedAt` desc), `isBookmarked(surahId: number, ayahNumber: number, view: Bookmark['view']): boolean`, `toggleBookmark(surahId: number, ayahNumber: number, view: Bookmark['view']): boolean` (returns the new state).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/test/bookmarks.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getBookmarks, isBookmarked, toggleBookmark } from '../lib/bookmarks';

describe('bookmarks', () => {
  beforeEach(() => localStorage.clear());

  it('is not bookmarked by default', () => {
    expect(isBookmarked(2, 255, 'reading')).toBe(false);
  });

  it('toggleBookmark adds then removes', () => {
    expect(toggleBookmark(2, 255, 'reading')).toBe(true);
    expect(isBookmarked(2, 255, 'reading')).toBe(true);
    expect(toggleBookmark(2, 255, 'reading')).toBe(false);
    expect(isBookmarked(2, 255, 'reading')).toBe(false);
  });

  it('reading and wbw bookmarks for the same verse are independent', () => {
    toggleBookmark(2, 255, 'reading');
    expect(isBookmarked(2, 255, 'wbw')).toBe(false);
    toggleBookmark(2, 255, 'wbw');
    expect(isBookmarked(2, 255, 'reading')).toBe(true);
    expect(isBookmarked(2, 255, 'wbw')).toBe(true);
  });

  it('getBookmarks sorts most-recently-bookmarked first', async () => {
    toggleBookmark(1, 1, 'reading');
    await new Promise((r) => setTimeout(r, 2));
    toggleBookmark(2, 255, 'wbw');
    const all = getBookmarks();
    expect(all[0]).toMatchObject({ surahId: 2, ayahNumber: 255, view: 'wbw' });
    expect(all[1]).toMatchObject({ surahId: 1, ayahNumber: 1, view: 'reading' });
  });

  it('tolerates malformed localStorage JSON', () => {
    localStorage.setItem('bookmarks', '{not json');
    expect(getBookmarks()).toEqual([]);
    expect(isBookmarked(1, 1, 'reading')).toBe(false);
  });

  it('tolerates valid JSON that is not an array', () => {
    localStorage.setItem('bookmarks', '{"foo":"bar"}');
    expect(getBookmarks()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/test/bookmarks.test.ts`
Expected: FAIL — `Cannot find module '../lib/bookmarks'`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/bookmarks.ts
const STORAGE_KEY = 'bookmarks';

export interface Bookmark {
  surahId: number;
  ayahNumber: number;
  view: 'reading' | 'wbw';
  bookmarkedAt: number;
}

function isBookmark(b: unknown): b is Bookmark {
  if (typeof b !== 'object' || b === null) return false;
  const r = b as Record<string, unknown>;
  return (
    typeof r.surahId === 'number' &&
    typeof r.ayahNumber === 'number' &&
    (r.view === 'reading' || r.view === 'wbw') &&
    typeof r.bookmarkedAt === 'number'
  );
}

function readAll(): Bookmark[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isBookmark) : [];
  } catch {
    return [];
  }
}

function writeAll(bookmarks: Bookmark[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch {
    // Storage unavailable (private mode/quota) — toggle no-ops, never throws.
  }
}

export function getBookmarks(): Bookmark[] {
  return readAll().sort((a, b) => b.bookmarkedAt - a.bookmarkedAt);
}

export function isBookmarked(
  surahId: number,
  ayahNumber: number,
  view: Bookmark['view'],
): boolean {
  return readAll().some(
    (b) => b.surahId === surahId && b.ayahNumber === ayahNumber && b.view === view,
  );
}

export function toggleBookmark(
  surahId: number,
  ayahNumber: number,
  view: Bookmark['view'],
): boolean {
  const all = readAll();
  const idx = all.findIndex(
    (b) => b.surahId === surahId && b.ayahNumber === ayahNumber && b.view === view,
  );
  if (idx !== -1) {
    all.splice(idx, 1);
    writeAll(all);
    return false;
  }
  all.push({ surahId, ayahNumber, view, bookmarkedAt: Date.now() });
  writeAll(all);
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/test/bookmarks.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/bookmarks.ts apps/web/src/test/bookmarks.test.ts
git commit -m "feat(web/bookmarks): add localStorage-backed ayah bookmark store"
```

---

### Task 2: Shared `BookmarkButton` component

**Files:**
- Create: `apps/web/src/components/shared/BookmarkButton.tsx`
- Test: `apps/web/src/test/BookmarkButton.test.tsx`

**Interfaces:**
- Consumes: `isBookmarked`, `toggleBookmark`, `type Bookmark` from `../../lib/bookmarks` (Task 1)
- Produces: `BookmarkButton({ surahId, ayahNumber, view }: { surahId: number; ayahNumber: number; view: Bookmark['view'] })` — renders a `<button>` with `aria-pressed` reflecting bookmark state, `aria-label` `"Bookmark ayah {n}"` / `"Remove bookmark, ayah {n}"`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/test/BookmarkButton.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BookmarkButton } from '../components/shared/BookmarkButton';
import { toggleBookmark } from '../lib/bookmarks';

describe('BookmarkButton', () => {
  beforeEach(() => localStorage.clear());

  it('starts unbookmarked and toggles on click', async () => {
    render(<BookmarkButton surahId={2} ayahNumber={255} view="reading" />);
    const btn = await screen.findByRole('button', { name: /bookmark ayah 255/i });
    expect(btn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(btn);
    expect(
      screen.getByRole('button', { name: /remove bookmark, ayah 255/i }),
    ).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: /remove bookmark/i }));
    expect(screen.getByRole('button', { name: /bookmark ayah 255/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('reflects a bookmark already stored on mount', async () => {
    toggleBookmark(2, 255, 'wbw');
    render(<BookmarkButton surahId={2} ayahNumber={255} view="wbw" />);
    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true'),
    );
  });

  it('reading and wbw views for the same verse toggle independently', () => {
    render(
      <>
        <BookmarkButton surahId={2} ayahNumber={255} view="reading" />
        <BookmarkButton surahId={2} ayahNumber={255} view="wbw" />
      </>,
    );
    const [readingBtn, wbwBtn] = screen.getAllByRole('button');
    fireEvent.click(readingBtn!);
    expect(readingBtn).toHaveAttribute('aria-pressed', 'true');
    expect(wbwBtn).toHaveAttribute('aria-pressed', 'false');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/test/BookmarkButton.test.tsx`
Expected: FAIL — `Cannot find module '../components/shared/BookmarkButton'`

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/src/components/shared/BookmarkButton.tsx
'use client';

import { useEffect, useState } from 'react';
import { isBookmarked, toggleBookmark, type Bookmark } from '../../lib/bookmarks';

interface BookmarkButtonProps {
  surahId: number;
  ayahNumber: number;
  view: Bookmark['view'];
}

/**
 * Starts unbookmarked on the server-rendered markup and reconciles from
 * localStorage after mount (same SSR-safe pattern as the theme toggle) to
 * avoid a hydration mismatch.
 */
export function BookmarkButton({ surahId, ayahNumber, view }: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    setBookmarked(isBookmarked(surahId, ayahNumber, view));
  }, [surahId, ayahNumber, view]);

  return (
    <button
      type="button"
      aria-label={
        bookmarked ? `Remove bookmark, ayah ${ayahNumber}` : `Bookmark ayah ${ayahNumber}`
      }
      aria-pressed={bookmarked}
      onClick={() => setBookmarked(toggleBookmark(surahId, ayahNumber, view))}
      className="flex h-6 w-6 items-center justify-center rounded-full text-paper-500 transition-colors hover:bg-paper-200 dark:text-paper-400 dark:hover:bg-night-100"
    >
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill={bookmarked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.2L5 21V4.5a1 1 0 0 1 1-1z" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/test/BookmarkButton.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shared/BookmarkButton.tsx apps/web/src/test/BookmarkButton.test.tsx
git commit -m "feat(web/bookmarks): add shared per-ayah BookmarkButton"
```

---

### Task 3: Bookmark button in reading mode (`AyahView`)

**Files:**
- Modify: `apps/web/src/components/reader/AyahView.tsx`
- Test: `apps/web/src/test/AyahView.test.tsx`

**Interfaces:**
- Consumes: `BookmarkButton` from `../shared/BookmarkButton` (Task 2)

- [ ] **Step 1: Write the failing test**

Append to the existing `describe('AyahView', ...)` block in
`apps/web/src/test/AyahView.test.tsx`:

```tsx
  it('renders a bookmark button', () => {
    render(<AyahView ayah={ayah} words={[]} onWordClick={vi.fn()} {...audioProps} />);
    expect(screen.getByRole('button', { name: /bookmark ayah 1/i })).toBeInTheDocument();
  });

  it('sets the scroll-anchor id on the article', () => {
    const { container } = render(
      <AyahView ayah={ayah} words={[]} onWordClick={vi.fn()} {...audioProps} />,
    );
    expect(container.querySelector('#ayah-1')).not.toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/test/AyahView.test.tsx`
Expected: FAIL — no element with role "button" named `/bookmark ayah 1/i`; `#ayah-1` not found

- [ ] **Step 3: Write minimal implementation**

In `apps/web/src/components/reader/AyahView.tsx`, add the import:

```tsx
import { BookmarkButton } from '../shared/BookmarkButton';
```

Change the `<article>` opening tag and header row to:

```tsx
    <article id={`ayah-${ayah.ayah_number}`} className="mb-10">
      <div className="mb-3 flex items-center gap-2">
        <AyahMedallion n={ayah.ayah_number} />
        <AyahAudioButton
          ayah={ayah}
          isThisPlaying={isThisPlaying}
          isPlaying={isPlaying}
          isRepeat={isRepeat}
          onPlay={onPlay}
          onPause={onPause}
          onToggleRepeat={onToggleRepeat}
        />
        <BookmarkButton surahId={ayah.surah_id} ayahNumber={ayah.ayah_number} view="reading" />
      </div>
```

(Rest of the component body is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/test/AyahView.test.tsx`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/reader/AyahView.tsx apps/web/src/test/AyahView.test.tsx
git commit -m "feat(web/reader): add per-ayah bookmark button and scroll anchor"
```

---

### Task 4: Bookmark button in word-by-word mode (`WbwAyahBlock`)

**Files:**
- Modify: `apps/web/src/components/wbw/WbwAyahBlock.tsx`
- Modify: `apps/web/src/components/wbw/WbwView.tsx`
- Test: `apps/web/src/test/WbwAyahBlock.test.tsx`

**Interfaces:**
- Consumes: `BookmarkButton` from `../shared/BookmarkButton` (Task 2)
- Produces: `WbwAyahBlock` now requires a `surahId: number` prop (new — `WbwAyah` itself carries no surah id).

- [ ] **Step 1: Write the failing test**

`apps/web/src/test/WbwAyahBlock.test.tsx` currently calls `<WbwAyahBlock ayah={ayah} />`
without a `surahId`. Update every existing call to pass `surahId={1}`, and add
a new test:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WbwAyahBlock } from '../components/wbw/WbwAyahBlock';
import type { WbwAyah } from '../components/wbw/types';

const c = (position: number, arabic: string) => ({
  surahId: 1, ayahNumber: 3, position, arabic, translit: 't', gloss: 'g', glossLang: null, posLabel: 'Noun',
});

describe('WbwAyahBlock', () => {
  it('has scroll anchor id and renders cells', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف'), c(2, 'باء')], textUthmani: 'x' };
    const { container } = render(<WbwAyahBlock surahId={1} ayah={ayah} />);
    expect(container.querySelector('#ayah-3')).not.toBeNull();
    expect(screen.getByText('الف')).toBeInTheDocument();
    expect(screen.getByText('باء')).toBeInTheDocument();
  });

  it('falls back to text_uthmani when the ayah has no words', () => {
    const ayah: WbwAyah = { ayahNumber: 4, cells: [], textUthmani: 'نَصُّ الآية' };
    render(<WbwAyahBlock surahId={1} ayah={ayah} />);
    expect(screen.getByText('نَصُّ الآية')).toBeInTheDocument();
  });

  it('renders cells in ascending position order in the DOM (dir=rtl handles visual order)', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف'), c(2, 'باء')], textUthmani: 'x' };
    render(<WbwAyahBlock surahId={1} ayah={ayah} />);
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveTextContent('الف');
    expect(links[1]).toHaveTextContent('باء');
  });

  it('renders a bookmark button', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف')], textUthmani: 'x' };
    render(<WbwAyahBlock surahId={1} ayah={ayah} />);
    expect(screen.getByRole('button', { name: /bookmark ayah 3/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/test/WbwAyahBlock.test.tsx`
Expected: FAIL — type error (`surahId` not a valid prop) / no bookmark button found

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/src/components/wbw/WbwAyahBlock.tsx
import { WbwWordCell } from './WbwWordCell';
import type { WbwAyah } from './types';
import { AyahMedallion } from '../reader/ornaments/AyahMedallion';
import { BookmarkButton } from '../shared/BookmarkButton';

export function WbwAyahBlock({
  surahId,
  ayah,
  pageLang,
}: {
  surahId: number;
  ayah: WbwAyah;
  pageLang?: string;
}) {
  return (
    <section id={`ayah-${ayah.ayahNumber}`} className="scroll-mt-20 border-b border-paper-200 py-5 dark:border-night-100">
      <div className="mb-3 flex items-center gap-2">
        <AyahMedallion n={ayah.ayahNumber} />
        <BookmarkButton surahId={surahId} ayahNumber={ayah.ayahNumber} view="wbw" />
      </div>
      {ayah.cells.length > 0 ? (
        <div className="flex flex-wrap gap-2" dir="rtl">
          {ayah.cells.map((cell) => (
            <WbwWordCell key={cell.position} cell={cell} {...(pageLang ? { pageLang } : {})} />
          ))}
        </div>
      ) : (
        <p className="font-arabic text-2xl leading-[2.4] text-paper-900 dark:text-paper-100" dir="rtl">
          {ayah.textUthmani}
        </p>
      )}
    </section>
  );
}
```

In `apps/web/src/components/wbw/WbwView.tsx`, update the render call:

```tsx
        <WbwAyahBlock
          key={ayah.ayahNumber}
          surahId={surah.id}
          ayah={ayah}
          {...(pageLang ? { pageLang } : {})}
        />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/test/WbwAyahBlock.test.tsx src/test/WbwView.test.tsx`
Expected: PASS (4 + existing `WbwView` tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/wbw/WbwAyahBlock.tsx apps/web/src/components/wbw/WbwView.tsx apps/web/src/test/WbwAyahBlock.test.tsx
git commit -m "feat(web/wbw): add per-ayah bookmark button, thread surahId to WbwAyahBlock"
```

---

### Task 5: Move `ScrollToAyah` to a shared location

**Files:**
- Create: `apps/web/src/components/shared/ScrollToAyah.tsx`
- Delete: `apps/web/src/components/wbw/ScrollToAyah.tsx`
- Modify: `apps/web/src/components/wbw/WbwView.tsx` (import path only)
- Modify: `apps/web/src/test/ScrollToAyah.test.tsx` (import path only)

Reading mode needs the same scroll-to-ayah behavior (Task 6) — `ScrollToAyah`
stops being WbW-specific. No logic changes, pure move.

**Interfaces:**
- Produces: `ScrollToAyah({ ayah }: { ayah: number })` — unchanged signature, new location `components/shared/ScrollToAyah.tsx`.

- [ ] **Step 1: Move the file**

```bash
git mv apps/web/src/components/wbw/ScrollToAyah.tsx apps/web/src/components/shared/ScrollToAyah.tsx
```

- [ ] **Step 2: Update the test's import path**

In `apps/web/src/test/ScrollToAyah.test.tsx`, change:

```tsx
import { ScrollToAyah } from '../components/wbw/ScrollToAyah';
```

to:

```tsx
import { ScrollToAyah } from '../components/shared/ScrollToAyah';
```

- [ ] **Step 3: Update `WbwView.tsx`'s import path**

In `apps/web/src/components/wbw/WbwView.tsx`, change:

```tsx
import { ScrollToAyah } from './ScrollToAyah';
```

to:

```tsx
import { ScrollToAyah } from '../shared/ScrollToAyah';
```

- [ ] **Step 4: Run tests to verify nothing broke**

Run: `cd apps/web && npx vitest run src/test/ScrollToAyah.test.tsx src/test/WbwView.test.tsx`
Expected: PASS (unchanged test counts, new import paths)

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src/components/shared/ScrollToAyah.tsx apps/web/src/components/wbw/ScrollToAyah.tsx apps/web/src/components/wbw/WbwView.tsx apps/web/src/test/ScrollToAyah.test.tsx
git commit -m "refactor(web): move ScrollToAyah to components/shared (reading mode needs it too)"
```

---

### Task 6: Reading-mode ayah-scroll support (`ReaderView`)

**Files:**
- Modify: `apps/web/src/components/reader/ReaderView.tsx`
- Test: `apps/web/src/test/ReaderView.test.tsx`

**Interfaces:**
- Consumes: `ScrollToAyah` from `../shared/ScrollToAyah` (Task 5)
- Produces: `ReaderView` gains a new optional prop `scrollAyah?: number | null` — when set and beyond the initially-revealed window, reveals enough ayahs to include it, then scrolls to it.

- [ ] **Step 1: Write the failing test**

In `apps/web/src/test/ReaderView.test.tsx`, add `Element.prototype.scrollIntoView`
stubbing to `beforeEach` (jsdom doesn't implement it, and mounting
`ScrollToAyah` for real will call it):

```tsx
describe('ReaderView incremental render', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    audioState.playingAyahId = null;
    Element.prototype.scrollIntoView = vi.fn();
  });
```

Then append two new tests to the same `describe` block:

```tsx
  it('scrollAyah beyond the initial window reveals enough ayahs to include it', () => {
    const { container } = render(
      <ReaderView ayahs={makeAyahs(60)} {...empties} scrollAyah={50} />,
    );
    expect(articleCount(container)).toBeGreaterThanOrEqual(50);
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('mounts the scroll anchor for the target ayah when scrollAyah is set', () => {
    const { container } = render(
      <ReaderView ayahs={makeAyahs(7)} {...empties} scrollAyah={3} />,
    );
    expect(container.querySelector('#ayah-3')).not.toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/test/ReaderView.test.tsx`
Expected: FAIL — TypeScript error (`scrollAyah` not a known prop) / ayah 50 not revealed

- [ ] **Step 3: Write minimal implementation**

In `apps/web/src/components/reader/ReaderView.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { Ayah, Word, Translation } from '@quran-corpus/data';
import { AyahView } from './AyahView';
import { Bismillah } from './ornaments/Bismillah';
import { WordPopover } from './WordPopover';
import { ScrollToAyah } from '../shared/ScrollToAyah';
import { useAyahAudio } from '../../hooks/useAyahAudio';
import { useIncrementalReveal } from '../../hooks/useIncrementalReveal';
import { wordHref, wordLocation } from '../../lib/wordLocation';

const THRESHOLD = 40;
const INITIAL = 20;
const STEP = 20;

interface ReaderViewProps {
  ayahs: Ayah[];
  wordsByAyah: Record<number, Word[]>;
  translationsByAyah: Record<number, Translation>;
  glossesByWordId: Record<number, { text: string; lang: string }>;
  lang: string;
  scrollAyah?: number | null;
}

export function ReaderView({
  ayahs,
  wordsByAyah,
  translationsByAyah,
  glossesByWordId,
  lang,
  scrollAyah,
}: ReaderViewProps) {
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const { playingAyahId, isPlaying, isRepeat, play, pause, toggleRepeat } = useAyahAudio(ayahs);
  const paginate = ayahs.length > THRESHOLD;
  const { visibleCount, sentinelRef, done, revealTo } = useIncrementalReveal<HTMLButtonElement>(
    ayahs.length,
    INITIAL,
    STEP,
  );

  useEffect(() => {
    if (!paginate || playingAyahId == null) return;
    const idx = ayahs.findIndex((a) => a.id === playingAyahId);
    if (idx !== -1) revealTo(idx + 1);
  }, [paginate, playingAyahId, ayahs, revealTo]);

  useEffect(() => {
    if (!paginate || scrollAyah == null) return;
    const idx = ayahs.findIndex((a) => a.ayah_number === scrollAyah);
    if (idx !== -1) revealTo(idx + 1);
  }, [paginate, scrollAyah, ayahs, revealTo]);

  const visible = paginate ? ayahs.slice(0, visibleCount) : ayahs;

  const selectedAyah = selectedWord ? ayahs.find((a) => a.id === selectedWord.ayah_id) : undefined;
  const selectedHref =
    selectedWord && selectedAyah ? wordHref(wordLocation(selectedAyah, selectedWord)) : undefined;

  const surahId = ayahs[0]?.surah_id;

  return (
    <div>
      {surahId != null && <Bismillah surahId={surahId} />}
      {visible.map((ayah) => (
        <AyahView
          key={ayah.id}
          ayah={ayah}
          words={wordsByAyah[ayah.id] ?? []}
          {...(translationsByAyah[ayah.id] != null
            ? { translation: translationsByAyah[ayah.id] }
            : {})}
          onWordClick={setSelectedWord}
          isThisPlaying={playingAyahId === ayah.id}
          isPlaying={isPlaying}
          isRepeat={isRepeat}
          onPlay={() => play(ayah)}
          onPause={pause}
          onToggleRepeat={toggleRepeat}
        />
      ))}
      {paginate && !done && (
        <button
          ref={sentinelRef}
          type="button"
          onClick={() => revealTo(visibleCount + STEP)}
          className="mx-auto mt-4 block rounded-full bg-paper-200 px-6 py-2 text-sm text-paper-700 transition-colors hover:bg-paper-300 dark:bg-night-100 dark:text-paper-300 dark:hover:bg-night-200"
        >
          Load more ayahs
        </button>
      )}
      {scrollAyah != null && <ScrollToAyah ayah={scrollAyah} />}
      <WordPopover
        word={selectedWord}
        {...(selectedWord != null && glossesByWordId[selectedWord.id] != null
          ? {
              gloss: glossesByWordId[selectedWord.id]!.text,
              glossLang: glossesByWordId[selectedWord.id]!.lang,
            }
          : {})}
        pageLang={lang}
        {...(selectedHref ? { href: selectedHref } : {})}
        onClose={() => setSelectedWord(null)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/test/ReaderView.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/reader/ReaderView.tsx apps/web/src/test/ReaderView.test.tsx
git commit -m "feat(web/reader): support scrolling to a target ayah (mirrors WbW's ?ayah=)"
```

---

### Task 7: Wire `?ayah=` into the reading page

**Files:**
- Create: `apps/web/src/app/surah/[id]/params.ts`
- Test: `apps/web/src/test/surah-page-params.test.ts`
- Modify: `apps/web/src/app/surah/[id]/page.tsx`

Next.js route modules may only export reserved names, so the parsing logic
lives in a sibling file (same pattern the word-by-word page already uses for
`apps/web/src/app/surah/[id]/words/params.ts`).

**Interfaces:**
- Produces: `parseScrollAyah(raw: string | undefined, ayahCount: number): number | null`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/test/surah-page-params.test.ts
import { describe, it, expect } from 'vitest';
import { parseScrollAyah } from '../app/surah/[id]/params';

describe('parseScrollAyah', () => {
  it('accepts a valid in-range ayah number', () => {
    expect(parseScrollAyah('255', 286)).toBe(255);
  });

  it('rejects out-of-range, non-numeric, and missing values', () => {
    expect(parseScrollAyah('0', 286)).toBeNull();
    expect(parseScrollAyah('287', 286)).toBeNull();
    expect(parseScrollAyah('abc', 286)).toBeNull();
    expect(parseScrollAyah(undefined, 286)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/test/surah-page-params.test.ts`
Expected: FAIL — `Cannot find module '../app/surah/[id]/params'`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/app/surah/[id]/params.ts
export function parseScrollAyah(raw: string | undefined, ayahCount: number): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= ayahCount ? n : null;
}
```

Then update `apps/web/src/app/surah/[id]/page.tsx`:

```tsx
// DB-dependent page — opt out of static pre-rendering
export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getDatabase } from '../../../lib/db';
import {
  getSurahById,
  getAyahsBySurah,
  getWordsBySurah,
  getTranslationsBySurahAndLang,
  getGlossesWithFallback,
} from '@quran-corpus/data';
import type { Word, Translation } from '@quran-corpus/data';
import { SurahHeader } from '../../../components/reader/SurahHeader';
import { ReaderView } from '../../../components/reader/ReaderView';
import { LanguageBar } from '../../../components/reader/LanguageBar';
import { isValidLang, type ValidLang } from '../../../components/reader/languages';
import { parseScrollAyah } from './params';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string; ayah?: string }>;
}

export default async function SurahPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { lang: rawLang, ayah: rawAyah } = await searchParams;
  const lang: ValidLang = isValidLang(rawLang) ? rawLang : 'en';
  const surahId = parseInt(id, 10);

  if (isNaN(surahId) || surahId < 1 || surahId > 114) notFound();

  const db = await getDatabase();
  const [surah, ayahs, words, translations, glosses] = await Promise.all([
    getSurahById(db, surahId),
    getAyahsBySurah(db, surahId),
    getWordsBySurah(db, surahId),
    getTranslationsBySurahAndLang(db, surahId, lang),
    getGlossesWithFallback(db, surahId, lang),
  ]);

  if (!surah) notFound();

  const scrollAyah = parseScrollAyah(rawAyah, surah.ayah_count);

  const wordsByAyah: Record<number, Word[]> = {};
  for (const word of words) {
    (wordsByAyah[word.ayah_id] ??= []).push(word);
  }

  const translationsByAyah: Record<number, Translation> = {};
  for (const t of translations) {
    translationsByAyah[t.ayah_id] = t;
  }

  const glossesByWordId: Record<number, { text: string; lang: string }> = {};
  for (const g of glosses) {
    glossesByWordId[g.word_id] = { text: g.gloss_text, lang: g.gloss_lang };
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <SurahHeader surah={surah} />
      <LanguageBar surahId={surahId} activeLang={lang} />
      <ReaderView
        ayahs={ayahs}
        wordsByAyah={wordsByAyah}
        translationsByAyah={translationsByAyah}
        glossesByWordId={glossesByWordId}
        lang={lang}
        scrollAyah={scrollAyah}
      />
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/test/surah-page-params.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/surah/\[id\]/params.ts apps/web/src/app/surah/\[id\]/page.tsx apps/web/src/test/surah-page-params.test.ts
git commit -m "feat(web/reader): read ?ayah= on the reading page and scroll to it"
```

---

### Task 8: Extract `useTheme()` hook, remove the fixed `ThemeToggle` button

**Files:**
- Create: `apps/web/src/hooks/useTheme.ts`
- Test: `apps/web/src/test/useTheme.test.ts`
- Delete: `apps/web/src/components/shell/ThemeToggle.tsx`
- Delete: `apps/web/src/test/ThemeToggle.test.tsx`

The drawer (Task 9) needs the toggle's *logic*, not its fixed-button UI. This
task extracts the logic into a hook and removes the old component; Task 11
removes its last usage from `layout.tsx`.

**Interfaces:**
- Produces: `useTheme(): { theme: 'light' | 'dark'; toggle: () => void }`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/test/useTheme.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTheme } from '../hooks/useTheme';

function stubMatchMedia(prefersDark: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: prefersDark })));
}

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    stubMatchMedia(false);
  });

  it('defaults to OS preference when nothing stored (dark system)', async () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe('dark'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('stored choice beats OS preference', async () => {
    stubMatchMedia(true);
    localStorage.setItem('theme', 'light');
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe('light'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggle flips theme, applies class, and persists', async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe('light'));

    act(() => result.current.toggle());
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');

    act(() => result.current.toggle());
    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('storage event from another tab syncs state', async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe('light'));

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'dark' }));
    });
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/test/useTheme.test.ts`
Expected: FAIL — `Cannot find module '../hooks/useTheme'`

- [ ] **Step 3: Write minimal implementation, delete the old component**

```ts
// apps/web/src/hooks/useTheme.ts
'use client';

import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

function resolveTheme(stored: string | null): Theme {
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem('theme', theme);
  } catch {
    // Storage unavailable (private mode) — theme applies but won't persist.
  }
}

/**
 * public/theme-init.js sets the initial `.dark` class before paint; this
 * hook re-derives the same value on mount so callers' UI matches, and
 * follows `storage` events so other open tabs stay in sync.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem('theme');
    } catch {
      // Storage unavailable — fall through to the OS preference.
    }
    const initial = resolveTheme(stored);
    document.documentElement.classList.toggle('dark', initial === 'dark');
    setTheme(initial);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'theme') return;
      const next = resolveTheme(e.newValue);
      document.documentElement.classList.toggle('dark', next === 'dark');
      setTheme(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  return { theme, toggle };
}
```

```bash
git rm apps/web/src/components/shell/ThemeToggle.tsx apps/web/src/test/ThemeToggle.test.tsx
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/test/useTheme.test.ts`
Expected: PASS (4 tests)

Note: `apps/web/src/app/layout.tsx` still imports `ThemeToggle` at this point
and will fail to build — that import is removed in Task 11, two tasks from
now, once the drawer (Task 9) and nav (Task 10) exist to replace it. Run only
the targeted test above for this task's commit, not the full suite/build.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useTheme.ts apps/web/src/test/useTheme.test.ts
git commit -m "refactor(web/theme): extract useTheme() hook from the fixed ThemeToggle button"
```

---

### Task 9: `DrawerMenu` component

**Files:**
- Create: `apps/web/src/components/shell/DrawerMenu.tsx`
- Test: `apps/web/src/test/DrawerMenu.test.tsx`

**Interfaces:**
- Consumes: `useSearch()` from `../search/SearchProvider` (existing, returns `{ open: () => void }`), `useTheme()` from `../../hooks/useTheme` (Task 8)
- Produces: `DrawerMenu({ open, onClose }: { open: boolean; onClose: () => void })`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/test/DrawerMenu.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DrawerMenu } from '../components/shell/DrawerMenu';
import { SearchProvider } from '../components/search/SearchProvider';

function renderDrawer(onClose = vi.fn()) {
  return render(
    <SearchProvider>
      <DrawerMenu open onClose={onClose} />
    </SearchProvider>,
  );
}

describe('DrawerMenu', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] }) as Response));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders Search, Theme, Bookmarks, and About rows', () => {
    renderDrawer();
    expect(screen.getByRole('button', { name: /^search$/i })).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /bookmarks/i })).toHaveAttribute('href', '/bookmarks');
    expect(screen.getByRole('link', { name: /about/i })).toHaveAttribute('href', '/about');
  });

  it('renders nothing when closed', () => {
    render(
      <SearchProvider>
        <DrawerMenu open={false} onClose={vi.fn()} />
      </SearchProvider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    renderDrawer(onClose);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes via the close button', () => {
    const onClose = vi.fn();
    renderDrawer(onClose);
    fireEvent.click(screen.getByRole('button', { name: /close menu/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('toggling theme flips the switch and the dark class', () => {
    renderDrawer();
    const themeSwitch = screen.getByRole('switch');
    expect(themeSwitch).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(themeSwitch);
    expect(themeSwitch).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('clicking Search closes the drawer and opens the search sheet', () => {
    const onClose = vi.fn();
    renderDrawer(onClose);
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/test/DrawerMenu.test.tsx`
Expected: FAIL — `Cannot find module '../components/shell/DrawerMenu'`

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/src/components/shell/DrawerMenu.tsx
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useSearch } from '../search/SearchProvider';
import { useTheme } from '../../hooks/useTheme';

const ROW =
  'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-paper-700 transition-colors hover:bg-paper-100 dark:text-paper-300 dark:hover:bg-night-200';
const ICON = 'h-5 w-5 shrink-0';

const searchIcon = (
  <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const bookmarkIcon = (
  <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden="true">
    <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.2L5 21V4.5a1 1 0 0 1 1-1z" />
  </svg>
);

const infoIcon = (
  <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.5v.01" />
  </svg>
);

const sunIcon = (
  <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

const moonIcon = (
  <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export function DrawerMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { open: openSearch } = useSearch();
  const { theme, toggle } = useTheme();
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-y-0 right-0 z-50 w-72 max-w-[80vw] overflow-y-auto bg-paper-50 p-3 pt-[calc(1rem+env(safe-area-inset-top))] dark:bg-night-300"
            initial={reduce ? { opacity: 0 } : { x: '100%' }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <button
              type="button"
              aria-label="Close menu"
              onClick={onClose}
              className="mb-2 ml-auto block px-2 py-1 text-paper-500"
            >
              ✕
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                openSearch();
              }}
              className={ROW}
            >
              {searchIcon}
              <span>Search</span>
            </button>

            <button
              type="button"
              role="switch"
              aria-checked={theme === 'dark'}
              onClick={toggle}
              className={ROW}
            >
              {theme === 'dark' ? moonIcon : sunIcon}
              <span>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
            </button>

            <Link href="/bookmarks" onClick={onClose} className={ROW}>
              {bookmarkIcon}
              <span>Bookmarks</span>
            </Link>

            <Link href="/about" onClick={onClose} className={ROW}>
              {infoIcon}
              <span>About &amp; Credits</span>
            </Link>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/test/DrawerMenu.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shell/DrawerMenu.tsx apps/web/src/test/DrawerMenu.test.tsx
git commit -m "feat(web/shell): add right-side DrawerMenu (search, theme, bookmarks, about)"
```

---

### Task 10: `BottomNav` — swap Search for Menu, mount the drawer

**Files:**
- Modify: `apps/web/src/components/shell/BottomNav.tsx`
- Test: `apps/web/src/test/BottomNav.test.tsx`

**Interfaces:**
- Consumes: `DrawerMenu` from `./DrawerMenu` (Task 9)

- [ ] **Step 1: Write the failing test**

Replace the "renders ... + a Search button" and "opens the shared search
sheet" tests in `apps/web/src/test/BottomNav.test.tsx` with:

```tsx
  it('renders Home, Read, Dictionary links + a Menu button', () => {
    mockPath.mockReturnValue('/');
    renderNav();
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /read/i })).toHaveAttribute('href', '/surah');
    expect(screen.getByRole('link', { name: /dictionary/i })).toHaveAttribute('href', '/dictionary');
    expect(screen.getByRole('button', { name: /menu/i })).toBeInTheDocument();
  });
```

```tsx
  it('opens the drawer menu when Menu is tapped', () => {
    mockPath.mockReturnValue('/');
    renderNav();
    expect(screen.queryByRole('dialog', { name: /menu/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    expect(screen.getByRole('dialog', { name: /menu/i })).toBeInTheDocument();
  });
```

(Keep the three "marks ... active" tests unchanged; they don't touch Search/Menu.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/test/BottomNav.test.tsx`
Expected: FAIL — no button named `/menu/i`; no dialog opens

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/src/components/shell/BottomNav.tsx
'use client';

import { type ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DrawerMenu } from './DrawerMenu';

interface LinkItem {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
  icon: ReactNode;
}

const ICON = 'h-6 w-6';

const HomeIcon = (
  <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </svg>
);

const BookIcon = (
  <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2z" />
    <path d="M20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 0 2-2z" />
  </svg>
);

const DictIcon = (
  <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 6c-1.5-1.2-3.5-2-6-2H3v14h3c2.5 0 4.5.8 6 2" />
    <path d="M12 6c1.5-1.2 3.5-2 6-2h3v14h-3c-2.5 0-4.5.8-6 2" />
    <path d="M12 6v14" />
  </svg>
);

const MenuIcon = (
  <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const LINK_ITEMS: LinkItem[] = [
  { href: '/', label: 'Home', match: (p) => p === '/', icon: HomeIcon },
  {
    href: '/surah',
    label: 'Read',
    match: (p) => p.startsWith('/surah') || p.startsWith('/word'),
    icon: BookIcon,
  },
  { href: '/dictionary', label: 'Dictionary', match: (p) => p.startsWith('/dictionary'), icon: DictIcon },
];

const itemClass = 'flex h-16 flex-col items-center justify-center gap-1 text-xs';
const activeColor = 'text-paper-900 dark:text-paper-100';
const idleColor = 'text-paper-500 dark:text-paper-400';

export function BottomNav() {
  const pathname = usePathname() ?? '/';
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-paper-200 bg-paper-50/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-night-100 dark:bg-night-300/95"
      >
        {LINK_ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`${itemClass} ${active ? activeColor : idleColor}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          aria-label="Menu"
          onClick={() => setMenuOpen(true)}
          className={`${itemClass} ${idleColor}`}
        >
          {MenuIcon}
          <span>Menu</span>
        </button>
      </nav>
      <DrawerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/test/BottomNav.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shell/BottomNav.tsx apps/web/src/test/BottomNav.test.tsx
git commit -m "feat(web/shell): replace bottom-nav Search with Menu, mount DrawerMenu"
```

---

### Task 11: `layout.tsx` + `/surah` page cleanup

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/surah/page.tsx`

Neither file has existing dedicated tests (confirmed: no test imports
`app/layout.tsx` or exercises `/surah`'s header nav). This is consistent with
the rest of the codebase's convention for these two files. Coverage for what
changes here comes from Task 8 (`useTheme` tests) and Task 9 (`DrawerMenu`'s
"renders ... About" test, which already asserts the `/about` link exists
somewhere in the app).

- [ ] **Step 1: Remove the fixed `ThemeToggle` and its reserved top padding**

In `apps/web/src/app/layout.tsx`, remove the import:

```tsx
import { ThemeToggle } from '../components/shell/ThemeToggle';
```

Remove the `<ThemeToggle />` line from the JSX (it currently sits between
`<SearchProvider>` and `{children}`).

Change the `<body>` className from:

```tsx
className="bg-paper-50 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-[calc(3.5rem+env(safe-area-inset-top))] font-sans text-paper-900 antialiased dark:bg-night-300 dark:text-paper-100"
```

to:

```tsx
className="bg-paper-50 pb-[calc(4rem+env(safe-area-inset-bottom))] font-sans text-paper-900 antialiased dark:bg-night-300 dark:text-paper-100"
```

- [ ] **Step 2: Drop the About & Credits link from the surah list header**

In `apps/web/src/app/surah/page.tsx`, change:

```tsx
        <nav className="flex items-baseline gap-4">
          <Link
            href="/dictionary"
            className="text-sm text-paper-500 transition-colors hover:text-paper-800 dark:hover:text-paper-200"
          >
            Dictionary
          </Link>
          <Link
            href="/about"
            className="text-sm text-paper-500 transition-colors hover:text-paper-800 dark:hover:text-paper-200"
          >
            About &amp; Credits
          </Link>
        </nav>
```

to:

```tsx
        <nav className="flex items-baseline gap-4">
          <Link
            href="/dictionary"
            className="text-sm text-paper-500 transition-colors hover:text-paper-800 dark:hover:text-paper-200"
          >
            Dictionary
          </Link>
        </nav>
```

- [ ] **Step 3: Run the full test suite, type-check, and lint**

Run: `cd apps/web && npx vitest run && npx tsc --noEmit && npx eslint src --ext .ts,.tsx`
Expected: all PASS (this is the first point since Task 8 where the whole
app compiles again — the dangling `ThemeToggle` import is gone).

- [ ] **Step 4: Manual smoke check**

Run: `cd apps/web && PORT=3939 npm run dev` (or reuse an already-running dev
server), then in a browser: confirm no top-padding gap remains, the bottom
nav shows Menu instead of Search, tapping Menu opens the right-side drawer
with Search/Theme/Bookmarks/About, and toggling the drawer's theme row
flips the app's color scheme.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/layout.tsx apps/web/src/app/surah/page.tsx
git commit -m "refactor(web): drop reserved top padding and duplicate About link now that DrawerMenu exists"
```

---

### Task 12: `/bookmarks` page

**Files:**
- Create: `apps/web/src/app/bookmarks/page.tsx`
- Test: `apps/web/src/test/bookmarksPage.test.tsx`

**Interfaces:**
- Consumes: `getBookmarks`, `type Bookmark` from `../../lib/bookmarks` (Task 1); `type PickerSurah` from `../../components/wbw/types`; `fetch('/api/surahs')` (existing endpoint)

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/test/bookmarksPage.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import BookmarksPage from '../app/bookmarks/page';
import { toggleBookmark } from '../lib/bookmarks';

const pickerSurahs = [{ id: 2, name_translit: 'Al-Baqarah', ayah_count: 286 }];

describe('BookmarksPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => pickerSurahs }) as Response));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows an empty state with no bookmarks', async () => {
    render(<BookmarksPage />);
    await waitFor(() => expect(screen.getByText(/no bookmarks yet/i)).toBeInTheDocument());
  });

  it('lists a bookmark with surah name, ayah number, and view tag', async () => {
    toggleBookmark(2, 255, 'wbw');
    render(<BookmarksPage />);
    await waitFor(() => expect(screen.getByText(/al-baqarah 255/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /al-baqarah 255/i })).toHaveAttribute(
      'href',
      '/surah/2/words?ayah=255',
    );
    expect(screen.getByText(/word-by-word/i)).toBeInTheDocument();
  });

  it('most-recently-bookmarked entry appears first', async () => {
    toggleBookmark(1, 1, 'reading');
    await new Promise((r) => setTimeout(r, 2));
    toggleBookmark(2, 255, 'wbw');
    render(<BookmarksPage />);
    const links = await screen.findAllByRole('link');
    expect(links[0]).toHaveTextContent('255');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/test/bookmarksPage.test.tsx`
Expected: FAIL — `Cannot find module '../app/bookmarks/page'`

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/src/app/bookmarks/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PickerSurah } from '../../components/wbw/types';
import { getBookmarks, type Bookmark } from '../../lib/bookmarks';

interface BookmarkRow extends Bookmark {
  surahName: string;
}

export default function BookmarksPage() {
  const [rows, setRows] = useState<BookmarkRow[] | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/surahs', { signal: ctrl.signal });
        if (!res.ok) {
          setRows([]);
          return;
        }
        const surahs = (await res.json()) as PickerSurah[];
        const nameById = new Map(surahs.map((s) => [s.id, s.name_translit]));
        setRows(
          getBookmarks().map((b) => ({
            ...b,
            surahName: nameById.get(b.surahId) ?? `Surah ${b.surahId}`,
          })),
        );
      } catch {
        setRows([]);
      }
    })();
    return () => ctrl.abort();
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-paper-900 dark:text-paper-100">Bookmarks</h1>
      {rows === null ? null : rows.length === 0 ? (
        <p className="text-paper-500">
          No bookmarks yet. Tap the bookmark icon on any ayah to save it here.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((b) => (
            <li key={`${b.surahId}-${b.ayahNumber}-${b.view}`}>
              <Link
                href={
                  b.view === 'wbw'
                    ? `/surah/${b.surahId}/words?ayah=${b.ayahNumber}`
                    : `/surah/${b.surahId}?ayah=${b.ayahNumber}`
                }
                className="flex items-center justify-between rounded-xl bg-paper-100 px-4 py-3 transition-colors hover:bg-paper-200 dark:bg-night-200 dark:hover:bg-night-100"
              >
                <span className="text-sm font-medium text-paper-700 dark:text-paper-300">
                  {b.surahName} {b.ayahNumber}
                </span>
                <span className="text-xs uppercase tracking-wide text-paper-400 dark:text-paper-500">
                  {b.view === 'wbw' ? 'Word-by-word' : 'Reading'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/test/bookmarksPage.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/bookmarks/page.tsx apps/web/src/test/bookmarksPage.test.tsx
git commit -m "feat(web/bookmarks): add /bookmarks page listing saved ayahs"
```

---

### Task 13: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS, 0 failures (all prior tasks' tests plus every pre-existing test)

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Lint**

Run: `cd apps/web && npx eslint src --ext .ts,.tsx`
Expected: no errors, no warnings requiring an inline justification

- [ ] **Step 4: Production build**

Run: `cd apps/web && npm run build`
Expected: build succeeds — this is also the first check that `/bookmarks`
and the modified `/surah/[id]` route compile as real Next.js routes, not
just under vitest/jsdom.

- [ ] **Step 5: Manual smoke pass (mobile viewport)**

Using the dev server: bookmark an ayah from the word-by-word page, open the
drawer → Bookmarks, confirm it's listed and tapping it returns to that exact
ayah on the word-by-word page. Repeat from reading mode. Toggle theme from
the drawer. Confirm `prefers-reduced-motion` disables the drawer's slide
animation (devtools → rendering → emulate CSS media feature).

- [ ] **Step 6: Greptile gate**

Push the branch, run Greptile per CLAUDE.md §5. Must reach 5/5 (check pass)
before merging to `main`. Fix and re-run for any finding; document any false
positive inline in the PR/commit body.
