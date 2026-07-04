# Phase 08c — Reader Perf (Incremental Reveal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound initial DOM + hydration on large surahs by rendering only a first chunk of ayahs and revealing more on scroll (IntersectionObserver) — continuous scroll preserved, no new dependency.

**Architecture:** New client hook `useIncrementalReveal` owns "how many of N are visible, grow on scroll or on demand". `ReaderView` slices `ayahs` to that count when the surah exceeds a threshold, renders a "Load more" button that doubles as the observer sentinel, and reveals the currently-playing ayah when audio auto-advances past the chunk. Render-only: `page.tsx` still ships all data.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, vitest + @testing-library/react (jsdom), Tailwind (paper/night tokens).

## Global Constraints

- No new dependency (§12). IntersectionObserver = native browser API.
- No `packages/data` change, no schema/query change. Render-only.
- Tailwind `paper-*` / `night-*` tokens only — no raw hex (§8).
- Tests live in `apps/web/src/test/`, not colocated. Run from repo root: `pnpm --filter @quran-corpus/web <script>`. Scripts: `test`=`vitest run`, `lint`, `type-check`. Filter one file: `pnpm --filter @quran-corpus/web test -- <substr>`.
- 5-step loop per task + Greptile ≥ 4/5 hard block (§4/§5) before commit stands.
- Subagent model floor = Sonnet, never Haiku (§13).

---

### Task 1: `useIncrementalReveal` hook

**Files:**
- Create: `apps/web/src/hooks/useIncrementalReveal.ts`
- Test: `apps/web/src/test/useIncrementalReveal.test.tsx` (`.tsx` — mounts a harness component to exercise the observer with a real ref)

**Interfaces:**
- Consumes: nothing (pure hook + native `IntersectionObserver`).
- Produces:
  ```ts
  interface IncrementalReveal<T extends HTMLElement = HTMLElement> {
    visibleCount: number;
    sentinelRef: React.RefObject<T | null>;
    done: boolean;
    revealTo: (n: number) => void;
  }
  function useIncrementalReveal<T extends HTMLElement = HTMLElement>(
    total: number, initial: number, step: number,
  ): IncrementalReveal<T>;
  ```
  `visibleCount` starts at `min(initial, total)`; observer intersect bumps it by `step` capped at `total`; `done` = `visibleCount >= total`; `revealTo(n)` is monotonic non-shrinking, clamped to `total`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/test/useIncrementalReveal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, renderHook } from '@testing-library/react';
import { useIncrementalReveal } from '../hooks/useIncrementalReveal';

// --- IntersectionObserver mock -------------------------------------------------
type IOCallback = (entries: { isIntersecting: boolean }[]) => void;
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IOCallback;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(cb: IOCallback) {
    this.callback = cb;
    MockIntersectionObserver.instances.push(this);
  }
  fire() { this.callback([{ isIntersecting: true }]); }
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

// Harness: attaches sentinelRef to a real DOM node so the observer effect runs.
function Harness({ total, initial, step }: { total: number; initial: number; step: number }) {
  const { visibleCount, sentinelRef, done } = useIncrementalReveal<HTMLButtonElement>(
    total, initial, step,
  );
  return (
    <>
      <span data-testid="count">{visibleCount}</span>
      <span data-testid="done">{String(done)}</span>
      {!done && <button ref={sentinelRef}>sentinel</button>}
    </>
  );
}

const lastObserver = () =>
  MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1]!;

