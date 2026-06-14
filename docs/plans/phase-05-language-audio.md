# Phase 05: Language Switcher + Audio Recitation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Framer Motion sliding-pill language switcher and per-ayah audio recitation with auto-advance and repeat.

**Architecture:** `LanguageBar` becomes a `'use client'` component using `useRouter` + Framer Motion `layoutId` for a sliding active-pill animation. Audio is managed by a `useAyahAudio` hook (programmatic `new Audio()`, no DOM element) that lives in `ReaderView`; play/pause/repeat controls render inline in each `AyahView` via a new `AyahAudioButton` component.

**Tech Stack:** Next.js 15 App Router, TypeScript, Framer Motion, Vitest + React Testing Library

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Rewrite | `apps/web/src/components/reader/LanguageBar.tsx` | `'use client'`, `useRouter`, Framer Motion `layoutId` pill |
| Create | `apps/web/src/hooks/useAyahAudio.ts` | Audio hook: state + programmatic Audio element |
| Create | `apps/web/src/components/reader/AyahAudioButton.tsx` | Play/pause + repeat icon buttons |
| Modify | `apps/web/src/components/reader/AyahView.tsx` | Add `AyahAudioButton` + six new required props |
| Modify | `apps/web/src/components/reader/ReaderView.tsx` | Call `useAyahAudio`, pass props to each `AyahView` |
| Create | `apps/web/src/test/LanguageBar.test.tsx` | New test file |
| Create | `apps/web/src/test/AyahAudioButton.test.tsx` | New test file |
| Create | `apps/web/src/test/useAyahAudio.test.ts` | New test file |
| Modify | `apps/web/src/test/AyahView.test.tsx` | Add required audio props to all `render()` calls |

---

## Context for implementers

**Existing component shapes** (do not change signatures not listed above):

```ts
// packages/data — Ayah type
interface Ayah {
  id: number;
  surah_id: number;
  ayah_number: number;
  text_uthmani: string;
  text_simple: string | null;
  juz: number | null;
  page: number | null;
  audio_url: string | null;
}
```

**Framer Motion mock pattern** (already used in `WordPopover.test.tsx`):
```ts
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
      <div {...props}>{children}</div>,
  },
  useReducedMotion: () => false,
}));
```

**Test commands:**
```bash
# run from apps/web/
pnpm test          # all tests
pnpm test -- --reporter=verbose src/test/LanguageBar.test.tsx  # single file
```

**Color tokens in use** (Tailwind, defined in tailwind config):
- `paper-900` — near-black (active pill background in light mode)
- `paper-100` — near-white (active pill background in dark mode)
- `paper-50` — white-ish (active pill text in light mode)
- `paper-600` — muted (inactive text)
- `night-100` — dark surface

---

## Task 1: LanguageBar — sliding pill rewrite

**Files:**
- Rewrite: `apps/web/src/components/reader/LanguageBar.tsx`
- Create: `apps/web/src/test/LanguageBar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/test/LanguageBar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageBar } from '../components/reader/LanguageBar';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
  useReducedMotion: () => false,
}));

describe('LanguageBar', () => {
  beforeEach(() => mockPush.mockClear());

  it('renders English, Uzbek, Russian buttons', () => {
    render(<LanguageBar surahId={1} activeLang="en" />);
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Uzbek' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Russian' })).toBeInTheDocument();
  });

  it('renders active pill element inside the active language button', () => {
    render(<LanguageBar surahId={1} activeLang="uz" />);
    const uzbekBtn = screen.getByRole('button', { name: 'Uzbek' });
    expect(uzbekBtn.querySelector('[data-testid="lang-pill"]')).toBeInTheDocument();
  });

  it('does not render pill inside inactive language buttons', () => {
    render(<LanguageBar surahId={1} activeLang="uz" />);
    const enBtn = screen.getByRole('button', { name: 'English' });
    expect(enBtn.querySelector('[data-testid="lang-pill"]')).toBeNull();
  });

  it('clicking inactive language calls router.push with correct URL', () => {
    render(<LanguageBar surahId={3} activeLang="en" />);
    fireEvent.click(screen.getByRole('button', { name: 'Russian' }));
    expect(mockPush).toHaveBeenCalledWith('/surah/3?lang=ru');
  });

  it('clicking active language does not navigate', () => {
    render(<LanguageBar surahId={1} activeLang="en" />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- --reporter=verbose src/test/LanguageBar.test.tsx
```

