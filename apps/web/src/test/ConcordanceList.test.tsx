import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ConcordanceEntry } from '@quran-corpus/data';

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
    vi.restoreAllMocks();
  });

  it('empty -> No occurrences', () => {
    render(<ConcordanceList initialEntries={[]} total={0} rootBw="Aty" />);
    expect(screen.getByText(/No occurrences/)).toBeInTheDocument();
  });

  it('washes only the matched word', () => {
    const { container } = render(
      <ConcordanceList initialEntries={[entry(200, 5)]} total={1} rootBw="Aty" />,
    );
    const marks = container.querySelectorAll('.text-accent-700');
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toBe('beta');
  });

  it('no Load more when the initial page is the whole concordance', () => {
    const items = Array.from({ length: 5 }, (_, i) => entry(200 + i, i + 1));
    render(<ConcordanceList initialEntries={items} total={5} rootBw="Aty" />);
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });

  it('Load more fetches the next page from the API and appends', async () => {
    const initial = Array.from({ length: 20 }, (_, i) => entry(1000 + i, i + 1));
    const next = Array.from({ length: 5 }, (_, i) => entry(2000 + i, i + 21));
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ entries: next, total: 25 }) });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <ConcordanceList initialEntries={initial} total={25} rootBw="Aty" />,
    );
    expect(container.querySelectorAll('li').length).toBe(20);

    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    await waitFor(() => expect(container.querySelectorAll('li').length).toBe(25));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/roots/Aty/concordance?offset=20&limit=20',
      { signal: expect.any(AbortSignal) },
    );
    // fully loaded -> button gone
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });

  it('surfaces a failure when Load more errors, keeping the button for retry', async () => {
    const initial = Array.from({ length: 20 }, (_, i) => entry(1000 + i, i + 1));
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    render(<ConcordanceList initialEntries={initial} total={25} rootBw="Aty" />);
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));

    await screen.findByRole('alert');
    // Button remains (not stuck on "Loading…") so the user can retry.
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
  });

  it('aborts an in-flight request on unmount', () => {
    const initial = Array.from({ length: 20 }, (_, i) => entry(1000 + i, i + 1));
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, opts?: { signal?: AbortSignal }) => {
      signal = opts?.signal;
      return new Promise<never>(() => {}); // never settles — request stays in flight
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(
      <ConcordanceList initialEntries={initial} total={25} rootBw="Aty" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