describe('useIncrementalReveal', () => {
  beforeEach(() => { MockIntersectionObserver.instances = []; });

  it('starts at min(initial, total)', () => {
    const { result } = renderHook(() => useIncrementalReveal(100, 20, 20));
    expect(result.current.visibleCount).toBe(20);
    expect(result.current.done).toBe(false);
  });

  it('total <= initial => done, visibleCount === total', () => {
    const { result } = renderHook(() => useIncrementalReveal(7, 20, 20));
    expect(result.current.visibleCount).toBe(7);
    expect(result.current.done).toBe(true);
  });

  it('observer intersect bumps visibleCount by step, capped at total', () => {
    render(<Harness total={45} initial={20} step={20} />);
    expect(screen.getByTestId('count').textContent).toBe('20');
    act(() => { lastObserver().fire(); });
    expect(screen.getByTestId('count').textContent).toBe('40');
    act(() => { lastObserver().fire(); });   // 40 + 20 -> capped at 45
    expect(screen.getByTestId('count').textContent).toBe('45');
    expect(screen.getByTestId('done').textContent).toBe('true');
  });

  it('revealTo is monotonic non-shrinking and clamps to total', () => {
    const { result } = renderHook(() => useIncrementalReveal(100, 20, 20));
    act(() => { result.current.revealTo(50); });
    expect(result.current.visibleCount).toBe(50);
    act(() => { result.current.revealTo(30); });   // smaller -> no-op
    expect(result.current.visibleCount).toBe(50);
    act(() => { result.current.revealTo(999); });  // clamp to total
    expect(result.current.visibleCount).toBe(100);
    expect(result.current.done).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/web test -- useIncrementalReveal`
Expected: FAIL — cannot resolve `../hooks/useIncrementalReveal`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/hooks/useIncrementalReveal.ts`:

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface IncrementalReveal<T extends HTMLElement = HTMLElement> {
  visibleCount: number;
  sentinelRef: React.RefObject<T | null>;
  done: boolean;
  revealTo: (n: number) => void;
}

/**
 * Track how many of `total` items are visible, growing by `step` when the
 * sentinel scrolls into view (IntersectionObserver) or on demand via
 * `revealTo`. Render-only pagination for long lists — no data is fetched.
 */
export function useIncrementalReveal<T extends HTMLElement = HTMLElement>(
  total: number,
  initial: number,
  step: number,
): IncrementalReveal<T> {
  const [visibleCount, setVisibleCount] = useState(() => Math.min(initial, total));
  const sentinelRef = useRef<T | null>(null);
  const done = visibleCount >= total;

  const revealTo = useCallback(
    (n: number) => {
      setVisibleCount((c) => Math.max(c, Math.min(n, total)));
    },
    [total],
  );

  useEffect(() => {
    if (done) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisibleCount((c) => Math.min(c + step, total));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [done, step, total]);

  return { visibleCount, sentinelRef, done, revealTo };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @quran-corpus/web test -- useIncrementalReveal`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint + type-check**

Run: `pnpm --filter @quran-corpus/web lint && pnpm --filter @quran-corpus/web type-check`
Expected: both clean, no warnings.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useIncrementalReveal.ts apps/web/src/test/useIncrementalReveal.test.tsx
git commit -m "feat(web/reader): add useIncrementalReveal hook"
```

---

### Task 2: `ReaderView` incremental render

**Files:**
- Modify: `apps/web/src/components/reader/ReaderView.tsx`
- Test: `apps/web/src/test/ReaderView.test.tsx` (create)

**Interfaces:**
- Consumes: `useIncrementalReveal<HTMLButtonElement>(total, initial, step)` from Task 1 (see its Produces block); existing `useAyahAudio(ayahs)` → `{ playingAyahId, isPlaying, isRepeat, play, pause, toggleRepeat }`; existing `AyahView` / `WordPopover` props (unchanged).
- Produces: `ReaderView` public props unchanged (`ayahs`, `wordsByAyah`, `translationsByAyah`, `glossesByWordId`, `lang`). Behavior only.

Module constants: `THRESHOLD = 40`, `INITIAL = 20`, `STEP = 20`. Surahs with `ayahs.length <= THRESHOLD` render fully (no pagination); larger ones slice to `visibleCount`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/test/ReaderView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Ayah, Word, Translation } from '@quran-corpus/data';

// --- IntersectionObserver mock -------------------------------------------------
type IOCallback = (entries: { isIntersecting: boolean }[]) => void;
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IOCallback;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(cb: IOCallback) {
    this.callback = cb;
    MockIntersectionObserver.instances.push(this);
  }
  fire() { this.callback([{ isIntersecting: true }]); }
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

// --- useAyahAudio mock (controllable playingAyahId) ----------------------------
const audioState = vi.hoisted(() => ({ playingAyahId: null as number | null }));
vi.mock('../hooks/useAyahAudio', () => ({
  useAyahAudio: () => ({
    playingAyahId: audioState.playingAyahId,
    isPlaying: false,
    isRepeat: false,
    play: vi.fn(),
    pause: vi.fn(),
    toggleRepeat: vi.fn(),
  }),
}));

// import AFTER mocks so the component sees them
const { ReaderView } = await import('../components/reader/ReaderView');

// --- Fixtures ------------------------------------------------------------------
function makeAyahs(n: number): Ayah[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    surah_id: 2,
    ayah_number: i + 1,
    text_uthmani: `آية ${i + 1}`,
    text_simple: null,
    juz: 1,
    page: 1,
    audio_url: null,
  }));
}
const empties = {
  wordsByAyah: {} as Record<number, Word[]>,
  translationsByAyah: {} as Record<number, Translation>,
  glossesByWordId: {} as Record<number, string>,
  lang: 'en',
};
const articleCount = (c: HTMLElement) => c.querySelectorAll('article').length;
const lastObserver = () =>
  MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1]!;

describe('ReaderView incremental render', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    audioState.playingAyahId = null;
  });

  it('small surah (<= threshold): renders all ayahs, no Load more', () => {
    const { container } = render(<ReaderView ayahs={makeAyahs(7)} {...empties} />);
    expect(articleCount(container)).toBe(7);
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });

  it('large surah (> threshold): renders only INITIAL, shows Load more', () => {
    const { container } = render(<ReaderView ayahs={makeAyahs(60)} {...empties} />);
    expect(articleCount(container)).toBe(20);
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
  });

  it('clicking Load more reveals STEP more ayahs', () => {
    const { container } = render(<ReaderView ayahs={makeAyahs(60)} {...empties} />);
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    expect(articleCount(container)).toBe(40);
  });

  it('observer intersect reveals STEP more ayahs', () => {
    const { container } = render(<ReaderView ayahs={makeAyahs(60)} {...empties} />);
    act(() => { lastObserver().fire(); });
    expect(articleCount(container)).toBe(40);
  });

  it('audio auto-advance past the chunk reveals the playing ayah', () => {
    const ayahs = makeAyahs(60);
    const { container, rerender } = render(<ReaderView ayahs={ayahs} {...empties} />);
    expect(screen.queryByText('50')).toBeNull();          // ayah 50 hidden initially
    act(() => { audioState.playingAyahId = 50; });         // audio advanced to id 50
    rerender(<ReaderView ayahs={ayahs} {...empties} />);
    expect(articleCount(container)).toBeGreaterThanOrEqual(50);
    expect(screen.getByText('50')).toBeInTheDocument();    // now revealed
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/web test -- ReaderView`
Expected: FAIL — ReaderView renders all 60 ayahs (no slicing), no "Load more" button.

- [ ] **Step 3: Modify `ReaderView.tsx`**

Replace the file with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { Ayah, Word, Translation } from '@quran-corpus/data';
import { AyahView } from './AyahView';
import { WordPopover } from './WordPopover';
import { useAyahAudio } from '../../hooks/useAyahAudio';
import { useIncrementalReveal } from '../../hooks/useIncrementalReveal';
import { wordHref, wordLocation } from '../../lib/wordLocation';

// Render-only pagination: surahs longer than THRESHOLD ayahs mount INITIAL
// first and reveal STEP more per scroll, bounding initial DOM + hydration.
const THRESHOLD = 40;
const INITIAL = 20;
const STEP = 20;

interface ReaderViewProps {
  ayahs: Ayah[];
  wordsByAyah: Record<number, Word[]>;
  translationsByAyah: Record<number, Translation>;
  glossesByWordId: Record<number, string>;
  lang: string;
}

export function ReaderView({
  ayahs,
  wordsByAyah,
  translationsByAyah,
  glossesByWordId,
  lang: _lang,
}: ReaderViewProps) {
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const { playingAyahId, isPlaying, isRepeat, play, pause, toggleRepeat } = useAyahAudio(ayahs);
  const paginate = ayahs.length > THRESHOLD;
  const { visibleCount, sentinelRef, done, revealTo } = useIncrementalReveal<HTMLButtonElement>(
    ayahs.length,
    INITIAL,
    STEP,
  );

  // Keep the playing ayah on screen when audio auto-advances past the chunk.
  useEffect(() => {
    if (!paginate || playingAyahId == null) return;
    const idx = ayahs.findIndex((a) => a.id === playingAyahId);
    if (idx !== -1) revealTo(idx + 1);
  }, [paginate, playingAyahId, ayahs, revealTo]);

  const visible = paginate ? ayahs.slice(0, visibleCount) : ayahs;

  const selectedAyah = selectedWord ? ayahs.find((a) => a.id === selectedWord.ayah_id) : undefined;
  const selectedHref =
    selectedWord && selectedAyah ? wordHref(wordLocation(selectedAyah, selectedWord)) : undefined;

  return (
    <div>
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
      <WordPopover
        word={selectedWord}
        {...(selectedWord != null && glossesByWordId[selectedWord.id] != null
          ? { gloss: glossesByWordId[selectedWord.id] }
          : {})}
        {...(selectedHref ? { href: selectedHref } : {})}
        onClose={() => setSelectedWord(null)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @quran-corpus/web test -- ReaderView`
Expected: PASS (5 tests).

- [ ] **Step 5: Full quality gate**

Run: `pnpm --filter @quran-corpus/web test && pnpm --filter @quran-corpus/web lint && pnpm --filter @quran-corpus/web type-check`
Expected: whole web suite green (incl. existing reader/audio tests), lint clean, type-check clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/reader/ReaderView.tsx apps/web/src/test/ReaderView.test.tsx
git commit -m "feat(web/reader): incremental ayah reveal for large surahs"
```

---

## Self-Review

**Spec coverage:**
- `useIncrementalReveal` hook (initial/step/done/revealTo, IO) → Task 1. ✓
- ReaderView THRESHOLD/INITIAL/STEP slice + small-surah passthrough → Task 2. ✓
- "Load more" sentinel-button = observer + click grow → Task 2 (button `ref={sentinelRef}` + `onClick revealTo`). ✓
- Audio auto-advance reveal effect → Task 2 (`useEffect` on `playingAyahId`). ✓
- Render-only / no new query / no schema → no `page.tsx` or `packages/data` change in any task. ✓
- Tests: hook units + ReaderView small/large/click/observer/audio → both test files. ✓
- No new dep (native IO) → satisfied. ✓
- Edge `total <= initial` → hook test covers `done` immediate. ✓

**Placeholder scan:** none — every code + test block is complete, commands exact.

**Type consistency:** `useIncrementalReveal<HTMLButtonElement>` return `{ visibleCount, sentinelRef, done, revealTo }` used identically in Task 2; `revealTo(n:number)`, `visibleCount:number`, `done:boolean` match Task 1 signature. `sentinelRef` (`RefObject<HTMLButtonElement | null>`) attaches to `<button ref>`. `useAyahAudio` destructure matches its real shape (verified in source).

## Notes / risks

- No-JS: SSR shows INITIAL ayahs + dead "Load more"; accepted (JS-required PWA).
- IO-already-in-view (short viewport): observer fires on initial intersection; button is the manual fallback either way.
- Constants tunable at module top; defaults 20/20/40 keep most surahs un-paginated, Baqarah starts ~20 ayahs vs 286.
- Rollback: revert branch; delete hook file. No data/schema touched.