Expected: FAIL — `LanguageBar` still uses `Link`, not buttons; no `data-testid="lang-pill"`.

- [ ] **Step 3: Rewrite LanguageBar**

Replace the entire contents of `apps/web/src/components/reader/LanguageBar.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'uz', label: 'Uzbek' },
  { code: 'ru', label: 'Russian' },
] as const;

interface LanguageBarProps {
  surahId: number;
  activeLang: string;
}

export function LanguageBar({ surahId, activeLang }: LanguageBarProps) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  return (
    <div className="mb-6 flex gap-1">
      {LANGUAGES.map(({ code, label }) => {
        const isActive = activeLang === code;
        return (
          <button
            key={code}
            type="button"
            aria-label={label}
            aria-current={isActive ? 'true' : undefined}
            onClick={() => {
              if (!isActive) router.push(`/surah/${surahId}?lang=${code}`);
            }}
            className="relative rounded-full px-3 py-1 text-xs"
          >
            {isActive &&
              (reducedMotion ? (
                <div
                  data-testid="lang-pill"
                  className="absolute inset-0 rounded-full bg-paper-900 dark:bg-paper-100"
                />
              ) : (
                <motion.div
                  data-testid="lang-pill"
                  layoutId="lang-pill"
                  className="absolute inset-0 rounded-full bg-paper-900 dark:bg-paper-100"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              ))}
            <span
              className={
                isActive
                  ? 'relative z-10 text-paper-50 dark:text-paper-900'
                  : 'relative z-10 text-paper-600 transition-colors hover:text-paper-900 dark:text-paper-400 dark:hover:text-paper-200'
              }
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
pnpm test -- --reporter=verbose src/test/LanguageBar.test.tsx
```

Expected: 5 tests pass.

- [ ] **Step 5: Run full test suite — no regressions**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/reader/LanguageBar.tsx \
        apps/web/src/test/LanguageBar.test.tsx
git commit -m "feat(web/reader): rewrite LanguageBar with Framer Motion sliding pill"
```

---

## Task 2: useAyahAudio hook

**Files:**
- Create: `apps/web/src/hooks/useAyahAudio.ts`
- Create: `apps/web/src/test/useAyahAudio.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/test/useAyahAudio.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Ayah } from '@quran-corpus/data';

// --- Audio mock ----------------------------------------------------------------
const mockPlay = vi.fn();
const mockPause = vi.fn();
let storedOnended: (() => void) | null = null;
let storedOnerror: (() => void) | null = null;
let mockSrc = '';
let mockCurrentTime = 0;

class MockAudio {
  get src() { return mockSrc; }
  set src(v: string) { mockSrc = v; }
  get currentTime() { return mockCurrentTime; }
  set currentTime(v: number) { mockCurrentTime = v; }
  play = mockPlay;
  pause = mockPause;
  set onended(fn: (() => void) | null) { storedOnended = fn; }
  set onerror(fn: (() => void) | null) { storedOnerror = fn; }
}

vi.stubGlobal('Audio', MockAudio);

// import AFTER stub so the module sees the stubbed global
const { useAyahAudio } = await import('../hooks/useAyahAudio');

// --- Fixtures ------------------------------------------------------------------
const ayahs: Ayah[] = [
  { id: 1, surah_id: 1, ayah_number: 1, text_uthmani: 'آ', text_simple: null, juz: 1, page: 1, audio_url: null },
  { id: 2, surah_id: 1, ayah_number: 2, text_uthmani: 'بَ', text_simple: null, juz: 1, page: 1, audio_url: null },
  { id: 3, surah_id: 1, ayah_number: 3, text_uthmani: 'تَ', text_simple: null, juz: 1, page: 1, audio_url: null },
];

