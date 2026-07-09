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
  glossesByWordId: {} as Record<number, { text: string; lang: string }>,
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
