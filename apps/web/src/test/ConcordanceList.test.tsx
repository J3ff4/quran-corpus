import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ConcordanceEntry } from '@quran-corpus/data';

class MockIO {
  static instances: MockIO[] = [];
  cb: (e: { isIntersecting: boolean }[]) => void;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
    this.cb = cb;
    MockIO.instances.push(this);
  }
}
vi.stubGlobal('IntersectionObserver', MockIO);
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { ConcordanceList } = await import('../components/dictionary/ConcordanceList');

const entry = (word_id: number, ayah_number: number): ConcordanceEntry => ({
  surah_id: 2,
  ayah_number,
  position: 2,
  word_id,
  text_arabic: 'HEAD',
  transliteration: null,
  gloss: null,
  verse_words: [
    { id: 100, position: 1, text_arabic: 'alpha' },
    { id: word_id, position: 2, text_arabic: 'beta' },
    { id: 300, position: 3, text_arabic: 'gamma' },
  ],
});

describe('ConcordanceList', () => {
  beforeEach(() => {
    MockIO.instances = [];
  });

  it('empty -> No occurrences', () => {
    render(<ConcordanceList entries={[]} />);
    expect(screen.getByText(/No occurrences/)).toBeInTheDocument();
  });

  it('washes only the matched word', () => {
    const { container } = render(<ConcordanceList entries={[entry(200, 5)]} />);
    const marks = container.querySelectorAll('.text-accent-700');
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toBe('beta');
  });

  it('<=40 entries: renders all, no Load more', () => {
    const items = Array.from({ length: 5 }, (_, i) => entry(200 + i, i + 1));
    const { container } = render(<ConcordanceList entries={items} />);
    expect(container.querySelectorAll('li').length).toBe(5);
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });

  it('>40 entries: renders 20, Load more reveals +20', () => {
    const items = Array.from({ length: 60 }, (_, i) => entry(1000 + i, i + 1));
    const { container } = render(<ConcordanceList entries={items} />);
    expect(container.querySelectorAll('li').length).toBe(20);
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    expect(container.querySelectorAll('li').length).toBe(40);
  });
});