// -------------------------------------------------------------------------------
describe('useAyahAudio', () => {
  beforeEach(() => {
    mockPlay.mockClear().mockResolvedValue(undefined);
    mockPause.mockClear();
    mockSrc = '';
    mockCurrentTime = 0;
    storedOnended = null;
    storedOnerror = null;
  });

  it('initialises with no playing ayah, not playing, not repeating', () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    expect(result.current.playingAyahId).toBeNull();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isRepeat).toBe(false);
  });

  it('play() sets playingAyahId, isPlaying=true, and correct MP3 URL', async () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    await act(async () => { result.current.play(ayahs[0]); });
    expect(result.current.playingAyahId).toBe(1);
    expect(result.current.isPlaying).toBe(true);
    expect(mockSrc).toBe(
      'https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/001001.mp3',
    );
  });

  it('play() on a different ayah changes src and playingAyahId', async () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    await act(async () => { result.current.play(ayahs[0]); });
    await act(async () => { result.current.play(ayahs[1]); });
    expect(result.current.playingAyahId).toBe(2);
    expect(mockSrc).toBe(
      'https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/001002.mp3',
    );
  });

  it('pause() sets isPlaying=false and calls audio.pause()', async () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    await act(async () => { result.current.play(ayahs[0]); });
    act(() => { result.current.pause(); });
    expect(result.current.isPlaying).toBe(false);
    expect(mockPause).toHaveBeenCalledOnce();
  });

  it('toggleRepeat() flips isRepeat', () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    act(() => { result.current.toggleRepeat(); });
    expect(result.current.isRepeat).toBe(true);
    act(() => { result.current.toggleRepeat(); });
    expect(result.current.isRepeat).toBe(false);
  });

  it('onended without repeat advances to next ayah', async () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    await act(async () => { result.current.play(ayahs[0]); });
    await act(async () => { storedOnended?.(); });
    expect(result.current.playingAyahId).toBe(2);
    expect(mockSrc).toBe(
      'https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/001002.mp3',
    );
  });

  it('onended with repeat resets currentTime and replays same ayah', async () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    await act(async () => { result.current.play(ayahs[0]); });
    act(() => { result.current.toggleRepeat(); });
    mockPlay.mockClear();
    await act(async () => { storedOnended?.(); });
    expect(result.current.playingAyahId).toBe(1);
    expect(mockCurrentTime).toBe(0);
    expect(mockPlay).toHaveBeenCalledOnce();
  });

  it('onended on last ayah stops playback', async () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    await act(async () => { result.current.play(ayahs[2]); }); // index 2 = last
    await act(async () => { storedOnended?.(); });
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.playingAyahId).toBe(3); // id stays, but not playing
  });

  it('onerror sets isPlaying=false', async () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    await act(async () => { result.current.play(ayahs[0]); });
    act(() => { storedOnerror?.(); });
    expect(result.current.isPlaying).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- --reporter=verbose src/test/useAyahAudio.test.ts
```

Expected: FAIL — `../hooks/useAyahAudio` does not exist.

- [ ] **Step 3: Create the hooks directory and implement useAyahAudio**

Create `apps/web/src/hooks/useAyahAudio.ts`:

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Ayah } from '@quran-corpus/data';

function ayahAudioUrl(surahId: number, ayahNumber: number): string {
  const s = String(surahId).padStart(3, '0');
  const a = String(ayahNumber).padStart(3, '0');
  return `https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/${s}${a}.mp3`;
}

export interface AyahAudioState {
  playingAyahId: number | null;
  isPlaying: boolean;
  isRepeat: boolean;
  play: (ayah: Ayah) => void;
  pause: () => void;
  toggleRepeat: () => void;
}

export function useAyahAudio(ayahs: Ayah[]): AyahAudioState {
  const audioRef = useRef<InstanceType<typeof Audio> | null>(null);
  const [playingAyahId, setPlayingAyahId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);

  // Mutable refs so event handlers never capture stale closure values
  const playingAyahIdRef = useRef<number | null>(null);
  const isRepeatRef = useRef(false);
  const ayahsRef = useRef(ayahs);

  useEffect(() => { ayahsRef.current = ayahs; }, [ayahs]);
  useEffect(() => { isRepeatRef.current = isRepeat; }, [isRepeat]);
  useEffect(() => { playingAyahIdRef.current = playingAyahId; }, [playingAyahId]);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    audio.onended = () => {
      if (isRepeatRef.current) {
        audio.currentTime = 0;
        audio.play().catch(console.error);
        return;
      }
      const list = ayahsRef.current;
      const idx = list.findIndex((a) => a.id === playingAyahIdRef.current);
      if (idx !== -1 && idx < list.length - 1) {
        const next = list[idx + 1];
        audio.src = ayahAudioUrl(next.surah_id, next.ayah_number);
        setPlayingAyahId(next.id);
        audio.play().catch(console.error);
      } else {
        setIsPlaying(false);
      }
    };

    audio.onerror = () => {
      console.error('[useAyahAudio] playback error');
      setIsPlaying(false);
    };

    return () => {
      audio.pause();
      audio.src = '';
      audio.onended = null;
      audio.onerror = null;
    };
  }, []);

  const play = useCallback((ayah: Ayah) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingAyahIdRef.current !== ayah.id) {
      audio.src = ayahAudioUrl(ayah.surah_id, ayah.ayah_number);
      setPlayingAyahId(ayah.id);
    }
    audio.play().then(() => setIsPlaying(true)).catch(console.error);
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const toggleRepeat = useCallback(() => setIsRepeat((prev) => !prev), []);

  return { playingAyahId, isPlaying, isRepeat, play, pause, toggleRepeat };
}
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
pnpm test -- --reporter=verbose src/test/useAyahAudio.test.ts
```

Expected: 9 tests pass.

- [ ] **Step 5: Run full test suite — no regressions**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useAyahAudio.ts \
        apps/web/src/test/useAyahAudio.test.ts
git commit -m "feat(web/reader): add useAyahAudio hook with auto-advance and repeat"
```

---

## Task 3: AyahAudioButton component

**Files:**
- Create: `apps/web/src/components/reader/AyahAudioButton.tsx`
- Create: `apps/web/src/test/AyahAudioButton.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/test/AyahAudioButton.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AyahAudioButton } from '../components/reader/AyahAudioButton';
import type { Ayah } from '@quran-corpus/data';

const ayah: Ayah = {
  id: 5,
  surah_id: 1,
  ayah_number: 5,
  text_uthmani: 'إِيَّاكَ',
  text_simple: null,
  juz: 1,
  page: 1,
  audio_url: null,
};

const baseProps = {
  ayah,
  isThisPlaying: false,
  isPlaying: false,
  isRepeat: false,
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onToggleRepeat: vi.fn(),
};

describe('AyahAudioButton', () => {
  it('renders a play button with ayah number in aria-label', () => {
    render(<AyahAudioButton {...baseProps} />);
    expect(screen.getByRole('button', { name: /play ayah 5/i })).toBeInTheDocument();
  });

  it('shows pause icon and aria-label when this ayah is playing', () => {
    render(<AyahAudioButton {...baseProps} isThisPlaying isPlaying />);
    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
  });

  it('calls onPlay when play button is clicked', () => {
    const onPlay = vi.fn();
    render(<AyahAudioButton {...baseProps} onPlay={onPlay} />);
    fireEvent.click(screen.getByRole('button', { name: /play ayah 5/i }));
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('calls onPause when pause button is clicked', () => {
    const onPause = vi.fn();
    render(<AyahAudioButton {...baseProps} isThisPlaying isPlaying onPause={onPause} />);
    fireEvent.click(screen.getByRole('button', { name: /pause/i }));
    expect(onPause).toHaveBeenCalledOnce();
  });

  it('does not render repeat button when this ayah is not active', () => {
    render(<AyahAudioButton {...baseProps} isThisPlaying={false} />);
    expect(screen.queryByRole('button', { name: /repeat/i })).toBeNull();
  });

  it('renders repeat button when this ayah is active', () => {
    render(<AyahAudioButton {...baseProps} isThisPlaying />);
    expect(screen.getByRole('button', { name: /repeat/i })).toBeInTheDocument();
  });

  it('repeat button shows active style when isRepeat=true', () => {
    render(<AyahAudioButton {...baseProps} isThisPlaying isRepeat />);
    const repeatBtn = screen.getByRole('button', { name: /repeat on/i });
    expect(repeatBtn).toHaveClass('bg-paper-200');
  });

  it('calls onToggleRepeat when repeat button is clicked', () => {
    const onToggleRepeat = vi.fn();
    render(<AyahAudioButton {...baseProps} isThisPlaying onToggleRepeat={onToggleRepeat} />);
    fireEvent.click(screen.getByRole('button', { name: /repeat/i }));
    expect(onToggleRepeat).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- --reporter=verbose src/test/AyahAudioButton.test.tsx
```

Expected: FAIL — `AyahAudioButton` does not exist.

- [ ] **Step 3: Implement AyahAudioButton**

Create `apps/web/src/components/reader/AyahAudioButton.tsx`:

```tsx
'use client';

import type { Ayah } from '@quran-corpus/data';

interface AyahAudioButtonProps {
  ayah: Ayah;
  isThisPlaying: boolean;
  isPlaying: boolean;
  isRepeat: boolean;
  onPlay: () => void;
  onPause: () => void;
  onToggleRepeat: () => void;
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <polygon points="2,1 11,6 2,11" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <rect x="2" y="1" width="3" height="10" rx="1" />
      <rect x="7" y="1" width="3" height="10" rx="1" />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2 4h8M8 2l2 2-2 2M10 8H2M4 6l-2 2 2 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AyahAudioButton({
  ayah,
  isThisPlaying,
  isPlaying,
  isRepeat,
  onPlay,
  onPause,
  onToggleRepeat,
}: AyahAudioButtonProps) {
  const showPause = isThisPlaying && isPlaying;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={showPause ? 'Pause' : `Play ayah ${ayah.ayah_number}`}
        onClick={showPause ? onPause : onPlay}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-paper-200 text-paper-600 transition-colors hover:bg-paper-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-paper-500 dark:bg-night-100 dark:text-paper-400 dark:hover:bg-night-50"
      >
        {showPause ? <PauseIcon /> : <PlayIcon />}
      </button>

      {isThisPlaying && (
        <button
          type="button"
          aria-label={isRepeat ? 'Repeat on' : 'Repeat off'}
          onClick={onToggleRepeat}
          className={[
            'flex h-6 w-6 items-center justify-center rounded-full text-paper-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-paper-500 dark:text-paper-400',
            isRepeat
              ? 'bg-paper-200 dark:bg-night-50'
              : 'bg-paper-100 hover:bg-paper-200 dark:bg-night-200 dark:hover:bg-night-100',
          ].join(' ')}
        >
          <RepeatIcon />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
pnpm test -- --reporter=verbose src/test/AyahAudioButton.test.tsx
```

Expected: 8 tests pass.

- [ ] **Step 5: Run full test suite — no regressions**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/reader/AyahAudioButton.tsx \
        apps/web/src/test/AyahAudioButton.test.tsx
git commit -m "feat(web/reader): add AyahAudioButton with play/pause and repeat toggle"
```

---

## Task 4: Wire AyahView with audio controls

**Files:**
- Modify: `apps/web/src/components/reader/AyahView.tsx`
- Modify: `apps/web/src/test/AyahView.test.tsx`

- [ ] **Step 1: Update AyahView to accept and render audio props**

Replace the entire contents of `apps/web/src/components/reader/AyahView.tsx`:

```tsx
import type { Ayah, Word, Translation } from '@quran-corpus/data';
import { WordToken } from './WordToken';
import { AyahAudioButton } from './AyahAudioButton';

interface AyahViewProps {
  ayah: Ayah;
  words: Word[];
  translation?: Translation;
  onWordClick: (word: Word) => void;
  isThisPlaying: boolean;
  isPlaying: boolean;
  isRepeat: boolean;
  onPlay: () => void;
  onPause: () => void;
  onToggleRepeat: () => void;
}

export function AyahView({
  ayah,
  words,
  translation,
  onWordClick,
  isThisPlaying,
  isPlaying,
  isRepeat,
  onPlay,
  onPause,
  onToggleRepeat,
}: AyahViewProps) {
  return (
    <article className="mb-10">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-paper-200 text-xs text-paper-600 dark:bg-night-100 dark:text-paper-400">
          {ayah.ayah_number}
        </span>
        <AyahAudioButton
          ayah={ayah}
          isThisPlaying={isThisPlaying}
          isPlaying={isPlaying}
          isRepeat={isRepeat}
          onPlay={onPlay}
          onPause={onPause}
          onToggleRepeat={onToggleRepeat}
        />
      </div>

      <div dir="rtl" className="flex flex-wrap gap-x-1 gap-y-2 font-arabic text-3xl leading-loose">
        {words.length > 0 ? (
          words.map((word) => (
            <WordToken key={word.id} word={word} onClick={onWordClick} />
          ))
        ) : (
          <span className="text-paper-900 dark:text-paper-100">{ayah.text_uthmani}</span>
        )}
      </div>

      {translation && (
        <p className="mt-4 text-base leading-relaxed text-paper-600 dark:text-paper-400">
          {translation.text}
        </p>
      )}
    </article>
  );
}
```

- [ ] **Step 2: Run tests — expect AyahView tests to fail (missing props)**

```bash
pnpm test -- --reporter=verbose src/test/AyahView.test.tsx
```

Expected: TypeScript/runtime errors — all `render(<AyahView ...>)` calls are missing the six new required props.

- [ ] **Step 3: Update AyahView.test.tsx to pass the required audio props**

Add a shared `audioProps` constant and spread it into every `render()` call. Replace the entire contents of `apps/web/src/test/AyahView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AyahView } from '../components/reader/AyahView';
import type { Ayah, Word, Translation } from '@quran-corpus/data';

const ayah: Ayah = {
  id: 1,
  surah_id: 1,
  ayah_number: 1,
  text_uthmani: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ',
  text_simple: null,
  juz: 1,
  page: 1,
  audio_url: null,
};

const words: Word[] = [
  { id: 1, ayah_id: 1, position: 1, text_arabic: 'بِسْمِ', transliteration: 'bismi', root: null, lemma: null, pos_tag: 'P', morphology_json: null },
  { id: 2, ayah_id: 1, position: 2, text_arabic: 'ٱللَّهِ', transliteration: 'l-lahi', root: null, lemma: null, pos_tag: 'PN', morphology_json: null },
];

const translation: Translation = {
  id: 1,
  ayah_id: 1,
  language_code: 'en',
  translator: 'Sahih International',
  text: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
};

const audioProps = {
  isThisPlaying: false,
  isPlaying: false,
  isRepeat: false,
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onToggleRepeat: vi.fn(),
};

describe('AyahView', () => {
  it('renders ayah number badge', () => {
    render(<AyahView ayah={ayah} words={[]} onWordClick={vi.fn()} {...audioProps} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders word tokens when words are provided', () => {
    render(<AyahView ayah={ayah} words={words} onWordClick={vi.fn()} {...audioProps} />);
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
    expect(screen.getByText('ٱللَّهِ')).toBeInTheDocument();
  });

  it('falls back to text_uthmani block when no words', () => {
    render(<AyahView ayah={ayah} words={[]} onWordClick={vi.fn()} {...audioProps} />);
    expect(screen.getByText(ayah.text_uthmani)).toBeInTheDocument();
  });

  it('calls onWordClick when a word token is clicked', () => {
    const onWordClick = vi.fn();
    render(<AyahView ayah={ayah} words={words} onWordClick={onWordClick} {...audioProps} />);
    fireEvent.click(screen.getByText('بِسْمِ'));
    expect(onWordClick).toHaveBeenCalledWith(words[0]);
  });

  it('renders translation when provided', () => {
    render(<AyahView ayah={ayah} words={[]} translation={translation} onWordClick={vi.fn()} {...audioProps} />);
    expect(screen.getByText(translation.text)).toBeInTheDocument();
  });

  it('renders nothing for translation when not provided', () => {
    render(<AyahView ayah={ayah} words={[]} onWordClick={vi.fn()} {...audioProps} />);
    expect(screen.queryByText(translation.text)).toBeNull();
  });

  it('renders play button for the ayah', () => {
    render(<AyahView ayah={ayah} words={[]} onWordClick={vi.fn()} {...audioProps} />);
    expect(screen.getByRole('button', { name: /play ayah 1/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
pnpm test -- --reporter=verbose src/test/AyahView.test.tsx
```

Expected: 7 tests pass.

- [ ] **Step 5: Run full test suite — no regressions**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/reader/AyahView.tsx \
        apps/web/src/test/AyahView.test.tsx
git commit -m "feat(web/reader): wire AyahAudioButton into AyahView"
```

---

## Task 5: Wire ReaderView — connect hook to UI

**Files:**
- Modify: `apps/web/src/components/reader/ReaderView.tsx`

No new test file — `ReaderView` is already tested through integration. The existing test suite passing is the acceptance criterion.

- [ ] **Step 1: Update ReaderView to use the audio hook**

Replace the entire contents of `apps/web/src/components/reader/ReaderView.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { Ayah, Word, Translation } from '@quran-corpus/data';
import { AyahView } from './AyahView';
import { WordPopover } from './WordPopover';
import { useAyahAudio } from '../../hooks/useAyahAudio';

interface ReaderViewProps {
  ayahs: Ayah[];
  wordsByAyah: Record<number, Word[]>;
  translationsByAyah: Record<number, Translation>;
  lang: string;
}

export function ReaderView({ ayahs, wordsByAyah, translationsByAyah, lang: _lang }: ReaderViewProps) {
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const { playingAyahId, isPlaying, isRepeat, play, pause, toggleRepeat } = useAyahAudio(ayahs);

  return (
    <div>
      {ayahs.map((ayah) => (
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
      <WordPopover word={selectedWord} onClose={() => setSelectedWord(null)} />
    </div>
  );
}
```

- [ ] **Step 2: Run type-check**

```bash
pnpm type-check
```

Expected: no errors.

- [ ] **Step 3: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass (the suite now covers LanguageBar, useAyahAudio, AyahAudioButton, AyahView, and existing WordPopover/WordToken/SurahCard).

- [ ] **Step 4: Run lint**

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/reader/ReaderView.tsx
git commit -m "feat(web/reader): wire useAyahAudio into ReaderView; complete phase 05"
```

---

## Self-review checklist (for implementer)

After all tasks, verify:

- [ ] `pnpm test` — all tests green (including pre-existing WordPopover, SurahCard, etc.)
- [ ] `pnpm type-check` — zero errors
- [ ] `pnpm lint` — zero errors
- [ ] Clicking a language pill in the browser animates the background smoothly
- [ ] Tapping play on an ayah streams audio; auto-advances to next ayah on end
- [ ] Repeat button appears on the active ayah; toggling it loops that ayah
- [ ] `prefers-reduced-motion: reduce` in browser accessibility settings renders a static pill (no animation)
